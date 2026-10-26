import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser, err, seedCatalog, type Db } from './harness'

let db: Db
let A: string
let B: string
let cardA: string
let subA: string

beforeAll(async () => {
  db = await createDb()
  await seedCatalog(db)
  A = await createUser(db, 'a@x.com')
  B = await createUser(db, 'b@x.com')
  await asUser(db, A, async () => {
    await db.query(
      `insert into study_sessions (user_id, started_at, duration_minutes, kind) values ($1, now(), 25, 'teoria')`,
      [A],
    )
    const c = await db.query<{ id: string }>(
      `insert into review_cards (user_id, front, back) values ($1,'f','b') returning id`,
      [A],
    )
    cardA = c.rows[0].id
    const s = await db.query<{ id: string }>(
      `insert into writing_submissions (user_id, draft) values ($1,'meu texto') returning id`,
      [A],
    )
    subA = s.rows[0].id
  })
}, 60000)

describe('schema', () => {
  it('perfil e preferências criados no cadastro', async () => {
    const r = await db.query(`select (select count(*) from profiles where id=$1) p, (select count(*) from user_settings where user_id=$1) s`, [A])
    expect(r.rows[0]).toEqual({ p: 1, s: 1 })
  })
  it('questions não possui coluna de gabarito', async () => {
    const r = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name='questions'`,
    )
    const cols = r.rows.map((x) => x.column_name)
    expect(cols.some((c) => /correct|answer|gabarito|key/i.test(c))).toBe(false)
  })
  it('RLS (enable + force) ativa em todas as tabelas privadas', async () => {
    const priv = [
      'profiles','user_settings','topic_progress','study_sessions','study_blocks','blocked_days',
      'simulations','question_attempts','question_flags','question_reports','user_question_topics',
      'review_cards','review_events','review_reschedule_log','writing_submissions','writing_feedback',
      'writing_prompts','import_audit','admins','topic_question_logs',
    ]
    const r = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relnamespace='public'::regnamespace and relname = any($1)`,
      [priv],
    )
    expect(r.rows.length).toBe(priv.length)
    for (const row of r.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true)
      expect(row.relforcerowsecurity, row.relname).toBe(true)
    }
  })
})

describe('catálogo somente leitura', () => {
  it('autenticado lê questões', async () => {
    const n = await asUser(db, A, async () => (await db.query(`select 1 from questions`)).rows.length)
    expect(n).toBe(100)
  })
  it('anon não lê questões', async () => {
    const e = await asUser(db, null, () => err(db.query(`select 1 from questions`)))
    expect(e).toMatch(/permission denied/)
  })
  it.each(['insert into questions (code, exam_id, number) select \'X\', id, 1 from exams limit 1',
    `update questions set ocr_body='hack'`, `delete from questions`,
    `insert into exams (slug, year) values ('h', 2000)`,
    `update topics set name='x'`])('autenticado não escreve no catálogo: %s', async (sql) => {
    const e = await asUser(db, A, () => err(db.query(sql)))
    expect(e).toMatch(/permission denied/)
  })
  it('admins e import_audit inacessíveis', async () => {
    expect(await asUser(db, A, () => err(db.query(`select * from admins`)))).toMatch(/permission denied/)
    expect(await asUser(db, A, () => err(db.query(`select * from import_audit`)))).toMatch(/permission denied/)
  })
})

