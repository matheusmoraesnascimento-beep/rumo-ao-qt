import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from '@/lib/supabase'
import { Spinner } from '@/components/ui'

interface AuthCtx { session: Session | null; loading: boolean; recovery: boolean; clearRecovery: () => void }
const Ctx = createContext<AuthCtx>({ session: null, loading: true, recovery: false, clearRecovery: () => undefined })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isConfigured)
  // Link de recuperação: a sessão chega junto com PASSWORD_RECOVERY; nada deve redirecionar para fora de /redefinir-senha.
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <Ctx.Provider value={{ session, loading, recovery, clearRecovery: () => setRecovery(false) }}>{children}</Ctx.Provider>
}

/** Guard de rota: sem sessão => /entrar (mantém destino); em recuperação de senha => /redefinir-senha. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner label="Verificando sessão…" />
  if (recovery && session) return <Navigate to="/redefinir-senha" replace />
  if (!session) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}
