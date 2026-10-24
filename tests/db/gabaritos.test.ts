import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, createUser, err, seedCatalog, type Db } from './harness'

let db: Db
let A: string
let B: string
let Q: Record<string, string> // code -> id
let exam26: string
let simId: string

const attempt = (user: string, code: string, opt: string | null, extra = '') =>
  asUser(db, user, async () => {
    const r = await db.query<{ is_correct: boolean | null; key_status: string | null }>(
      `insert into question_attempts (user_id, question_id, selected_option ${extra ? ', ' + extra.split('=')[0] : ''})
       values ($1, $2, $3 ${extra ? ', ' + extra.split('=')[1] : ''}) returning is_correct, key_status`,
      [user, Q[code], opt],
    )
    return r.rows[0]
  })

beforeAll(async () => {
  db = await createDb()
  await seedCatalog(db)
  A = await createUser(db, 'a@x.com')
  B = await createUser(db, 'b@x.com')
  const qs = await db.query<{ id: string; code: string; exam_id: string }>(`select id, code, exam_id from questions`)
  Q = Object.fromEntries(qs.rows.map((r) => [r.code, r.id]))
  exam26 = qs.rows.find((r) => r.code === 'CPT-2026-Q01')!.exam_id
  // gabaritos de teste: Q01 = B (válida), Q02 = anulada, Q03 = alterada para E
  await db.query(`insert into answer_keys (question_id, correct_option, status, note, booklet_color, source_file) values
    ($1,'B','valida',null,'ROSA','t.pdf'), ($2,null,'anulada','anulada','ROSA','t.pdf'), ($3,'E','alterada','alterada para E','ROSA','t.pdf')`,
    [Q['CPT-2026-Q01'], Q['CPT-2026-Q02'], Q['CPT-2026-Q03']])
  await db.query(`update questions set annulled = true where id = $1`, [Q['CPT-2026-Q02']])
}, 60000)

