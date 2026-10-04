import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The session id of the request currently being served, available anywhere without being passed.
 *
 * The PSF-HTTP API authorises per caller now: it wants `X-PSF-Session` so it can resolve the session
 * to an account and decide for itself what that account may see. The trouble is that the code issuing
 * those calls -- `api/db.ts` -- is a plain data layer with no idea a request exists, and threading a
 * caller argument through all thirty of its functions and every route that calls them would be a
 * large, noisy change that is easy to get half-right. A function that silently forgot the argument
 * would still compile and would simply fail closed at runtime, in one endpoint, later.
 *
 * `AsyncLocalStorage` keeps the value on the async execution context instead, so it follows the
 * request through every `await` without appearing in a single signature. Work started outside a
 * request -- the startup probe, the polling loop, the session reaper -- sees no caller and sends no
 * header, which is correct: none of it acts on anyone's behalf.
 */
export interface CallerContext {
	/** Express's session id for this request, when it has one. */
	sessionId?: string
}

const storage = new AsyncLocalStorage<CallerContext>()

/** Run `fn` with this request's caller attached. */
export function withCaller<T>(context: CallerContext, fn: () => T): T {
	return storage.run(context, fn)
}

/** The caller for the request in flight, or undefined outside one. */
export function currentCaller(): CallerContext | undefined {
	return storage.getStore()
}
