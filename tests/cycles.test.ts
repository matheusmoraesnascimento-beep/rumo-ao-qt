import { describe, expect, it } from 'vitest'
import {
  aggregateSubjectPassage,
  availabilityForDate,
  calculateAdherence,
  canCompletePassage,
  computeSelfAssessedMetrics,
  computeTopicPriority,
  computeVerifiedMetrics,
  defaultPlanPreferences,
  deriveTopicLeafSet,
  generateDailyStudyQueue,
  getNextCycleItem,
  localStudyDate,
  rankTopicPriorities,
  type CycleItem,
  type DailyStudyQueueInput,
  type SyllabusTopic,
  type TopicPriorityInput,
} from '../src/lib/cycles'
import type { AttemptLite } from '../src/lib/metrics'

const preferences = defaultPlanPreferences()
const item = (id: string, ordinal = 0, extra: Partial<CycleItem> = {}): CycleItem => ({
  id,
  topicId: `topic-${id}`,
  ordinal,
  targetPassage: 1,
  estimatedMinutes: 90,
  ...extra,
})
const signal = (topicId: string, extra: Partial<TopicPriorityInput> = {}): TopicPriorityInput => ({
  topicId,
  cycleOrdinal: 0,
  overdueDays: 0,
  coverageGap: 1,
  daysSinceContact: null,
  ...extra,
})
const queueInput = (extra: Partial<DailyStudyQueueInput> = {}): DailyStudyQueueInput => ({
  now: new Date('2026-11-03T15:00:00Z'),
  preferences,
  cycleItems: [item('a')],
  currentItemId: 'a',
  dueCards: [],
  questions: [],
  ...extra,
})
const attempt = (questionId: string, extra: Partial<AttemptLite> = {}): AttemptLite => ({
  question_id: questionId,
  selected_option: 'B',
  created_at: '2026-11-03T15:00:00Z',
  ...extra,
})

describe('preferências conservadoras do plano', () => {
  it('preenche somente campos ausentes/nulos e conserva zeros explícitos', () => {
    const actual = defaultPlanPreferences({
      targetCorrectAnswers: 35,
      reviewCap: 0,
      examDate: null,
      weeklyAvailabilityMinutes: { 1: 0, 2: 25, 3: null, 6: 60 },
      weights: { manualPriority: 0 },
    })
    expect(actual.weeklyAvailabilityMinutes).toEqual({
      1: 0,
      2: 25,
      3: 120,
      4: 120,
      5: 120,
      6: 60,
      7: 0,
    })
    expect(actual).toMatchObject({ targetCorrectAnswers: 35, examDate: null, reviewCap: 0 })
    expect(actual.weights.manualPriority).toBe(0)
    expect(defaultPlanPreferences({ timezone: null }).timezone).toBe('America/Sao_Paulo')
  })
  it('não compartilha objetos mutáveis entre planos', () => {
    const first = defaultPlanPreferences()
    first.weeklyAvailabilityMinutes[1] = 1
    first.weights.reviewOverdue = 9
    expect(defaultPlanPreferences().weeklyAvailabilityMinutes[1]).toBe(120)
    expect(defaultPlanPreferences().weights.reviewOverdue).toBe(0.3)
  })
})

