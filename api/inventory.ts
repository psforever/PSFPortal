/**
 * Decoding for the character inventory blobs the world server writes, plus the item-name table that
 * turns their numeric object ids into names a player recognises.
 *
 * The world server stores a locker or a loadout as a single TEXT column -- not as rows -- built by
 * `AvatarActor.encodeLoadoutClobFragment`. One `/`-separated segment per item, four comma-separated
 * fields each:
 *
 *     ClassName,slotIndex,objectId,ammoInfo
 *
 * `ammoInfo` depends on the class and is the only variable part:
 *   - a Tool  -> one `_<ammoSlot>-<ammoTypeIndex>-<ammoTypeId>-<magazine>` group per ammo slot,
 *                concatenated, so a dual-ammo weapon yields two groups in one field;
 *   - an AmmoBox -> the box's capacity, as a bare number;
 *   - anything else -> empty.
 *
 * Names resolve in two layers, best first:
 *
 *   1. `data/items-english.json` -- real player-facing names ("Jackhammer") and the client's own
 *      description prose, generated from a local client install by raxicore-editor's ItemNamesExport.
 *      This is Daybreak-owned material: it is GITIGNORED and never committed (see docs/client-assets.md).
 *   2. `api/objectClasses.json` -- id -> internal name ("r_shotgun"), from PSF-LoginServer's own
 *      open-source ObjectClass table. Committed, always present, and the floor when layer 1 is absent.
 *
 * Resolution happens HERE, server-side, rather than shipping the ~110KB table to every browser: a
 * response then carries only the handful of items a character actually owns.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** One object class as exported from the client registry. */
interface ItemDefinition {
	name: string
	display?: string
	type?: string
	info?: string
	/** Inventory footprint in grid cells. Present only for items a player can actually hold. */
	w?: number
	h?: number
}

interface ItemTable {
	language: string
	objectCount: number
	namedCount: number
	objects: Record<string, ItemDefinition>
}

/** One decoded item out of a locker or loadout blob. */
export interface DecodedItem {
	/** Slot index within the container. Not necessarily contiguous, and not necessarily sorted. */
	slot: number
	objectId: number
	/** The engine's class name for the item, e.g. `Tool`, `AmmoBox`, `SimpleItem`, `Kit`. */
	className: string
	/** Internal registry name (`r_shotgun`), always present -- the fallback when there is no display name. */
	name: string
	/** Player-facing name (`Jackhammer`). Absent for engine-internal objects that were never named. */
	display?: string
	/** Registry type, e.g. `weapon`, `ammunition`. */
	type?: string
	/** Ammo loaded in the item's magazines, for a weapon. */
	ammo?: { slot: number; typeIndex: number; typeId: number; magazine: number; name?: string; display?: string }[]
	/** Number of rounds, for an ammo box. */
	capacity?: number
	/** Inventory footprint in grid cells, for laying the item out on the equipment grid. */
	w?: number
	h?: number
}

const here = dirname(fileURLToPath(import.meta.url))

let table: ItemTable | null = null
let fallbackNames: Record<string, string> | null = null

/**
 * Id -> internal object name, from PSF-LoginServer's own `ObjectClass` table.
 *
 * This is PSForever's open-source data, not client-derived, so unlike the item table above it IS
 * committed here and is always present. It is strictly a floor: `r_shotgun` reads far better than
 * `object_714` when nobody has generated the real names, and a client-derived table overrides it
 * entirely when one exists.
 */
function fallback(): Record<string, string> {
	try {
		fallbackNames ??= JSON.parse(
			readFileSync(join(here, 'objectClasses.json'), 'utf8')
		).objects as Record<string, string>;
	} catch {
		fallbackNames = {};
	}
	return fallbackNames;
}

/**
 * Loads the item table once, on first use. A missing table is deliberately NOT fatal: the portal is
 * still perfectly usable showing internal names, and refusing to boot over a cosmetic data file would
 * turn a regenerate-the-assets chore into an outage.
 */
