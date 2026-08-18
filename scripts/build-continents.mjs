// Build the portal's static continent data from two sources:
//   - terrain water masks exported by raxicore-editor's ContinentExport tool
//     (per-continent { worldSize, sea, maskN, mask } -- a bit-packed heightfield water mask)
//   - facility placements from PSF-LoginServer's zonemaps
//     (per-object { MapID, ObjectName, ObjectType, AbsX, AbsY, Yaw })
//
// The mask is turned here into smooth coastline geometry: land silhouette polygons + inland-lake
// polygons (ocean is left implicit -- everything outside the land is transparent sea).
//
// Output: static/continents/mapNN.json (terrain geometry + facilities) and index.json.
// Current ownership is NOT baked in here -- it's dynamic and fetched from
// /api/continents/:zone/control at view time.
//
// Usage:
//   node scripts/build-continents.mjs --terrain <dir> --zonemaps <PSF zonemaps dir>
//
// Regenerate whenever the client map data or the PSF zonemaps change.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeMask, fieldToPolygons, decodeBytes, downsample, contourSegments } from './lib/contour.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback
}

const here = dirname(fileURLToPath(import.meta.url))
const terrainDir = arg('--terrain', '')
const zonemapDir = arg('--zonemaps', '')
if (!terrainDir || !zonemapDir) {
  console.error('usage: --terrain <dir> --zonemaps <dir>')
  process.exit(1)
}

const outDir = join(here, '..', 'static', 'continents')
mkdirSync(outDir, { recursive: true })

// Every playable zone, grouped for the UI. Zone numbers, names and map bases are taken from PSF's
// ZoneInfo.scala (the overworld is zone N == mapNN; the battle islands and Core Combat caverns carry
// their own zone values and map to patchmap/mapNN and expansion1/ugdNN respectively).
const CONTINENTS = [
  { number: 1, zoneId: 'z1', base: 'map01', name: 'Solsar', group: 'continent' },
  { number: 2, zoneId: 'z2', base: 'map02', name: 'Hossin', group: 'continent' },
  { number: 3, zoneId: 'z3', base: 'map03', name: 'Cyssor', group: 'continent' },
  { number: 4, zoneId: 'z4', base: 'map04', name: 'Ishundar', group: 'continent' },
  { number: 5, zoneId: 'z5', base: 'map05', name: 'Forseral', group: 'continent' },
  { number: 6, zoneId: 'z6', base: 'map06', name: 'Ceryshen', group: 'continent' },
  { number: 7, zoneId: 'z7', base: 'map07', name: 'Esamir', group: 'continent' },
  { number: 8, zoneId: 'z8', base: 'map08', name: 'Oshur', group: 'continent' },
  { number: 9, zoneId: 'z9', base: 'map09', name: 'Searhus', group: 'continent' },
  { number: 10, zoneId: 'z10', base: 'map10', name: 'Amerish', group: 'continent' },

  // Battle islands (ZoneInfo i1..i4).
  { number: 29, zoneId: 'i1', base: 'map99', name: 'Extinction', group: 'island' },
  { number: 30, zoneId: 'i2', base: 'map98', name: 'Ascension', group: 'island' },
  { number: 31, zoneId: 'i3', base: 'map97', name: 'Desolation', group: 'island' },
  { number: 32, zoneId: 'i4', base: 'map96', name: 'Nexus', group: 'island' },

  // Core Combat caverns (ZoneInfo c1..c6).
  { number: 23, zoneId: 'c1', base: 'ugd01', name: 'Supai', group: 'cavern' },
  { number: 24, zoneId: 'c2', base: 'ugd02', name: 'Hunhau', group: 'cavern' },
  { number: 25, zoneId: 'c3', base: 'ugd03', name: 'Adlivun', group: 'cavern' },
  { number: 26, zoneId: 'c4', base: 'ugd04', name: 'Byblos', group: 'cavern' },
  { number: 27, zoneId: 'c5', base: 'ugd05', name: 'Annwn', group: 'cavern' },
  { number: 28, zoneId: 'c6', base: 'ugd06', name: 'Drugaskan', group: 'cavern' },

  // Sanctuaries. Every structure in a sanctuary belongs to its empire outright (Zones.scala sets the
  // whole zone's faction on load), so `empire` colours the map instead of the live control feed --
  // sanctuaries are never contested and have no rows in the `building` table.
  { number: 11, zoneId: 'home1', base: 'map11', name: 'NC Sanctuary', group: 'sanctuary', empire: 1 },
  { number: 12, zoneId: 'home2', base: 'map12', name: 'TR Sanctuary', group: 'sanctuary', empire: 0 },
  { number: 13, zoneId: 'home3', base: 'map13', name: 'VS Sanctuary', group: 'sanctuary', empire: 2 }
]

