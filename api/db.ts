import pg from 'pg'
import pg_error from 'pg-error-constants'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import assert from 'assert'

function objectFlip(obj) {
	const ret = {};
	Object.keys(obj).forEach(key => {
		ret[obj[key]] = key;
	});
	return ret;
}

let pg_error_inv = objectFlip(pg_error)

export let pool;

export const FACTION_MAP = {
	0: ["Terran Republic", "TR"],
	1: ["New Conglomerate", "NC"],
	2: ["Vanu Sovereignty", "VS"],
	3: ["Neutral", "NL"],
}

export const FACTION_MAP_INV = objectFlip(FACTION_MAP)
const BCRYPT_ROUNDS = 4;

export const SQL_ORDER = Object.freeze({
	ASCENDING: Symbol("ASC"),
	DESCENDING: Symbol("DESC"),
});

export const ACCOUNT = Object.freeze({
	THIS: Symbol("account"),
	ID: Symbol("id"),
	USER: Symbol("username"),
	PASSWORD: Symbol("passhash"),
	CREATED: Symbol("created"),
	MODIFIED: Symbol("last_modified"),
	BANNED: Symbol("inactive"),
	ADMIN: Symbol("gm"),

	// A derived table column
	LAST_LOGIN: Symbol("last_login"),
});

export const CHARACTER = Object.freeze({
	THIS: Symbol("avatar"),
	ID: Symbol("id"),
	NAME: Symbol("name"),
	ACCOUNT_ID: Symbol("account_id"),
	FACTION: Symbol("faction_id"),
	GENDER: Symbol("gender_id"),
	HEAD: Symbol("head_id"),
	VOICE: Symbol("void_id"),
	CREATED: Symbol("created"),
	LAST_LOGIN: Symbol("last_login"),
	LAST_MODIFIED: Symbol("last_modified"),
	DELETED: Symbol("deleted"),
});

// Added for Avatar
// Only utilizing columns believed to be "safe"
// Should be reviewed at a later date
export const AVATAR = Object.freeze({
	THIS: Symbol("experience"),
	ID: Symbol("id"),
	NAME: Symbol("name"),
	BEP: Symbol("bep"),
	CEP: Symbol("cep"),
	GENDER: Symbol("gender_id"),
	HEAD: Symbol("head_id"),
});

export const AVATARMODEPERMISSION = Object.freeze({
	THIS: Symbol("avatarmodepermission"),
	ID: Symbol("avatar_id"),
	GM: Symbol("can_gm"),
	SPECTATE: Symbol("can_spectate")
});

export const WEAPONSTAT = Object.freeze({
	THIS: Symbol("weapon"),
	ID: Symbol("avatar_id"),
	WEAPON: Symbol("weapon_id"),
	SHOTS_FIRED: Symbol("shots_fired"),
	SHOTS_LANDED: Symbol("shots_landed"),
	KILLS: Symbol("kills"),
	ASSISTS: Symbol("assists")
});

export const KILLACTIVITY = Object.freeze({
	THIS: Symbol("kill"),
	ID: Symbol("killer_id"),
	EXP: Symbol("exp")
});

export const LOGIN = Object.freeze({
	THIS: Symbol("login"),
	ID: Symbol("id"),
	ACCOUNT_ID: Symbol("account_id"),
});

function to_sql(symbol) {
	assert(typeof symbol == 'symbol',
		`symbol expected got ${typeof symbol}`)
	return String(symbol).slice(7, -1);
}

function to_sql_kv(fields, idx = 1): { sql: any; next_idx: number; values: any[] } {
	let SQL = [];
	let values = [];

	// This will ONLY get Symbols in the field dict
	if (!fields || Object.getOwnPropertySymbols(fields).length == 0) {
		return { sql: [], next_idx: idx, values: [] }
	}

	Object.getOwnPropertySymbols(fields).forEach(key => {
		assert(typeof key == 'symbol')
		SQL.push(to_sql(key) + "=$" + idx++);
		values.push(fields[key]);
	});

	return {
		sql: SQL,
		next_idx: idx,
		values: values,
	}
}

