import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A themed modal: notched panel over a dimmed backdrop, closed by Esc or the backdrop.
 *
 * `sidePanel` docks a second window immediately to the RIGHT of the dialog, matching its height. It
 * is a flex sibling rather than an overlay, so showing it never resizes the dialog's own content --
 * the pair simply centres together.
 */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  sidePanel,
  leftPanel
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Optional companion window docked to the dialog's right, at the same height. */
  sidePanel?: ReactNode
  /** Optional companion window docked to the dialog's left, at the same height. */
  leftPanel?: ReactNode
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
      {/* items-stretch so a docked side panel is exactly as tall as the dialog beside it. Clicks are
          stopped on the panels themselves, not this row, so the empty space beside them still acts as
          backdrop and closes the modal. */}
      {/* No max-height and no scrollers: the dialog sizes to its content. An inventory grid has a
          fixed, known size, so clipping it behind a scrollbar hides the very thing being shown. */}
      <div className="flex w-full items-stretch justify-center gap-3">
        {leftPanel && (
          <aside
            className="w-56 shrink-0"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              clipPath: 'var(--clip-corner-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {leftPanel}
          </aside>
        )}

        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          /*
           * A `wide` dialog takes the room it is given, up to a limit, rather than shrinking to fit
           * its contents.
           *
           * `w-auto` was the wrong instruction for anything holding an SVG. An `<svg>` with no width
           * attribute has an intrinsic size of 300x150, and the continent map is sized `w-full
           * h-auto` -- so inside a shrink-to-fit dialog the two agreed on 300px and stopped there,
           * nowhere near the `70vh` cap the map sets for itself. Giving the dialog a real width lets
           * the `1fr` map column resolve against something, and the map fills it.
           *
           * `min-w-0` so a docked side panel can still shrink this rather than overflowing the row.
           */
          className={`relative ${wide ? 'w-full min-w-0 max-w-[1600px]' : 'w-full max-w-2xl'}`}
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

        {sidePanel && (
          <aside
            className="w-56 shrink-0"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              clipPath: 'var(--clip-corner-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidePanel}
          </aside>
        )}
      </div>
    </div>,
    document.body
  )
}
