import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button, Card, ErrorBox, Select, Spinner } from '@/components/ui'
import { qk, useProgress, useTopics } from '@/lib/queries'
import { concluirAssunto, saveNotesHtml, upsertProgress } from '@/lib/api'
import { initialNotesHtml, isEmptyNotes } from '@/lib/notas'
import { useAutosave, type AutosaveStatus } from '@/lib/useAutosave'
import { errMsg, fmtDate } from '@/lib/utils'
import { Checkin } from '@/features/estudos/Checkin'
import type { Topic, TopicProgress, TopicStatus } from '@/types/db'
import { ConcluirDialog } from './ConcluirDialog'
import { NotasEditor } from './NotasEditor'

const STATUS: Record<TopicStatus, string> = { nao_iniciado: 'Não iniciado', estudando: 'Estudando', revisando: 'Revisando', consolidado: 'Consolidado' }
const AUTOSAVE: Record<AutosaveStatus, string> = { salvo: 'Salvo', salvando: 'Salvando…', 'nao-salvo': 'Não salvo — tentando de novo' }

export default function NotasPage() {
  const { topicId } = useParams()
  const topics = useTopics()
  const progress = useProgress()

  if (topics.isLoading || progress.isLoading) return <Spinner />
  if (topics.error) return <ErrorBox error={topics.error} retry={() => topics.refetch()} />
  const all = topics.data ?? []
  const topic = all.find((t) => t.id === topicId)
  if (!topic || all.some((t) => t.parent_id === topic.id)) return <Navigate to="/edital" replace />
  return <NotasForm key={topic.id} topic={topic} p={(progress.data ?? []).find((x) => x.topic_id === topic.id)} />
}

function NotasForm({ topic, p }: { topic: Topic; p?: TopicProgress }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const initial = initialNotesHtml(p)
  const [saved, setSaved] = useState(initial)
  const [value, setValue] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [showCheckin, setShowCheckin] = useState(false)
  const [concluindo, setConcluindo] = useState(false)

  const { status, flush, draft } = useAutosave({
    storageKey: `notas:${topic.id}`,
    value,
    saved,
    save: async (v) => {
      await saveNotesHtml(topic.id, v)
      setSaved(v)
      await qc.invalidateQueries({ queryKey: qk.progress })
    },
  })

  useEffect(() => {
    if (draft !== null && draft !== initial) setValue(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveProgress(patch: Partial<TopicProgress>) {
    try {
      await upsertProgress({ topic_id: topic.id, status: p?.status ?? 'nao_iniciado', confidence: p?.confidence ?? 0, ...patch })
      await qc.invalidateQueries({ queryKey: qk.progress })
      setMsg('Salvo.')
    } catch (e) { setMsg(errMsg(e)) }
  }

  async function iniciarConclusao() {
    await flush()
    if (isEmptyNotes(value) && !confirm('O resumo está vazio. Concluir assunto mesmo assim?')) return
    setConcluindo(true)
  }

  async function concluir(v: { done?: number; correct?: number }) {
    await concluirAssunto({ topicId: topic.id, ...v })
    await Promise.all([qc.invalidateQueries({ queryKey: qk.progress }), qc.invalidateQueries({ queryKey: qk.cards })])
    navigate('/revisoes')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="Voltar" onClick={() => (location.key === 'default' ? navigate('/edital') : navigate(-1))}>
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold">{topic.name}</h1>
      </div>
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Situação
            <Select value={p?.status ?? 'nao_iniciado'} onChange={(e) => saveProgress({ status: e.target.value as TopicStatus })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label>Confiança (0–5)
            <Select value={p?.confidence ?? 0} onChange={(e) => saveProgress({ confidence: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </Select>
          </label>
        </div>
        <p className="text-xs text-muted">Último estudo: {p?.last_studied_at ? fmtDate(p.last_studied_at) : '—'}</p>
        {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
      </Card>
      <div className="space-y-1">
        <NotasEditor initialHtml={draft ?? initial} onChange={setValue} ariaLabel="Resumo do assunto" />
        <p data-testid="autosave" role="status" className={status === 'nao-salvo' ? 'text-xs text-bad' : 'text-xs text-muted'}>{AUTOSAVE[status]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setShowCheckin((s) => !s)}>{showCheckin ? 'Fechar check-in' : 'Registrar estudo de teoria'}</Button>
        <Button onClick={iniciarConclusao}>Concluir assunto</Button>
      </div>
      {showCheckin && <Checkin topicId={topic.id} />}
      {concluindo && <ConcluirDialog topicName={topic.name} onCancel={() => setConcluindo(false)} onConfirm={concluir} />}
    </div>
  )
}
