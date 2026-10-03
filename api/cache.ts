/**
 * A short-lived response cache with request coalescing, in front of the expensive reads.
 *
 * ==What this is actually defending==
 * The portal's public endpoints are a lever on two things that must not be knocked over: the world
 * server's actor system, and the database.
 *
 * `/zones/details`, `/continents/:zone/control` and the rest of the live reads do not touch a cache
 * or a replica -- they round-trip into the RUNNING GAME, onto the same dispatcher that moves players
 * around. The leaderboards aggregate `killactivity` with grouping and window functions. Neither is
 * expensive once; both are ruinous at a thousand requests a second, and neither needs a logged-in
 * caller to reach.
 *
 * Rate limiting alone is the wrong tool here. It caps one source, so a distributed flood still walks
 * straight through, and it does nothing about the ordinary case of a hundred honest browsers all
 * polling the same continent every ten seconds.
 *
 * ==Why caching is the right shape==
 * Every one of these responses is IDENTICAL for every caller. There is no per-user content in a
 * leaderboard or a zone's ownership, which means one upstream call can serve everybody who asks
 * during its lifetime. That turns the upstream cost from "per request" into "per TTL", so the load
 * the world server and the database actually see is bounded by the clock rather than by how hard
 * somebody is hitting the portal -- whether there is one caller or a million.
 *
 * ==Coalescing is the half that matters under attack==
 * A plain TTL cache still collapses under a burst: a thousand simultaneous requests all miss, and a
 * thousand upstream calls go out at once. So an in-flight fetch is shared -- the first miss starts
 * the work and every request arriving while it runs waits on that same promise. The upstream sees
 * one call regardless of how many arrive together, which is precisely the stampede an attacker would
 * be trying to cause.
 *
 * ==Serving stale on failure==
 * When the upstream fails and a previous value is still held, that value is served rather than the
 * error. This is deliberate: if the world server is already struggling, the portal answering from a
 * slightly old copy is better for everyone than the portal adding retry traffic to the pile, and a
 * player looking at a continent map does not care that the ownership is fifteen seconds old.
 */

/** One cached value, plus whatever fetch is currently refreshing it. */
interface Entry<T> {
	value?: T;
	/** Epoch ms after which `value` is stale. */
	freshUntil: number;
	/** Epoch ms after which the entry is evictable even as a stale fallback. */
	keepUntil: number;
	/** The fetch in flight, shared by everyone who misses while it runs. */
	inFlight?: Promise<T>;
}

/** Ceiling on tracked keys, so a caller varying a path parameter cannot exhaust memory. */
const MAX_KEYS = 5_000;

/** How long a value stays usable as a stale fallback after it goes cold. */
const STALE_GRACE_MS = 5 * 60_000;

/** How often expired entries are swept. */
const SWEEP_MS = 60_000;

const entries = new Map<string, Entry<unknown>>();

const sweeper = setInterval(() => {
	const now = Date.now();
	for (const [key, e] of entries) {
		if (e.keepUntil <= now && !e.inFlight) entries.delete(key);
	}
}, SWEEP_MS);
// Never hold the process open just to run the sweeper.
if (typeof sweeper.unref === 'function') sweeper.unref();

/**
 * Return the cached value for `key`, or produce it with `fetch` and cache it for `ttlMs`.
 *
 * Concurrent misses on the same key share one `fetch`. A failure is served from the last good value
 * when there is one, and only propagates when there is nothing to fall back on.
 */
export async function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
	const now = Date.now();
	let entry = entries.get(key) as Entry<T> | undefined;

	if (entry) {
		if (entry.value !== undefined && entry.freshUntil > now) return entry.value;
		// Someone is already fetching this: wait on their call rather than starting another.
		if (entry.inFlight) return entry.inFlight;
	} else {
		// Refuse only NEW keys when full, so an existing hot key keeps refreshing rather than being
		// starved by a flood of one-off keys.
		if (entries.size >= MAX_KEYS) return await fetch();
		entry = { freshUntil: 0, keepUntil: 0 };
		entries.set(key, entry as Entry<unknown>);
	}

	const work = (async () => {
		try {
			const value = await fetch();
			const at = Date.now();
			entry!.value = value;
			entry!.freshUntil = at + ttlMs;
			entry!.keepUntil = at + ttlMs + STALE_GRACE_MS;
			return value;
		} catch (e) {
			// Stale beats an error, and beats letting the caller retry into a struggling upstream.
			if (entry!.value !== undefined && entry!.keepUntil > Date.now()) return entry!.value;
			throw e;
		} finally {
			entry!.inFlight = undefined;
		}
	})();

	entry.inFlight = work;
	return work;
}

/**
 * Wrap an Express handler so its JSON response is cached and coalesced.
 *
 * `keyOf` decides what varies the response. It must cover every parameter the handler reads and
 * nothing else -- include too little and one caller sees another's data, include the wrong thing
 * (an IP, a session) and the cache never hits.
 *
 * `fallback` is what to answer with when the upstream fails and nothing is cached, so a public page
 * degrades to an empty board instead of a 500.
 */
export function cachedJson<T>(
	ttlMs: number,
	keyOf: (req: any) => string,
	produce: (req: any) => Promise<T>,
	fallback?: T
) {
	return async (req: any, res: any) => {
		try {
			const value = await cached(keyOf(req), ttlMs, () => produce(req));
			res.status(200).json(value);
		} catch (e) {
			if (fallback !== undefined) {
				res.status(200).json(fallback);
				return;
			}
			res.status(503).json({ message: 'temporarily unavailable' });
		}
	};
}

/** How long each class of response stays fresh. */
export const TTL = {
	/**
	 * Live world state -- zone ownership, lattice, locks, populations.
	 *
	 * Short, because a base changing hands should show up promptly, but long enough that a continent
	 * open by fifty people costs the game server one call rather than fifty. The map polls on a
	 * similar cadence, so in practice this collapses every viewer onto one upstream read.
	 */
	world: 5_000,

	/**
	 * Leaderboards and aggregate statistics.
	 *
	 * These scan and group `killactivity`. Nobody needs a leaderboard accurate to the second, and a
	 * minute of staleness turns the heaviest queries in the system into one execution per minute
	 * however many people are looking.
	 */
	leaderboard: 60_000,

	/** One character's or outfit's detail page. Cheap individually, but trivially enumerable. */
	entity: 30_000
} as const;
