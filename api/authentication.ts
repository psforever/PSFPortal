import express from 'express'
import * as db from './db.ts'
import { withCaller } from './caller-context.ts'
import { blocked, recordFailure, recordSuccess } from './ratelimit.ts'

const api = express.Router();

api.post('/register', async (req, res, next) => {
	const rUsername = req.body.username;
	const rPassword = req.body.password;
	const rEmail = req.body.email; // TODO: validate email regex

	// TODO: recaptcha, csrf protection
	res.status(403).json({message: "Registration is disabled"});
	return;

	// Account creation is rate limited by source, so the endpoint can't be used to mass-create
	// accounts (or to probe which usernames are taken) if it is ever switched back on.
	if (blocked(req, res)) return;

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
			recordFailure(req);
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

	// Refuse before touching the database when this source, or this account, is locked out.
	if (blocked(req, res, rUsername)) return;

	// Regenerate the session BEFORE checking the password, not after.
	//
	// The order matters more than it looks. The login server binds the session to the account inside
	// the same call that verifies the password, and the id it binds is the one in the caller context --
	// fixed when the request arrived. Regenerating afterwards destroys the session that was just bound
	// and hands the browser a fresh, unbound one, so the response says the login succeeded while the
	// cookie stays anonymous. Regenerating first means the id that gets bound is the id the browser
	// keeps, and it is still an id the server minted for this login rather than one the caller
	// arrived holding -- which is the whole point of regenerating at all.
	req.session.regenerate((regenerateError) => {
		if (regenerateError) {
			console.log(regenerateError);
			res.status(500).json({message: 'error'});
			return;
		}

		// Re-enter the caller context with the NEW id. The context was captured from the old id by the
		// middleware, and `validate_account` reads it to tell the login server which session to bind.
		void withCaller({ sessionId: req.sessionID }, async () => {
			try {
				const account_id = await db.validate_account(rUsername, rPassword);

				if (account_id === undefined) {
					recordFailure(req, rUsername);
					// Deliberately identical to the response for a wrong password, so a caller cannot tell a
					// non-existent account from a real one.
					res.status(403).json({message: 'invalid username/password'});
				} else {
					// A correct password clears the counters, so a legitimate user who fumbled a few times is
					// not left locked out.
					recordSuccess(req, rUsername);
					req.session.account_id = account_id;
					res.status(200).json({account_id: account_id});
				}
			} catch (e) {
				console.log(e);
				res.status(500).json({message: 'error'});
			}
		});
	});
});

api.post('/logout', async (req, res, next) => {
	if (req.session) {
		req.session.destroy(() => {})
	}

	res.status(200).json({});
});

export default api;
