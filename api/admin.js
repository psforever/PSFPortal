import express from 'express'
import * as db from './db.js'
import { get_pagination, fetch_user_middleware } from './util.js'

const api = express.Router();

api.param("user", fetch_user_middleware);

api.get('/users', async (req, res, next) => {
	const pagination = get_pagination(req);

	try {
		const accounts = await db.get_accounts_login_info(pagination, db.ACCOUNT.CREATED, db.SQL_ORDER.DESCENDING);
		res.status(200).json({ users: accounts, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

api.post('/search', async (req, res, next) => {
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

api.get('/user/:user', async (req, res, next) => {
	const account = req.user;

	res.status(200).json({ id : account.id, name: account.username });
});

api.post('/user/:user/add_gm', async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.ADMIN] : true})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/user/:user/remove_gm', async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.ADMIN] : false})
		res.status(200).json({});
	} catch(e) {
		console.log(e);
		res.status(500).json({ message: 'error' });
	}
});

api.post('/user/:user/ban', async (req, res, next) => {
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

api.post('/user/:user/unban', async (req, res, next) => {
	const account = req.user;

	try {
		await db.update_account(account.id, {[db.ACCOUNT.BANNED] : false})
		res.status(200).json({});
	} catch(e) {
		res.status(500).json({ message: 'error' });
	}

});

api.get('/characters', async (req, res, next) => {
	const pagination = get_pagination(req);

	try {
		const characters = await db.get_characters(pagination, db.CHARACTER.LAST_LOGIN, db.SQL_ORDER.DESCENDING);
		res.status(200).json({ characters: characters, page: pagination})
	} catch (e) {
		console.log(e)
		res.status(500).json({ message: 'error' });
	}
});

export default api;
