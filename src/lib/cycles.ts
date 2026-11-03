import { formatInTimeZone } from 'date-fns-tz'
import { DEFAULT_TZ, dailyQueue, type DueCard } from './srs'
import type { AttemptLite } from './metrics'

/** Own, versioned planning rules; this module never mutates SRS or legacy progress. */
export const CYCLE_ALGORITHM_VERSION = 'cycles-v1'
export interface StudyPlanPreferences {
  timezone: string
  weeklyAvailabilityMinutes: Record<number, number>
  examDate: string | null
  targetCorrectAnswers: number
  reviewCap: number
  minVerifiedSample: number
  verifiedLowPerformanceThreshold: number
  analysisWindowDays: number
  timeShares: { review: number; cycle: number; questions: number; errors: number }
  weights: {
    reviewOverdue: number
    editalCoverageGap: number
    demonstratedDifficulty: number
    daysSinceContact: number
    manualPriority: number
  }
}
export type PlanPreferencesInput = {
  [K in keyof Omit<StudyPlanPreferences, 'weights' | 'weeklyAvailabilityMinutes' | 'timeShares'>]?:
    StudyPlanPreferences[K] | null
} & {
  weights?: Partial<StudyPlanPreferences['weights']> | null
  timeShares?: Partial<StudyPlanPreferences['timeShares']> | null
  weeklyAvailabilityMinutes?: Record<number, number | null | undefined> | null
}

/** Defaults fill absent values only; zero minutes and zero weights are intentional. */
export function defaultPlanPreferences(input: PlanPreferencesInput = {}): StudyPlanPreferences {
  const days: Record<number, number> = {}
  for (let day = 1; day <= 7; day++)
    days[day] = input.weeklyAvailabilityMinutes?.[day] ?? (day <= 5 ? 120 : 0)
  return {
    timezone: input.timezone ?? DEFAULT_TZ,
    weeklyAvailabilityMinutes: days,
    examDate: input.examDate ?? null,
    targetCorrectAnswers: input.targetCorrectAnswers ?? 40,
    reviewCap: input.reviewCap ?? 20,
    minVerifiedSample: input.minVerifiedSample ?? 10,
    verifiedLowPerformanceThreshold: input.verifiedLowPerformanceThreshold ?? 0.7,
    analysisWindowDays: input.analysisWindowDays ?? 30,
    timeShares: {
      review: input.timeShares?.review ?? 0.125,
      cycle: input.timeShares?.cycle ?? 0.375,
      questions: input.timeShares?.questions ?? 0.375,
      errors: input.timeShares?.errors ?? 0.125,
    },
    weights: {
      reviewOverdue: input.weights?.reviewOverdue ?? 0.3,
      editalCoverageGap: input.weights?.editalCoverageGap ?? 0.25,
      demonstratedDifficulty: input.weights?.demonstratedDifficulty ?? 0.2,
      daysSinceContact: input.weights?.daysSinceContact ?? 0.15,
      manualPriority: input.weights?.manualPriority ?? 0.1,
    },
  }
}

export interface SyllabusTopic {
  id: string
  parent_id: string | null
  syllabus_version_id: string
  ordinal?: number
  active?: boolean
  required?: boolean
  subjectId?: string
}

/** A leaf has no active child in this version. Optional children still prevent counting a parent twice. */
export function deriveTopicLeafSet<T extends SyllabusTopic>(
  topics: readonly T[],
  syllabusVersionId: string,
): T[] {
  const active = [
    ...new Map(
      topics
        .filter((t) => t.syllabus_version_id === syllabusVersionId && t.active !== false)
        .map((t) => [t.id, t]),
    ).values(),
  ]
  const parents = new Set(active.map((t) => t.parent_id).filter((id) => id !== null))
  return active
    .filter((t) => t.required !== false && !parents.has(t.id))
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0) || compareId(a.id, b.id))
}

export type PassageStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped_with_reason'
export type EvidenceProvenance =
  | 'verified_answer_key'
  | 'self_assessed'
  | 'manual_checklist'
  | 'recorded_study_session'
  | 'legacy_verified'
  | 'unknown'
