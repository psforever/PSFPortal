import express from 'express'
import {
	get_packet_opcodes,
	get_packets,
	packet_leave,
	packet_stop_all,
	packet_subscribe
} from './psadmin.ts'
import { NEED_ADMIN } from './util.ts'

const api = express.Router()

/**
 * Packet Review.
 *
 * Every route is admin-only: what these return is other players' traffic, and the world server
 * refuses them for anyone whose session does not resolve to a game master regardless of what the
 * portal does. The checks here are the outer of the two, not the only one.
 *
 * The world server captures nothing unless a page is actively watching, so these are mostly a
 * pass-through for a lifecycle that lives in the browser: the page joins, keeps saying so while it
 * collects, and says when it leaves. See `PacketCapture` on the world server for why it works that
 * way -- in short, so a forgotten tab cannot leave a live server accumulating player traffic.
 */

// The opcode tables, both spaces, with what is charted, what is armed and what may never be armed.
api.get('/packets/opcodes', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await get_packet_opcodes())
	} catch (e) {
		res.status(503).json({ message: 'packet capture unavailable', opcodes: [], redacted: {}, state: null })
	}
})

// Join the capture or renew a place in it, carrying this page's selection. Called to start
// collecting and again on every poll while it continues.
api.post('/packets/subscribe', NEED_ADMIN, async (req, res) => {
	const viewer = String(req.body?.viewer || '')
	const game = Array.isArray(req.body?.game) ? req.body.game.map(Number).filter(Number.isInteger) : []
	const control = Array.isArray(req.body?.control) ? req.body.control.map(Number).filter(Number.isInteger) : []
	if (!viewer) {
		res.status(400).json({ message: 'viewer required', error: true })
		return
	}
	try {
		res.status(200).json(await packet_subscribe(viewer, game, control))
	} catch (e) {
		res.status(503).json({ message: 'packet capture unavailable', error: true })
	}
})

// Leave promptly, rather than waiting for the lease to lapse. Sent when collection is stopped, when
// the page is navigated away from, and when the tab is closed.
api.post('/packets/leave', NEED_ADMIN, async (req, res) => {
	const viewer = String(req.body?.viewer || '')
	try {
		if (viewer) await packet_leave(viewer)
		res.status(200).json({ ok: true })
	} catch (e) {
		// Nothing useful for the caller to do about this, and the lease expires by itself shortly.
		res.status(200).json({ ok: false })
	}
})

// Stop capture for every watcher at once, whoever started it.
api.post('/packets/stop', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json(await packet_stop_all())
	} catch (e) {
		res.status(503).json({ message: 'packet capture unavailable', error: true })
	}
})

// Read forward from a cursor. Several admins share one capture, each with its own cursor.
api.get('/packets', NEED_ADMIN, async (req, res) => {
	const viewer = String(req.query.viewer || '')
	const since = Number(req.query.since || 0)
	const limit = Number(req.query.limit || 200)
	if (!viewer) {
		res.status(400).json({ message: 'viewer required', error: true })
		return
	}
	try {
		res.status(200).json(await get_packets(viewer, Number.isFinite(since) ? since : 0, limit))
	} catch (e) {
		res.status(503).json({ message: 'packet capture unavailable', packets: [], cursor: since, oldest: 0, state: null })
	}
})

export default api
