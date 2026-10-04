/**
 * Player-facing endpoints: a logged-in user inspecting their OWN characters.
 *
 * Everything here is gated by `NEED_SESSION` plus an ownership check -- deliberately NOT `NEED_ADMIN`.
 * This is the departure from the old panel, where holding a session was only ever useful to a GM: an
 * ordinary player can now sign in and see their characters, locker and loadouts, and nothing else.
 * Admin capability stays entirely in api/admin.ts.
 *
 * A GM may read any character, matching how /user/:user/profile already behaves, so support can answer
 * "what am I actually carrying?" without asking the player to screenshot their inventory.
 *
 * Locker and loadout contents are treated as private. In a live game they are competitive intel, so
 * these are not public build-sharing endpoints; ownership is checked per character on every request
 * rather than trusting a character id the caller supplied.
 */

import express from 'express'
import * as db from './db.ts'
import { NEED_SESSION } from './util.ts'
import { decodeInventory, description, displayName, exosuitName, internalName } from './inventory.ts'

const api = express.Router();

/**
 * Resolves `:avatar` and refuses it unless the session owns the character (or is a GM).
 *
 * A character that does not exist and a character owned by somebody else both answer 404, so this
 * cannot be used to probe which character ids are real. A deleted character is 404 to its owner too --
 * the row lingers for the world server's benefit, not the player's.
 */
async function ownedCharacter(req, res, next) {
	const avatar_id = Number.parseInt(req.params.avatar, 10);

	if (!Number.isInteger(avatar_id) || avatar_id <= 0) {
		res.status(404).json({ message: 'no such character' });
		return;
	}

	try {
		const owner = await db.get_avatar_owner(avatar_id);
		const is_gm = req.session_account.gm === true && req.session_account.inactive === false;

		if (!owner || owner.deleted || (owner.account_id !== req.session.account_id && !is_gm)) {
			res.status(404).json({ message: 'no such character' });
			return;
		}

		req.avatar = owner;
		next();
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
}

/** The session's own characters. */
api.get('/me/characters', NEED_SESSION, async (req, res, next) => {
	try {
		const characters = await db.get_characters_by_account(req.session.account_id);

		res.status(200).json({
			characters: characters.map((c) => ({
				id: c.id,
				name: c.name,
				faction: c.faction_id,
				bep: c.bep,
				cep: c.cep,
				created: c.created,
				last_login: c.last_login,
			})),
		});
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/me/characters/:avatar/locker', NEED_SESSION, ownedCharacter, async (req, res, next) => {
	try {
		const clob = await db.get_locker_items(req.avatar.id);

		// No locker row at all is normal for a character that has never stored anything -- an empty
		// locker, not an error.
		res.status(200).json({
			avatar: { id: req.avatar.id, name: req.avatar.name },
			items: withDescriptions(decodeInventory(clob)),
		});
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.get('/me/characters/:avatar/loadouts', NEED_SESSION, ownedCharacter, async (req, res, next) => {
	try {
		const [infantry, vehicles] = await Promise.all([
			db.get_loadouts(req.avatar.id),
			db.get_vehicle_loadouts(req.avatar.id),
		]);

		res.status(200).json({
			avatar: { id: req.avatar.id, name: req.avatar.name },
			infantry: infantry.map((l) => ({
				number: l.loadout_number,
				name: l.name,
				exosuit: exosuitName(l.exosuit_id),
				exosuit_id: l.exosuit_id,
				items: withDescriptions(decodeInventory(l.items)),
			})),
			vehicles: vehicles.map((l) => ({
				number: l.loadout_number,
				name: l.name,
				vehicle_id: l.vehicle,
				vehicle: displayName(l.vehicle),
				// The internal name keys the trunk-dimension table; the display name is for people.
				vehicle_name: internalName(l.vehicle),
				items: withDescriptions(decodeInventory(l.items)),
			})),
		});
	} catch (e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

/**
 * Attaches the client's own tooltip text for each item. Only the items a character actually holds get
 * one, which is why the full description table is never sent to the browser.
 */
function withDescriptions(items) {
	return items.map((i) => {
		const info = description(i.objectId);
		return info ? { ...i, info } : i;
	});
}

export default api;
