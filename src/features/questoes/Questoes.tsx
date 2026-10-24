import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { useAttempts, useExams, useFlags, useQuestionsLite, useTopics, useUserQuestionTopics } from '@/lib/queries'
import { searchQuestionText } from '@/lib/api'
import { balancedMix, filterQuestions, lastGrades, type QCtx, type QFilters } from '@/lib/filtros'

export default function Questoes() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const qs = useQuestionsLite(), exams = useExams(), attempts = useAttempts(), flags = useFlags(), uqt = useUserQuestionTopics(), topics = useTopics()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const modo = params.get('modo')
  const f: QFilters = {
    year: params.get('ano') ? Number(params.get('ano')) : modo === '2026' ? 2026 : undefined,
    number: params.get('n') ? Number(params.get('n')) : undefined,
    topicId: params.get('topico') || undefined,
    ocr: params.get('ocr') || undefined,
    status: (params.get('status') as QFilters['status']) ?? (modo === 'ineditas' ? 'inedita' : modo === 'erros' ? 'errei' : 'todas'),
    favorite: params.get('fav') === '1',
    figure: params.get('fig') === '1',
  }
  const textRes = useQuery({ queryKey: ['qtext', submitted], queryFn: () => searchQuestionText(submitted), enabled: submitted.length >= 3 })

  const ctx: QCtx | null = useMemo(() => {
    if (!exams.data) return null
    const topicsOf = new Map<string, string[]>()
    for (const r of uqt.data ?? []) topicsOf.set(r.question_id, [...(topicsOf.get(r.question_id) ?? []), r.topic_id])
    return {
      yearOf: new Map(exams.data.map((e) => [e.id, e.year])),
      attempts: attempts.data ?? [],
      favorites: new Set((flags.data ?? []).filter((x) => x.favorite).map((x) => x.question_id)),
      topicsOf,
    }
  }, [exams.data, attempts.data, flags.data, uqt.data])

  const list = useMemo(() => {
    if (!qs.data || !ctx) return []
    return filterQuestions(qs.data, { ...f, textIds: submitted.length >= 3 ? new Set(textRes.data ?? []) : null }, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs.data, ctx, params, submitted, textRes.data])

  if (qs.isLoading || exams.isLoading) return <Spinner />
  if (qs.error) return <ErrorBox error={qs.error} retry={() => qs.refetch()} />
  if (!ctx) return <Spinner />

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const grades = lastGrades(ctx.attempts)
  const tried = new Set(ctx.attempts.map((a) => a.question_id))
  const yearOf = (id: string) => ctx.yearOf.get(id)

  function start(ids: string[]) {
    if (!ids.length) return
    nav(`/questoes/${ids[0]}`, { state: { queue: ids, idx: 0 } })
  }
  const round = (n: number) => {
    const pool = filterQuestions(qs.data!, { status: 'inedita' }, ctx)
    start(balancedMix(pool.length >= n ? pool : qs.data!, ctx, n, `rodada-${Date.now()}`).map((q) => q.id))
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Banco de questões 2022–2026" sub={`${list.length} de ${qs.data?.length ?? 0} · gabarito não incluído; a resposta é sua autoavaliação`} />
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setParams({ modo: 'ineditas' })}>Inéditas para mim</Button>
          <Button size="sm" variant="secondary" onClick={() => setParams({ modo: 'erros' })}>Que errei</Button>
          <Button size="sm" variant="secondary" onClick={() => setParams({ modo: '2026' })}>Questões de 2026</Button>
          <Button size="sm" variant="secondary" onClick={() => setParams({})}>Limpar filtros</Button>
          <span className="mx-1 self-center text-sm text-muted">Rodada rápida:</span>
          {[5, 10, 20].map((n) => <Button key={n} size="sm" onClick={() => round(n)}>{n}</Button>)}
          <Button size="sm" variant="secondary" onClick={() => start(balancedMix(list, ctx, Math.min(20, list.length), `mix-${Date.now()}`).map((q) => q.id))}>Mistura equilibrada (20)</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Ano"><Select value={params.get('ano') ?? ''} onChange={(e) => set('ano', e.target.value)}><option value="">Todos</option>{exams.data!.map((e) => <option key={e.id}>{e.year}</option>)}</Select></Field>
          <Field label="Questão nº"><Input type="number" min={1} max={50} value={params.get('n') ?? ''} onChange={(e) => set('n', e.target.value)} /></Field>
          <Field label="Tópico (sua classificação)"><Select value={params.get('topico') ?? ''} onChange={(e) => set('topico', e.target.value)}><option value="">Todos</option>{(topics.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Conferência OCR"><Select value={params.get('ocr') ?? ''} onChange={(e) => set('ocr', e.target.value)}><option value="">Todas</option><option value="pending_review">Pendente</option><option value="needs_manual_transcription">Transcrição manual</option><option value="reviewed">Conferida</option></Select></Field>
          <Field label="Situação"><Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="todas">Todas</option><option value="inedita">Inéditas</option><option value="resolvida">Já resolvidas</option><option value="errei">Errei</option><option value="acertei">Acertei</option></Select></Field>
          <Field label="Palavra-chave (OCR)"><form onSubmit={(e) => { e.preventDefault(); setSubmitted(text.trim()) }}><Input value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setSubmitted('') }} placeholder="Enter para buscar" /></form></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.favorite} onChange={(e) => set('fav', e.target.checked ? '1' : '')} /> Favoritas</label>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.figure} onChange={(e) => set('fig', e.target.checked ? '1' : '')} /> Com figura/código</label>
        </div>
      </Card>
      {!list.length ? <Empty>Nenhuma questão com esses filtros.</Empty> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {list.map((q) => {
            const g = grades.get(q.id)
            return (
              <Link key={q.id} to={`/questoes/${q.id}`} state={{ queue: list.map((x) => x.id), idx: list.findIndex((x) => x.id === q.id) }}
                className="rounded-xl border border-line bg-surface p-3 text-sm hover:border-sea">
                <div className="flex items-center justify-between"><strong>{yearOf(q.exam_id)} · Q{String(q.number).padStart(2, '0')}</strong>{ctx.favorites.has(q.id) && <Star className="size-4 fill-current text-warn" aria-label="favorita" />}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!tried.has(q.id) ? <Badge>inédita</Badge> : g === 'acertei' ? <Badge tone="ok">acertei</Badge> : g === 'errei' ? <Badge tone="bad">errei</Badge> : <Badge tone="sea">feita</Badge>}
                  {q.ocr_status !== 'reviewed' && <Badge tone="warn">OCR</Badge>}
                  {q.has_figure && <Badge tone="sea">fig</Badge>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
