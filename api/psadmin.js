import net from 'net'

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

async function get_player_list() {
	return new Promise((resolve, reject) => {
		const client = new net.Socket();

		client.connect(psadmin_port, psadmin_domain, function() {
			client.write('list_players\n');
		});

		client.on('error', function(e) {
			reject(e)
			client.destroy()
		});

		client.on('data', function(data) {
			try {
				const info = JSON.parse(data);
				resolve(info.player_list)
			} catch (e) {
				reject(new Error("Failed to parse PSFCI JSON response"))
			} finally {
				client.destroy(); // kill client after server's response
			}
		});

		client.on('close', function() {
		});
	});
}
