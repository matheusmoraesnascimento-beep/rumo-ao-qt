import { NavLink, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { BarChart3, BookOpen, CalendarDays, ClipboardList, Home, ListChecks, PenLine, RotateCcw, Settings as Cog, Anchor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/queries'

const NAV = [
  { to: '/', label: 'Hoje', icon: Home, end: true },
  { to: '/edital', label: 'Edital', icon: BookOpen },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/questoes', label: 'Questões', icon: ListChecks },
  { to: '/simulados', label: 'Simulados', icon: ClipboardList },
  { to: '/revisoes', label: 'Revisões', icon: RotateCcw },
  { to: '/redacao', label: 'Redação', icon: PenLine },
  { to: '/analise', label: 'Análise', icon: BarChart3 },
  { to: '/config', label: 'Config', icon: Cog },
]
const MOBILE = ['/', '/questoes', '/revisoes', '/agenda', '/config']

export function applyTheme(t: 'system' | 'light' | 'dark') {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('theme', t) } catch { /* sem storage: ok */ }
}

export function Layout() {
  const { data: s } = useSettings()
  useEffect(() => { if (s?.theme) applyTheme(s.theme) }, [s?.theme])
  return (
    <div className="min-h-screen md:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">Ir para o conteúdo</a>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-navy p-3 text-white md:flex" aria-label="Navegação principal">
        <div className="mb-4 flex items-center gap-2 px-2 py-2 text-lg font-semibold"><Anchor aria-hidden className="size-5" /> Rumo ao QT</div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10', isActive && 'bg-white/20 font-medium')}>
              <I className="size-4" aria-hidden />{label}
            </NavLink>
          ))}
        </nav>
        <p className="px-2 text-[11px] leading-snug text-white/70">Ferramenta independente de estudos. Não oficial e sem vínculo com a Marinha do Brasil.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 md:pb-8">
          <Outlet />
        </main>
        <footer className="hidden px-4 pb-4 text-center text-xs text-muted md:block">Ferramenta independente de estudos. Não oficial e sem vínculo com a Marinha do Brasil.</footer>
      </div>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden" aria-label="Navegação inferior">
        {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted', isActive && 'font-semibold text-navy dark:text-sea')}>
            <I className="size-5" aria-hidden />{label}
          </NavLink>
        ))}
        <NavLink to="/mais" className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted', isActive && 'font-semibold text-navy dark:text-sea')}>
          <ListChecks className="size-5" aria-hidden />Mais
        </NavLink>
      </nav>
    </div>
  )
}

export function MorePage() {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Mais</h1>
      <div className="grid gap-2">
        {NAV.filter((n) => !MOBILE.includes(n.to)).map(({ to, label, icon: I }) => (
          <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4"><I className="size-5 text-sea" aria-hidden />{label}</NavLink>
        ))}
      </div>
    </div>
  )
}
