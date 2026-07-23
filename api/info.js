import express from 'express'
import * as db from './db.js'
import { get_server_info } from './psadmin.js'

const api = express.Router();

// The population figures (server status, the online player list, and the
// per-empire breakdown) require a database lookup per online player, so the
// home page recomputing them on every load is wasteful. Compute them at most
// once every POP_CACHE_MINUTES (default 5) and serve the cached snapshot in
// between. The cheap account/character counts stay live.
const POP_CACHE_MS = (Number(process.env.POP_CACHE_MINUTES) || 5) * 60 * 1000;
let popCache = { at: 0, data: null };

async function computePopulation() {
	const info = get_server_info();
	const empires = { "TR": 0, "NC": 0, "VS": 0 };
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
	if (popCache.data && now - popCache.at < POP_CACHE_MS) {
		return popCache.data;
	}
	const data = await computePopulation();
	popCache = { at: now, data };
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
