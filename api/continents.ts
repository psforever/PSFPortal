import express from 'express'
import * as db from './db.ts'
import { get_lattice, get_zone_locks, get_zone_details, get_zone_players, get_combat_snapshot, entity_action, zone_action, get_admin_log, get_interstellar_log, set_zone_faction, set_building_faction } from './psadmin.ts'
import { applyRandomState, computeRandomState, loadZones } from './randomize.ts'
import { set_zone_buildings } from './psadmin.ts'
import { computeGateEmpires } from './gate-empires.ts'
import { TTL, cached } from './cache.ts'
import { NEED_ADMIN } from './util.ts'
import { blocked, recordFailure, recordSuccess } from './ratelimit.ts'

const api = express.Router();

// Current base ownership for a continent, keyed by the building's local id
// (which matches the `id` in the static continent facility data). The static
// continent geometry/facility layout is shipped as an asset; only the live
// control state comes from here.
/**
 * Live facility ownership, keyed by zone NUMBER then local id.
 *
 * The source is the running world (`/zones/control` on the PSF-HTTP API), not the `building` table the
 * portal used to read: `BuildingActor.SetFaction` updates the live entity and the database, and the
 * database write is asynchronous, so a map drawn from the table could paint a base for the empire
 * that held it a moment ago.
 *
 * The API answers keyed by zone id (`z1`), while every one of these endpoints has always answered
 * keyed by zone number -- which is what the continent components index on. Re-keying here keeps the
 * change invisible to the browser.
 */
async function live_control_by_zone_number() {
	// Cached and coalesced: this reaches into the RUNNING GAME for its answer, on the same dispatcher
	// that moves players. Every caller gets the same ownership map, so one upstream read serves all of
	// them for the length of the TTL -- which is what stops a public, unauthenticated endpoint from
	// being a lever on the world server.
	const byZoneId = await cached('world:control', TTL.world, () => db.get_building_control());
	const zones = loadZones();
	const out = {};
	for (const [zid, facilities] of Object.entries(byZoneId)) {
		const number = zones[zid]?.number;
		if (number !== undefined) out[number] = facilities;
	}
	return out;
}

api.get('/continents/:zone/control', async (req, res) => {
	const zone = Number.parseInt(req.params.zone, 10);
	if (!Number.isInteger(zone) || zone < 1) {
		res.status(400).json({ message: 'invalid zone' });
		return;
	}
	try {
		const control = (await live_control_by_zone_number())[zone] ?? {};
		res.status(200).json({ zone, control });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

// Facility lattice for a zone, read live from the running server over the PSF-HTTP API (`list_lattice`)
// rather than from the shipped zonemaps, so it reflects the topology the server is actually
// enforcing. Links are pairs of building names; the client resolves them against the facility
// layout it already has.
api.get('/continents/:zoneid/lattice', async (req, res) => {
	const zoneid = String(req.params.zoneid || '');
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneid)) {
		res.status(400).json({ message: 'invalid zone id' });
		return;
	}
	try {
		const all = await cached('world:lattice', TTL.world, () => get_lattice());
		// A zone's own list holds its internal facility links plus whichever intercontinental links it
		// happened to register -- the far side of a warpgate pair is often filed under the OTHER zone.
		// Gather from every zone so a caller sees every link that touches this one.
		const prefix = `${zoneid}/`;
		const seen = new Set();
		const links = [];
		for (const [zid, zoneLinks] of Object.entries(all)) {
			for (const pair of zoneLinks ?? []) {
				const [a, b] = pair;
				const touches =
					zid === zoneid || String(a).startsWith(prefix) || String(b).startsWith(prefix);
				if (!touches) continue;
				const key = `${a}\u0000${b}`;
				if (seen.has(key)) continue;
				seen.add(key);
				links.push(pair);
			}
		}
		res.status(200).json({ zone: zoneid, links });
	} catch (e) {
		// The server may be down, or be an older build without the list_lattice command.
		res.status(503).json({ message: 'lattice unavailable', links: [] });
	}
});

// The empire on the far side of each warpgate on a zone (sanctuary empire, or the paired continent's
// gateway facility owner). The continent map uses it to colour warpgate -> first-facility links.
api.get('/continents/:zoneid/gate-empires', async (req, res) => {
	const zoneid = String(req.params.zoneid || '');
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneid)) {
		res.status(400).json({ message: 'invalid zone id' });
		return;
	}
	try {
		const gates = await cached(`world:gates:${zoneid}`, TTL.world, () => computeGateEmpires(zoneid));
		res.status(200).json({ zone: zoneid, gates });
	} catch (e) {
		res.status(503).json({ message: 'gate empires unavailable', gates: {} });
	}
});

// Continental lock state for every zone, read live from the running server over the PSF-HTTP API. Returned
// for all zones in one call since the zone list renders them together.
api.get('/zones/locks', async (req, res) => {
	try {
		res.status(200).json({ locks: await cached('world:locks', TTL.world, () => get_zone_locks()) });
	} catch (e) {
		// Server down, or an older build without the list_zones command.
		res.status(503).json({ message: 'zone locks unavailable', locks: {} });
	}
});

