import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Local UI primitives.
 * Views code against these rather than a third-party component API, so
 * the underlying design system stays replaceable.
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'text-[var(--background)] bg-[var(--accent-primary)] hover:brightness-110 disabled:opacity-40',
    ghost:
      'text-[var(--accent-primary)] border border-[var(--border)] hover:border-[var(--border-active)] disabled:opacity-40',
    danger:
      'text-[var(--background)] bg-[var(--text-danger)] hover:brightness-110 disabled:opacity-40'
  }

  return (
    <button
      {...props}
      className={cn(
        'px-4 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-not-allowed',
        styles[variant],
        className
      )}
      style={{ clipPath: 'var(--clip-corner-sm)', ...props.style }}
    />
  )
}

export function Field({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span
        className="block mb-1 text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <input
        {...props}
        className={cn(
          'w-full px-3 py-2 bg-[var(--background)] border text-sm outline-none',
          'border-[var(--border)] focus:border-[var(--border-active)]',
          'text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]',
          className
        )}
      />
    </label>
  )
}

export type AlertKind = 'error' | 'success' | 'info'

export function Alert({ kind = 'info', children }: { kind?: AlertKind; children: ReactNode }) {
  if (!children) return null

  const colour = {
    error: 'var(--text-danger)',
    success: 'var(--accent-primary)',
    info: 'var(--text-secondary)'
  }[kind]

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="mb-4 px-3 py-2 border text-sm"
      style={{ borderColor: colour, color: colour }}
    >
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
      {label}…
    </p>
  )
}

export function DataTable<T>({
  columns,
  rows,
  empty = 'No records.',
  rowKey
}: {
  columns: { header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right' }[]
  rows: T[]
  empty?: string
  rowKey: (row: T, index: number) => string | number
}) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>{empty}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                className={cn(
                  'py-2 px-2 text-[10px] uppercase tracking-[0.2em] font-semibold border-b',
                  c.align === 'right' ? 'text-right' : 'text-left'
                )}
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="hover:bg-[var(--surface-raised)]">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn('py-2 px-2 border-b', c.align === 'right' ? 'text-right' : '')}
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
