import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet'

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 font-medium ' +
  'transition-[background-color,transform] duration-[120ms] ease-[var(--ease-out)] active:scale-[0.98] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 select-none'
const variants: Record<Variant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover',
  secondary: 'border border-boundary bg-surface text-ink hover:bg-subtle',
  quiet: 'text-ink hover:bg-subtle',
}

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />
}

/** Segmented / chip toggle. Pressed state is shown by fill and aria-pressed, not color alone. */
export function Chip({ pressed, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      aria-pressed={pressed}
      className={
        'min-h-11 rounded-[var(--radius-control)] border px-4 text-[15px] transition-colors duration-[120ms] ' +
        (pressed ? 'border-action bg-action text-on-action' : 'border-boundary bg-surface text-ink hover:bg-subtle')
      }
      {...rest}
    >
      {pressed && <span aria-hidden>✓ </span>}
      {children}
    </button>
  )
}

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[var(--radius-sheet)] bg-surface p-5 ${className}`}>{children}</section>
}

export function Header({ right, sub }: { right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-separator px-4 py-3 sm:px-8">
      <div className="flex items-baseline gap-3">
        <a href="/" className="text-xl font-semibold tracking-tight text-ink no-underline">GupAi</a>
        {sub && <span className="text-[15px] text-ink-2">{sub}</span>}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="text-[15px] text-error">⚠ {message}</p>
}
