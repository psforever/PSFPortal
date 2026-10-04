/**
 * Brute-force protection for the authentication endpoints.
 *
 * Two independent gates guard a credential check, because they stop different attacks:
 *
 *   - a PER-IP gate caps how fast one source can try anything at all, which blunts credential
 *     stuffing and username enumeration from a single host;
 *   - a PER-USERNAME gate caps failures against one account regardless of source, so a distributed
 *     attack spread over many IPs still cannot grind a single password.
 *
 * State is in memory (per process, like the world server's audit log) -- deliberately, since these
 * counters are worthless after a restart and writing them to Postgres would add a database round trip
 * to every login. Both maps are pruned on a timer and hard-capped, so a rotating-key attack cannot
 * turn the limiter itself into a memory-exhaustion vector.
 *
 * NOTE: per-IP limiting is only as trustworthy as `req.ip`. index.ts sets `trust proxy` to
 * `loopback`, so a same-host reverse proxy is honoured and arbitrary `X-Forwarded-For` from the
 * internet is not. If this is ever fronted by a non-loopback proxy, widen that setting or every
 * client collapses into one bucket.
 */

/** One tracked key: how many strikes, when the window ends, and how long it is locked out. */
interface Bucket {
	strikes: number;
	/** Epoch ms after which the strike count resets. */
	resetAt: number;
	/** Epoch ms until which requests are refused outright; 0 when not locked. */
	lockedUntil: number;
}

export interface LimitRule {
	/** How long a strike is remembered. */
	windowMs: number;
	/** Strikes allowed inside the window before a lockout starts. */
	max: number;
	/** Base lockout once `max` is exceeded; doubles for each further strike, up to `maxLockMs`. */
	lockMs: number;
	maxLockMs: number;
}

/** Ceiling on tracked keys per store, so the limiter cannot be used to exhaust memory. */
const MAX_KEYS = 20_000;

/** How often expired entries are swept. */
const SWEEP_MS = 60_000;

class LimitStore {
	private readonly buckets = new Map<string, Bucket>();
	// Declared explicitly rather than as a constructor parameter property: this project runs
	// TypeScript natively under Node's strip-only mode, which only supports erasable syntax.
	private readonly rule: LimitRule;

	constructor(rule: LimitRule) {
		this.rule = rule;
		const timer = setInterval(() => this.sweep(), SWEEP_MS);
		// Never hold the process open just to run the sweeper.
		if (typeof timer.unref === 'function') timer.unref();
	}

	/** Drop entries whose window has closed and which are no longer locked. */
	private sweep() {
		const now = Date.now();
		for (const [key, b] of this.buckets) {
			if (b.resetAt <= now && b.lockedUntil <= now) this.buckets.delete(key);
		}
	}

	/**
	 * Milliseconds remaining on this key's lockout, or 0 when it may proceed. Does NOT count a strike:
	 * checking is separate from recording, so a successful credential check costs nothing.
	 */
	retryAfterMs(key: string): number {
		const b = this.buckets.get(key);
		if (!b) return 0;
		const now = Date.now();
		if (b.lockedUntil > now) return b.lockedUntil - now;
		return 0;
	}

	/** Record one failed attempt, extending the lockout once the allowance is spent. */
	fail(key: string) {
		const now = Date.now();
		let b = this.buckets.get(key);
		if (!b || b.resetAt <= now) {
			// Only refuse NEW keys when full; existing keys must stay updatable or an attacker could
			// flood the map to escape their own lockout.
			if (!b && this.buckets.size >= MAX_KEYS) return;
			b = { strikes: 0, resetAt: now + this.rule.windowMs, lockedUntil: 0 };
			this.buckets.set(key, b);
		}
		b.strikes += 1;
		b.resetAt = now + this.rule.windowMs;
		if (b.strikes > this.rule.max) {
			const over = b.strikes - this.rule.max - 1;
			const lock = Math.min(this.rule.lockMs * 2 ** over, this.rule.maxLockMs);
			b.lockedUntil = now + lock;
		}
	}

	/** Clear a key's history, called when a credential check succeeds. */
	reset(key: string) {
		this.buckets.delete(key);
	}
}

