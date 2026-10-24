import type { Attempt, QuestionLite } from '@/types/db'
import { rng, shuffle } from './simulado'
import { effectiveGrade } from './metrics'

export interface QFilters {
  year?: number
  number?: number
  topicId?: string
  ocr?: string
  status?: 'todas' | 'inedita' | 'resolvida' | 'errei' | 'acertei'
  favorite?: boolean
  figure?: boolean
  annulled?: boolean
  textIds?: Set<string> | null // resultado da busca full-text (null = sem busca)
}

export interface QCtx {
  yearOf: Map<string, number> // exam_id -> ano
  attempts: Attempt[]
  favorites: Set<string>
  topicsOf: Map<string, string[]> // question_id -> topic ids (classificação do usuário)
}

/** Último autojulgamento por questão (o mais recente prevalece). */
export function lastGrades(attempts: Attempt[]): Map<string, Attempt['self_grade']> {
  const m = new Map<string, { t: number; g: Attempt['self_grade'] }>()
  for (const a of attempts) {
    const g = effectiveGrade(a) // gabarito oficial prevalece; anulada não conta
    if (!g) continue
    const t = new Date(a.created_at).getTime()
    const p = m.get(a.question_id)
    if (!p || t > p.t) m.set(a.question_id, { t, g })
  }
  return new Map([...m].map(([k, v]) => [k, v.g]))
}

export function filterQuestions(qs: QuestionLite[], f: QFilters, c: QCtx): QuestionLite[] {
  const tried = new Set(c.attempts.map((a) => a.question_id))
  const grades = lastGrades(c.attempts)
  return qs.filter((q) => {
    if (f.year && c.yearOf.get(q.exam_id) !== f.year) return false
    if (f.number && q.number !== f.number) return false
    if (f.topicId && !(c.topicsOf.get(q.id) ?? []).includes(f.topicId)) return false
    if (f.ocr && q.ocr_status !== f.ocr) return false
    if (f.favorite && !c.favorites.has(q.id)) return false
    if (f.figure && !q.has_figure) return false
    if (f.annulled && !q.annulled) return false
    if (f.textIds && !f.textIds.has(q.id)) return false
    switch (f.status) {
      case 'inedita': return !tried.has(q.id)
      case 'resolvida': return tried.has(q.id)
      case 'errei': return grades.get(q.id) === 'errei'
      case 'acertei': return grades.get(q.id) === 'acertei'
      default: return true
    }
  })
}

/** Mistura equilibrada: round-robin por tópico (se classificado) ou, senão, por ano. Determinística pela semente. */
export function balancedMix(qs: QuestionLite[], c: QCtx, n: number, seed: string): QuestionLite[] {
  const rand = rng(seed)
  const groups = new Map<string, QuestionLite[]>()
  for (const q of shuffle(qs, rand)) {
    const key = c.topicsOf.get(q.id)?.[0] ?? `ano:${c.yearOf.get(q.exam_id)}`
    groups.set(key, [...(groups.get(key) ?? []), q])
  }
  const lists = shuffle([...groups.values()], rand)
  const out: QuestionLite[] = []
  while (out.length < n && lists.some((l) => l.length)) {
    for (const l of lists) {
      const x = l.shift()
      if (x && out.length < n) out.push(x)
    }
  }
  return out
}
