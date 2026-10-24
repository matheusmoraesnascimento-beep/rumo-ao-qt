import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, ErrorBox, PageTitle, Progress, Spinner, Stat } from '@/components/ui'
import { useSimulations } from '@/lib/queries'
import { getSimAttempts } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { daysUntil } from '@/lib/metrics'
import { fmtDate } from '@/lib/utils'
import { useDerived, useStudyData } from './usePlan'

const TIMES = [15, 25, 45, 60, 120]
const KIND_LABEL = { revisao: 'Revisão', teoria: 'Teoria', questoes: 'Questões', redacao: 'Redação' } as const

export default function Dashboard() {
  const d = useStudyData()
  const [minutes, setMinutes] = useState<number | undefined>()
  const x = useDerived(d, minutes)
  const sims = useSimulations()
  const simPoints = useQuery({
    queryKey: ['sim-self-scores', sims.data?.map((s) => s.id).join(',')],
    enabled: !!sims.data?.length,
    queryFn: async () => {
      const done = (sims.data ?? []).filter((s) => s.status === 'finalizado').slice(0, 20).reverse()
      return Promise.all(done.map(async (s) => {
        const at = await getSimAttempts(s.id)
        const correct = at.filter((a) => a.self_grade === 'acertei').length
        const graded = at.filter((a) => a.self_grade === 'acertei' || a.self_grade === 'errei').length
        return { data: fmtDate(s.finished_at ?? s.started_at), acertos: graded ? correct : null }
      }))
    },
  })

  if (d.loading) return <Spinner />
  if (d.error) return <ErrorBox error={d.error} retry={d.refetch} />
  const s = d.settings!
  const dias = daysUntil(s.exam_date)
  const lastSession = d.sessions[0]
  const weekAgo = Date.now() - 7 * 86400000
  const weekMin = d.sessions.filter((z) => new Date(z.started_at).getTime() >= weekAgo).reduce((t, z) => t + Number(z.duration_minutes), 0)
  const nextWriting = x.writingDue ? 'Hoje / pendente' : 'Em dia'
  const topicName = (id: string | null) => d.topics.find((t) => t.id === id)?.name

  return (
    <div className="space-y-4">
      <PageTitle title="O que faço hoje?" sub={x.isBlocked ? 'Dia bloqueado (viagem/plantão) — sem cobrança. Revisões continuam guardadas.' : undefined} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Dias até a prova" value={dias === null ? 'a confirmar' : dias} sub={s.exam_date ? fmtDate(s.exam_date + 'T12:00:00Z') : 'defina em Config'} />
        <Stat label="Base 2026 (declarada)" value={`${s.baseline_2026}/50`} sub={`Objetivo ${s.goal_correct}/50`} />
        <Stat label="Revisões vencidas" value={x.queue.length + x.backlog} sub={x.backlog ? `${x.backlog} além do limite diário` : undefined} />
        <Stat label="Estudo na semana" value={`${Math.round(weekMin)} min`} sub={lastSession ? `Última: ${fmtDate(lastSession.started_at)}` : 'Nenhuma sessão ainda'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/agenda?iniciar=25"><Button size="lg" className="w-full">Estudar 25 minutos</Button></Link>
        <Link to="/revisoes"><Button size="lg" variant="secondary" className="w-full">Revisar agora ({x.queue.length})</Button></Link>
        <Link to="/questoes?modo=ineditas"><Button size="lg" variant="secondary" className="w-full">Resolver questões</Button></Link>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Sugestão para hoje</h2>
          <span className="text-sm text-muted">Tempo:</span>
          {TIMES.map((t) => (
            <button key={t} onClick={() => setMinutes(t)} aria-pressed={x.minutes === t} className={`rounded-full border px-3 py-1 text-sm ${x.minutes === t ? 'border-navy bg-navy text-white dark:border-sea dark:bg-sea dark:text-[#06101f]' : 'border-line'}`}>{t} min</button>
          ))}
          {minutes !== undefined && <button className="text-sm text-sea underline" onClick={() => setMinutes(undefined)}>usar minha agenda ({x.avail} min)</button>}
        </div>
        {x.minutes > 0 && x.minutes <= 20 && x.queue.length > 0 && (
          <p className="font-medium">Você tem {x.minutes} min? Faça estas {Math.min(5, x.queue.length)} revisões.</p>
        )}
        {x.plan.length === 0 ? (
          <p className="text-sm text-muted">{x.isBlocked ? 'Descanse. Nada a recalcular com culpa.' : 'Sem tempo disponível configurado para hoje. Escolha um tempo acima ou ajuste a agenda.'}</p>
        ) : (
          <ul className="space-y-2">
            {x.plan.map((b, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{b.title}</span>
                  <span className="flex gap-2"><Badge tone="sea">{KIND_LABEL[b.kind]}</Badge><Badge>{b.minutes} min</Badge></span>
                </div>
                <details className="mt-1 text-sm text-muted">
                  <summary className="cursor-pointer">Por quê?</summary>
                  <p className="mt-1">{b.reasons.join('; ') || '—'}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Edital</h2>
          <Progress value={x.cov.pct} label="Progresso do edital" />
          <p className="text-sm text-muted">{x.cov.done}/{x.cov.total} assuntos iniciados · base provisória CP-T/2026</p>
          {x.weakest && (
            <p className="text-sm">Tópico mais fraco: <strong>{topicName(x.weakest.topicId)}</strong><br /><span className="text-muted">{x.weakest.reasons.join('; ')}</span></p>
          )}
          <p className="text-sm">Próxima redação: <strong>{nextWriting}</strong></p>
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">Evolução (simulados, autodeclarado)</h2>
          {simPoints.data?.some((p) => p.acertos !== null) ? (
            <div className="h-48" role="img" aria-label="Gráfico de acertos autodeclarados por simulado">
              <ResponsiveContainer>
                <LineChart data={simPoints.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <YAxis domain={[0, 50]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                  <Tooltip />
                  <ReferenceLine y={s.baseline_2026} stroke="var(--color-muted)" strokeDasharray="4 4" label={{ value: 'base 2026', fontSize: 10, fill: 'var(--color-muted)' }} />
                  <ReferenceLine y={s.goal_correct} stroke="var(--color-ok)" strokeDasharray="4 4" label={{ value: 'objetivo', fontSize: 10, fill: 'var(--color-ok)' }} />
                  <Line type="monotone" dataKey="acertos" stroke="var(--color-sea)" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted">Sem simulados finalizados com autoavaliação. A linha tracejada de {s.baseline_2026}/50 (2026) é só a base histórica declarada.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