// SOI radius by facility type (GlobalDefinitionsBuilding.scala). A zonemap object
// is treated as a facility iff its ObjectType appears here.
const SOI = {
  amp_station: 300,
  comm_station: 300,
  comm_station_dsp: 300,
  cryo_facility: 300,
  tech_plant: 300,
  warpgate: 302,
  warpgate_small: 103,
  warpgate_cavern: 41,
  redoubt: 187,
  vanu_control_point: 187,
  vanu_vehicle_station: 187,
  tower_a: 50,
  tower_b: 50,
  tower_c: 50,
  hst: 82
}

// ---------------------------------------------------------------------------------------------
// Display names.
//
// The zonemaps carry internal identifiers (WG_Hossin_to_VSSanc, GW_Hossin_S, NE_Oshur_Warpgate_Tower,
// Blue_Base), which are not what the client shows. Battle-island bases in particular have real names
// that live in PSF's ZoneInfo alias tables; everything else is derived from the identifier.
// ---------------------------------------------------------------------------------------------

/** Battle-island base aliases, from ZoneInfo.scala's AliasLookup (zonemap name -> client name). */
const FACILITY_ALIASES = {
  map99: { blue_base: 'Mithra', red_base: 'Yazata', indigo_base: 'Hvar' },
  map98: { base_alpha: 'Zal', base_bravo: 'Rashnu', base_charlie: 'Sraosha' },
  map97: { red_base_97: 'Dahaka', blue_base_97: 'Jamshid', indigo_base_97: 'Izha' },
  map96: { nexus_base: 'Atar' }
}

const COMPASS = {
  N: 'North', S: 'South', E: 'East', W: 'West',
  NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest'
}

/** Sanctuary shorthands used in warpgate identifiers. */
const SANCTUARY = { vssanc: 'VS Sanctuary', ncsanc: 'NC Sanctuary', trsanc: 'TR Sanctuary' }

const titleCase = (s) =>
  s
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())

/**
 * Battle-island structures are keyed off the same token as the base they belong to -- Extinction's
 * `Red_Base` is really Yazata, so `Red_Gun_Tower` is Yazata's gun tower. Derive token -> base-name
 * from the alias table (strip the "Base" part and any map-number suffix) so towers inherit the real
 * names instead of showing internal colour/phonetic codes.
 */
function baseTokens(base) {
  const out = {}
  for (const [zoneName, clientName] of Object.entries(FACILITY_ALIASES[base] ?? {})) {
    // Drop the map-number suffix BEFORE removing "base", otherwise `red_base_97` collapses to
    // `red97` (the separators go with it) and the suffix strip no longer matches.
    const token = zoneName.replace(/_\d+$/, '').replace(/_?base_?/i, '').replace(/_/g, '')
    if (token) out[token.toLowerCase()] = clientName
  }
  return out
}

/**
 * Turn a zonemap identifier into the name a player would recognise. Destination-first, and the
 * continent prefix is dropped since you are already looking at that continent's map.
 */
