import * as db from './db.js'
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

export function get_sort_param(param) {
	const tokens = param.split("_");
	let order = db.SQL_ORDER.ASCENDING;

	// default to ascending if malformed
	if (tokens[tokens.length-1] == "desc")
		order = db.SQL_ORDER.DESCENDING;
	else if (tokens[tokens.length-1] == "asc")
		order = db.SQL_ORDER.ASCENDING;

	return [tokens.slice(0, tokens.length-1).join("_"), order]
}

export function get_sort(req, sort_spec) {
	assert(sort_spec && sort_spec.param && sort_spec.default && sort_spec.types,
		"Invalid filter specification");
	assert(sort_spec.default, "Default sort specification required");

	Object.keys(sort_spec.types).forEach((k) => {
		assert(typeof k == 'string', "Sort key spec must be a string")
		assert(typeof sort_spec.types[k] == 'symbol', "Sort value MUST be a symbolic table column")
	});

	const default_sort_parsed = get_sort_param(sort_spec.default);
	assert(default_sort_parsed[0] in sort_spec.types, "Default sort type MUST be in spec")

	const default_sort = { [sort_spec.types[default_sort_parsed[0]]] : default_sort_parsed[1] };

	const sort_query = req.query[sort_spec.param];

	// return default
	if (!sort_query) {
		return default_sort;
	}

	const sort = {}
	const types = sort_query.split(",");

	for (let i = 0; i < types.length; i++) {
		const t = types[i];
		const sparsed = get_sort_param(t);

		if (!(sparsed[0] in sort_spec.types)) {
			console.log("WARNING: unknown sort type " + t);
			return default_sort;
		}

		const column_name = sort_spec.types[sparsed[0]];
		sort[column_name] = sparsed[1];
	}

	return sort;
}

export function get_filter(req, filter_spec) {
	assert(filter_spec && filter_spec.param && filter_spec.default && filter_spec.types,
		"Invalid filter specification");

	const filter_query = req.query[filter_spec.param];

	if (!filter_query) {
		return {};
	}

	const types = filter_query.split(",");
	
	// No filtering needed, everything displayed
    if (filter_spec.default in types) {
		return {}
	}

	const filter = {
		binop : "OR", // TODO: support more complex queries
		fields : {},
	}

	for (let i = 0; i < types.length; i++) {
		const t = types[i];

		if (!(t in filter_spec.types)) {
			console.log("WARNING: unknown filter type " + t);
			return {}
		}

		const constraint = filter_spec.types[t];


		Object.getOwnPropertySymbols(constraint).forEach(key => {
			assert(Object.keys(constraint) == 0 && typeof key == 'symbol',
				"filter constraint keys MUST be symbolic table columns")
			filter.fields[key] = constraint[key];
		});
	}

	return filter;
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

async function sessionRequired(req, res, next) {
	if (!req.session || !req.session.account_id) {
		res.status(403).json({message: 'session required'})
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
		res.status(403).json({message: 'session required'})
	} else {
		if (req.session_account.gm === true && req.session_account.inactive === false) {
			next();
		} else {
			res.status(403).json({message : 'admin required'})
		}
	}
}

export const NEED_SESSION = sessionRequired;
export const NEED_ADMIN = [sessionRequired, adminRequired];
