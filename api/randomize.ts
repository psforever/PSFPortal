import fs from 'node:fs';
import path from 'node:path';
import { get_lattice, set_zone_buildings } from './psadmin.ts';

/**
 * Randomize continent control by pushing each empire OUT from its sanctuary along the live lattice.
 *
 * Every empire floods from the warpgates that connect to its sanctuary; a facility falls to whichever
 * empire reaches it "cheapest", where cost = hop distance / that empire's bias weight. Raising an
 * empire's weight lowers its cost per hop, so its front pushes further before meeting a neighbour --
 * that is what the bias wheel controls: it moves where the empires meet.
 *
 * With `lockHome`, each empire's home continents (the ones with a direct sanctuary warpgate) are set
 * 100% to that empire and the flood starts outward from them (caverns included, via whatever geowarp
 * links the live lattice currently holds).
 *
 * Towers are not on the lattice, so they inherit the nearest lattice-linked facility's owner. Any
 * facility the flood can't reach (e.g. a cavern with no active geowarp link) is filled by a
 * bias-weighted random empire so nothing is left unset.
 */

/** Sanctuary zone -> empire (PSF ZoneInfo: home1 NC, home2 TR, home3 VS). */
const SANCTUARY = { home1: 1, home2: 0, home3: 2 };
/** empire -> its sanctuary zone. */
const EMPIRE_HOME = { 0: 'home2', 1: 'home1', 2: 'home3' };
const EMPIRES = [0, 1, 2];
const GATE_TYPES = new Set(['warpgate', 'warpgate_small', 'warpgate_cavern', 'hst']);

export function loadZones(): Record<string, any> {
	const dir = path.join(process.cwd(), 'public', 'continents');
	const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
	const zones = {};
	for (const z of index) {
		if (z.group === 'sanctuary') continue;
		try {
			const c = JSON.parse(fs.readFileSync(path.join(dir, z.base + '.json'), 'utf8'));
			zones[z.zoneId] = { ...z, facilities: c.facilities };
		} catch (e) {
			/* zone map missing; skip */
		}
	}
	return zones;
}

const qualify = (zid, n) => (String(n).includes('/') ? String(n) : `${zid}/${n}`).toLowerCase();

/**
 * Compute the assignment. `weights` is { 0: wTR, 1: wNC, 2: wVS } (positive). Returns
 * { control: { zoneNumber: { localId: factionId } }, summary: { zoneName: {TR,NC,VS} } }.
 */
