// Client for the login server's admin API. This used to be a raw-TCP JSON protocol; it is now HTTP
// (Akka HTTP on the login server, package net.psforever.actors.api -- see AdminHttpService.scala).
// The response bodies are the same JSON the old protocol returned, so only the transport here
// changed -- callers are unaffected.

let error_count = 0;
let server_info: any = {};

/** Base URL of the admin API, from the PSADMIN env (host:port). */
let admin_base = '';

export async function start_server_polling() {
	const connect_to = process.env.PSADMIN;

	if (!connect_to) {
		console.log('WARNING: PSADMIN not configured. Not polling server');
		return;
	}
	admin_base = `http://${connect_to}`;
	console.log('Starting admin API polling for ' + connect_to);

	if (!(await poll_server())) {
		console.log('WARNING: initial admin poll FAILED! Is the server up and the config right?');
	}

	setInterval(poll_server, 10000);
}

async function poll_server() {
	try {
		const player_list = await get_player_list();
		server_info = { status: 'UP', players: player_list };
		if (error_count > 0) {
			console.log('Admin API connection has returned after ' + error_count + ' errors');
		}
		error_count = 0;
		return true;
	} catch (e) {
		if (error_count < 5) console.log('WARNING: Failed to get player list: ' + e);
		server_info = { status: 'DOWN', players: [] };
		error_count += 1;
		return false;
	}
}

export function get_server_info() {
	return server_info;
}

/**
 * GET a command's JSON from the PSF-Server HTTP API. The API answers with the same `data` map the old protocol
 * did, including `{ error: true, message }` on failure -- surfaced here as a thrown Error so callers
 * don't read a failure as an empty result.
 */
export async function admin_get(path) {
	if (!admin_base) throw new Error('PSF-Server HTTP API not configured');
	const res = await fetch(`${admin_base}${path}`, { signal: AbortSignal.timeout(6000) });
	const body: any = await res.json().catch(() => ({}));
	if (!res.ok || body?.error) {
		throw new Error(`PSF-Server HTTP API: ${body?.message ?? res.statusText}`);
	}
	return body;
}

export async function admin_post(path, json, actor?: string) {
	if (!admin_base) throw new Error('PSF-Server HTTP API not configured');
	const res = await fetch(`${admin_base}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			// Identifies the portal account for the world server's in-memory audit log.
			...(actor ? { 'X-Admin-User': actor } : {})
		},
		body: JSON.stringify(json ?? {}),
		signal: AbortSignal.timeout(8000)
	});
	const body: any = await res.json().catch(() => ({}));
	if (!res.ok || body?.error) {
		throw new Error(`PSF-Server HTTP API: ${body?.message ?? res.statusText}`);
	}
	return body;
}

/**
 * PUT / PATCH / DELETE against the PSF-Server HTTP API.
 *
 * Only the session store needs these verbs. It is a hot path -- one call per authenticated request --
 * so the timeout is tighter than the command timeouts above: a session lookup that is going to fail
 * should fail fast and let the request proceed as anonymous rather than hold the response open.
 */
async function admin_write(method: string, path: string, json?: any) {
	if (!admin_base) throw new Error('PSF-Server HTTP API not configured');
	const res = await fetch(`${admin_base}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: json === undefined ? undefined : JSON.stringify(json),
		signal: AbortSignal.timeout(4000)
	});
	const body: any = await res.json().catch(() => ({}));
	if (!res.ok || body?.error) {
		throw new Error(`PSF-Server HTTP API: ${body?.message ?? res.statusText}`);
	}
	return body;
}

export const admin_put = (path: string, json: any) => admin_write('PUT', path, json);
export const admin_patch = (path: string, json: any) => admin_write('PATCH', path, json);
export const admin_delete = (path: string) => admin_write('DELETE', path);

async function get_player_list() {
	const info = await admin_get('/players');
	return info.player_list;
}

