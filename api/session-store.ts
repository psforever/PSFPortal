import session from 'express-session'
import { admin_get, admin_put, admin_patch, admin_delete, admin_post } from './psadmin.ts'

/**
 * An `express-session` store backed by the PSF-Server HTTP API.
 *
 * This replaces `connect-pg-simple`. It exists for one reason: the session table was the last thing
 * keeping a PostgreSQL pool in this process. Leaving it behind would have meant the portal still held
 * a database connection, still had credentials for it, and was still a second client of a database
 * the login server is meant to own outright.
 *
 * The session body is opaque to the far side -- it stores and expires whatever `express-session`
 * serialised, and never looks inside.
 *
 * Read failures are deliberately soft. `get` answering "no session" when the API is unreachable
 * degrades a signed-in visitor to a signed-out one, which is recoverable; answering with an error
 * makes express-session fail the whole request, which is not. Writes are NOT softened: silently
 * losing a session someone just created would look like a login that did nothing.
 */
export class AdminApiSessionStore extends session.Store {
	/** How often to ask the far side to drop expired rows. `connect-pg-simple` used the same cadence. */
	private static readonly REAP_INTERVAL_MS = 15 * 60 * 1000;

	private reaper: NodeJS.Timeout;

	constructor() {
		super();
		this.reaper = setInterval(() => {
			admin_post('/portal/sessions/reap', {}).catch(() => {
				// A missed sweep is harmless -- expired rows are already refused by `get`, which
				// filters on the expiry, so this only reclaims space.
			});
		}, AdminApiSessionStore.REAP_INTERVAL_MS);
		// Do not hold the process open for a housekeeping timer.
		this.reaper.unref?.();
	}

	get(sid: string, callback: (err: any, session?: any) => void): void {
		admin_get(`/portal/sessions/${encodeURIComponent(sid)}`)
			.then((sess) => callback(null, sess ? JSON.parse(sess) : null))
			.catch(() => callback(null, null));
	}

	set(sid: string, sess: any, callback?: (err?: any) => void): void {
		admin_put(`/portal/sessions/${encodeURIComponent(sid)}`, {
			sess: JSON.stringify(sess),
			expires: expiryEpochSeconds(sess),
		})
			.then(() => callback?.())
			.catch((e) => callback?.(e));
	}

	touch(sid: string, sess: any, callback?: (err?: any) => void): void {
		admin_patch(`/portal/sessions/${encodeURIComponent(sid)}`, { expires: expiryEpochSeconds(sess) })
			.then(() => callback?.())
			.catch(() => {
				// A failed touch only means the session expires on its original schedule.
				callback?.();
			});
	}

	destroy(sid: string, callback?: (err?: any) => void): void {
		admin_delete(`/portal/sessions/${encodeURIComponent(sid)}`)
			.then(() => callback?.())
			.catch((e) => callback?.(e));
	}
}

/**
 * When a session should expire, as whole seconds since the epoch.
 *
 * `express-session` puts an absolute expiry on the cookie when `maxAge` is configured, but it is
 * optional, so a session without one falls back to the same seven days the cookie uses. Seconds
 * rather than milliseconds because the far side hands the value to `TO_TIMESTAMP`.
 */
function expiryEpochSeconds(sess: any): number {
	const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
	const expires = sess?.cookie?.expires;
	const at = expires ? new Date(expires).getTime() : Date.now() + ONE_WEEK_MS;
	return Math.floor(at / 1000);
}