export async function computeRandomState({ weights, lockHome }) {
	// Weights sum to ~1 (barycentric). A weight of 0 EXCLUDES that empire entirely (infinite push
	// cost below), so a corner of the bias triangle yields 100% and an edge excludes the third empire.
	const w: Record<number, number> = {
		0: Math.max(0, Number(weights?.[0]) || 0),
		1: Math.max(0, Number(weights?.[1]) || 0),
		2: Math.max(0, Number(weights?.[2]) || 0)
	};
	if (w[0] + w[1] + w[2] === 0) w[0] = w[1] = w[2] = 1; // degenerate input -> balanced
	const zones = loadZones();
	const lattice = await get_lattice();

	// Adjacency over qualified `zoneId/name` nodes.
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

	// Home continents per empire: a zone with a direct edge to that empire's sanctuary.
	const homeCont = { 0: new Set(), 1: new Set(), 2: new Set() };
	for (const [homeZone, empire] of Object.entries(SANCTUARY)) {
		for (const node of adj.keys()) {
			if (!node.startsWith(`${homeZone}/`)) continue;
			for (const nb of adj.get(node)) {
				const zid = nb.split('/')[0];
				if (zones[zid] && zid !== homeZone) homeCont[empire].add(zid);
			}
		}
	}

	// Facilities forced by lockHome.
	const fixed = new Map(); // node -> empire
	if (lockHome) {
		for (const e of EMPIRES) {
			for (const zid of homeCont[e]) {
				for (const f of zones[zid].facilities) {
					if (!GATE_TYPES.has(f.type)) fixed.set(qualify(zid, f.rawName), e);
				}
			}
		}
	}

	// BFS hop distance from each empire's seeds.
	function bfs(empire) {
		const dist = new Map();
		const queue = [];
		const seed = (node) => {
			if (adj.has(node) && !dist.has(node)) {
				dist.set(node, 0);
				queue.push(node);
			}
		};
		for (const node of adj.keys()) if (node.startsWith(`${EMPIRE_HOME[empire]}/`)) seed(node);
		if (lockHome) {
			for (const zid of homeCont[empire]) {
				for (const f of zones[zid].facilities) seed(qualify(zid, f.rawName));
			}
		}
		for (let h = 0; h < queue.length; h++) {
			const cur = queue[h];
			for (const nb of adj.get(cur) ?? []) {
				if (!dist.has(nb)) {
					dist.set(nb, dist.get(cur) + 1);
					queue.push(nb);
				}
			}
		}
		return dist;
	}
	const reach = { 0: bfs(0), 1: bfs(1), 2: bfs(2) };

	// Deterministic-ish weighted pick for unreachable facilities (no Math.random reliance on order).
	let seedN = 1;
	const rand = () => {
		seedN = (seedN * 1103515245 + 12345) & 0x7fffffff;
		return seedN / 0x7fffffff;
	};
	const weightedEmpire = () => {
		const total = w[0] + w[1] + w[2];
		let r = rand() * total;
		for (const e of EMPIRES) {
			r -= w[e];
			if (r <= 0) return e;
		}
		return 2;
	};

	const ownerOf = (node) => {
		if (fixed.has(node)) return fixed.get(node);
		let best = null;
		let bestCost = Infinity;
		for (const e of EMPIRES) {
			const d = reach[e].get(node);
			if (d === undefined || w[e] <= 0) continue; // weight 0 -> excluded (infinite cost)
			const cost = d / w[e];
			if (cost < bestCost) {
				bestCost = cost;
				best = e;
			}
		}
		return best;
	};

	// Assign every capturable facility.
	const control = {}; // zoneNumber -> { localId: faction }
	const summary = {}; // zoneName -> {TR,NC,VS}
	for (const [zid, z] of Object.entries(zones)) {
		const own = {};
		const linked = z.facilities.filter((f) => !GATE_TYPES.has(f.type) && adj.has(qualify(zid, f.rawName)));
		const towers = z.facilities.filter((f) => !GATE_TYPES.has(f.type) && !adj.has(qualify(zid, f.rawName)));

		for (const f of linked) {
			const e = ownerOf(qualify(zid, f.rawName));
			own[f.id] = e === null ? weightedEmpire() : e;
		}
		// Towers inherit the nearest linked facility (surrounding territory), else weighted-random.
		for (const t of towers) {
			let best = null;
			let bestD = Infinity;
			for (const f of linked) {
				const d = (f.x - t.x) ** 2 + (f.y - t.y) ** 2;
				if (d < bestD) {
					bestD = d;
					best = f;
				}
			}
			own[t.id] = best ? own[best.id] : weightedEmpire();
		}

		control[z.number] = own;
		const tally: Record<string, number> = { TR: 0, NC: 0, VS: 0 };
		for (const e of Object.values(own) as number[]) tally[['TR', 'NC', 'VS'][e]]++;
		summary[z.name] = tally;
	}

	return { control, summary, zones };
}

/** Compute a random state and apply it live, one bulk command per zone. */
export async function applyRandomState({ weights, lockHome }) {
	const { control, summary, zones } = await computeRandomState({ weights, lockHome });
	// zoneNumber -> zoneId, to address the bulk command.
	const idByNumber = {};
	for (const z of Object.values(zones)) idByNumber[z.number] = z.zoneId;

	let totalChanged = 0;
	for (const [zoneNumber, own] of Object.entries(control)) {
		const zoneId = idByNumber[zoneNumber];
		if (!zoneId || Object.keys(own).length === 0) continue;
		try {
			const r = await set_zone_buildings(zoneId, own);
			totalChanged += r.buildings_changed ?? 0;
		} catch (e) {
			/* keep going; report what we can */
		}
	}
	return { summary, buildings_changed: totalChanged };
}
