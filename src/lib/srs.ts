import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/** Espelho em TS do RPC `review_card` (SQL) — algoritmo `interval-v1`. Mantenha os dois iguais. */
export const SRS_VERSION = 'interval-v1'
export const INTERVALS = [1, 3, 7, 14, 30, 60] as const
export const DEFAULT_TZ = 'America/Sao_Paulo'
export const MAX_LEVEL = 6

export type Rating = 0 | 1 | 2 | 3 | 4 | 5

export const RATING_LABELS: Record<Rating, string> = {
  0: 'Esqueci',
  1: 'Muito difícil',
  2: 'Difícil',
  3: 'Lembrei com esforço',
  4: 'Fácil',
  5: 'Muito fácil',
}

export interface CardState {
  level: number
  lapses: number
  reviewCount: number
}

export interface ReviewResult {
  level: number
  lapses: number
  reviewCount: number
  days: number
  dueAt: Date
}

/** Meia-noite local (tz) de `dataLocal + dias`, convertida para UTC. */
export function localMidnightPlusDays(from: Date, days: number, tz = DEFAULT_TZ): Date {
  const [y, m, d] = formatInTimeZone(from, tz, 'yyyy-MM-dd').split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d + days))
  const iso = base.toISOString().slice(0, 10)
  return fromZonedTime(`${iso}T00:00:00`, tz)
}

export function nextReview(card: CardState, rating: Rating, reviewedAt: Date, tz = DEFAULT_TZ): ReviewResult {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new RangeError('rating inválido')
  let level: number
  let days: number
  let lapses = card.lapses
  if (rating <= 2) {
    level = 0
    days = 1
    lapses += 1
  } else if (rating === 3) {
    level = Math.max(1, card.level) // sem acelerar
    days = INTERVALS[level - 1]
  } else {
    const step = rating === 5 && card.reviewCount >= 2 ? 2 : 1
    level = Math.min(MAX_LEVEL, card.level + step)
    days = INTERVALS[level - 1]
  }
  return {
    level,
    lapses,
    reviewCount: card.reviewCount + 1,
    days,
    dueAt: localMidnightPlusDays(reviewedAt, days, tz),
  }
}

/** Primeira revisão de um card novo: amanhã (data local) se estudado hoje. */
export function firstDueAt(createdAt: Date, tz = DEFAULT_TZ): Date {
  return localMidnightPlusDays(createdAt, 1, tz)
}

export interface DueCard {
  id: string
  due_at: string
  topic_id: string | null
}

/**
 * Fila do dia: vencidos entram UMA vez cada (sem multiplicar), mais atrasados primeiro,
 * limitada por `cap`. Os demais permanecem pendentes (não são apagados nem reprogramados).
 */
export function dailyQueue<T extends DueCard>(cards: T[], now: Date, cap: number): { queue: T[]; backlog: number } {
  const due = cards
    .filter((c) => new Date(c.due_at).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  return { queue: due.slice(0, Math.max(0, cap)), backlog: Math.max(0, due.length - cap) }
}
