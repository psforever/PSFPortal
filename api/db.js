import pg from 'pg'
import pg_error from 'pg-error-constants'
import bcrypt from 'bcrypt'
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
	0 : ["Terran Republic", "TR"],
	1 : ["New Conglomerate", "NC"],
	2 : ["Vanu Sovereignty", "VS"],
	3 : ["Neutral", "NL"],
}

export const FACTION_MAP_INV = objectFlip(FACTION_MAP)
const BCRYPT_ROUNDS = 4;

export const SQL_ORDER = Object.freeze({
    ASCENDING:  Symbol("ASC"),
    DESCENDING: Symbol("DESC"),
});

export const ACCOUNT = Object.freeze({
    THIS:  Symbol("accounts"),
    ID:  Symbol("id"),
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
    THIS:  Symbol("characters"),
    ID:  Symbol("id"),
    NAME: Symbol("name"),
    ACCOUNT_ID:  Symbol("account_id"),
    FACTION: Symbol("faction_id"),
    GENDER: Symbol("gender_id"),
    HEAD: Symbol("head_id"),
    VOICE: Symbol("void_id"),
    CREATED: Symbol("created"),
    LAST_LOGIN: Symbol("last_login"),
    LAST_MODIFIED: Symbol("last_modified"),
    DELETED: Symbol("deleted"),
});

export const LOGIN = Object.freeze({
    THIS:  Symbol("logins"),
    ID:  Symbol("id"),
    ACCOUNT_ID:  Symbol("account_id"),
});

function to_sql(symbol) {
	assert(typeof symbol == 'symbol',
		`symbol expected got ${typeof symbol}`)
	return String(symbol).slice(7,-1);
}

function to_sql_kv(fields, idx=1) {
	let SQL = [];
	let values = [];

	// This will ONLY get Symbols in the field dict
	if (!fields || Object.getOwnPropertySymbols(fields).length == 0) {
		return { sql : [], next_idx: idx, values: [] }
	}

	Object.getOwnPropertySymbols(fields).forEach(key => {
		assert(typeof key == 'symbol')
		SQL.push(to_sql(key)+"=$"+idx++);
		values.push(fields[key]);
	});

	return {
		sql: SQL,
		next_idx: idx,
		values: values,
	}
}

function build_SET(fields, idx=1) {
	const kv = to_sql_kv(fields, idx);

	assert(kv.sql.length > 0, "SET MUST have at least one kv pair")

	kv.sql = Symbol(`SET ${kv.sql.join(", ")}`);

	return kv;
}

