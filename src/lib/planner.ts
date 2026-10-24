import { differenceInCalendarDays } from 'date-fns'

/** Pesos = configuração pedagógica inicial (NÃO são estatísticas da banca). */
export const WEIGHTS = {
  atraso: 0.35,
  cobertura: 0.25,
  dificuldade: 0.2,
  esquecimento: 0.1,
  pessoal: 0.1,
} as const

export interface TopicSignal {
  topicId: string
  name: string
  status: 'nao_iniciado' | 'estudando' | 'revisando' | 'consolidado'
  confidence: number // 0–5
  lastStudiedAt: Date | null
  overdueCards: number
  maxOverdueDays: number
  attempts: number // tentativas autoavaliadas ligadas ao tema
  errors: number // autoavaliadas como "errei"
}

export interface Scored {
  topicId: string
  name: string
  score: number
  parts: Record<keyof typeof WEIGHTS, number>
  reasons: string[]
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const COVERAGE_GAP = { nao_iniciado: 1, estudando: 0.6, revisando: 0.3, consolidado: 0 } as const

export function scoreTopic(t: TopicSignal, today: Date): Scored {
  const daysSince = t.lastStudiedAt ? Math.max(0, differenceInCalendarDays(today, t.lastStudiedAt)) : null
  const parts = {
    atraso: clamp01(t.maxOverdueDays / 14),
    cobertura: COVERAGE_GAP[t.status],
    dificuldade: t.attempts > 0 ? clamp01(t.errors / t.attempts) : 0,
    esquecimento: daysSince === null ? 1 : clamp01(daysSince / 30),
    pessoal: clamp01((5 - t.confidence) / 5),
  }
  const score =
    WEIGHTS.atraso * parts.atraso +
    WEIGHTS.cobertura * parts.cobertura +
    WEIGHTS.dificuldade * parts.dificuldade +
    WEIGHTS.esquecimento * parts.esquecimento +
    WEIGHTS.pessoal * parts.pessoal

  const reasons: string[] = []
  if (t.overdueCards > 0) reasons.push(`${t.overdueCards} revisão(ões) vencida(s), a mais antiga há ${t.maxOverdueDays} dia(s)`)
  if (t.status === 'nao_iniciado') reasons.push('assunto do edital ainda não iniciado')
  else if (t.status !== 'consolidado') reasons.push('assunto do edital não concluído')
  if (t.errors > 0) reasons.push(`${t.errors} erro(s) autodeclarado(s) em ${t.attempts} questão(ões)`)
  if (daysSince === null) reasons.push('nunca estudado')
  else if (daysSince >= 7) reasons.push(`sem contato há ${daysSince} dias`)
  if (t.confidence <= 2) reasons.push(`confiança baixa (${t.confidence}/5)`)
  if (reasons.length === 0) reasons.push('manutenção de rotina')
  return { topicId: t.topicId, name: t.name, score: Math.round(score * 1000) / 1000, parts, reasons }
}

export function rankTopics(signals: TopicSignal[], today: Date): Scored[] {
  const seen = new Set<string>()
  return signals
    .filter((s) => (seen.has(s.topicId) ? false : (seen.add(s.topicId), true))) // dedup
    .map((s) => scoreTopic(s, today))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'pt-BR'))
}

export type BlockKind = 'revisao' | 'teoria' | 'questoes' | 'redacao'
export interface PlanBlock {
  kind: BlockKind
  minutes: number
  title: string
  topicId?: string
  reasons: string[]
  count?: number
}

export interface PlanInput {
  minutes: number
  dueCards: number // já limitado pelo cap diário
  ranked: Scored[]
  untouched: Scored[] // tópicos nunca iniciados (cobertura)
  writingDue: boolean
  includeWriting: boolean
  minNewShare: number // 0–1 do tempo de teoria reservado a assuntos novos
  blocked?: boolean
}

export const MIN_PER_CARD = 1.5

