import express from 'express'
import bodyParser from 'body-parser'
import * as db from './db.js'
import api_auth from './authentication.js'
import api_user from './user.js'
import api_info from './info.js'
import api_admin from './admin.js'

const api = express.Router();

if (process.env.NODE_ENV !== "production") {
	const LAG = 200;
	const LAG_JITTER = 100;
	console.log("WARNING: development server simulated delay active")
	api.use((req, res, next) => {
		setTimeout(() => next(), LAG + (Math.random()-0.5)*LAG_JITTER)
	});
}

async function sessionRequired(req, res, next) {
	if (!req.session || !req.session.account_id) {
		res.status(403).json({message: 'session required'})
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
async function adminRequired(req, res, next) {
	if (!req.session_account) {
		console.log("ERROR: sessionRequired needs to be called before adminRequired")
		res.status(500).json({message: ''})
	} else {
		if (req.session_account.gm === true && req.session_account.inactive === false) {
			next();
		} else {
			res.status(403).json({message : 'admin required'})
		}
	}
}

api.use(bodyParser.json());
api.use(bodyParser.urlencoded({ extended: true }));

api.use(api_auth)
api.use(api_info)
api.use(sessionRequired, api_user)
api.use(sessionRequired, adminRequired, api_admin)

api.post("/bad_route", async (req, res, next) => {
	console.log("BAD APP ROUTE:", req.body.route)
	res.status(200).json({message : 'received'})
});

api.all('*', function(req, res){
  res.status(404).json({message : 'Unknown API route'});
});

export default api;
