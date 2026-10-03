import fs from 'fs'
import express from 'express'
import bodyParser from 'body-parser'
import api_auth from './authentication.ts'
import api_user from './user.ts'
import api_info from './info.ts'
import api_admin from './admin.ts'
import api_me from './me.ts'
import api_stats from './stats.ts'
import api_continents from './continents.ts'

const VERSION = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const api = express.Router();

if (process.env.NODE_ENV !== "production") {
	const LAG = 200;
	const LAG_JITTER = 100;
	console.log("WARNING: development server simulated delay active")
	api.use((req, res, next) => {
		setTimeout(() => next(), LAG + (Math.random()-0.5)*LAG_JITTER)
	});
}

// An explicit, small body limit. The default is already 100kb, but stating it means a future change
// to a route that accepts a large payload has to be a deliberate decision rather than an inherited
// default nobody looked at.
api.use(bodyParser.json({ limit: '64kb' }));
api.use(bodyParser.urlencoded({ extended: true, limit: '64kb' }));

api.use(api_auth)
api.use(api_info)
api.use(api_stats)
api.use(api_continents)

// These calls are gated within their respective routers
api.use(api_user)
api.use(api_me)
api.use(api_admin)

api.get("/", async (req, res, next) => {
	res.status(200).json({message : 'PSFPortal ' + VERSION + ' API base. Created by Chord for the PSForever Project: https://psforever.net'})
});

// Client-side telemetry for a route the SPA could not resolve. The value is caller-controlled and
// unauthenticated, so it is truncated and stripped of anything that would let it forge log lines --
// an endpoint whose whole purpose is to write attacker text into a log needs to be dull about it.
api.post("/bad_route", async (req, res, next) => {
	const route = String(req.body?.route ?? '').replace(/[\r\n]/g, ' ').slice(0, 200);
	console.log("BAD APP ROUTE:", route)
	res.status(200).json({message : 'received'})
});

// Express 5 (path-to-regexp v8) requires wildcards to be named; a bare '*' throws.
api.all('/*splat', function(req, res){
  res.status(404).json({message : 'Unknown API route'});
});

export default api;
