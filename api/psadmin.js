import http from 'http'

let error_count = 0;
let server_info = {}

let psadmin_port = 0;
let psadmin_domain = "";

export async function start_server_polling() {
	const connect_to = process.env.PSADMIN;

	if (!connect_to) {
		console.log("WARNING: PSADMIN not configured. Not polling server")
		return
	} else {
		const tokens = connect_to.split(":")

		psadmin_domain = tokens[0]
		psadmin_port = tokens[1]
		console.log("Starting PSAdmin polling for " + connect_to)
	}

	if (!(await poll_server())) {
		console.log("WARNING: initial PSAdmin poll FAILED! Are you sure the server is up and the config is right?")
	}

	setInterval(poll_server, 10000)
}

async function poll_server() {
	try {
		const player_list = await get_player_list();
		server_info = {status : "UP",players : player_list}

		if (error_count > 0) {
			console.log("PSAdmin connection has returned after " + error_count + " errors")
		}

		error_count = 0;

		return true;
	} catch (e) {
		if (error_count < 5)
			console.log("WARNING: Failed to get player list: " + e)

		server_info = {status : "DOWN",players : []}
		error_count += 1
		return false;
	}
}

export function get_server_info() {
	return server_info;
}

// The login server's PSF-HTTP API. `/v1/players` answers with the same JSON the raw-TCP PSAdmin
// `list_players` command did, so only the transport changes here.
const REQUEST_TIMEOUT_MS = 5000;

async function get_player_list() {
	return new Promise((resolve, reject) => {
		const req = http.get({
			host: psadmin_domain,
			port: psadmin_port,
			path: '/v1/players',
			headers: { 'Accept': 'application/json' },
		}, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { body += chunk; });
			// A connection dropped mid-response (the login server restarting) is reported here; without
			// this listener it would be an uncaught exception that stops the portal.
			res.on('error', reject);
			res.on('end', () => {
				if (res.statusCode !== 200) {
					reject(new Error("PSF-HTTP API answered " + res.statusCode));
					return;
				}
				let info;
				try {
					info = JSON.parse(body);
				} catch (e) {
					reject(new Error("Failed to parse PSF-HTTP API JSON response"));
					return;
				}
				if (!Array.isArray(info.player_list)) {
					reject(new Error("PSF-HTTP API response has no player_list"));
					return;
				}
				resolve(info.player_list);
			});
		});

		// A deadline for the whole exchange, not just for a quiet socket.
		const timer = setTimeout(() => req.destroy(new Error("PSF-HTTP API request timed out")), REQUEST_TIMEOUT_MS);
		req.on('close', () => clearTimeout(timer));
		req.on('error', reject);
	});
}