/** Faction tokens the server accepts. */
const ZONE_FACTIONS = new Set(['TR', 'NC', 'VS', 'neutral']);

/**
 * Per-zone continental lock state, keyed by zone id.
 * `locked_by` is a faction id (0 TR / 1 NC / 2 VS) or null when the zone is unlocked.
 */
export async function get_zone_locks() {
	const info = await admin_get('/zones');
	const out: Record<string, any> = {};
	for (const z of info.zones ?? []) {
		out[z.zone_id] = z.locked_by ?? null;
	}
	return out;
}

/**
 * Per-zone live detail: lock, per-faction online population ([TR, NC, VS, BlackOps]), hotspot count
 * and each hotspot's world-coordinate [x, y] for map placement. Keyed by zone id. Requires the
 * extended `list_zones` command.
 */
export async function get_zone_details() {
	const info = await admin_get('/zones');
	const out: Record<
		string,
		{ locked_by: number | null; players: number[]; hotspots: number; hotspot_points: [number, number][] }
	> = {};
	for (const z of info.zones ?? []) {
		const points = Array.isArray(z.hotspot_points)
			? z.hotspot_points
					.filter((p) => Array.isArray(p) && p.length >= 2)
					.map((p) => [Number(p[0]), Number(p[1])] as [number, number])
			: [];
		out[z.zone_id] = {
			locked_by: z.locked_by ?? null,
			players: Array.isArray(z.players) ? z.players : [0, 0, 0, 0],
			hotspots: z.hotspots ?? points.length,
			hotspot_points: points
		};
	}
	return out;
}

/**
 * Per-zone live player markers (world x/y, facing yaw, faction id, name), keyed by zone id. ADMIN
 * ONLY -- exposes exact player positions, so it must never be served on a public route.
 */
export async function get_zone_players() {
	const info = await admin_get('/zones');
	const out: Record<
		string,
		{ x: number; y: number; facing: number; faction: number; name: string }[]
	> = {};
	for (const z of info.zones ?? []) {
		out[z.zone_id] = Array.isArray(z.player_markers)
			? z.player_markers.map((m) => ({
					x: Number(m.x),
					y: Number(m.y),
					facing: Number(m.facing),
					faction: Number(m.faction),
					name: String(m.name ?? '')
				}))
			: [];
	}
	return out;
}

/**
 * One-shot combat snapshot for a single continent: soldiers, vehicles (seats + cargo), deployables.
 * ADMIN ONLY. Fetched on demand when an admin opens a continent in the Combat view.
 */
export async function get_combat_snapshot(zoneId) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	const info = await admin_get(`/zones/${zoneId}/combat`);
	return (
		info.snapshot ?? { zone_id: zoneId, soldiers: [], vehicles: [], deployables: [] }
	);
}

/**
 * Force a continent's ownership to an empire live. `faction` is TR/NC/VS/neutral.
 * Returns { zone_id, zone_number, faction, buildings_changed }.
 */
export async function set_zone_faction(zoneId, faction, actor?: string) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	if (!ZONE_FACTIONS.has(faction)) throw new Error('invalid faction');
	return await admin_post(`/zones/${zoneId}/faction`, { faction }, actor);
}

/** Force one facility's ownership to an empire live. `localId` is the building's map id. */
export async function set_building_faction(zoneId, localId, faction, actor?: string) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	if (!Number.isInteger(localId) || localId < 0) throw new Error('invalid local id');
	if (!ZONE_FACTIONS.has(faction)) throw new Error('invalid faction');
	return await admin_post(`/zones/${zoneId}/buildings/${localId}/faction`, { faction }, actor);
}

/**
 * Bulk-set many of a zone's facilities live. `assignments` is { localId: factionId } with
 * factionId 0 TR / 1 NC / 2 VS / 3 neutral.
 */
