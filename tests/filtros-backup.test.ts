import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {}, isConfigured: false, siteUrl: () => '' }))
import { balancedMix, filterQuestions, type QCtx } from '@/lib/filtros'
import { sanitizeRows, toCsv, validateBackup } from '@/lib/backup'
import type { Attempt, QuestionLite } from '@/types/db'

const qs: QuestionLite[] = Array.from({ length: 100 }, (_, i) => ({
  id: `q${i}`, code: `c${i}`, exam_id: i < 50 ? 'e25' : 'e26', number: (i % 50) + 1, ocr_status: i % 10 === 0 ? 'reviewed' : 'pending_review', has_figure: i % 7 === 0, annulled: i === 99,
}))
const att = (q: string, g: Attempt['self_grade'], t: string): Attempt => ({ id: q + t, user_id: 'u', question_id: q, simulation_id: null, selected_option: 'A', time_seconds: 5, confidence: 3, self_grade: g, created_at: t, key_status: null, is_correct: null })
const ctx: QCtx = {
  yearOf: new Map([['e25', 2025], ['e26', 2026]]),
  attempts: [att('q1', 'errei', '2025-01-01'), att('q1', 'acertei', '2025-02-01'), att('q2', 'errei', '2025-01-01')],
  favorites: new Set(['q3']), topicsOf: new Map([['q4', ['t1']], ['q5', ['t1']]]),
}

describe('filtros do banco', () => {
  it('ano, nº e inéditas', () => {
    expect(filterQuestions(qs, { year: 2026 }, ctx)).toHaveLength(50)
    expect(filterQuestions(qs, { number: 3 }, ctx)).toHaveLength(2)
    expect(filterQuestions(qs, { status: 'inedita' }, ctx)).toHaveLength(98)
  })
  it('último autojulgamento prevalece (errei→acertei)', () => {
    expect(filterQuestions(qs, { status: 'errei' }, ctx).map((q) => q.id)).toEqual(['q2'])
    expect(filterQuestions(qs, { status: 'acertei' }, ctx).map((q) => q.id)).toEqual(['q1'])
  })
  it('favoritas, tópico, OCR, figura, texto', () => {
    expect(filterQuestions(qs, { favorite: true }, ctx).map((q) => q.id)).toEqual(['q3'])
    expect(filterQuestions(qs, { topicId: 't1' }, ctx)).toHaveLength(2)
    expect(filterQuestions(qs, { ocr: 'reviewed' }, ctx)).toHaveLength(10)
    expect(filterQuestions(qs, { figure: true }, ctx).every((q) => q.has_figure)).toBe(true)
    expect(filterQuestions(qs, { textIds: new Set(['q9']) }, ctx).map((q) => q.id)).toEqual(['q9'])
  })
  it('mistura equilibrada: determinística e balanceada por ano', () => {
    const a = balancedMix(qs, ctx, 10, 's'), b = balancedMix(qs, ctx, 10, 's')
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id))
    expect(a).toHaveLength(10)
    const y26 = a.filter((q) => q.exam_id === 'e26').length
    expect(y26).toBeGreaterThanOrEqual(4)
    expect(y26).toBeLessThanOrEqual(6)
  })
})

describe('backup / exportação', () => {
  it('CSV escapa vírgula, aspas, quebra de linha e objetos', () => {
    const csv = toCsv([{ a: 'x,y', b: 'diz "oi"', c: { k: 1 }, d: null }])
    expect(csv).toBe('a,b,c,d\n"x,y","diz ""oi""","{""k"":1}",')
  })
  it('restauração reatribui user_id ao usuário atual e remove gabarito', () => {
    const out = sanitizeRows([{ id: '1', user_id: 'OUTRO', correct_option: 'A' }], 'eu')
    expect(out).toEqual([{ id: '1', user_id: 'eu' }])
  })
  it('valida formato do arquivo', () => {
    expect(() => validateBackup({})).toThrow(/inválido/)
    expect(() => validateBackup({ app: 'rumo-ao-qt', version: 99, data: {} })).toThrow(/mais nova/)
    expect(() => validateBackup({ app: 'rumo-ao-qt', version: 1, data: {} })).not.toThrow()
  })
})
