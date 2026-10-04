import { Fragment } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react'
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

/**
 * A shimmering placeholder block for data that isn't available yet (server still coming up, feed
 * unreachable). Sized by className/style; the sci-fi sweep comes from the `.skeleton` styles in
 * globals.css. Use in place of a value while a source is being (re)checked.
 */
export function Skeleton({
  className,
  style,
  rounded = true
}: {
  className?: string
  style?: CSSProperties
  rounded?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn('skeleton block', rounded && 'rounded-[2px]', className)}
      style={style}
    />
  )
}

/** A stack of skeleton lines, for text-ish placeholders. `lines` rows, the last one shorter. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

/**
 * A table of records, optionally with one expanded in place.
 *
 * `renderExpanded` returns the detail to show directly beneath a row, or nothing to leave the row
 * closed. Keeping the detail attached to its row rather than in a panel elsewhere means the record
 * you clicked and what it says stay together, which matters most in a long list where the two would
 * otherwise be separated by everything in between.
 */
export function DataTable<T>({
  columns,
  rows,
  empty = 'No records.',
  rowKey,
  renderExpanded,
  isRowActive
}: {
  columns: { header: string; cell: (row: T) => ReactNode; align?: 'left' | 'right' }[]
  rows: T[]
  empty?: string
  rowKey: (row: T, index: number) => string | number
  /** Detail rendered in a full-width row under this one; falsy leaves the row closed. */
  renderExpanded?: (row: T) => ReactNode
  /** Marks a row as the one currently open, so it reads as the source of the detail below it. */
  isRowActive?: (row: T) => boolean
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
          {rows.map((row, i) => {
            const expanded = renderExpanded?.(row)
            const active = isRowActive?.(row) ?? Boolean(expanded)
            return (
              <Fragment key={rowKey(row, i)}>
                <tr
                  className={cn(
                    'hover:bg-[var(--surface-raised)]',
                    active && 'bg-[var(--surface-raised)]'
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className={cn('py-2 px-2 border-b', c.align === 'right' ? 'text-right' : '')}
                      style={{
                        // The open row keeps its bottom edge only where the detail does not follow,
                        // so an expanded row and its detail read as one block rather than two.
                        borderColor: expanded ? 'transparent' : 'var(--border)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
                {expanded && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="p-0 border-b"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {expanded}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
