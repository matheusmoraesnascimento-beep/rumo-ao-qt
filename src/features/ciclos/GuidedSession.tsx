import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Field, Input, PageTitle, Textarea } from '@/components/ui'
import { errMsg, uuid } from '@/lib/utils'
import { cycleCommand, useRefreshCycles } from './api'
import { useCycles } from './useCycles'
import { CycleGate, linkClass, passageLabel } from './shared'
export default function GuidedSession() {
  const d = useCycles(),
    refresh = useRefreshCycles()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('')
  const [notes, setNotes] = useState(''),
    [difficulty, setDifficulty] = useState(2),
    [covered, setCovered] = useState(false),
    [assessed, setAssessed] = useState(false),
    [practice, setPractice] = useState(false)
  const [, tick] = useState(0)
  const pending = useRef<{ signature: string; key: string } | null>(null)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!d.plan || d.loading || d.cycleLoading || d.error || d.cycleError) return <CycleGate d={d} />
  const item = d.running
    ? d.items.find((i) => i.id === d.running!.item_id)
    : (d.items.find((i) => i.id === params.get('item')) ?? d.next)
  const session = d.running
  const topic = d.topics.find((t) => t.id === item?.topic_id)
  const elapsed = session
    ? Number(session.elapsed_seconds) +
      (session.state === 'running' && session.resumed_at
        ? Math.max(0, (Date.now() - new Date(session.resumed_at).getTime()) / 1000)
        : 0)
    : 0
  const clock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(Math.floor(elapsed) % 60).padStart(2, '0')}`
  async function command(operation: string, extra: Record<string, unknown> = {}) {
    const payload = {
      plan_id: d.plan!.id,
      item_id: item?.id,
      session_id: session?.id,
      ...(operation === 'start' || operation === 'skip'
        ? { expected_revision: d.plan!.revision }
        : {}),
      ...extra,
    }
    const signature = JSON.stringify({ operation, payload })
    if (pending.current?.signature !== signature) pending.current = { signature, key: uuid() }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await cycleCommand(operation, payload, pending.current.key)
      pending.current = null
      await refresh()
      if (operation === 'finish') {
        setNotes('')
        setCovered(false)
        setAssessed(false)
        setPractice(false)
        setDifficulty(2)
        navigate(extra.complete ? '/' : `/sessao?item=${item?.id}`, { replace: true })
      }
      setSuccess(
        operation === 'finish'
          ? 'Sessão salva. O próximo bloco já está atualizado.'
          : operation === 'skip'
            ? 'Assunto mantido pendente e pulado somente por hoje.'
            : 'Estado salvo no banco.',
      )
    } catch (e) {
      setError(`${errMsg(e)} Seu registro não foi confirmado; tente novamente.`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <PageTitle
        title="Sessão guiada"
        sub="Tempo real, objetivos explícitos e confirmação após salvar"
        action={
          <Link className={linkClass} to="/mapa">
            Voltar ao mapa
          </Link>
        }
      />
      {!item ? (
        <Card>Não há item elegível. Revise as pausas ou abra a próxima passagem em Hoje.</Card>
      ) : (
        <>
          <Card className="space-y-4">
            <Badge tone="sea">
              Passagem {session?.passage_number ?? d.plan.passage_number} ·{' '}
              {passageLabel(session?.passage_number ?? d.plan.passage_number)}
            </Badge>
            <h2 className="text-2xl font-semibold">{topic?.name}</h2>
            <p className="text-muted">
              {d.plan.passage_number === 1
                ? 'Estude teoria, definições e exemplos da bibliografia. Registre dúvidas para a revisão.'
                : d.plan.passage_number === 2
                  ? 'Retome as lacunas e pratique questões novas ou exercícios manuais. Sem gabarito, não há acerto verificado.'
                  : 'Consolide com questões mistas, bibliografia e análise dos erros.'}
            </p>
            <div
              className="text-5xl font-semibold tabular-nums"
              aria-label="Tempo líquido da sessão"
            >
              {clock}
            </div>
            <p className="text-sm text-muted">
              Orçamento do item: {item.budget_minutes} min. O tempo exibido é estimado; o servidor
              confirma o tempo líquido ao salvar.
            </p>
            <div className="flex flex-wrap gap-2">
              {!session ? (
                <Button loading={busy} onClick={() => command('start')}>
                  Iniciar sessão
                </Button>
              ) : session.state === 'running' ? (
                <Button variant="secondary" loading={busy} onClick={() => command('pause')}>
                  Pausar
                </Button>
              ) : (
                <Button loading={busy} onClick={() => command('resume')}>
                  Retomar
                </Button>
              )}
              <Link className={linkClass} to={`/edital/${item.topic_id}`}>
                Abrir minhas anotações
              </Link>
              <Link className={linkClass} to={`/questoes?topico=${item.topic_id}`}>
                Questões do assunto
              </Link>
            </div>
          </Card>
          {session && (
            <Card className="space-y-4">
              <h2 className="font-semibold">Registrar esta etapa</h2>
              <Field label="Conteúdo estudado, dúvidas e próxima ação">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={10000}
                  placeholder="O que você estudou? O que falta?"
                />
              </Field>
              <Field label="Dificuldade percebida (0–5)">
                <Input
                  type="range"
                  min={0}
                  max={5}
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                />
                <span className="text-sm">{difficulty}/5 · autoavaliação</span>
              </Field>
              <div className="space-y-2">
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={covered}
                    onChange={(e) => setCovered(e.target.checked)}
                  />
                  Confirmei os objetivos e o conteúdo desta passagem.
                </label>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assessed}
                    onChange={(e) => setAssessed(e.target.checked)}
                  />
                  Registrei minha compreensão, dificuldades e próxima ação nas notas.
                </label>
                {d.plan.passage_number >= 2 && (
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={practice}
                      onChange={(e) => setPractice(e.target.checked)}
                    />
                    Realizei exercícios/questões ou consolidação e registrei a evidência nas notas.
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() => command('finish', { notes, difficulty, complete: false })}
                >
                  Salvar sessão parcial
                </Button>
                <Button
                  loading={busy}
                  disabled={
                    !covered ||
                    !assessed ||
                    !notes.trim() ||
                    (d.plan.passage_number >= 2 && !practice)
                  }
                  onClick={() =>
                    command('finish', {
                      notes,
                      difficulty,
                      complete: true,
                      checklist: { covered, assessed, practice },
                    })
                  }
                >
                  Finalizar e concluir passagem do assunto
                </Button>
              </div>
              <p className="text-xs text-muted">
                A sessão parcial preserva o item pendente. Uma revisão no ChatGPT não conclui outra
                passagem automaticamente.
              </p>
            </Card>
          )}
          {!session && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Precisa alternar hoje?</h2>
              <Field label="Motivo para pular por hoje">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
              </Field>
              <Button
                variant="secondary"
                disabled={!notes.trim()}
                loading={busy}
                onClick={() => command('skip', { reason: notes })}
              >
                Pular por hoje
              </Button>
            </Card>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-ok">
          {success}
        </p>
      )}
    </div>
  )
}
