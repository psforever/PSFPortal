import express from 'express'
import * as db from './db.ts'
import { NEED_ADMIN } from './util.ts'

const api = express.Router()

/**
 * Service -> scheduled actions.
 *
 * The rows live in the login server's database, AND so does the evaluator that acts on them -- a
 * schedule firing at four in the morning has to be evaluated by a process that is running at four in
 * the morning, and that is the world server rather than this one. These routes are a pass-through:
 * the portal creates, lists, pauses and deletes schedules; it does not run them.
 *
 * The action catalogue is served from there too, because that is where the actions are implemented.
 * Every route is admin-only: a schedule can hand every base on a continent to one empire.
 */

// The registry, so the Scheduling page can build a form for any action without knowing about it.
api.get('/schedules/actions', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json({ actions: await db.get_schedule_actions() })
	} catch (e) {
		res.status(503).json({ message: 'actions unavailable', actions: [] })
	}
})

api.get('/schedules', NEED_ADMIN, async (req, res) => {
	try {
		res.status(200).json({ schedules: await db.get_schedules() })
	} catch (e) {
		res.status(503).json({ message: 'schedules unavailable', schedules: [] })
	}
})

api.post('/schedules', NEED_ADMIN, async (req, res) => {
	const name = String(req.body?.name ?? '').trim()
	const actionKey = String(req.body?.action ?? '').trim()

	if (!name || !actionKey) {
		res.status(400).json({ message: 'A name and an action are required.' })
		return
	}

	// The parameters are checked by the world server, where the action is implemented -- validating
	// them here as well would be a second copy to keep in step with the first.
	const payloadText = JSON.stringify(req.body?.params ?? {})

	const atTime = req.body?.at_time ? String(req.body.at_time).trim() : undefined
	const everyDays = req.body?.every_days !== undefined ? Number(req.body.every_days) : undefined
	const condition = req.body?.condition ? String(req.body.condition).trim() : undefined
	const threshold = req.body?.threshold !== undefined ? Number(req.body.threshold) : undefined

	// The same shape the table's CHECK constraints enforce, refused here with a sentence rather than
	// a constraint violation.
	if (!atTime && !condition) {
		res.status(400).json({ message: 'a time trigger, a condition trigger, or both are required' })
		return
	}
	if (atTime && !/^\d{1,2}:\d{2}$/.test(atTime)) {
		res.status(400).json({ message: 'at_time must be HH:MM' })
		return
	}
	if (atTime && (!Number.isInteger(everyDays) || (everyDays as number) < 1)) {
		res.status(400).json({ message: 'every_days must be a whole number of days, at least 1' })
		return
	}
	if (condition && !['players_below', 'players_above'].includes(condition)) {
		res.status(400).json({ message: 'condition must be players_below or players_above' })
		return
	}
	if (condition && !Number.isInteger(threshold)) {
		res.status(400).json({ message: 'threshold must be a whole number' })
		return
	}

	try {
		const created = await db.create_schedule({
			name,
			action: actionKey,
			payload: payloadText,
			at_time: atTime,
			every_days: atTime ? everyDays : undefined,
			condition,
			threshold: condition ? threshold : undefined
		})
		res.status(200).json(created)
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' })
	}
})

api.patch('/schedules/:id', NEED_ADMIN, async (req, res) => {
	const id = Number(req.params.id)
	if (!Number.isInteger(id)) {
		res.status(400).json({ message: 'invalid id' })
		return
	}
	try {
		res.status(200).json(await db.set_schedule_enabled(id, req.body?.enabled !== false))
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' })
	}
})

api.delete('/schedules/:id', NEED_ADMIN, async (req, res) => {
	const id = Number(req.params.id)
	if (!Number.isInteger(id)) {
		res.status(400).json({ message: 'invalid id' })
		return
	}
	try {
		res.status(200).json(await db.delete_schedule(id))
	} catch (e) {
		res.status(503).json({ message: e instanceof Error ? e.message : 'error' })
	}
})

export default api
