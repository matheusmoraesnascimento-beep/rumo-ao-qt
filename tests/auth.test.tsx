import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const sb = vi.hoisted(() => {
  let session: unknown = null
  const listeners: ((e: string, s: unknown) => void)[] = []
  return {
    setSession: (s: unknown) => { session = s },
    emit: (e: string, s: unknown) => listeners.forEach((l) => l(e, s)),
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => { listeners.push(cb); return { data: { subscription: { unsubscribe: vi.fn() } } } }),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
})
vi.mock('@/lib/supabase', () => ({ isConfigured: true, supabase: { auth: sb.auth }, siteUrl: () => 'https://x.github.io/rumo-ao-qt/' }))

import { AuthProvider, RequireAuth } from '@/app/auth'
import { LoginPage, ResetPasswordPage } from '@/features/auth/AuthPages'

const app = (route = '/') => render(
  <MemoryRouter initialEntries={[route]}>
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/" element={<RequireAuth><div>área protegida</div></RequireAuth>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>,
)

beforeEach(() => { cleanup(); sb.setSession(null); vi.clearAllMocks() })

describe('Auth', () => {
  it('sem sessão: rota protegida redireciona para /entrar', async () => {
    app('/')
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText('área protegida')).not.toBeInTheDocument()
  })
  it('sessão recuperada ao abrir o app libera a rota', async () => {
    sb.setSession({ user: { id: 'u1' } })
    app('/')
    expect(await screen.findByText('área protegida')).toBeInTheDocument()
  })
  it('login válido chama signInWithPassword', async () => {
    app('/entrar')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(sb.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'senha-segura-1' }))
  })
  it('valida e-mail e senha curta sem chamar o servidor', async () => {
    app('/entrar')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'invalido')
    await userEvent.type(screen.getByLabelText('Senha'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument()
    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument()
    expect(sb.auth.signInWithPassword).not.toHaveBeenCalled()
  })
  it('credencial inválida mostra erro útil', async () => {
    sb.auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } } as never)
    app('/entrar')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-errada-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })
  it('cadastro envia emailRedirectTo da URL do Pages', async () => {
    app('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Criar conta' }))
    await userEvent.type(screen.getByLabelText('E-mail'), 'novo@b.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura-1')
    await userEvent.click(screen.getAllByRole('button', { name: 'Criar conta' }).at(-1)!)
    await waitFor(() => expect(sb.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://x.github.io/rumo-ao-qt/' } })))
    expect(await screen.findByRole('status')).toHaveTextContent(/Confirme o e-mail/)
  })
  it('recuperação de senha pede link por e-mail (sem senha)', async () => {
    app('/entrar')
    await userEvent.click(await screen.findByRole('button', { name: 'Esqueci a senha' }))
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com')
    await userEvent.click(screen.getAllByRole('button', { name: 'Recuperar senha' }).at(-1)!)
    await waitFor(() => expect(sb.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: 'https://x.github.io/rumo-ao-qt/' }))
  })
  it('evento PASSWORD_RECOVERY leva à tela de nova senha e atualiza a senha', async () => {
    app('/')
    await screen.findByRole('heading', { name: 'Entrar' })
    sb.setSession({ user: { id: 'u1' } })
    sb.emit('PASSWORD_RECOVERY', { user: { id: 'u1' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Definir nova senha' })).toBeInTheDocument(), { timeout: 3000 })
    await userEvent.type(screen.getByLabelText('Nova senha'), 'nova-senha-123')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))
    await waitFor(() => expect(sb.auth.updateUser).toHaveBeenCalledWith({ password: 'nova-senha-123' }))
  })
  it('token expirado/logout: SIGNED_OUT derruba o acesso', async () => {
    sb.setSession({ user: { id: 'u1' } })
    app('/')
    await screen.findByText('área protegida')
    sb.emit('SIGNED_OUT', null)
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})