describe('gabarito: invisível ao navegador', () => {
  it('authenticated e anon não leem answer_keys', async () => {
    expect(await asUser(db, A, () => err(db.query(`select * from answer_keys`)))).toMatch(/permission denied/)
    expect(await asUser(db, null, () => err(db.query(`select * from answer_keys`)))).toMatch(/permission denied/)
    expect(await asUser(db, A, () => err(db.query(`insert into answer_keys (question_id,status,booklet_color,source_file) values ($1,'anulada','x','x')`, [Q['CPT-2026-Q04']])))).toMatch(/permission denied/)
  })
  it('questions só expõe o marcador "annulled" (sem alternativa correta)', async () => {
    const cols = (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name='questions'`)).rows.map((r) => r.column_name)
    expect(cols).toContain('annulled')
    expect(cols.some((c) => /correct|answer|gabarito/i.test(c))).toBe(false)
    const r = await asUser(db, A, async () => (await db.query<{ annulled: boolean }>(`select annulled from questions where id=$1`, [Q['CPT-2026-Q02']])).rows[0])
    expect(r.annulled).toBe(true)
  })
})

describe('verificação da tentativa avulsa', () => {
  it('acerto e erro verificados', async () => {
    expect(await attempt(A, 'CPT-2026-Q01', 'B')).toEqual({ is_correct: true, key_status: 'valida' })
    expect(await attempt(A, 'CPT-2026-Q01', 'C')).toEqual({ is_correct: false, key_status: 'valida' })
  })
  it('gabarito alterado usa a alternativa final', async () => {
    expect(await attempt(A, 'CPT-2026-Q03', 'E')).toEqual({ is_correct: true, key_status: 'alterada' })
  })
  it('anulada: marca e não conta como acerto nem erro', async () => {
    expect(await attempt(A, 'CPT-2026-Q02', 'A')).toEqual({ is_correct: null, key_status: 'anulada' })
  })
  it('sem gabarito cadastrado => não inventa', async () => {
    expect(await attempt(A, 'CPT-2026-Q10', 'A')).toEqual({ is_correct: null, key_status: null })
  })
  it('sem alternativa marcada => sem verificação', async () => {
    expect(await attempt(A, 'CPT-2026-Q01', null)).toEqual({ is_correct: null, key_status: 'valida' })
  })
  it('valores is_correct/key_status enviados pelo cliente são ignorados', async () => {
    const r = await asUser(db, A, async () => (await db.query<{ is_correct: boolean }>(
      `insert into question_attempts (user_id, question_id, selected_option, is_correct, key_status) values ($1,$2,'D',true,'valida') returning is_correct`,
      [A, Q['CPT-2026-Q01']])).rows[0])
    expect(r.is_correct).toBe(false)
  })
})

describe('reveal_answer', () => {
  it('só revela depois de responder fora de simulado', async () => {
    const e = await asUser(db, B, () => err(db.query(`select * from reveal_answer($1)`, [Q['CPT-2026-Q01']])))
    expect(e).toMatch(/responda a questão/)
    const r = await asUser(db, A, async () => (await db.query(`select * from reveal_answer($1)`, [Q['CPT-2026-Q01']])).rows[0])
    expect(r).toMatchObject({ correct_option: 'B', status: 'valida' })
  })
  it('anulada revela status sem alternativa', async () => {
    const r = await asUser(db, A, async () => (await db.query(`select * from reveal_answer($1)`, [Q['CPT-2026-Q02']])).rows[0])
    expect(r).toMatchObject({ correct_option: null, status: 'anulada' })
  })
  it('anon não executa', async () => {
    expect(await asUser(db, null, () => err(db.query(`select * from reveal_answer($1)`, [Q['CPT-2026-Q01']])))).toMatch(/permission denied/)
  })
})

describe('simulado: conferência só após finalizar', () => {
  beforeAll(async () => {
    const ids = (await db.query<{ id: string }>(`select id from questions where exam_id=$1 order by number`, [exam26])).rows.map((r) => r.id)
    simId = await asUser(db, B, async () => (await db.query<{ id: string }>(
      `insert into simulations (user_id, mode, exam_id, question_ids) values ($1,'year',$2,$3) returning id`, [B, exam26, ids])).rows[0].id)
    await asUser(db, B, async () => {
      for (const [code, opt] of [['CPT-2026-Q01', 'B'], ['CPT-2026-Q02', 'C'], ['CPT-2026-Q03', 'A'], ['CPT-2026-Q10', 'A']]) {
        await db.query(`insert into question_attempts (user_id, question_id, simulation_id, selected_option) values ($1,$2,$3,$4)`, [B, Q[code], simId, opt])
      }
    })
  })
  it('em andamento: nada verificado e conferência negada', async () => {
    const rows = await asUser(db, B, async () => (await db.query<{ is_correct: boolean | null; key_status: string | null }>(`select is_correct, key_status from question_attempts where simulation_id=$1`, [simId])).rows)
    expect(rows.every((r) => r.is_correct === null && r.key_status === null)).toBe(true)
    expect(await asUser(db, B, () => err(db.query(`select * from simulation_review($1)`, [simId])))).toMatch(/finalize o simulado/)
  })
  it('revelar via questão avulsa NÃO é liberado por tentativa de simulado', async () => {
    expect(await asUser(db, B, () => err(db.query(`select * from reveal_answer($1)`, [Q['CPT-2026-Q03']])))).toMatch(/responda a questão/)
  })
  it('outro usuário não finaliza nem confere o simulado de B', async () => {
    expect(await asUser(db, A, () => err(db.query(`select * from finalize_simulation($1, 100)`, [simId])))).toMatch(/não encontrado/)
    expect(await asUser(db, A, () => err(db.query(`select * from simulation_review($1)`, [simId])))).toMatch(/finalize o simulado/)
  })
  it('finalizar: status, tempo, verificação (acerto/erro/anulada) e idempotência', async () => {
    const s = await asUser(db, B, async () => (await db.query<{ status: string; duration_seconds: number }>(`select * from finalize_simulation($1, 3600)`, [simId])).rows[0])
    expect(s).toMatchObject({ status: 'finalizado', duration_seconds: 3600 })
    const rows = await asUser(db, B, async () => (await db.query<{ question_id: string; is_correct: boolean | null; key_status: string | null }>(`select question_id, is_correct, key_status from question_attempts where simulation_id=$1`, [simId])).rows)
    const by = (code: string) => rows.find((r) => r.question_id === Q[code])!
    expect(by('CPT-2026-Q01')).toMatchObject({ is_correct: true, key_status: 'valida' })
    expect(by('CPT-2026-Q02')).toMatchObject({ is_correct: null, key_status: 'anulada' })
    expect(by('CPT-2026-Q03')).toMatchObject({ is_correct: false, key_status: 'alterada' })
    expect(by('CPT-2026-Q10')).toMatchObject({ is_correct: null, key_status: null })
    const again = await asUser(db, B, async () => (await db.query<{ duration_seconds: number }>(`select * from finalize_simulation($1, 9999)`, [simId])).rows[0])
    expect(again.duration_seconds).toBe(3600)
  })
  it('após finalizar, a conferência traz o gabarito do simulado', async () => {
    const rows = await asUser(db, B, async () => (await db.query<{ question_id: string; correct_option: string | null; status: string }>(`select * from simulation_review($1)`, [simId])).rows)
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.question_id === Q['CPT-2026-Q03'])).toMatchObject({ correct_option: 'E', status: 'alterada' })
  })
})
