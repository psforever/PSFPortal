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

export default api;