function build_WHERE(filter, idx = 1) {
	const kv = to_sql_kv(filter.fields, idx);

	if (kv.sql.length > 1) {
		assert(filter.binop !== undefined,
			"binary operand required in WHERE with multiple terms")
		const binop = filter.binop == "AND" ? Symbol("AND") : Symbol("OR");
		kv.sql = Symbol(`WHERE ${kv.sql.join(` ${to_sql(binop)} `)}`);
	} else if (kv.sql.length == 1)
		kv.sql = Symbol(`WHERE ${kv.sql[0]}`);
	else
		kv.sql = Symbol("")

	return kv;
}

function build_ORDER_BY(sort) {
	// This will ONLY get Symbols in the sort dict
	if (!sort || Object.getOwnPropertySymbols(sort).length == 0) {
		return Symbol("");
	}

	let SQL = []
	Object.getOwnPropertySymbols(sort).forEach(key => {
		const value = sort[key];
		assert(typeof key == 'symbol')
		assert(typeof value == 'symbol')
		SQL.push(`${to_sql(key)} ${to_sql(value)}`);
	});

	return Symbol(`ORDER BY ${SQL.join(", ")}`);
}

function build_OFFSET(offset, limit, idx = 1) {
	assert(typeof offset == 'number', "offset must be a number");
	assert(typeof limit == 'number', "limit must be a number");

	return {
		sql: Symbol(`OFFSET $${idx++} LIMIT $${idx++}`),
		next_idx: idx,
		values: [offset, limit],
	};
}

async function get_row_count(table, filter = undefined) {
	let resp;

	if (filter) {
		const where = build_WHERE(filter);
		resp = await pool.query(`SELECT COUNT(*) FROM ${to_sql(table)} ${to_sql(where.sql)}`,
			where.values);
	} else {
		resp = await pool.query(`SELECT COUNT(*) FROM ${to_sql(table)}`);
	}
	return parseInt(resp.rows[0].count);
}

export async function connect_to_db() {
	pool = new pg.Pool()
	try {
		const res = await pool.query('SELECT NOW()')

		// Quick hack for query debugging (throws exception)
		const _query = pool.query;
		pool.query_log = (q, v) => {
			console.log("QUERY LOG: ", q, v);
			return _query(q, v);
		}
		console.log(`Connected to the psql database at ${process.env.PGHOST}`)
	} catch (e) {
		console.log("Unable to connect to the database: " + e.message);
		process.exit(1);
	}
}

export async function get_account_by_id(id) {
	try {
		const account = await pool.query('SELECT * FROM account WHERE id=$1', [id]);

		if (account.rows.length == 0) {
			return undefined;
		}

		const account_obj = account.rows[0];
		delete account_obj.passhash;

		return account_obj;
	} catch (e) {
		throw e;
	}
}

