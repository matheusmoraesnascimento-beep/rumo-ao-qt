import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, Download, Smartphone } from 'lucide-react'
import { Badge, Button, Card, Field, Input } from '@/components/ui'
import { deletePushSubscription, getPushSubscriptions, savePushSubscription, saveSettings } from '@/lib/api'
import { qk, useSettings } from '@/lib/queries'
import { currentEndpoint, detectPushSupport, showTestNotification, subscribePush, unsubscribePush, useInstallPrompt } from '@/lib/pwa'
import { errMsg } from '@/lib/utils'

/** Instalar o app + lembrete diário (Web Push). O envio roda fora do navegador (GitHub Actions agendado). */
export function Lembretes() {
  const qc = useQueryClient()
  const { data: s } = useSettings()
  const { canInstall, installed, install } = useInstallPrompt()
  const support = detectPushSupport()
  const [time, setTime] = useState('19:00')
  const [thisDevice, setThisDevice] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  useEffect(() => { if (s?.reminder_time) setTime(s.reminder_time) }, [s?.reminder_time])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const ep = await currentEndpoint()
        const mine = await getPushSubscriptions()
        if (alive) setThisDevice(!!ep && mine.some((m) => m.endpoint === ep))
      } catch { if (alive) setThisDevice(false) }
    })()
    return () => { alive = false }
  }, [s?.reminder_enabled])

  if (!s) return null
  const on = s.reminder_enabled && thisDevice === true

  async function enable() {
    setBusy(true); setMsg(null)
    try {
      const sub = await subscribePush()
      await savePushSubscription(sub)
      await saveSettings({ reminder_enabled: true, reminder_time: time })
      await qc.invalidateQueries({ queryKey: qk.settings })
      setThisDevice(true)
      setMsg({ ok: true, t: `Lembrete ligado para ~${time}. Chega em até cerca de 30–60 min do horário escolhido.` })
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true); setMsg(null)
    try {
      const ep = await unsubscribePush()
      if (ep) await deletePushSubscription(ep)
      const mine = await getPushSubscriptions()
      await saveSettings({ reminder_enabled: mine.length > 0 }) // continua ligado se houver outro aparelho
      await qc.invalidateQueries({ queryKey: qk.settings })
      setThisDevice(false)
      setMsg({ ok: true, t: 'Lembrete desligado neste aparelho.' })
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setBusy(false) }
  }
  async function saveTime() {
    setBusy(true); setMsg(null)
    try {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Horário inválido.')
      await saveSettings({ reminder_time: time })
      await qc.invalidateQueries({ queryKey: qk.settings })
      setMsg({ ok: true, t: 'Horário salvo.' })
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }) } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4" aria-hidden /> Instalar o app e lembrete diário</h2>

      <div className="space-y-1 text-sm">
        <p className="font-medium">App no celular/computador</p>
        {installed ? <p className="text-ok">App instalado neste aparelho.</p> : canInstall ? (
          <Button variant="secondary" onClick={() => install()}><Download className="size-4" /> Instalar app</Button>
        ) : (
          <p className="text-muted">Use o menu do navegador: <strong>Instalar app</strong> / <strong>Adicionar à tela inicial</strong> (iPhone: Compartilhar → Adicionar à Tela de Início).</p>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium"><Bell className="size-4" aria-hidden /> Lembrete diário <Badge tone={on ? 'ok' : 'neutral'}>{on ? 'ligado neste aparelho' : 'desligado'}</Badge></p>
        {!support.supported ? <p role="note" className="text-muted">{support.reason}</p> : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Horário (Brasília)"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
              {!on ? <Button onClick={enable} loading={busy}>Ligar lembrete</Button> : (
                <>
                  <Button variant="secondary" onClick={saveTime} loading={busy} disabled={time === s.reminder_time}>Salvar horário</Button>
                  <Button variant="secondary" onClick={() => showTestNotification().catch((e) => setMsg({ ok: false, t: errMsg(e) }))}>Testar notificação</Button>
                  <Button variant="ghost" onClick={disable} loading={busy}>Desligar</Button>
                </>
              )}
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
              <li>Avisa quantas revisões estão vencidas; se não houver e você não estudou nas últimas 20 h, sugere uma sessão curta.</li>
              <li>Não envia em dia bloqueado (plantão/viagem) nem mais de uma vez por dia.</li>
              <li>Fica dentro de uma janela de 3 h após o horário escolhido; pode atrasar alguns minutos.</li>
              <li>O envio é feito por uma rotina agendada fora do app, sem servidor próprio. Se o repositório ficar 60 dias sem atividade, o GitHub pausa rotinas agendadas.</li>
            </ul>
          </>
        )}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-ok' : 'text-bad'}>{msg.t}</p>}
      </div>
    </Card>
  )
}
