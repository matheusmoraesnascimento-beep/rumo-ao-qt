import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Empty, ErrorBox, PageTitle, Select, Spinner, Stat } from '@/components/ui'
import {
  calculateAdherence,
  localStudyDate,
  computeSelfAssessedMetrics,
  computeVerifiedMetrics,
} from '@/lib/cycles'
import { fmtPct } from '@/lib/metrics'
import { useCycles } from './useCycles'
import { cyclePreferences } from './CycleToday'
import { linkClass } from './shared'
export default function Performance() {
  const d = useCycles(),
    [days, setDays] = useState(30)
  if (d.loading || d.cycleLoading) return <Spinner />
  if (d.error || d.cycleError) return <ErrorBox error={d.error || d.cycleError} />
  const from = new Date(Date.now() - days * 86400000).toISOString()
  const prefs = cyclePreferences(d)
  const options = {
    from,
    minDistinctQuestions: prefs.minVerifiedSample,
    lowPerformanceThreshold: prefs.verifiedLowPerformanceThreshold,
  }
  const verified = computeVerifiedMetrics(d.attempts, options),
    self = computeSelfAssessedMetrics(d.attempts, options)
  const sessions = d.sessions.filter((s) => s.started_at >= from && Number(s.duration_minutes) > 0)
  const topicById = new Map(d.topics.map((t) => [t.id, t]))
  const subjectId = (id: string) => {
    let t = topicById.get(id)
    const seen = new Set<string>()
    while (t?.parent_id && !seen.has(t.id)) {
      seen.add(t.id)
      t = topicById.get(t.parent_id)
    }
    return t?.id
  }
  const scoped = d.plan
    ? d.leaves
    : d.topics.filter((t) => !d.topics.some((c) => c.parent_id === t.id))
  const roots = d.topics.filter(
    (t) => !t.parent_id && (!d.plan || t.syllabus_version_id === d.plan.syllabus_version_id),
  )
  const adherence = calculateAdherence({
    sessions: d.sessions,
    fromDate: localStudyDate(from, prefs.timezone),
    toDate: d.localDate,
    asOf: new Date(),
    preferences: prefs,
    exceptions: [
      ...new Map([
        ...d.blocked.map((b) => [b.day, { localDate: b.day, minutes: 0 }] as const),
        ...Object.entries(d.plan?.exceptions ?? {}).map(
          ([localDate, x]) => [localDate, { localDate, minutes: x.minutes }] as const,
        ),
      ]).values(),
    ],
  })
  const unmapped = d.attempts.filter(
    (a) => a.created_at >= from && !d.uqt.some((u) => u.question_id === a.question_id),
  ).length
  return (
    <div className="space-y-4">
      <PageTitle
        title="Desempenho"
        sub="Gabarito validado e autoavaliação em medidas separadas. Sem previsão de aprovação."
        action={
          <Select
            aria-label="Período de análise"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90, 365].map((n) => (
              <option key={n} value={n}>
                Últimos {n} dias
              </option>
            ))}
          </Select>
        }
      />
      <p className="text-sm text-muted">
        Período: {from.slice(0, 10)} a {d.localDate} · diagnóstico forte exige{' '}
        {prefs.minVerifiedSample} questões distintas verificadas · alerta abaixo de{' '}
        {Math.round(prefs.verifiedLowPerformanceThreshold * 100)}%.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Acerto verificado"
          value={fmtPct(verified.rate)}
          sub={`${verified.correct}/${verified.classifiedAttempts} tentativas · ${verified.distinctQuestions} distintas · ${verified.sampleLevel}`}
        />
        <Stat
          label="Acerto autodeclarado"
          value={fmtPct(self.rate)}
          sub={`${self.correct}/${self.classifiedAttempts} autoavaliações · fonte pessoal`}
        />
        <Stat
          label="Tentativas / questões únicas"
          value={`${verified.totalAttempts} / ${verified.uniqueQuestionsAttempted}`}
          sub="Repetir não aumenta a amostra distinta"
        />
        <Stat
          label="Horas líquidas"
          value={`${(sessions.reduce((n, s) => n + Number(s.duration_minutes), 0) / 60).toFixed(1)} h`}
          sub="Sessões efetivamente salvas"
        />
      </div>
      <Card className="space-y-2">
        <h2 className="font-semibold">Constância e aderência</h2>
        <p className="text-sm">
          {adherence.calendarStreak} dias seguidos · melhor sequência{' '}
          {adherence.longestCalendarStreak} dias · aderência {fmtPct(adherence.adherence)} (
          {adherence.studiedPlannedDays}/{adherence.plannedDays} dias planejados).
        </p>
        <p className="text-xs text-muted">
          Constância considera datas locais com sessão válida. Aderência considera apenas dias com
          disponibilidade positiva, incluindo exceções. Não há estudo fictício para preencher
          lacunas.
        </p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Diagnóstico por matéria</h2>
        {roots.length ? (
          roots.map((root) => {
            const leaves = scoped.filter((t) => subjectId(t.id) === root.id)
            const ids = new Set(
              d.uqt
                .filter((u) => leaves.some((t) => t.id === u.topic_id))
                .map((u) => u.question_id),
            )
            const attempts = d.attempts.filter((a) => ids.has(a.question_id))
            const v = computeVerifiedMetrics(attempts, options),
              s = computeSelfAssessedMetrics(attempts, options)
            const covered = leaves.filter((t) =>
              d.stages.some(
                (p) => p.topic_id === t.id && p.passage_number === 1 && p.status === 'completed',
              ),
            ).length
            return (
              <div key={root.id} className="rounded-lg border border-line p-3">
                <h3 className="font-medium">{root.name}</h3>
                <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <p>
                    Verificado: {fmtPct(v.rate)} · {v.correct}/{v.classifiedAttempts} ·{' '}
                    {v.distinctQuestions} distintas
                  </p>
                  <p>
                    Autodeclarado: {fmtPct(s.rate)} · {s.classifiedAttempts} classificadas
                  </p>
                  <p>
                    {v.totalAttempts} tentativas · {v.uniqueQuestionsAttempted} questões únicas
                  </p>
                  <p>
                    1ª passagem: {covered}/{leaves.length} assuntos
                  </p>
                </div>
                <p className={`mt-2 text-sm ${v.lowPerformance ? 'text-warn' : 'text-muted'}`}>
                  {v.lowPerformance
                    ? 'Reforço recomendado: desempenho verificado abaixo do limiar configurado.'
                    : v.sampleLevel === 'suficiente'
                      ? 'Amostra suficiente nesta janela.'
                      : 'Diagnóstico pendente: amostra insuficiente ou sem gabarito validado.'}
                </p>
              </div>
            )
          })
        ) : (
          <Empty>Não há matérias para a versão selecionada.</Empty>
        )}
        <p className="text-xs text-muted">
          Questões associadas a várias matérias aparecem em cada matéria, uma vez por questão na
          amostra distinta. O agregado global deduplica por ID.
        </p>
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Dados sem vínculo e qualidade</h2>
        <p className="text-sm">
          {unmapped} tentativas sem tópico classificado no período. Elas continuam no agregado
          global; não recebem matéria por inferência.
        </p>
        <Link className={linkClass} to="/questoes/classificar">
          Classificar questões
        </Link>
        <p className="text-xs text-muted">
          Consultas do histórico legado possuem limites de paginação; indicadores descrevem os
          registros carregados. Nenhuma resposta sem gabarito é convertida em acerto verificado.
        </p>
      </Card>
    </div>
  )
}