describe('folhas canônicas e passagens sem conclusão inferida', () => {
  const topic = (id: string, extra: Partial<SyllabusTopic> = {}): SyllabusTopic => ({
    id,
    parent_id: null,
    syllabus_version_id: '2026',
    ...extra,
  })
  const topics = [
    topic('subject'),
    topic('parent', { parent_id: 'subject' }),
    topic('a', { parent_id: 'parent' }),
    topic('no-questions', { parent_id: 'subject' }),
    topic('old', { syllabus_version_id: '2025' }),
    topic('inactive', { parent_id: 'subject', active: false }),
    topic('optional', { parent_id: 'subject', required: false }),
  ]
  it('filtra versão, pais, inativos, opcionais e duplicatas, mantendo tópico sem questões', () => {
    expect(deriveTopicLeafSet([...topics, topics[2]], '2026').map((t) => t.id)).toEqual([
      'a',
      'no-questions',
    ])
  })
  it('agrega passagem exata uma vez por folha, sem interpretar ausência como conclusão', () => {
    const leaves = deriveTopicLeafSet(topics, '2026')
    const states = [
      { topicId: 'a', passageNumber: 1, status: 'completed' as const, syllabusVersionId: '2026' },
      { topicId: 'a', passageNumber: 1, status: 'completed' as const, syllabusVersionId: '2026' },
      { topicId: 'no-questions', passageNumber: 1, status: 'skipped_with_reason' as const },
      { topicId: 'no-questions', passageNumber: 2, status: 'completed' as const },
    ]
    expect(aggregateSubjectPassage(states, leaves, 1)).toEqual({
      completed: 1,
      total: 2,
      ratio: 0.5,
      isComplete: false,
    })
    expect(aggregateSubjectPassage(states, leaves, 2).completed).toBe(1)
    expect(aggregateSubjectPassage(states, leaves, 3).completed).toBe(0)
    expect(aggregateSubjectPassage([], [], 1)).toEqual({
      completed: 0,
      total: 0,
      ratio: null,
      isComplete: false,
    })
  })
  it('não reaproveita silenciosamente conclusão de outra versão do edital', () => {
    expect(
      aggregateSubjectPassage(
        [{ topicId: 'a', passageNumber: 1, status: 'completed', syllabusVersionId: '2025' }],
        [topic('a')],
        1,
      ).completed,
    ).toBe(0)
  })
  it('exige confirmação, checklist explícito e evidência vinculada para concluir', () => {
    expect(canCompletePassage({ confirmed: true, requiredChecklist: [true] })).toBe(false)
    expect(
      canCompletePassage({
        confirmed: true,
        requiredChecklist: [],
        studySessionIds: ['real-session'],
      }),
    ).toBe(false)
    expect(
      canCompletePassage({
        confirmed: false,
        requiredChecklist: [true],
        studySessionIds: ['real-session'],
      }),
    ).toBe(false)
    expect(
      canCompletePassage({
        confirmed: true,
        requiredChecklist: [true, false],
        studySessionIds: ['real-session'],
      }),
    ).toBe(false)
    expect(
      canCompletePassage({
        confirmed: true,
        requiredChecklist: [true],
        studySessionIds: ['real-session'],
      }),
    ).toBe(true)
    expect(
      canCompletePassage({
        confirmed: true,
        requiredChecklist: [true],
        auditedManualReason: 'Exercícios autorais conferidos',
      }),
    ).toBe(true)
    expect(
      canCompletePassage({ confirmed: true, requiredChecklist: [true], auditedManualReason: '  ' }),
    ).toBe(false)
  })
})

describe('prioridade normalizada e explicável', () => {
  it('normaliza pesos arbitrários e limita sinais extremos a [0,1]', () => {
    const prefs = defaultPlanPreferences({
      weights: {
        reviewOverdue: 100,
        editalCoverageGap: 0,
        demonstratedDifficulty: 0,
        daysSinceContact: 0,
        manualPriority: 0,
      },
    })
    expect(computeTopicPriority(signal('a', { overdueDays: 1000 }), prefs).score).toBe(1)
    expect(computeTopicPriority(signal('a', { overdueDays: -10 }), prefs).score).toBe(0)
    const zero = defaultPlanPreferences({
      weights: {
        reviewOverdue: 0,
        editalCoverageGap: 0,
        demonstratedDifficulty: 0,
        daysSinceContact: 0,
        manualPriority: 0,
      },
    })
    expect(computeTopicPriority(signal('a'), zero).score).toBe(0)
  })
  it('ausência de gabarito e amostra pequena são evidência insuficiente, sem inventar zero acertos', () => {
    const noData = computeTopicPriority(signal('a', { selfAssessedRate: 0 }))
    const small = computeTopicPriority(
      signal('a', { verifiedRate: 1 / 3, verifiedDistinctQuestions: 3 }),
    )
    expect(noData.evidenceQuality).toBe('insufficient')
    expect(noData.factors.demonstratedDifficulty).toBe(0.5)
    expect(small.evidenceQuality).toBe('insufficient')
    expect(small.reasons.join(' ')).toMatch(/diagnóstico pendente/)
    expect(
      computeTopicPriority(signal('a', { selfAssessedRate: 0, useSelfAssessment: true }))
        .evidenceQuality,
    ).toBe('self_reported')
    expect(
      computeTopicPriority(signal('a', { verifiedRate: 0.25, verifiedDistinctQuestions: 12 }))
        .evidenceQuality,
    ).toBe('verified')
  })
  it('desempata por ordem do ciclo e id, independentemente da ordem de entrada', () => {
    const inputs = [signal('z', { cycleOrdinal: 1 }), signal('b'), signal('a')]
    expect(rankTopicPriorities(inputs).map((t) => t.topicId)).toEqual(['a', 'b', 'z'])
    expect(rankTopicPriorities([...inputs].reverse()).map((t) => t.topicId)).toEqual([
      'a',
      'b',
      'z',
    ])
  })
})