function items(): Record<string, ItemDefinition> {
	if (table === null) {
		try {
			const path = join(here, '..', 'data', 'items-english.json')
			table = JSON.parse(readFileSync(path, 'utf8')) as ItemTable
			console.log(`Loaded ${table.objectCount} item definitions (${table.namedCount} named)`)
		} catch (e) {
			console.log(`WARNING: no item name table, falling back to raw object ids: ${e}`)
			table = { language: 'none', objectCount: 0, namedCount: 0, objects: {} }
		}
	}
	return table.objects
}

/**
 * Internal registry name for an object id (`apc_nc`), falling back to PSForever's own ObjectClass
 * table. This is the key the vehicle trunk table is indexed by.
 */
export function internalName(objectId: number): string | undefined {
	return items()[String(objectId)]?.name ?? fallback()[String(objectId)]
}

/** Player-facing name for an object id, or undefined if the client never named it. */
export function displayName(objectId: number): string | undefined {
	return items()[String(objectId)]?.display
}

/**
 * The client's descriptions embed a literal two-character `\n` rather than a real newline, because the
 * client unescapes them itself at render time. Do the same here so a consumer gets real line breaks.
 */
export function description(objectId: number): string | undefined {
	return items()[String(objectId)]?.info?.replace(/\\n/g, '\n')
}

/**
 * Decodes one locker/loadout blob.
 *
 * Unparseable segments are skipped rather than throwing. These blobs are written by a different
 * process across schema changes, and one malformed item should cost the player that row, not the whole
 * page.
 */
export function decodeInventory(clob: string | null | undefined): DecodedItem[] {
	if (!clob) return []

	const defs = items()
	const out: DecodedItem[] = []

	for (const segment of clob.split('/')) {
		if (!segment) continue

		// Only the first three commas are structural. Anything after them is rejoined below rather
		// than dropped, so a stray comma inside the ammo field cannot silently shift the parse.
		const parts = segment.split(',')
		if (parts.length < 3) continue

		const [className, slotRaw, objectRaw] = parts
		const slot = Number.parseInt(slotRaw, 10)
		const objectId = Number.parseInt(objectRaw, 10)
		if (!Number.isInteger(slot) || !Number.isInteger(objectId)) continue

		const ammoInfo = parts.slice(3).join(',')
		const def = defs[String(objectId)]

		const item: DecodedItem = {
			slot,
			objectId,
			className,
			name: def?.name ?? fallback()[String(objectId)] ?? `object_${objectId}`,
		}
		if (def?.display) item.display = def.display
		if (def?.type) item.type = def.type
		if (def?.w && def?.h) { item.w = def.w; item.h = def.h }

		if (ammoInfo.startsWith('_')) {
			// Tool: one `_slot-typeIndex-typeId-magazine` group per ammo slot, concatenated.
			const ammo = ammoInfo
				.split('_')
				.filter((g) => g.length > 0)
				.map((group) => {
					const f = group.split('-').map((n) => Number.parseInt(n, 10))
					if (f.length < 4 || f.some((n) => !Number.isInteger(n))) return null
					const ammoDef = defs[String(f[2])]
					return {
						slot: f[0],
						typeIndex: f[1],
						typeId: f[2],
						magazine: f[3],
						name: ammoDef?.name ?? fallback()[String(f[2])],
						display: ammoDef?.display,
					}
				})
				.filter((a): a is NonNullable<typeof a> => a !== null)

			if (ammo.length > 0) item.ammo = ammo
		} else if (ammoInfo.length > 0) {
			// AmmoBox: a bare capacity.
			const capacity = Number.parseInt(ammoInfo, 10)
			if (Number.isInteger(capacity)) item.capacity = capacity
		}

		out.push(item)
	}

	// The blob preserves whatever order the container iterated in; slot order is what a player expects.
	return out.sort((a, b) => a.slot - b.slot)
}

/**
 * Exosuit names, indexed by the `exosuit_id` a loadout row stores. Mirrors PSF-LoginServer's
 * `net.psforever.types.ExoSuitType` enumeration, whose ordinal IS the stored value.
 */
const EXOSUITS = ['Agile', 'Reinforced', 'MAX', 'Infiltration', 'Standard']

export function exosuitName(id: number): string {
	return EXOSUITS[id] ?? `Exosuit ${id}`
}
