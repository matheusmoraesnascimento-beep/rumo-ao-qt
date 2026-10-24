import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Pause, Play, Square, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { qk, useBlockedDays, useProgress, useSessions, useSettings, useTopics } from '@/lib/queries'
import { addSession, blockDay, deleteSession, saveSettings, unblockDay, upsertProgress } from '@/lib/api'
import { WEEKDAY_LABEL, errMsg, fmtDateTime, todayLocal } from '@/lib/utils'
import { safeMinutes } from '@/lib/metrics'
import { Checkin } from '@/features/estudos/Checkin'

interface TimerState { running: boolean; startedAt: number; accumulated: number; resumedAt: number | null; topicId: string }
const KEY = 'timer-v1'
const load = (): TimerState | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } }
const store = (s: TimerState | null) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* ok */ } }

function elapsedMs(t: TimerState, now = Date.now()) { return t.accumulated + (t.running && t.resumedAt ? now - t.resumedAt : 0) }
const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

function Timer() {
  const qc = useQueryClient()
  const topics = useTopics()
  const progress = useProgress()
  const [params] = useSearchParams()
  const [t, setT] = useState<TimerState | null>(load)
  const [, tick] = useState(0)
  const [topic, setTopic] = useState(t?.topicId ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const started = useRef(false)

  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i) }, [])
  const update = (n: TimerState | null) => { setT(n); store(n) }

  const parents = new Set((topics.data ?? []).map((x) => x.parent_id))
  const leaves = (topics.data ?? []).filter((x) => !parents.has(x.id))

  function start() {
    update({ running: true, startedAt: Date.now(), accumulated: 0, resumedAt: Date.now(), topicId: topic })
  }
  useEffect(() => { if (params.get('iniciar') && !started.current && !t) { started.current = true } }, [params, t])

  function pause() { if (t?.running) update({ ...t, running: false, accumulated: elapsedMs(t), resumedAt: null }) }
  function resume() { if (t && !t.running) update({ ...t, running: true, resumedAt: Date.now() }) }

  async function stop() {
    if (!t) return
    setSaving(true); setMsg(null)
    try {
      const ms = elapsedMs(t)
      const min = safeMinutes(0, ms)
      if (min <= 0) { update(null); setMsg({ ok: true, t: 'Nada a salvar (0 min).' }); return }
      const end = new Date(), start = new Date(end.getTime() - ms)
      await addSession({ topic_id: topic || t.topicId || null, started_at: start.toISOString(), ended_at: end.toISOString(), duration_minutes: min, kind: 'teoria', source: 'cronômetro' })
      if (topic || t.topicId) {
        const id = topic || t.topicId
        const prev = progress.data?.find((p) => p.topic_id === id)
        await upsertProgress({
          topic_id: id, status: prev && prev.status !== 'nao_iniciado' ? prev.status : 'estudando', confidence: prev?.confidence ?? 0,
          last_studied_at: end.toISOString(), first_studied_at: prev?.first_studied_at ?? end.toISOString(),
        })
      }
      update(null) // só limpa DEPOIS de salvar com sucesso
      await Promise.all([qk.sessions, qk.progress].map((k) => qc.invalidateQueries({ queryKey: k })))
      setMsg({ ok: true, t: `Sessão de ${min.toFixed(1)} min salva.` })
    } catch (e) { setMsg({ ok: false, t: `${errMsg(e)} — o tempo continua guardado, tente salvar de novo.` }) }
    finally { setSaving(false) }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Cronômetro de estudo</h2>
      <div className="text-4xl font-semibold tabular-nums" aria-live="off">{mmss(t ? elapsedMs(t) : 0)}</div>
      {!t ? (
        <>
          <Field label="Tópico (opcional)"><Select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">Sem tópico</option>{leaves.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Button onClick={start}><Play className="size-4" /> Iniciar{params.get('iniciar') ? ` (${params.get('iniciar')} min sugeridos)` : ''}</Button>
        </>
      ) : (
        <div className="flex gap-2">
          {t.running ? <Button variant="secondary" onClick={pause}><Pause className="size-4" /> Pausar</Button> : <Button onClick={resume}><Play className="size-4" /> Continuar</Button>}
          <Button variant="danger" onClick={stop} loading={saving}><Square className="size-4" /> Finalizar e salvar</Button>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.t}</p>}
    </Card>
  )
}

