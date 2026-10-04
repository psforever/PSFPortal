import express from 'express'
import * as db from './db.ts'
import {AVATAR, SQL_ORDER} from "./db.ts";
import { displayName, internalName } from './inventory.ts'
import { TTL, cachedJson } from './cache.ts'

const api = express.Router();

api.get('/char_stats/:batch', async (req, res, next) => {
    try {
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
        var batch = req.params.batch;

        const avatars = await db.get_character_batch_for_stats(batch, AVATAR.CEP, SQL_ORDER.DESCENDING);

        res.status(200).json({ players: avatars });

    } catch (e) {
        console.log(e);
        res.status(500).json({ message: 'error' });
    }
});

api.get('/top_kills', cachedJson(TTL.leaderboard, () => "top_kills", async (req) => {
	return { kills: await db.get_top_kills() };
}, { kills: [] }));

api.get('/top_kills_byDate', cachedJson(TTL.leaderboard, () => "top_kills_byDate", async (req) => {
	return { kills: await db.get_top_kills_byDate() };
}, { kills: [] }));

// Top Guns and Top Vehicles, both counted from kill activity. The world server decides which
// weapons belong to a vehicle (it has the definitions); the gun rows arrive as bare object ids and
// are named here from the client's own tables, the same source the character weapon stats use.
api.get('/top_weapons', cachedJson(TTL.leaderboard, () => "top_weapons", async (req) => {
	const info: any = await db.get_top_weapons(15);
	const guns = (Array.isArray(info?.guns) ? info.guns : []).map((g: any) => ({
		weapon_id: g.weaponId ?? g.weapon_id,
		kills: g.kills,
		name: internalName(g.weaponId ?? g.weapon_id),
		display: displayName(g.weaponId ?? g.weapon_id)
	}));
	return { guns, vehicles: Array.isArray(info?.vehicles) ? info.vehicles : [] };
}, { guns: [], vehicles: [] }));

api.get('/top_outfits', cachedJson(TTL.leaderboard, () => "top_outfits", async (req) => {
	return { outfits: await db.get_top_outfits() };
}, { outfits: [] }));

api.get('/outfit/:outfit', cachedJson(TTL.entity, r => `outfit:${r.params.outfit}`, async (req) => {
	const outfit = await db.get_outfit(req.params.outfit);
	if (!outfit) throw new Error('not found');
	return outfit;
}, undefined));

api.get('/outfit/:outfit/members', cachedJson(TTL.entity, r => `outfit_members:${r.params.outfit}`, async (req) => {
	return { members: await db.get_outfit_members(req.params.outfit) };
}, { members: [] }));

api.get('/weaponstats/:avatar', cachedJson(TTL.entity, r => `weaponstats:${r.params.avatar}`, async (req) => {
	return { weapons: await db.get_weaponstats_by_avatar(req.params.avatar) };
}, { weapons: [] }));

api.get('/avatar/:avatar', cachedJson(TTL.entity, r => `avatar:${r.params.avatar}`, async (req) => {
	const avatar = await db.get_avatar(req.params.avatar);
	if (!avatar) throw new Error('not found');
	return avatar;
}, undefined));

api.get('/avatar/:avatar/kd_byDate', cachedJson(TTL.entity, r => `kd:${r.params.avatar}`, async (req) => {
	return { kd: await db.get_avatar_kd_byDate(req.params.avatar) };
}, { kd: [] }));

export default api;