/**
 * Thin fetch wrapper for the Express API mounted at /api.
 *
 * The previous portal used axios; the API contract is unchanged, so this only
 * needs to preserve two behaviours the old client relied on:
 *   - session cookies are sent (the API is session-authenticated)
 *   - an auth refusal is a state signal rather than a hard failure
 *
 * The API answers 401 when there is no usable session and 403 when there is one that simply is not
 * allowed the thing being asked. Only the first means the sign-in is gone.
 */

export class ApiError extends Error {
  readonly status: number
  /** Stable machine-readable reason from the API, where it sends one (`session_required`, ...). */
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Notification that the session is gone, so the app can stop pretending anyone is signed in.
 *
 * A session can lapse at any moment -- it expires, an admin bans the account, the world server is
 * restarted and the store is not what it was. The next request to notice is whichever one happens to
 * fire, which could be a background poll on a page that has nothing to do with signing in. Handling
 * that at each call site would mean every one of them remembering to, and most would not.
 *
 * So it is handled once, here, where every request already passes. This module deliberately does not
 * import the user state to do it: the user state imports this module, and reaching back the other way
 * would be a cycle. A subscriber list keeps the dependency pointing one way.
 */
type SessionLostHandler = () => void

const sessionLostHandlers = new Set<SessionLostHandler>()

/** Subscribe to session loss. Returns an unsubscribe. */
export function onSessionLost(handler: SessionLostHandler): () => void {
  sessionLostHandlers.add(handler)
  return () => sessionLostHandlers.delete(handler)
}

/**
 * Paths whose 401 is an answer rather than a surprise.
 *
 * Resolving who is signed in returns 401 for a visitor who never was, and logging out is expected to
 * end with no session. Announcing either as a lost session would mean a signed-out visitor is
 * perpetually being signed out, and the notice on the login page would appear for people who simply
 * arrived.
 */
const EXPECTED_401 = ['/user', '/login', '/logout']

function announceSessionLost(path: string): void {
  if (EXPECTED_401.some((p) => path === p || path.startsWith(`${p}?`))) return
  for (const handler of sessionLostHandlers) handler()
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  })

  if (!response.ok) {
    // The API returns JSON errors where it can, plain text otherwise.
    let message = response.statusText
    let code: string | undefined
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') {
        message = body.message
      }
      if (body && typeof body.error === 'string') {
        code = body.error
      }
    } catch {
      /* non-JSON error body; fall back to statusText */
    }
    // 401, or the code that says so explicitly. A 403 is NOT session loss: it is an authenticated
    // caller being told no, and signing them out for it would log a player out for looking at an
    // admin URL.
    if (response.status === 401 || code === 'session_required') {
      announceSessionLost(path)
    }
    throw new ApiError(response.status, message, code)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body)
    })
}
