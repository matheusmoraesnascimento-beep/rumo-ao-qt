import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { statusOcr, validarQuestoes } from '../scripts/lib/importacao'
import { createDb } from './db/harness'

const root = path.resolve(import.meta.dirname, '..')
// Material de prova não é versionado: sem os dados locais, estes testes são pulados (ex.: CI pública).
const hasData = existsSync(path.join(root, 'dados/questoes_2022_2026.json'))
const raw = hasData ? JSON.parse(readFileSync(path.join(root, 'dados/questoes_2022_2026.json'), 'utf8')) : []
const readSeed = () => readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8') + readFileSync(path.join(root, 'supabase/seed_questoes.sql'), 'utf8')

describe.skipIf(!hasData)('importação das 250 questões', () => {
  const { questoes, relatorio } = validarQuestoes(raw, (p) => existsSync(path.join(root, p)))

  it('5 anos × 50 IDs, sem duplicados, Q01..Q50 presentes', () => {
    expect(relatorio.erros).toEqual([])
    expect(relatorio.total).toBe(250)
    for (const y of [2022, 2023, 2024, 2025, 2026]) {
      expect(relatorio.porAno[y]).toBe(50)
      const nums = questoes.filter((q) => q.exam_year === y).map((q) => q.number).sort((a, b) => a - b)
      expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    }
    expect(relatorio.duplicados).toEqual([])
  })
  it('nenhum gabarito: correct_option sempre null', () => {
    expect(questoes.every((q) => q.correct_option === null)).toBe(true)
  })
  it('todos os 250 recortes existem em disco', () => {
    expect(relatorio.semImagem).toEqual([])
  })
  it('nenhuma questão chega como "reviewed" sem revisão humana', () => {
    expect(questoes.every((q) => q.ocr_status === 'pending_review')).toBe(true)
  })
  it('rejeita qualquer item com gabarito', () => {
    const ruim = [{ ...raw[0], correct_option: 'A' }]
    const r = validarQuestoes(ruim)
    expect(r.relatorio.erros.join()).toMatch(/GABARITO PROIBIDO/)
    expect(r.questoes).toHaveLength(0)
  })
  it('rejeita id inconsistente com ano/número', () => {
    const r = validarQuestoes([{ ...raw[0], number: 2 }])
    expect(r.questoes).toHaveLength(0)
    expect(r.relatorio.erros.length).toBeGreaterThan(0)
  })
  it('OCR vazio => needs_manual_transcription (sem texto fabricado)', () => {
    expect(statusOcr({ ocr_text: '   ', ocr_status: 'pending_review' })).toBe('needs_manual_transcription')
    expect(statusOcr({ ocr_text: 'x'.repeat(40), ocr_status: 'pending_review' })).toBe('pending_review')
  })
  it('detecta questão faltando', () => {
    const r = validarQuestoes(raw.slice(1))
    expect(r.relatorio.faltando[2022]).toContain(1)
    expect(r.relatorio.erros.join()).toMatch(/250/)
  })
})

describe.skipIf(!hasData)('seed aplicado em Postgres', () => {
  it('carrega edital, 250 questões, sem gabarito, idempotente', async () => {
    const db = await createDb()
    const seed = readSeed()
    await db.exec(seed)
    await db.exec(seed) // segunda execução não duplica
    const c = await db.query<Record<string, number>>(
      `select (select count(*) from questions)::int q, (select count(*) from exams)::int e,
              (select count(*) from topics)::int t, (select count(*) from syllabus_versions)::int s,
              (select count(*) from writing_prompts)::int w`,
    )
    expect(c.rows[0].q).toBe(250)
    expect(c.rows[0].e).toBe(5)
    expect(c.rows[0].s).toBe(1)
    expect(c.rows[0].t).toBeGreaterThan(100)
    expect(c.rows[0].w).toBeGreaterThan(0)
    const per = await db.query<{ year: number; n: number }>(
      `select e.year, count(*)::int n from questions q join exams e on e.id=q.exam_id group by 1 order by 1`,
    )
    expect(per.rows.map((r) => r.n)).toEqual([50, 50, 50, 50, 50])
  }, 60000)

  it('reimportação não sobrescreve questão já conferida (reviewed)', async () => {
    const db = await createDb()
    const seed = readSeed()
    await db.exec(seed)
    await db.exec(`update questions set ocr_status='reviewed', ocr_body='REVISADO' where code='CPT-2026-Q01'`)
    await db.exec(seed)
    const r = await db.query<{ ocr_body: string }>(`select ocr_body from questions where code='CPT-2026-Q01'`)
    expect(r.rows[0].ocr_body).toBe('REVISADO')
  }, 60000)

  it('simulado de 2026 com as 50 questões do banco é aceito, na ordem original', async () => {
    const db = await createDb()
    await db.exec(readSeed())
    await db.exec(`insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000aa')`)
    const qs = await db.query<{ id: string; exam_id: string }>(
      `select q.id, q.exam_id from questions q join exams e on e.id=q.exam_id where e.year=2026 order by q.number`,
    )
    await db.query(
      `insert into simulations (user_id, mode, exam_id, question_ids) values ('00000000-0000-0000-0000-0000000000aa','year',$1,$2)`,
      [qs.rows[0].exam_id, qs.rows.map((r) => r.id)],
    )
    const s = await db.query<{ n: number }>(`select cardinality(question_ids)::int n from simulations`)
    expect(s.rows[0].n).toBe(50)
  }, 60000)
})
