import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'
import Wordmark from './Wordmark'

type Variant = 'primary' | 'secondary' | 'quiet'

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] px-5 font-medium ' +
  'transition-[background-color,box-shadow,transform] duration-[120ms] ease-[var(--ease-out)] active:scale-[0.97] ' +
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100'
const variants: Record<Variant, string> = {
  primary: 'bg-action text-on-action shadow-[0_1px_2px_rgb(38_60_48/.25)] hover:bg-action-hover',
  secondary: 'bg-surface text-ink shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]',
  quiet: 'text-ink hover:bg-subtle',
}

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />
}

/** Pill toggle. Pressed = green fill + a check that springs in (shape, not just color). */
export function Chip({ pressed, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      aria-pressed={pressed}
      className={
        'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.96] ' +
        (pressed ? 'bg-action text-on-action' : 'bg-subtle text-ink hover:bg-peach') + ' ' + className
      }
      {...rest}
    >
      {pressed && (
        <motion.span aria-hidden initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 26 }}>
          <Icon name="check" size={15} strokeWidth={2.6} />
        </motion.span>
      )}
      {children}
    </button>
  )
}

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[var(--radius-sheet)] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>{children}</section>
}

/** Pill track with a green thumb that slides between options (shared layout animation). */
export function Segmented<T extends string>({ value, options, onChange, label, id }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; id: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-subtle p-1">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`relative min-h-10 rounded-full px-4 text-[15px] font-medium transition-colors duration-150 ${value === o.value ? 'text-on-action' : 'text-ink hover:text-ink'}`}>
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-action" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Header({ right, sub }: { right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-8">
      <div className="flex items-baseline gap-3">
        <a href="/" aria-label="GupAi home" className="self-center no-underline"><Wordmark height={32} /></a>
        {sub && <span className="text-[15px] text-ink-2">{sub}</span>}
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'error' }) {
  const t = { neutral: 'bg-surface text-ink-2', ok: 'bg-surface text-ink', error: 'bg-surface text-error' }[tone]
  return (
    <span className={`inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-[14px] shadow-[var(--shadow-card)] ${t}`}>
      {tone === 'ok' && <span aria-hidden className="size-2 rounded-full bg-action" />}
      {children}
    </span>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="flex items-start gap-1.5 text-[15px] text-error"><Icon name="warning" size={18} className="mt-0.5" />{message}</p>
}
