import { Link } from 'react-router-dom'
import { Badge, Card, PageTitle, Progress } from '@/components/ui'
import { useCycles } from './useCycles'
import { CycleGate, linkClass, passageLabel } from './shared'
export default function StudyMap() {
  const d = useCycles()
  if (!d.plan || d.loading || d.cycleLoading || d.error || d.cycleError) return <CycleGate d={d} />
  const topicById = new Map(d.topics.map((t) => [t.id, t]))
  function root(id: string) {
    let t = topicById.get(id)
    const seen = new Set<string>()
    while (t?.parent_id && !seen.has(t.id)) {
      seen.add(t.id)
      t = topicById.get(t.parent_id)
    }
    return t
  }
  const roots = d.topics.filter((t) => !t.parent_id)
  return (
    <div className="space-y-4">
      <PageTitle
        title="Mapa de estudos"
        sub={`Passagem ${d.plan.passage_number} · ${passageLabel(d.plan.passage_number)} · sequência contínua, sem dias fixos`}
        action={
          <Link className={linkClass} to="/plano">
            Editar sequência
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {roots.map((subject) => {
          const leaves = d.leaves.filter((t) => root(t.id)?.id === subject.id)
          return (
            <Card key={subject.id} className="space-y-2">
              <h2 className="font-semibold">{subject.name}</h2>
              {[1, 2, 3].map((n) => {
                const done = leaves.filter((t) =>
                  d.stages.some(
                    (s) =>
                      s.topic_id === t.id && s.passage_number === n && s.status === 'completed',
                  ),
                ).length
                return (
                  <div key={n}>
                    <p className="mb-1 text-sm text-muted">
                      Passagem {n}: {done}/{leaves.length} assuntos
                    </p>
                    <Progress
                      label={`${subject.name} passagem ${n}`}
                      value={leaves.length ? done / leaves.length : 0}
                    />
                  </div>
                )
              })}
            </Card>
          )
        })}
      </div>
      <Card>
        <ol className="space-y-3">
          {d.items.map((item, index) => {
            const stage = d.stages.find(
              (s) => s.topic_id === item.topic_id && s.passage_number === d.plan!.passage_number,
            )
            const studied = d
              .cycleData!.sessions.filter(
                (s) =>
                  s.item_id === item.id &&
                  s.passage_number === d.plan!.passage_number &&
                  s.state === 'finished',
              )
              .reduce((n, s) => n + s.elapsed_seconds / 60, 0)
            return (
              <li
                key={item.id}
                className={`rounded-xl border p-4 ${d.next?.id === item.id ? 'border-sea bg-sea/5' : 'border-line'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">
                      {String(index + 1).padStart(2, '0')} · {root(item.topic_id)?.name}
                    </p>
                    <h2 className="font-medium">{topicById.get(item.topic_id)?.name}</h2>
                  </div>
                  <Badge
                    tone={
                      stage?.status === 'completed'
                        ? 'ok'
                        : item.paused
                          ? 'warn'
                          : d.next?.id === item.id
                            ? 'sea'
                            : 'neutral'
                    }
                  >
                    {stage?.status === 'completed'
                      ? 'Concluído'
                      : item.paused
                        ? 'Pausado'
                        : item.skipped_on === d.localDate
                          ? 'Pulado hoje'
                          : d.next?.id === item.id
                            ? 'Próximo'
                            : stage
                              ? 'Em andamento'
                              : 'Pendente'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Passagem {d.plan!.passage_number} · {Math.round(studied)} min registrados ·
                  orçamento {item.budget_minutes} min · saldo estimado{' '}
                  {Math.max(0, Math.round(item.budget_minutes - studied))} min
                </p>
                <p className="text-xs text-muted">
                  A conclusão depende dos objetivos confirmados. A data depende das sessões
                  efetivamente realizadas.
                </p>
                <div className="mt-3 flex gap-3 text-sm">
                  {stage?.status !== 'completed' && !item.paused && (
                    <Link className="text-sea underline" to={`/sessao?item=${item.id}`}>
                      Estudar este assunto
                    </Link>
                  )}
                  <Link className="text-sea underline" to={`/passagens?topico=${item.topic_id}`}>
                    Ver evidências
                  </Link>
                  <Link className="text-sea underline" to={`/edital/${item.topic_id}`}>
                    Anotações
                  </Link>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