export async function set_zone_buildings(zoneId, assignments, actor?: string) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	const clean = {};
	for (const [id, f] of Object.entries(assignments)) {
		if (Number.isInteger(+id) && Number.isInteger(+f) && +f >= 0 && +f <= 3) clean[id] = +f;
	}
	if (Object.keys(clean).length === 0) return { zone_id: zoneId, buildings_changed: 0 };
	return await admin_post(`/zones/${zoneId}/buildings`, { assignments: clean }, actor);
}

/** Facility lattice as the running server holds it, keyed by zone id. */
export async function get_lattice() {
	const info = await admin_get('/lattice');
	const out: Record<string, any> = {};
	for (const entry of info.lattice ?? []) {
		out[entry.zone_id] = entry.links ?? [];
	}
	return out;
}

/**
 * The world server's in-memory administrative audit trail, newest first. Held by the Akka HTTP actor
 * (not persisted), pruned after seven days.
 */
export async function get_admin_log() {
	const info = await admin_get('/log');
	return {
		retention_days: info.retention_days ?? 7,
		actions: Array.isArray(info.actions) ? info.actions : []
	};
}

/**
 * Ban or unban an account THROUGH THE WORLD SERVER, which is the authority: it persists the flag and,
 * when banning, immediately kicks every character on that account instead of only blocking the next
 * login. Returns { account_id, banned, kicked: string[] }.
 */
export async function set_account_ban(accountId, banned, actor?: string) {
	if (!Number.isInteger(accountId) || accountId < 0) throw new Error('invalid account id');
	return await admin_post(`/accounts/${accountId}/ban`, { banned: !!banned }, actor);
}

/** Whole-continent actions. Each is irreversible, so the caller password-confirms first. */
const ZONE_ACTIONS = new Set(['killall', 'kickall', 'strike']);

/**
 * Act on an entire continent: kill everyone, kick everyone, or call in a real orbital strike on a
 * world point. The strike is the game's own -- every client in the zone plays it -- so `radius` is
 * the CR4 (10m) or CR5 (20m) strike rather than an arbitrary number. ADMIN ONLY, and the caller MUST
 * have re-verified the admin's password first: none of these can be undone.
 */
export async function zone_action(
	zoneId,
	action,
	at: { x?: number; y?: number; radius?: number; z?: number },
	actor?: string
) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	if (!ZONE_ACTIONS.has(action)) throw new Error('invalid action');
	if (action === 'strike') {
		const { x, y, radius } = at;
		if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('a strike needs a position');
		// The game defines exactly two orbital strikes: CR4 at 10m and CR5 at 20m.
		if (radius !== 10 && radius !== 20) throw new Error('a strike radius must be 10 or 20');
	}
	return await admin_post(`/zones/${zoneId}/action`, { action, ...at }, actor);
}

/** Actions the Combat view can take on a single live entity. */
const ENTITY_ACTIONS = new Set(['kill', 'kick', 'deconstruct', 'destroy']);

/**
 * Act on one live entity in a continent: kill/kick a player, deconstruct/destroy a vehicle or
 * deployable, or hand a vehicle to another empire (`hack:TR` / `hack:NC` / `hack:VS`).
 * ADMIN ONLY. Returns { zone_id, guid, action, ... } describing what happened.
 */
export async function entity_action(zoneId, guid, action, actor?: string) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	if (!Number.isInteger(guid) || guid < 0) throw new Error('invalid entity id');
	const ok = ENTITY_ACTIONS.has(action) || /^hack:(TR|NC|VS)$/.test(action);
	if (!ok) throw new Error('invalid action');
	return await admin_post(`/zones/${zoneId}/entities/${guid}/action`, { action }, actor);
}

/** What the world server accepts as a placement kind. */
const PLACE_KINDS = /^(ams|router|vehicle:[a-z0-9_]{1,32})$/i

/**
 * Place a vehicle into a continent. `kind` is `ams`, `router`, or `vehicle:<internal name>`; an AMS and
 * a Router arrive already deployed. Only x/y are sent -- the world server derives the ground height and
 * the vehicle's attitude from the terrain, since a map click carries no third dimension. A Router may
 * additionally carry its telepad's point.
 * ADMIN ONLY.
 */