describe('rotação com cursor por id', () => {
  it('mantém item parcial mesmo após consumir orçamento estimado ou mudar ordem', () => {
    const items = [item('a', 8), item('b', 1, { studiedMinutes: 55 }), item('c', 0)]
    expect(getNextCycleItem(items, 'b')?.id).toBe('b')
    expect(getNextCycleItem([item('b', 1, { studiedMinutes: 90 })], 'b')?.id).toBe('b')
    expect(getNextCycleItem(items, 'b')).toEqual(getNextCycleItem([...items].reverse(), 'b'))
  })
  it('rotaciona após conclusão, mantendo pausados e pulados pendentes', () => {
    const items = [item('a', 0), item('b', 1, { paused: true }), item('c', 2)]
    const states = [{ topicId: 'topic-c', passageNumber: 1, status: 'completed' as const }]
    expect(getNextCycleItem(items, 'c', states)?.id).toBe('a')
    expect(getNextCycleItem(items, 'a', [], ['a'])?.id).toBe('c')
    expect(items[0].status).toBeUndefined()
    expect(getNextCycleItem([item('a', 0, { paused: true })], 'a')).toBeNull()
  })
  it('uma revisão ou conclusão de outra passagem não avança o cursor', () => {
    expect(
      getNextCycleItem([item('a')], 'a', [
        { topicId: 'topic-a', passageNumber: 2, status: 'completed' },
      ])?.id,
    ).toBe('a')
    expect(getNextCycleItem([item('a', 0, { status: 'completed' })], 'a')).toBeNull()
  })
})

