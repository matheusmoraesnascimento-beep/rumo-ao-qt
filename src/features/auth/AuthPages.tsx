import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase, siteUrl, isConfigured } from '@/lib/supabase'
import { Button, Card, Field, Input } from '@/components/ui'
import { useAuth } from '@/app/auth'
import { errMsg } from '@/lib/utils'
import { isUsername, toLoginEmail } from '@/lib/login'
import { Anchor } from 'lucide-react'

const credSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres'),
})
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe usuário ou e-mail').refine((v) => v.includes('@') ? z.string().email().safeParse(v).success : isUsername(v), 'Usuário ou e-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
})
const emailOnly = z.object({ email: z.string().trim().email('E-mail inválido') })
type Cred = z.infer<typeof credSchema>

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex items-center gap-2 text-navy dark:text-sea"><Anchor aria-hidden /><span className="text-xl font-semibold">Rumo ao QT</span></div>
      <Card className="space-y-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </Card>
      <p className="text-center text-xs text-muted">Ferramenta independente de estudos. Não oficial e sem vínculo com a Marinha do Brasil.</p>
    </main>
  )
}

export function SetupNeeded() {
  return (
    <Shell title="Configuração pendente">
      <p className="text-sm">Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o README, passo a passo) e recompile.</p>
    </Shell>
  )
}

export function LoginPage() {
  const { session, recovery } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'magic'>('login')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Cred>({
    resolver: zodResolver((mode === 'login' ? loginSchema : mode === 'signup' ? credSchema : emailOnly) as unknown as typeof credSchema),
  })

  if (!isConfigured) return <SetupNeeded />
  if (session && recovery) return <Navigate to="/redefinir-senha" replace />
  if (session) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />

  async function onSubmit(v: Cred) {
    setBusy(true); setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(v.email), password: v.password })
        if (error) throw error
        nav('/', { replace: true })
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: siteUrl() } })
        if (error) throw error
        setMsg({ ok: true, text: data.session ? 'Conta criada.' : 'Conta criada. Confirme o e-mail enviado para entrar.' })
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: siteUrl() })
        if (error) throw error
        setMsg({ ok: true, text: 'Se o e-mail existir, enviamos um link de recuperação.' })
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email: v.email, options: { emailRedirectTo: siteUrl() } })
        if (error) throw error
        setMsg({ ok: true, text: 'Link de acesso enviado ao seu e-mail.' })
      }
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) })
    } finally { setBusy(false) }
  }

  const titles = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha', magic: 'Entrar por link no e-mail' }
  return (
    <Shell title={titles[mode]}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label={mode === 'login' ? 'Usuário ou e-mail' : 'E-mail'} error={errors.email?.message}>
          <Input type={mode === 'login' ? 'text' : 'email'} autoComplete={mode === 'login' ? 'username' : 'email'} autoCapitalize="none" {...register('email')} />
        </Field>
        {(mode === 'login' || mode === 'signup') && (
          <Field label="Senha" error={errors.password?.message}>
            <Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...register('password')} />
          </Field>
        )}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm text-ok' : 'text-sm text-bad'}>{msg.text}</p>}
        <Button type="submit" loading={busy} className="w-full">{titles[mode]}</Button>
      </form>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {mode !== 'login' && <button className="text-sea underline" onClick={() => { setMode('login'); setMsg(null) }}>Entrar com senha</button>}
        {mode !== 'signup' && <button className="text-sea underline" onClick={() => { setMode('signup'); setMsg(null) }}>Criar conta</button>}
        {mode !== 'forgot' && <button className="text-sea underline" onClick={() => { setMode('forgot'); setMsg(null) }}>Esqueci a senha</button>}
        {mode !== 'magic' && <button className="text-sea underline" onClick={() => { setMode('magic'); setMsg(null) }}>Link por e-mail</button>}
      </div>
    </Shell>
  )
}

const newPass = z.object({ password: z.string().min(8, 'Mínimo de 8 caracteres') })
export function ResetPasswordPage() {
  const nav = useNavigate()
  const { session, loading, clearRecovery } = useAuth()
  const [msg, setMsg] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string }>({ resolver: zodResolver(newPass) })
  if (!loading && !session) return <Navigate to="/entrar" replace />
  return (
    <Shell title="Definir nova senha">
      <form className="space-y-3" onSubmit={handleSubmit(async (v) => {
        const { error } = await supabase.auth.updateUser({ password: v.password })
        if (error) setMsg(errMsg(error)); else { clearRecovery(); nav('/', { replace: true }) }
      })}>
        <Field label="Nova senha" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">Salvar senha</Button>
      </form>
    </Shell>
  )
}