export async function place_vehicle(
	zoneId: string,
	kind: string,
	faction: string,
	x: number,
	y: number,
	telepad?: { x: number; y: number },
	actor?: string
) {
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneId)) throw new Error('invalid zone id');
	if (!PLACE_KINDS.test(kind)) throw new Error('invalid vehicle kind');
	if (!/^(TR|NC|VS)$/i.test(faction)) throw new Error('invalid faction');
	for (const n of [x, y]) {
		if (!Number.isFinite(n) || n < 0) throw new Error('invalid position');
	}
	const body: Record<string, unknown> = { kind, faction: faction.toUpperCase(), x, y };
	if (telepad) {
		if (!Number.isFinite(telepad.x) || !Number.isFinite(telepad.y)) throw new Error('invalid telepad position');
		body.telepad_x = telepad.x;
		body.telepad_y = telepad.y;
	}
	return await admin_post(`/zones/${zoneId}/vehicles`, body, actor);
}

/**
 * Move a logged-in character: `sanctuary` for a forced recall (the destination is derived from the
 * player's own faction by the world server), or a zone id for a forced transfer. `gate` is optional
 * on a zone transfer -- omitting it lands them at a random warp gate, as the in-game `/zone` does.
 * ADMIN ONLY. Returns { name, from, to, sanctuary, gate? }.
 */
export async function transfer_player(name: string, to: string, gate?: string, actor?: string) {
	// Character names are the targeting key here, so validate the shape rather than trusting the caller;
	// the world server searches every zone for this string.
	if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error('invalid character name');
	if (!/^[a-z0-9_]{1,16}$/i.test(to)) throw new Error('invalid destination');
	if (gate !== undefined && !/^[a-z0-9_]{1,24}$/i.test(gate)) throw new Error('invalid gate');
	return await admin_post(`/players/${encodeURIComponent(name)}/transfer`,
		gate ? { to, gate } : { to }, actor);
}

/**
 * Set or clear an account's game-master flag THROUGH THE WORLD SERVER. Nothing in the live world
 * reads this flag, so unlike a ban there is no session to update -- it moves here only so the account
 * table has a single writer. Returns { account_id, gm }.
 */
export async function set_account_gm(accountId, gm, actor?: string) {
	if (!Number.isInteger(accountId) || accountId < 0) throw new Error('invalid account id');
	return await admin_post(`/accounts/${accountId}/gm`, { gm: !!gm }, actor);
}

/**
 * Grant or revoke a character's GM / spectator permissions THROUGH THE WORLD SERVER. It owns the row
 * AND the live session, so the change applies to a player who is already logged in instead of only
 * taking effect at their next login. Omitted fields keep their stored value.
 * Returns { avatar_id, name, can_gm, can_spectate, applied_live }.
 */
export async function set_avatar_permissions(
	avatarId: number,
	perms: { can_gm?: boolean; can_spectate?: boolean },
	actor?: string
) {
	if (!Number.isInteger(avatarId) || avatarId < 0) throw new Error('invalid avatar id');
	const body: Record<string, boolean> = {};
	if (typeof perms.can_gm === 'boolean') body.can_gm = perms.can_gm;
	if (typeof perms.can_spectate === 'boolean') body.can_spectate = perms.can_spectate;
	if (Object.keys(body).length === 0) throw new Error('no permissions given');
	return await admin_post(`/avatars/${avatarId}/permissions`, body, actor);
}

/**
 * The world server's in-memory interstellar log: base captures and failed captures, newest first.
 * Held by the Akka HTTP actor (not persisted), pruned after seven days.
 */
export async function get_interstellar_log() {
	const info = await admin_get('/interstellar-log');
	return {
		retention_days: info.retention_days ?? 7,
		events: Array.isArray(info.events) ? info.events : []
	};
}
