/** PRNG determinístico (mulberry32) — permite reproduzir simulados mistos pela semente. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface QRef {
  id: string
  year: number
  number: number
}

export const SIM_SIZE = 50

/** Simulado por ano: as 50 questões na ordem original. Falha se faltar/ sobrar. */
export function buildYearSimulation(all: QRef[], year: number): QRef[] {
  if (!Number.isInteger(year)) throw new Error('ano indefinido')
  const q = all.filter((x) => x.year === year).sort((a, b) => a.number - b.number)
  if (q.length !== SIM_SIZE) throw new Error(`prova ${year} tem ${q.length} questões (esperado ${SIM_SIZE})`)
  return q
}

/**
 * Simulado misto: 50 sorteadas distribuídas entre anos distintos (10 por ano quando há 5 anos),
 * embaralhadas pela semente. Mesma semente + mesmo banco => mesmo simulado.
 */
export function buildMixedSimulation(all: QRef[], seed: string, preferUnseen: Set<string> = new Set()): QRef[] {
  if (!seed) throw new Error('semente obrigatória')
  const rand = rng(seed)
  const years = [...new Set(all.map((q) => q.year))].sort()
  if (years.length === 0) throw new Error('sem questões')
  const base = Math.floor(SIM_SIZE / years.length)
  let extra = SIM_SIZE - base * years.length
  const picked: QRef[] = []
  for (const y of shuffle(years, rand)) {
    const want = base + (extra-- > 0 ? 1 : 0)
    const pool = shuffle(all.filter((q) => q.year === y), rand)
    // prioriza inéditas para o usuário, sem perder determinismo
    pool.sort((a, b) => Number(preferUnseen.has(b.id)) - Number(preferUnseen.has(a.id)))
    picked.push(...pool.slice(0, want))
  }
  if (picked.length !== SIM_SIZE) throw new Error('banco insuficiente para 50 questões')
  return shuffle(picked, rand)
}

export interface SimAnswer {
  questionId: string
  selected?: string | null
  selfGrade?: 'acertei' | 'errei' | 'nao_sei' | null
}

/** Resultado honesto: sem gabarito => nota verificada indisponível. */
export function summarizeSimulation(ids: string[], answers: SimAnswer[], verifiedKey?: Record<string, string>) {
  const byQ = new Map(answers.map((a) => [a.questionId, a]))
  const answered = ids.filter((id) => byQ.get(id)?.selected).length
  const selfDeclared = ids.filter((id) => byQ.get(id)?.selfGrade).length
  const selfCorrect = ids.filter((id) => byQ.get(id)?.selfGrade === 'acertei').length
  const selfWrong = ids.filter((id) => byQ.get(id)?.selfGrade === 'errei').length
  let verified: number | null = null
  if (verifiedKey && Object.keys(verifiedKey).length) {
    verified = ids.filter((id) => verifiedKey[id] && verifiedKey[id] === byQ.get(id)?.selected).length
  }
  return {
    total: ids.length,
    answered,
    unanswered: ids.length - answered,
    selfDeclared,
    selfCorrect,
    selfWrong,
    selfScore: selfCorrect + selfWrong > 0 ? selfCorrect : null,
    verifiedScore: verified, // null => "N/A (sem gabarito validado)"
  }
}

export const GOALS = [30, 35, 40] as const
