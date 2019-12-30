import { writable } from 'svelte/store';
import page from 'page';
import axios from 'axios'

export const loggedIn = writable(false);
export const username = writable("");
export const isAdmin = writable(false);
export const userId = writable(0);

function clear_user_state() {
	loggedIn.set(false)
	username.set("")
	isAdmin.set(false)
	userId.set(0)
}

export async function logout() {
	try {
		await axios.post("/api/logout")
	} catch (e) {
	}

	clear_user_state();
	page("/")
}

if (process.env.NODE_ENV !== "production") {
	loggedIn.subscribe((v) => {
		console.log("Login state: ", v)
	})
}

export async function get_initial_state() {
	try {
		const resp = await axios.get("/api/user")

		loggedIn.set(true);
		username.set(resp.data.name);
		isAdmin.set(resp.data.admin);
		userId.set(resp.data.id);

		return true;
	} catch (e) {
		if (e.response.status === 403) {
			console.log("User not logged in / not admin!")
			clear_user_state();
		} else {
			console.log("Unknown login error", e)
		}

		return false
	}
}