describe('fila diária com tarefas reais e cobertura reservada', () => {
  const cards = Array.from({ length: 30 }, (_, n) => ({
    id: `card-${n}`,
    topic_id: 'old',
    due_at: '2026-10-01T03:00:00Z',
  }))
  it.each([1, 15, 25, 45, 60, 90, 120])(
    'respeita %i minutos e mantém janela de cobertura apesar de 30 revisões vencidas',
    (minutes) => {
      const result = generateDailyStudyQueue(queueInput({ dueCards: cards }), minutes)
      expect(result.recommendations.some((r) => r.kind === 'cycle' && r.durationMinutes > 0)).toBe(
        true,
      )
      expect(
        result.recommendations.reduce((sum, r) => sum + r.durationMinutes, 0),
      ).toBeLessThanOrEqual(minutes)
      expect(result.recommendations.every((r) => r.reasons.length > 0)).toBe(true)
    },
  )
  it('dia livre mostra backlog real sem fabricar trabalho', () => {
    expect(generateDailyStudyQueue(queueInput({ dueCards: cards }), 0)).toEqual({
      recommendations: [],
      reviewBacklog: 30,
      unusedMinutes: 0,
    })
  })
  it('deduplica cards, respeita cap e não recomenda revisão futura', () => {
    const result = generateDailyStudyQueue(
      queueInput({
        preferences: defaultPlanPreferences({ reviewCap: 2 }),
        dueCards: [
          ...cards,
          cards[0],
          { id: 'future', topic_id: 'x', due_at: '2030-01-01T00:00:00Z' },
        ],
      }),
      120,
    )
    const scheduled = result.recommendations.flatMap((r) => r.reviewCardIds ?? [])
    expect(scheduled).toHaveLength(2)
    expect(new Set(scheduled).size).toBe(2)
    expect(scheduled).not.toContain('future')
    expect(result.reviewBacklog).toBe(28)
  })
  it('gera questões e erros apenas com ids elegíveis, sem duplicar a mesma questão', () => {
    const result = generateDailyStudyQueue(
      queueInput({
        questions: [
          { id: 'q', topicId: 'topic-a' },
          { id: 'q', topicId: 'topic-a' },
        ],
        errorReviews: [
          { id: 'q', topicId: 'topic-a' },
          { id: 'error', topicId: 'topic-a' },
        ],
      }),
      120,
    )
    expect(result.recommendations.flatMap((r) => r.questionIds ?? [])).toEqual(['q', 'error'])
    expect(generateDailyStudyQueue(queueInput(), 120).recommendations.map((r) => r.kind)).toEqual([
      'cycle',
    ])
    expect(result.recommendations.reduce((sum, r) => sum + r.durationMinutes, 0)).toBe(120)
  })
  it('aplica proporções editáveis normalizadas e preserva cobertura mesmo com peso zero', () => {
    const questions = Array.from({ length: 100 }, (_, n) => ({
      id: `q-${n}`,
      topicId: 'topic-a',
      estimatedMinutes: 1,
    }))
    const result = generateDailyStudyQueue(
      queueInput({
        dueCards: cards,
        questions,
        preferences: defaultPlanPreferences({
          reviewCap: 20,
          timeShares: { review: 2, cycle: 0, questions: 8, errors: 0 },
        }),
      }),
      120,
    )
    expect(result.recommendations.filter((r) => r.kind === 'revision')).toHaveLength(12)
    expect(result.recommendations.filter((r) => r.kind === 'questions')).toHaveLength(95)
    expect(result.recommendations.find((r) => r.kind === 'cycle')?.durationMinutes).toBe(1)
    expect(result.recommendations.reduce((sum, r) => sum + r.durationMinutes, 0)).toBe(120)
  })
  it('replanejar nunca altera cursor, itens ou datas SRS', () => {
    const input = queueInput({ dueCards: cards })
    const original = JSON.stringify(input)
    generateDailyStudyQueue(input, 25)
    expect(JSON.stringify(input)).toBe(original)
  })
})

describe('agenda local, exceções e constância', () => {
  const session = (started_at: string, duration_minutes = 20) => ({
    started_at,
    ended_at: new Date(new Date(started_at).getTime() + duration_minutes * 60000).toISOString(),
    duration_minutes,
  })
  it('agrupar às 02:30 UTC usa dia anterior em São Paulo', () => {
    expect(localStudyDate('2026-11-03T02:30:00Z')).toBe('2026-11-02')
    const result = calculateAdherence({
      sessions: [session('2026-11-03T02:30:00Z'), session('2026-11-02T15:00:00Z')],
      fromDate: '2026-11-02',
      toDate: '2026-11-03',
      asOf: new Date('2026-11-03T15:00:00Z'),
      preferences,
    })
    expect(result).toMatchObject({
      studiedDays: 1,
      plannedDays: 2,
      studiedPlannedDays: 1,
      adherence: 0.5,
      calendarStreak: 1,
    })
  })
  it('aplica weekend livre e exceções de 0/25 minutos, sem alterar preferências', () => {
    const exceptions = [
      { localDate: '2026-11-04', minutes: 25 },
      { localDate: '2026-11-05', minutes: 0 },
    ]
    expect(availabilityForDate('2026-11-07', preferences, exceptions)).toBe(0)
    expect(availabilityForDate('2026-11-04', preferences, exceptions)).toBe(25)
    expect(availabilityForDate('2026-11-05', preferences, exceptions)).toBe(0)
    expect(preferences.weeklyAvailabilityMinutes[4]).toBe(120)
  })
  it('aderência ignora folga planejada enquanto streak civil quebra no fim de semana', () => {
    const result = calculateAdherence({
      sessions: [session('2026-11-06T15:00:00Z'), session('2026-11-09T15:00:00Z')],
      fromDate: '2026-11-06',
      toDate: '2026-11-09',
      asOf: new Date('2026-11-09T20:00:00Z'),
      preferences,
    })
    expect(result).toMatchObject({
      plannedDays: 2,
      studiedPlannedDays: 2,
      adherence: 1,
      calendarStreak: 1,
      longestCalendarStreak: 1,
    })
  })
  it('ignora sessões em aberto, sem tempo, futuras ou inválidas e dias explicitamente bloqueados', () => {
    const result = calculateAdherence({
      sessions: [
        { started_at: '2026-11-03T10:00:00Z', ended_at: null, duration_minutes: 20 },
        session('2026-11-03T10:00:00Z', 0),
        session('2026-11-04T10:00:00Z'),
        { started_at: 'inválida', ended_at: '2026-11-03T10:00:00Z', duration_minutes: 20 },
      ],
      fromDate: '2026-11-03',
      toDate: '2026-11-04',
      asOf: new Date('2026-11-03T20:00:00Z'),
      preferences,
      exceptions: [{ localDate: '2026-11-03', minutes: 0 }],
    })
    expect(result).toMatchObject({
      studiedDays: 0,
      plannedDays: 0,
      adherence: null,
      calendarStreak: 0,
    })
  })
})

