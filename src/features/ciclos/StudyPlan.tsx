import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '@/components/ui'
import { WEEKDAY_LABEL, errMsg } from '@/lib/utils'
import { useIdempotentCommand, useRefreshCycles, type PlanItem } from './api'
import { useCycles, type CyclesContext } from './useCycles'
import { linkClass } from './shared'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function PlanForm({ d }: { d: CyclesContext }) {
  const refresh = useRefreshCycles()
  const command = useIdempotentCommand()
  const [versionId, setVersionId] = useState(
    d.plan?.syllabus_version_id ??
      d.versions.data?.find((v) => v.status !== 'substituido')?.id ??
      '',
  )
  const [name, setName] = useState(d.plan?.name ?? 'Meu plano CP-T Informática')
  const [weekly, setWeekly] = useState(
    d.settings?.weekly_availability ?? {
      mon: 120,
      tue: 120,
      wed: 120,
      thu: 120,
      fri: 120,
      sat: 0,
      sun: 0,
    },
  )
  const [goal, setGoal] = useState(d.settings?.goal_correct ?? 40)
  const [examDate, setExamDate] = useState(d.settings?.exam_date ?? '')
  const [cap, setCap] = useState(d.settings?.daily_review_cap ?? 20)
  const [budget, setBudget] = useState(45)
  const [minSample, setMinSample] = useState(Number(d.plan?.preferences.min_verified_sample ?? 10))
  const [threshold, setThreshold] = useState(
    Number(d.plan?.preferences.alert_threshold ?? 0.7) * 100,
  )
  const [windowDays, setWindowDays] = useState(Number(d.plan?.preferences.window_days ?? 30))
  const [shares, setShares] = useState(
    (d.plan?.preferences.time_shares ?? {
      review: 0.125,
      cycle: 0.375,
      questions: 0.375,
      errors: 0.125,
    }) as Record<string, number>,
  )
  const [weights, setWeights] = useState(
    (d.plan?.preferences.weights ?? {
      reviewOverdue: 0.3,
      editalCoverageGap: 0.25,
      demonstratedDifficulty: 0.2,
      daysSinceContact: 0.15,
      manualPriority: 0.1,
    }) as Record<string, number>,
  )
  const versionTopics = d.topics.filter((t) => t.syllabus_version_id === versionId)
  const parents = new Set(versionTopics.map((t) => t.parent_id))
  const leaves = versionTopics
    .filter((t) => !parents.has(t.id))
    .sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id))
  const [order, setOrder] = useState<string[]>([])
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const ids =
    order.length && order.every((id) => leaves.some((t) => t.id === id))
      ? order
      : d.plan?.syllabus_version_id === versionId
        ? d.items.map((i) => i.topic_id)
        : leaves.map((t) => t.id)
  const [edits, setEdits] = useState<Record<string, Partial<PlanItem>>>({})
  function move(index: number, step: number) {
    const next = [...ids]
    ;[next[index], next[index + step]] = [next[index + step], next[index]]
    setOrder(next)
  }
  async function activate() {
    setSaving(true)
    setMessage(undefined)
    try {
      await command('save_plan', {
        plan_id: d.plan?.syllabus_version_id === versionId ? d.plan.id : null,
        expected_revision: d.plan?.syllabus_version_id === versionId ? d.plan.revision : null,
        syllabus_version_id: versionId,
        name,
        topic_ids: ids,
        settings: {
          weekly_availability: weekly,
          goal_correct: goal,
          exam_date: examDate || null,
          daily_review_cap: cap,
        },
        preferences: {
          min_verified_sample: minSample,
          alert_threshold: threshold / 100,
          window_days: windowDays,
          weights,
          time_shares: shares,
        },
        items: ids.map((topic_id) => {
          const old = d.items.find((i) => i.topic_id === topic_id)
          return {
            topic_id,
            budget_minutes: edits[topic_id]?.budget_minutes ?? old?.budget_minutes ?? budget,
            manual_weight: edits[topic_id]?.manual_weight ?? old?.manual_weight ?? 1,
            paused: edits[topic_id]?.paused ?? old?.paused ?? false,
          }
        }),
      })
      await refresh()
      setMessage({ ok: true, text: 'Plano salvo e ativado. O histórico foi preservado.' })
    } catch (e) {
      setMessage({ ok: false, text: errMsg(e) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Badge tone="sea">{d.plan ? 'Editar plano ativo' : 'Adoção sem apagar histórico'}</Badge>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do plano">
            <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Concurso e versão do edital">
            <Select
              value={versionId}
              onChange={(e) => {
                setVersionId(e.target.value)
                setOrder([])
                setPreview(false)
              }}
            >
              {d.versions.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} · {v.status === 'provisorio' ? 'referência provisória' : v.status}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-muted">
          {leaves.length} assuntos obrigatórios nesta versão. Contato anterior e progresso do Edital
          são evidências legadas; não viram passagens automaticamente.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DAYS.map((day) => (
            <Field key={day} label={WEEKDAY_LABEL[day]}>
              <Input
                type="number"
                min={0}
                max={1440}
                step={5}
                value={weekly[day] ?? 0}
                onChange={(e) => setWeekly({ ...weekly, [day]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Meta (de 50)">
            <Input
              type="number"
              min={1}
              max={50}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
            />
          </Field>
          <Field label="Data da prova" hint="Vazia = a confirmar">
            <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </Field>
          <Field label="Limite diário de revisões">
            <Input
              type="number"
              min={1}
              max={200}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
            />
          </Field>
          <Field label="Minutos por novo item">
            <Input
              type="number"
              min={5}
              max={240}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </Field>
        </div>
        <details>
          <summary className="cursor-pointer font-medium">
            Critérios de diagnóstico e distribuição
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Amostra mínima distinta">
              <Input
                type="number"
                min={1}
                max={100}
                value={minSample}
                onChange={(e) => setMinSample(Number(e.target.value))}
              />
            </Field>
            <Field label="Alerta abaixo de (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </Field>
            <Field label="Janela (dias)">
              <Input
                type="number"
                min={1}
                max={365}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
              />
            </Field>
          </div>
          <p className="my-2 text-sm text-muted">
            Os pesos são normalizados. Cobertura do ciclo continua reservada mesmo com dificuldades
            em outras matérias.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries({
              reviewOverdue: 'Atraso de revisão',
              editalCoverageGap: 'Lacuna do edital',
              demonstratedDifficulty: 'Dificuldade verificada',
              daysSinceContact: 'Tempo sem contato',
              manualPriority: 'Prioridade manual',
            }).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.05}
                  value={weights[k] ?? 0}
                  onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {Object.entries({
              review: 'Revisão (%)',
              cycle: 'Ciclo (%)',
              questions: 'Questões (%)',
              errors: 'Erros (%)',
            }).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round((shares[k] ?? 0) * 100)}
                  onChange={(e) => setShares({ ...shares, [k]: Number(e.target.value) / 100 })}
                />
              </Field>
            ))}
          </div>
        </details>
        <Button onClick={() => setPreview(true)} disabled={!leaves.length}>
          Pré-visualizar plano
        </Button>
      </Card>
      {preview && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Prévia: {ids.length} itens em sequência</h2>
          <p className="text-sm text-muted">
            Dias sem estudo não movem o cursor. Reordenar preserva os IDs; pausar mantém a
            pendência. Todas as alterações abaixo só serão salvas ao confirmar.
          </p>
          <ol className="max-h-[32rem] space-y-2 overflow-y-auto">
            {ids.map((id, index) => {
              const item = d.items.find((i) => i.topic_id === id)
              const edit = edits[id] ?? {}
              return (
                <li key={id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      <strong>{index + 1}.</strong> {leaves.find((t) => t.id === id)?.name}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={index === 0}
                        aria-label={`Subir ${index + 1}`}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={index === ids.length - 1}
                        aria-label={`Descer ${index + 1}`}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Field label="Minutos">
                      <Input
                        type="number"
                        min={5}
                        max={240}
                        value={edit.budget_minutes ?? item?.budget_minutes ?? budget}
                        onChange={(e) =>
                          setEdits({
                            ...edits,
                            [id]: { ...edit, budget_minutes: Number(e.target.value) },
                          })
                        }
                      />
                    </Field>
                    <Field label="Peso manual">
                      <Input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={edit.manual_weight ?? item?.manual_weight ?? 1}
                        onChange={(e) =>
                          setEdits({
                            ...edits,
                            [id]: { ...edit, manual_weight: Number(e.target.value) },
                          })
                        }
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={edit.paused ?? item?.paused ?? false}
                        onChange={(e) =>
                          setEdits({ ...edits, [id]: { ...edit, paused: e.target.checked } })
                        }
                      />
                      Pausado
                    </label>
                  </div>
                </li>
              )
            })}
          </ol>
          {d.cycleData?.available === false && (
            <p role="status" className="text-warn">
              Ativação indisponível: a migração segura do banco está pendente.
            </p>
          )}
          <Button loading={saving} disabled={d.cycleData?.available === false} onClick={activate}>
            {d.plan ? 'Confirmar alterações e ativar' : 'Ativar plano'}
          </Button>
        </Card>
      )}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-ok' : 'text-bad'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
export default function StudyPlanPage() {
  const d = useCycles()
  if (d.loading || d.cycleLoading) return <Spinner />
  if (d.error || d.cycleError) return <ErrorBox error={d.error || d.cycleError} />
  return (
    <div className="space-y-4">
      <PageTitle
        title="Meu plano de estudos"
        sub="CP-T Informática · ciclos sequenciais e passagens auditáveis"
        action={
          <Link className={linkClass} to="/mapa">
            Ver mapa
          </Link>
        }
      />
      <PlanForm key={d.plan?.id ?? 'new'} d={d} />
      <PlanExceptions d={d} />
      <PlanActivation d={d} />
    </div>
  )
}
function PlanExceptions({ d }: { d: CyclesContext }) {
  const [day, setDay] = useState(d.localDate),
    [minutes, setMinutes] = useState(0),
    [reason, setReason] = useState(''),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false)
  const refresh = useRefreshCycles()
  const command = useIdempotentCommand()
  if (!d.plan) return null
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Exceção de disponibilidade</h2>
      <p className="text-sm text-muted">
        Plantão, viagem ou um dia com menos tempo. O passado e o cursor ficam preservados.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Data">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Minutos (0 = pausa)">
          <Input
            type="number"
            min={0}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </Field>
        <Field label="Motivo">
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <Button
        variant="secondary"
        loading={busy}
        disabled={!reason.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            await command('exception', {
              plan_id: d.plan!.id,
              expected_revision: d.plan!.revision,
              day,
              minutes,
              reason,
            })
            await refresh()
            setMsg('Exceção salva.')
          } catch (e) {
            setMsg(errMsg(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Salvar exceção
      </Button>
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
      {Object.entries(d.plan.exceptions)
        .sort()
        .map(([date, x]) => (
          <p key={date} className="text-sm text-muted">
            {date}: {x.minutes} min · {x.reason}
          </p>
        ))}
    </Card>
  )
}

function PlanActivation({ d }: { d: CyclesContext }) {
  const refresh = useRefreshCycles()
  const command = useIdempotentCommand(),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState('')
  async function change(id: string, revision: number, operation: string) {
    setBusy(true)
    setMsg('')
    try {
      await command(operation, { plan_id: id, expected_revision: revision })
      await refresh()
      setMsg(
        operation === 'disable'
          ? 'Ciclos desativados. Histórico preservado; telas anteriores continuam disponíveis.'
          : 'Plano reativado com o cursor e o histórico anteriores.',
      )
    } catch (e) {
      setMsg(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Ativação por conta</h2>
      {d.plan && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => change(d.plan!.id, d.plan!.revision, 'disable')}
        >
          Desativar ciclos e continuar no modo anterior
        </Button>
      )}
      {d.cycleData?.plans
        .filter((p) => !p.active)
        .map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {p.name} · passagem {p.passage_number}
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => change(p.id, p.revision, 'enable')}
            >
              Reativar plano preservado
            </Button>
          </div>
        ))}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </Card>
  )
}