export interface TopicPassageState {
  topicId: string
  passageNumber: number
  status: PassageStatus
  syllabusVersionId?: string
}
export interface PassageCompletionEvidence {
  requiredChecklist: readonly boolean[]
  studySessionIds?: readonly string[]
  questionAttemptIds?: readonly string[]
  reviewEventIds?: readonly string[]
  auditedManualReason?: string | null
  confirmed: boolean
}

/** Persistence must enforce uniqueness, ownership and idempotency; elapsed time is not completion evidence. */
export function canCompletePassage(evidence: PassageCompletionEvidence): boolean {
  return (
    evidence.confirmed &&
    evidence.requiredChecklist.length > 0 &&
    evidence.requiredChecklist.every(Boolean) &&
    Boolean(
      evidence.studySessionIds?.length ||
      evidence.questionAttemptIds?.length ||
      evidence.reviewEventIds?.length ||
      evidence.auditedManualReason?.trim(),
    )
  )
}

export function aggregateSubjectPassage(
  states: readonly TopicPassageState[],
  leaves: readonly SyllabusTopic[],
  passageNumber: number,
  subjectId?: string,
) {
  const required = [
    ...new Map(
      leaves
        .filter(
          (t) =>
            t.active !== false && t.required !== false && (!subjectId || t.subjectId === subjectId),
        )
        .map((t) => [t.id, t]),
    ).values(),
  ]
  const completed = required.filter((t) =>
    states.some(
      (s) =>
        s.topicId === t.id &&
        s.passageNumber === passageNumber &&
        s.status === 'completed' &&
        (!s.syllabusVersionId || s.syllabusVersionId === t.syllabus_version_id),
    ),
  ).length
  const total = required.length
  return {
    completed,
    total,
    ratio: total ? completed / total : null,
    isComplete: total > 0 && completed === total,
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
const nonnegative = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export interface TopicPriorityInput {
  topicId: string
  cycleOrdinal: number
  overdueDays: number
  coverageGap: number
  daysSinceContact: number | null
  manualWeight?: number
  verifiedRate?: number | null
  verifiedDistinctQuestions?: number
  selfAssessedRate?: number | null
  useSelfAssessment?: boolean
}
export interface TopicPriority {
  topicId: string
  cycleOrdinal: number
  score: number
  factors: StudyPlanPreferences['weights']
  reasons: string[]
  evidenceQuality: 'verified' | 'self_reported' | 'insufficient' | 'not_applicable'
}

export function computeTopicPriority(
  input: TopicPriorityInput,
  preferences = defaultPlanPreferences(),
): TopicPriority {
  const verified =
    input.verifiedRate != null &&
    (input.verifiedDistinctQuestions ?? 0) >= preferences.minVerifiedSample
  const self = !verified && input.useSelfAssessment && input.selfAssessedRate != null
  const factors = {
    reviewOverdue: clamp01(input.overdueDays / 14),
    editalCoverageGap: clamp01(input.coverageGap),
    demonstratedDifficulty: verified
      ? 1 - clamp01(input.verifiedRate!)
      : self
        ? 1 - clamp01(input.selfAssessedRate!)
        : 0.5,
    daysSinceContact: input.daysSinceContact === null ? 1 : clamp01(input.daysSinceContact / 30),
    manualPriority: clamp01(((input.manualWeight ?? 1) - 0.5) / 1.5),
  }
  let numerator = 0
  let denominator = 0
  for (const key of Object.keys(factors) as (keyof typeof factors)[]) {
    const weight = nonnegative(preferences.weights[key])
    numerator += weight * factors[key]
    denominator += weight
  }
  const reasons: string[] = []
  if (input.coverageGap > 0) reasons.push('conteúdo obrigatório com cobertura pendente')
  if (input.overdueDays > 0) reasons.push(`revisão vencida há ${input.overdueDays} dia(s)`)
  if (input.daysSinceContact === null) reasons.push('sem contato de estudo registrado')
  else if (input.daysSinceContact >= 7)
    reasons.push(`sem contato há ${input.daysSinceContact} dias`)
  if (verified)
    reasons.push(`desempenho verificado em ${input.verifiedDistinctQuestions} questões distintas`)
  else if (self) reasons.push('dificuldade baseada em autoavaliação autorizada')
  else reasons.push('histórico de questões insuficiente; diagnóstico pendente')
  return {
    topicId: input.topicId,
    cycleOrdinal: input.cycleOrdinal,
    score: denominator ? clamp01(numerator / denominator) : 0,
    factors,
    reasons,
    evidenceQuality: verified ? 'verified' : self ? 'self_reported' : 'insufficient',
  }
}

export function rankTopicPriorities(
  inputs: readonly TopicPriorityInput[],
  preferences = defaultPlanPreferences(),
): TopicPriority[] {
  return [
    ...new Map(inputs.map((i) => [i.topicId, computeTopicPriority(i, preferences)])).values(),
  ].sort(
    (a, b) =>
      b.score - a.score || a.cycleOrdinal - b.cycleOrdinal || compareId(a.topicId, b.topicId),
  )
}

export interface CycleItem {
  id: string
  topicId: string
  ordinal: number
  targetPassage: number
  estimatedMinutes: number
  studiedMinutes?: number
  status?: 'pending' | 'in_progress' | 'completed'
  paused?: boolean
  active?: boolean
  syllabusVersionId?: string
}

/** Cursor points to the current item to execute, preserved by id when order changes. */
export function getNextCycleItem(
  items: readonly CycleItem[],
  currentItemId: string | null,
  states: readonly TopicPassageState[] = [],
  skippedIds: readonly string[] = [],
): CycleItem | null {
  const ordered = items
    .filter((i) => i.active !== false)
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal || compareId(a.id, b.id))
  const start = Math.max(
    0,
    ordered.findIndex((i) => i.id === currentItemId),
  )
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)]
  return (
    rotated.find(
      (i) =>
        !i.paused &&
        i.status !== 'completed' &&
        !skippedIds.includes(i.id) &&
        !states.some(
          (s) =>
            s.topicId === i.topicId &&
            s.passageNumber === i.targetPassage &&
            s.status === 'completed' &&
            (!i.syllabusVersionId || s.syllabusVersionId === i.syllabusVersionId),
        ),
    ) ?? null
  )
}

