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
  empires: Record<'TR' | 'NC' | 'VS', number>
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
