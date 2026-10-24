import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { useAttempts, useExams, useQuestionsLite, useSettings, useSimulations } from '@/lib/queries'
import { createSimulation } from '@/lib/api'
import { buildMixedSimulation, buildYearSimulation, GOALS } from '@/lib/simulado'
import { errMsg, fmtDateTime, uuid } from '@/lib/utils'

export default function Simulados() {
  const nav = useNavigate()
  const exams = useExams(), qs = useQuestionsLite(), sims = useSimulations(), settings = useSettings(), attempts = useAttempts()
  const [mode, setMode] = useState<'year' | 'mixed'>('year')
  const [year, setYear] = useState<number | ''>('')
  const [limit, setLimit] = useState('0')
  const [seed, setSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (exams.isLoading || qs.isLoading || sims.isLoading) return <Spinner />
  if (qs.error || sims.error) return <ErrorBox error={qs.error ?? sims.error} retry={() => { qs.refetch(); sims.refetch() }} />
  const yearOf = new Map((exams.data ?? []).map((e) => [e.id, e.year]))
  const bank = (qs.data ?? []).map((q) => ({ id: q.id, year: yearOf.get(q.exam_id) ?? NaN, number: q.number }))

  async function create() {
    setBusy(true); setMsg(null)
    try {
      const seconds = Number(limit) * 60 || null
      if (mode === 'year') {
        if (year === '') throw new Error('Escolha o ano da prova.')
        const picked = buildYearSimulation(bank, year)
        const exam = exams.data!.find((e) => e.year === year)!
        const s = await createSimulation({ mode: 'year', exam_id: exam.id, question_ids: picked.map((p) => p.id), time_limit_seconds: seconds })
        nav(`/simulados/${s.id}`)
      } else {
        const sd = seed.trim() || uuid().slice(0, 8)
        const seen = new Set((attempts.data ?? []).map((a) => a.question_id))
        const unseen = new Set(bank.filter((b) => !seen.has(b.id)).map((b) => b.id))
        const picked = buildMixedSimulation(bank, sd, unseen)
        const s = await createSimulation({ mode: 'mixed', seed: sd, question_ids: picked.map((p) => p.id), time_limit_seconds: seconds })
        nav(`/simulados/${s.id}`)
      }
    } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Simulados" sub="50 questões · conferência com o gabarito oficial ao finalizar; anuladas marcadas e fora da conta" />
      <Card className="space-y-3">
        <h2 className="font-semibold">Novo simulado</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Tipo"><Select value={mode} onChange={(e) => setMode(e.target.value as 'year' | 'mixed')}><option value="year">Prova de um ano (ordem original)</option><option value="mixed">Misto (50 de anos distintos)</option></Select></Field>
          {mode === 'year' ? (
            <Field label="Ano"><Select value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}><option value="">Escolha…</option>{(exams.data ?? []).map((e) => <option key={e.id}>{e.year}</option>)}</Select></Field>
          ) : (
            <Field label="Semente (opcional)" hint="Mesma semente = mesmo simulado"><Input value={seed} onChange={(e) => setSeed(e.target.value)} /></Field>
          )}
          <Field label="Cronômetro" hint="O tempo oficial depende do edital vigente">
            <Select value={limit} onChange={(e) => setLimit(e.target.value)}><option value="0">Sem limite</option><option value="180">3 h</option><option value="210">3 h 30</option><option value="240">4 h</option><option value="270">4 h 30</option></Select>
          </Field>
          <div className="flex items-end"><Button onClick={create} loading={busy} className="w-full">Começar</Button></div>
        </div>
        {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Histórico</h2>
        <p className="text-xs text-muted">Metas de estudo (não são notas de corte oficiais): {GOALS.join(' → ')} de 50 · seu objetivo: {settings.data?.goal_correct}/50</p>
        {!sims.data?.length ? <Empty>Nenhum simulado ainda.</Empty> : (
          <ul className="divide-y divide-line">
            {sims.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{s.mode === 'year' ? `Prova ${exams.data?.find((e) => e.id === s.exam_id)?.year ?? '—'}` : `Misto (semente ${s.seed})`}</div>
                  <div className="text-xs text-muted">{fmtDateTime(s.started_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.status === 'finalizado' ? 'ok' : 'warn'}>{s.status === 'finalizado' ? 'finalizado' : 'em andamento'}</Badge>
                  <Link to={`/simulados/${s.id}`}><Button size="sm" variant="secondary">{s.status === 'finalizado' ? 'Ver' : 'Retomar'}</Button></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