function build_WHERE(filter, idx=1) {
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

function build_OFFSET(offset, limit, idx=1) {
	assert(typeof offset == 'number', "offset must be a number");
	assert(typeof limit == 'number', "limit must be a number");

	return {
		sql: Symbol(`OFFSET $${idx++} LIMIT $${idx++}`),
		next_idx: idx,
		values: [offset, limit],
	};
}

async function get_row_count(table, filter=undefined) {
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
		const account = await pool.query('SELECT * FROM accounts WHERE id=$1', [id]);

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
	const start_id = (pagination.page-1)*pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const account_count = await get_row_count(ACCOUNT.THIS);
		const accounts = await pool.query(`SELECT id, username, created, last_modified, gm, inactive FROM accounts ORDER BY ${to_sql(sort)} ${to_sql(order)} OFFSET $1 LIMIT $2`, values);

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
	const start_id = (pagination.page-1)*pagination.items_per_page;
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
		'SELECT accounts.*, COALESCE(l.lastLogin, TIMESTAMP \'epoch\') as last_login, l2.ip_address, l2.canonical_hostname FROM accounts' +
		' LEFT OUTER JOIN (' +
		'   SELECT MAX(id) as loginId, account_id, MAX(login_time) as lastLogin' +
		'   FROM logins' +
		'   GROUP BY account_id' +
		' ) l ON l.account_id = accounts.id' +
		' LEFT OUTER JOIN logins l2' +
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
				r.last_login = {
					time : r.last_login,
					hostname : r.canonical_hostname,
					ip : r.ip_address,
				}
			} else {
				r.last_login = {}
			}

			delete r.canonical_hostname;
			delete r.ip_address;
			delete r.passhash;
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

export async function get_characters(pagination, sort, order) {
	const start_id = (pagination.page-1)*pagination.items_per_page;
	const values = [start_id, pagination.items_per_page];

	try {
		const char_count = await get_row_count(CHARACTER.THIS);
		const chars = await pool.query(`SELECT id, account_id, name, faction_id, created, last_login FROM characters ORDER BY ${to_sql(sort)} ${to_sql(order)} OFFSET $1 LIMIT $2`, values);

		pagination.item_count = char_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		return chars.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_characters_by_account(account_id) {
	try {
		const characters = await pool.query('SELECT * FROM characters WHERE account_id=$1 AND deleted=false', [account_id]) 
		return characters.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_account_by_name(name) {
	try {
		const account = await pool.query('SELECT * FROM accounts WHERE username=$1', [name]);
		return account.rows[0];
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_character_by_name(name) {
	try {
		const account = await pool.query('SELECT id, account_id, name, faction_id, created, last_login FROM characters WHERE name=$1 AND deleted=false', [name]);
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
		const account_id = await pool.query('INSERT INTO accounts(username, passhash) VALUES($1, $2) RETURNING id', [username, passhash]);
		return account_id.rows[0].id;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function update_account(account_id, fields) {
	if (fields === {}) {
		return
	}

	const set = build_SET(fields);
	set.values.push(account_id)

	try {
		const update_result = await pool.query(`UPDATE accounts ${to_sql(set.sql)} WHERE id=$${set.next_idx}`, set.values);
		return update_result.rowCount;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function get_empire_stats() {
	try {
		const query = await pool.query('SELECT faction_id, COUNT(*) FROM characters GROUP BY faction_id');
		const empires = {};

		query.rows.forEach((r) => {
			empires[FACTION_MAP[r.faction_id][1]] = parseInt(r.count);
		});

		return empires;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
	return stats;
}

export async function get_stats() {
	try {
		const account_count = await get_row_count(ACCOUNT.THIS);
		const character_count = await get_row_count(CHARACTER.THIS);
		const last_character = await pool.query('SELECT id, account_id, name, faction_id, created FROM characters ORDER BY id DESC LIMIT 1');

		const stats = {}

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
	const start_id = (pagination.page-1)*pagination.items_per_page;
	const values = [account_id, start_id, pagination.items_per_page];

	try {
		const login_count = await get_row_count(LOGIN.THIS, {
			fields : {
				[LOGIN.ACCOUNT_ID] : account_id,
			}
		});
		const logins = await pool.query('SELECT * FROM logins WHERE account_id=$1 ORDER by login_time DESC ' + ` OFFSET $2 LIMIT $3`, values);

		pagination.item_count = login_count;
		pagination.page_count = Math.ceil(pagination.item_count / pagination.items_per_page);

		return logins.rows;
	} catch (e) {
		if (e.code)
			e.code = pg_error_inv[e.code]
		throw e;
	}
}

export async function search(term, pagination) {
	const start_id = (pagination.page-1)*pagination.items_per_page;

	term = term.replace(/%/g, "");

	if (term.length < 3) {
		return [];
	}

	const values = ['%'+term.toUpperCase()+'%', start_id, pagination.items_per_page];

	try {
		const accounts = await pool.query('SELECT id, username, gm, inactive FROM accounts ' +
			'WHERE upper(username) LIKE $1 '+
		` ORDER BY username OFFSET $2 LIMIT $3`, values);
		const characters = await pool.query('SELECT id, name, account_id, faction_id FROM characters ' +
			'WHERE upper(name) LIKE $1 '+
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
		results.sort(function(a, b) {
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

export async function validate_account(username, password) {
	try {
		const data = await pool.query('SELECT id, passhash FROM accounts WHERE username=$1 and gm=true', [username]);

		if (data.rows.length === 0) {
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