export async function get_accounts(pagination, sort, order) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const account_count = await get_row_count(ACCOUNT.THIS);
		const accounts = await pool.query(`SELECT id, username, created, last_modified, gm, inactive FROM account ORDER BY ${to_sql(sort)} ${to_sql(order)} OFFSET $1 LIMIT $2`, values);

		pagination.item_count = account_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);
		accounts.rows.forEach((r) => {
			r.name = r.username;
			r.admin = r.gm;
			delete r.username;
			delete r.gm;
		});
		return accounts.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_accounts_login_info(pagination, sort, filter) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const account_count = await get_row_count(ACCOUNT.THIS, filter);
		const where = build_WHERE(filter);
		const offset = build_OFFSET(start_id, pagination.items_per_page, where.next_idx);
		const values = [].concat(where.values, offset.values);
		const order = build_ORDER_BY(sort);

		// this was a really hard query to get right...
		// https://www.gab.lc/articles/better_faster_subqueries_postgresql/
		const accounts = await pool.query(
			' SELECT account.*,' +
			' COALESCE(l.lastLogin, TIMESTAMP \'epoch\') as last_login, l2.ip_address FROM account' +
			' LEFT OUTER JOIN (' +
			'   SELECT MAX(id) as loginId, account_id, MAX(login_time) as lastLogin' +
			'   FROM login' +
			'   GROUP BY account_id' +
			' ) l ON l.account_id = account.id' +
			' LEFT OUTER JOIN login l2' +
			' ON l2.id = l.loginId' +
			` ${to_sql(where.sql)}` +
			` ${to_sql(order)}` +
			` ${to_sql(offset.sql)}`, values);

		pagination.item_count = account_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		accounts.rows.forEach((r) => {
			r.name = r.username;
			r.admin = r.gm;

			if (r.ip_address !== null) {
			    const splitOctet = r.ip_address.split('.'); // Split IP address by '.'
                const lastOctets = splitOctet.slice(-2).join('.');
				r.last_login = {
					time: r.last_login,
					ip: lastOctets,
				}
			} else {
				r.last_login = {}
			}

			delete r.canonical_hostname;
			delete r.ip_address;
			delete r.passhash;
			delete r.username;
			delete r.gm;
			delete r.password;
		});
		return accounts.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_characters(pagination, sort, order) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const char_count = await get_row_count(CHARACTER.THIS);
		const chars = await pool.query(`SELECT id, account_id, name, faction_id, created, last_login, avatar_id, can_gm, can_spectate FROM avatar LEFT JOIN avatarmodepermission ON avatar_id = id ORDER BY ${to_sql(sort)} ${to_sql(order)} OFFSET $1 LIMIT $2`, values);

		pagination.item_count = char_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		return chars.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_roles(pagination, _sort?: any, _order?: any) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const roles = await pool.query(`SELECT avatar_id, can_spectate, can_gm, id, last_login, account_id, name FROM avatarmodepermission INNER JOIN avatar ON avatar_id = id WHERE can_gm = TRUE OR can_spectate = TRUE ORDER BY last_login DESC OFFSET $1 LIMIT $2`, values);
		const char_count = roles.rowCount;
		pagination.item_count = char_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		return roles.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

