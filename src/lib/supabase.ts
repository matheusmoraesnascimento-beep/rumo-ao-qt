import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anon && !url.includes('SEU-PROJETO') && !anon.includes('SUA_CHAVE'))

/**
 * Só a chave pública (anon/publishable) vai ao navegador; a proteção é a RLS.
 * PKCE: o retorno do e-mail chega como `?code=` (não conflita com o HashRouter, ao contrário do fluxo implícito `#access_token`).
 */
export const supabase: SupabaseClient = createClient(
  isConfigured ? url! : 'http://localhost:54321',
  isConfigured ? anon! : 'public-anon-placeholder',
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

/** URL de retorno do Auth: raiz do site no Pages (sem hash). Cadastre-a em Auth > URL Configuration. */
export function siteUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}
