import express from 'express'
import * as db from './db.ts'
import { set_account_ban, set_account_gm, set_avatar_permissions, transfer_player, place_vehicle, get_squads, disband_squad, remove_squad_member } from './psadmin.ts'
import { NEED_ADMIN, get_pagination, get_filter, get_sort, fetch_user_middleware } from './util.ts'

const api = express.Router();

api.param("user", fetch_user_middleware);

api.get('/users', NEED_ADMIN, async (req, res, next) => {
	const pagination = get_pagination(req);
	// Both are passed through to the login server as plain tokens; it holds the whitelist now, and
	// falls back to its own default for anything it does not recognise.
	const filter = get_filter(req, { param: 'filter', default: 'all', types: ['gm', 'banned'] });

	const sort = get_sort(req,
		{
			param : 'sort',
			default : 'created_desc',
			types : [db.ACCOUNT.ID, db.ACCOUNT.CREATED, db.ACCOUNT.USER, db.ACCOUNT.LAST_LOGIN],
		}
	);

	try {
		const accounts = await db.get_accounts_login_info(pagination, sort, filter);
		res.status(200).json({ users: accounts, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

api.post('/search', NEED_ADMIN, async (req, res, next) => {
	const pagination = get_pagination(req);

	let search = req.body.search;

	if (!search || search.length < 3) {
		res.status(400).json({ message: 'Need a longer search term' });
		return
	}

	try {
		const items = await db.search(search, pagination);
		res.status(200).json({ items: items, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

api.get('/user/:user', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	res.status(200).json({ id : account.id, name: account.username });
});

// Account-level GM, like every other account-table write, goes through the world server so the
// schema has a single writer. Nothing in the live world reads this flag, so there is no session to
// update -- that is what the per-character permissions below are for.
function set_account_admin(value: boolean) {
	return async (req, res, next) => {
		const account = req.user;

		try {
			await set_account_gm(account.id, value, req.session_account?.username);
			res.status(200).json({});
		} catch(e) {
			console.log(e);
			res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
		}
	};
}

api.post('/user/:user/add_gm', NEED_ADMIN, set_account_admin(true));
api.post('/user/:user/remove_gm', NEED_ADMIN, set_account_admin(false));

// Banning goes through the world server, not straight to Postgres: it owns the account row AND the
// live session, so the ban takes effect immediately -- every character on the account is kicked
// rather than merely being refused at next login.
api.post('/user/:user/ban', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		const result = await set_account_ban(account.id, true, req.session_account?.username);
		// A banned account should not keep its game-master flag; also through the world server.
		await set_account_gm(account.id, false, req.session_account?.username);
		res.status(200).json({ kicked: result?.kicked ?? [] });
	} catch(e) {
		console.log(e);
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
	}
});

api.post('/user/:user/unban', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		await set_account_ban(account.id, false, req.session_account?.username);
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
	}
});

api.get('/characters', NEED_ADMIN, async (req, res, next) => {
	const pagination = get_pagination(req);

	try {
		const characters = await db.get_characters(pagination, db.CHARACTER.LAST_LOGIN, db.SQL_ORDER.DESCENDING);
		res.status(200).json({ characters: characters, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

api.get('/roles', NEED_ADMIN, async (req, res, next) => {
	const pagination = get_pagination(req);

	try {
		const roles = await db.get_roles(pagination, db.CHARACTER.LAST_LOGIN, db.SQL_ORDER.DESCENDING);
		res.status(200).json({ characters: roles, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

// GM and spectator permissions go through the world server for the same reason bans do: it owns the
// row AND the live session. Written straight to Postgres, a promotion did nothing until the player
// relogged, and a revocation left them holding their powers for the rest of the session.
function set_permissions(field: 'can_gm' | 'can_spectate', value: boolean) {
	return async (req, res, next) => {
		const avatar = parseInt(req.params.avatar);

		if (!Number.isInteger(avatar)) {
			res.status(400).json({ message: 'invalid character id' });
			return;
		}

		try {
			const result = await set_avatar_permissions(
				avatar,
				{ [field]: value },
				req.session_account?.username
			);
			res.status(200).json({ applied_live: result?.applied_live ?? false });
		} catch(e) {
			console.log(e);
			res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
		}
	};
}

// --- Command: squad administration ---------------------------------------------------------------
//
// Squads exist only in the world server's memory, so these are the only view of them anywhere.

api.get('/squads', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await get_squads());
	} catch (e) {
		res.status(503).json({ message: 'squad service unavailable', count: 0, squads: [] });
	}
});

api.post('/squads/:squad/disband', NEED_ADMIN, async (req, res) => {
	const squad = Number(req.params.squad);
	if (!Number.isInteger(squad) || squad < 0) {
		res.status(400).json({ message: 'invalid squad id' });
		return;
	}
	try {
		res.status(200).json(await disband_squad(squad, req.session_account?.username));
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
	}
});

api.post('/squads/members/:char/remove', NEED_ADMIN, async (req, res) => {
	const charId = Number(req.params.char);
	if (!Number.isInteger(charId) || charId < 0) {
		res.status(400).json({ message: 'invalid character id' });
		return;
	}
	try {
		res.status(200).json(await remove_squad_member(charId, req.session_account?.username));
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' });
	}
});

api.post('/roles/:avatar/add_gm', NEED_ADMIN, set_permissions('can_gm', true));
api.post('/roles/:avatar/remove_gm', NEED_ADMIN, set_permissions('can_gm', false));
api.post('/roles/:avatar/add_spectate', NEED_ADMIN, set_permissions('can_spectate', true));
api.post('/roles/:avatar/remove_spectate', NEED_ADMIN, set_permissions('can_spectate', false));

// Move a logged-in character. `to` is either "sanctuary" (a forced recall, whose destination the
// world server derives from the player's own faction) or a zone id; `gate` is optional and only
// meaningful for a zone transfer.
//
// Targeted by character NAME, not id: an administrator acting on a report has a name, and the world
// server has to search its zones for the live player anyway.
api.post('/players/:name/transfer', NEED_ADMIN, async (req, res, next) => {
	const { to, gate } = req.body ?? {};

	if (typeof to !== 'string' || to.length === 0) {
		res.status(400).json({ message: 'a destination is required' });
		return;
	}

	try {
		const result = await transfer_player(
			req.params.name,
			to,
			typeof gate === 'string' && gate.length > 0 ? gate : undefined,
			req.session_account?.username
		);
		res.status(200).json(result);
	} catch (e) {
		console.log(e);
		// Distinguish three kinds of failure rather than collapsing them:
		//   400 -- the caller named something that does not exist (a bad zone or gate);
		//   409 -- the request was well formed but the world disagrees (offline, already in sanctuary);
		//   503 -- the world server could not be reached at all, which is the only real fault.
		const msg = e instanceof Error ? e.message : 'error';
		const status = /no such zone|no warp gate/i.test(msg)
			? 400
			: /not logged in|already in/i.test(msg)
				? 409
				: 503;
		res.status(status).json({ message: msg });
	}
});

// Place a vehicle, deployed AMS or deployed Router into a continent. The body carries only a 2D point;
// the world server derives ground height and slope, so the portal never has to know the terrain.
api.post('/zones/:zone/vehicles', NEED_ADMIN, async (req, res, next) => {
	const { kind, faction, x, y, telepad_x, telepad_y } = req.body ?? {};

	if (typeof kind !== 'string' || typeof faction !== 'string') {
		res.status(400).json({ message: 'kind and faction are required' });
		return;
	}
	if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
		res.status(400).json({ message: 'a position is required' });
		return;
	}

	const telepad =
		Number.isFinite(Number(telepad_x)) && Number.isFinite(Number(telepad_y))
			? { x: Number(telepad_x), y: Number(telepad_y) }
			: undefined;

	try {
		const result = await place_vehicle(
			req.params.zone,
			kind,
			faction,
			Number(x),
			Number(y),
			telepad,
			req.session_account?.username
		);
		res.status(200).json(result);
	} catch (e) {
		console.log(e);
		// Same split as the transfer route: a refusal about the world (no terrain data, an AMS inside a
		// facility) is a 409, a bad argument is a 400, and only an unreachable world server is a 503.
		const msg = e instanceof Error ? e.message : 'error';
		const status = /invalid|unknown vehicle|no such zone|required/i.test(msg)
			? 400
			: /open terrain|terrain height|inside a facility/i.test(msg)
				? 409
				: 503;
		res.status(status).json({ message: msg });
	}
});

export default api;
