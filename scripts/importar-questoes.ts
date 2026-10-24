/**
 * Relatório + importação das 250 questões via API (service_role, fora do browser).
 *   npm run import:questoes            -> só valida e imprime o relatório (dry-run)
 *   npm run import:questoes -- --apply -> faz upsert (nunca sobrescreve ocr_status='reviewed')
 * Alternativa sem chave: aplicar supabase/seed.sql (npm run seed:gen).
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { detUuid } from '../src/lib/ids'
import { statusOcr, validarQuestoes } from './lib/importacao'

const root = path.resolve(import.meta.dirname, '..')
const raw = JSON.parse(readFileSync(path.join(root, 'dados/questoes_2022_2026.json'), 'utf8'))
const { questoes, relatorio } = validarQuestoes(raw, (p) => existsSync(path.join(root, p)))
console.log(JSON.stringify({ ...relatorio, semTextoConfiavel: relatorio.semTextoConfiavel.length }, null, 2))
if (relatorio.erros.length || relatorio.semImagem.length) process.exit(1)
if (!process.argv.includes('--apply')) {
  console.log('Dry-run OK. Use --apply para importar.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const { data: reviewed } = await sb.from('questions').select('code').eq('ocr_status', 'reviewed')
const skip = new Set((reviewed ?? []).map((r) => r.code as string))
const rows = questoes
  .filter((x) => !skip.has(x.id))
  .map((x) => {
    const st = statusOcr(x)
    return {
      id: detUuid(`question:${x.id}`),
      code: x.id,
      exam_id: detUuid(`exam:${x.exam_year}`),
      number: x.number,
      source_pdf: x.source_pdf,
      source_page: x.source_page,
      source_column: x.source_column,
      source_spans: x.source_spans ?? [],
      ocr_body: st === 'needs_manual_transcription' ? null : x.ocr_text,
      options: x.options,
      image_path: path.posix.basename(x.image_path),
      image_status: x.image_status ?? null,
      ocr_status: st,
      has_figure: x.has_figure,
      text_hash: x.text_hash ?? null,
    }
  })
const { error } = await sb.from('questions').upsert(rows, { onConflict: 'code' })
await sb.from('import_audit').insert({
  batch_name: 'importar-questoes.ts',
  checksum: relatorio.checksum,
  records_validated: questoes.length,
  records_imported: error ? 0 : rows.length,
  errors: error ? [error.message] : [],
})
if (error) {
  console.error(error.message)
  process.exit(1)
}
console.log(`${rows.length} questões importadas (${skip.size} já revisadas preservadas).`)
