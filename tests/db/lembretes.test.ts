import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser, err, type Db } from './harness'

const TOKEN = 'a'.repeat(40)
let db: Db
let A: string
let B: string
let subA: string
let subB: string

// 2026-10-24 22:00Z = 19:00 em São Paulo (UTC-3)
const T19 = '2026-10-24T22:00:00Z'
const due = (token = TOKEN, now = T19) =>
  db.query<{ sub_id: string; kind: string; due_count: number }>(`select sub_id, kind, due_count from reminders_due($1, $2::timestamptz)`, [token, now]).then((r) => r.rows)

beforeAll(async () => {
  db = await createDb()
  A = await createUser(db, 'a@x.com')
  B = await createUser(db, 'b@x.com')
  await db.query(`insert into reminder_bots (name, token_hash) values ('teste', $1)`, [createHash('sha256').update(TOKEN).digest('hex')])
  for (const [u, ep] of [[A, 'https://push.example/a'], [B, 'https://push.example/b']] as const) {
    await asUser(db, u, () => db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,$2,'k','s')`, [u, ep]))
  }
  subA = (await db.query<{ id: string }>(`select id from push_subscriptions where user_id=$1`, [A])).rows[0].id
  subB = (await db.query<{ id: string }>(`select id from push_subscriptions where user_id=$1`, [B])).rows[0].id
}, 60000)

describe('push_subscriptions: isolamento e imutabilidade', () => {
  it('B não vê, não apaga e não forja inscrição de A', async () => {
    expect((await asUser(db, B, async () => (await db.query(`select 1 from push_subscriptions where id=$1`, [subA])).rows.length))).toBe(0)
    const d = await asUser(db, B, async () => (await db.query(`delete from push_subscriptions where id=$1`, [subA])).affectedRows)
    expect(d).toBe(0)
    expect(await asUser(db, B, () => err(db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://x.example/z','k','s')`, [A])))).toMatch(/row-level security/)
  })
  it('endpoint precisa ser https e é único; não há UPDATE', async () => {
    expect(await asUser(db, A, () => err(db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'http://inseguro','k','s')`, [A])))).toMatch(/check/)
    expect(await asUser(db, A, () => err(db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://push.example/a','k','s')`, [A])))).toMatch(/unique|duplicate/)
    expect(await asUser(db, A, () => err(db.query(`update push_subscriptions set p256dh='x' where id=$1`, [subA])))).toMatch(/permission denied/)
  })
  it('reminder_time só aceita HH:MM válido', async () => {
    expect(await asUser(db, A, () => err(db.query(`update user_settings set reminder_time='25:99' where user_id=$1`, [A])))).toMatch(/check/)
  })
  it('reminder_bots inacessível pela API', async () => {
    expect(await asUser(db, A, () => err(db.query(`select * from reminder_bots`)))).toMatch(/permission denied/)
  })
})

describe('reminders_due: token', () => {
  it('token inválido, curto, nulo ou revogado => não autorizado', async () => {
    for (const t of ['b'.repeat(40), 'curto', '']) expect(await err(due(t))).toMatch(/não autorizado/)
    await db.query(`update reminder_bots set revoked_at = now()`)
    expect(await err(due())).toMatch(/não autorizado/)
    await db.query(`update reminder_bots set revoked_at = null`)
    expect(await err(due())).toBeNull()
  })
  it('anon consegue chamar a função, mas só com o token certo', async () => {
    expect(await asUser(db, null, () => err(db.query(`select * from reminders_due($1)`, ['z'.repeat(40)])))).toMatch(/não autorizado/)
  })
})

