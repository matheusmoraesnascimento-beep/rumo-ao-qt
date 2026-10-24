/**
 * Envia os 250 recortes .webp ao bucket PRIVADO `provas` (Supabase Storage).
 * Roda SOMENTE na sua máquina, com a service_role em variável de ambiente (nunca no frontend/commit):
 *   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run enviar:imagens
 */
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no terminal (não use prefixo VITE_).')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const dir = path.resolve(import.meta.dirname, '../dados/questoes-originais')
const files = readdirSync(dir).filter((f) => f.endsWith('.webp'))
let ok = 0
for (const f of files) {
  const { error } = await sb.storage.from('provas').upload(f, readFileSync(path.join(dir, f)), {
    contentType: 'image/webp',
    upsert: true,
  })
  if (error) console.error(f, error.message)
  else ok++
}
console.log(`${ok}/${files.length} imagens enviadas ao bucket privado 'provas'.`)
if (ok !== files.length) process.exit(1)