// Database action added for the sake of reporting avatar information out to a publicly exposed API route for leader-boards and other components.
export async function get_character_batch_for_stats(batch, sort, order) {
	const values = [batch];

	try {
		const char_count = await get_row_count(CHARACTER.THIS);
		const chars = await pool.query(`SELECT id, name, faction_id, bep, cep FROM avatar ORDER BY ${to_sql(sort)} ${to_sql(order)} OFFSET $1*500 LIMIT 500`, values);

		return chars.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_weaponstats_by_avatar(id) {
	try {
		const weapons = await pool.query('SELECT * FROM weaponstat WHERE avatar_id=$1 ORDER BY kills DESC', [id])
		return weapons.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_avatar(id) {
    try {
        const avatar = await pool.query(
        'SELECT a.id, a.name, a.faction_id, a.bep, a.cep, a.gender_id, a.head_id, a.created, a.last_login,' +
        ' o.id AS outfit_id, o.name AS outfit_name' +
        ' FROM avatar a' +
        ' LEFT JOIN outfitmember om ON om.avatar_id = a.id' +
        ' LEFT JOIN outfit o ON o.id = om.outfit_id' +
        ' WHERE a.id = $1',
      [id])
        return avatar.rows[0];
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_top_kills() {
	try {
		const kills = await pool.query('SELECT count(killactivity.killer_id), killactivity.killer_id, avatar.name, avatar.bep,' +
		 ' avatar.cep, avatar.faction_id, avatar.gender_id, avatar.head_id' +
         ' FROM killactivity' +
         ' INNER JOIN avatar ON killactivity.killer_id = avatar.id' +
         ' WHERE exp > 0' +
         ' GROUP BY killactivity.killer_id, avatar.name, avatar.bep, avatar.cep, avatar.faction_id, avatar.gender_id, avatar.head_id' +
         ' ORDER BY count(killer_id) DESC' +
         ' LIMIT 500')
		return kills.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_avatar_kd_byDate(id) {
	try {
		const kd = await pool.query("SELECT TO_CHAR(timestamp, 'FMMon DD, YYYY') AS date," +
        ' SUM(CASE WHEN killer_id = $1 THEN 1 ELSE 0 END)::int AS kills,' +
        ' SUM(CASE WHEN victim_id = $1 THEN 1 ELSE 0 END)::int AS deaths' +
        ' FROM killactivity WHERE exp > 0 GROUP BY date HAVING' +
        ' SUM(CASE WHEN killer_id = $1 THEN 1 ELSE 0 END) > 0 OR SUM(CASE WHEN victim_id = $1 THEN 1 ELSE 0 END) > 0' +
        ' ORDER BY MIN(timestamp) DESC', [id])
		return kd.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_top_kills_byDate() {
	try {
		const kills = await pool.query('WITH RankedKills AS (SELECT COUNT(*)::int AS kill_count,' +
        ' killer_id, DATE(timestamp) AS kill_date, ROW_NUMBER() OVER (PARTITION BY killer_id ORDER BY COUNT(*) DESC)::int AS row_num' +
        ' FROM killactivity WHERE exp > 0 GROUP BY killer_id, DATE(timestamp)) SELECT rk.kill_count, rk.killer_id,' +
        " TO_CHAR(rk.kill_date, 'FMMon DD, YYYY') AS f_kill_date, rk.row_num, av.name, av.faction_id FROM RankedKills rk" +
        ' JOIN avatar av ON rk.killer_id = av.id WHERE rk.row_num = 1 ORDER BY rk.kill_count DESC LIMIT 50')
		return kills.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_top_outfits() {
    try {
    const outfits = await pool.query(
    'WITH OutfitData AS (' +
    ' SELECT o.id AS outfit_id,' +
    '        o.faction,' +
    '        o.name AS outfit_name,' +
    '        a.id AS leader_id, a.name AS leader_name,' +
    '        COUNT(om.avatar_id)::int AS members,' +
    '        (op.points / 100.0)::int AS points' +
    '   FROM outfit o' +
    '   JOIN avatar a ON a.id = o.owner_id' +
    '   LEFT JOIN outfitmember om ON om.outfit_id = o.id' +
    '   LEFT JOIN outfitpoint_mv op ON op.outfit_id = o.id' +
    '   GROUP BY o.id, o.faction, o.name, a.name, a.id, op.points' +
  ') ' +
  'SELECT outfit_id, faction, outfit_name, leader_name, leader_id, members, points ' +
  'FROM OutfitData ' +
  'ORDER BY points DESC')
    return outfits.rows;
    } catch (e) {
      	if (e.code)
      		e.code = pg_error_inv[e.code]
      	throw e;
    }
}

export async function get_outfit(id) {
  try {
const outfit = await pool.query(
  'WITH OutfitData AS (' +
    ' SELECT o.id AS outfit_id, o.faction, o.name AS outfit_name, o.created,' +
    '        a.id AS leader_id,' +
    '        a.name AS leader_name,' +
    '        COUNT(om.avatar_id)::int AS members,' +
    '        (op.points / 100.0)::int AS points' +
    '   FROM outfit o ' +
    '   JOIN avatar a ON a.id = o.owner_id ' +
    '   LEFT JOIN outfitmember om ON om.outfit_id = o.id ' +
    '   LEFT JOIN outfitpoint_mv op ON op.outfit_id = o.id ' +
    '   WHERE o.id = $1 ' +
    '   GROUP BY o.created, o.id, o.faction, o.name, a.id, a.name, op.points) ' +
  'SELECT outfit_id, faction, outfit_name, leader_id, leader_name, members, points, created ' +
  'FROM OutfitData',
  [id])
    return outfit.rows[0];
    } catch (e) {
        if (e.code)
            e.code = pg_error_inv[e.code];
        throw e;
    }
}

export async function get_outfit_members(id) {
  try {
const members = await pool.query(
      'SELECT av.id AS avatar_id, av.bep, av.cep,' +
      '       av.name AS avatar_name,' +
      '       om.rank AS rank_num,' +
      '       CASE om.rank ' +
      '         WHEN 0 THEN COALESCE(o.rank0, \'Fodder\') ' +
      '         WHEN 1 THEN COALESCE(o.rank1, \'Soldier\') ' +
      '         WHEN 2 THEN COALESCE(o.rank2, \'Commando\') ' +
      '         WHEN 3 THEN COALESCE(o.rank3, \'Master at Arms\') ' +
      '         WHEN 4 THEN COALESCE(o.rank4, \'Tactical Officer\') ' +
      '         WHEN 5 THEN COALESCE(o.rank5, \'Strategic Officer\') ' +
      '         WHEN 6 THEN COALESCE(o.rank6, \'Chief Officer\') ' +
      '         WHEN 7 THEN COALESCE(o.rank7, \'Outfit Leader\') ' +
      '       END AS rank_title,' +
      '       COALESCE((op.points / 100.0)::int, 0) AS points,' +
      '       om.created AS joined' +
      '  FROM outfitmember om ' +
      '  JOIN avatar av ON av.id = om.avatar_id ' +
      '  JOIN outfit o ON o.id = om.outfit_id ' +
      '  LEFT JOIN outfitpoint op ON op.avatar_id = om.avatar_id ' +
      ' WHERE om.outfit_id = $1 ' +
      ' ORDER BY points DESC, avatar_name ASC',
      [id])
    return members.rows;
    } catch (e) {
        if (e.code)
            e.code = pg_error_inv[e.code];
        throw e;
    }
}

export async function get_characters_by_account(account_id) {
	try {
		const characters = await pool.query('SELECT a.*, b.* FROM avatar a LEFT JOIN avatarmodepermission b ON a.id = b.avatar_id WHERE a.account_id = $1 AND a.deleted = false', [account_id])
		return characters.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

/**
 * Which account owns a character. Returned even for a deleted character, because the caller needs the
 * ownership answer to decide between "not yours" (403) and "gone" (404) -- resolving a deleted row to
 * "no owner" would tell a stranger that an id they cannot see does not exist.
 */
export async function get_avatar_owner(avatar_id) {
	try {
		const owner = await pool.query('SELECT id, account_id, name, deleted FROM avatar WHERE id=$1', [avatar_id]);
		return owner.rows[0];
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

/** The character's locker blob, or undefined when the character has never had a locker row written. */
export async function get_locker_items(avatar_id) {
	try {
		const locker = await pool.query('SELECT items FROM locker WHERE avatar_id=$1', [avatar_id]);
		return locker.rows[0]?.items;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

/** Infantry loadouts (the character's favourites), lowest loadout slot first. */
export async function get_loadouts(avatar_id) {
	try {
		const loadouts = await pool.query(
			'SELECT loadout_number, exosuit_id, name, items FROM loadout WHERE avatar_id=$1 ORDER BY loadout_number',
			[avatar_id]);
		return loadouts.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

/** Vehicle loadouts, lowest loadout slot first. */
export async function get_vehicle_loadouts(avatar_id) {
	try {
		const loadouts = await pool.query(
			'SELECT loadout_number, name, vehicle, items FROM vehicleloadout WHERE avatar_id=$1 ORDER BY loadout_number',
			[avatar_id]);
		return loadouts.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_account_by_name(name) {
	try {
		const account = await pool.query('SELECT * FROM account WHERE username=$1', [name]);
		return account.rows[0];
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_character_by_name(name) {
	try {
		const account = await pool.query('SELECT id, account_id, name, faction_id, created, last_login FROM avatar WHERE name=$1 AND deleted=false', [name]);
		return account.rows[0];
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function create_account(username, password) {
	try {
		const passhash = await bcrypt.hash(password, BCRYPT_ROUNDS);
		const account_id = await pool.query('INSERT INTO account(username, passhash) VALUES($1, $2) RETURNING id', [username, passhash]);
		return account_id.rows[0].id;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

// NOTE: account and avatar permission WRITES deliberately do not live here any more.
//
// `update_account` (gm/inactive) and `update_roles` (avatarmodepermission) used to write those rows
// straight from the portal. They were removed when the world server became the authority: it owns the
// row AND the live session, so writing from here persisted the change but left the logged-in player
// untouched -- a GM promotion did nothing until relog, and a revocation left the powers active for the
// rest of the session. Go through api/psadmin.ts (`set_account_gm`, `set_account_ban`,
// `set_avatar_permissions`) instead; re-adding a direct write here reintroduces that bug silently.

export async function get_empire_stats() {
	try {
		const query = await pool.query('SELECT faction_id, COUNT(*) FROM avatar GROUP BY faction_id');
		const empires: any = {};

		query.rows.forEach((r) => {
			empires[FACTION_MAP[r.faction_id][1]] = parseInt(r.count);
		});

		return empires;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_stats() {
	try {
		const account_count = await get_row_count(ACCOUNT.THIS);
		const character_count = await get_row_count(CHARACTER.THIS);
		const last_character = await pool.query('SELECT id, account_id, name, faction_id, created FROM avatar ORDER BY id DESC LIMIT 1');

		const stats: any = {}

		stats.accounts = account_count;
		stats.characters = character_count;
		stats.last = {};
		stats.last.character = last_character.rows[0];

		return stats;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_account_logins(account_id, pagination) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;
	const values = [account_id, start_id, pagination.items_per_page];

	try {
		const login_count = await get_row_count(LOGIN.THIS, {
			fields: {
				[LOGIN.ACCOUNT_ID]: account_id,
			}
		});
		const logins = await pool.query('SELECT * FROM login WHERE account_id=$1 ORDER by login_time DESC ' + ` OFFSET $2 LIMIT $3`, values);

		pagination.item_count = login_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

        logins.rows.forEach((r) => {

			if (r.ip_address !== null) {
			    const splitOctet = r.ip_address.split('.'); // Split IP address by '.'
                const lastOctets = splitOctet.slice(-2).join('.');
				r.ipAddress = {
					ip: lastOctets,
				}
			} else {
				r.last_login = {}
			}

			delete r.canonical_hostname;
			delete r.hostname;
			delete r.ip_address;
		});

		return logins.rows;

	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function search(term, pagination) {
	const start_id = (pagination.page - 1) * pagination.items_per_page;

	term = term.replace(/%/g, "");

	if (term.length < 3) {
		return [];
	}

	const values = ['%' + term.toUpperCase() + '%', start_id, pagination.items_per_page];

	try {
		const accounts = await pool.query('SELECT id, username, gm, inactive FROM account ' +
			'WHERE upper(username) LIKE $1 ' +
			` ORDER BY username OFFSET $2 LIMIT $3`, values);
		const characters = await pool.query('SELECT a.id, a.name, a.account_id, a.faction_id, b.avatar_id, b.can_spectate, b.can_gm FROM avatar a' +
			' LEFT JOIN avatarmodepermission b ON a.id = b.avatar_id WHERE upper(a.name) LIKE $1 ' +
			` ORDER BY name OFFSET $2 LIMIT $3`, values);

		pagination.item_count = 100;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		const results = []

		accounts.rows.forEach((r) => {
			r.type = "account";
			r.name = r.username;
			r.admin = r.gm;
			delete r.username;
			delete r.gm;

			results.push(r)
		});

		characters.rows.forEach((r) => {
			r.type = "character";
			results.push(r)
		});

		// sort by name
		results.sort(function (a, b) {
			var nameA = a.name.toUpperCase(); // ignore upper and lowercase
			var nameB = b.name.toUpperCase(); // ignore upper and lowercase
			if (nameA < nameB) {
				return -1;
			}
			if (nameA > nameB) {
				return 1;
			}

			// names must be equal
			return 0;
		});

		return results;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

/**
 * A bcrypt hash of a random value nobody can supply, used to spend the same work on an unknown
 * username as on a real one. Without this, "no such account" returns without hashing and answers far
 * faster than a wrong password, which leaks whether an account exists.
 *
 * Generated at startup at the same cost factor real passwords use, so the two paths take the same
 * time. It must be a genuine hash -- a hand-written constant of the wrong length is rejected by
 * bcrypt in microseconds and would silently restore the timing difference it exists to hide.
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

export async function validate_account(username, password) {
	try {
		const data = await pool.query('SELECT id, passhash FROM account WHERE username=$1', [username]);

		if (data.rows.length === 0) {
			// Compare against a throwaway hash so the response time matches a failed real login.
			await bcrypt.compare(String(password ?? ''), DUMMY_HASH).catch(() => false);
			return undefined;
		} else {
			const creds = data.rows[0];

			if (await bcrypt.compare(password, creds.passhash) === true) {
				return creds.id;
			} else {
				return undefined;
			}
		}
	} catch (e) {
		throw e;
	}
}