describe('isolamento A × B', () => {
  it('B não vê dados de A', async () => {
    for (const t of ['study_sessions', 'review_cards', 'writing_submissions']) {
      const n = await asUser(db, B, async () => (await db.query(`select 1 from ${t}`)).rows.length)
      expect(n, t).toBe(0)
    }
    const nA = await asUser(db, A, async () => (await db.query(`select 1 from study_sessions`)).rows.length)
    expect(nA).toBe(1)
  })
  it('B não vê perfil/preferências de A', async () => {
    const n = await asUser(db, B, async () => (await db.query(`select 1 from profiles where id=$1`, [A])).rows.length)
    expect(n).toBe(0)
  })
  it('B não atualiza nem apaga dados de A', async () => {
    const r = await asUser(db, B, async () => {
      const u = await db.query(`update review_cards set front='hack' where id=$1`, [cardA])
      const d = await db.query(`delete from writing_submissions where id=$1`, [subA])
      return [u.affectedRows, d.affectedRows]
    })
    expect(r).toEqual([0, 0])
    const f = await db.query<{ front: string }>(`select front from review_cards where id=$1`, [cardA])
    expect(f.rows[0].front).toBe('f')
  })
  it('B não insere linha com user_id de A', async () => {
    const e = await asUser(db, B, () =>
      err(db.query(`insert into study_sessions (user_id, started_at, duration_minutes) values ($1, now(), 5)`, [A])),
    )
    expect(e).toMatch(/row-level security/)
  })
  it('B não troca user_id de uma linha própria para A (WITH CHECK)', async () => {
    await asUser(db, B, () => db.query(`insert into question_flags (user_id, question_id, favorite) select $1, id, true from questions limit 1`, [B]))
    const e = await asUser(db, B, () => err(db.query(`update question_flags set user_id=$1`, [A])))
    expect(e).toMatch(/row-level security/)
  })
  it('anon não acessa dados privados', async () => {
    const e = await asUser(db, null, () => err(db.query(`select * from study_sessions`)))
    expect(e).toMatch(/permission denied/)
  })
})

describe('FKs cruzadas forjadas', () => {
  it('review_event de B apontando para card de A é rejeitado', async () => {
    const e = await asUser(db, B, () =>
      err(db.query(
        `insert into review_events (user_id, card_id, rating, next_due_at, client_event_id)
         values ($1,$2,3,now(), gen_random_uuid())`, [B, cardA])),
    )
    expect(e).toMatch(/foreign key/)
  })
  it('writing_feedback de B para redação de A é rejeitado', async () => {
    const e = await asUser(db, B, () =>
      err(db.query(`insert into writing_feedback (user_id, submission_id) values ($1,$2)`, [B, subA])),
    )
    expect(e).toMatch(/foreign key/)
  })
  it('writing_feedback com user_id forjado (A) é bloqueado pela RLS', async () => {
    const e = await asUser(db, B, () =>
      err(db.query(`insert into writing_feedback (user_id, submission_id) values ($1,$2)`, [A, subA])),
    )
    expect(e).toMatch(/row-level security/)
  })
  it('tentativa de B ligada a simulado de A é rejeitada', async () => {
    const simA = await asUser(db, A, async () => {
      const ex = await db.query<{ id: string }>(`select id from exams where year=2026`)
      const qs = await db.query<{ id: string }>(`select id from questions where exam_id=$1 order by number`, [ex.rows[0].id])
      const r = await db.query<{ id: string }>(
        `insert into simulations (user_id, mode, exam_id, question_ids) values ($1,'year',$2,$3) returning id`,
        [A, ex.rows[0].id, qs.rows.map((q) => q.id)],
      )
      return r.rows[0].id
    })
    const e = await asUser(db, B, () =>
      err(db.query(
        `insert into question_attempts (user_id, question_id, simulation_id)
         select $1, id, $2 from questions limit 1`, [B, simA])),
    )
    expect(e).toMatch(/foreign key/)
  })
})

