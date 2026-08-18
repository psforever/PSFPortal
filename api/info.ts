import express from 'express'
import * as db from './db.ts'
import { get_server_info } from './psadmin.ts'

const api = express.Router();

// The population figures (server status, the online player list, and the
// per-empire breakdown) require a database lookup per online player, so
// recomputing them on every request is wasteful. But the home page polls this
// for live updates, so a blind time cache would make "server went down" or
// "a player joined" invisible for minutes.
//
// Instead, cache keyed by a signature of the LIVE server state (status + the
// set of connected player names, both already held in memory by the PSAdmin
// poller). The enrichment DB work only reruns when that actually changes -- so
// a status flip or a roster change refreshes immediately, while an unchanged
// roster keeps serving the cached snapshot and does no DB work. POP_CACHE_MS is
// kept only as a backstop so a snapshot can't go stale indefinitely (e.g. a
// player's own record changed while they stayed online).
const POP_CACHE_MS = (Number(process.env.POP_CACHE_MINUTES) || 5) * 60 * 1000;
let popCache = { at: 0, sig: null, data: null };

// A cheap fingerprint of the live server state, from the in-memory PSAdmin
// poll (no DB access). Changes exactly when the home page needs to update.
function populationSignature() {
	const info = get_server_info();
	const names = (info.players || []).map((p) => p.name).sort();
	return `${info.status}|${names.join(',')}`;
}

async function computePopulation() {
	const info = get_server_info();
	// NL = Black Ops / unaffiliated; counted so the chart can show it when non-zero.
	const empires = { "TR": 0, "NC": 0, "VS": 0, "NL": 0 };
	const players = info.players || [];
	let player_info = [];

	for (let i = 0; i < players.length; i++) {
		const char = await db.get_character_by_name(players[i].name);

		if (char) {
			player_info = player_info.concat(char)
			empires[db.FACTION_MAP[char.faction_id][1]] += 1
		} else {
			console.log("WARNING: cannot find player info '" + players[i].name + "' (are you sure PSAdmin is configured right?)")
		}
	}

	return { status: info.status, players: player_info, empires };
}

async function getCachedPopulation() {
	const now = Date.now();
	const sig = populationSignature();
	// Reuse the snapshot only while the live state is unchanged AND it hasn't aged past the backstop.
	if (popCache.data && popCache.sig === sig && now - popCache.at < POP_CACHE_MS) {
		return popCache.data;
	}
	const data = await computePopulation();
	popCache = { at: now, sig, data };
	return data;
}

api.get('/stats', async (req, res, next) => {
	try {
		const stats = await db.get_stats();            // accounts, characters, last — cheap, live
		const population = await getCachedPopulation(); // status, players, empires — cached ~5 min
		res.status(200).json({ ...population, ...stats });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

export default api;
