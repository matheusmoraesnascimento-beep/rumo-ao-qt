import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Select, Spinner, Textarea } from '@/components/ui'
import { addFeedback, addPrompt, createSubmission, getFeedback, updateSubmission, uploadAttachment } from '@/lib/api'
import { qk, useAllFeedback, usePrompts, useSettings, useSubmissions } from '@/lib/queries'
import { isWritingDue, writingIntervalDays } from '@/lib/planner'
import { wordCount } from '@/lib/metrics'
import { errMsg, fmtDateTime } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import type { WritingSubmission } from '@/types/db'

const AXES = ['Tema/proposta', 'Tese', 'Argumentação', 'Coesão', 'Clareza', 'Gramática', 'Estrutura'] as const
const CHECKLIST = ['Tese clara na introdução', 'Dois argumentos com repertório', 'Proposta de intervenção completa (quem, o quê, como)', 'Conectivos entre parágrafos', 'Norma culta e pontuação revisadas', 'Linguagem formal e impessoal', 'Respeitei o tempo e o limite de linhas']

export default function Redacao() {
  const subs = useSubmissions(), prompts = usePrompts(), settings = useSettings(), fb = useAllFeedback()
  const qc = useQueryClient()
  const [openId, setOpenId] = useState<string | null>(null)
  const [promptId, setPromptId] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [np, setNp] = useState({ title: '', text: '', url: '' })

  const essays = useMemo(() => {
    const m = new Map<string, WritingSubmission[]>()
    for (const s of subs.data ?? []) m.set(s.essay_id, [...(m.get(s.essay_id) ?? []), s])
    return [...m.values()].map((v) => v.sort((a, b) => b.version - a.version))
  }, [subs.data])

  const recurring = useMemo(() => {
    const c = new Map<string, number>()
    for (const f of fb.data ?? []) for (const t of f.error_tags) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [fb.data])

  if (subs.isLoading || prompts.isLoading) return <Spinner />
  if (subs.error) return <ErrorBox error={subs.error} retry={() => subs.refetch()} />
  const cadence = settings.data?.writing_cadence ?? 'auto'
  const last = (subs.data ?? []).length ? new Date(Math.max(...(subs.data ?? []).map((s) => new Date(s.created_at).getTime()))) : null
  const every = writingIntervalDays(new Date(), cadence)
  const due = isWritingDue(new Date(), last, cadence)
  const open = (subs.data ?? []).find((s) => s.id === openId)

  async function start() {
    try {
      if (!promptId) throw new Error('Escolha um tema.')
      const s = await createSubmission({ prompt_id: promptId })
      await qc.invalidateQueries({ queryKey: qk.subs }); setOpenId(s.id); setMsg(null)
    } catch (e) { setMsg(errMsg(e)) }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Oficina de redação" sub={every ? `Cadência atual: a cada ${every} dias · ${due ? 'redação pendente' : 'em dia'}` : 'Cadência desligada'} />
      <Card className="space-y-2 text-sm">
        <p>Temas de treino são <strong>autorais e não oficiais</strong>, voltados a assuntos navais e nacionais (Amazônia Azul, soberania, ciência e tecnologia, cidadania). A rubrica é <strong>pedagógica e editável</strong>: não existe nota oficial da Marinha aqui.</p>
        {recurring.length > 0 && <p>Erros recorrentes: {recurring.map(([t, n]) => <Badge key={t} tone="warn" className="mr-1">{t} ×{n}</Badge>)}</p>}
      </Card>
      {!open ? (
        <>
          <Card className="space-y-3">
            <h2 className="font-semibold">Nova redação</h2>
            <Field label="Tema"><Select value={promptId} onChange={(e) => setPromptId(e.target.value)}><option value="">Escolha…</option>{(prompts.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}{p.owner_id ? ' (meu)' : ''}</option>)}</Select></Field>
            <Button onClick={start}>Começar</Button>
            {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
            <details>
              <summary className="cursor-pointer text-sm">Cadastrar tema de fonte externa (marcado como não oficial)</summary>
              <div className="mt-2 space-y-2">
                <Field label="Título"><Input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} /></Field>
                <Field label="Enunciado"><Textarea value={np.text} onChange={(e) => setNp({ ...np, text: e.target.value })} /></Field>
                <Field label="Fonte (URL)"><Input value={np.url} onChange={(e) => setNp({ ...np, url: e.target.value })} /></Field>
                <Button variant="secondary" disabled={!np.title.trim() || !np.text.trim()} onClick={async () => { try { const p = await addPrompt(np.title.trim(), np.text.trim(), np.url.trim() || undefined); setNp({ title: '', text: '', url: '' }); setPromptId(p.id); await qc.invalidateQueries({ queryKey: qk.prompts }) } catch (e) { setMsg(errMsg(e)) } }}>Salvar tema</Button>
              </div>
            </details>
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">Minhas redações</h2>
            {!essays.length ? <Empty>Nenhuma redação ainda.</Empty> : (
              <ul className="divide-y divide-line">
                {essays.map((v) => {
                  const s = v[0], p = prompts.data?.find((x) => x.id === s.prompt_id)
                  return (
                    <li key={s.essay_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div><div className="font-medium">{p?.title ?? 'Tema livre'}</div><div className="text-xs text-muted">v{s.version} · {s.word_count} palavras · {fmtDateTime(s.updated_at)}</div></div>
                      <div className="flex gap-2"><Badge tone={s.status === 'finalizada' ? 'ok' : 'warn'}>{s.status}</Badge><Button size="sm" variant="secondary" onClick={() => setOpenId(s.id)}>Abrir</Button></div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Editor key={open.id} sub={open} versions={essays.find((e) => e[0].essay_id === open.essay_id) ?? [open]} onClose={() => setOpenId(null)} onOpen={setOpenId}
          promptText={prompts.data?.find((p) => p.id === open.prompt_id)?.prompt_text} promptTitle={prompts.data?.find((p) => p.id === open.prompt_id)?.title} />
      )}
    </div>
  )
}

function Editor({ sub, versions, onClose, onOpen, promptText, promptTitle }: {
  sub: WritingSubmission; versions: WritingSubmission[]; onClose: () => void; onOpen: (id: string) => void; promptText?: string; promptTitle?: string
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(sub.draft)
  const [plan, setPlan] = useState(sub.plan ?? {})
  const [seconds, setSeconds] = useState(sub.writing_seconds)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<'salvo' | 'salvando' | 'erro'>('salvo')
  const [msg, setMsg] = useState<string | null>(null)
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false))
  const dirty = useRef(false)
  const locked = sub.status === 'finalizada'
  const words = wordCount(draft)

  useEffect(() => { if (!running) return; const i = setInterval(() => { setSeconds((s) => s + 1); dirty.current = true }, 1000); return () => clearInterval(i) }, [running])
  // Rascunho automático persistido (debounce).
  useEffect(() => {
    if (locked) return
    if (!dirty.current) { dirty.current = true; return }
    setStatus('salvando')
    const t = setTimeout(async () => {
      try { await updateSubmission(sub.id, { draft, plan, word_count: words, writing_seconds: seconds }); setStatus('salvo') } catch { setStatus('erro') }
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, plan, seconds, locked])

  async function newVersion() {
    try {
      await updateSubmission(sub.id, { draft, plan, word_count: words, writing_seconds: seconds, status: 'finalizada' })
      const n = await createSubmission({ essay_id: sub.essay_id, prompt_id: sub.prompt_id, version: sub.version + 1, draft, plan, word_count: words, writing_seconds: 0 })
      await qc.invalidateQueries({ queryKey: qk.subs }); onOpen(n.id)
    } catch (e) { setMsg(errMsg(e)) }
  }
  async function attach(f: File) {
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB.')
      const path = await uploadAttachment(sub.id, f)
      await updateSubmission(sub.id, { attachment_path: path } as Partial<WritingSubmission>)
      setMsg('Anexo enviado ao bucket privado.')
    } catch (e) { setMsg(errMsg(e)) }
  }
  const mm = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Button variant="ghost" size="sm" onClick={onClose}>← Voltar</Button>
        <div className="flex items-center gap-2 text-sm"><Badge tone={status === 'salvo' ? 'ok' : status === 'erro' ? 'bad' : 'warn'}>{status === 'salvo' ? 'rascunho salvo' : status === 'erro' ? 'erro ao salvar' : 'salvando…'}</Badge><Badge>v{sub.version}</Badge></div></div>
      <Card className="space-y-1"><h2 className="font-semibold">{promptTitle ?? 'Tema livre'}</h2>{promptText && <p className="text-sm">{promptText}</p>}</Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 lg:col-span-1">
          <h3 className="font-semibold">Planejamento</h3>
          {([['intro', 'Introdução (tese)'], ['dev', 'Desenvolvimento (argumentos)'], ['concl', 'Conclusão (proposta)'], ['repertorio', 'Repertório']] as const).map(([k, l]) => (
            <Field key={k} label={l}><Textarea disabled={locked} className="min-h-16" value={plan[k] ?? ''} onChange={(e) => setPlan({ ...plan, [k]: e.target.value })} /></Field>
          ))}
          <h3 className="pt-2 font-semibold">Checklist</h3>
          {CHECKLIST.map((c, i) => <label key={c} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checks[i]} onChange={() => setChecks(checks.map((v, j) => (j === i ? !v : v)))} />{c}</label>)}
        </Card>
        <Card className="space-y-2 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{words} palavras</span><span className="tabular-nums">⏱ {mm}</span>
            <Button size="sm" variant="secondary" disabled={locked} onClick={() => setRunning((r) => !r)}>{running ? 'Pausar' : 'Cronometrar'}</Button></div>
          <Textarea disabled={locked} aria-label="Texto da redação" className="min-h-[360px] text-base leading-relaxed" value={draft} onChange={(e) => { dirty.current = true; setDraft(e.target.value) }} />
          {locked && <p className="text-sm text-muted">Versão finalizada (somente leitura). Abra a versão mais recente para continuar.</p>}
          <div className="flex flex-wrap gap-2">
            {!locked && <Button onClick={newVersion}>Salvar como versão e continuar editando</Button>}
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm">Anexar PDF/imagem<input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} /></label>
          </div>
          {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
        </Card>
      </div>
      <Card className="space-y-2">
        <h3 className="font-semibold">Histórico de versões</h3>
        <ul className="flex flex-wrap gap-2">{versions.map((v) => <li key={v.id}><Button size="sm" variant={v.id === sub.id ? 'primary' : 'secondary'} onClick={() => onOpen(v.id)}>v{v.version} · {v.word_count} pal.</Button></li>)}</ul>
        {versions.length > 1 && (() => { const prev = versions.find((v) => v.version === sub.version - 1); return prev ? <details><summary className="cursor-pointer text-sm">Comparar com v{prev.version} (antes)</summary><div className="mt-2 grid gap-2 md:grid-cols-2"><pre className="whitespace-pre-wrap rounded border border-line p-2 text-xs">{prev.draft}</pre><pre className="whitespace-pre-wrap rounded border border-line p-2 text-xs">{draft}</pre></div></details> : null })()}
      </Card>
      <Feedback submissionId={sub.id} draft={draft} />
    </div>
  )
}

function Feedback({ submissionId, draft }: { submissionId: string; draft: string }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['fb', submissionId], queryFn: () => getFeedback(submissionId) })
  const [rubric, setRubric] = useState<Record<string, number>>({})
  const [comments, setComments] = useState('')
  const [para, setPara] = useState('')
  const [paraN, setParaN] = useState(1)
  const [paras, setParas] = useState<{ paragraph: number; text: string }[]>([])
  const [tags, setTags] = useState('')
  const [who, setWho] = useState<'self' | 'teacher'>('self')
  const [msg, setMsg] = useState<string | null>(null)
  const nParas = Math.max(1, draft.split(/\n\s*\n/).filter((x) => x.trim()).length)
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">Correção (rubrica pedagógica — não é nota oficial)</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AXES.map((a) => <Field key={a} label={`${a} (0–10)`}><Input type="number" min={0} max={10} value={rubric[a] ?? ''} onChange={(e) => setRubric({ ...rubric, [a]: Math.max(0, Math.min(10, Number(e.target.value))) })} /></Field>)}
      </div>
      <Field label="Comentário geral"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Parágrafo"><Select value={paraN} onChange={(e) => setParaN(Number(e.target.value))}>{Array.from({ length: nParas }, (_, i) => <option key={i}>{i + 1}</option>)}</Select></Field>
        <div className="min-w-48 flex-1"><Field label="Comentário do parágrafo"><Input value={para} onChange={(e) => setPara(e.target.value)} /></Field></div>
        <Button variant="secondary" disabled={!para.trim()} onClick={() => { setParas([...paras, { paragraph: paraN, text: para.trim() }]); setPara('') }}>Adicionar</Button>
      </div>
      {paras.map((p, i) => <p key={i} className="text-sm">§{p.paragraph}: {p.text}</p>)}
      <Field label="Erros recorrentes (vírgulas: coesão, concordância, pontuação, tese, repertório…)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      <div className="flex items-end gap-2">
        <Field label="Quem corrigiu"><Select value={who} onChange={(e) => setWho(e.target.value as 'self' | 'teacher')}><option value="self">Eu mesmo</option><option value="teacher">Professor</option></Select></Field>
        <Button onClick={async () => {
          try {
            await addFeedback({ submission_id: submissionId, rubric, comments: comments || null, paragraph_comments: paras, error_tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), reviewer_type: who })
            setComments(''); setParas([]); setTags(''); setRubric({}); setMsg('Correção salva.')
            qc.invalidateQueries({ queryKey: ['fb', submissionId] }); qc.invalidateQueries({ queryKey: qk.feedback })
          } catch (e) { setMsg(errMsg(e)) }
        }}>Salvar correção</Button>
      </div>
      {msg && <p role="status" className="text-sm text-muted">{msg}</p>}
      {(list.data ?? []).map((f) => (
        <div key={f.id} className="rounded-lg border border-line p-2 text-sm">
          <div className="text-xs text-muted">{fmtDateTime(f.created_at)} · {f.reviewer_type === 'self' ? 'autocorreção' : 'professor'}</div>
          <div>{Object.entries(f.rubric).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
          {f.comments && <p>{f.comments}</p>}
          {f.paragraph_comments.map((p, i) => <p key={i}>§{p.paragraph}: {p.text}</p>)}
          <div className="mt-1 flex gap-1">{f.error_tags.map((t) => <Badge key={t} tone="warn">{t}</Badge>)}</div>
        </div>
      ))}
    </Card>
  )
}