describe('simulados', () => {
  const ids = async (where: string) =>
    (await db.query<{ id: string }>(`select id from questions ${where} order by number`)).rows.map((r) => r.id)

  it('rejeita menos de 50 questões', async () => {
    const q = (await ids('')).slice(0, 49)
    const ex = (await db.query<{ id: string }>(`select id from exams limit 1`)).rows[0].id
    const e = await asUser(db, A, () =>
      err(db.query(`insert into simulations (user_id, mode, exam_id, question_ids) values ($1,'year',$2,$3)`, [A, ex, q])),
    )
    expect(e).toMatch(/50 questões|sim_50|check/)
  })
  it('rejeita simulado "year" sem prova definida', async () => {
    const q = (await ids('')).slice(0, 50)
    const e = await asUser(db, A, () =>
      err(db.query(`insert into simulations (user_id, mode, question_ids) values ($1,'year',$3)`.replace('$3', '$2'), [A, q])),
    )
    expect(e).toMatch(/mesma prova|sim_year_defined|check/)
  })
  it('rejeita simulado "year" com questões de outra prova', async () => {
    const q = await ids(`where exam_id = (select id from exams where year=2025)`)
    const ex26 = (await db.query<{ id: string }>(`select id from exams where year=2026`)).rows[0].id
    const e = await asUser(db, A, () =>
      err(db.query(`insert into simulations (user_id, mode, exam_id, question_ids) values ($1,'year',$2,$3)`, [A, ex26, q])),
    )
    expect(e).toMatch(/mesma prova/)
  })
  it('aceita simulado misto com semente', async () => {
    const q = (await ids('')).filter((_, i) => i % 2 === 0)
    const e = await asUser(db, A, () =>
      err(db.query(`insert into simulations (user_id, mode, seed, question_ids) values ($1,'mixed','abc',$2)`, [A, q])),
    )
    expect(e).toBeNull()
  })
})

describe('tentativas', () => {
  it('opção fora de A–E e confiança fora de 0–5 são rejeitadas', async () => {
    const e1 = await asUser(db, A, () => err(db.query(
      `insert into question_attempts (user_id, question_id, selected_option) select $1, id, 'F' from questions limit 1`, [A])))
    expect(e1).toMatch(/check/)
    const e2 = await asUser(db, A, () => err(db.query(
      `insert into question_attempts (user_id, question_id, confidence) select $1, id, 9 from questions limit 1`, [A])))
    expect(e2).toMatch(/check/)
  })
  it('tempos impossíveis (negativos) são rejeitados', async () => {
    const e = await asUser(db, A, () => err(db.query(
      `insert into study_sessions (user_id, started_at, duration_minutes) values ($1, now(), -5)`, [A])))
    expect(e).toMatch(/check/)
  })
})

