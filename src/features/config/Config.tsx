import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, ErrorBox, Field, Input, PageTitle, Select, Spinner } from '@/components/ui'
import { qk, useProfile, useSettings } from '@/lib/queries'
import { deleteAccount, saveProfile, saveSettings } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/utils'
import { applyTheme } from '@/app/Layout'
import { Lembretes } from './Lembretes'
import { buildBackup, downloadText, restoreBackup, toCsv } from '@/lib/backup'

export default function Config() {
  const qc = useQueryClient()
  const settings = useSettings(), profile = useProfile()
  const [goal, setGoal] = useState(40), [date, setDate] = useState(''), [cap, setCap] = useState(20), [name, setName] = useState('')
  const [cadence, setCadence] = useState('auto'), [writing, setWriting] = useState(true), [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system'), [share, setShare] = useState(20)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const s = settings.data; if (!s) return
    setGoal(s.goal_correct); setDate(s.exam_date ?? ''); setCap(s.daily_review_cap); setCadence(s.writing_cadence); setWriting(s.include_writing); setTheme(s.theme); setShare(Math.round(s.min_new_topic_share * 100))
  }, [settings.data])
  useEffect(() => { if (profile.data) setName(profile.data.display_name ?? '') }, [profile.data])

  if (settings.isLoading || profile.isLoading) return <Spinner />
  if (settings.error) return <ErrorBox error={settings.error} retry={() => settings.refetch()} />

  async function save() {
    setBusy(true); setMsg(null)
    try {
      await saveSettings({ goal_correct: goal, exam_date: date || null, daily_review_cap: cap, writing_cadence: cadence, include_writing: writing, theme, min_new_topic_share: share / 100 })
      await saveProfile(name.trim())
      applyTheme(theme)
      await Promise.all([qk.settings, qk.profile].map((k) => qc.invalidateQueries({ queryKey: k })))
      setMsg({ ok: true, t: 'Preferências salvas.' })
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Configurações" />
      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Meta de acertos (de 50)" hint="Meta de estudo, não nota de corte oficial."><Input type="number" min={1} max={50} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></Field>
        <Field label="Data da prova" hint="Deixe em branco = a confirmar. Não fixe data antes do edital."><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Limite diário de revisões"><Input type="number" min={1} max={200} value={cap} onChange={(e) => setCap(Number(e.target.value))} /></Field>
        <Field label="Cadência de redação"><Select value={cadence} onChange={(e) => setCadence(e.target.value)}><option value="auto">Automática (21 → 14 → 7 dias)</option><option value="triweekly">A cada 3 semanas</option><option value="biweekly">Quinzenal</option><option value="weekly">Semanal</option><option value="off">Desligada</option></Select></Field>
        <Field label="Reserva para assuntos novos (%)"><Input type="number" min={0} max={100} value={share} onChange={(e) => setShare(Number(e.target.value))} /></Field>
        <Field label="Tema visual"><Select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></Select></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={writing} onChange={(e) => setWriting(e.target.checked)} /> Incluir redação na agenda</label>
        <div className="sm:col-span-2 flex items-center gap-3"><Button onClick={save} loading={busy}>Salvar</Button>{msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.t}</span>}</div>
        <p className="text-xs text-muted sm:col-span-2">Disponibilidade por dia e dias bloqueados: tela Agenda.</p>
      </Card>

      <Lembretes />

      <Card className="space-y-3">
        <h2 className="font-semibold">Exportar / backup / restaurar</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={async () => { try { const b = await buildBackup(); downloadText(`rumo-ao-qt-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json') } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } }}>Backup JSON</Button>
          <Button variant="secondary" onClick={async () => { try { const b = await buildBackup(); downloadText('tentativas.csv', toCsv(b.data.question_attempts as Record<string, unknown>[]), 'text/csv'); downloadText('sessoes.csv', toCsv(b.data.study_sessions as Record<string, unknown>[]), 'text/csv') } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } }}>CSV (tentativas e sessões)</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-line px-4 py-2 text-sm">Restaurar backup JSON
            <input type="file" accept="application/json" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return
              try { const n = await restoreBackup(JSON.parse(await f.text())); await qc.invalidateQueries(); setMsg({ ok: true, t: `Restaurado: ${n} registro(s).` }) } catch (er) { setMsg({ ok: false, t: errMsg(er) }) }
            }} /></label>
        </div>
        <p className="text-xs text-muted">O backup contém só os seus dados (progresso, sessões, tentativas, cards, redações). Registros existentes não são sobrescritos.</p>
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Fontes oficiais e versão do edital</h2>
        <p>Base de estudo: <strong>CP-T/2026 (provisória)</strong>. Edital de 2027 ainda não confirmado — confira sempre a versão vigente.</p>
        <ul className="list-disc pl-5">
          <li><a className="text-sea underline" href="https://www.marinha.mil.br/sspm/qt/qt_princ" target="_blank" rel="noreferrer noopener">Página oficial do Quadro Técnico</a></li>
          <li><a className="text-sea underline" href="https://concursos.marinha.mil.br/quadro-tecnico.html" target="_blank" rel="noreferrer noopener">Concursos Marinha — Quadro Técnico</a></li>
          <li><a className="text-sea underline" href="https://www.inscricao.marinha.mil.br/marinha/Edital%20CP-T%202026-005.pdf?id_file=9582" target="_blank" rel="noreferrer noopener">Edital CP-T/2026</a></li>
          <li><a className="text-sea underline" href="https://www.marinha.mil.br/sspm/programa-o-dos-concursos" target="_blank" rel="noreferrer noopener">Programação anual SSPM</a></li>
        </ul>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Conta</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Sair</Button>
          <Button variant="danger" onClick={async () => {
            if (!confirm('Excluir a conta e TODOS os seus dados? Isto é irreversível.')) return
            if (prompt('Digite EXCLUIR para confirmar') !== 'EXCLUIR') return
            try { await deleteAccount() } catch (e) { setMsg({ ok: false, t: errMsg(e) }) }
          }}>Excluir conta e dados</Button>
        </div>
      </Card>
    </div>
  )
}
