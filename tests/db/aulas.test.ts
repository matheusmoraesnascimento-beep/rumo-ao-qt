import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser, err, type Db } from './harness'

let db: Db
let A: string
let B: string
let leaf: string
let leaf2: string
let leaf3: string
let leaf4: string
let leaf5: string
let leaf6: string
let leaf7: string
let parent: string

const NOW = '2026-10-26T15:00:00Z' // 12:00 em São Paulo
const AMANHA = '2026-10-27T03:00:00Z' // meia-noite local de 27/10

interface Card { id: string; kind: string; topic_id: string; front: string; due_at: Date; level: number }

const concluir = (u: string, topic: string, done: number | null = null, correct: number | null = null) =>
  asUser(db, u, async () =>
    (await db.query<Card>(`select * from concluir_assunto($1, $2, $3, $4::timestamptz)`, [topic, done, correct, NOW])).rows[0])

const count = async (u: string, topic: string) =>
  Number((await db.query<{ n: string }>(`select count(*) n from review_cards where user_id=$1 and topic_id=$2 and kind='aula'`, [u, topic])).rows[0].n)

const setStatus = (u: string, topic: string, status: string) =>
  db.query(`insert into topic_progress (user_id, topic_id, status) values ($1,$2,$3)
            on conflict (user_id, topic_id) do update set status = excluded.status`, [u, topic, status])

const statusOf = async (u: string, topic: string) =>
  (await db.query<{ status: string; first_studied_at: Date | null }>(`select status, first_studied_at from topic_progress where user_id=$1 and topic_id=$2`, [u, topic])).rows[0]

beforeAll(async () => {
  db = await createDb()
  A = await createUser(db, 'a@x.com')
  B = await createUser(db, 'b@x.com')
  await db.exec(`insert into syllabus_versions (year, label) values (2026, 'v1')`)
  const sv = (await db.query<{ id: string }>(`select id from syllabus_versions`)).rows[0].id
  const mk = async (slug: string, parentId: string | null = null) =>
    (await db.query<{ id: string }>(`insert into topics (syllabus_version_id, parent_id, name, slug) values ($1,$2,$3,$3) returning id`, [sv, parentId, slug])).rows[0].id
  parent = await mk('pai')
  leaf = await mk('folha1', parent)
  leaf2 = await mk('folha2', parent)
  leaf3 = await mk('folha3', parent)
  leaf4 = await mk('folha4', parent)
  leaf5 = await mk('folha5', parent)
  leaf6 = await mk('folha6', parent)
  leaf7 = await mk('folha7', parent)
}, 60000)

describe('concluir_assunto', () => {
  it('cria aula amanhã (SP) com front = nome do assunto e status vira revisando', async () => {
    const c = await concluir(A, leaf)
    expect(c.kind).toBe('aula')
    expect(c.topic_id).toBe(leaf)
    expect(c.front).toBe('folha1')
    expect(new Date(c.due_at).toISOString()).toBe(new Date(AMANHA).toISOString())
    const p = await statusOf(A, leaf)
    expect(p.status).toBe('revisando')
    expect(p.first_studied_at).not.toBeNull()
  })

  it('duas chamadas seguidas devolvem o mesmo card e deixam 1 aula', async () => {
    const a = await concluir(A, leaf2)
    const b = await concluir(A, leaf2)
    expect(b.id).toBe(a.id)
    expect(await count(A, leaf2)).toBe(1)
  })

  it('reconcluir não altera due_at/level da aula', async () => {
    const a = await concluir(A, leaf3)
    await asUser(db, A, () => db.query(`select review_card($1, 4, $2, $3::timestamptz)`, [a.id, randomUUID(), NOW]))
    const antes = (await db.query<Card>(`select * from review_cards where id=$1`, [a.id])).rows[0]
    expect(antes.level).toBe(1)
    const b = await concluir(A, leaf3)
    expect(b.id).toBe(a.id)
    expect(new Date(b.due_at).toISOString()).toBe(new Date(antes.due_at).toISOString())
    expect(b.level).toBe(antes.level)
  })

  it('consolidado permanece; estudando e nao_iniciado viram revisando', async () => {
    await setStatus(A, leaf4, 'consolidado')
    await concluir(A, leaf4)
    expect((await statusOf(A, leaf4)).status).toBe('consolidado')
    await setStatus(A, leaf5, 'estudando')
    await concluir(A, leaf5)
    expect((await statusOf(A, leaf5)).status).toBe('revisando')
  })

  it('excluir a aula e reconcluir cria outra', async () => {
    const a = await concluir(A, leaf6)
    await asUser(db, A, () => db.query(`delete from review_cards where id=$1`, [a.id]))
    const b = await concluir(A, leaf6)
    expect(b.id).not.toBe(a.id)
    expect(await count(A, leaf6)).toBe(1)
  })

  it('grava log só quando p_done informado', async () => {
    const n = async () => Number((await db.query<{ n: string }>(`select count(*) n from topic_question_logs where user_id=$1 and topic_id=$2`, [A, leaf7])).rows[0].n)
    await concluir(A, leaf7)
    expect(await n()).toBe(0)
    await concluir(A, leaf7, 10, 7)
    expect(await n()).toBe(1)
    await concluir(A, leaf7, 10, null)
    expect(await n()).toBe(2)
  })

  it('rejeita entradas inválidas com 22023', async () => {
    const bad = (topic: string, d: number | null, c: number | null) =>
      asUser(db, A, () => err(db.query(`select concluir_assunto($1,$2,$3)`, [topic, d, c])))
    expect(await bad(parent, null, null)).toMatch(/assunto/i)
    expect(await bad(randomUUID(), null, null)).toMatch(/assunto/i)
    expect(await bad(leaf, 0, null)).toMatch(/quest/i)
    expect(await bad(leaf, 3, 5)).toMatch(/quest/i)
    expect(await bad(leaf, null, 2)).toMatch(/quest/i)
    const code = await asUser(db, A, async () => {
      try { await db.query(`select concluir_assunto($1,0,null)`, [leaf]); return null } catch (e) { return (e as { code?: string }).code }
    })
    expect(code).toBe('22023')
  })

  it('isolamento entre usuários', async () => {
    const logsB = await asUser(db, B, async () => (await db.query(`select 1 from topic_question_logs`)).rows.length)
    expect(logsB).toBe(0)
    expect(await asUser(db, B, () => err(db.query(`insert into topic_question_logs (user_id, topic_id, done) values ($1,$2,5)`, [A, leaf])))).toMatch(/row-level security/)
    const cB = await concluir(B, leaf)
    expect(cB.id).not.toBe((await concluir(A, leaf)).id)
  })

  it('notes_html acima de 200000 caracteres é rejeitado', async () => {
    const big = 'x'.repeat(200001)
    expect(await err(db.query(`insert into topic_progress (user_id, topic_id, notes_html) values ($1,$2,$3)`, [B, leaf2, big]))).toMatch(/check/)
  })
})
