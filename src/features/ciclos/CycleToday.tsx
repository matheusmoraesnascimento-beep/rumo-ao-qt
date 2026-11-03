import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, PageTitle, Progress, Stat } from '@/components/ui'
import {
  defaultPlanPreferences,
  generateDailyStudyQueue,
  rankTopicPriorities,
  type CycleItem,
  type StudyPlanPreferences,
} from '@/lib/cycles'
import { computeVerifiedMetrics } from '@/lib/cycles'
import { weekdayKey, errMsg } from '@/lib/utils'
import { useCycles, type CyclesContext } from './useCycles'
import { CycleGate, passageLabel, linkClass } from './shared'
import { useIdempotentCommand, useRefreshCycles } from './api'

export function cyclePreferences(d: CyclesContext): StudyPlanPreferences {
  const p = d.plan?.preferences ?? {}
  return defaultPlanPreferences({
    timezone: d.profile?.timezone,
    weeklyAvailabilityMinutes: Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k, i) => [
        i + 1,
        d.settings?.weekly_availability[k],
      ]),
    ),
    examDate: d.settings?.exam_date,
    targetCorrectAnswers: d.settings?.goal_correct,
    reviewCap: d.settings?.daily_review_cap,
    minVerifiedSample: Number(p.min_verified_sample ?? 10),
    verifiedLowPerformanceThreshold: Number(p.alert_threshold ?? 0.7),
    analysisWindowDays: Number(p.window_days ?? 30),
    weights: p.weights as StudyPlanPreferences['weights'] | undefined,
    timeShares: p.time_shares as StudyPlanPreferences['timeShares'] | undefined,
  })
}
export function domainItems(d: CyclesContext): CycleItem[] {
  return d.items.map((i) => ({
    id: i.id,
    topicId: i.topic_id,
    ordinal: i.ordinal,
    targetPassage: d.plan!.passage_number,
    estimatedMinutes: i.budget_minutes,
    paused: i.paused,
    syllabusVersionId: d.plan!.syllabus_version_id,
    studiedMinutes: (d.cycleData?.sessions ?? [])
      .filter(
        (s) =>
          s.item_id === i.id &&
          s.passage_number === d.plan!.passage_number &&
          s.state === 'finished',
      )
      .reduce((n, s) => n + s.elapsed_seconds / 60, 0),
  }))
}
export default function CycleToday() {
  const d = useCycles()
  const [minutes, setMinutes] = useState<number>()
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const refresh = useRefreshCycles()
  const command = useIdempotentCommand()
  if (!d.plan || d.loading || d.cycleLoading || d.error || d.cycleError) return <CycleGate d={d} />
  const prefs = cyclePreferences(d)
  prefs.reviewCap = Math.max(
    0,
    prefs.reviewCap -
      (d.reviewEvents ?? []).filter((e) => new Date(e.reviewed_at).getTime() <= Date.now()).length,
  )
  const available =
    minutes ??
    d.plan.exceptions[d.localDate]?.minutes ??
    (d.blocked.some((b) => b.day === d.localDate)
      ? 0
      : (d.settings?.weekly_availability[weekdayKey(d.localDate)] ?? 0))
  const since = new Date(Date.now() - prefs.analysisWindowDays * 86400000).toISOString()
  const priorities = rankTopicPriorities(
    d.items.map((i) => {
      const ids = new Set(d.uqt.filter((x) => x.topic_id === i.topic_id).map((x) => x.question_id))
      const metrics = computeVerifiedMetrics(
        d.attempts.filter((a) => ids.has(a.question_id)),
        { from: since },
      )
      const last = d.sessions
        .filter((s) => s.topic_id === i.topic_id && Number(s.duration_minutes) > 0)
        .map((s) => s.started_at)
        .sort()
        .at(-1)
      const cards = d.cards.filter(
        (c) => c.topic_id === i.topic_id && new Date(c.due_at).getTime() <= Date.now(),
      )
      return {
        topicId: i.topic_id,
        cycleOrdinal: i.ordinal,
        overdueDays: Math.max(
          0,
          ...cards.map((c) => (Date.now() - new Date(c.due_at).getTime()) / 86400000),
        ),
        coverageGap: d.stages.some(
          (s) => s.topic_id === i.topic_id && s.passage_number === 1 && s.status === 'completed',
        )
          ? 0
          : 1,
        daysSinceContact: last
          ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
          : null,
        manualWeight: i.manual_weight,
        verifiedRate: metrics.rate,
        verifiedDistinctQuestions: metrics.distinctQuestions,
      }
    }),
    prefs,
  )
  const eligible = d.questions
    .filter((q) => !q.annulled && !d.attempts.some((a) => a.question_id === q.id))
    .flatMap((q) =>
      d.uqt
        .filter((u) => u.question_id === q.id && d.leaves.some((t) => t.id === u.topic_id))
        .map((u) => ({ id: q.id, topicId: u.topic_id })),
    )
  const queue = generateDailyStudyQueue(
    {
      now: new Date(),
      preferences: prefs,
      cycleItems: domainItems(d),
      currentItemId: d.plan.current_item_id,
      passageStates: d.stages.map((s) => ({
        topicId: s.topic_id,
        passageNumber: s.passage_number,
        status: s.status,
        syllabusVersionId: s.syllabus_version_id,
      })),
      skippedItemIds: d.items.filter((i) => i.skipped_on === d.localDate).map((i) => i.id),
      dueCards: d.cards,
      questions: eligible,
      priorities,
    },
    available,
  )
  const completed = d.leaves.filter((t) =>
    d.stages.some((s) => s.topic_id === t.id && s.passage_number === 1 && s.status === 'completed'),
  ).length
  const allComplete = d.items.every((i) =>
    d.stages.some(
      (s) =>
        s.topic_id === i.topic_id &&
        s.passage_number === d.plan!.passage_number &&
        s.status === 'completed',
    ),
  )
  const overdue = d.cards.filter((c) => new Date(c.due_at).getTime() <= Date.now()).length
  return (
    <div className="space-y-4">
      <PageTitle
        title="Hoje"
        sub={`${d.versions.data?.find((v) => v.id === d.plan!.syllabus_version_id)?.label} · referência provisória quando indicada no edital`}
        action={
          <Link className={linkClass} to="/plano">
            Meu plano
          </Link>
        }
      />
      <Card className="space-y-4 border-sea/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone="sea">Seu próximo estudo</Badge>
          <span className="text-sm text-muted">
            Passagem {d.plan.passage_number} · {passageLabel(d.plan.passage_number)}
          </span>
        </div>
        {d.running ? (
          <>
            <h2 className="text-2xl font-semibold">
              Uma sessão está {d.running.state === 'running' ? 'em andamento' : 'pausada'}.
            </h2>
            <p>{d.topics.find((t) => t.id === d.running!.topic_id)?.name}</p>
            <Link
              className="inline-flex rounded-lg bg-navy px-5 py-3 text-white dark:bg-sea dark:text-bg"
              to="/sessao"
            >
              Retomar sessão
            </Link>
          </>
        ) : d.next ? (
          <>
            <h2 className="text-2xl font-semibold">
              {d.topics.find((t) => t.id === d.next!.topic_id)?.name}
            </h2>
            <p className="text-muted">
              {priorities.find((p) => p.topicId === d.next!.topic_id)?.reasons.join(' · ')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex rounded-lg bg-navy px-5 py-3 text-white dark:bg-sea dark:text-bg"
                to={`/sessao?item=${d.next.id}`}
              >
                Iniciar sessão guiada
              </Link>
              <Link className={linkClass} to="/mapa">
                Ver sequência
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">
              {allComplete ? 'Passagem do ciclo concluída.' : 'Itens pausados ou pulados por hoje.'}
            </h2>
            <p className="text-sm text-muted">
              Pausas não concluem assuntos. Resolva as pendências no mapa antes da próxima passagem.
            </p>
            {allComplete && (
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await command('next_passage', {
                      plan_id: d.plan!.id,
                      expected_revision: d.plan!.revision,
                    })
                    await refresh()
                    setMessage('Próxima passagem aberta.')
                  } catch (e) {
                    setMessage(errMsg(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Abrir próxima passagem
              </Button>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="1ª passagem confirmada"
          value={`${completed}/${d.leaves.length}`}
          sub="Separada do progresso legado do Edital"
        />
        <Stat label="Revisões devidas" value={overdue} sub="Assuntos e cards existentes" />
        <Stat
          label="Tempo de hoje"
          value={`${available} min`}
          sub="Disponibilidade, não horas estudadas"
        />
        <Stat
          label="Meta de acertos"
          value={`${d.settings?.goal_correct ?? 40}/50`}
          sub={`Base histórica declarada 2026: ${d.settings?.baseline_2026 ?? 21}/50`}
        />
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Roteiro de hoje</h2>
          <div className="flex flex-wrap gap-1">
            {[0, 15, 25, 45, 60, 90, 120].map((n) => (
              <button
                key={n}
                className={`rounded-full border px-3 py-1 text-sm ${available === n ? 'border-sea bg-sea/10' : 'border-line'}`}
                aria-pressed={available === n}
                onClick={() => setMinutes(n)}
              >
                {n} min
              </button>
            ))}
            {minutes !== undefined && (
              <button className="text-sm text-sea underline" onClick={() => setMinutes(undefined)}>
                Usar agenda
              </button>
            )}
          </div>
        </div>
        {available === 0 && (
          <p className="text-muted">
            Sem estudo planejado hoje. A fila fica guardada e o cursor continua no mesmo lugar.
          </p>
        )}
        {queue.recommendations.map((r, i) => (
          <div key={`${r.kind}-${i}`} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {
                  {
                    cycle: 'Avançar no ciclo',
                    revision: 'Revisar no ChatGPT',
                    questions: 'Treinar questões',
                    error_review: 'Analisar erros',
                  }[r.kind]
                }
                {r.topicId
                  ? ` · ${d.topics.find((t) => t.id === r.topicId)?.name ?? 'assunto'}`
                  : ''}
              </h3>
              <Badge>{r.durationMinutes} min</Badge>
            </div>
            <p className="my-2 text-sm text-muted">{r.reasons.join(' · ')}</p>
            <Link
              className="text-sm font-medium text-sea underline"
              to={
                r.kind === 'cycle'
                  ? `/sessao?item=${r.cycleItemId}`
                  : r.kind === 'revision'
                    ? '/revisoes'
                    : `/questoes${r.topicId ? `?topico=${r.topicId}` : ''}`
              }
            >
              {r.kind === 'revision' ? 'Ver assunto, roteiro e próxima data' : 'Começar este bloco'}
            </Link>
          </div>
        ))}
        {queue.reviewBacklog > 0 && (
          <p className="text-sm text-muted">
            {queue.reviewBacklog} revisões além da capacidade de hoje; nenhuma cópia foi criada.
          </p>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Cobertura por passagens</h2>
        <Progress
          value={d.leaves.length ? completed / d.leaves.length : 0}
          label="Cobertura primeira passagem"
        />
        <div className="flex flex-wrap gap-3">
          <Link className={linkClass} to="/passagens">
            Acompanhar evidências
          </Link>
          <Link className={linkClass} to="/analise">
            Ver desempenho
          </Link>
          <Link className={linkClass} to="/agenda">
            Histórico e agenda
          </Link>
        </div>
      </Card>
    </div>
  )
}
