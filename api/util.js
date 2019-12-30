import * as db from './db.js'

export function get_pagination(req) {
	let page = parseInt(req.query.page);
	let order = req.query.order; // TODO

	if (!page || page < 1) {
		page = 1;
	}

	return {
		page: page,
		items_per_page: 40,
		//order: order, // TODO
	};
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
