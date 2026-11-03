import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'
import { createCard, deleteCard, getReviewEvents, rescheduleCard, reviewCard } from '@/lib/api'
import { buildChatGptReviewScript, reviewNotesText } from '@/lib/chatgpt-review'
import { qk, useCards, useProfile, useProgress, useSettings, useTopics } from '@/lib/queries'
import { initialNotesHtml } from '@/lib/notas'
import {
  dailyQueue,
  DEFAULT_TZ,
  firstDueAt,
  localMidnightPlusDays,
  RATING_LABELS,
  type Rating,
} from '@/lib/srs'
import { errMsg, uuid } from '@/lib/utils'
import type { ReviewCard } from '@/types/db'

type PendingReview = { card: string; id: string; rating: Rating }

export default function Revisoes() {
  const qc = useQueryClient()
  const cards = useCards(),
    settings = useSettings(),
    topics = useTopics(),
    progress = useProgress(),
    profile = useProfile()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [horizon, setHorizon] = useState('30')
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [flip, setFlip] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [front, setFront] = useState(''),
    [back, setBack] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const eventId = useRef<PendingReview | null>(null)
  const inFlight = useRef(false)
  const since = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString(), [])
  const events = useQuery({ queryKey: ['events', since], queryFn: () => getReviewEvents(since) })
  const timezone = profile.data?.timezone || DEFAULT_TZ
  const now = new Date()
  const displayDate = (date: string) => formatInTimeZone(date, timezone, 'dd/MM/yyyy HH:mm')

  if (cards.isLoading || settings.isLoading || topics.isLoading || progress.isLoading)
    return <Spinner />
  if (cards.error) return <ErrorBox error={cards.error} retry={() => cards.refetch()} />
  if (settings.error) return <ErrorBox error={settings.error} retry={() => settings.refetch()} />
  if (topics.error) return <ErrorBox error={topics.error} retry={() => topics.refetch()} />
  if (progress.error) return <ErrorBox error={progress.error} retry={() => progress.refetch()} />

  const allCards = (cards.data ?? [])
    .filter((c) => !completedIds.includes(c.id) || new Date(c.due_at) > now)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.due_at).getTime() - new Date(b.due_at).getTime() || a.id.localeCompare(b.id),
    )
  const cap = settings.data?.daily_review_cap ?? 20
  const todayKey = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
  const doneToday = Math.max(
    completedIds.length,
    (events.data ?? []).filter(
      (e) => formatInTimeZone(e.reviewed_at, timezone, 'yyyy-MM-dd') === todayKey,
    ).length,
  )
  const { queue, backlog } = dailyQueue(allCards, now, Math.max(0, cap - doneToday))
  const dueLessons = allCards.filter((c) => c.kind === 'aula' && new Date(c.due_at) <= now)
  const lessons = allCards.filter((c) => c.kind === 'aula')
  const selectedLesson =
    lessons.find((c) => c.id === selectedId) ?? queue.find((c) => c.kind === 'aula')
  const legacyCard = queue.find((c) => c.kind !== 'aula')
  const topicName = (c: ReviewCard) =>
    topics.data?.find((t) => t.id === c.topic_id)?.name ?? c.front
  const summaryFor = (c: ReviewCard) =>
    reviewNotesText(initialNotesHtml(progress.data?.find((p) => p.topic_id === c.topic_id)))
  const notes = selectedLesson ? summaryFor(selectedLesson) : ''
  const script = selectedLesson ? buildChatGptReviewScript(topicName(selectedLesson), notes) : ''
  const futureEnd =
    horizon === 'all'
      ? Infinity
      : localMidnightPlusDays(now, Number(horizon) + 1, timezone).getTime()
  const upcoming = lessons.filter(
    (c) => new Date(c.due_at) > now && new Date(c.due_at).getTime() < futureEnd,
  )
  const schedulableTopics = (topics.data ?? []).filter(
    (t) =>
      !(topics.data ?? []).some((child) => child.parent_id === t.id) &&
      !(cards.data ?? []).some((c) => c.kind === 'aula' && c.topic_id === t.id),
  )

  async function rate(card: ReviewCard, rating: Rating) {
    if (inFlight.current) return
    if (eventId.current && (eventId.current.card !== card.id || eventId.current.rating !== rating))
      return
    inFlight.current = true
    setBusy(true)
    setMsg(null)
    setSuccess(null)
    if (!eventId.current) eventId.current = { card: card.id, rating, id: uuid() }
    try {
      const saved = await reviewCard(card.id, rating, eventId.current.id, timezone)
      eventId.current = null
      setCompletedIds((ids) => [...ids, card.id])
      setFlip(false)
      setSelectedId(null)
      setCopyMsg(null)
      if (saved?.due_at && Number.isFinite(new Date(saved.due_at).getTime())) {
        setSuccess(
          `Revisão de ${topicName(card)} salva com dificuldade ${rating}/5. Próxima revisão: ${displayDate(saved.due_at)}.`,
        )
        qc.setQueryData<ReviewCard[]>(qk.cards, (rows) =>
          rows?.map((c) => (c.id === card.id ? saved : c)),
        )
      } else setSuccess(`Revisão de ${topicName(card)} salva com dificuldade ${rating}/5.`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.cards }),
        qc.invalidateQueries({ queryKey: ['events'] }),
      ])
    } catch (error) {
      setMsg(
        `Não foi possível salvar (${errMsg(error)}). Reenvie a mesma dificuldade; a revisão não será contada em duplicidade.`,
      )
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  function ratingBlock(card: ReviewCard) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Depois de terminar a revisão, confirme sua dificuldade de lembrança:
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {([0, 1, 2, 3, 4, 5] as Rating[]).map((r) => (
            <Button
              key={r}
              variant={r <= 2 ? 'secondary' : 'primary'}
              disabled={
                busy ||
                Boolean(
                  eventId.current &&
                  (eventId.current.card !== card.id || eventId.current.rating !== r),
                )
              }
              onClick={() => rate(card, r)}
              className="flex-col py-2"
            >
              <span className="font-semibold">{r}</span>
              <span className="text-xs font-normal">{RATING_LABELS[r]}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">
          A conclusão e a próxima data aparecem depois de salvar.
        </p>
      </div>
    )
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      setCopyMsg('Roteiro copiado. Cole na sua conversa do ChatGPT.')
    } catch {
      setCopyMsg('Cópia automática indisponível. Selecione e copie o roteiro no campo abaixo.')
    }
  }

  async function scheduleTopic() {
    const topic = schedulableTopics.find((t) => t.id === newTopic)
    if (!topic || busy) return
    setBusy(true)
    setMsg(null)
    setSuccess(null)
    try {
      await createCard({
        kind: 'aula',
        topic_id: topic.id,
        front: topic.name,
        due_at: firstDueAt(now, timezone).toISOString(),
      })
      setNewTopic('')
      setSuccess(`Revisão de ${topic.name} agendada. O progresso do assunto foi preservado.`)
      await qc.invalidateQueries({ queryKey: qk.cards })
    } catch (error) {
      setMsg(errMsg(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Revisões por assunto"
        sub={`${dueLessons.length} assunto(s) vencido(s) · ${Math.max(0, cap - doneToday)} revisões disponíveis hoje · ${backlog} aguardando capacidade`}
      />
      <p className="text-sm text-muted">
        Revise na sua conversa do ChatGPT: escolha o assunto, copie o roteiro e volte para registrar
        como foi. Nenhum resumo é enviado automaticamente.
      </p>
      {success && (
        <p role="status" className="rounded-lg bg-ok/10 p-3 text-sm text-ok">
          {success}
        </p>
      )}
      {msg && (
        <p role="alert" className="rounded-lg bg-bad/10 p-3 text-sm text-bad">
          {msg}
        </p>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Assuntos vencidos</h2>
        {!dueLessons.length ? (
          <Empty>Nenhuma revisão de assunto vencida agora.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {dueLessons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{topicName(c)}</p>
                  <p className="text-xs text-muted">
                    Agendada para {displayDate(c.due_at)} · {c.lapses} dificuldade(s) registrada(s)
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(c.due_at).getTime() < now.getTime()
                      ? 'Data de revisão já alcançada; retome o assunto sem duplicar o atraso.'
                      : 'Revisão prevista pelo seu histórico.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || Boolean(eventId.current && eventId.current.card !== c.id)}
                  onClick={() => {
                    setSelectedId(c.id)
                    setCopyMsg(null)
                  }}
                >
                  Revisar assunto
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selectedLesson && (
        <Card className="space-y-3" aria-label="Revisão do assunto selecionado">
          <h2 className="text-lg font-semibold">{topicName(selectedLesson)}</h2>
          <p className="text-sm text-muted">
            Quando: {displayDate(selectedLesson.due_at)} ·{' '}
            {selectedLesson.last_reviewed_at
              ? `última revisão em ${displayDate(selectedLesson.last_reviewed_at)}`
              : 'primeira revisão agendada'}
          </p>
          <p className="text-sm">
            Por quê:{' '}
            {selectedLesson.lapses > 0
              ? 'seu histórico registra dificuldades; recupere os conceitos e trabalhe as lacunas.'
              : 'retomar o conteúdo na data prevista ajuda a verificar o que você consegue lembrar.'}
          </p>
          <div className="rounded-lg border border-line p-3">
            <h3 className="text-sm font-medium">Seu resumo</h3>
            {notes ? (
              <p className="mt-2 whitespace-pre-wrap text-sm">{notes}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">(resumo vazio)</p>
            )}
            {selectedLesson.topic_id && (
              <Link
                to={`/edital/${selectedLesson.topic_id}`}
                className="mt-2 inline-block text-sm text-sea underline"
              >
                Editar resumo
              </Link>
            )}
          </div>
          <Button onClick={copyScript}>Copiar roteiro para o ChatGPT</Button>
          {copyMsg && (
            <p role="status" className="text-sm text-muted">
              {copyMsg}
            </p>
          )}
          <Field label="Roteiro para revisar no ChatGPT">
            <Textarea readOnly value={script} className="min-h-52" />
          </Field>
          {queue.some((c) => c.id === selectedLesson.id) ? (
            ratingBlock(selectedLesson)
          ) : (
            <p className="text-sm text-muted">
              {new Date(selectedLesson.due_at) > now
                ? 'Revisão futura: roteiro disponível para preparar sua conversa.'
                : 'Limite diário alcançado. O assunto permanece pendente.'}
            </p>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Próximas revisões de assuntos</h2>
        <Field label="Período das próximas revisões">
          <Select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
            <option value="7">Próximos 7 dias</option>
            <option value="30">Próximos 30 dias</option>
            <option value="all">Todas agendadas</option>
          </Select>
        </Field>
        {!upcoming.length ? (
          <Empty>Nenhum assunto agendado neste período.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{topicName(c)}</p>
                  <p className="text-xs text-muted">{displayDate(c.due_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge>aula</Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(c.id)
                      setCopyMsg(null)
                    }}
                  >
                    Ver roteiro
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await rescheduleCard(
                          c.id,
                          localMidnightPlusDays(new Date(c.due_at), 3, timezone).toISOString(),
                          'adiado +3 dias',
                        )
                        await qc.invalidateQueries({ queryKey: qk.cards })
                      } catch (error) {
                        setMsg(errMsg(error))
                      }
                    }}
                  >
                    +3 dias
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !confirm(
                          'Excluir esta aula? O assunto e seu progresso continuam preservados.',
                        )
                      )
                        return
                      try {
                        await deleteCard(c.id)
                        await qc.invalidateQueries({ queryKey: qk.cards })
                      } catch (error) {
                        setMsg(errMsg(error))
                      }
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Agendar revisão de outro assunto</h2>
        <p className="text-sm text-muted">
          Escolha um tópico para começar amanhã. Isso agenda a revisão sem concluir ou alterar seu
          progresso no Edital.
        </p>
        <Field label="Assunto para agendar">
          <Select value={newTopic} onChange={(event) => setNewTopic(event.target.value)}>
            <option value="">Selecione um assunto</option>
            {schedulableTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button disabled={!newTopic || busy} onClick={scheduleTopic}>
          Agendar revisão para amanhã
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Cards anteriores</h2>
        <p className="text-sm text-muted">Seus cards e o histórico continuam disponíveis.</p>
        {!legacyCard ? (
          <Empty>Nenhum card vencido na capacidade de hoje.</Empty>
        ) : (
          <div className="space-y-3">
            <div className="whitespace-pre-wrap rounded-lg border border-line p-3">
              {legacyCard.front}
            </div>
            {flip ? (
              <>
                <div className="whitespace-pre-wrap rounded-lg bg-sea/10 p-3">
                  {legacyCard.back || '(sem verso)'}
                </div>
                {ratingBlock(legacyCard)}
              </>
            ) : (
              <Button onClick={() => setFlip(true)}>Mostrar verso</Button>
            )}
          </div>
        )}
        <ul className="divide-y divide-line">
          {allCards
            .filter((c) => c.kind !== 'aula' && new Date(c.due_at) > now)
            .map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <p>{c.front}</p>
                  <p className="text-xs text-muted">{displayDate(c.due_at)}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await rescheduleCard(
                          c.id,
                          localMidnightPlusDays(new Date(c.due_at), 3, timezone).toISOString(),
                          'adiado +3 dias',
                        )
                        await qc.invalidateQueries({ queryKey: qk.cards })
                      } catch (error) {
                        setMsg(errMsg(error))
                      }
                    }}
                  >
                    +3 dias
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm('Excluir card e seu histórico?')) return
                      try {
                        await deleteCard(c.id)
                        await qc.invalidateQueries({ queryKey: qk.cards })
                      } catch (error) {
                        setMsg(errMsg(error))
                      }
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Criar card opcional</summary>
          <div className="mt-3 space-y-2">
            <Field label="Frente">
              <Input value={front} onChange={(event) => setFront(event.target.value)} />
            </Field>
            <Field label="Verso">
              <Textarea value={back} onChange={(event) => setBack(event.target.value)} />
            </Field>
            <Button
              disabled={!front.trim() || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await createCard({
                    front: front.trim(),
                    back: back.trim(),
                    due_at: firstDueAt(now, timezone).toISOString(),
                  })
                  setFront('')
                  setBack('')
                  await qc.invalidateQueries({ queryKey: qk.cards })
                } catch (error) {
                  setMsg(errMsg(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Criar card (revisão amanhã)
            </Button>
          </div>
        </details>
        <p className="text-xs text-muted">
          {(events.data ?? []).length} revisão(ões) registrada(s) nos últimos 30 dias.
        </p>
      </Card>
    </div>
  )
}