export interface Recommendation {
  topicId: string | null
  cycleItemId?: string
  kind: 'cycle' | 'revision' | 'questions' | 'error_review'
  targetPassage?: number
  durationMinutes: number
  reviewCardIds?: string[]
  questionIds?: string[]
  priorityScore?: number
  reasons: string[]
  evidenceQuality: TopicPriority['evidenceQuality']
  algorithmVersion: string
}
export interface EligibleQuestion {
  id: string
  topicId: string | null
  estimatedMinutes?: number
}
export interface DailyStudyQueueInput {
  now: Date
  preferences: StudyPlanPreferences
  cycleItems: readonly CycleItem[]
  currentItemId: string | null
  passageStates?: readonly TopicPassageState[]
  skippedItemIds?: readonly string[]
  dueCards: readonly DueCard[]
  questions: readonly EligibleQuestion[]
  errorReviews?: readonly EligibleQuestion[]
  priorities?: readonly TopicPriority[]
}

/** Real ids only. Reserve cycle time before consuming a possibly unbounded review backlog. */
export function generateDailyStudyQueue(input: DailyStudyQueueInput, availableMinutes: number) {
  const available = Math.floor(nonnegative(availableMinutes))
  const recommendations: Recommendation[] = []
  const uniqueCards = [...new Map(input.dueCards.map((c) => [c.id, c])).values()]
  const allDue = dailyQueue(uniqueCards, input.now, Number.MAX_SAFE_INTEGER).queue
  const due = dailyQueue(
    uniqueCards,
    input.now,
    Math.floor(nonnegative(input.preferences.reviewCap)),
  ).queue
  if (!available) return { recommendations, reviewBacklog: allDue.length, unusedMinutes: 0 }
  const item = getNextCycleItem(
    input.cycleItems,
    input.currentItemId,
    input.passageStates,
    input.skippedItemIds,
  )
  const priority = input.priorities?.find((p) => p.topicId === item?.topicId)
  const shares = input.preferences.timeShares
  const sharesTotal = Object.values(shares).reduce((sum, value) => sum + nonnegative(value), 0)
  const share = (key: keyof typeof shares) =>
    sharesTotal ? nonnegative(shares[key]) / sharesTotal : 0
  const cycleMinutes = item
    ? Math.min(
        available,
        available <= 25
          ? Math.max(1, available - Math.min(5, due.length * 2))
          : Math.max(1, Math.floor(available * share('cycle'))),
      )
    : 0
  let remaining = available - cycleMinutes
  const version = CYCLE_ALGORITHM_VERSION
  const reviewBudget = Math.min(
    remaining,
    share('review') > 0 ? Math.max(2, Math.floor(available * share('review'))) : 0,
  )
  const reviewCount = Math.min(due.length, Math.floor(reviewBudget / 2))
  for (const card of due.slice(0, reviewCount)) {
    recommendations.push({
      topicId: card.topic_id,
      kind: 'revision',
      durationMinutes: 2,
      reviewCardIds: [card.id],
      reasons: ['revisão realmente devida na fila SRS existente'],
      evidenceQuality: 'not_applicable',
      algorithmVersion: version,
    })
    remaining -= 2
  }
  let cycle: Recommendation | undefined
  if (item) {
    cycle = {
      topicId: item.topicId,
      cycleItemId: item.id,
      kind: 'cycle',
      targetPassage: item.targetPassage,
      durationMinutes: cycleMinutes,
      priorityScore: priority?.score,
      reasons: [
        'próximo item pendente do ciclo; cobertura reservada',
        ...(priority?.reasons ?? []),
      ],
      evidenceQuality: priority?.evidenceQuality ?? 'insufficient',
      algorithmVersion: version,
    }
    recommendations.push(cycle)
  }
  const usedQuestions = new Set<string>()
  for (const [kind, candidates, maxMinutes] of [
    ['questions', input.questions, Math.floor(available * share('questions'))],
    ['error_review', input.errorReviews ?? [], Math.floor(available * share('errors'))],
  ] as const) {
    let budget = Math.min(remaining, maxMinutes)
    const scoreFor = (topicId: string | null) =>
      input.priorities?.find((p) => p.topicId === topicId)?.score ?? 0
    const ordered = [...new Map(candidates.map((q) => [q.id, q])).values()].sort(
      (a, b) =>
        Number(b.topicId === item?.topicId) - Number(a.topicId === item?.topicId) ||
        scoreFor(b.topicId) - scoreFor(a.topicId) ||
        compareId(a.id, b.id),
    )
    for (const question of ordered) {
      const minutes = Math.max(1, Math.ceil(nonnegative(question.estimatedMinutes ?? 3)))
      if (usedQuestions.has(question.id) || minutes > budget) continue
      usedQuestions.add(question.id)
      recommendations.push({
        topicId: question.topicId,
        kind,
        durationMinutes: minutes,
        questionIds: [question.id],
        reasons: [
          kind === 'questions'
            ? 'questão elegível do banco existente'
            : 'erro realmente classificado para análise',
        ],
        evidenceQuality: 'not_applicable',
        algorithmVersion: version,
      })
      budget -= minutes
      remaining -= minutes
    }
  }
  // Missing question/error tasks become study time, never synthetic questions or fake cards.
  if (cycle && remaining > 0) {
    cycle.durationMinutes += remaining
    remaining = 0
  }
  return { recommendations, reviewBacklog: allDue.length - reviewCount, unusedMinutes: remaining }
}

