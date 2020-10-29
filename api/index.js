import fs from 'fs'
import express from 'express'
import bodyParser from 'body-parser'
import api_auth from './authentication.js'
import api_user from './user.js'
import api_info from './info.js'
import api_admin from './admin.js'
import api_stats from './stats.js'

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

api.use(bodyParser.json());
api.use(bodyParser.urlencoded({ extended: true }));

api.use(api_auth)
api.use(api_info)
api.use(api_stats)

// These calls are gated within their respective routers
api.use(api_user)
api.use(api_admin)

api.get("/", async (req, res, next) => {
	res.status(200).json({message : 'PSFPortal ' + VERSION + ' API base. Created by Chord for the PSForever Project: https://psforever.net'})
});

api.post("/bad_route", async (req, res, next) => {
	console.log("BAD APP ROUTE:", req.body.route)
	res.status(200).json({message : 'received'})
});

api.all('*', function(req, res){
  res.status(404).json({message : 'Unknown API route'});
});

export default api;
