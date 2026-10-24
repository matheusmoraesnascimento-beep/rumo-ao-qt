import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, ErrorBox, PageTitle, Progress, Select, Spinner, Textarea } from '@/components/ui'
import { qk, useProgress, useTopics, useUserQuestionTopics } from '@/lib/queries'
import { upsertProgress } from '@/lib/api'
import { fmtDate, errMsg } from '@/lib/utils'
import { Checkin } from '@/features/estudos/Checkin'
import type { Topic, TopicProgress, TopicStatus } from '@/types/db'

const STATUS: Record<TopicStatus, string> = { nao_iniciado: 'Não iniciado', estudando: 'Estudando', revisando: 'Revisando', consolidado: 'Consolidado' }
const TONE = { nao_iniciado: 'neutral', estudando: 'warn', revisando: 'sea', consolidado: 'ok' } as const

export default function Edital() {
  const topics = useTopics(), progress = useProgress(), uqt = useUserQuestionTopics()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)

  const { children, roots, prog, qCount } = useMemo(() => {
    const ch = new Map<string | null, Topic[]>()
    for (const t of topics.data ?? []) ch.set(t.parent_id, [...(ch.get(t.parent_id) ?? []), t])
    const q = new Map<string, number>()
    for (const r of uqt.data ?? []) q.set(r.topic_id, (q.get(r.topic_id) ?? 0) + 1)
    return { children: ch, roots: ch.get(null) ?? [], prog: new Map((progress.data ?? []).map((p) => [p.topic_id, p])), qCount: q }
  }, [topics.data, progress.data, uqt.data])

  if (topics.isLoading || progress.isLoading) return <Spinner />
  if (topics.error) return <ErrorBox error={topics.error} retry={() => topics.refetch()} />

  const leavesOf = (t: Topic): Topic[] => { const c = children.get(t.id); return c?.length ? c.flatMap(leavesOf) : [t] }
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function Node({ t, depth }: { t: Topic; depth: number }) {
    const kids = children.get(t.id) ?? []
    const leaves = leavesOf(t)
    const done = leaves.filter((l) => (prog.get(l.id)?.status ?? 'nao_iniciado') !== 'nao_iniciado').length
    const p = prog.get(t.id)
    const isOpen = open.has(t.id)
    return (
      <li>
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-line/40" style={{ paddingLeft: 8 + depth * 18 }}>
          {kids.length ? (
            <button aria-label={isOpen ? 'Recolher' : 'Expandir'} aria-expanded={isOpen} onClick={() => toggle(t.id)}>{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>
          ) : <span className="w-4" />}
          <button className="flex-1 text-left text-sm" onClick={() => (kids.length ? toggle(t.id) : setSel(t.id))}>
            <span className={depth === 0 ? 'font-semibold' : ''}>{t.name}</span>
          </button>
          {kids.length ? (
            <span className="text-xs text-muted tabular-nums">{done}/{leaves.length}</span>
          ) : (
            <>
              {!qCount.get(t.id) && <span className="hidden text-xs text-muted sm:inline">sem questões classificadas</span>}
              <Badge tone={TONE[p?.status ?? 'nao_iniciado']}>{STATUS[p?.status ?? 'nao_iniciado']}</Badge>
            </>
          )}
        </div>
        {kids.length > 0 && isOpen && <ul>{kids.map((k) => <Node key={k.id} t={k} depth={depth + 1} />)}</ul>}
      </li>
    )
  }

  const allLeaves = roots.flatMap(leavesOf)
  const started = allLeaves.filter((l) => (prog.get(l.id)?.status ?? 'nao_iniciado') !== 'nao_iniciado').length
  const selTopic = (topics.data ?? []).find((t) => t.id === sel)

  return (
    <div className="space-y-4">
      <PageTitle title="Edital e trilha" sub="CP-T/2026 (base provisória, não é promessa de cobrança em 2027)" />
      <Card className="space-y-2">
        <Progress value={allLeaves.length ? started / allLeaves.length : 0} label="Cobertura do edital" />
        <p className="text-sm text-muted">{started}/{allLeaves.length} assuntos iniciados. Assuntos sem questões históricas também entram no plano.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="max-h-[70vh] overflow-auto p-2"><ul>{roots.map((r) => <Node key={r.id} t={r} depth={0} />)}</ul></Card>
        {selTopic ? <TopicPanel key={selTopic.id} topic={selTopic} p={prog.get(selTopic.id)} /> : <Card className="text-sm text-muted">Selecione um assunto para registrar estudo, confiança e anotações.</Card>}
      </div>
    </div>
  )
}

function TopicPanel({ topic, p }: { topic: Topic; p?: TopicProgress }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState(p?.notes ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  async function save(patch: Partial<TopicProgress>) {
    try {
      await upsertProgress({ topic_id: topic.id, status: p?.status ?? 'nao_iniciado', confidence: p?.confidence ?? 0, ...patch })
      await qc.invalidateQueries({ queryKey: qk.progress })
      setMsg('Salvo.')
    } catch (e) { setMsg(errMsg(e)) }
  }
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{topic.name}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Situação
            <Select value={p?.status ?? 'nao_iniciado'} onChange={(e) => save({ status: e.target.value as TopicStatus })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label>Confiança (0–5)
            <Select value={p?.confidence ?? 0} onChange={(e) => save({ confidence: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </Select>
          </label>
        </div>
        <p className="text-xs text-muted">Último estudo: {p?.last_studied_at ? fmtDate(p.last_studied_at) : '—'}</p>
        <label className="block text-sm">Anotações (Markdown simples)
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p?.notes ?? '') && save({ notes })} />
        </label>
        {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
        <Button variant="secondary" onClick={() => setShow((s) => !s)}>{show ? 'Fechar check-in' : 'Registrar estudo de teoria'}</Button>
      </Card>
      {show && <Checkin topicId={topic.id} />}
    </div>
  )
}
