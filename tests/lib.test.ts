import { describe, expect, it } from 'vitest'
import { dailyQueue, firstDueAt, nextReview } from '../src/lib/srs'
import { isWritingDue, planDay, rankTopics, scoreTopic, type TopicSignal } from '../src/lib/planner'
import { buildMixedSimulation, buildYearSimulation, summarizeSimulation, type QRef } from '../src/lib/simulado'
import { daysUntil, fmtPct, safeMinutes, selfRate, verifiedRate, wordCount } from '../src/lib/metrics'

const at = new Date('2025-03-10T15:00:00Z')

describe('SRS interval-v1 (espelho do SQL)', () => {
  it('card novo + estudado hoje => primeira revisão amanhã 00:00 local', () => {
    expect(firstDueAt(at).toISOString()).toBe('2025-03-11T03:00:00.000Z')
  })
  it('rating 0–2 volta ao nível 0, +1 dia, lapse', () => {
    for (const r of [0, 1, 2] as const) {
      const x = nextReview({ level: 5, lapses: 0, reviewCount: 9 }, r, at)
      expect([x.level, x.days, x.lapses]).toEqual([0, 1, 1])
    }
  })
  it('esquecer após 30 dias volta para 1 dia', () => {
    const x = nextReview({ level: 5, lapses: 2, reviewCount: 5 }, 0, at)
    expect(x.days).toBe(1)
    expect(x.lapses).toBe(3)
  })
  it('rating 3 não acelera e rating 4 avança 1', () => {
    expect(nextReview({ level: 3, lapses: 0, reviewCount: 3 }, 3, at).level).toBe(3)
    expect(nextReview({ level: 3, lapses: 0, reviewCount: 3 }, 4, at).days).toBe(14)
  })
  it('rating 5 avança 2 só com >= 2 revisões; teto 60 dias', () => {
    expect(nextReview({ level: 1, lapses: 0, reviewCount: 1 }, 5, at).level).toBe(2)
    expect(nextReview({ level: 1, lapses: 0, reviewCount: 2 }, 5, at).level).toBe(3)
    expect(nextReview({ level: 6, lapses: 0, reviewCount: 9 }, 5, at).days).toBe(60)
  })
  it('fuso: 23:30 local ainda é o mesmo dia; 00:30 local já é o próximo', () => {
    const a = nextReview({ level: 0, lapses: 0, reviewCount: 0 }, 4, new Date('2025-03-11T02:30:00Z'))
    const b = nextReview({ level: 0, lapses: 0, reviewCount: 0 }, 4, new Date('2025-03-11T03:30:00Z'))
    expect(a.dueAt.toISOString()).toBe('2025-03-11T03:00:00.000Z')
    expect(b.dueAt.toISOString()).toBe('2025-03-12T03:00:00.000Z')
  })
  it('semana sem abrir o app: cards vencidos entram uma vez, limitados pelo cap, nada é apagado', () => {
    const now = new Date('2025-03-20T12:00:00Z')
    const cards = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      topic_id: null,
      due_at: new Date(Date.UTC(2025, 2, 10 + (i % 7))).toISOString(),
    }))
    const { queue, backlog } = dailyQueue(cards, now, 20)
    expect(queue).toHaveLength(20)
    expect(backlog).toBe(10)
    expect(new Set(queue.map((c) => c.id)).size).toBe(20)
    expect(new Date(queue[0].due_at) <= new Date(queue[19].due_at)).toBe(true)
  })
  it('rating inválido lança', () => {
    expect(() => nextReview({ level: 0, lapses: 0, reviewCount: 0 }, 9 as never, at)).toThrow()
  })
})

const sig = (o: Partial<TopicSignal> & { topicId: string }): TopicSignal => ({
  name: o.topicId, status: 'nao_iniciado', confidence: 0, lastStudiedAt: null,
  overdueCards: 0, maxOverdueDays: 0, attempts: 0, errors: 0, ...o,
})

