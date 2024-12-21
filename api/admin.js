import express from 'express'
import * as db from './db.js'
import { NEED_ADMIN, get_pagination, get_filter, get_sort, fetch_user_middleware } from './util.js'

const api = express.Router();

api.param("user", fetch_user_middleware);

api.get('/users', NEED_ADMIN, async (req, res, next) => {
	const pagination = get_pagination(req);
	const filter = get_filter(req,
		{
			param : 'filter',
			default : 'all',
			types : {
				'gm' : { [db.ACCOUNT.ADMIN] : true },
				'banned' : { [db.ACCOUNT.BANNED] : true },
			}
		}
	);

	const sort = get_sort(req,
		{
			param : 'sort',
			default : 'created_desc',
			types : {
				'id' : db.ACCOUNT.ID,
				'created' : db.ACCOUNT.CREATED,
				'username' : db.ACCOUNT.USER,
				'last_login' : db.ACCOUNT.LAST_LOGIN,
			}
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

api.post('/user/:user/add_gm', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.ADMIN] : true})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/user/:user/remove_gm', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.ADMIN] : false})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/user/:user/ban', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		// also drop GM if they had it...
		await db.update_account(account.id, {[db.ACCOUNT.BANNED] : true, [db.ACCOUNT.ADMIN] : false})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/user/:user/unban', NEED_ADMIN, async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.BANNED] : false})
		res.status(200).json({});
	} catch(e) {
		res.status(500).json({ message: 'error' });
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

api.post('/roles/:avatar/add_gm', NEED_ADMIN, async (req, res, next) => {
    const avatar = parseInt(req.params.avatar);

	try {
		await db.update_roles(avatar, {[db.AVATARMODEPERMISSION.GM] : true})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/roles/:avatar/remove_gm', NEED_ADMIN, async (req, res, next) => {
	const avatar = parseInt(req.params.avatar);

	try {
		await db.update_roles(avatar, {[db.AVATARMODEPERMISSION.GM] : false})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/roles/:avatar/add_spectate', NEED_ADMIN, async (req, res, next) => {
    const avatar = parseInt(req.params.avatar);

	try {
		await db.update_roles(avatar, {[db.AVATARMODEPERMISSION.SPECTATE] : true})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/roles/:avatar/remove_spectate', NEED_ADMIN, async (req, res, next) => {
    const avatar = parseInt(req.params.avatar);

	try {
		await db.update_roles(avatar, {[db.AVATARMODEPERMISSION.SPECTATE] : false})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

export default api;
