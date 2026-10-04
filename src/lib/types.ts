/** Shapes returned by the Express API (see api/*.js). */

export interface Character {
  id: number
  account_id: number
  name: string
  faction_id: number
  created?: string
  last_login?: string
  battle_rank?: number
  command_rank?: number
  outfit_id?: number | null
  outfit_name?: string | null
}

/** GET /api/stats */
export interface Stats {
  status: 'UP' | 'DOWN'
  players: Character[]
  accounts: number
  characters: number
  last: { character?: Character }
  empires: { TR: number; NC: number; VS: number; NL?: number }
}

/** GET /api/user */
export interface CurrentUser {
  id: number
  name: string
  admin: boolean
}

/** GET /api/user/:user */
export interface AccountProfile {
  id: number
  username: string
  email?: string
  created?: string
  gm?: boolean
  banned?: boolean
  characters?: Character[]
}

export interface LoginRecord {
  id?: number
  account_id?: number
  login_time?: string
  ip?: string
  canonical_hostname?: string
}

export interface OutfitMember {
  id: number
  name: string
  faction_id: number
  rank?: number
  points?: number
}

export interface Outfit {
  id: number
  name: string
  faction_id: number
  created?: string
  leader?: string
  member_count?: number
  points?: number
}

/** Envelope used by the paginated list endpoints. */
export interface Paginated<T> {
  items?: T[]
  rows?: T[]
  total?: number
  page?: number
}

/** A facility placed on a continent (static/continents/mapNN.json). */
export interface Facility {
  id: number
  name: string
  /** Original zonemap identifier; the live lattice feed refers to facilities by this. */
  rawName: string
  type: string
  category: 'major' | 'tower' | 'warpgate' | 'minor'
  x: number
  y: number
  yaw: number
  soi: number
  /** True for the six bases PSF treats as capitols (Building.Capitols). */
  capitol?: boolean
}

/** Static continent layout (static/continents/mapNN.json). */
export interface Continent {
  number: number
  /** PSF zone id (z1..z10 / i1..i4 / c1..c6) -- the key the live lattice feed uses. */
  zoneId: string
  base: string
  name: string
  terrain: {
    worldSize: number
    sea: number
    /** Land silhouette polygons; world coords [x, y], y north-up. Lakes are separate. */
    land: [number, number][][]
    /**
     * Submerged-but-wadeable shelf: below the water plane, still shallow enough for infantry to
     * stand in. Water deeper than that is left transparent (open ocean and inland deeps alike).
     */
    shallow: [number, number][][]
    /** Lava-pool polygons (volcanic continents only; empty otherwise). */
    lava: [number, number][][]
    /** Cavern pillar / crystal formations (caverns only; empty otherwise). */
    pillars: [number, number][][]
    /** Road network, painted in the client's surface layer. Faint backdrop detail. */
    roads: [number, number][][]
    /** Dominant biome family; selects which tint palette the ground classes use. */
    biomeFamily: string
    /** Ground-class regions (grass/sand/rock/...) as flat filled polygons. */
    biomeRegions: Record<string, [number, number][][]>
    /** Capitol force domes: the dome's ground perimeter in world coords, and the facility it shields. */
    domes: { type: string; facilityId: number | null; ring: [number, number][] }[]
    /** Monolith markers (one per continent on most maps). */
    monoliths: { name: string; x: number; y: number }[]
    /** Bridge deck runs as world-coord polylines. */
    bridges: [number, number][][]
    /** Elevation contour lines as world-coord segments; faint optional overlay. */
    contours?: [number, number][][]
    /** Sanctuary structures (HART, vehicle/dropship/spawn buildings); empty elsewhere. */
    structures: { type: string; name: string; x: number; y: number; yaw: number }[]
    /** Sanctuary vehicle / air / BFR terminals; empty elsewhere. `type` selects the model outline. */
    terminals: { kind: 'ground' | 'air' | 'bfr'; type: string; x: number; y: number; yaw: number }[]
  }
  facilities: Facility[]
  /** For a sanctuary, the empire that owns the whole zone outright; null for contested zones. */
  empire: 0 | 1 | 2 | null
}

/** Which section of the zone list a map belongs to. */
export type ZoneGroup = 'continent' | 'island' | 'cavern' | 'sanctuary'

/** static/continents/index.json */
export interface ContinentSummary {
  number: number
  zoneId: string
  base: string
  name: string
  group: ZoneGroup
  facilities: number
  empire?: 0 | 1 | 2 | null
}

/** GET /api/continents/:zone/control — building local_id -> faction_id */
export interface ControlResponse {
  zone: number
  control: Record<number, number>
}

/* ---- Combat snapshot (admin): GET /api/zones/:zone/combat ---- */

export interface CombatSeat {
  index: number
  /** pilot | driver | gunner | passenger | max */
  role: string
  occupant: { guid: number; name: string } | null
}

/** A vehicle riding in a carrier's cargo hold (Lodestar / Galaxy vehicle slot). */
export interface CombatCargo {
  index: number
  guid: number
  name: string
}

export interface CombatSoldier {
  guid: number
  name: string
  faction: number
  x: number
  y: number
  facing: number
  max: boolean
  /** GUID of the vehicle this soldier is mounted in, or null when on foot. */
  seated: number | null
}

export interface CombatVehicle {
  guid: number
  /** Internal codename ("reaver", "galaxy", "lodestar", "ams"); the client formats a display name. */
  name: string
  faction: number
  x: number
  y: number
  facing: number
  seats: CombatSeat[]
  cargo: CombatCargo[]
}

export interface CombatDeployable {
  guid: number
  name: string
  category: string
  faction: number
  x: number
  y: number
}

export interface CombatSnapshot {
  zone_id: string
  zone_number: number
  soldiers: CombatSoldier[]
  vehicles: CombatVehicle[]
  deployables: CombatDeployable[]
}

/** An entity selected on the combat map. */
export interface CombatSelection {
  kind: 'soldier' | 'vehicle' | 'deployable'
  guid: number
}