// Per-zone live detail: lock, per-faction population and hotspot count. Backs the home page's Zones
// panel (population + hotspots per continent).
api.get('/zones/details', async (req, res) => {
	try {
		res.status(200).json({ zones: await cached('world:details', TTL.world, () => get_zone_details()) });
	} catch (e) {
		res.status(503).json({ message: 'zone details unavailable', zones: {} });
	}
});

// Admin-only: the world server's in-memory interstellar log (base captures, 7-day retention).
api.get('/interstellar-log', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await get_interstellar_log());
	} catch (e) {
		res.status(503).json({ message: 'interstellar log unavailable', events: [], retention_days: 7 });
	}
});

// Admin-only: the world server's in-memory administrative audit trail (newest first, 7-day retention).
api.get('/admin-log', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await get_admin_log());
	} catch (e) {
		res.status(503).json({ message: 'admin log unavailable', actions: [], retention_days: 7 });
	}
});

// Admin-only: on-demand combat snapshot for ONE continent -- soldiers, vehicles (with seat occupancy
// and cargo) and deployables, with world coordinates. Fetched only when a continent is opened in the
// Combat view, so the heavy per-entity payload isn't pulled for every zone at once.
api.get('/zones/:zoneid/combat', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await get_combat_snapshot(String(req.params.zoneid || '')));
	} catch (e) {
		res.status(503).json({ message: 'combat snapshot unavailable' });
	}
});

// Admin-only: act on one live entity from the Combat view. Every one of these is destructive to
// someone's game in progress, so it goes through the world server (which owns the entity) and is
// recorded in the admin log along with the account that asked for it.
api.post('/zones/:zoneid/entities/:guid/action', NEED_ADMIN, async (req, res) => {
	try {
		const result = await entity_action(
			String(req.params.zoneid || ''),
			parseInt(req.params.guid),
			String(req.body?.action ?? ''),
			req.session_account?.username
		);
		res.status(200).json(result);
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'entity action failed' });
	}
});

// Admin-only: act on an ENTIRE continent -- kill everyone, kick everyone, or destroy everything
// within a radius of a point. None of these can be undone and none of them are aimed at a specific
// entity, so the admin re-enters their password here even though they already hold a session. The
// password check is a credential check like any other, so it goes through the same brute-force
// gates as the login form.
api.post('/zones/:zoneid/action', NEED_ADMIN, async (req, res) => {
	const username = req.session_account?.username;

	if (blocked(req, res, username)) return;

	const password = String(req.body?.password ?? '');
	if (!password) {
		res.status(400).json({ message: 'Confirm your password to continue' });
		return;
	}

	// Re-verify against the account that owns this session, never a name from the request body.
	let verified = false;
	try {
		verified = (await db.validate_account(username, password)) !== undefined;
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
		return;
	}

	if (!verified) {
		recordFailure(req, username);
		res.status(403).json({ message: 'Password incorrect' });
		return;
	}
	recordSuccess(req, username);

	try {
		const result = await zone_action(
			String(req.params.zoneid || ''),
			String(req.body?.action ?? ''),
			{ x: req.body?.x, y: req.body?.y, radius: req.body?.radius },
			username
		);
		res.status(200).json(result);
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'continent action failed' });
	}
});

// Admin-only: live player markers for every zone -- zone_id -> [{ x, y, facing, faction, name }].
// Exposes exact player positions, so it is gated behind an admin account and never served publicly.
api.get('/zones/players-all', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json({ zones: await get_zone_players() });
	} catch (e) {
		res.status(503).json({ message: 'player positions unavailable', zones: {} });
	}
});

// Admin-only: per-building ownership for EVERY zone in one call -- zone_number -> { local_id ->
// faction_id }. Backs the admin Continents view, which renders every continent map at once and needs
// each facility's owner to colour it, without a request per zone.
api.get('/zones/control-all', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json({ control: await live_control_by_zone_number() });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

// Admin-only: force one facility's ownership to an empire live (set_building_faction). `localId` is
// the building's map id; `faction` is TR/NC/VS/neutral.
api.post('/continents/:zoneid/building/:localId/faction', NEED_ADMIN, async (req, res) => {
	const zoneid = String(req.params.zoneid || '');
	const localId = Number.parseInt(req.params.localId, 10);
	const faction = String(req.body?.faction || '');
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneid) || !Number.isInteger(localId)) {
		res.status(400).json({ message: 'invalid zone id or local id' });
		return;
	}
	try {
		const result = await set_building_faction(zoneid, localId, faction, req.session_account?.username);
		res.status(200).json(result);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'error';
		const bad = /invalid |not a valid|no loaded zone|no capturable/i.test(msg);
		res.status(bad ? 400 : 503).json({ message: msg });
	}
});

