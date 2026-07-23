// Build the portal's static continent data from two sources:
//   - terrain grids exported by raxicore-editor's ContinentExport tool
//     (per-continent { cols, rows, cell, worldSize, water[], sections[] })
//   - facility placements from PSF-LoginServer's zonemaps
//     (per-object { Id, ObjectName, ObjectType, AbsX, AbsY, Yaw })
//
// Output: static/continents/mapNN.json (terrain + facilities) and index.json.
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

// The ten overworld continents: game zone number, map base, display name.
// (PointOfInterest.scala; zone number N == mapNN for the overworld.)
const CONTINENTS = [
  { number: 1, base: 'map01', name: 'Solsar' },
  { number: 2, base: 'map02', name: 'Hossin' },
  { number: 3, base: 'map03', name: 'Cyssor' },
  { number: 4, base: 'map04', name: 'Ishundar' },
  { number: 5, base: 'map05', name: 'Forseral' },
  { number: 6, base: 'map06', name: 'Ceryshen' },
  { number: 7, base: 'map07', name: 'Esamir' },
  { number: 8, base: 'map08', name: 'Oshur' },
  { number: 9, base: 'map09', name: 'Searhus' },
  { number: 10, base: 'map10', name: 'Amerish' }
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

// Coarse category for rendering/labels.
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
      name: o.ObjectName,
      type: o.ObjectType,
      category: category(o.ObjectType),
      x: o.AbsX,
      y: o.AbsY,
      yaw: o.Yaw,
      soi: SOI[o.ObjectType]
    }))

  const doc = {
    number: cont.number,
    base: cont.base,
    name: cont.name,
    terrain: {
      cols: terrain.cols,
      rows: terrain.rows,
      cell: terrain.cell,
      worldSize: terrain.worldSize,
      water: terrain.water,
      land: terrain.sections
    },
    facilities
  }

  writeFileSync(join(outDir, cont.base + '.json'), JSON.stringify(doc))
  index.push({ number: cont.number, base: cont.base, name: cont.name, facilities: facilities.length })
  console.log(`${cont.name.padEnd(10)} ${cont.base}  ${facilities.length} facilities, ${terrain.water.length} water cells`)
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2))
console.log(`\nwrote ${index.length} continents + index.json to static/continents/`)
