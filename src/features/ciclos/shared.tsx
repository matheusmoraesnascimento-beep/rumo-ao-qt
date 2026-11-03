import { Link } from 'react-router-dom'
import { Badge, Card, ErrorBox, Spinner } from '@/components/ui'
import { fmtDate } from '@/lib/utils'
import type { CyclesContext } from './useCycles'
export function CycleGate({ d }: { d: CyclesContext }) {
  if (d.loading || d.cycleLoading) return <Spinner />
  if (d.error || d.cycleError)
    return (
      <ErrorBox
        error={d.error || d.cycleError}
        retry={() => {
          d.refetch()
          void d.cycleQuery.refetch()
        }}
      />
    )
  const due = d.cards.filter((c) => new Date(c.due_at).getTime() <= Date.now())
  const next = [...d.cards].sort((a, b) => a.due_at.localeCompare(b.due_at))[0]
  return (
    <div className="space-y-4">
      <Card className="space-y-3 border-sea/40">
        <Badge tone="sea">Revisão com ChatGPT</Badge>
        <h2 className="text-xl font-semibold">
          {due.length
            ? `${due.length} revisões para retomar`
            : next
              ? `Próxima revisão: ${fmtDate(next.due_at)}`
              : 'Seu roteiro de revisões por assunto'}
        </h2>
        <p className="text-sm text-muted">
          {due[0]?.topic_id
            ? d.topics.find((t) => t.id === due[0].topic_id)?.name
            : 'Veja o que revisar, quando e por quê. Copie o roteiro, revise no ChatGPT e registre sua dificuldade ao voltar.'}
        </p>
        <Link
          className="inline-flex rounded-lg bg-navy px-4 py-2 text-white dark:bg-sea dark:text-bg"
          to="/revisoes"
        >
          Ver assuntos e roteiro de revisão
        </Link>
      </Card>
      <Card className="space-y-3">
        <Badge tone="sea">Ciclos e Passagens</Badge>
        <h1 className="text-2xl font-semibold">Seu próximo passo começa com um plano.</h1>
        <p className="text-muted">
          Organize todos os assuntos do edital em uma sequência contínua. Sessões, revisões e
          progresso anteriores continuam disponíveis.
        </p>
        {d.cycleData?.available === false ? (
          <p role="status" className="text-sm text-warn">
            A atualização do banco ainda não foi aplicada neste ambiente. Você pode pré-visualizar o
            plano; a ativação será liberada após a migração segura.
          </p>
        ) : (
          <p className="text-sm">Nenhum plano de ciclos foi ativado nesta conta.</p>
        )}
        <Link
          to="/plano"
          className="inline-block rounded-lg bg-navy px-4 py-2 text-white dark:bg-sea dark:text-bg"
        >
          Pré-visualizar meu plano
        </Link>
        <div className="flex gap-4 text-sm">
          <Link to="/agenda" className="text-sea underline">
            Agenda e histórico
          </Link>
          <Link to="/edital" className="text-sea underline">
            Continuar no edital
          </Link>
        </div>
      </Card>
    </div>
  )
}
export const passageLabel = (n: number) =>
  n === 1 ? 'Compreensão' : n === 2 ? 'Fixação' : n === 3 ? 'Consolidação' : 'Manutenção'
export const linkClass =
  'inline-flex items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-line/40'
