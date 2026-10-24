import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CADERNO_COR, parseDisciplinePage, type KeyEntry } from '../scripts/lib/gabaritos'
import { effectiveGrade, effectiveRate, verifiedRate } from '../src/lib/metrics'
import { summarizeSimulation } from '../src/lib/simulado'
import { filterQuestions, lastGrades, type QCtx } from '../src/lib/filtros'
import type { Attempt, QuestionLite } from '../src/types/db'

/** Texto de página sintético no mesmo formato do PDF: linhas [cor1 q][cor1 q+25][cor2 q][cor2 q+25]. */
function page(c1: string, c2: string, a: (n: number) => string, b: (n: number) => string): string {
  const L = 'ABCDE'
  const fmt = (n: number, v: string) => `${String(n).padStart(2, '0')} - ${v}`
  const rows: string[] = []
  for (let q = 1; q <= 25; q++) rows.push(fmt(q, a(q)), fmt(q + 25, a(q + 25)), fmt(q, b(q)), fmt(q + 25, b(q + 25)))
  void L
  return `Informática ${c1} ${c2} ${rows.join(' ')}`
}
const L = (n: number) => 'ABCDE'[n % 5]
const R = (n: number) => 'ABCDE'[(n + 2) % 5]

describe('extração do gabarito: coluna da COR certa', () => {
  const txt = page('AMARELA', 'ROSA', L, R)
  it('ROSA usa a coluna da direita; AMARELA a da esquerda (nunca confunde)', () => {
    const rosa = parseDisciplinePage(txt, 2026, 'ROSA').entries
    const amarela = parseDisciplinePage(txt, 2026, 'AMARELA').entries
    expect(rosa[0].answer).toBe(R(1))
    expect(amarela[0].answer).toBe(L(1))
    expect(rosa.map((e) => e.answer)).not.toEqual(amarela.map((e) => e.answer))
    expect(rosa).toHaveLength(50)
  })
  it('cor inexistente na página derruba a extração', () => {
    expect(() => parseDisciplinePage(txt, 2026, 'VERDE')).toThrow(/não está entre as colunas/)
  })
  it('anulada e alterada são reconhecidas, com a alternativa final', () => {
    const t = page('AMARELA', 'AZUL', (n) => (n === 28 ? 'ANULADA' : n === 1 ? 'ALTERADA PARA E' : L(n)), L)
      .replace('01 - ALTERADA', '01 – ALTERADA')
    const e = parseDisciplinePage(t, 2022, 'AMARELA').entries
    expect(e[27]).toMatchObject({ number: 28, answer: null, status: 'anulada' })
    expect(e[0]).toMatchObject({ number: 1, answer: 'E', status: 'alterada' })
    expect(e[1]).toMatchObject({ status: 'valida' })
  })
  it('anulada na outra cor não contamina a minha', () => {
    const t = page('AMARELA', 'VERDE', L, (n) => (n === 19 ? 'Anulada' : R(n)))
    const e = parseDisciplinePage(t, 2025, 'AMARELA').entries
    expect(e.every((x) => x.status === 'valida')).toBe(true)
    expect(parseDisciplinePage(t, 2025, 'VERDE').entries[18].status).toBe('anulada')
  })
  it('sequência quebrada (entrada faltando) é rejeitada em vez de chutar', () => {
    expect(() => parseDisciplinePage(txt.replace('13 - ', '').replace(/(\d\d) - (A|B|C|D|E) (?=14 )/, ''), 2026, 'ROSA')).toThrow()
  })
})

const file = path.resolve(import.meta.dirname, '../dados/gabaritos_informatica.json')
describe.skipIf(!existsSync(file))('gabaritos oficiais extraídos (dados locais)', () => {
  const g = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { cor: string; colunas: string[]; questoes: KeyEntry[] }>
  const ans = (y: number, n: number) => g[y].questoes.find((q) => q.number === n)!

  it('5 anos × 50, cor do caderno correta e presente nas colunas do PDF', () => {
    for (const y of [2022, 2023, 2024, 2025, 2026]) {
      expect(g[y].questoes).toHaveLength(50)
      expect(g[y].cor).toBe(CADERNO_COR[y])
      expect(g[y].colunas).toContain(CADERNO_COR[y])
    }
    expect(CADERNO_COR[2026]).toBe('ROSA')
  })
  it('anuladas esperadas: 2022 Q28, 2024 Q03, 2025 Q17 e Q31; 2022 Q01 alterada para E', () => {
    const an = Object.entries(g).flatMap(([y, v]) => v.questoes.filter((q) => q.status === 'anulada').map((q) => `${y}-${q.number}`))
    expect(an.sort()).toEqual(['2022-28', '2024-3', '2025-17', '2025-31'])
    expect(ans(2022, 1)).toMatchObject({ answer: 'E', status: 'alterada' })
    expect(g[2026].questoes.every((q) => q.status === 'valida')).toBe(true)
  })
  it('conferência por CONTEÚDO (questões resolvíveis lendo o enunciado)', () => {
    // 2023: criptografia (E), exclusão mútua (E), RIP/OSPF/BGP (C), quicksort (E), serviço de TI (E), crontab (A), PERT 49,83 (D)
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => ans(2023, n).answer).join('')).toBe('EECEEAD')
    // 2024: Hadoop (D), 1 4 9 16 25 (E), finally (B)
    expect([ans(2024, 1).answer, ans(2024, 4).answer, ans(2024, 5).answer].join('')).toBe('DEB')
    expect(ans(2024, 3).status).toBe('anulada') // máscaras de classes A/B/C: nenhuma alternativa correta
  })
  it('2026 ROSA difere da AMARELA (01-D e não 01-B)', () => {
    expect(ans(2026, 1).answer).toBe('D')
    expect(ans(2026, 2).answer).toBe('A')
  })
})

