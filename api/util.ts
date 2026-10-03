import * as db from './db.ts'
import assert from 'assert'

export function get_pagination(req) {
	let page = parseInt(req.query.page);

	if (!page || page < 1) {
		page = 1;
	}

	return {
		page: page,
		items_per_page: 40,
	};
}

/**
 * Split a `<column>_<asc|desc>` token into its two halves.
 *
 * A malformed direction sorts ascending rather than being rejected: this is a display preference
 * arriving in a query string, and refusing the whole page over it helps nobody.
 */
export function get_sort_param(param) {
	const tokens = param.split("_");
	const last = tokens[tokens.length - 1];
	const order = last === "desc" ? db.SQL_ORDER.DESCENDING : db.SQL_ORDER.ASCENDING;
	return [tokens.slice(0, tokens.length - 1).join("_"), order];
}

/**
 * The column and direction to sort a listing by, as `{ column, order }`.
 *
 * This used to build a fragment of SQL, which is why it dealt in symbolic column names. Sorting now
 * happens in the login server, so the job here is only to decide WHICH of the permitted columns was
 * asked for and pass the name along. An unknown column falls back to the caller's default -- and the
 * login server whitelists it a second time, since it cannot assume this side did.
 */
export function get_sort(req, sort_spec) {
	assert(sort_spec && sort_spec.param && sort_spec.default && Array.isArray(sort_spec.types),
		"Invalid sort specification");

	const [default_column, default_order] = get_sort_param(sort_spec.default);
	assert(sort_spec.types.includes(default_column), "Default sort column MUST be in spec");
	const fallback = { column: default_column, order: default_order };

	const sort_query = req.query[sort_spec.param];
	if (!sort_query) return fallback;

	// Only the first term is honoured. The old builder accepted a comma-separated list and emitted a
	// multi-column ORDER BY; nothing in the UI has ever asked for one.
	const [column, order] = get_sort_param(String(sort_query).split(",")[0]);
	if (!sort_spec.types.includes(column)) {
		console.log("WARNING: unknown sort column " + column);
		return fallback;
	}
	return { column, order };
}

/**
 * Which subset of a listing to show, as a single token (`'all'`, `'gm'`, `'banned'`).
 *
 * Also formerly a SQL fragment. The login server turns the token into a predicate; an unrecognised
 * one means no filtering, which is the safe direction to fail for a listing.
 */
export function get_filter(req, filter_spec) {
	assert(filter_spec && filter_spec.param && filter_spec.default && Array.isArray(filter_spec.types),
		"Invalid filter specification");

	const filter_query = req.query[filter_spec.param];
	if (!filter_query) return filter_spec.default;

	const token = String(filter_query).split(",")[0];
	if (!filter_spec.types.includes(token)) {
		if (token !== filter_spec.default) console.log("WARNING: unknown filter type " + token);
		return filter_spec.default;
	}
	return token;
}

export async function fetch_user_middleware(req, res, next, id) {
	id = parseInt(id);

	if (id <= 0) {
		res.status(500).json({message: 'error'});
		return;
	}

	try {
		const account = await db.get_account_by_id(id);

		if (!account) {
			res.status(404).json({message: `account ${id} does not exist`});
		} else {
			req.user = account;
			next();
		}
	} catch (e) {
		console.log(e);
		res.status(500).json({message: 'error'});
	}
}

/**
 * Refusals carry a stable code as well as a message.
 *
 * "You are not signed in" and "you are signed in but not allowed this" are different answers and the
 * client has to act differently on them -- the first should sign the session out, the second must
 * not, or a player glancing at an admin URL would be logged out for their trouble. They used to be
 * told apart only by the English in `message`, which is not something a client should be parsing.
 *
 * The status codes now say it too: 401 for unauthenticated, 403 for authenticated-and-forbidden,
 * which is what those codes mean.
 */
export const AUTH_ERRORS = {
	session: 'session_required',
	admin: 'admin_required'
} as const;

async function sessionRequired(req, res, next) {
	if (!req.session || !req.session.account_id) {
		res.status(401).json({message: 'session required', error: AUTH_ERRORS.session})
	} else {
		if (req.session_account) {
			next()
		} else {
			try {
				const account = await db.get_account_by_id(req.session.account_id);

				if (!account) {
					console.log("ERROR: failed to lookup account from session!")
					res.status(500).json({message: 'error'});
				} else {
					req.session_account = account;
					next();
				}
			} catch (e) {
				console.log(e)
				res.status(500).json({message: 'error'});
			}
		}
	}
}

async function adminRequired(req, res, next) {
	if (!req.session_account) {
		console.log("ERROR: sessionRequired needs to be called before adminRequired")
		res.status(401).json({message: 'session required', error: AUTH_ERRORS.session})
	} else {
		if (req.session_account.gm === true && req.session_account.inactive === false) {
			next();
		} else {
			res.status(403).json({message: 'admin required', error: AUTH_ERRORS.admin})
		}
	}
}

export const NEED_SESSION = sessionRequired;
export const NEED_ADMIN = [sessionRequired, adminRequired];