describe('reminders_due: regras de envio', () => {
  const enable = (u: string, time = '19:00') => db.query(`update user_settings set reminder_enabled=true, reminder_time=$2 where user_id=$1`, [u, time])
  const mkCard = (u: string, dueAt: string) => db.query(`insert into review_cards (user_id, front, due_at) values ($1,'f',$2)`, [u, dueAt])

  it('desligado => ninguém recebe', async () => {
    expect(await due()).toEqual([])
  })
  it('ligado, no horário, com revisões vencidas => "revisoes" com a contagem', async () => {
    await enable(A); await mkCard(A, '2026-10-20T10:00:00Z'); await mkCard(A, '2026-10-24T10:00:00Z'); await mkCard(A, '2026-10-30T10:00:00Z')
    const r = await due()
    expect(r).toEqual([{ sub_id: subA, kind: 'revisoes', due_count: 2 }])
  })
  it('antes do horário local => não envia; depois da janela de 3 h => não envia', async () => {
    expect(await due(TOKEN, '2026-10-24T21:59:00Z')).toEqual([])   // 18:59 local
    expect((await due(TOKEN, '2026-10-24T22:00:00Z')).length).toBe(1) // 19:00
    expect((await due(TOKEN, '2026-10-25T00:59:00Z')).length).toBe(1) // 21:59 local, ainda na janela
    expect(await due(TOKEN, '2026-10-25T01:01:00Z')).toEqual([])   // 22:01 local, fora
  })
  it('fuso do usuário é respeitado (horário local, não UTC)', async () => {
    await db.query(`update profiles set timezone='Asia/Tokyo' where id=$1`, [A])   // UTC+9
    expect(await due(TOKEN, '2026-10-24T22:00:00Z')).toEqual([])   // 07:00 em Tóquio
    expect((await due(TOKEN, '2026-10-25T10:00:00Z')).length).toBe(1) // 19:00 em Tóquio
    await db.query(`update profiles set timezone='America/Sao_Paulo' where id=$1`, [A])
  })
  it('dia bloqueado (plantão/viagem) => sem lembrete, sem culpa', async () => {
    await db.query(`insert into blocked_days (user_id, day) values ($1,'2026-10-24')`, [A])
    expect(await due()).toEqual([])
    await db.query(`delete from blocked_days where user_id=$1`, [A])
  })
  it('sem revisão vencida: só lembra de estudar se não estudou nas últimas 20 h', async () => {
    await enable(B)
    expect((await due()).find((x) => x.sub_id === subB)).toMatchObject({ kind: 'estudo', due_count: 0 })
    await db.query(`insert into study_sessions (user_id, started_at, duration_minutes) values ($1,'2026-10-24T15:00:00Z',25)`, [B])
    expect((await due()).find((x) => x.sub_id === subB)).toBeUndefined()
  })
  it('marcar como enviado impede repetir no mesmo dia local, mas libera no dia seguinte', async () => {
    expect(await db.query<{ n: number }>(`select reminders_mark_sent($1, $2::uuid[], $3::timestamptz) n`, [TOKEN, [subA], T19]).then((r) => r.rows[0].n)).toBe(1)
    expect(await due()).toEqual([])
    expect((await due(TOKEN, '2026-10-25T22:00:00Z')).map((x) => x.sub_id)).toContain(subA)
  })
  it('mark_sent e prune exigem token; prune remove inscrição morta', async () => {
    expect(await err(db.query(`select reminders_mark_sent($1, $2::uuid[])`, ['c'.repeat(40), [subA]]))).toMatch(/não autorizado/)
    expect(await err(db.query(`select reminders_prune($1, $2::uuid[])`, ['c'.repeat(40), [subA]]))).toMatch(/não autorizado/)
    await db.query(`select reminders_prune($1, $2::uuid[])`, [TOKEN, [subB]])
    expect((await db.query(`select 1 from push_subscriptions where id=$1`, [subB])).rows.length).toBe(0)
  })
  it('excluir a conta apaga as inscrições', async () => {
    const C = await createUser(db, 'c@x.com')
    await asUser(db, C, () => db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://push.example/c','k','s')`, [C]))
    await asUser(db, C, () => db.query(`select delete_my_account()`))
    expect((await db.query(`select 1 from push_subscriptions where user_id=$1`, [C])).rows.length).toBe(0)
  })
})
