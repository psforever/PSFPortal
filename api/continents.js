import express from 'express'
import * as db from './db.js'

const api = express.Router();

// Current base ownership for a continent, keyed by the building's local id
// (which matches the `id` in the static continent facility data). The static
// continent geometry/facility layout is shipped as an asset; only the live
// control state comes from here.
api.get('/continents/:zone/control', async (req, res) => {
	const zone = Number.parseInt(req.params.zone, 10);
	if (!Number.isInteger(zone) || zone < 1) {
		res.status(400).json({ message: 'invalid zone' });
		return;
	}
	try {
		const result = await db.pool.query(
			'SELECT local_id, faction_id FROM building WHERE zone_id = $1',
			[zone]
		);
		const control = {};
		for (const row of result.rows) {
			control[row.local_id] = row.faction_id;
		}
		res.status(200).json({ zone, control });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

export default api;
