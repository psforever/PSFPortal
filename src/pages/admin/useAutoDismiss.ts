import { useEffect } from 'react'

/** Admin-page alerts clear themselves after this long. */
export const ALERT_TIMEOUT_MS = 10_000

/**
 * Clear an admin alert automatically. Whenever `value` becomes non-null it is reset to null after
 * ALERT_TIMEOUT_MS, so success/error banners on the admin pages disappear on their own.
 */
export function useAutoDismiss(value: string | null, clear: () => void) {
  useEffect(() => {
    if (value === null) return
    const t = window.setTimeout(clear, ALERT_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [value, clear])
}
