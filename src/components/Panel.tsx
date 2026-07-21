import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A tactical panel: notched corners, hairline border, faint inner glow.
 * Local component so views code against our API rather than the registry's,
 * keeping the UI layer replaceable.
 */
export function Panel({
  title,
  children,
  className,
  accent = 'vanu'
}: {
  title?: string
  children: ReactNode
  className?: string
  accent?: 'vanu' | 'tr' | 'nc' | 'vs'
}) {
  const accentVar = {
    vanu: 'var(--color-vanu)',
    tr: 'var(--color-tr-bright)',
    nc: 'var(--color-nc-bright)',
    vs: 'var(--color-vs-bright)'
  }[accent]

  return (
    <section
      className={cn('relative bg-[var(--surface)] border', className)}
      style={{
        borderColor: 'var(--border)',
        clipPath: 'var(--clip-corner-md)'
      }}
    >
      {title && (
        <header
          className="px-4 py-2 border-b text-xs font-semibold tracking-[0.2em] uppercase"
          style={{
            borderColor: 'var(--border)',
            color: accentVar,
            textShadow: 'var(--text-glow-teal)'
          }}
        >
          {title}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