function Availability() {
  const { data: s } = useSettings()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)
  if (!s) return null
  async function set(day: string, v: number) {
    try { await saveSettings({ weekly_availability: { ...s!.weekly_availability, [day]: v } }); await qc.invalidateQueries({ queryKey: qk.settings }); setMsg(null) }
    catch (e) { setMsg(errMsg(e)) }
  }
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Disponibilidade semanal (min/dia)</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((d) => (
          <label key={d} className="text-sm">{WEEKDAY_LABEL[d]}
            <Select value={s.weekly_availability[d] ?? 0} onChange={(e) => set(d, Number(e.target.value))}>
              {[0, 15, 25, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m ? `${m} min` : 'livre'}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
    </Card>
  )
}

function Blocked() {
  const { data } = useBlockedDays()
  const qc = useQueryClient()
  const [day, setDay] = useState(todayLocal())
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const inv = () => qc.invalidateQueries({ queryKey: qk.blocked })
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Dias bloqueados (viagem / plantão)</h2>
      <p className="text-sm text-muted">Sem culpa: o plano do dia zera e as revisões vencidas continuam guardadas na fila.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Dia"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Plantão, viagem…" /></Field>
        <Button onClick={async () => { try { await blockDay(day, reason); setReason(''); setMsg(null); inv() } catch (e) { setMsg(errMsg(e)) } }}>Bloquear</Button>
      </div>
      {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
      <ul className="space-y-1 text-sm">
        {(data ?? []).filter((b) => b.day >= todayLocal()).map((b) => (
          <li key={b.day} className="flex items-center justify-between"><span>{b.day.split('-').reverse().join('/')} {b.reason && <span className="text-muted">— {b.reason}</span>}</span><Button size="sm" variant="ghost" onClick={async () => { await unblockDay(b.day); inv() }}>Remover</Button></li>
        ))}
      </ul>
    </Card>
  )
}

export default function Agenda() {
  const sessions = useSessions(), topics = useTopics()
  const qc = useQueryClient()
  const [retro, setRetro] = useState(false)
  if (sessions.isLoading) return <Spinner />
  if (sessions.error) return <ErrorBox error={sessions.error} retry={() => sessions.refetch()} />
  const name = (id: string | null) => topics.data?.find((t) => t.id === id)?.name ?? '—'
  return (
    <div className="space-y-4">
      <PageTitle title="Agenda e sessões" action={<Button variant="secondary" onClick={() => setRetro((r) => !r)}>{retro ? 'Fechar' : 'Registrar sessão retroativa'}</Button>} />
      {retro && <Checkin retroactive onDone={() => setRetro(false)} />}
      <div className="grid gap-4 md:grid-cols-2"><Timer /><Availability /></div>
      <Blocked />
      <Card className="space-y-2">
        <h2 className="font-semibold">Histórico</h2>
        {!sessions.data?.length ? <Empty>Nenhuma sessão ainda.</Empty> : (
          <ul className="divide-y divide-line">
            {sessions.data.slice(0, 50).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div><div className="font-medium">{name(s.topic_id)}</div><div className="text-xs text-muted">{fmtDateTime(s.started_at)} · {Number(s.duration_minutes).toFixed(0)} min {s.retroactive && <Badge>retroativa</Badge>} <Badge tone="sea">{s.kind}</Badge></div></div>
                <Button size="sm" variant="ghost" aria-label="Excluir sessão" onClick={async () => { await deleteSession(s.id); qc.invalidateQueries({ queryKey: qk.sessions }) }}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
