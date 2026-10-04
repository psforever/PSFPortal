import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** How long a toast lingers before it auto-dismisses. */
const AUTO_DISMISS_MS = 6000

const KIND_COLOUR: Record<ToastKind, string> = {
  success: 'var(--accent-primary)',
  error: 'var(--text-danger)',
  info: 'var(--border-active)'
}

/**
 * App-wide transient status notifications. Any component calls `useToast()` and pushes a message; it
 * appears as a stacked toast in the top-right and clears itself after a few seconds. Replaces the
 * inline status/notice banners the admin pages used to render in place.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setToasts((cur) => [...cur, { id, kind, message }])
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (m) => toast(m, 'error'),
      info: (m) => toast(m, 'info')
    }),
    [toast]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed right-4 top-4 z-[200] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="toast-in flex items-start gap-2 border px-3 py-2 text-sm shadow-lg"
            style={{
              borderColor: 'var(--border)',
              borderLeft: `3px solid ${KIND_COLOUR[t.kind]}`,
              background: 'var(--surface)'
            }}
          >
            <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>
              {t.message}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-xs"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