function displayName(raw, base, type) {
  if (!raw) return raw
  const alias = FACILITY_ALIASES[base]?.[raw.toLowerCase()]
  if (alias) return alias

  const destName = (d) => SANCTUARY[d.toLowerCase()] ?? titleCase(d.replace(/_/g, ' '))

  // A tower AT a warpgate, not the gate itself -- must be tested before the plain warpgate rule,
  // which would otherwise swallow the trailing _Tower.
  let m = /^WG_[A-Za-z0-9]+_to_(.+?)_Tower$/i.exec(raw)
  if (m) return `${destName(m[1])} Warpgate Tower`

  // Warpgate: WG_<continent>_to_<destination>  ->  "<Destination> Gate"
  m = /^WG_[A-Za-z0-9]+_to_(.+)$/i.exec(raw)
  if (m) return `${destName(m[1])} Gate`

  // Geowarp: GW_<continent>_<compass>  ->  "<Compass> Geowarp"
  m = /^GW_[A-Za-z0-9]+_([NSEW]{1,2})$/i.exec(raw)
  if (m) return `${COMPASS[m[1].toUpperCase()] ?? m[1].toUpperCase()} Geowarp`

  // Monolith: monolith_cyssor -> "Monolith" (the continent is implied by the map you're viewing).
  if (/^monolith(_|$)/i.test(raw)) return 'Monolith'

  // Battle-island gates: MapNN_Gate_One -> "Gate One"
  m = /^Map\d+_(Gate_.+)$/i.exec(raw)
  if (m) return titleCase(m[1])

  // Battle-island structures: swap the internal base token for the real base name, and make sure a
  // tower still reads as one (several are named e.g. `Alpha_Top` with no "Tower" in the identifier).
  const tokens = baseTokens(base)
  if (Object.keys(tokens).length) {
    const parts = raw.replace(/_\d+$/, '').split('_')
    const swapped = parts.map((p) => tokens[p.toLowerCase()] ?? p)
    if (swapped.some((p, i) => p !== parts[i])) {
      let name = titleCase(swapped.join(' '))
      if (String(type).startsWith('tower') && !/tower/i.test(name)) name += ' Tower'
      return name
    }
  }

  // Sanctuary structures carry an empire prefix and abbreviate "warpgate" to WG, neither of which
  // means anything to a player already looking at that empire's sanctuary: `nc_SW_Cyssor_Warpgate_
  // Tower` and `S_Ishundar_WG_tower` should read the same way as every other tower on the map.
  let sanc = raw.replace(/^(nc|tr|vs)_/i, '').replace(/_WG_/gi, '_Warpgate_')
  if (sanc !== raw) {
    // `Far` is a distance qualifier in the identifier, not part of the place name.
    const far = /^Far_/i.test(sanc)
    sanc = sanc.replace(/^Far_/i, '')
    const c = /^([NSEW]{1,2})_(.+?)_?Tower$/i.exec(sanc)
    if (c) return `${titleCase(c[2])} Tower (${c[1].toUpperCase()})`
    const t = /^(.+?)_?Tower$/i.exec(sanc)
    if (t) return `${titleCase(t[1])} Tower${far ? ' (Far)' : ''}`
  }

  // Tower with a leading compass: NE_Oshur_Warpgate_Tower -> "Oshur Warpgate Tower (NE)"
  m = /^([NSEW]{1,2})_(.+?)_?Tower(_\d+)?$/i.exec(raw)
  if (m) return `${titleCase(m[2])} Tower (${m[1].toUpperCase()})`

  // Plain tower: Ixtab_tower -> "Ixtab Tower"; Central_Blue_Tower_97 -> "Central Blue Tower"
  m = /^(.+?)_?Tower(_\d+)?$/i.exec(raw)
  if (m) return `${titleCase(m[1])} Tower`

  // Anything else: drop a trailing map-number suffix and tidy up.
  return titleCase(raw.replace(/_\d+$/, ''))
}

// ---------------------------------------------------------------------------------------------
// Capitol force domes.
//
// A capitol base is shielded by a force dome, and the game data marks them: each such base has a
// `force_dome_*` object in the zonemap carrying the dome's position and heading. The dome is
// PYRAMIDAL, not hemispherical -- PSF's ForceDomeDefinition gives a per-type ground PERIMETER
// (GlobalDefinitionsMiscellaneous), which is the true footprint to draw rather than a guessed circle.
// Offsets below are transcribed from those definitions, in model-local units about the dome object.
// ---------------------------------------------------------------------------------------------

