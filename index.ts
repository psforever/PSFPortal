import express from 'express'
import helmet from 'helmet'
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

/**
 * Whether this deployment is served over HTTPS.
 *
 * Drives the secure-cookie flag and HSTS together, because getting those two out of step is how a
 * deployment ends up either leaking session cookies over plaintext or unreachable. Left off by
 * default: a portal that works over HTTP is a nuisance to fix, one that has locked every browser
 * into HTTPS-only for six months is not.
 */
const HTTPS = process.env.HTTPS === 'true' || process.env.COOKIE_SECURE === 'true';
const MODE = process.env.NODE_ENV || 'development';
const BASE_URL = 'https://play.psforever.net';

const app = express();

// 'dev' is a development format and colourises for a TTY; 'combined' is the one meant for a log
// file, and it is what an operator can actually correlate against a reverse proxy's own log.
app.use(morgan(MODE === 'production' ? 'combined' : 'dev'));

/**
 * Security headers.
 *
 * The portal shipped with none of these: no framing policy, no MIME-sniffing policy, no referrer
 * policy, no transport policy, and an `X-Powered-By` banner naming the stack. Helmet's defaults
 * cover all of that; the two blocks below are the parts that need saying explicitly.
 */
app.use(
	helmet({
		// A content policy tight enough to be worth having. The portal serves its own bundle and talks
		// only to its own origin, so everything is 'self' -- with three deliberate exceptions:
		//   - inline styles, which Tailwind and the components set;
		//   - data: and blob: images, for the item artwork and the SVG chart downloads;
		//   - Google Fonts, which index.html links for IBM Plex Mono and Space Mono. The stylesheet
		//     comes from fonts.googleapis.com and the font files it references from fonts.gstatic.com,
		//     so BOTH origins are needed -- allowing only the first blocks the fonts themselves.
		// These are the only external origins the built page references, checked against the bundle
		// rather than assumed.
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
				imgSrc: ["'self'", 'data:', 'blob:'],
				fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
				connectSrc: ["'self'"],
				objectSrc: ["'none'"],
				frameAncestors: ["'none'"],
				baseUri: ["'self'"],
				formAction: ["'self'"],
				/*
				 * Only ask browsers to upgrade requests where there is something to upgrade TO.
				 *
				 * Helmet turns `upgrade-insecure-requests` on by default, and on a deployment served
				 * over plain HTTP that is not a hardening measure but an outage: the browser rewrites
				 * every asset request to https on the same host and port, nothing is listening for
				 * TLS there, and the page renders white because its bundle never arrives. It hid
				 * during local testing because browsers exempt localhost as a trustworthy origin --
				 * so it only appears once somebody opens the portal by hostname or LAN address.
				 *
				 * `null` removes the directive. Gated on the same flag as HSTS and the secure cookie,
				 * because all three are answers to the same question: is this deployment HTTPS?
				 */
				upgradeInsecureRequests: HTTPS ? [] : null
			}
		},
		// HSTS only once TLS is actually terminated in front of this. Sending it over plain HTTP is
		// ignored by browsers, but sending it from a deployment that is NOT fully HTTPS locks users
		// out of it for the max-age. Gated on the same flag as the secure cookie, so the two cannot
		// disagree about whether this deployment is HTTPS.
		hsts: HTTPS ? { maxAge: 15552000, includeSubDomains: true } : false,
		// The portal is not a cross-origin resource server; leaving this on breaks nothing it serves.
		crossOriginEmbedderPolicy: false
	})
);

if (process.env.TRUST_PROXY) {
	console.log("Trusting proxy")
	app.set('trust proxy', 'loopback')
}

// TODO: recaptcha, should registration ever be re-enabled
//
// Done since these were written: login rate limiting (api/ratelimit.ts, per-IP and per-username),
// X-Frame-Options and the rest of the security headers (helmet, above), and CSRF -- addressed by
// SameSite=Lax on the session cookie rather than by tokens, since every state-changing route is a
// POST and none of them are reachable by a cross-site form.

// Kick off the DB connection and any dependencies
// Needs to be in a function to await the DB connection state
/**
 * A session secret is not optional.
 *
 * `express-session` refuses to start without one, so the presence check only makes the failure
 * legible. The value check is the one that matters: the development compose file ships a known
 * literal, and nothing else stops it reaching production.
 */
const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET) {
	console.error('FATAL: COOKIE_SECRET is not set. Sessions cannot be signed.');
	process.exit(1);
}
if (MODE === 'production' && (COOKIE_SECRET.length < 32 || COOKIE_SECRET.includes('dev-only'))) {
	console.error('FATAL: COOKIE_SECRET is a development placeholder or too short for production.');
	process.exit(1);
}

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
		secret: COOKIE_SECRET, // changing this will invalidate all sessions
		resave: false, // dont bother saving unchanged sessions
		saveUninitialized: false, // dont bother saving sessions that have no data
		cookie: {
			httpOnly: true,
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
			// Only ever sent over HTTPS where the deployment is HTTPS. See HTTPS above for why this is
			// a flag rather than simply true.
			secure: HTTPS,
			// Blocks the cookie from riding along on cross-site requests, which is what makes a CSRF
			// token unnecessary for the state-changing endpoints here: they are all POSTs, and Lax
			// withholds the cookie from a cross-site POST. Set explicitly rather than relying on the
			// browser default, so the protection is a property of the server rather than of whichever
			// browser happens to be asking.
			sameSite: 'lax'
		}
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