// Admin-only: every zone's current state in one call -- base ownership counts per empire (from the
// building table) plus live lock state (from the PSF-HTTP API). Backs the admin "Continents" view so it can
// render all continents at once without a request per zone.
api.get('/zones/state', NEED_ADMIN, async (req, res) => {
	try {
		// zone_number -> { '0': tr, '1': nc, '2': vs, total }. Counted here rather than by the database,
		// because the ownership it counts is now live world state rather than rows.
		const control = {};
		for (const [number, facilities] of Object.entries(await live_control_by_zone_number())) {
			const z = (control[number] ??= { 0: 0, 1: 0, 2: 0, total: 0 });
			for (const faction of Object.values(facilities as Record<string, number>)) {
				if (z[faction] !== undefined) z[faction] += 1;
				z.total += 1;
			}
		}
		// Lock state is live server state; if it's unavailable, still return ownership counts.
		let locks = {};
		try {
			locks = await get_zone_locks();
		} catch (e) {
			locks = {};
		}
		res.status(200).json({ control, locks });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

// Admin-only: randomize continent control. Each empire floods out from its sanctuary along the live
// lattice; `weights` (per empire) biases where the fronts meet, `lockHome` fixes home continents.
// Computes the assignment and applies it live, one bulk command per zone.
api.post('/zones/randomize', NEED_ADMIN, async (req, res) => {
	const body = req.body ?? {};
	const weights = {
		0: Number(body.weights?.[0]),
		1: Number(body.weights?.[1]),
		2: Number(body.weights?.[2])
	};
	// Weights are barycentric (a corner of the bias triangle is 1/0/0), so 0 is valid -- it excludes
	// that empire. Only reject negatives/NaN, and require at least one positive weight.
	for (const e of [0, 1, 2]) {
		if (!Number.isFinite(weights[e]) || weights[e] < 0) {
			res.status(400).json({ message: 'weights must be non-negative numbers for TR/NC/VS' });
			return;
		}
	}
	if (weights[0] + weights[1] + weights[2] <= 0) {
		res.status(400).json({ message: 'at least one empire weight must be positive' });
		return;
	}
	try {
		// apply:false computes the layout and returns it without touching the server -- used to
		// populate a local draft the admin reviews before applying.
		if (body.apply === false) {
			const { control, summary } = await computeRandomState({ weights, lockHome: !!body.lockHome });
			res.status(200).json({ control, summary });
			return;
		}
		const result = await applyRandomState({ weights, lockHome: !!body.lockHome });
		res.status(200).json(result);
	} catch (e) {
		console.log(e);
		const msg = e instanceof Error ? e.message : 'error';
		res.status(503).json({ message: msg });
	}
});

// Admin-only: apply a whole continent layout live (e.g. an applied draft), one bulk command per zone.
// Body: { control: { <zoneNumber>: { <localId>: <factionId 0-3> } } }.
api.post('/zones/apply-layout', NEED_ADMIN, async (req, res) => {
	const control = req.body?.control;
	if (!control || typeof control !== 'object') {
		res.status(400).json({ message: 'control map required' });
		return;
	}
	try {
		// zoneNumber -> zoneId, via the shipped index.
		const idx = JSON.parse(
			(await import('node:fs')).readFileSync(
				(await import('node:path')).join(process.cwd(), 'public', 'continents', 'index.json'),
				'utf8'
			)
		);
		const idByNumber = {};
		for (const z of idx) idByNumber[z.number] = z.zoneId;

		let changed = 0;
		for (const [zoneNumber, own] of Object.entries(control)) {
			const zoneId = idByNumber[zoneNumber];
			if (!zoneId || !own || typeof own !== 'object') continue;
			const r = await set_zone_buildings(zoneId, own, req.session_account?.username);
			changed += r.buildings_changed ?? 0;
		}
		res.status(200).json({ buildings_changed: changed });
	} catch (e) {
		console.log(e);
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
	}
});

// Admin-only: force a continent's ownership to an empire live (set_zone_faction). The change is
// applied by the running world server -- database and in-memory state both -- so no restart is
// needed. `faction` is TR/NC/VS/neutral.
api.post('/continents/:zoneid/faction', NEED_ADMIN, async (req, res) => {
	const zoneid = String(req.params.zoneid || '');
	const faction = String(req.body?.faction || '');
	if (!/^[a-z0-9_]{1,16}$/i.test(zoneid)) {
		res.status(400).json({ message: 'invalid zone id' });
		return;
	}
	try {
		const result = await set_zone_faction(zoneid, faction, req.session_account?.username);
		res.status(200).json(result);
	} catch (e) {
		// Bad faction / unknown zone come back as Error messages; the server being down or lacking
		// the command surfaces the same way. 400 for the validation errors, 503 otherwise.
		const msg = e instanceof Error ? e.message : 'error';
		const bad = /invalid faction|invalid zone|not a valid faction|no loaded zone/i.test(msg);
		res.status(bad ? 400 : 503).json({ message: msg });
	}
});

export default api;
