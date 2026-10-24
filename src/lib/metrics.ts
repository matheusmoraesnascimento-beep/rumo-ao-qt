export interface AttemptLite {
  selected_option?: string | null
  self_grade?: 'acertei' | 'errei' | 'nao_sei' | null
  question_id: string
  created_at: string
  time_seconds?: number
  key_status?: 'valida' | 'anulada' | 'alterada' | null
  is_correct?: boolean | null
}

/** Nota efetiva da tentativa: gabarito oficial (se houver) prevalece sobre a autoavaliação; anulada nunca conta. */
export function effectiveGrade(a: Pick<AttemptLite, 'self_grade' | 'key_status' | 'is_correct'>): 'acertei' | 'errei' | 'nao_sei' | null {
  if (a.key_status === 'anulada') return null
  if (a.is_correct === true) return 'acertei'
  if (a.is_correct === false) return 'errei'
  return a.self_grade ?? null
}

/** Taxa autodeclarada = acertei / (acertei + errei). Sem dados => null. */
export function selfRate(attempts: AttemptLite[]): number | null {
  const a = attempts.filter((x) => x.self_grade === 'acertei').length
  const e = attempts.filter((x) => x.self_grade === 'errei').length
  return a + e === 0 ? null : a / (a + e)
}

/** Taxa com nota efetiva (gabarito oficial quando houver, senão autoavaliação). Sem dados => null. */
export function effectiveRate(attempts: AttemptLite[]): number | null {
  const g = attempts.map(effectiveGrade)
  const a = g.filter((x) => x === 'acertei').length
  const e = g.filter((x) => x === 'errei').length
  return a + e === 0 ? null : a / (a + e)
}

/** Taxa verificada = acertos / tentativas com gabarito oficial aplicável (anuladas ficam de fora). Sem dados => null (N/A). */
export function verifiedRate(attempts: AttemptLite[]): number | null {
  const rel = attempts.filter((x) => x.is_correct === true || x.is_correct === false)
  return rel.length === 0 ? null : rel.filter((x) => x.is_correct === true).length / rel.length
}

export function fmtPct(x: number | null): string {
  return x === null ? 'N/A' : `${Math.round(x * 100)}%`
}

/** Duração segura em minutos: nunca negativa/impossível. */
export function safeMinutes(startMs: number, endMs: number, pausedMs = 0): number {
  const ms = endMs - startMs - pausedMs
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.min(1440, Math.round((ms / 60000) * 100) / 100)
}

export function coverage(statuses: string[]): { done: number; total: number; pct: number } {
  const total = statuses.length
  const done = statuses.filter((s) => s !== 'nao_iniciado').length
  return { done, total, pct: total ? done / total : 0 }
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

export function daysUntil(examDate: string | null, today = new Date()): number | null {
  if (!examDate) return null
  const [y, m, d] = examDate.split('-').map(Number)
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000)
}
