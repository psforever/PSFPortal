import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'

export interface ActionItem {
  label: string
  onClick: () => void
  /** Render a dividing rule in place of this entry; label and onClick are then ignored. */
  separator?: boolean
  /** Render in the danger colour (e.g. Ban). */
  danger?: boolean
  disabled?: boolean
}

/**
 * A single "Actions" button that opens a dropdown of options. The menu is rendered through a portal
 * with fixed positioning so it is never clipped by the table's `overflow-x-auto` wrapper, and it
 * right-aligns under the trigger. Closes on outside click, Escape, scroll or resize.
 */
export function ActionMenu({ items, label = 'Actions' }: { items: ActionItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || wrapRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="inline-block">
      <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
        <span aria-hidden className="ml-1 text-[0.7em]">▾</span>
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] min-w-[11rem] border py-1 shadow-lg"
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translateX(-100%)',
              borderColor: 'var(--border)',
              background: 'var(--surface)'
            }}
          >
            {items.map((it, i) =>
              it.separator ? (
                <div
                  key={i}
                  role="separator"
                  className="my-1 border-t"
                  style={{ borderColor: 'var(--border)' }}
                />
              ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-40"
                style={{ color: it.danger ? 'var(--text-danger)' : 'var(--text-secondary)' }}
              >
                {it.label}
              </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
