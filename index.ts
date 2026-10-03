import express from 'express'
import session from 'express-session'
import morgan from 'morgan'
import history from 'connect-history-api-fallback'
import dotenv from 'dotenv'
import api from './api/index.ts'
import { start_server_polling } from './api/psadmin.ts'
import { AdminApiSessionStore } from './api/session-store.ts'
import * as db from './api/db.ts'

dotenv.config();

const PORT = process.env.PORT || 8080;
const MODE = process.env.NODE_ENV || 'development';
const BASE_URL = 'https://play.psforever.net';

const app = express();

app.use(morgan('dev'));

if (process.env.TRUST_PROXY) {
	console.log("Trusting proxy")
	app.set('trust proxy', 'loopback')
}

// TODO: recaptcha
// TODO: form csrf protection: https://github.com/expressjs/csurf
// TODO: login rate limiting: https://www.npmjs.com/package/rate-limiter-flexible
//   - https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#login-endpoint-protection
// TODO: X-Frame-Options: deny
// TODO: X-Upgrade-Insecure-Requests

// Kick off the DB connection and any dependencies
// Needs to be in a function to await the DB connection state
(async () => {
	// Polling first: it is what configures the PSF-HTTP API base URL, and the data layer now lives
	// behind that same API -- probing it beforehand would only ever report "not configured".
	await start_server_polling()
	await db.connect_to_db();

	const sessionMiddleware = session({
		// Sessions live in the login server's database, reached over the PSF-HTTP API. The portal has no
		// database connection of its own -- see api/session-store.ts for why that mattered enough to
		// replace connect-pg-simple.
		store: new AdminApiSessionStore(),
		secret: process.env.COOKIE_SECRET, // changing this will invalidate all sessions
		resave: false, // dont bother saving unchanged sessions
		saveUninitialized: false, // dont bother saving sessions that have no data
		cookie: {
			httpOnly: true,
			maxAge: 7 * 24 * 60 * 60 * 1000,
			//secure: true, // TODO: only send cookie over https
		} // 7 days
	})

	// All API requests have a session. Other requests are static
	app.use("/api", sessionMiddleware, api);

	// TODO: inject csrf token into meta of index.html
	app.use(express.static('public'));

	// Redirect 404s to /index.html for the single-page app (SPA)
	app.use(history());

	// This last static might seem redundant, but it is necessary to have the history API
	// redirect work properly. If the app makes it this far, it will be an Express 404
	app.use(express.static('public'));

	app.listen(PORT, function () {
		let url = '';

		if (MODE === 'development') {
			url = 'http://localhost:' + PORT + '/';
		} else {
			url = BASE_URL + '/';
		}

		console.log('[MODE ' + MODE + '] PSFWeb now accepting requests at ' + url);
	});
})();