export interface PlanException {
  localDate: string
  minutes: number
  reason?: string
}
export const localStudyDate = (at: Date | string, timezone = DEFAULT_TZ) =>
  formatInTimeZone(at, timezone, 'yyyy-MM-dd')
const civilDay = (date: string) => new Date(`${date}T12:00:00Z`)
const plusDay = (date: string, days: number) =>
  new Date(civilDay(date).getTime() + days * 86400000).toISOString().slice(0, 10)
export function availabilityForDate(
  localDate: string,
  preferences: StudyPlanPreferences,
  exceptions: readonly PlanException[] = [],
): number {
  const exception = exceptions.find((e) => e.localDate === localDate)
  const weekday = civilDay(localDate).getUTCDay() || 7
  return nonnegative(exception?.minutes ?? preferences.weeklyAvailabilityMinutes[weekday] ?? 0)
}
export interface AdherenceSession {
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}
export interface AdherenceInput {
  sessions: readonly AdherenceSession[]
  fromDate: string
  toDate: string
  asOf: Date
  preferences: StudyPlanPreferences
  exceptions?: readonly PlanException[]
}

/** A valid finished session with positive real minutes counts once on its local start date. */
export function calculateAdherence(input: AdherenceInput) {
  const today = localStudyDate(input.asOf, input.preferences.timezone)
  const until = input.toDate < today ? input.toDate : today
  const studied = new Set(
    input.sessions
      .filter(
        (s) =>
          s.ended_at &&
          Number.isFinite(s.duration_minutes) &&
          (s.duration_minutes ?? 0) > 0 &&
          Number.isFinite(new Date(s.started_at).getTime()) &&
          new Date(s.ended_at).getTime() >= new Date(s.started_at).getTime() &&
          new Date(s.ended_at).getTime() <= input.asOf.getTime(),
      )
      .map((s) => localStudyDate(s.started_at, input.preferences.timezone))
      .filter((d) => d >= input.fromDate && d <= until),
  )
  let plannedDays = 0
  let studiedPlannedDays = 0
  let longestCalendarStreak = 0
  let running = 0
  for (let day = input.fromDate; day <= until; day = plusDay(day, 1)) {
    if (availabilityForDate(day, input.preferences, input.exceptions) > 0) {
      plannedDays++
      if (studied.has(day)) studiedPlannedDays++
    }
    running = studied.has(day) ? running + 1 : 0
    longestCalendarStreak = Math.max(longestCalendarStreak, running)
  }
  // Today may still be in progress; yesterday's streak remains current until today ends.
  let cursor = studied.has(until) || until !== today ? until : plusDay(until, -1)
  let calendarStreak = 0
  while (cursor >= input.fromDate && studied.has(cursor)) {
    calendarStreak++
    cursor = plusDay(cursor, -1)
  }
  return {
    plannedDays,
    studiedPlannedDays,
    adherence: plannedDays ? studiedPlannedDays / plannedDays : null,
    studiedDays: studied.size,
    calendarStreak,
    longestCalendarStreak,
  }
}

