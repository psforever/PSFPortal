import express from 'express'
import * as db from './db.js'
import {AVATAR, SQL_ORDER} from "./db.js";

const api = express.Router();

api.get('/char_stats/:batch', async (req, res, next) => {
    try {
        const stats = await db.get_stats();

        stats.empires = { "TR": 0, "NC": 0, "VS": 0 }

        var batch = req.params.batch;

        const avatars = await db.get_character_batch_for_stats(batch, AVATAR.ID, SQL_ORDER.ASCENDING);

        res.status(200).json({ players: avatars });

    } catch (e) {
        console.log(e);
        res.status(500).json({ message: 'error' });
    }
});

api.get('/char_stats_bep/:batch', async (req, res, next) => {
    try {
        const stats = await db.get_stats();

        stats.empires = { "TR": 0, "NC": 0, "VS": 0 }

        var batch = req.params.batch;

        const avatars = await db.get_character_batch_for_stats(batch, AVATAR.BEP, SQL_ORDER.DESCENDING);

        res.status(200).json({ players: avatars });

    } catch (e) {
        console.log(e);
        res.status(500).json({ message: 'error' });
    }
});

api.get('/char_stats_cep/:batch', async (req, res, next) => {
    try {
        const stats = await db.get_stats();

        stats.empires = { "TR": 0, "NC": 0, "VS": 0 }

        var batch = req.params.batch;

        const avatars = await db.get_character_batch_for_stats(batch, AVATAR.CEP, SQL_ORDER.DESCENDING);

        res.status(200).json({ players: avatars });

    } catch (e) {
        console.log(e);
        res.status(500).json({ message: 'error' });
    }
});

api.get('/top_kills', async (req, res, next) => {
	try {
		const kills = await db.get_top_kills();
		res.status(200).json({ kills: kills });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/top_kills_byDate', async (req, res, next) => {
	try {
		const kills = await db.get_top_kills_byDate();
		res.status(200).json({ kills: kills });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/weaponstats/:avatar', async (req, res, next) => {
	const avatar = req.params.avatar;

	try {
		const weapons = await db.get_weaponstats_by_avatar(avatar);
		res.status(200).json({ weapons: weapons });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/avatar/:avatar', async (req, res, next) => {
	const avatar = req.params.avatar;

	try {
		const avatarData = await db.get_avatar(avatar);
		res.status(200).json({
		id: avatarData.id,
		name: avatarData.name,
		bep: avatarData.bep,
		cep: avatarData.cep,
		faction: avatarData.faction_id,
		gender: avatarData.gender_id,
		head: avatarData.head_id
		 });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/avatar/:avatar/kd_byDate', async (req, res, next) => {
	const avatar = req.params.avatar;

	try {
		const kd = await db.get_avatar_kd_byDate(avatar);
		res.status(200).json({ kd: kd });
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

export default api;