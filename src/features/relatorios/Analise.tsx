import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Empty, ErrorBox, PageTitle, Spinner, Stat } from '@/components/ui'
import { useStudyData } from '@/features/dashboard/usePlan'
import { useExams, useSimulations, useAllFeedback } from '@/lib/queries'
import { fmtPct, selfRate, verifiedRate } from '@/lib/metrics'
import { formatInTimeZone } from 'date-fns-tz'
import { DEFAULT_TZ } from '@/lib/srs'

const axis = { fontSize: 11, fill: 'var(--color-muted)' }

export default function Analise() {
  const d = useStudyData()
  const exams = useExams(), sims = useSimulations(), fb = useAllFeedback()

  const m = useMemo(() => {
    if (!exams.data) return null
    const yearOf = new Map(exams.data.map((e) => [e.id, e.year]))
    const qYear = new Map(d.questions.map((q) => [q.id, yearOf.get(q.exam_id)!]))
    const qOcr = new Map(d.questions.map((q) => [q.id, q.ocr_status]))
    const byYear = new Map<number, typeof d.attempts>()
    const byOcr = new Map<string, typeof d.attempts>()
    const byTopic = new Map<string, typeof d.attempts>()
    const topicsOf = new Map<string, string[]>()
    for (const r of d.uqt) topicsOf.set(r.question_id, [...(topicsOf.get(r.question_id) ?? []), r.topic_id])
    const firstSeen = new Set<string>()
    let firsts = 0, repeats = 0
    for (const a of [...d.attempts].reverse()) {
      if (firstSeen.has(a.question_id)) repeats++; else { firstSeen.add(a.question_id); firsts++ }
      const y = qYear.get(a.question_id); if (y) byYear.set(y, [...(byYear.get(y) ?? []), a])
      const o = qOcr.get(a.question_id); if (o) byOcr.set(o, [...(byOcr.get(o) ?? []), a])
      for (const t of topicsOf.get(a.question_id) ?? []) byTopic.set(t, [...(byTopic.get(t) ?? []), a])
    }
    const rate = (x: typeof d.attempts) => { const r = selfRate(x); return r === null ? null : Math.round(r * 100) }
    const yearRows = [2022, 2023, 2024, 2025, 2026].map((y) => ({ ano: String(y), autodeclarado: rate(byYear.get(y) ?? []), feitas: byYear.get(y)?.length ?? 0 }))
    const topicRows = [...byTopic].map(([t, a]) => ({ topico: d.topics.find((x) => x.id === t)?.name ?? '?', autodeclarado: rate(a), feitas: a.length })).sort((a, b) => (a.autodeclarado ?? 101) - (b.autodeclarado ?? 101)).slice(0, 12)
    // tempo investido x progresso por macroárea
    const minutes = new Map<string, number>()
    for (const s of d.sessions) if (s.topic_id) minutes.set(s.topic_id, (minutes.get(s.topic_id) ?? 0) + Number(s.duration_minutes))
    const topicById = new Map(d.topics.map((t) => [t.id, t]))
    const rootOf = (id: string): string => { let t = topicById.get(id); while (t?.parent_id) t = topicById.get(t.parent_id); return t?.name ?? '?' }
    const macro = new Map<string, { min: number; total: number; done: number }>()
    const parents = new Set(d.topics.map((t) => t.parent_id))
    for (const t of d.topics) {
      if (parents.has(t.id)) continue
      const r = rootOf(t.id), e = macro.get(r) ?? { min: 0, total: 0, done: 0 }
      e.total++; e.min += minutes.get(t.id) ?? 0
      if ((d.progress.find((p) => p.topic_id === t.id)?.status ?? 'nao_iniciado') !== 'nao_iniciado') e.done++
      macro.set(r, e)
    }
    const macroRows = [...macro].map(([nome, e]) => ({ nome, minutos: Math.round(e.min), cobertura: Math.round((e.done / e.total) * 100) }))
    // heatmap semanal (12 semanas)
    const heat = new Map<string, number>()
    for (const s of d.sessions) { const k = formatInTimeZone(new Date(s.started_at), DEFAULT_TZ, 'yyyy-MM-dd'); heat.set(k, (heat.get(k) ?? 0) + Number(s.duration_minutes)) }
    const days = Array.from({ length: 84 }, (_, i) => { const dt = new Date(Date.now() - (83 - i) * 86400000); const k = formatInTimeZone(dt, DEFAULT_TZ, 'yyyy-MM-dd'); return { k, min: heat.get(k) ?? 0 } })
    // distribuição 2022–2025 x 2026 por tópico (apenas dados classificados)
    const dist = (years: number[]) => { const c = new Map<string, number>(); for (const q of d.questions) { if (!years.includes(qYear.get(q.id)!)) continue; for (const t of topicsOf.get(q.id) ?? []) c.set(t, (c.get(t) ?? 0) + 1) } return c }
    const old = dist([2022, 2023, 2024, 2025]), nw = dist([2026])
    const allT = new Set([...old.keys(), ...nw.keys()])
    const distRows = [...allT].map((t) => ({ topico: d.topics.find((x) => x.id === t)?.name ?? '?', '2022–2025': old.get(t) ?? 0, '2026': nw.get(t) ?? 0 }))
    const classified = new Set(d.uqt.map((r) => r.question_id)).size
    return { yearRows, topicRows, macroRows, days, distRows, classified, firsts, repeats, byOcr: [...byOcr].map(([k, a]) => ({ status: k, autodeclarado: rate(a), feitas: a.length })), recurrent: (() => { const c = new Map<string, number>(); for (const f of fb.data ?? []) for (const t of f.error_tags) c.set(t, (c.get(t) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8) })() }
  }, [d, exams.data, fb.data])

  if (d.loading || exams.isLoading) return <Spinner />
  if (d.error) return <ErrorBox error={d.error} retry={d.refetch} />
  if (!m) return <Spinner />

  const cardsWeek = 0
  const reviewed = d.cards.reduce((n, c) => n + c.review_count, 0)
  const maxMin = Math.max(30, ...m.days.map((x) => x.min))
  const doneSims = (sims.data ?? []).filter((s) => s.status === 'finalizado').length
  const done250 = new Set(d.attempts.map((a) => a.question_id)).size
  const pendOcr = d.questions.filter((q) => q.ocr_status !== 'reviewed').length

  return (
    <div className="space-y-4">
      <PageTitle title="Painel de análise" sub="Dados descritivos do seu uso — não preveem a prova. Taxas são autodeclaradas; verificada: N/A (sem gabarito)." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Questões feitas" value={d.attempts.length} sub={`${done250} distintas de ${d.questions.length}`} />
        <Stat label="Taxa autodeclarada" value={fmtPct(selfRate(d.attempts))} sub={`Verificada: ${fmtPct(verifiedRate(d.attempts))}`} />
        <Stat label="Simulados" value={doneSims} />
        <Stat label="Redações" value={new Set(d.subs.map((s) => s.essay_id)).size} />
        <Stat label="Revisões cumpridas" value={reviewed + cardsWeek} />
        <Stat label="Inéditas × repetidas" value={`${m.firsts} / ${m.repeats}`} />
        <Stat label="Transcrições OCR pendentes" value={pendOcr} sub="de 250" />
        <Stat label="Classificadas por tópico" value={m.classified} sub="por você" />
      </div>

      <Card><h2 className="mb-2 font-semibold">Frequência de estudo (12 semanas, minutos/dia)</h2>
        <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto" role="img" aria-label="Mapa de calor semanal de estudo">
          {m.days.map((x) => <div key={x.k} title={`${x.k}: ${Math.round(x.min)} min`} className="size-4 rounded-sm border border-line" style={{ background: x.min ? `color-mix(in srgb, var(--color-sea) ${Math.max(15, Math.round((x.min / maxMin) * 100))}%, transparent)` : 'transparent' }} />)}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Por ano (acertos autodeclarados, %)</h2>
          <div className="h-52"><ResponsiveContainer><BarChart data={m.yearRows}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" /><XAxis dataKey="ano" tick={axis} /><YAxis domain={[0, 100]} tick={axis} /><Tooltip /><Bar dataKey="autodeclarado" fill="var(--color-sea)" /></BarChart></ResponsiveContainer></div></Card>
        <Card><h2 className="mb-2 font-semibold">Por tópico (somente questões que você classificou)</h2>
          {m.topicRows.length ? <div className="h-52"><ResponsiveContainer><BarChart data={m.topicRows} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" /><XAxis type="number" domain={[0, 100]} tick={axis} /><YAxis type="category" dataKey="topico" width={110} tick={axis} /><Tooltip /><Bar dataKey="autodeclarado" fill="var(--color-sea)" /></BarChart></ResponsiveContainer></div> : <Empty>Classifique questões por tópico (na tela da questão) para ver este gráfico. Nada é estimado automaticamente.</Empty>}</Card>
        <Card><h2 className="mb-2 font-semibold">Tempo investido × cobertura por macroárea</h2>
          <div className="h-60"><ResponsiveContainer><BarChart data={m.macroRows}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" /><XAxis dataKey="nome" tick={{ ...axis, fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={70} /><YAxis tick={axis} /><Tooltip /><Legend /><Bar dataKey="minutos" fill="var(--color-sea)" name="minutos" /><Bar dataKey="cobertura" fill="var(--color-ok)" name="cobertura %" /></BarChart></ResponsiveContainer></div></Card>
        <Card><h2 className="mb-2 font-semibold">2022–2025 × 2026 (questões classificadas)</h2>
          {m.distRows.length ? <div className="h-60"><ResponsiveContainer><BarChart data={m.distRows}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" /><XAxis dataKey="topico" tick={{ ...axis, fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={70} /><YAxis allowDecimals={false} tick={axis} /><Tooltip /><Legend /><Bar dataKey="2022–2025" fill="var(--color-muted)" /><Bar dataKey="2026" fill="var(--color-sea)" /></BarChart></ResponsiveContainer></div> : <Empty>Sem questões classificadas ainda. Não é possível comparar distribuições; descritivo, sem garantia de peso futuro.</Empty>}</Card>
      </div>

      <Card><h2 className="mb-2 font-semibold">Por status da transcrição OCR</h2>
        {m.byOcr.length ? <ul className="text-sm">{m.byOcr.map((r) => <li key={r.status}>{r.status}: {r.feitas} tentativas · {r.autodeclarado === null ? 'N/A' : `${r.autodeclarado}%`} autodeclarado</li>)}</ul> : <Empty>Sem tentativas.</Empty>}
        {m.recurrent.length > 0 && <p className="mt-2 text-sm">Erros recorrentes na redação: {m.recurrent.map(([t, n]) => `${t} (${n})`).join(', ')}</p>}
      </Card>
    </div>
  )
}
