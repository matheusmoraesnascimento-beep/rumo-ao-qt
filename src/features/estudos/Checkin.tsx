import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui'
import { addSession, createCard, upsertProgress } from '@/lib/api'
import { qk, useProgress, useTopics } from '@/lib/queries'
import { firstDueAt } from '@/lib/srs'
import { errMsg } from '@/lib/utils'
import type { SessionKind, TopicStatus } from '@/types/db'

const schema = z.object({
  topic_id: z.string().min(1, 'Escolha um tópico'),
  minutes: z.coerce.number().min(1, 'Mínimo 1 min').max(1440, 'Máximo 1440 min'),
  kind: z.enum(['teoria', 'revisao', 'questoes', 'simulado', 'redacao']),
  status: z.enum(['estudando', 'revisando', 'consolidado']),
  confidence: z.coerce.number().min(0).max(5),
  source: z.string().max(300).optional(),
  notes: z.string().max(5000).optional(),
  card_front: z.string().max(4000).optional(),
  card_back: z.string().max(8000).optional(),
  date: z.string().optional(), // sessão retroativa (yyyy-MM-dd)
})
type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

/** Registro de sessão/check-in de teoria: salva sessão, progresso do tópico e (opcional) card de revisão. */
export function Checkin({ topicId, minutes, retroactive, onDone }: {
  topicId?: string; minutes?: number; retroactive?: boolean; onDone?: () => void
}) {
  const qc = useQueryClient()
  const topics = useTopics()
  const progress = useProgress()
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const parents = new Set((topics.data ?? []).map((t) => t.parent_id))
  const leaves = (topics.data ?? []).filter((t) => !parents.has(t.id))
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { topic_id: topicId ?? '', minutes: minutes ? Math.max(1, Math.round(minutes)) : 25, kind: 'teoria', status: 'estudando', confidence: 2 },
  })

  async function onSubmit(v: FormOut) {
    setMsg(null)
    try {
      const end = v.date && retroactive ? new Date(`${v.date}T21:00:00-03:00`) : new Date()
      if (end.getTime() > Date.now() + 60_000) throw new Error('Data no futuro.')
      const start = new Date(end.getTime() - v.minutes * 60_000)
      await addSession({
        topic_id: v.topic_id, started_at: start.toISOString(), ended_at: end.toISOString(), duration_minutes: v.minutes,
        kind: v.kind as SessionKind, source: v.source || null, notes: v.notes || null, retroactive: !!retroactive,
      })
      const prev = progress.data?.find((p) => p.topic_id === v.topic_id)
      const later = prev?.last_studied_at && new Date(prev.last_studied_at) > end
      await upsertProgress({
        topic_id: v.topic_id, status: v.status as TopicStatus, confidence: v.confidence,
        first_studied_at: prev?.first_studied_at ?? end.toISOString(),
        last_studied_at: later ? prev!.last_studied_at! : end.toISOString(),
      })
      if (v.card_front?.trim()) {
        await createCard({ front: v.card_front.trim(), back: v.card_back?.trim() ?? '', topic_id: v.topic_id, due_at: firstDueAt(end).toISOString() })
      }
      await Promise.all([qk.sessions, qk.progress, qk.cards].map((k) => qc.invalidateQueries({ queryKey: k })))
      setMsg({ ok: true, t: 'Sessão salva.' })
      reset({ ...v, notes: '', card_front: '', card_back: '' })
      onDone?.()
    } catch (e) {
      setMsg({ ok: false, t: errMsg(e) })
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Field label="Tópico" error={errors.topic_id?.message}>
            <Select {...register('topic_id')}>
              <option value="">Selecione…</option>
              {leaves.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Minutos" error={errors.minutes?.message}><Input type="number" min={1} max={1440} {...register('minutes')} /></Field>
        <Field label="Tipo"><Select {...register('kind')}><option value="teoria">Teoria</option><option value="revisao">Revisão</option><option value="questoes">Questões</option><option value="simulado">Simulado</option><option value="redacao">Redação</option></Select></Field>
        <Field label="Situação do tópico"><Select {...register('status')}><option value="estudando">Estudando</option><option value="revisando">Revisando</option><option value="consolidado">Consolidado</option></Select></Field>
        <Field label="Confiança (0–5)"><Input type="number" min={0} max={5} {...register('confidence')} /></Field>
        {retroactive && <Field label="Data da sessão" error={errors.date?.message}><Input type="date" {...register('date')} /></Field>}
        <Field label="Fonte / link (opcional)"><Input {...register('source')} placeholder="Livro, curso, URL…" /></Field>
        <div className="sm:col-span-2"><Field label="Anotações (Markdown simples)"><Textarea {...register('notes')} /></Field></div>
        <div className="sm:col-span-2 grid gap-3 rounded-lg border border-dashed border-line p-3">
          <p className="text-sm font-medium">Criar card de revisão (opcional)</p>
          <Field label="Frente"><Input {...register('card_front')} placeholder="Pergunta / conceito" /></Field>
          <Field label="Verso"><Textarea {...register('card_back')} className="min-h-16" /></Field>
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`sm:col-span-2 text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.t}</p>}
        <div className="sm:col-span-2"><Button type="submit" loading={isSubmitting}>Salvar sessão</Button></div>
      </form>
    </Card>
  )
}