describe('planejador explicável', () => {
  const today = new Date('2025-03-10T12:00:00Z')
  it('pesos somam 1 e score é limitado a [0,1]', () => {
    const s = scoreTopic(sig({ topicId: 'a', maxOverdueDays: 99, attempts: 4, errors: 4, overdueCards: 3 }), today)
    expect(s.score).toBeLessThanOrEqual(1)
    expect(s.score).toBeGreaterThan(0.8)
  })
  it('motivos explicam a sugestão', () => {
    const s = scoreTopic(sig({ topicId: 'a', status: 'estudando', lastStudiedAt: new Date('2025-02-20T12:00:00Z'), errors: 3, attempts: 5, overdueCards: 2, maxOverdueDays: 4 }), today)
    expect(s.reasons.join(' ')).toMatch(/sem contato há 18 dias/)
    expect(s.reasons.join(' ')).toMatch(/3 erro/)
    expect(s.reasons.join(' ')).toMatch(/revisão/)
  })
  it('ranking deduplica tópicos e ordena por score', () => {
    const r = rankTopics([sig({ topicId: 'x' }), sig({ topicId: 'x' }), sig({ topicId: 'y', status: 'consolidado', confidence: 5, lastStudiedAt: today })], today)
    expect(r.map((x) => x.topicId)).toEqual(['x', 'y'])
  })
  it('tópico sem questões históricas ainda gera plano (cobertura)', () => {
    const r = rankTopics([sig({ topicId: 'novo' })], today)
    expect(r[0].score).toBeGreaterThan(0)
  })
  const ranked = rankTopics(['a', 'b', 'c', 'd'].map((id) => sig({ topicId: id })), today)
  const base = { dueCards: 12, ranked, untouched: ranked.slice(2), writingDue: false, includeWriting: true, minNewShare: 0.2 }
  it('pouco tempo (20 min): até 5 revisões + 1 questão curta', () => {
    const p = planDay({ ...base, minutes: 20 })
    expect(p[0].kind).toBe('revisao')
    expect(p[0].count).toBeLessThanOrEqual(5)
    expect(p.some((b) => b.kind === 'questoes')).toBe(true)
    expect(p.reduce((s, b) => s + b.minutes, 0)).toBeLessThanOrEqual(20)
  })
  it('120 min: nunca excede o tempo, sem tópicos repetidos, reserva assunto novo', () => {
    const p = planDay({ ...base, minutes: 120 })
    expect(p.reduce((s, b) => s + b.minutes, 0)).toBeLessThanOrEqual(120)
    const topics = p.filter((b) => b.topicId).map((b) => b.topicId)
    expect(new Set(topics).size).toBe(topics.length)
    expect(p.some((b) => b.title.startsWith('Novo:'))).toBe(true)
  })
  it('dia bloqueado => sem plano; 0 min => sem plano', () => {
    expect(planDay({ ...base, minutes: 60, blocked: true })).toEqual([])
    expect(planDay({ ...base, minutes: 0 })).toEqual([])
  })
  it('redação só quando devida, habilitada e há tempo', () => {
    expect(planDay({ ...base, minutes: 120, writingDue: true }).some((b) => b.kind === 'redacao')).toBe(true)
    expect(planDay({ ...base, minutes: 120, writingDue: true, includeWriting: false }).some((b) => b.kind === 'redacao')).toBe(false)
    expect(planDay({ ...base, minutes: 25, writingDue: true }).some((b) => b.kind === 'redacao')).toBe(false)
  })
  it('cadência de redação', () => {
    expect(isWritingDue(new Date('2026-11-30'), new Date('2026-11-01'), 'auto')).toBe(true) // 29d >= 21
    expect(isWritingDue(new Date('2026-11-10'), new Date('2026-11-01'), 'auto')).toBe(false)
    expect(isWritingDue(new Date('2027-02-20'), new Date('2027-02-01'), 'auto')).toBe(true) // 14d
    expect(isWritingDue(new Date('2027-05-10'), new Date('2027-05-02'), 'auto')).toBe(true) // 7d
    expect(isWritingDue(new Date('2027-05-10'), null, 'off')).toBe(false)
  })
})

