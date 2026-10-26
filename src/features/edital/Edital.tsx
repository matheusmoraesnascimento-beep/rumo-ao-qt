import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, Card, ErrorBox, PageTitle, Progress, Spinner } from '@/components/ui'
import { useProgress, useTopics, useUserQuestionTopics } from '@/lib/queries'
import type { Topic, TopicStatus } from '@/types/db'

const STATUS: Record<TopicStatus, string> = { nao_iniciado: 'Não iniciado', estudando: 'Estudando', revisando: 'Revisando', consolidado: 'Consolidado' }
const TONE = { nao_iniciado: 'neutral', estudando: 'warn', revisando: 'sea', consolidado: 'ok' } as const

export default function Edital() {
  const topics = useTopics(), progress = useProgress(), uqt = useUserQuestionTopics()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

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
          <button className="flex-1 text-left text-sm" onClick={() => (kids.length ? toggle(t.id) : navigate(`/edital/${t.id}`))}>
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

  return (
    <div className="space-y-4">
      <PageTitle title="Edital e trilha" sub="CP-T/2026 (base provisória, não é promessa de cobrança em 2027)" />
      <Card className="space-y-2">
        <Progress value={allLeaves.length ? started / allLeaves.length : 0} label="Cobertura do edital" />
        <p className="text-sm text-muted">{started}/{allLeaves.length} assuntos iniciados. Assuntos sem questões históricas também entram no plano.</p>
      </Card>
      <Card className="max-h-[70vh] overflow-auto p-2"><ul>{roots.map((r) => <Node key={r.id} t={r} depth={0} />)}</ul></Card>
    </div>
  )
}
