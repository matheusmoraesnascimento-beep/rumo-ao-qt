import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { Badge, Button, Card, ErrorBox, Spinner } from '@/components/ui'
import { getQuestionsByIds, getSimAttempts, getSimulation, patchSimulation, upsertSimAttempt } from '@/lib/api'
import { qk, useExams } from '@/lib/queries'
import { summarizeSimulation } from '@/lib/simulado'
import { errMsg } from '@/lib/utils'
import { QuestionView } from '@/features/questoes/QuestionView'
import { AnswerPanel, type AnswerState } from '@/features/questoes/AnswerPanel'
import type { Question, SelfGrade } from '@/types/db'

const hhmmss = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function SimuladoRun() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const exams = useExams()
  const sim = useQuery({ queryKey: ['sim', id], queryFn: () => getSimulation(id) })
  const questions = useQuery({ queryKey: ['sim-q', id], enabled: !!sim.data, queryFn: () => getQuestionsByIds(sim.data!.question_ids), staleTime: Infinity })
  const attempts = useQuery({ queryKey: ['sim-a', id], queryFn: () => getSimAttempts(id) })

  const [ans, setAns] = useState<Record<string, AnswerState>>({})
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [cur, setCur] = useState(0)
  const [phase, setPhase] = useState<'run' | 'review'>('run')
  const [elapsed, setElapsed] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [saveState, setSaveState] = useState<'ok' | 'saving' | 'err'>('ok')
  const hydrated = useRef(false)
  const loadedAt = useRef(0)
  const base = useRef(0)
  const qStart = useRef(Date.now())

  // Retomada após refresh: hidrata respostas, marcações e tempo a partir do banco.
  useEffect(() => {
    if (hydrated.current || !sim.data || !attempts.data) return
    hydrated.current = true
    setAns(Object.fromEntries(attempts.data.map((a) => [a.question_id, { selected: a.selected_option, selfGrade: a.self_grade, confidence: a.confidence }])))
    setMarked(new Set(sim.data.marked))
    base.current = sim.data.elapsed_seconds
    loadedAt.current = Date.now()
    setElapsed(sim.data.elapsed_seconds)
  }, [sim.data, attempts.data])

  const finished = sim.data?.status === 'finalizado'
  useEffect(() => {
    if (finished || !hydrated.current) return
    const i = setInterval(() => setElapsed(base.current + Math.round((Date.now() - loadedAt.current) / 1000)), 1000)
    return () => clearInterval(i)
  }, [finished, sim.data])

  // Persistência periódica do cronômetro.
  const elapsedRef = useRef(0)
  elapsedRef.current = elapsed
  useEffect(() => {
    if (finished || !sim.data) return
    const i = setInterval(() => { if (hydrated.current) patchSimulation(id, { elapsed_seconds: elapsedRef.current }).catch(() => undefined) }, 15000)
    return () => clearInterval(i)
  }, [finished, sim.data, id])

  const ordered: Question[] = useMemo(() => {
    const m = new Map((questions.data ?? []).map((q) => [q.id, q]))
    return (sim.data?.question_ids ?? []).map((i) => m.get(i)).filter(Boolean) as Question[]
  }, [questions.data, sim.data])

  const persist = useCallback(async (qid: string, v: AnswerState) => {
    setSaveState('saving')
    try {
      await upsertSimAttempt({ simulation_id: id, question_id: qid, selected_option: v.selected, self_grade: v.selfGrade, confidence: v.confidence, time_seconds: Math.min(86400, Math.round((Date.now() - qStart.current) / 1000)) })
      setSaveState('ok')
    } catch (e) { setSaveState('err'); setMsg({ ok: false, t: `Não salvou: ${errMsg(e)}` }) }
  }, [id])

  if (sim.isLoading || questions.isLoading || attempts.isLoading || !hydrated.current && sim.data) return <Spinner />
  if (sim.error || !sim.data) return <ErrorBox error={sim.error ?? 'Simulado não encontrado'} retry={() => sim.refetch()} />
  if (questions.error) return <ErrorBox error={questions.error} />
  const s = sim.data
  const year = exams.data?.find((e) => e.id === s.exam_id)?.year
  const q = ordered[cur]
  const answeredIds = ordered.filter((o) => ans[o.id]?.selected).map((o) => o.id)
  const left = s.time_limit_seconds ? s.time_limit_seconds - elapsed : null

  function change(v: AnswerState) { if (!q || finished) return; setAns((p) => ({ ...p, [q.id]: v })); persist(q.id, v) }
  async function toggleMark() {
    if (!q) return
    const n = new Set(marked); if (n.has(q.id)) n.delete(q.id); else n.add(q.id)
    setMarked(n)
    try { await patchSimulation(id, { marked: [...n] }) } catch (e) { setMsg({ ok: false, t: errMsg(e) }) }
  }
  const goto = (i: number) => { setCur(i); qStart.current = Date.now() }
  async function finish() {
    try {
      await patchSimulation(id, { status: 'finalizado', finished_at: new Date().toISOString(), duration_seconds: elapsed, elapsed_seconds: elapsed })
      await Promise.all([qc.invalidateQueries({ queryKey: ['sim', id] }), qc.invalidateQueries({ queryKey: qk.sims }), qc.invalidateQueries({ queryKey: qk.attempts })])
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) }
  }

  if (finished) {
    const r = summarizeSimulation(s.question_ids, ordered.map((o) => ({ questionId: o.id, selected: ans[o.id]?.selected, selfGrade: ans[o.id]?.selfGrade as SelfGrade | null })))
    return (
      <div className="space-y-4">
        <Link to="/simulados" className="text-sm text-sea underline">← Simulados</Link>
        <Card className="space-y-2">
          <h1 className="text-xl font-semibold">Resultado {s.mode === 'year' ? `da prova ${year}` : `do simulado misto (${s.seed})`}</h1>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Respondidas</dt><dd className="text-2xl font-semibold">{r.answered}/50</dd></div>
            <div><dt className="text-xs text-muted">Em branco</dt><dd className="text-2xl font-semibold">{r.unanswered}</dd></div>
            <div><dt className="text-xs text-muted">Autodeclarado</dt><dd className="text-2xl font-semibold">{r.selfScore === null ? '—' : `${r.selfCorrect}/${r.selfCorrect + r.selfWrong}`}</dd><dd className="text-xs text-muted">acertei/avaliadas ({r.selfDeclared} avaliadas)</dd></div>
            <div><dt className="text-xs text-muted">Pontuação verificada</dt><dd className="text-2xl font-semibold">N/A</dd><dd className="text-xs text-muted">sem gabarito validado</dd></div>
          </dl>
          <p className="text-sm text-muted">Não é nota oficial. Tempo: {hhmmss(s.duration_seconds ?? s.elapsed_seconds)}.</p>
        </Card>
      </div>
    )
  }

  if (phase === 'review') {
    const blank = ordered.map((o, i) => ({ o, i })).filter(({ o }) => !ans[o.id]?.selected)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Revisão antes de finalizar</h1>
        <Card className="space-y-2">
          <p>Respondidas: <strong>{answeredIds.length}/50</strong> · Em branco: <strong>{blank.length}</strong> · Marcadas para revisar: <strong>{marked.size}</strong></p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {ordered.map((o, i) => (
              <button key={o.id} onClick={() => { goto(i); setPhase('run') }} className={`rounded-lg border p-2 text-sm ${ans[o.id]?.selected ? 'border-sea bg-sea/15' : 'border-line'} ${marked.has(o.id) ? 'ring-2 ring-warn' : ''}`} aria-label={`Questão ${i + 1}${ans[o.id]?.selected ? ' respondida' : ' em branco'}${marked.has(o.id) ? ', marcada' : ''}`}>{i + 1}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPhase('run')}>Voltar às questões</Button>
            <Button variant="danger" onClick={() => { if (window.confirm(`Finalizar com ${blank.length} questão(ões) em branco? Esta ação encerra o simulado.`)) finish() }}>Finalizar simulado</Button>
          </div>
          {msg && <p role="alert" className="text-sm text-bad">{msg.t}</p>}
        </Card>
      </div>
    )
  }

  const a = ans[q.id] ?? { selected: null, selfGrade: null, confidence: null }
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-2 text-sm">
        <span>{s.mode === 'year' ? `Prova ${year}` : 'Misto'} · Q {cur + 1}/50</span>
        <span className="tabular-nums" aria-label="Tempo">{left !== null ? (left >= 0 ? `Resta ${hhmmss(left)}` : `Tempo esgotado +${hhmmss(-left)}`) : `Decorrido ${hhmmss(elapsed)}`}</span>
        <span className="flex items-center gap-2"><Badge tone={saveState === 'ok' ? 'ok' : saveState === 'saving' ? 'warn' : 'bad'}>{saveState === 'ok' ? 'salvo' : saveState === 'saving' ? 'salvando…' : 'erro ao salvar'}</Badge><span>{answeredIds.length}/50 respondidas</span></span>
      </div>
      <Card><QuestionView q={q} exam={year} /></Card>
      <Card className="space-y-3">
        <AnswerPanel value={a} onChange={change} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={toggleMark} aria-pressed={marked.has(q.id)}><Flag className="size-4" /> {marked.has(q.id) ? 'Marcada para revisar' : 'Revisar depois'}</Button>
          <Button variant="secondary" size="sm" disabled={cur === 0} onClick={() => goto(cur - 1)}>Anterior</Button>
          <Button variant="secondary" size="sm" disabled={cur === ordered.length - 1} onClick={() => goto(cur + 1)}>Próxima</Button>
          <Button size="sm" onClick={() => setPhase('review')}>Revisar e finalizar</Button>
        </div>
        {msg && <p role="alert" className="text-sm text-bad">{msg.t}</p>}
      </Card>
      <Card className="p-2">
        <div className="grid grid-cols-10 gap-1">
          {ordered.map((o, i) => (
            <button key={o.id} onClick={() => goto(i)} aria-label={`Ir para questão ${i + 1}`} aria-current={i === cur} className={`rounded p-1 text-xs ${i === cur ? 'bg-navy text-white dark:bg-sea dark:text-[#06101f]' : ans[o.id]?.selected ? 'bg-sea/25' : 'bg-line/50'} ${marked.has(o.id) ? 'ring-2 ring-warn' : ''}`}>{i + 1}</button>
          ))}
        </div>
      </Card>
    </div>
  )
}