const bank: QRef[] = [2022, 2023, 2024, 2025, 2026].flatMap((year) =>
  Array.from({ length: 50 }, (_, i) => ({ id: `${year}-${i + 1}`, year, number: i + 1 })))

describe('simulados', () => {
  it('por ano: exatamente 50 na ordem original', () => {
    const s = buildYearSimulation(bank, 2024)
    expect(s).toHaveLength(50)
    expect(s.map((q) => q.number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
  })
  it('rejeita ano indefinido ou prova incompleta', () => {
    expect(() => buildYearSimulation(bank, NaN)).toThrow()
    expect(() => buildYearSimulation(bank.slice(1), 2022)).toThrow(/49/)
  })
  it('misto: 50 distintas, 10 por ano, reprodutível pela semente', () => {
    const a = buildMixedSimulation(bank, 'semente-1')
    const b = buildMixedSimulation(bank, 'semente-1')
    const c = buildMixedSimulation(bank, 'semente-2')
    expect(a).toHaveLength(50)
    expect(new Set(a.map((q) => q.id)).size).toBe(50)
    for (const y of [2022, 2023, 2024, 2025, 2026]) expect(a.filter((q) => q.year === y)).toHaveLength(10)
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id))
    expect(a.map((q) => q.id)).not.toEqual(c.map((q) => q.id))
    expect(() => buildMixedSimulation(bank, '')).toThrow()
  })
  it('misto prioriza inéditas', () => {
    const unseen = new Set(bank.filter((q) => q.number <= 25).map((q) => q.id))
    const s = buildMixedSimulation(bank, 'x', unseen)
    expect(s.every((q) => unseen.has(q.id))).toBe(true)
  })
  it('resultado não inventa nota: sem gabarito, verificada é null', () => {
    const ids = bank.slice(0, 50).map((q) => q.id)
    const r = summarizeSimulation(ids, [
      { questionId: ids[0], selected: 'A', selfGrade: 'acertei' },
      { questionId: ids[1], selected: 'B', selfGrade: 'errei' },
      { questionId: ids[2], selected: 'C' },
    ])
    expect(r.answered).toBe(3)
    expect(r.unanswered).toBe(47)
    expect(r.verifiedScore).toBeNull()
    expect(r.selfScore).toBe(1)
  })
})

describe('métricas', () => {
  it('taxa verificada é N/A sem gabarito; autodeclarada rotulada', () => {
    const at = [
      { question_id: 'a', created_at: '', self_grade: 'acertei' as const, selected_option: 'A' },
      { question_id: 'b', created_at: '', self_grade: 'errei' as const, selected_option: 'B' },
      { question_id: 'c', created_at: '', self_grade: 'nao_sei' as const, selected_option: 'C' },
    ]
    expect(verifiedRate(at)).toBeNull()
    expect(fmtPct(verifiedRate(at))).toBe('N/A')
    expect(selfRate(at)).toBe(0.5)
    expect(selfRate([])).toBeNull()
  })
  it('tempos impossíveis viram 0', () => {
    expect(safeMinutes(1000, 500)).toBe(0)
    expect(safeMinutes(0, 60000)).toBe(1)
    expect(safeMinutes(0, 60000, 120000)).toBe(0)
    expect(safeMinutes(0, 1e12)).toBe(1440)
    expect(safeMinutes(NaN, 5)).toBe(0)
  })
  it('contagem de palavras e dias até prova (a confirmar => null)', () => {
    expect(wordCount('  uma  frase\ncom   cinco palavras ')).toBe(5)
    expect(wordCount('')).toBe(0)
    expect(daysUntil(null)).toBeNull()
    expect(daysUntil('2027-05-10', new Date(2027, 4, 5))).toBe(5)
  })
})
