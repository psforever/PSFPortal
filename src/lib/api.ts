/**
 * Thin fetch wrapper for the Express API mounted at /api.
 *
 * The previous portal used axios; the API contract is unchanged, so this only
 * needs to preserve two behaviours the old client relied on:
 *   - session cookies are sent (the API is session-authenticated)
 *   - a 403 means "not logged in / not admin" rather than a hard failure
 */

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
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
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') {
        message = body.message
      }
    } catch {
      /* non-JSON error body; fall back to statusText */
    }
    throw new ApiError(response.status, message)
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
