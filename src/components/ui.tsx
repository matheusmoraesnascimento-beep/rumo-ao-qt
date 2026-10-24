import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy/90 dark:bg-sea dark:text-[#06101f]',
  secondary: 'border border-line bg-surface text-ink hover:bg-bg',
  ghost: 'text-ink hover:bg-line/50',
  danger: 'bg-bad text-white hover:opacity-90 dark:text-[#06101f]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', loading, size = 'md', children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm',
        variants[variant], className,
      )}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-xl border border-line bg-surface p-4 shadow-sm', className)} {...p} />
)

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, className)} {...p} />
))
Input.displayName = 'Input'
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-24', className)} {...p} />
))
Textarea.displayName = 'Textarea'
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, className)} {...p} />
))
Select.displayName = 'Select'

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-bad">{error}</span>}
    </label>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'sea'; className?: string }) {
  const t = { neutral: 'bg-line/60 text-ink', ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', bad: 'bg-bad/15 text-bad', sea: 'bg-sea/15 text-sea' }[tone]
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', t, className)}>{children}</span>
}

export const Spinner = ({ label = 'Carregando…' }: { label?: string }) => (
  <div role="status" className="flex items-center gap-2 p-6 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden />{label}</div>
)

export const ErrorBox = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
    <p className="font-medium">Não foi possível carregar.</p>
    <p className="mt-1 break-words">{error instanceof Error ? error.message : String(error)}</p>
    {retry && <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>Tentar novamente</Button>}
  </div>
)

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>
)

export const PageTitle = ({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
    <div><h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>{sub && <p className="text-sm text-muted">{sub}</p>}</div>
    {action}
  </div>
)

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full bg-sea" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  )
}
