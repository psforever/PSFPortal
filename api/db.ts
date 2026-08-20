/**
 * Data access for the portal.
 *
 * Despite the name, nothing here touches PostgreSQL any more. Every query this module used to issue
 * now lives in PSF-LoginServer (`net.psforever.actors.api.PortalQueries`) and is reached over the
 * PSF-Server HTTP API; this file is the client for those endpoints.
 *
 * The move was not about tidiness. Two processes reading and writing the same database is two
 * authorities, and they disagreed where it mattered: the portal read `building.faction_id` to colour
 * a continent map while the login server held the faction the world was actually enforcing, and the
 * database write behind a capture is asynchronous, so the map could show the previous owner. Login had
 * the same shape of problem from the other side -- the portal hashed passwords with Node's bcrypt,
 * which emits `$2b$` revisions the server's own checker rejects, so a password could be accepted here
 * and refused in-game.
 *
 * The exported function names and their return shapes are unchanged, so the route modules did not have
 * to move with them. What HAS changed is that failures are now network failures: an endpoint that is
 * down throws, where a database that is down used to throw a `pg` error. Callers already wrapped these
 * in try/catch and answered 500, so that reads the same from outside.
 */
import { admin_get, admin_post } from './psadmin.ts'

function objectFlip(obj) {
	const ret = {};
	Object.keys(obj).forEach((key) => {
		ret[obj[key]] = key;
	});
	return ret;
}

export const FACTION_MAP = {
	0: ["Terran Republic", "TR"],
	1: ["New Conglomerate", "NC"],
	2: ["Vanu Sovereignty", "VS"],
	3: ["Neutral", "NL"],
}

export const FACTION_MAP_INV = objectFlip(FACTION_MAP)

/**
 * Sort direction, and the column names the listing endpoints accept.
 *
 * These used to be `Symbol`s carrying a literal SQL column name, because the value was interpolated
 * into a statement here. Now they are plain strings travelling as a query parameter, and the login
 * server matches each against its own whitelist -- an unrecognised one falls back to that endpoint's
 * default rather than reaching a statement. Keeping the constants means the route modules still name
 * a column rather than spelling one out at the call site.
 */
export const SQL_ORDER = Object.freeze({
	ASCENDING: 'asc',
	DESCENDING: 'desc',
});

export const ACCOUNT = Object.freeze({
	ID: 'id',
	USER: 'username',
	CREATED: 'created',
	MODIFIED: 'last_modified',
	BANNED: 'banned',
	ADMIN: 'gm',
	LAST_LOGIN: 'last_login',
});

export const CHARACTER = Object.freeze({
	ID: 'id',
	NAME: 'name',
	LAST_LOGIN: 'last_login',
});

export const AVATAR = Object.freeze({
	ID: 'id',
	BEP: 'bep',
	CEP: 'cep',
});

/**
 * Confirm the data layer is reachable at boot.
 *
 * This used to open the connection pool. There is no pool to open now, so it is a readiness probe:
 * it reports what it found and does NOT throw, because the portal is expected to start and serve its
 * static pages even when the login server is not up yet.
 */
export async function connect_to_db() {
	try {
		const stats = await admin_get('/portal/stats');
		console.log(`Data layer reachable via the PSF-Server HTTP API (${stats.accounts} accounts, ${stats.characters} characters)`);
	} catch (e) {
		console.log('WARNING: data layer unreachable at startup -- is the login server up? ' + e);
	}
}

/** Turn `{page, items_per_page}` into the offset/limit the API takes, and fill in the page counts. */
function paginate(pagination) {
	return {
		offset: (pagination.page - 1) * pagination.items_per_page,
		limit: pagination.items_per_page,
	};
}

function apply_counts(pagination, item_count) {
	pagination.item_count = item_count;
	pagination.page_count = Math.ceil(item_count / pagination.items_per_page);
}

// --- accounts -----------------------------------------------------------------------------------

export async function get_account_by_id(id) {
	return await admin_get(`/portal/accounts/${encodeURIComponent(id)}`) ?? undefined;
}

/**
 * Accounts with their most recent login, for the admin listing.
 *
 * The API returns the IP already cut to its last two octets -- the full address never leaves the
 * login server now, where it used to be fetched in full and trimmed here.
 */
export async function get_accounts_login_info(pagination, sort, filter) {
	const { offset, limit } = paginate(pagination);
	const params = new URLSearchParams({
		offset: String(offset),
		limit: String(limit),
		sort: sort?.column ?? 'created',
		order: sort?.order ?? 'desc',
		filter: filter ?? 'all',
	});
	const body = await admin_get(`/portal/accounts?${params}`);
	apply_counts(pagination, body.item_count);

	return body.items.map((r) => ({
		id: r.id,
		name: r.username,
		admin: r.gm,
		created: r.created,
		last_modified: r.last_modified,
		inactive: r.inactive,
		last_login: r.ip_address ? { time: r.last_login, ip: r.ip_address } : {},
	}));
}

export async function get_account_logins(account_id, pagination) {
	const { offset, limit } = paginate(pagination);
	const body = await admin_get(`/portal/accounts/${encodeURIComponent(account_id)}/logins?offset=${offset}&limit=${limit}`);
	apply_counts(pagination, body.item_count);

	return body.items.map((r) => ({
		id: r.id,
		account_id: r.account_id,
		login_time: r.login_time,
		port: r.port,
		ipAddress: r.ip_address ? { ip: r.ip_address } : undefined,
	}));
}

