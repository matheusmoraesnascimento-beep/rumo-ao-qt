import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/utils'
import { useIdempotentCommand, useRefreshCycles } from './api'
import type { CyclesContext } from './useCycles'

const LABEL: Record<string, string> = {
  estudando: 'Estudando',
  revisando: 'Revisando',
  consolidado: 'Consolidado',
}

export function ImportLegacy({ d }: { d: CyclesContext }) {
  const command = useIdempotentCommand()
  const refresh = useRefreshCycles()
  const plan = d.plan!
  const inPlan = new Set(d.items.map((i) => i.topic_id))
  const done = new Set(
    d.stages.filter((s) => s.passage_number === 1 && s.status === 'completed').map((s) => s.topic_id),
  )
  const candidates = d.leaves.filter((t) => {
    const status = d.progress.find((p) => p.topic_id === t.id)?.status
    return status && status !== 'nao_iniciado' && inPlan.has(t.id) && !done.has(t.id)
  })
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const chosen = candidates.filter((t) => !skip.has(t.id))
  if (!candidates.length) return null

  async function run() {
    setBusy(true)
    setMessage('')
    let ok = 0
    try {
      for (const t of chosen) {
        const status = d.progress.find((p) => p.topic_id === t.id)?.status ?? ''
        const { data, error } = await supabase
          .from('study_plans')
          .select('revision')
          .eq('id', plan.id)
          .single()
        if (error) throw error
        await command('legacy_passage', {
          plan_id: plan.id,
          topic_id: t.id,
          passage_number: 1,
          expected_revision: (data as { revision: number }).revision,
          reason: `Importado do Edital: status ${status}, confirmado em lote pelo usuário.`,
          confirmed: true,
        })
        ok++
      }
      setMessage(`${ok} assunto(s) registrados como passagem 1 (legado verificado).`)
    } catch (e) {
      setMessage(`${ok} registrados antes do erro: ${errMsg(e)}`)
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Importar progresso do Edital</h2>
      <p className="text-sm text-muted">
        {candidates.length} assunto(s) com progresso no Edital ainda sem a 1ª passagem. Desmarque os
        que não quer converter. Cada um é registrado como legado verificado, com auditoria.
      </p>
      <ul className="space-y-1 text-sm">
        {candidates.map((t) => (
          <li key={t.id}>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={!skip.has(t.id)}
                onChange={(e) => {
                  const next = new Set(skip)
                  if (e.target.checked) next.delete(t.id)
                  else next.add(t.id)
                  setSkip(next)
                }}
              />
              {t.name} · {LABEL[d.progress.find((p) => p.topic_id === t.id)?.status ?? ''] ?? ''}
            </label>
          </li>
        ))}
      </ul>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Conferi a lista e confirmo que os objetivos de compreensão desses assuntos foram concluídos.
      </label>
      <Button loading={busy} disabled={!confirmed || !chosen.length} onClick={run}>
        Registrar {chosen.length} assunto(s) como 1ª passagem
      </Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </Card>
  )
}
