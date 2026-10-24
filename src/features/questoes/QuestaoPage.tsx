import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { Badge, Button, Card, ErrorBox, Field, Input, Select, Spinner, Textarea } from '@/components/ui'
import { addAttempt, createCard, getQuestion, reportQuestion, setFlag, setUserQuestionTopic } from '@/lib/api'
import { qk, useExams, useFlags, useTopics, useUserQuestionTopics } from '@/lib/queries'
import { firstDueAt } from '@/lib/srs'
import { errMsg } from '@/lib/utils'
import { QuestionView } from './QuestionView'
import { AnswerPanel, type AnswerState } from './AnswerPanel'

export default function QuestaoPage() {
  const { id = '' } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const state = loc.state as { queue?: string[]; idx?: number } | null
  const q = useQuery({ queryKey: ['question', id], queryFn: () => getQuestion(id) })
  const exams = useExams(), flags = useFlags(), topics = useTopics(), uqt = useUserQuestionTopics()
  const [ans, setAns] = useState<AnswerState>({ selected: null, selfGrade: null, confidence: null })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const t0 = useRef(Date.now())
  const [report, setReport] = useState('')

  useEffect(() => { t0.current = Date.now(); setAns({ selected: null, selfGrade: null, confidence: null }); setSaved(false); setMsg(null) }, [id])

  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <ErrorBox error={q.error ?? 'Questão não encontrada'} retry={() => q.refetch()} />
  const question = q.data
  const year = exams.data?.find((e) => e.id === question.exam_id)?.year
  const flag = flags.data?.find((f) => f.question_id === id)
  const mine = new Set((uqt.data ?? []).filter((r) => r.question_id === id).map((r) => r.topic_id))
  const parents = new Set((topics.data ?? []).map((t) => t.parent_id))
  const leaves = (topics.data ?? []).filter((t) => !parents.has(t.id))
  const queue = state?.queue, idx = state?.idx ?? 0
  const go = (to: number) => queue && queue[to] && nav(`/questoes/${queue[to]}`, { state: { queue, idx: to } })

  async function save() {
    if (!ans.selected && !ans.selfGrade) { setMsg({ ok: false, t: 'Escolha uma alternativa ou faça a autoavaliação.' }); return }
    setSaving(true); setMsg(null)
    try {
      const secs = Math.min(86400, Math.max(0, Math.round((Date.now() - t0.current) / 1000)))
      await addAttempt({ question_id: id, selected_option: ans.selected, self_grade: ans.selfGrade, confidence: ans.confidence, time_seconds: secs })
      setSaved(true)
      await qc.invalidateQueries({ queryKey: qk.attempts })
      setMsg({ ok: true, t: 'Resposta registrada.' })
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setSaving(false) }
  }
  async function errorCard() {
    try {
      await createCard({ question_id: id, front: `Reveja a questão ${question.code} (${year}, nº ${question.number}) — por que errei?`, back: ans.selected ? `Marquei ${ans.selected}.` : '', due_at: firstDueAt(new Date()).toISOString() })
      await qc.invalidateQueries({ queryKey: qk.cards })
      setMsg({ ok: true, t: 'Card de revisão criado para amanhã.' })
    } catch (e) { setMsg({ ok: false, t: /duplicate|23505|unique/i.test(errMsg(e)) ? 'Já existe card de revisão para esta questão.' : errMsg(e) }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/questoes" className="text-sm text-sea underline">← Banco de questões</Link>
        <div className="flex items-center gap-2">
          {queue && <span className="text-sm text-muted">{idx + 1}/{queue.length}</span>}
          <Button size="sm" variant="secondary" disabled={!queue || idx <= 0} onClick={() => go(idx - 1)}>Anterior</Button>
          <Button size="sm" variant="secondary" disabled={!queue || idx >= queue.length - 1} onClick={() => go(idx + 1)}>Próxima</Button>
        </div>
      </div>
      <Card><QuestionView q={question} exam={year} /></Card>
      <Card className="space-y-3">
        <AnswerPanel value={ans} onChange={setAns} />
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.t}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={saving} disabled={saved}>Salvar resposta</Button>
          {saved && ans.selfGrade === 'errei' && <Button variant="secondary" onClick={errorCard}>Criar card de revisão do erro</Button>}
          {saved && queue && idx < queue.length - 1 && <Button variant="secondary" onClick={() => go(idx + 1)}>Próxima questão</Button>}
        </div>
        <p className="text-xs text-muted">Sem gabarito no sistema: nenhuma correção automática. “Acertei/Errei” é sua conferência (autodeclarada).</p>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={async () => { await setFlag(id, { favorite: !flag?.favorite }); qc.invalidateQueries({ queryKey: qk.flags }) }}>
            <Star className={`size-4 ${flag?.favorite ? 'fill-current text-warn' : ''}`} /> {flag?.favorite ? 'Favorita' : 'Favoritar'}
          </Button>
          {(flag?.tags ?? []).map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <Field label="Tags manuais (separadas por vírgula)">
          <Input defaultValue={(flag?.tags ?? []).join(', ')} key={`${id}-${flag?.tags?.join()}`}
            onBlur={async (e) => { const tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12); await setFlag(id, { tags }); qc.invalidateQueries({ queryKey: qk.flags }) }} />
        </Field>
        <Field label="Classificar por tópico do edital (sua classificação)" hint="Alimenta a análise por tópico. Sem classificação, nada é inventado.">
          <Select value="" onChange={async (e) => { if (e.target.value) { await setUserQuestionTopic(id, e.target.value, true); qc.invalidateQueries({ queryKey: qk.uqt }) } }}>
            <option value="">Adicionar tópico…</option>
            {leaves.filter((t) => !mine.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-1">
          {[...mine].map((tid) => (
            <button key={tid} className="rounded-full bg-sea/15 px-2 py-0.5 text-xs" title="Remover" onClick={async () => { await setUserQuestionTopic(id, tid, false); qc.invalidateQueries({ queryKey: qk.uqt }) }}>
              {topics.data?.find((t) => t.id === tid)?.name} ✕
            </button>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm">Reportar transcrição incorreta</summary>
          <div className="mt-2 space-y-2">
            <Textarea value={report} onChange={(e) => setReport(e.target.value)} placeholder="O que está errado no texto OCR?" />
            <Button size="sm" variant="secondary" disabled={report.trim().length < 3}
              onClick={async () => { try { await reportQuestion(id, report.trim()); setReport(''); setMsg({ ok: true, t: 'Relato enviado.' }) } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } }}>Enviar relato</Button>
          </div>
        </details>
      </Card>
    </div>
  )
}