const DOME_PERIMETER = {
  force_dome_amp_physics: [
    [83.05469, 114.875], [-90.328125, 114.875], [-90.328125, -106.90625], [83.05469, -106.90625]
  ],
  force_dome_comm_physics: [
    [35.1875, -89.859375], [80.96875, -43.773438], [80.96875, 91.08594],
    [-37.296875, 91.08594], [-83.640625, 45.601562], [-83.640625, -89.859375]
  ],
  force_dome_cryo_physics: [
    [72.75476, 39.902725], [24.505968, 88.03482], [-74.73426, 88.03482],
    [-74.73426, -103.47], [72.75476, -103.47]
  ],
  force_dome_dsp_physics: [
    [35.03125, -93.25], [-83.1875, -93.25], [-83.1875, 114.515625],
    [-12.109375, 188.26562], [130.44531, 188.26562], [130.44531, -93.28125]
  ],
  force_dome_tech_physics: [
    [130.14636, -95.20665], [130.14636, 34.441734], [103.98575, 52.58408],
    [16.405174, 54.746464], [14.256668, 107.01521], [-92.08687, 107.01521],
    [-92.08687, -96.176155], [-73.64424, -114.65837], [102.12191, -114.65837]
  ]
}

/** Bases PSF treats as capitols (Building.Capitols). */
const CAPITOLS = new Set(['Thoth', 'Voltan', 'Neit', 'Anguta', 'Eisa', 'Verica'])

// Coarse category for rendering/labels.
/**
 * Sanctuary structures that are drawn from their model footprint but are not capturable facilities:
 * the HART, the vehicle / dropship / spawn buildings, and the pads and pad doors themselves. The
 * pads are child objects of their building rather than buildings in their own right, so unlike
 * facilities these are NOT filtered on IsChildObject.
 */
const SANCTUARY_STRUCTURES = new Set([
  'orbital_building_nc', 'orbital_building_tr', 'orbital_building_vs',
  'vt_vehicle', 'vt_dropship', 'vt_spawn',
  // The pad a vehicle materialises on, the doors that open with it, and the air pads.
  'mb_pad_creation', 'dropship_pad_doors', 'pad_landing', 'pad_landing_tower_frame'
])

/** Terminal object type -> the kind of thing it spawns. */
const TERMINAL_KIND = {
  vehicle_terminal: 'ground',
  dropship_vehicle_terminal: 'air',
  bfr_terminal: 'bfr'
}

function category(type) {
  if (type.startsWith('tower')) return 'tower'
  if (type.startsWith('warpgate')) return 'warpgate'
  if (['amp_station', 'comm_station', 'comm_station_dsp', 'cryo_facility', 'tech_plant'].includes(type)) return 'major'
  return 'minor'
}

const index = []

