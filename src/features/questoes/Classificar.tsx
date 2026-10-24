import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lightbulb } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorBox, Field, PageTitle, Progress, Select, Spinner } from '@/components/ui'
import { getQuestion, replaceQuestionTopics } from '@/lib/api'
import { qk, useExams, useQuestionsLite, useTopics, useUserQuestionTopics } from '@/lib/queries'
import { rootIdOf, suggestTopics } from '@/lib/sugestao'
import { errMsg } from '@/lib/utils'
import { QuestionView } from './QuestionView'
import type { Topic } from '@/types/db'

/**
 * Classificação em lote por tópico do edital. As sugestões vêm de palavras-chave do OCR (apoio, não verdade):
 * nada é gravado sem o seu clique em "Salvar e próxima". Atalhos: Enter salva · ← → navega · P pula.
 */
export default function Classificar() {
  const qc = useQueryClient()
  const qs = useQuestionsLite(), exams = useExams(), topics = useTopics(), uqt = useUserQuestionTopics()
  const [year, setYear] = useState('')
  const [onlyNew, setOnlyNew] = useState(true)
  const [queue, setQueue] = useState<string[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [macro, setMacro] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const done = useMemo(() => new Set((uqt.data ?? []).map((r) => r.question_id)), [uqt.data])
  const minesOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of uqt.data ?? []) m.set(r.question_id, [...(m.get(r.question_id) ?? []), r.topic_id])
    return m
  }, [uqt.data])

  // Fila "congelada" ao mudar filtros (classificar não faz a questão sumir da tela na hora).
  const doneRef = useRef(done)
  doneRef.current = done
  useEffect(() => {
    if (!qs.data || !exams.data || uqt.isLoading) return
    const yearOf = new Map(exams.data.map((e) => [e.id, e.year]))
    const list = qs.data.filter((q) => (!year || yearOf.get(q.exam_id) === Number(year)) && (!onlyNew || !doneRef.current.has(q.id)))
    setQueue(list.map((q) => q.id)); setIdx(0)
  }, [qs.data, exams.data, uqt.isLoading, year, onlyNew])

  const curId = queue?.[idx]
  const question = useQuery({ queryKey: ['question', curId], queryFn: () => getQuestion(curId!), enabled: !!curId })
  const tree = useMemo(() => topics.data ?? [], [topics.data])
  const rootOf = useMemo(() => rootIdOf(tree), [tree])
  const roots = tree.filter((t) => !t.parent_id)
  const byParent = useMemo(() => {
    const m = new Map<string | null, Topic[]>()
    for (const t of tree) m.set(t.parent_id, [...(m.get(t.parent_id) ?? []), t])
    return m
  }, [tree])
  const leavesOf = (t: Topic): Topic[] => { const c = byParent.get(t.id); return c?.length ? c.flatMap(leavesOf) : [t] }

  // Ao trocar de questão: carrega a classificação existente e abre a macroárea sugerida.
  const suggestions = useMemo(() => suggestTopics(question.data?.ocr_body, tree).slice(0, 6), [question.data?.ocr_body, tree])
  useEffect(() => {
    if (!curId) return
    const mine = minesOf.get(curId) ?? []
    setSelected(new Set(mine))
    setMacro(mine.length ? rootOf(mine[0]) : null)
    setMsg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId])
  useEffect(() => { if (curId && !(minesOf.get(curId)?.length) && suggestions[0]) setMacro((m) => m ?? (suggestions[0].kind === 'macro' ? suggestions[0].topicId : rootOf(suggestions[0].topicId))) }, [curId, suggestions]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: number) => { if (queue && to >= 0 && to < queue.length) setIdx(to) }
  async function save() {
    if (!curId) return
    setSaving(true); setMsg(null)
    try {
      await replaceQuestionTopics(curId, [...selected])
      await qc.invalidateQueries({ queryKey: qk.uqt })
      setMsg({ ok: true, t: selected.size ? 'Classificação salva.' : 'Classificação removida.' })
      go(idx + 1)
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setSaving(false) }
  }
  const saveRef = useRef(save); saveRef.current = save
  const idxRef = useRef(idx); idxRef.current = idx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || e.ctrlKey || e.metaKey) return
      if (e.key === 'Enter') { e.preventDefault(); void saveRef.current() }
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'p') go(idxRef.current + 1)
      else if (e.key === 'ArrowLeft') go(idxRef.current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  if (qs.isLoading || exams.isLoading || topics.isLoading || uqt.isLoading || !queue) return <Spinner />
  if (qs.error || topics.error) return <ErrorBox error={qs.error ?? topics.error} retry={() => { qs.refetch(); topics.refetch() }} />

  const total = qs.data?.length ?? 0
  const yearOf = new Map((exams.data ?? []).map((e) => [e.id, e.year]))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (s: (typeof suggestions)[number]) => {
    if (s.kind === 'macro') setMacro(s.topicId)
    else { setMacro(rootOf(s.topicId)); setSelected((x) => new Set(x).add(s.topicId)) }
  }
  const activeRoot = roots.find((r) => r.id === macro)
  const name = (id: string) => tree.find((t) => t.id === id)?.name ?? '?'

  return (
    <div className="space-y-4">
      <PageTitle title="Classificar questões por tópico" sub="Sua classificação alimenta a análise por assunto e o plano do dia. Sugestões são só apoio." action={<Link to="/questoes" className="text-sm text-sea underline">← Banco</Link>} />
      <Card className="space-y-2">
        <Progress value={total ? done.size / total : 0} label="Questões classificadas" />
        <p className="text-sm text-muted">{done.size}/{total} classificadas · fila atual: {queue.length}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Ano"><Select value={year} onChange={(e) => setYear(e.target.value)}><option value="">Todos</option>{(exams.data ?? []).map((e) => <option key={e.id}>{e.year}</option>)}</Select></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Só não classificadas</label>
        </div>
      </Card>

      {!curId ? <Empty>{onlyNew ? 'Tudo classificado neste filtro. 🎉' : 'Nenhuma questão neste filtro.'}</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted"><span>{idx + 1}/{queue.length}</span><span>{yearOf.get(qs.data!.find((q) => q.id === curId)!.exam_id)}</span></div>
            {question.isLoading ? <Spinner /> : question.data ? <QuestionView q={question.data} exam={yearOf.get(question.data.exam_id)} /> : <ErrorBox error={question.error} />}
          </Card>

          <div className="space-y-3">
            <Card className="space-y-2">
              <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-warn" aria-hidden /> Sugestões (por palavras-chave do OCR)</h2>
              {suggestions.length === 0 ? <p className="text-sm text-muted">Sem sugestão para este texto. Escolha pela macroárea abaixo.</p> : (
                <ul className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <li key={`${s.kind}-${s.topicId}`}>
                      <button onClick={() => pick(s)} title={`Termos encontrados: ${s.hits.join(', ')}`} className="rounded-full border border-warn/50 bg-warn/10 px-3 py-1 text-sm hover:bg-warn/20">
                        {s.kind === 'macro' ? '▸ ' : '+ '}{s.name} <span className="text-xs text-muted">({s.hits.slice(0, 3).join(', ')})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">Confirme olhando a imagem: a sugestão pode errar (OCR e termos genéricos).</p>
            </Card>

            <Card className="space-y-2">
              <h2 className="font-semibold">1. Macroárea</h2>
              <div className="flex flex-wrap gap-1.5">
                {roots.map((r) => (
                  <button key={r.id} aria-pressed={macro === r.id} onClick={() => setMacro(r.id)}
                    className={`rounded-lg border px-2.5 py-1 text-sm ${macro === r.id ? 'border-navy bg-navy text-white dark:border-sea dark:bg-sea dark:text-[#06101f]' : 'border-line'}`}>{r.name}</button>
                ))}
              </div>
              <h2 className="pt-1 font-semibold">2. Assunto {selected.size > 0 && <span className="text-sm font-normal text-muted">({selected.size} selecionado(s))</span>}</h2>
              {activeRoot ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Assuntos de ${activeRoot.name}`}>
                  {leavesOf(activeRoot).map((l) => (
                    <button key={l.id} aria-pressed={selected.has(l.id)} onClick={() => toggle(l.id)}
                      className={`rounded-lg border px-2.5 py-1 text-sm ${selected.has(l.id) ? 'border-sea bg-sea/20 font-medium' : 'border-line'}`}>{l.name}</button>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">Escolha uma macroárea.</p>}
              {selected.size > 0 && (
                <p className="text-sm">Selecionados: {[...selected].map((id) => <Badge key={id} tone="sea" className="mr-1">{name(id)}</Badge>)}</p>
              )}
            </Card>

            <Card className="space-y-2">
              {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.t}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={save} loading={saving}>Salvar e próxima</Button>
                <Button variant="secondary" onClick={() => go(idx + 1)}>Pular</Button>
                <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)}>Anterior</Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
              </div>
              <p className="text-xs text-muted">Atalhos: <kbd>Enter</kbd> salva e avança · <kbd>←</kbd>/<kbd>→</kbd> navega · <kbd>P</kbd> pula.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