describe('nota efetiva: gabarito oficial > autoavaliação; anulada nunca conta', () => {
  it('prioridades', () => {
    expect(effectiveGrade({ self_grade: 'acertei', key_status: 'valida', is_correct: false })).toBe('errei')
    expect(effectiveGrade({ self_grade: 'errei', key_status: 'valida', is_correct: true })).toBe('acertei')
    expect(effectiveGrade({ self_grade: 'errei', key_status: 'anulada', is_correct: null })).toBeNull()
    expect(effectiveGrade({ self_grade: 'acertei', key_status: null, is_correct: null })).toBe('acertei')
    expect(effectiveGrade({ self_grade: null, key_status: null, is_correct: null })).toBeNull()
  })
  const mk = (ok: boolean | null, ks: 'valida' | 'anulada' | null, g: 'acertei' | 'errei' | null = null) => ({ question_id: 'q', created_at: '', self_grade: g, is_correct: ok, key_status: ks })
  it('taxas: verificada ignora anuladas; sem verificação => N/A', () => {
    const a = [mk(true, 'valida'), mk(true, 'valida'), mk(false, 'valida'), mk(null, 'anulada', 'errei')]
    expect(verifiedRate(a)).toBeCloseTo(2 / 3)
    expect(effectiveRate(a)).toBeCloseTo(2 / 3)
    expect(verifiedRate([mk(null, null, 'acertei')])).toBeNull()
    expect(effectiveRate([mk(null, null, 'acertei')])).toBe(1)
  })
  it('resumo do simulado: acertos oficiais sobre o total válido (anuladas fora)', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `q${i}`)
    const answers = [
      { questionId: 'q0', selected: 'A', isCorrect: true, keyStatus: 'valida' as const },
      { questionId: 'q1', selected: 'B', isCorrect: false, keyStatus: 'valida' as const },
      { questionId: 'q2', selected: 'C', isCorrect: null, keyStatus: 'anulada' as const },
    ]
    const r = summarizeSimulation(ids, answers)
    expect(r).toMatchObject({ verified: true, verifiedScore: 1, verifiedWrong: 1, annulled: 1, verifiedOutOf: 49 })
    expect(summarizeSimulation(ids, [{ questionId: 'q0', selected: 'A' }]).verifiedScore).toBeNull()
  })
  it('filtros: gabarito oficial prevalece no "errei/acertei" e anuladas filtram', () => {
    const qs: QuestionLite[] = [
      { id: 'a', code: 'a', exam_id: 'e', number: 1, ocr_status: 'pending_review', has_figure: false, annulled: false },
      { id: 'b', code: 'b', exam_id: 'e', number: 2, ocr_status: 'pending_review', has_figure: false, annulled: true },
    ]
    const at = (q: string, g: Attempt['self_grade'], ok: boolean | null, ks: Attempt['key_status']): Attempt => ({ id: q, user_id: 'u', question_id: q, simulation_id: null, selected_option: 'A', time_seconds: 1, confidence: null, self_grade: g, created_at: '2025-01-01', is_correct: ok, key_status: ks })
    const ctx: QCtx = { yearOf: new Map([['e', 2026]]), attempts: [at('a', 'acertei', false, 'valida'), at('b', 'errei', null, 'anulada')], favorites: new Set(), topicsOf: new Map() }
    expect(lastGrades(ctx.attempts).get('a')).toBe('errei')
    expect(lastGrades(ctx.attempts).has('b')).toBe(false)
    expect(filterQuestions(qs, { status: 'errei' }, ctx).map((q) => q.id)).toEqual(['a'])
    expect(filterQuestions(qs, { annulled: true }, ctx).map((q) => q.id)).toEqual(['b'])
  })
})
