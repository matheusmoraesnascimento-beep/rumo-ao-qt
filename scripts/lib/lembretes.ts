export interface DueRow { sub_id: string; endpoint: string; p256dh: string; auth: string; due_count: number; kind: 'revisoes' | 'estudo' }
export interface PushMessage { title: string; body: string; url: string; tag: string }

/** Texto do lembrete. Tom neutro, sem culpa; links relativos ao escopo do app (resolvidos pelo service worker). */
export function buildMessage(row: Pick<DueRow, 'kind' | 'due_count'>): PushMessage {
  if (row.kind === 'revisoes' && row.due_count > 0) {
    const n = row.due_count
    const min = Math.min(30, Math.max(2, Math.ceil(n * 1.5)))
    return {
      title: 'Rumo ao QT',
      body: `Você tem ${n} ${n === 1 ? 'revisão vencida' : 'revisões vencidas'}. Leva uns ${min} min.`,
      url: './#/revisoes',
      tag: 'lembrete-diario',
    }
  }
  return {
    title: 'Rumo ao QT',
    body: 'Que tal 25 minutos de estudo hoje? Uma sessão curta já mantém o ritmo.',
    url: './#/agenda?iniciar=25',
    tag: 'lembrete-diario',
  }
}

/** Códigos do serviço de push que indicam inscrição morta (remover do banco). */
export const isGone = (statusCode?: number) => statusCode === 404 || statusCode === 410