/**
 * Per-IP gate: a single source gets 15 failures per 15 minutes, then escalating lockouts up to an
 * hour. Generous enough that a person fumbling their password is unaffected.
 */
export const byIp = new LimitStore({
	windowMs: 15 * 60_000,
	max: 15,
	lockMs: 60_000,
	maxLockMs: 60 * 60_000
});

/**
 * Per-username gate: 5 failures per 15 minutes against one account, from anywhere, then escalating
 * lockouts. This is the gate that actually protects a password from a distributed attack.
 */
export const byUser = new LimitStore({
	windowMs: 15 * 60_000,
	max: 5,
	lockMs: 60_000,
	maxLockMs: 30 * 60_000
});

/** Normalised limiter key for a username, so case and padding can't be used to get extra tries. */
export function userKey(username: unknown): string {
	return String(username ?? '').trim().toLowerCase();
}

/**
 * Refuse the request if either gate is locked. Returns true when a response has been sent.
 *
 * The reply is a generic 429 with `Retry-After`; it never says which gate tripped or whether the
 * account exists, so this cannot be used to enumerate usernames.
 */
export function blocked(req, res, username?: unknown): boolean {
	const waits = [byIp.retryAfterMs(req.ip ?? 'unknown')];
	if (username !== undefined) waits.push(byUser.retryAfterMs(userKey(username)));
	const wait = Math.max(...waits);
	if (wait <= 0) return false;

	const seconds = Math.ceil(wait / 1000);
	res.setHeader('Retry-After', String(seconds));
	res.status(429).json({
		message: `Too many attempts. Try again in ${seconds > 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`}.`
	});
	return true;
}

/** Record a failed credential check against both gates. */
export function recordFailure(req, username?: unknown) {
	byIp.fail(req.ip ?? 'unknown');
	if (username !== undefined) byUser.fail(userKey(username));
}

/** Clear both gates after a successful credential check. */
export function recordSuccess(req, username?: unknown) {
	byIp.reset(req.ip ?? 'unknown');
	if (username !== undefined) byUser.reset(userKey(username));
}

/**
 * General request gate for the public API.
 *
 * The two gates above guard a credential check; this one guards everything else. It exists because
 * the portal's public reads are a lever on the world server's actor system and on the database, and
 * the cache in `cache.ts` -- which is the real defence -- only bounds work per DISTINCT key. A caller
 * varying a path parameter (a zone id, an avatar id) walks past the cache and reaches the upstream
 * every time, so the number of distinct things one source may ask for still has to be capped.
 *
 * Deliberately loose, and sized for the worst legitimate case rather than the typical one. A page
 * load fans out to several endpoints and the continent map polls every few seconds, so one active
 * user is perhaps 20-40 requests a minute -- but `req.ip` is a NAT address for an office, a school or
 * a phone network, where dozens of real users share one. 600/minute leaves room for roughly twenty
 * simultaneous users behind a single address before anyone is refused.
 *
 * The lockout is capped low for the same reason: if this ever does fire on a shared address it takes
 * innocent people with it, and two minutes is a nuisance where fifteen is an outage. That is an
 * acceptable trade because this is a BACKSTOP -- the cache is what actually bounds upstream load, by
 * collapsing any number of requests onto one call. This only stops a caller walking an id space to
 * get around the cache, and a caller doing that is not inconvenienced by a short lockout.
 */
const publicRule: LimitRule = {
	windowMs: 60_000,
	max: 600,
	lockMs: 15_000,
	maxLockMs: 2 * 60_000
};

const byIpGeneral = new LimitStore(publicRule);

/**
 * Express middleware: count this request against its source and refuse once the allowance is spent.
 *
 * Counts every request rather than only failures, which is the difference between this and the
 * credential gates: there is no such thing as a "failed" read to key off, and the thing being
 * rationed is the work itself.
 */
export function publicRateLimit(req, res, next) {
	const key = req.ip ?? 'unknown';
	const wait = byIpGeneral.retryAfterMs(key);
	if (wait > 0) {
		const seconds = Math.ceil(wait / 1000);
		res.setHeader('Retry-After', String(seconds));
		res.status(429).json({ message: `Too many requests. Try again in ${seconds} seconds.` });
		return;
	}
	byIpGeneral.fail(key);
	next();
}
