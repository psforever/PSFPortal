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

/** Class name for an entity's faction, for colouring names in lists. */
export function factionClass(id: number | undefined | null): string {
  return factionById(id)?.cls ?? ''
}
