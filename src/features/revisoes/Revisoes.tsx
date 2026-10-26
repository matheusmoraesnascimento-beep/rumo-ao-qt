import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Spinner, Textarea } from '@/components/ui'
import { createCard, deleteCard, getReviewEvents, rescheduleCard, reviewCard } from '@/lib/api'
import { qk, useCards, useProgress, useSettings, useTopics } from '@/lib/queries'
import { initialNotesHtml, isEmptyNotes } from '@/lib/notas'
import { NotasLeitura } from '@/features/edital/NotasLeitura'
import { dailyQueue, firstDueAt, RATING_LABELS, type Rating } from '@/lib/srs'
import { errMsg, fmtDate, fmtDateTime, uuid } from '@/lib/utils'
import { formatInTimeZone } from 'date-fns-tz'
import { DEFAULT_TZ } from '@/lib/srs'

export default function Revisoes() {
  const qc = useQueryClient()
  const cards = useCards(), settings = useSettings(), topics = useTopics(), progress = useProgress()
  const [flip, setFlip] = useState(false)
  const [done, setDone] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [front, setFront] = useState(''), [back, setBack] = useState('')
  const eventId = useRef<{ card: string; id: string } | null>(null) // reutilizado em reenvio => idempotente
  const since = useMemo(() => new Date(Date.now() - 14 * 86400000).toISOString(), [])
  const events = useQuery({ queryKey: ['events', since], queryFn: () => getReviewEvents(since) })

  if (cards.isLoading || settings.isLoading) return <Spinner />
  if (cards.error) return <ErrorBox error={cards.error} retry={() => cards.refetch()} />
  const cap = settings.data?.daily_review_cap ?? 20
  const now = new Date()
  const todayKey = formatInTimeZone(now, DEFAULT_TZ, 'yyyy-MM-dd')
  const doneToday = Math.max(done, (events.data ?? []).filter((e) => formatInTimeZone(new Date(e.reviewed_at), DEFAULT_TZ, 'yyyy-MM-dd') === todayKey).length)
  const { queue, backlog } = dailyQueue(cards.data ?? [], now, Math.max(0, cap - doneToday))
  const cur = queue[0]
  const upcoming = (cards.data ?? []).filter((c) => new Date(c.due_at) > now).slice(0, 15)
  const topicName = (id: string | null) => topics.data?.find((t) => t.id === id)?.name
  const cardTitle = (c: { kind: string; front: string; topic_id: string | null }) => (c.kind === 'aula' ? topicName(c.topic_id) ?? c.front : c.front)
  const resumo = cur?.kind === 'aula' ? initialNotesHtml(progress.data?.find((p) => p.topic_id === cur.topic_id)) : ''

  async function rate(r: Rating) {
    if (!cur || busy) return
    setBusy(true); setMsg(null)
    if (eventId.current?.card !== cur.id) eventId.current = { card: cur.id, id: uuid() }
    try {
      await reviewCard(cur.id, r, eventId.current.id, DEFAULT_TZ)   // só avança após persistir
      eventId.current = null
      setFlip(false); setDone((d) => d + 1)
      await Promise.all([qc.invalidateQueries({ queryKey: qk.cards }), qc.invalidateQueries({ queryKey: ['events'] })])
    } catch (e) {
      setMsg(`Não foi possível salvar (${errMsg(e)}). Toque de novo para reenviar — não será contado em duplicidade.`)
    } finally { setBusy(false) }
  }

  const ratingBlock = (
    <>
      <p className="text-sm font-medium">Como foi a lembrança?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {([0, 1, 2, 3, 4, 5] as Rating[]).map((r) => (
          <Button key={r} variant={r <= 2 ? 'secondary' : 'primary'} disabled={busy} onClick={() => rate(r)} className="flex-col py-2">
            <span className="text-base font-semibold">{r}</span><span className="text-[11px] font-normal">{RATING_LABELS[r]}</span>
          </Button>
        ))}
      </div>
    </>
  )

  const byDay = new Map<string, number>()
  for (let i = 13; i >= 0; i--) byDay.set(formatInTimeZone(new Date(Date.now() - i * 86400000), DEFAULT_TZ, 'dd/MM'), 0)
  for (const ev of events.data ?? []) { const k = formatInTimeZone(new Date(ev.reviewed_at), DEFAULT_TZ, 'dd/MM'); if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1) }
  const chart = [...byDay].map(([dia, revisoes]) => ({ dia, revisoes }))

  return (
    <div className="space-y-4">
      <PageTitle title="Revisões espaçadas" sub={`Fila de hoje: ${queue.length} (limite diário ${cap}) · ${backlog} adiadas na fila, nada se perde · algoritmo interval-v1`} />
      <Card className="space-y-3">
        {!cur ? (
          <Empty>{done > 0 ? `Sessão concluída: ${done} revisão(ões) salva(s). 🎉` : 'Nenhuma revisão vencida agora.'}</Empty>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{done + 1}º card de hoje {topicName(cur.topic_id) && `· ${topicName(cur.topic_id)}`}</span>
              <span>vencia em {fmtDate(cur.due_at)} · nível {cur.level} · {cur.lapses} lapso(s)</span>
            </div>
            {cur.kind === 'aula' ? (
              <>
                <div className="rounded-xl border border-line p-4">
                  <h2 className="text-lg font-semibold">{cardTitle(cur)}</h2>
                  {isEmptyNotes(resumo) ? <p className="mt-2 text-sm text-muted">(resumo vazio)</p> : <NotasLeitura html={resumo} />}
                  <Link to={`/edital/${cur.topic_id}`} className="mt-2 inline-block text-sm text-sea underline">Editar resumo</Link>
                </div>
                {ratingBlock}
              </>
            ) : (
              <>
                <div className="min-h-32 whitespace-pre-wrap rounded-xl border border-line p-4 text-lg">{cur.front}</div>
                {flip ? (
                  <>
                    <div className="whitespace-pre-wrap rounded-xl border border-sea/40 bg-sea/10 p-4">{cur.back || <span className="text-muted">(sem verso)</span>}</div>
                    {ratingBlock}
                  </>
                ) : <Button onClick={() => setFlip(true)}>Mostrar verso</Button>}
              </>
            )}
            {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Novo card</h2>
          <Field label="Frente"><Input value={front} onChange={(e) => setFront(e.target.value)} /></Field>
          <Field label="Verso"><Textarea value={back} onChange={(e) => setBack(e.target.value)} className="min-h-16" /></Field>
          <Button disabled={!front.trim()} onClick={async () => {
            try { await createCard({ front: front.trim(), back: back.trim(), due_at: firstDueAt(new Date()).toISOString() }); setFront(''); setBack(''); await qc.invalidateQueries({ queryKey: qk.cards }) } catch (e) { setMsg(errMsg(e)) }
          }}>Criar (1ª revisão amanhã)</Button>
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Revisões nos últimos 14 dias</h2>
          <div className="h-40" role="img" aria-label="Revisões por dia">
            <ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" /><XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} interval={1} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-muted)' }} /><Tooltip /><Bar dataKey="revisoes" fill="var(--color-sea)" /></BarChart></ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="space-y-2">
        <h2 className="font-semibold">Próximos cards</h2>
        {!upcoming.length ? <Empty>Sem cards agendados.</Empty> : (
          <ul className="divide-y divide-line">
            {upcoming.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{cardTitle(c)}</div><div className="text-xs text-muted">{fmtDateTime(c.due_at)} · nível {c.level}</div></div>
                <div className="flex shrink-0 gap-1">
                  <Badge>{c.kind === 'aula' ? 'aula' : c.algorithm}</Badge>
                  <Button size="sm" variant="ghost" onClick={async () => { await rescheduleCard(c.id, new Date(new Date(c.due_at).getTime() + 3 * 86400000).toISOString(), 'adiado +3 dias'); qc.invalidateQueries({ queryKey: qk.cards }) }}>+3 dias</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm(c.kind === 'aula' ? 'Excluir esta aula? O assunto continua como está e pode ser concluído de novo.' : 'Excluir card e seu histórico?')) { await deleteCard(c.id); qc.invalidateQueries({ queryKey: qk.cards }) } }}>Excluir</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
