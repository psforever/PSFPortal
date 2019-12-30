import express from 'express'
import * as db from './db.js'

const api = express.Router();

api.post('/register', async (req, res, next) => {
	const rUsername = req.body.username;
	const rPassword = req.body.password;
	const rEmail = req.body.email; // TODO: validate email regex

	// TODO: recaptcha, csrf protection
	res.status(403).json({message: "Registration is disabled"});
	return;

	if (!rUsername || !rPassword || !rEmail) {
		res.status(400).json({message: "missing fields"});
		return;
	}

	// TODO: username regex
	if (rUsername.length < 3) {
		res.status(400).json({message: "Username must be at least 3 characters"});
		return;
	}

	try {
		const account_id = await db.create_account(rUsername, rPassword);
		req.session.account_id = account_id;
		res.status(200).json({account_id: account_id});
	} catch (e) {
		if (e.code === 'UNIQUE_VIOLATION') {
			res.status(400).json({message: 'Username already taken'});
		} else {
			console.log(e)
			res.status(500).json({message: 'error'});
		}
	}
});

api.post('/login', async (req, res, next) => {
	const rUsername = req.body.username;
	const rPassword = req.body.password;

	if (!rUsername || !rPassword) {
		res.status(400).json({message: 'missing fields'});
		return;
	}

	try {
		const account_id = await db.validate_account(rUsername, rPassword);

		if (account_id === undefined) {
			res.status(403).json({message: 'invalid username/password'});
		} else {
			req.session.account_id = account_id;
			res.status(200).json({account_id: account_id});
		}
	} catch (e) {
		console.log(e);
		res.status(500).json({message: 'error'});
	}
});

api.post('/logout', async (req, res, next) => {
	if (req.session) {
		req.session.destroy()
	}

	res.status(200).json({});
});

export default api;