for (const cont of CONTINENTS) {
  const terrainPath = join(terrainDir, cont.base + '.json')
  const zonemapPath = join(zonemapDir, cont.base + '.json')
  if (!existsSync(terrainPath) || !existsSync(zonemapPath)) {
    console.warn(`skip ${cont.base}: missing ${!existsSync(terrainPath) ? 'terrain' : 'zonemap'}`)
    continue
  }

  const terrain = JSON.parse(readFileSync(terrainPath, 'utf8'))
  const zonemap = JSON.parse(readFileSync(zonemapPath, 'utf8'))

  const facilities = zonemap
    .filter((o) => !o.IsChildObject && SOI[o.ObjectType] !== undefined)
    .map((o) => ({
      // MapID is the building's local id within the zone; it matches
      // building.local_id in the DB, which is what the control API keys on.
      // (The zonemap's `Id` is a different, non-matching identifier.)
      id: o.MapID,
      name: displayName(o.ObjectName, cont.base, o.ObjectType),
      rawName: o.ObjectName,
      type: o.ObjectType,
      category: category(o.ObjectType),
      x: o.AbsX,
      y: o.AbsY,
      yaw: o.Yaw,
      soi: SOI[o.ObjectType],
      capitol: CAPITOLS.has(o.ObjectName)
    }))

  // Force domes: place each dome type's perimeter at the dome object's position/heading. Yaw is in
  // degrees about +Z, the same convention the facility footprints use.
  const domes = zonemap
    .filter((o) => !o.IsChildObject && DOME_PERIMETER[o.ObjectType])
    .map((o) => {
      const th = ((o.Yaw ?? 0) * Math.PI) / 180
      const cs = Math.cos(th)
      const sn = Math.sin(th)
      const ring = DOME_PERIMETER[o.ObjectType].map(([ox, oy]) => [
        Math.round((o.AbsX + ox * cs - oy * sn) * 10) / 10,
        Math.round((o.AbsY + ox * sn + oy * cs) * 10) / 10
      ])
      // Which facility this dome shields (they are co-located in the data).
      let owner = null
      let best = Infinity
      for (const f of facilities) {
        const d = Math.hypot(f.x - o.AbsX, f.y - o.AbsY)
        if (d < best) { best = d; owner = f }
      }
      return { type: o.ObjectType, facilityId: best <= 40 ? owner?.id ?? null : null, ring }
    })

  // Sanctuary structures: drawn like facilities (same model footprints) but never owned or clickable.
  const structures = zonemap
    .filter((o) => SANCTUARY_STRUCTURES.has(o.ObjectType))
    .map((o) => ({
      type: o.ObjectType,
      name: titleCase(o.ObjectName),
      x: Math.round(o.AbsX * 10) / 10,
      y: Math.round(o.AbsY * 10) / 10,
      yaw: o.Yaw
    }))

  // Vehicle / air / BFR terminals. These are child objects of their building, so unlike facilities
  // they are not filtered on IsChildObject -- their own AbsX/AbsY is already in map coordinates.
  const terminals = zonemap
    .filter((o) => TERMINAL_KIND[o.ObjectType] !== undefined)
    .map((o) => ({
      kind: TERMINAL_KIND[o.ObjectType],
      // Carried so the map can draw the terminal's own model outline rather than a stand-in glyph.
      type: o.ObjectType,
      x: Math.round(o.AbsX * 10) / 10,
      y: Math.round(o.AbsY * 10) / 10,
      yaw: o.Yaw
    }))

  // Monoliths: one per continent, marked with the model's side profile rather than an SOI facility.
  const monoliths = zonemap
    .filter((o) => o.ObjectType === 'monolith' && !o.IsChildObject)
    .map((o) => ({ name: displayName(o.ObjectName, cont.base, o.ObjectType), x: o.AbsX, y: o.AbsY }))

  // Turn the depth masks into geometry. Terrain below the water plane is split by whether infantry
  // can still stand in it (see the exporter's WadeDepth):
  //   dry                      -> land
  //   submerged but wadeable   -> shallow shelf, drawn as light water
  //   deeper than wadeable     -> open water, left transparent (ocean, inland deeps alike)
  const { worldSize, maskN, mask, deepMask, sea } = terrain
  const cell = worldSize / maskN

  // Elevation contour lines (optional overlay). Downsample the height grid, then trace iso-lines at a
  // handful of evenly-spaced levels. Segments are in the tile-grid frame and get shifted with the rest.
  const contourSegs = (() => {
    if (!terrain.elevation || !terrain.elevationN) return []
    const en = terrain.elevationN
    const field = decodeBytes(terrain.elevation, en)
    const cn = Math.min(en, 128)
    const ds = downsample(field, en, cn)
    const LEVELS = 6
    const levels = []
    for (let k = 1; k <= LEVELS; k++) levels.push((k * 255) / (LEVELS + 1))
    return contourSegments(ds, cn, worldSize / cn, levels).map(([a, b]) => [
      [Math.round(a[0]), Math.round(a[1])],
      [Math.round(b[0]), Math.round(b[1])]
    ])
  })()
  const water = decodeMask(mask, maskN)
  const deep = deepMask ? decodeMask(deepMask, maskN) : water
  const landField = new Uint8Array(maskN * maskN)
  const shallowField = new Uint8Array(maskN * maskN)
  for (let m = 0; m < maskN * maskN; m++) {
    if (!water[m]) landField[m] = 1
    else if (!deep[m]) shallowField[m] = 1
  }

  // No seaward bias: the coastline is exactly where the terrain crosses the water plane. (An earlier
  // 1-cell dilation was added to keep shoreline facilities on land, but at this grid resolution all
  // 425 facilities sit on dry land without it, and the dilation only invented shoreline that is
  // actually submerged.)
  let land = fieldToPolygons(landField, maskN, cell, {
    smooth: 2,
    minCells: 2
  })
  const shallow = fieldToPolygons(shallowField, maskN, cell, { smooth: 2, minCells: 2 })

  // Caverns are far too vertical for a land/water split to mean anything: there is no water plane, so
  // every cell reads as "land" and the whole cave collapses into a filled rectangle. Use the walkable
  // floor material's footprint as the navigable area instead, and surface the pillar/crystal
  // formations as their own layer.
  const overlayN = terrain.lavaN
  const overlayCell = overlayN ? worldSize / overlayN : 0
  let pillars = []
  if (overlayN && terrain.floor && cont.group === 'cavern') {
    const floorField = decodeMask(terrain.floor, overlayN)
    land = fieldToPolygons(floorField, overlayN, overlayCell, { smooth: 2, minCells: 3 })
  }
  if (overlayN && terrain.pillars) {
    const pillarField = decodeMask(terrain.pillars, overlayN)
    pillars = fieldToPolygons(pillarField, overlayN, overlayCell, { smooth: 2, minCells: 2 })
  }

  // Road network, from the surface layer at its own finer grid. Simplified hard: it renders as a
  // faint backdrop, so outline fidelity matters far less than keeping the file small.
  let roads = []
  if (terrain.roads && terrain.roadN) {
    const roadField = decodeMask(terrain.roads, terrain.roadN)
    roads = fieldToPolygons(roadField, terrain.roadN, worldSize / terrain.roadN, {
      smooth: 1,
      minCells: 4,
      epsilon: 2.5
    })
  }

  // Ground classes -> flat filled regions, one polygon set per class. Contoured (rather than shipped
  // as an image) so each area has a hard edge and a single flat colour, matching how the coastline
  // and every other layer is drawn -- an image would be smooth-scaled and blend between biomes.
  const BIOME_CLASS = ['none','default','grass','trees','sand','rock','dirt','snow','shore','water','lava']
  const biomeRegions = {}
  if (terrain.biome && terrain.biomeN) {
    const bn = terrain.biomeN
    const bcell = worldSize / bn
    const bytes = Buffer.from(terrain.biome, 'base64')
    for (let cls = 1; cls < BIOME_CLASS.length; cls++) {
      const name = BIOME_CLASS[cls]
      // water/lava have their own layers; don't duplicate them as ground tint.
      if (name === 'water' || name === 'lava') continue
      const field = new Uint8Array(bn * bn)
      let n = 0
      for (let m = 0; m < bn * bn; m++) if (bytes[m] === cls) { field[m] = 1; n++ }
      if (!n) continue
      const polys = fieldToPolygons(field, bn, bcell, { smooth: 2, minCells: 2, epsilon: 0.8 })
      if (polys.length) biomeRegions[name] = polys
    }
  }

  // Lava pools (volcanic continents only): a separate finer mask -> filled polygons.
  let lava = []
  if (terrain.lava && terrain.lavaN) {
    const lavaField = decodeMask(terrain.lava, terrain.lavaN)
    lava = fieldToPolygons(lavaField, terrain.lavaN, worldSize / terrain.lavaN, {
      smooth: 2,
      minCells: 2
    })
  }

  // Bridge deck segments, rounded to ints. Like the terrain layers these are in the tile grid's
  // frame and must be shifted into map coordinates -- otherwise an island's bridges land a full
  // 1024 units away from the island they belong to.
  const bridgeSegs = (terrain.bridges ?? []).map((line) => line.map(([x, y]) => [Math.round(x), Math.round(y)]))

  // --- Reconcile the terrain frame with the facility frame -------------------------------------
  // The exporter emits terrain in the tile grid's own frame (spanning [0, tileSpan]), but the client
  // places that grid inside a larger map with a per-map origin offset (LoadMap's MapLoader[+0x33c/
  // +0x340]) that isn't recoverable from the mesh. A full continent's grid fills the map so the
  // offset is 0, but a battle island's 8x8 (2048u) grid sits inside a 3072u map -- leaving its
  // facilities, which ARE in map coordinates, off the edge of the terrain.
  //
  // Recover the offset by centring the tile grid on the facilities and snapping to a tile boundary.
  // Continents come out at 0 (already aligned); islands resolve to the expected 1024.
  const mapSize = cont.group === 'continent' || cont.group === 'sanctuary' ? 8192 : 3072
  const tileSpan = worldSize
  const originFor = (vals) => {
    if (!vals.length) return 0
    const c = (Math.min(...vals) + Math.max(...vals)) / 2
    const snapped = Math.round((c - tileSpan / 2) / 256) * 256
    return Math.max(0, Math.min(snapped, Math.max(0, mapSize - tileSpan)))
  }
  const offX = originFor(facilities.map((f) => f.x))
  const offY = originFor(facilities.map((f) => f.y))
  const shift = (polys) => polys.map((loop) => loop.map(([x, y]) => [x + offX, y + offY]))

  const doc = {
    number: cont.number,
    zoneId: cont.zoneId,
    base: cont.base,
    name: cont.name,
    group: cont.group,
    terrain: {
      worldSize: mapSize,
      sea,
      land: shift(land),
      shallow: shift(shallow),
      lava: shift(lava),
      pillars: shift(pillars),
      roads: shift(roads),
      domes,
      monoliths,
      biomeFamily: terrain.biomeFamily ?? 'earth',
      biomeRegions: Object.fromEntries(
        Object.entries(biomeRegions).map(([k, polys]) => [k, shift(polys)])
      ),
      bridges: shift(bridgeSegs),
      contours: shift(contourSegs),
      structures,
      terminals
    },
    facilities,
    empire: cont.empire ?? null
  }

  writeFileSync(join(outDir, cont.base + '.json'), JSON.stringify(doc))
  index.push({ number: cont.number, zoneId: cont.zoneId, base: cont.base, name: cont.name, group: cont.group, facilities: facilities.length, empire: cont.empire ?? null })
  console.log(
    `${cont.name.padEnd(10)} ${cont.base}  ${facilities.length} fac, ${land.length} land / ${shallow.length} shallow / ${lava.length} lava / ${roads.length} road polys`
  )
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2))
console.log(`\nwrote ${index.length} continents + index.json to static/continents/`)

