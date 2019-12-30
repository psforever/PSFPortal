import express from 'express'
import * as db from './db.js'

const api = express.Router();

api.get('/stats', async (req, res, next) => {
	try {
		const stats = await db.get_stats();
		res.status(200).json({ ...stats });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message : 'error' });
	}
});

export default api;
