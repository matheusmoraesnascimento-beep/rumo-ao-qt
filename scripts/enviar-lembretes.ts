/**
 * Remetente de lembretes (rodado pelo GitHub Actions, de tempos em tempos).
 * NÃO usa service_role: chama RPCs restritas por REMINDER_BOT_TOKEN (só o hash fica no banco).
 *   env: SUPABASE_URL, SUPABASE_ANON_KEY (públicas), REMINDER_BOT_TOKEN, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, DRY_RUN=1 (opcional)
 */
import webpush from 'web-push'
import { buildMessage, isGone, type DueRow } from './lib/lembretes'

const need = (k: string) => {
  const v = process.env[k]
  if (!v) { console.error(`Variável ${k} ausente`); process.exit(1) }
  return v
}
const url = need('SUPABASE_URL').replace(/\/$/, '')
const anon = need('SUPABASE_ANON_KEY')
const token = need('REMINDER_BOT_TOKEN')
const dry = process.env.DRY_RUN === '1'
webpush.setVapidDetails('https://github.com/matheusmoraesnascimento-beep/rumo-ao-qt', need('VAPID_PUBLIC_KEY'), need('VAPID_PRIVATE_KEY'))

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_token: token, ...body }),
  })
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T
}

const due = await rpc<DueRow[]>('reminders_due', {})
console.log(`${due.length} lembrete(s) a enviar${dry ? ' (DRY_RUN: nada será enviado)' : ''}`)
const sent: string[] = [], gone: string[] = []
for (const row of due) {
  const msg = buildMessage(row)
  console.log(`- ${row.sub_id.slice(0, 8)} ${row.kind} (${row.due_count}): ${msg.body}`)
  if (dry) continue
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 3, urgency: 'normal' })
    sent.push(row.sub_id)
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    if (isGone(code)) { gone.push(row.sub_id); console.log(`  inscrição expirada (${code}); será removida`) }
    else console.error(`  falha ao enviar (${code ?? 'sem status'}): ${(e as Error).message}`) // tenta de novo na próxima rodada
  }
}
if (sent.length) console.log(`marcados como enviados: ${await rpc<number>('reminders_mark_sent', { p_sub_ids: sent })}`)
if (gone.length) console.log(`inscrições removidas: ${await rpc<number>('reminders_prune', { p_sub_ids: gone })}`)