describe('métricas honestas de gabarito, autoavaliação, amostra e período', () => {
  it('seleção sem gabarito não vira acerto nem autoavaliação', () => {
    const attempts = [attempt('unknown')]
    expect(computeVerifiedMetrics(attempts)).toMatchObject({
      totalAttempts: 1,
      classifiedAttempts: 0,
      rate: null,
      sampleLevel: 'sem_dados',
    })
    expect(computeSelfAssessedMetrics(attempts).rate).toBeNull()
  })
  it('separa autoavaliação da correção verificada, ignorando gabaritos anulados ou sem status', () => {
    const attempts = [
      attempt('self', { self_grade: 'acertei' }),
      attempt('key', { key_status: 'valida', is_correct: false, self_grade: 'acertei' }),
      attempt('void', { key_status: 'anulada', is_correct: true }),
      attempt('untrusted', { is_correct: true }),
    ]
    expect(computeVerifiedMetrics(attempts)).toMatchObject({
      classifiedAttempts: 1,
      correct: 0,
      rate: 0,
      provenance: 'verified_answer_key',
    })
    expect(computeSelfAssessedMetrics(attempts)).toMatchObject({
      classifiedAttempts: 2,
      correct: 2,
      rate: 1,
      provenance: 'self_assessed',
    })
  })
  it('3 questões não geram diagnóstico forte e repetir 5 vezes conserva amostra distinta de 1', () => {
    const small = [true, false, false].map((is_correct, n) =>
      attempt(String(n), { key_status: 'valida', is_correct }),
    )
    expect(computeVerifiedMetrics(small)).toMatchObject({
      correct: 1,
      rate: 1 / 3,
      sampleLevel: 'insuficiente',
      lowPerformance: false,
    })
    const repeated = Array.from({ length: 5 }, () =>
      attempt('same', { key_status: 'valida', is_correct: false }),
    )
    expect(computeVerifiedMetrics(repeated)).toMatchObject({
      totalAttempts: 5,
      uniqueQuestionsAttempted: 1,
      classifiedAttempts: 5,
      distinctQuestions: 1,
      sampleLevel: 'insuficiente',
      lowPerformance: false,
    })
  })
  it('5/12 com gabarito permite alerta e filtra período explicitamente sem misturar histórico externo', () => {
    const attempts = Array.from({ length: 12 }, (_, n) =>
      attempt(String(n), { key_status: 'valida', is_correct: n < 5 }),
    )
    attempts.push(
      attempt('baseline', {
        created_at: '2026-01-01T10:00:00Z',
        key_status: 'valida',
        is_correct: true,
      }),
    )
    const period = { from: '2026-11-01T00:00:00Z', to: '2026-11-30T23:59:59Z' }
    expect(computeVerifiedMetrics(attempts, period)).toMatchObject({
      totalAttempts: 12,
      distinctQuestions: 12,
      correct: 5,
      rate: 5 / 12,
      sampleLevel: 'suficiente',
      lowPerformance: true,
      period,
    })
    expect(
      computeVerifiedMetrics(attempts, { ...period, lowPerformanceThreshold: 0.4 }).lowPerformance,
    ).toBe(false)
    expect(
      computeVerifiedMetrics(attempts, { ...period, minDistinctQuestions: 20 }).sampleLevel,
    ).toBe('insuficiente')
  })
})