describe('RPC review_card (interval-v1)', () => {
  const uuid = () => crypto.randomUUID()
  async function newCard(user: string, level = 0, count = 0) {
    return asUser(db, user, async () => {
      const r = await db.query<{ id: string }>(
        `insert into review_cards (user_id, front, level, review_count) values ($1,'q',$2,$3) returning id`,
        [user, level, count],
      )
      return r.rows[0].id
    })
  }
  const review = (user: string, card: string, rating: number, at: string, ev = uuid()) =>
    asUser(db, user, async () => {
      const r = await db.query<{ level: number; due_at: Date; lapses: number; review_count: number }>(
        `select level, due_at, lapses, review_count from review_card($1,$2,$3,$4::timestamptz,'America/Sao_Paulo')`,
        [card, rating, ev, at],
      )
      return r.rows[0]
    })

  it('card novo, rating 4 => nível 1, vence amanhã 00:00 local (03:00Z)', async () => {
    const c = await newCard(A)
    const r = await review(A, c, 4, '2025-03-10T15:00:00Z')
    expect(r.level).toBe(1)
    expect(new Date(r.due_at).toISOString()).toBe('2025-03-11T03:00:00.000Z')
    expect(r.review_count).toBe(1)
  })
  it('esquecer após nível 5 (30 dias) => nível 0, +1 dia, lapse', async () => {
    const c = await newCard(A, 5, 5)
    const r = await review(A, c, 0, '2025-03-10T15:00:00Z')
    expect(r.level).toBe(0)
    expect(r.lapses).toBe(1)
    expect(new Date(r.due_at).toISOString()).toBe('2025-03-11T03:00:00.000Z')
  })
  it('rating 3 não acelera', async () => {
    const c = await newCard(A, 3, 3)
    const r = await review(A, c, 3, '2025-03-10T15:00:00Z')
    expect(r.level).toBe(3) // 7 dias
    expect(new Date(r.due_at).toISOString()).toBe('2025-03-17T03:00:00.000Z')
  })
  it('rating 5 avança dois níveis só com >= 2 revisões; teto 6 (60 dias)', async () => {
    const c1 = await newCard(A, 1, 1)
    expect((await review(A, c1, 5, '2025-03-10T15:00:00Z')).level).toBe(2)
    const c2 = await newCard(A, 1, 2)
    expect((await review(A, c2, 5, '2025-03-10T15:00:00Z')).level).toBe(3)
    const c3 = await newCard(A, 6, 9)
    const r = await review(A, c3, 5, '2025-03-10T15:00:00Z')
    expect(r.level).toBe(6)
    expect(new Date(r.due_at).toISOString()).toBe('2025-05-09T03:00:00.000Z')
  })
  it('data local: 23:30 em São Paulo conta como o mesmo dia local', async () => {
    const c = await newCard(A)
    const r = await review(A, c, 4, '2025-03-11T02:30:00Z') // 23:30 local de 23/10
    expect(new Date(r.due_at).toISOString()).toBe('2025-03-11T03:00:00.000Z')
  })
  it('reenvio do mesmo client_event_id não duplica nem altera o card', async () => {
    const c = await newCard(A)
    const ev = uuid()
    await review(A, c, 4, '2025-03-10T15:00:00Z', ev)
    const again = await review(A, c, 4, '2025-03-10T15:00:01Z', ev)
    expect(again.review_count).toBe(1)
    expect(again.level).toBe(1)
    const n = await db.query<{ n: number }>(`select count(*)::int n from review_events where card_id=$1`, [c])
    expect(n.rows[0].n).toBe(1)
  })
  it('cliques rápidos com eventos distintos aplicam em sequência', async () => {
    const c = await newCard(A)
    await review(A, c, 4, '2025-03-10T15:00:00Z')
    const r = await review(A, c, 4, '2025-03-10T15:00:02Z')
    expect(r.review_count).toBe(2)
    expect(r.level).toBe(2)
  })
  it('B não revisa card de A', async () => {
    const c = await newCard(A)
    const e = await err(review(B, c, 3, '2025-03-10T15:00:00Z'))
    expect(e).toMatch(/não encontrado/)
  })
  it('data futura e rating inválido são rejeitados', async () => {
    const c = await newCard(A)
    expect(await err(review(A, c, 3, '2099-01-01T00:00:00Z'))).toMatch(/futuro/)
    expect(await err(review(A, c, 7, '2025-03-10T15:00:00Z'))).toMatch(/rating/)
  })
  it('evento é imutável (update/delete negados)', async () => {
    const c = await newCard(A)
    await review(A, c, 3, '2025-03-10T15:00:00Z')
    const u = await asUser(db, A, () => err(db.query(`update review_events set rating=5 where card_id=$1`, [c])))
    expect(u).toMatch(/permission denied|imutável/)
    const d = await asUser(db, A, () => err(db.query(`delete from review_events where card_id=$1`, [c])))
    expect(d).toMatch(/permission denied/)
  })
  it('reschedule registra log', async () => {
    const c = await newCard(A)
    await asUser(db, A, () => db.query(`select reschedule_card($1, now() + interval '3 days', 'plantão')`, [c]))
    const n = await db.query<{ n: number }>(`select count(*)::int n from review_reschedule_log where card_id=$1`, [c])
    expect(n.rows[0].n).toBe(1)
  })
})

describe('exclusão de conta', () => {
  it('delete_my_account apaga tudo do usuário', async () => {
    const C = await createUser(db, 'c@x.com')
    await asUser(db, C, async () => {
      await db.query(`insert into study_sessions (user_id, started_at, duration_minutes) values ($1, now(), 5)`, [C])
    })
    // stub do auth.users exige o delete; função security definer roda como dono
    await asUser(db, C, () => db.query(`select delete_my_account()`))
    const r = await db.query(`select (select count(*) from study_sessions where user_id=$1) s, (select count(*) from profiles where id=$1) p`, [C])
    expect(r.rows[0]).toEqual({ s: 0, p: 0 })
  })
})