export async function create_account(username, password) {
	const body = await admin_post('/portal/accounts', { username, password });
	return body.id;
}

/**
 * Check a password.
 *
 * The hash is never seen here: the login server compares it and answers with an account id or a
 * refusal. A refusal is deliberately uniform -- unknown username, wrong password and banned account
 * are indistinguishable, and all three cost the same bcrypt comparison on the far side.
 */
export async function validate_account(username, password) {
	try {
		const body = await admin_post('/portal/login', { username, password });
		return body.account_id;
	} catch (e) {
		// A rejected credential is not an error condition to propagate; every other failure is.
		if (String(e).includes('invalid credentials')) return undefined;
		throw e;
	}
}

// --- characters ---------------------------------------------------------------------------------

export async function get_characters(pagination, _sort?: any, _order?: any) {
	const { offset, limit } = paginate(pagination);
	const body = await admin_get(`/portal/characters?offset=${offset}&limit=${limit}`);
	apply_counts(pagination, body.item_count);
	return body.items;
}

export async function get_roles(pagination, _sort?: any, _order?: any) {
	const { offset, limit } = paginate(pagination);
	const body = await admin_get(`/portal/roles?offset=${offset}&limit=${limit}`);
	apply_counts(pagination, body.item_count);
	return body.items;
}

export async function get_characters_by_account(account_id) {
	return await admin_get(`/portal/accounts/${encodeURIComponent(account_id)}/characters`);
}

export async function get_character_by_name(name) {
	return await admin_get(`/portal/characters/by-name/${encodeURIComponent(name)}`) ?? undefined;
}

export async function get_character_batch_for_stats(batch, sort, order) {
	const b = Number.parseInt(batch, 10);
	return await admin_get(`/portal/characters/batch/${Number.isInteger(b) && b >= 0 ? b : 0}?sort=${sort}&order=${order}`);
}

export async function get_avatar(id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(id)}`) ?? undefined;
}

export async function get_avatar_owner(avatar_id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(avatar_id)}/owner`) ?? undefined;
}

export async function get_weaponstats_by_avatar(id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(id)}/weapon-stats`);
}

export async function get_avatar_kd_byDate(id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(id)}/kd-by-date`);
}

export async function get_locker_items(avatar_id) {
	const row = await admin_get(`/portal/avatars/${encodeURIComponent(avatar_id)}/locker`);
	// The stored blob itself, or undefined -- a character that has never stored anything has no
	// locker row at all, which callers read as an empty locker rather than an error.
	return row?.items ?? undefined;
}

export async function get_loadouts(avatar_id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(avatar_id)}/loadouts`);
}

export async function get_vehicle_loadouts(avatar_id) {
	return await admin_get(`/portal/avatars/${encodeURIComponent(avatar_id)}/vehicle-loadouts`);
}

// --- leaderboards and outfits -------------------------------------------------------------------

export async function get_top_kills() {
	return await admin_get('/portal/leaderboard/top-kills');
}

export async function get_top_kills_byDate() {
	return await admin_get('/portal/leaderboard/top-kills-by-date');
}

export async function get_top_outfits() {
	return await admin_get('/portal/leaderboard/top-outfits');
}

export async function get_outfit(id) {
	return await admin_get(`/portal/outfits/${encodeURIComponent(id)}`) ?? undefined;
}

export async function get_outfit_members(id) {
	return await admin_get(`/portal/outfits/${encodeURIComponent(id)}/members`);
}

// --- site-wide ----------------------------------------------------------------------------------

export async function get_stats() {
	const body = await admin_get('/portal/stats');
	return {
		accounts: body.accounts,
		characters: body.characters,
		last: { character: body.last_character ?? undefined },
	};
}

/**
 * Accounts and characters matching one term, merged and sorted by name.
 *
 * The two halves come back separately -- they carry different fields -- and are tagged and interleaved
 * here, as the single merged list the admin search UI renders.
 */
export async function search(term, pagination) {
	const { offset, limit } = paginate(pagination);
	const body = await admin_get(`/portal/search?q=${encodeURIComponent(term)}&offset=${offset}&limit=${limit}`);

	// The old query paged over two tables independently and could not know a true total, so it
	// reported a fixed 100. Preserved rather than invented: the count is still not knowable without
	// a second pair of counting queries nothing displays.
	apply_counts(pagination, 100);

	const results = [
		...body.accounts.map((r) => ({ id: r.id, name: r.username, admin: r.gm, inactive: r.inactive, type: 'account' })),
		...body.characters.map((r) => ({ ...r, type: 'character' })),
	];

	results.sort((a, b) => {
		const nameA = a.name.toUpperCase();
		const nameB = b.name.toUpperCase();
		if (nameA < nameB) return -1;
		if (nameA > nameB) return 1;
		return 0;
	});

	return results;
}

// --- live world ---------------------------------------------------------------------------------

/**
 * Who currently holds each capturable facility, keyed by zone id then local id.
 *
 * Read from the live zones, NOT from the `building` table. The table lags a capture by however long
 * the asynchronous write takes, which was long enough to paint a base for its previous owner.
 */
export async function get_building_control(zoneId?: string) {
	const body = await admin_get(zoneId ? `/zones/${encodeURIComponent(zoneId)}/control` : '/zones/control');
	return body.zones ?? {};
}
