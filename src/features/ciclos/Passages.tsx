import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, Field, PageTitle, Select, Textarea } from '@/components/ui'
import { errMsg, fmtDateTime } from '@/lib/utils'
import { useIdempotentCommand, useRefreshCycles } from './api'
import { useCycles } from './useCycles'
import { CycleGate, linkClass } from './shared'
import { ImportLegacy } from './ImportLegacy'
export default function Passages() {
  const d = useCycles(),
    refresh = useRefreshCycles()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState(params.get('topico') ?? ''),
    [note, setNote] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const command = useIdempotentCommand()
  if (!d.plan || d.loading || d.cycleLoading || d.error || d.cycleError) return <CycleGate d={d} />
  const topicId = selected || d.next?.topic_id || d.leaves[0]?.id
  const topic = d.leaves.find((t) => t.id === topicId)
  const stages = d.stages
    .filter((s) => s.topic_id === topicId)
    .sort((a, b) => a.passage_number - b.passage_number)
  const legacy = d.progress.find((p) => p.topic_id === topicId)
  const sessions = d.sessions.filter(
    (s) => s.topic_id === topicId && Number(s.duration_minutes) > 0,
  )
  async function action(operation: string, extra: Record<string, unknown>) {
    setBusy(true)
    setMessage('')
    try {
      await command(operation, {
        plan_id: d.plan!.id,
        topic_id: topicId,
        expected_revision: d.plan!.revision,
        ...extra,
      })
      await refresh()
      setPreview(false)
      setMessage('Alteração confirmada e registrada no histórico de auditoria.')
    } catch (e) {
      setMessage(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <PageTitle
        title="Passagens e evidências"
        sub="Estudar, revisar e concluir uma passagem são registros distintos."
        action={
          <Link className={linkClass} to="/mapa">
            Mapa de estudos
          </Link>
        }
      />
      <ImportLegacy d={d} />
      <Card>
        <Field label="Assunto">
          <Select
            value={topicId}
            onChange={(e) => {
              setSelected(e.target.value)
              setPreview(false)
              setConfirmed(false)
            }}
          >
            {d.leaves.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{topic?.name}</h2>
        {stages.length ? (
          stages.map((s) => (
            <div key={s.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">Passagem {s.passage_number}</h3>
                <Badge tone={s.status === 'completed' ? 'ok' : 'warn'}>
                  {s.status === 'completed' ? 'Concluída' : 'Em andamento'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                Fonte: {s.completion_source} · checklist {s.checklist_version}
                {s.completed_at ? ` · ${fmtDateTime(s.completed_at)}` : ''}
              </p>
              {s.evidence_note && (
                <p className="mt-1 whitespace-pre-wrap text-sm">{s.evidence_note}</p>
              )}
              {s.evidence_session_id && (
                <p className="mt-1 text-xs text-muted">Sessão vinculada: {s.evidence_session_id}</p>
              )}
              {s.status === 'completed' && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  disabled={!note.trim()}
                  loading={busy}
                  onClick={() =>
                    action('reopen', { passage_number: s.passage_number, reason: note })
                  }
                >
                  Reabrir com o motivo abaixo
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-muted">
            Nenhuma passagem confirmada. Seu histórico anterior continua preservado.
          </p>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Histórico anterior e sessões reais</h2>
        <p className="text-sm">
          Status legado: <strong>{legacy?.status ?? 'sem registro'}</strong> · {sessions.length}{' '}
          sessões · {Math.round(sessions.reduce((n, s) => n + Number(s.duration_minutes), 0))} min.
        </p>
        <p className="text-sm text-muted">
          Contato anterior não comprova automaticamente uma passagem. A contagem da aba Edital é
          mantida por seu fluxo original.
        </p>
        {sessions.slice(0, 8).map((s) => (
          <p key={s.id} className="text-sm">
            {fmtDateTime(s.started_at)} · {s.duration_minutes} min · {s.source ?? s.kind}
          </p>
        ))}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Equivalência assistida ou correção</h2>
        <Field
          label="Justificativa e evidência"
          hint="Descreva o conteúdo realmente coberto e a origem. Também é usada ao reabrir uma etapa."
        >
          <Textarea
            value={note}
            maxLength={10000}
            onChange={(e) => {
              setNote(e.target.value)
            }}
          />
        </Field>
        {!stages.some((s) => s.passage_number === 1 && s.status === 'completed') && (
          <>
            <p className="text-sm text-muted">
              Uma conversão assistida só é elegível quando há progresso legado ou sessão deste
              assunto. Será registrada como legacy_verified, com sua confirmação.
            </p>
            <Button
              variant="secondary"
              disabled={note.trim().length < 20 || (!legacy && !sessions.length)}
              onClick={() => setPreview(true)}
            >
              Pré-visualizar equivalência da 1ª passagem
            </Button>
            {preview && (
              <div className="space-y-3 rounded-lg border border-warn p-3">
                <p className="text-sm">
                  Prévia: confirmar <strong>1 assunto</strong> — {topic?.name} — como passagem 1,
                  origem legado verificado manualmente. Nenhum outro assunto será alterado.
                </p>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Conferi o histórico e confirmo que os objetivos de compreensão foram concluídos.
                </label>
                <Button
                  loading={busy}
                  disabled={!confirmed}
                  onClick={() =>
                    action('legacy_passage', { passage_number: 1, reason: note, confirmed })
                  }
                >
                  Confirmar equivalência deste assunto
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">Auditoria deste assunto</h2>
        {d.cycleData?.events
          .filter((e) => (e.payload.topic_id ?? e.payload.resolved_topic_id) === topicId)
          .slice(-12)
          .reverse()
          .map((e) => (
            <p key={e.id} className="text-sm text-muted">
              {fmtDateTime(e.created_at)} · {e.kind} ·{' '}
              {String(e.payload.reason ?? e.payload.notes ?? '')}
            </p>
          ))}
      </Card>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
