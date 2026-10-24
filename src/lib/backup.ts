import { supabase } from './supabase'

const TABLES = ['topic_progress', 'study_sessions', 'question_attempts', 'question_flags', 'review_cards', 'review_events', 'writing_submissions', 'blocked_days'] as const
type T = (typeof TABLES)[number]
export const BACKUP_VERSION = 1

export interface Backup { app: 'rumo-ao-qt'; version: number; exported_at: string; data: Record<T, Record<string, unknown>[]> & { user_settings: Record<string, unknown>[] } }

/** Lê só os dados do próprio usuário (a RLS garante o isolamento). */
export async function buildBackup(): Promise<Backup> {
  const data = {} as Backup['data']
  for (const t of [...TABLES, 'user_settings'] as const) {
    const { data: rows, error } = await supabase.from(t).select('*').limit(50000)
    if (error) throw new Error(`${t}: ${error.message}`)
    ;(data as Record<string, unknown>)[t] = rows ?? []
  }
  return { app: 'rumo-ao-qt', version: BACKUP_VERSION, exported_at: new Date().toISOString(), data }
}

export function validateBackup(b: unknown): asserts b is Backup {
  const x = b as Partial<Backup> | null
  if (!x || x.app !== 'rumo-ao-qt' || typeof x.version !== 'number' || !x.data || typeof x.data !== 'object') throw new Error('Arquivo de backup inválido.')
  if (x.version > BACKUP_VERSION) throw new Error('Backup de versão mais nova que este app.')
}

/** Reatribui user_id ao usuário atual, remove campos de gabarito e ignora duplicados (não sobrescreve). */
export function sanitizeRows(rows: Record<string, unknown>[], userId: string): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = { ...r, user_id: userId }
    delete o.correct_option
    return o
  })
}

export async function restoreBackup(b: unknown): Promise<number> {
  validateBackup(b)
  const { data: s } = await supabase.auth.getSession()
  const uid = s.session?.user.id
  if (!uid) throw new Error('Sessão expirada.')
  let n = 0
  // ordem respeita FKs: cards antes de eventos
  const order: T[] = ['topic_progress', 'study_sessions', 'question_flags', 'blocked_days', 'review_cards', 'review_events', 'writing_submissions', 'question_attempts']
  for (const t of order) {
    let rows = sanitizeRows(b.data[t] ?? [], uid)
    if (t === 'question_attempts') rows = rows.map((r) => ({ ...r, simulation_id: null })) // simulados não são restaurados
    if (!rows.length) continue
    const onConflict = t === 'topic_progress' ? 'user_id,topic_id' : t === 'question_flags' ? 'user_id,question_id' : t === 'blocked_days' ? 'user_id,day' : 'id'
    const { error } = await supabase.from(t).upsert(rows, { onConflict, ignoreDuplicates: true })
    if (error) throw new Error(`${t}: ${error.message}`)
    n += rows.length
  }
  return n
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