export function planDay(i: PlanInput): PlanBlock[] {
  if (i.blocked) return []
  let left = Math.max(0, Math.floor(i.minutes))
  const blocks: PlanBlock[] = []
  if (left <= 0) return blocks

  // Pouco tempo: revisão crítica + 1 questão curta.
  if (left <= 20) {
    const n = Math.min(i.dueCards, Math.max(1, Math.floor((left - 5) / MIN_PER_CARD)), 5)
    if (n > 0) {
      const m = Math.max(1, Math.ceil(n * MIN_PER_CARD))
      blocks.push({ kind: 'revisao', minutes: m, count: n, title: `Faça estas ${n} revisões`, reasons: ['pouco tempo: só o que vence'] })
      left -= m
    }
    if (left >= 3) {
      blocks.push({ kind: 'questoes', minutes: Math.min(left, 5), count: 1, title: '1 questão curta', reasons: ['fixação rápida'] })
    } else if (blocks.length === 0) {
      const top = i.ranked[0]
      blocks.push({ kind: 'teoria', minutes: left, topicId: top?.topicId, title: top ? `Leitura rápida: ${top.name}` : 'Leitura rápida', reasons: top?.reasons ?? [] })
    }
    return blocks
  }

  // Revisões: até ~35% do tempo.
  const maxReview = Math.floor((left * 0.35) / MIN_PER_CARD)
  const nRev = Math.min(i.dueCards, maxReview)
  if (nRev > 0) {
    const m = Math.ceil(nRev * MIN_PER_CARD)
    blocks.push({ kind: 'revisao', minutes: m, count: nRev, title: `Revisar ${nRev} card(s)`, reasons: ['revisões vencidas (fila limitada ao cap diário)'] })
    left -= m
  }

  // Redação (leve): 25 min só se couber e estiver na cadência.
  if (i.includeWriting && i.writingDue && left >= 45) {
    blocks.push({ kind: 'redacao', minutes: 25, title: 'Oficina de redação', reasons: ['cadência de redação'] })
    left -= 25
  }

  // Questões: ~25% do restante.
  const qMin = left >= 40 ? Math.round((left * 0.25) / 5) * 5 : 0
  left -= qMin

  // Teoria: reserva para assuntos novos + prioridade geral. Dedup por tópico.
  const used = new Set<string>()
  const theory: PlanBlock[] = []
  let theoryLeft = left
  const slot = theoryLeft >= 50 ? 25 : Math.max(10, theoryLeft)
  const newSlots = Math.max(i.untouched.length ? 1 : 0, Math.round((theoryLeft / slot) * i.minNewShare))
  let newTaken = 0
  for (const t of i.untouched) {
    if (newTaken >= newSlots || theoryLeft < 10) break
    if (used.has(t.topicId)) continue
    used.add(t.topicId)
    const m = Math.min(slot, theoryLeft)
    theory.push({ kind: 'teoria', minutes: m, topicId: t.topicId, title: `Novo: ${t.name}`, reasons: t.reasons })
    theoryLeft -= m
    newTaken++
  }
  for (const t of i.ranked) {
    if (theoryLeft < 10) break
    if (used.has(t.topicId)) continue
    used.add(t.topicId)
    const m = Math.min(slot, theoryLeft)
    theory.push({ kind: 'teoria', minutes: m, topicId: t.topicId, title: t.name, reasons: t.reasons })
    theoryLeft -= m
  }
  blocks.push(...theory)
  if (qMin > 0) {
    blocks.push({ kind: 'questoes', minutes: qMin, count: Math.max(1, Math.floor(qMin / 2.5)), title: `Resolver ~${Math.max(1, Math.floor(qMin / 2.5))} questões`, reasons: ['fixação com questões inéditas para você'] })
  }
  return blocks
}

/** Cadência automática de redação (editável): até jan/2027 a cada 21 dias; fev–mar 14; depois 7. */
export function writingIntervalDays(today: Date, cadence: string): number | null {
  switch (cadence) {
    case 'off':
      return null
    case 'weekly':
      return 7
    case 'biweekly':
      return 14
    case 'triweekly':
      return 21
    default: {
      const y = today.getFullYear()
      const m = today.getMonth() + 1
      if (y < 2027 || (y === 2027 && m === 1)) return 21
      if (y === 2027 && (m === 2 || m === 3)) return 14
      return 7
    }
  }
}

export function isWritingDue(today: Date, lastWriting: Date | null, cadence: string): boolean {
  const every = writingIntervalDays(today, cadence)
  if (every === null) return false
  if (!lastWriting) return true
  return differenceInCalendarDays(today, lastWriting) >= every
}