export interface MetricsOptions {
  /** Inclusive timestamp boundaries; filtering is independent of the browser's timezone. */
  from?: string | null
  to?: string | null
  minDistinctQuestions?: number
  lowPerformanceThreshold?: number
}
function periodAttempts(attempts: readonly AttemptLite[], options: MetricsOptions): AttemptLite[] {
  const from = options.from ? new Date(options.from).getTime() : -Infinity
  const to = options.to ? new Date(options.to).getTime() : Infinity
  return attempts.filter((a) => {
    const time = new Date(a.created_at).getTime()
    return Number.isFinite(time) && time >= from && time <= to
  })
}

function summarizeAttempts(
  attempts: readonly AttemptLite[],
  options: MetricsOptions,
  verified: boolean,
) {
  const period = periodAttempts(attempts, options)
  const classified = period.filter((a) =>
    verified
      ? (a.key_status === 'valida' || a.key_status === 'alterada') &&
        typeof a.is_correct === 'boolean'
      : a.self_grade === 'acertei' || a.self_grade === 'errei',
  )
  const distinctQuestions = new Set(classified.map((a) => a.question_id)).size
  const correct = classified.filter((a) =>
    verified ? a.is_correct === true : a.self_grade === 'acertei',
  ).length
  const rate = classified.length ? correct / classified.length : null
  const sampleLevel = !classified.length
    ? 'sem_dados'
    : distinctQuestions < (options.minDistinctQuestions ?? 10)
      ? 'insuficiente'
      : 'suficiente'
  return {
    totalAttempts: period.length,
    uniqueQuestionsAttempted: new Set(period.map((a) => a.question_id)).size,
    classifiedAttempts: classified.length,
    distinctQuestions,
    correct,
    rate,
    sampleLevel,
    lowPerformance:
      verified &&
      sampleLevel === 'suficiente' &&
      rate !== null &&
      rate < (options.lowPerformanceThreshold ?? 0.7),
    period: { from: options.from ?? null, to: options.to ?? null },
    provenance: verified ? 'verified_answer_key' : 'self_assessed',
  } as const
}

/** Only persisted, applicable key corrections count; importing a new key does not silently regrade history. */
export function computeVerifiedMetrics(
  attempts: readonly AttemptLite[],
  options: MetricsOptions = {},
) {
  return summarizeAttempts(attempts, options, true)
}
export function computeSelfAssessedMetrics(
  attempts: readonly AttemptLite[],
  options: MetricsOptions = {},
) {
  return summarizeAttempts(attempts, options, false)
}
