/**
 * Canonical faction mapping, mirroring FACTION_MAP in api/db.js.
 * The ids come straight from the game's faction_id column.
 */
export const FACTION_IDS = {
  TR: 0,
  NC: 1,
  VS: 2,
  NEUTRAL: 3
} as const

export type FactionKey = 'TR' | 'NC' | 'VS' | 'NL'

export interface Faction {
  id: number
  key: FactionKey
  name: string
  /** primary colour helper (see globals.css) */
  cls: string
  /** secondary colour helper: TR gunmetal, NC gold, VS teal */
  secondaryCls: string
}

export const FACTIONS: readonly Faction[] = [
  { id: 0, key: 'TR', name: 'Terran Republic', cls: 'faction-tr', secondaryCls: 'faction-tr-secondary' },
  { id: 1, key: 'NC', name: 'New Conglomerate', cls: 'faction-nc', secondaryCls: 'faction-nc-secondary' },
  { id: 2, key: 'VS', name: 'Vanu Sovereignty', cls: 'faction-vs', secondaryCls: 'faction-vs-secondary' },
  { id: 3, key: 'NL', name: 'Neutral', cls: '', secondaryCls: '' }
] as const

/** The three playable empires, in the order the portal displays them. */
export const EMPIRES: readonly Faction[] = FACTIONS.filter((f) => f.key !== 'NL')

export function factionById(id: number | undefined | null): Faction | undefined {
  return FACTIONS.find((f) => f.id === id)
}

/**
 * Look a faction up by the world server's own name for it.
 *
 * The world server reports an empire as `PlanetSideEmpire.toString` -- `TR`, `NC`, `VS`, or `NEUTRAL`
 * -- rather than as the numeric id the database uses. Matching is case-insensitive and treats
 * `NEUTRAL` as the neutral entry this table calls `NL`, so callers do not have to know that the two
 * vocabularies disagree on that one name.
 */
export function factionByKey(key: string | undefined | null): Faction | undefined {
  const k = String(key ?? '').trim().toUpperCase()
  if (!k) return undefined
  if (k === 'NEUTRAL') return FACTIONS.find((f) => f.key === 'NL')
  return FACTIONS.find((f) => f.key === k)
}

/** Class name for an entity's faction, for colouring names in lists. */
export function factionClass(id: number | undefined | null): string {
  return factionById(id)?.cls ?? ''
}

/** Sanctuary zone id -> owning empire (PSF ZoneInfo: home1 NC, home2 TR, home3 VS). */
export const SANCTUARY_EMPIRE: Record<string, 0 | 1 | 2> = { home1: 1, home2: 0, home3: 2 }

/**
 * Which of a zone's warpgates are currently wired to a sanctuary, keyed by the gate's raw zonemap
 * name (lowercased) -> sanctuary empire id.
 *
 * This must come from the live lattice, never the gate's name: the server rewires warpgate links at
 * runtime, so a gate called `WG_Hossin_to_VSSanc` was observed linking to `home2/WG_TRSanc_to_...`,
 * i.e. the TR sanctuary. Intercontinental links arrive with both ends as `<zoneId>/<gateName>`.
 */
export function sanctuaryTies(
  lattice: [string, string][] | undefined,
  zoneId: string
): Record<string, 0 | 1 | 2> {
  const out: Record<string, 0 | 1 | 2> = {}
  for (const [a, b] of lattice ?? []) {
    for (const [near, far] of [
      [a, b],
      [b, a]
    ] as const) {
      if (!near.startsWith(`${zoneId}/`)) continue
      const farZone = far.includes('/') ? far.split('/')[0] : ''
      const empire = SANCTUARY_EMPIRE[farZone]
      if (empire === undefined) continue
      out[near.slice(zoneId.length + 1).toLowerCase()] = empire
    }
  }
  return out
}

/** Display name for a gate wired to a sanctuary, e.g. "TR Sanctuary Gate". */
export function sanctuaryGateName(empire: 0 | 1 | 2): string {
  return `${FACTIONS[empire].key} Sanctuary Gate`
}

/** Zone ids that are sanctuaries -- real destinations, but the portal ships no map for them. */
export const SANCTUARY_ZONES = new Set(['home1', 'home2', 'home3'])

/**
 * Live destination label for every warpgate in a zone, keyed by raw gate name (lowercased).
 *
 * Gate names in the map data record the link the zone shipped with, and the server rewires those at
 * runtime -- so a gate can be named for one destination while actually leading somewhere else, and
 * two gates can end up claiming the same name. Deriving the label from the live lattice keeps every
 * gate honest and unique. `zoneNames` maps a zone id (z1, home2, ...) to its display name.
 */
export function gateDestinations(
  lattice: [string, string][] | undefined,
  zoneId: string,
  zoneNames: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [a, b] of lattice ?? []) {
    for (const [near, far] of [
      [a, b],
      [b, a]
    ] as const) {
      if (!near.startsWith(`${zoneId}/`)) continue
      const farZone = far.includes('/') ? far.split('/')[0] : ''
      if (!farZone) continue
      const empire = SANCTUARY_EMPIRE[farZone]
      const label =
        empire !== undefined ? sanctuaryGateName(empire) : zoneNames[farZone]
          ? `${zoneNames[farZone]} Gate`
          : ''
      if (label) out[near.slice(zoneId.length + 1).toLowerCase()] = label
    }
  }
  return out
}
