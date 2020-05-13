import express from 'express'
import * as db from './db.js'
import {get_server_info} from './psadmin.js'

const api = express.Router();

api.get('/stats', async (req, res, next) => {
	try {
		const stats = await db.get_stats();

		stats.empires = { "TR" : 0, "NC" : 0, "VS" : 0 }

		const info = get_server_info();
		let player_info = []
		let players = info.players;
		for (let i = 0; i < players.length; i++) {
			const char = await db.get_character_by_name(players[i]);

			if (char) {
				player_info = player_info.concat(char)
				stats.empires[db.FACTION_MAP[char.faction_id][1]] += 1
			} else
				console.log("WARNING: cannot find player info '" + players[i] + "'")
		}

		console.log(stats)
		info.players = player_info
		res.status(200).json({ ...stats, ...info });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message : 'error' });
	}
});

export default api;
