import TRUNKS from './vehicleTrunks.json'

/**
 * How the game lays out a character's equipment, per exosuit.
 *
 * Mirrors PSF-LoginServer's `GlobalDefinitionsExoSuit.init()` and `InventoryTile`, which are in turn
 * the client's own numbers. Getting these wrong silently misplaces every item, so they are copied
 * rather than guessed:
 *
 *   suit          inventory   holsters
 *   Standard      9 x 6       0 pistol, 2 rifle, 4 melee
 *   Agile         9 x 9       0 pistol, 1 pistol, 2 rifle, 4 melee
 *   Reinforced   12 x 9       0 pistol, 1 pistol, 2 rifle, 3 rifle, 4 melee
 *   Infiltration  6 x 6       0 pistol, 4 melee
 *   MAX          16 x 12      0 max, 4 melee
 *
 * Every suit uses `InventoryOffset = 6`: slots 0-5 are the holsters (5 is never used) and the grid
 * begins at 6. So a grid item at slot s sits at x = (s - 6) % width, y = floor((s - 6) / width).
 */

/** A holster slot: which index in the blob, and what it may hold. */
export interface Holster {
  slot: number
  kind: 'Pistol' | 'Rifle' | 'Melee' | 'MAX'
}

export interface ExoSuitLayout {
  /** Display name, matching what the API's `exosuit` field returns. */
  name: string
  /** Inventory grid width in cells. */
  width: number
  /** Inventory grid height in cells. */
  height: number
  holsters: Holster[]
}

/** Slots 0-5 are holsters; an exosuit's inventory grid starts here. */
export const INVENTORY_OFFSET = 6

const MELEE: Holster = { slot: 4, kind: 'Melee' }

/** Keyed by `exosuit_id`, which is the ordinal of PSF's `ExoSuitType` enumeration. */
export const EXOSUITS: Record<number, ExoSuitLayout> = {
  0: {
    name: 'Agile',
    width: 9,
    height: 9,
    holsters: [
      { slot: 0, kind: 'Pistol' },
      { slot: 1, kind: 'Pistol' },
      { slot: 2, kind: 'Rifle' },
      MELEE
    ]
  },
  1: {
    name: 'Reinforced',
    width: 12,
    height: 9,
    holsters: [
      { slot: 0, kind: 'Pistol' },
      { slot: 1, kind: 'Pistol' },
      { slot: 2, kind: 'Rifle' },
      { slot: 3, kind: 'Rifle' },
      MELEE
    ]
  },
  2: {
    name: 'MAX',
    width: 16,
    height: 12,
    holsters: [{ slot: 0, kind: 'MAX' }, MELEE]
  },
  3: {
    name: 'Infiltration',
    width: 6,
    height: 6,
    holsters: [{ slot: 0, kind: 'Pistol' }, MELEE]
  },
  4: {
    name: 'Standard',
    width: 9,
    height: 6,
    holsters: [{ slot: 0, kind: 'Pistol' }, { slot: 2, kind: 'Rifle' }, MELEE]
  }
}

/**
 * Layout for an exosuit id, falling back to Standard.
 *
 * A loadout row could name a suit this table does not know (a future suit, or a corrupt row); showing
 * it in the smallest sensible grid beats rendering nothing, and any item whose slot falls outside that
 * grid is surfaced separately rather than dropped.
 */
export function exosuitLayout(id: number): ExoSuitLayout {
  return EXOSUITS[id] ?? EXOSUITS[4]
}

/**
 * Grid cell for a slot, or null when the slot sits below the container's grid (a holster).
 *
 * `offset` matters: an exosuit's grid starts at slot 6, but a VEHICLE TRUNK starts at 30. Using the
 * exosuit's offset for a trunk silently shifts every item by 24 cells.
 */
export function gridPosition(
  slot: number,
  width: number,
  offset: number = INVENTORY_OFFSET
): { x: number; y: number } | null {
  if (slot < offset) return null
  const n = slot - offset
  return { x: n % width, y: Math.floor(n / width) }
}

/**
 * A container an inventory can be drawn into: an exosuit's inventory, or a vehicle's trunk.
 * `holsters` is empty for a trunk -- a vehicle has no weapon holsters to draw.
 */
export interface Container {
  name: string
  width: number
  height: number
  offset: number
  holsters: Holster[]
}

export function suitContainer(exosuitId: number): Container {
  const s = exosuitLayout(exosuitId)
  return { name: s.name, width: s.width, height: s.height, offset: INVENTORY_OFFSET, holsters: s.holsters }
}

/**
 * Trunk geometry for a vehicle, by internal name (`apc_nc`, `lodestar`).
 *
 * Sizes are per-vehicle and vary widely -- a Phantasm holds 11x7, a Sunderer 20x16 -- so there is no
 * sensible single default. An unknown vehicle returns null and the caller says so rather than drawing
 * a plausible-looking grid that is simply wrong.
 */
export function trunkContainer(internalName: string | undefined, display?: string): Container | null {
  if (!internalName) return null
  const t = (TRUNKS.vehicles as Record<string, { w: number; h: number; offset: number }>)[internalName]
  if (!t) return null
  return { name: display ?? internalName, width: t.w, height: t.h, offset: t.offset, holsters: [] }
}

/**
 * The character's locker: `GridInventory(30, 20)` in PSF-LoginServer's `LockerContainer`.
 *
 * Unlike an exosuit, a locker is a standalone container -- it has no holsters, and its slot indices
 * are raw grid positions, so the offset is 0 rather than an exosuit's 6 or a trunk's 30.
 */
export function lockerContainer(): Container {
  return { name: 'Locker', width: 30, height: 20, offset: 0, holsters: [] }
}

/**
 * The client draws one inventory cell at 17 physical pixels. Kept as the base unit so the rendered
 * grid keeps the game's proportions -- a Jackhammer really is three times as long as it is tall.
 */
export const CELL_PX = 17
