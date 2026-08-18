import * as db from './db.ts';
import { get_lattice } from './psadmin.ts';
import { loadZones } from './randomize.ts';

/**
 * The empire on the far side of each of a zone's warpgates -- for colouring the warpgate -> first
 * facility lattice link on the continent map.
 *
 * A warpgate connects (over the live lattice) either to a sanctuary or to a warpgate on another
 * continent. The "connection empire" is:
 *   - the sanctuary's empire, if it links to a sanctuary; or
 *   - the empire currently holding the gateway facility of the paired warpgate on the other
 *     continent (the non-gate facility that warpgate links to).
 *
 * Returned as { <warpgate rawName lowercased>: factionId }. Computed here rather than in the browser
 * because it needs the whole lattice, every continent's facility layout, and live ownership at once.
 */

const SANCTUARY = { home1: 1, home2: 0, home3: 2 }; // NC, TR, VS
const GATE_TYPES = new Set(['warpgate', 'warpgate_small', 'warpgate_cavern', 'hst']);
const qualify = (zid, n) => (String(n).includes('/') ? String(n) : `${zid}/${n}`).toLowerCase();

export async function computeGateEmpires(zoneId) {
	const zones = loadZones();
	const z = zones[zoneId];
	if (!z) return {};

	const lattice = await get_lattice();
	const adj = new Map();
	const edge = (a, b) => {
		if (!adj.has(a)) adj.set(a, new Set());
		if (!adj.has(b)) adj.set(b, new Set());
		adj.get(a).add(b);
		adj.get(b).add(a);
	};
	for (const [zid, links] of Object.entries(lattice)) {
		for (const [a, b] of links ?? []) edge(qualify(zid, a), qualify(zid, b));
	}

	// zone_number -> { local_id -> faction_id }
	const rows = await db.pool.query('SELECT zone_id, local_id, faction_id FROM building');
	const control = {};
	for (const r of rows.rows) (control[r.zone_id] ??= {})[r.local_id] = r.faction_id;

	// Look up a facility on a given zone by its (lowercased) raw name.
	const facByRaw = {};
	const lookup = (zid) => {
		if (!facByRaw[zid]) {
			const m = new Map();
			for (const f of zones[zid]?.facilities ?? []) m.set(String(f.rawName).toLowerCase(), f);
			facByRaw[zid] = m;
		}
		return facByRaw[zid];
	};

	const prefix = `${zoneId}/`.toLowerCase();
	const out = {};
	for (const g of z.facilities.filter((f) => GATE_TYPES.has(f.type))) {
		const gkey = qualify(zoneId, g.rawName);
		const partners = [...(adj.get(gkey) ?? [])].filter((n) => !n.startsWith(prefix));
		let ce;
		for (const p of partners) {
			const [pz, pname] = p.split('/');
			if (SANCTUARY[pz] !== undefined) {
				ce = SANCTUARY[pz];
				break;
			}
			// Another continent's warpgate: find its gateway facility (the non-gate facility it links
			// to) and read that facility's current owner.
			if (!zones[pz]) continue;
			const gwNode = [...(adj.get(p) ?? [])].find((n) => {
				if (!n.startsWith(`${pz}/`)) return false;
				const f = lookup(pz).get(n.slice(pz.length + 1));
				return f && !GATE_TYPES.has(f.type);
			});
			if (gwNode) {
				const f = lookup(pz).get(gwNode.slice(pz.length + 1));
				const owner = control[zones[pz].number]?.[f.id];
				if (owner !== undefined && owner <= 2) {
					ce = owner;
					break;
				}
			}
		}
		if (ce !== undefined) out[String(g.rawName).toLowerCase()] = ce;
	}
	return out;
}
