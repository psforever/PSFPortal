import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** A themed modal: notched panel over a dimmed backdrop, closed by Esc or the backdrop. */
export function Modal({
  title,
  onClose,
  children,
  wide = false
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(1,13,29,0.8)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-auto`}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          clipPath: 'var(--clip-corner-lg)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-2 border-b sticky top-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <h2
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--accent-primary)', textShadow: 'var(--text-glow-teal)' }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg leading-none px-2 hover:text-[var(--text-danger)]"
            style={{ color: 'var(--text-muted)' }}
          >
            &times;
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}