// ---------------------------------------------------------------------------
// Per-facility-type top-down footprints: contour each coverage mask into outline
// polygons in MODEL-LOCAL world units (origin = the facility's own placement point),
// so the map can translate + rotate one shape per facility instead of drawing markers.
// ---------------------------------------------------------------------------
const fpPath = join(terrainDir, 'footprints.json')
if (existsSync(fpPath)) {
  const raw = JSON.parse(readFileSync(fpPath, 'utf8'))
  const out = {}
  for (const [type, f] of Object.entries(raw)) {
    const field = decodeMask(f.mask, f.n)
    // Keep small detached pieces (corner posts, spoke tips) -- they carry the silhouette.
    const polys = fieldToPolygons(field, f.n, f.cell, { smooth: 1, minCells: 3, epsilon: 2.0 })
    // fieldToPolygons emits [0..n*cell]; shift back into model-local coordinates.
    out[type] = polys.map((loop) =>
      loop.map(([x, y]) => [Math.round((x + f.ox) * 10) / 10, Math.round((y + f.oy) * 10) / 10])
    )
  }
  writeFileSync(join(outDir, 'footprints.json'), JSON.stringify(out))
  console.log(
    'footprints: ' +
      Object.entries(out)
        .map(([t, p]) => `${t}(${p.length})`)
        .join(', ')
  )
}
