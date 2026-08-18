import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { sanctuaryTies } from '@/lib/factions'
import type {
  CombatDeployable,
  CombatSelection,
  CombatSoldier,
  CombatVehicle,
  Continent,
  Facility
} from '@/lib/types'

/**
 * Renders a continent as SVG. The terrain comes from the client's own heightfield, split by depth
 * below the water plane: dry land is filled, the submerged-but-wadeable shelf is drawn as light
 * water, and anything too deep to stand in is left transparent (open ocean and inland deeps alike).
 * Lava pools and bridge spans overlay that, then each facility's sphere-of-influence coloured by
 * its current controlling empire, with a marker per facility.
 *
 * Coordinates: all terrain polygons and facility x/y are PSF world units in [0, worldSize];
 * game Y is north-up, so screen Y is flipped (worldSize - y).
 */

/** Build an SVG path 'd' from world-coord polygon loops, flipping y for screen. */
function polysToPath(polys: [number, number][][], size: number): string {
  let d = ''
  for (const loop of polys) {
    if (loop.length < 3) continue
    d += `M${loop[0][0]} ${size - loop[0][1]}`
    for (let k = 1; k < loop.length; k++) d += `L${loop[k][0]} ${size - loop[k][1]}`
    d += 'Z'
  }
  return d
}

const FACTION: Record<number, { solid: string; soi: string; label: string }> = {
  0: { solid: '#e8472f', soi: 'rgba(200,47,28,0.20)', label: 'TR' },
  1: { solid: '#2f7fe8', soi: 'rgba(5,56,163,0.22)', label: 'NC' },
  2: { solid: '#8b5cf6', soi: 'rgba(84,49,214,0.24)', label: 'VS' }
}
const NEUTRAL = { solid: '#4d7fa3', soi: 'rgba(77,127,163,0.10)', label: '—' }

/**
 * Warpgate / geowarp tint. Recovered from planetside.exe: the empire switch (0x0053f324, 0x007207c4)
 * gives TR 0xFFFF3030, NC 0xFF3030FF, VS 0xFFFF00FF, and falls through for empire 3 (NEUTRAL) to the
 * global at 0xd0f9c4, which is assembled byte-wise at 0x007ebcc0 to 0xFF00FFFF -- i.e. cyan.
 */
const NEUTRAL_GROUND = { solid: '#00FFFF', soi: 'rgba(0,255,255,0.12)', label: 'Neutral' }

function factionOf(id: number, control: Record<number, number>) {
  const f = control[id]
  return f !== undefined && FACTION[f] ? FACTION[f] : NEUTRAL
}

const MARKER_R: Record<Facility['category'], number> = {
  major: 70,
  tower: 34,
  warpgate: 60,
  minor: 44
}

/**
 * Click precedence for overlapping markers, lowest painted first. Warpgates cover a huge area, so
 * without this they would swallow clicks meant for anything sitting inside them.
 */
const SELECT_ORDER: Facility['category'][] = ['warpgate', 'minor', 'major', 'tower']

/**
 * How far the ground tint is held back from the water's edge, in PlanetSide world units (metres).
 * Biome colour stopping short of the shoreline keeps the coastline itself legible instead of being
 * painted over. Applies to every coast and inland lake edge, on every map.
 */
const COAST_SETBACK = 10

/** Colours for the pulsing hotspot marker: a dim gold, matching the zone-list star. */
const HOTSPOT_FILL = '#d1a63a'
const HOTSPOT_EDGE = '#856615'

/**
 * Combat entity footprints are the real models at world scale, which is correct but leaves a soldier
 * (~0.3 units) invisible on a 4096-unit continent. Each entity class therefore gets a minimum
 * on-screen extent, expressed as a fraction of the map size; a footprint smaller than that is scaled
 * up about its own centre until it reaches it. Anything already larger (every vehicle) draws 1:1.
 */
const MIN_EXTENT = { soldier: 0.006, vehicle: 0.006, deployable: 0.005 } as const

/**
 * A model-local footprint placed at (x, y) facing `yaw`, as an SVG transform. Mirrors the matrix the
 * facility/terminal footprints use (rotate about +Z, then flip Y into screen space), with a uniform
 * scale `k` about the model origin so tiny entities stay legible.
 */
function footprintTransform(x: number, screenY: number, yaw: number, k: number): string {
  const th = (yaw * Math.PI) / 180
  const cs = Math.cos(th) * k
  const sn = Math.sin(th) * k
  return `matrix(${cs} ${-sn} ${-sn} ${-cs} ${x} ${screenY})`
}

/**
 * Points for the eight-spike hotspot flash centred on an already-screen-space (cx, cy), sized by an
 * outer radius in world units (inner radius is the same 7:30 ratio the standalone icon uses).
 */
function hotspotPoints(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.42
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 8
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
}

function selectRank(f: Facility): number {
  // Geowarps/cavern gates share the 'warpgate' category with real warpgates but must sit ABOVE them,
  // so rank them with the 'minor' band.
  const cat: Facility['category'] =
    f.category === 'warpgate' && f.type !== 'warpgate' ? 'minor' : f.category
  const i = SELECT_ORDER.indexOf(cat)
  return i < 0 ? 0 : i
}

/**
 * Lattice link colours, taken verbatim from the client's link-tint routine at 0x0071e1b0 (ARGB, all
 * at alpha 0xd0). The routine takes both endpoint empires, a per-endpoint state value, and the
 * VIEWING player's empire (0x004ac1a0, which returns 3/NEUTRAL when there is no local player), then:
 *
 *   endpoints same empire  -> that empire's colour (grey if the empire isn't TR/NC/VS)
 *   endpoints differ       -> grey, UNLESS the viewer's own empire owns one end, which yields yellow
 *   a flag on the link     -> forced green, overriding all of the above (set at 0x0071df20 from
 *                             `flags & 8` on the link's state object -- runtime-only)
 *
 * The portal is an unaffiliated observer, i.e. the viewer empire is NEUTRAL. Under that input the
 * client's own rule reduces to "same empire -> empire colour, otherwise grey", which is what we draw.
 * Yellow needs a viewing empire and green needs live link state, so neither is reachable here; they
 * are kept for reference rather than guessed at.
 */
const LATTICE_COLOUR = {
  0: '#ED0000', // TR   0xd0ed0000
  1: '#0404FF', // NC   0xd00404ff
  2: '#9400CB', // VS   0xd09400cb
  grey: '#CBCBCB', // 0xd0cbcbcb -- mixed/unowned
  yellow: '#FFFF00', // 0xd0ffff00 -- viewer's empire holds one end
  green: '#6EDE4C' // 0xd06ede4c -- link-state flag override
} as const

/** Alpha the client draws links at (0xd0). */
const LATTICE_ALPHA = 0xd0 / 255

/** Warpgates and geowarps are neutral ground regardless of who holds the surrounding territory. */
const NEUTRAL_TYPES = new Set(['warpgate', 'warpgate_small', 'warpgate_cavern', 'hst'])

/**
 * Gate tints, from the client's own map palette (empire switch at 0x0053f324 / 0x007207c4, with the
 * NEUTRAL fallback assembled at 0x007ebcc0). A warpgate wired to a sanctuary takes that sanctuary's
 * empire colour; everything else stays neutral cyan.
 */
const GATE_EMPIRE = {
  0: { solid: '#FF3030', soi: 'rgba(255,48,48,0.12)', label: 'TR Sanctuary' },
  1: { solid: '#3030FF', soi: 'rgba(48,48,255,0.12)', label: 'NC Sanctuary' },
  2: { solid: '#FF00FF', soi: 'rgba(255,0,255,0.12)', label: 'VS Sanctuary' }
} as const

/**
 * On-map height for the monolith side profile, in world units. The real slab is ~8.9 tall, which is
 * under a pixel at whole-continent zoom, so it has to be enlarged to be seen at all -- but only just.
 * Everything else on the map draws at true scale (a tower is ~43-49 across, a facility ~250), so this
 * is kept in the towers' size band: the monolith reads as the small landmark it is rather than as
 * something the size of a base.
 */
const MONOLITH_HEIGHT = 60

/** What each sanctuary terminal spawns, for its tooltip. */
const TERMINAL_LABEL: Record<string, string> = {
  ground: 'Ground vehicle terminal',
  air: 'Air vehicle terminal',
  bfr: 'BFR terminal'
}

/** Zoom limits for the map's pan/zoom mode. 1 is "the whole zone", the framing the map opens at. */
const MIN_ZOOM = 1
const MAX_ZOOM = 16
/** Pointer travel, in screen px, past which a drag is a pan rather than a click on a facility. */
const DRAG_SLOP = 4

/** Full bounds of model-local polygons. */
function polyBounds(polys: [number, number][][]) {
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  for (const loop of polys) {
    for (const [x, y] of loop) {
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
  }
  return { mnX, mxX, mnY, mxY }
}

/** Bounds of a set of model-local polygons, used to normalise footprint size. */
function polyExtent(polys: [number, number][][]): number {
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
  for (const loop of polys) {
    for (const [x, y] of loop) {
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
  }
  if (!isFinite(mnX)) return 0
  return Math.max(mxX - mnX, mxY - mnY)
}

/** Path 'd' for model-local polygons, in model space (no y-flip -- the placement matrix handles it). */
function localPolysToPath(polys: [number, number][][]): string {
  let d = ''
  for (const loop of polys) {
    if (loop.length < 3) continue
    d += `M${loop[0][0]} ${loop[0][1]}`
    for (let k = 1; k < loop.length; k++) d += `L${loop[k][0]} ${loop[k][1]}`
    d += 'Z'
  }
  return d
}


/**
 * Ground tints. These are muted, theme-consistent colours -- not sampled from the game's textures --
 * chosen so grass reads green, sand tan, rock grey and so on while still sitting in the map's dark
 * palette. The biome family picks the variant: `desert_grass` is scrub, not lawn, so a desert
 * continent's grass tints dry olive rather than the earth palette's green.
 */
const GROUND_TINT: Record<string, Record<string, string>> = {
  // Every value is a hue-shift of the map's own land colour (#1b2530) at roughly the same darkness,
  // so the ground reads as grass/sand/rock without breaking out of the map's cool, desaturated look.
  earth: {
    default: '#1b2530', grass: '#1e2c2c', trees: '#1b2a26', sand: '#272a2a',
    rock: '#232833', dirt: '#24272a', snow: '#28323c', shore: '#1f2f3a'
  },
  desert: {
    default: '#23262a', grass: '#262a26', trees: '#212722', sand: '#2c2a26',
    rock: '#26272a', dirt: '#292723', snow: '#28323c', shore: '#212b32'
  },
  arctic: {
    default: '#1e2833', grass: '#1f2b30', trees: '#1c2830', sand: '#242c33',
    rock: '#222b35', dirt: '#212a31', snow: '#2b3947', shore: '#223440'
  },
  volcanic: {
    default: '#22242a', grass: '#232821', trees: '#1f2420', sand: '#2a2724',
    rock: '#262428', dirt: '#272320', snow: '#28323c', shore: '#232a2e'
  }
}

export function ContinentMap({
  continent,
  footprints,
  lattice,
  gateNames,
  control,
  gateEmpire,
  hotspots,
  players,
  combat,
  onEntityClick,
  onMapClick,
  aimRing,
  selectedEntity,
  selectedId,
  onSelect,
  onFacilityContextMenu,
  hideZoom = false
}: {
  continent: Continent
  /** Per-facility-type building outlines, in model-local world units. */
  footprints?: Record<string, [number, number][][]>
  /** Live facility lattice from the server, as pairs of building names. */
  lattice?: [string, string][]
  /** Gate raw name -> live destination label, so gates aren't titled by a stale link. */
  gateNames?: Record<string, string>
  /**
   * Warpgate raw name (lowercased) -> the empire on the far side of its connection: the sanctuary's
   * empire if it links to a sanctuary, otherwise the empire holding the paired warpgate's gateway
   * facility on the other continent. Used to colour the warpgate -> first-facility lattice link.
   */
  gateEmpire?: Record<string, 0 | 1 | 2>
  control: Record<number, number>
  /** Live combat hotspots as world-coordinate [x, y]; painted as pulsing markers on the map. */
  hotspots?: [number, number][]
  /** Live players (admin-only): world x/y, facing yaw (deg), faction id, name; drawn as arrows. */
  players?: { x: number; y: number; facing: number; faction: number; name: string }[]
  /** Combat snapshot entities to plot (already filtered by the caller); each is clickable. */
  combat?: {
    soldiers: CombatSoldier[]
    vehicles: CombatVehicle[]
    deployables: CombatDeployable[]
  }
  /** Click handler for a combat entity marker. */
  onEntityClick?: (sel: CombatSelection) => void
  /**
   * Aiming mode: when set, a click anywhere reports the WORLD coordinate under the cursor. Setting
   * it also switches the cursor to a crosshair, so the map reads as armed rather than draggable.
   */
  onMapClick?: (x: number, y: number) => void
  /** A world-coordinate circle to draw over the map, for showing where a strike would land. */
  aimRing?: { x: number; y: number; radius: number }
  /** The currently selected combat entity, as `${kind}:${guid}`, drawn with a highlight ring. */
  selectedEntity?: string
  selectedId?: number
  onSelect?: (id: number) => void
  /** Right-click on a facility. Given the facility and the DOM event (for menu placement). */
  onFacilityContextMenu?: (facility: Facility, event: React.MouseEvent) => void
  /** Hide the pan/zoom control (for compact previews and the admin control modal). */
  hideZoom?: boolean
}) {
  // SVG ids resolve document-wide, and the admin pages render every continent at once -- without a
  // per-instance suffix every map after the first would reference the FIRST map's mask and filters,
  // clipping its ground tint to the wrong continent's silhouette.
  const uid = useId().replace(/:/g, '')
  const ids = {
    coastGlow: `coast-glow-${uid}`,
    lavaGlow: `lava-glow-${uid}`,
    landInset: `land-inset-${uid}`
  }

  const size = continent.terrain.worldSize
  const flipY = (y: number) => size - y

  const landPath = useMemo(
    () => polysToPath(continent.terrain.land, size),
    [continent.terrain.land, size]
  )
  const shallowPath = useMemo(
    () => polysToPath(continent.terrain.shallow ?? [], size),
    [continent.terrain.shallow, size]
  )
  const lavaPath = useMemo(
    () => polysToPath(continent.terrain.lava ?? [], size),
    [continent.terrain.lava, size]
  )
  const roadPath = useMemo(
    () => polysToPath(continent.terrain.roads ?? [], size),
    [continent.terrain.roads, size]
  )
  const pillarPath = useMemo(
    () => polysToPath(continent.terrain.pillars ?? [], size),
    [continent.terrain.pillars, size]
  )
  // Bridge polylines (open, not closed) linking landmasses over water.
  const bridgePath = useMemo(() => {
    let d = ''
    for (const line of continent.terrain.bridges ?? []) {
      if (line.length < 2) continue
      d += `M${line[0][0]} ${size - line[0][1]}`
      for (let k = 1; k < line.length; k++) d += `L${line[k][0]} ${size - line[k][1]}`
    }
    return d
  }, [continent.terrain.bridges, size])

  // Paint order decides BOTH stacking and which marker wins a click on overlap: SVG hit-tests the
  // last-painted element first. Required precedence (topmost first) is tower > facility > geowarp >
  // warpgate, so paint in the reverse of that. Ties fall back to the larger SOI first so bigger
  // shapes sit under smaller ones of the same kind.
  const facilities = useMemo(
    () =>
      [...continent.facilities].sort(
        (a, b) => selectRank(a) - selectRank(b) || b.soi - a.soi
      ),
    [continent.facilities]
  )

  // Ground tint as flat filled regions -- one path per biome class, each a single solid colour with
  // a hard edge. Drawn on the land, clipped to it.
  const biomePaths = useMemo(() => {
    const t = continent.terrain
    const pal = GROUND_TINT[t.biomeFamily] ?? GROUND_TINT.earth
    return Object.entries(t.biomeRegions ?? {})
      .map(([cls, polys]) => ({ cls, fill: pal[cls] ?? pal.default, d: polysToPath(polys, size) }))
      .filter((b) => b.d)
  }, [continent.terrain, size])

  // Monolith markers: the model's SIDE profile, drawn upright with its base at the monolith's
  // position. Not rotated by yaw -- it is an elevation view used as a mark, not a footprint.
  const monoliths = useMemo(() => {
    const polys = footprints?.monolith
    const list = continent.terrain.monoliths ?? []
    if (!polys?.length || !list.length) return []
    const { mnX, mxX, mnY, mxY } = polyBounds(polys)
    const h = mxY - mnY
    if (h <= 0) return []
    const k = MONOLITH_HEIGHT / h
    const cu = (mnX + mxX) / 2
    const d = localPolysToPath(polys)
    return list.map((m) => ({
      ...m,
      d,
      transform: `matrix(${k} 0 0 ${-k} ${m.x - cu * k} ${flipY(m.y) + mnY * k})`
    }))
  }, [footprints, continent.terrain.monoliths, size])

  // Lattice links: the server sends building NAMES, resolved here against the facility layout, then
  // tinted by the client's rule (see LATTICE_COLOUR). Grouped by colour so this stays a couple of
  // paths rather than one per link.
  const latticePaths = useMemo(() => {
    if (!lattice?.length) return []
    const byName = new Map(
      continent.facilities.map((f) => [String(f.rawName ?? f.name).toLowerCase(), f])
    )
    const isGate = (f: Facility) => NEUTRAL_TYPES.has(f.type)
    /** The empire on the far side of a warpgate's connection (sanctuary, or the paired continent). */
    const connectionEmpire = (g: Facility) => gateEmpire?.[String(g.rawName ?? g.name).toLowerCase()]

    const byColour = new Map<string, string>()
    for (const [a, b] of lattice) {
      const fa = byName.get(String(a).toLowerCase())
      const fb = byName.get(String(b).toLowerCase())
      if (!fa || !fb) continue

      let colour: string
      if (isGate(fa) !== isGate(fb)) {
        // Warpgate -> first facility. A warpgate has no empire of its own, so the link is coloured by
        // whether the facility is held by the empire the gate CONNECTS to (its sanctuary, or the
        // paired gateway facility on the other continent). If they match, the empire's colour; the
        // chain is "unbroken". Otherwise grey.
        const gate = isGate(fa) ? fa : fb
        const fac = isGate(fa) ? fb : fa
        const ce = connectionEmpire(gate)
        const ef = control[fac.id] ?? 3
        colour = ce !== undefined && ef === ce ? LATTICE_COLOUR[ce] : LATTICE_COLOUR.grey
      } else if (isGate(fa) && isGate(fb)) {
        // Gate-to-gate on the same continent (unusual): no facility empire to key on.
        colour = LATTICE_COLOUR.grey
      } else {
        // Facility-to-facility: the client's rule -- same empire both ends, or grey. NEUTRAL(3) reads
        // as unowned exactly as the client's GetEmpire would.
        const ea = control[fa.id] ?? 3
        const eb = control[fb.id] ?? 3
        colour =
          ea === eb && (ea === 0 || ea === 1 || ea === 2)
            ? LATTICE_COLOUR[ea as 0 | 1 | 2]
            : LATTICE_COLOUR.grey
      }
      byColour.set(colour, (byColour.get(colour) ?? '') + `M${fa.x} ${size - fa.y}L${fb.x} ${size - fb.y}`)
    }
    return [...byColour].map(([colour, d]) => ({ colour, d }))
  }, [lattice, continent.facilities, control, size, gateEmpire])

  // Capitol force domes: the pyramidal barrier's ground perimeter, tinted by whoever currently holds
  // the base it shields. Purely an indicator -- see the pointer-events note where it is drawn.
  const domes = useMemo(() => {
    return (continent.terrain.domes ?? []).map((dome) => {
      const col =
        dome.facilityId === null ? NEUTRAL : factionOf(dome.facilityId, control)
      const d =
        dome.ring.length < 3
          ? ''
          : `M${dome.ring[0][0]} ${size - dome.ring[0][1]}` +
            dome.ring.slice(1).map(([x, y]) => `L${x} ${size - y}`).join('') +
            'Z'
      return { d, col }
    }).filter((x) => x.d)
  }, [continent.terrain.domes, control, size])

  // Frame the view on what the zone actually occupies rather than its nominal map box. A continent
  // fills its 8192 square, but a battle island's tile grid sits in one corner of a 3072 map and a
  // cavern in another, so keying the viewBox to the map size alone pushes them off to a corner.
  // Bounds are taken in screen space (y already flipped) over the terrain plus every SOI disc.
  const view = useMemo(() => {
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity
    const add = (x: number, y: number) => {
      if (x < mnX) mnX = x
      if (x > mxX) mxX = x
      if (y < mnY) mnY = y
      if (y > mxY) mxY = y
    }
    const t = continent.terrain
    for (const set of [t.land, t.shallow, t.lava ?? [], t.pillars ?? []]) {
      for (const loop of set) for (const [x, y] of loop) add(x, size - y)
    }
    for (const f of continent.facilities) {
      add(f.x - f.soi, size - f.y - f.soi)
      add(f.x + f.soi, size - f.y + f.soi)
    }
    if (!isFinite(mnX)) return { x: 0, y: 0, w: size }

    // Square it off around the centre, with a small breathing margin.
    const cx = (mnX + mxX) / 2
    const cy = (mnY + mxY) / 2
    const w = Math.max(mxX - mnX, mxY - mnY) * 1.04 || size
    return { x: cx - w / 2, y: cy - w / 2, w }
  }, [continent, size])

  // Which local warpgates are currently wired to a sanctuary (live links only -- see the helper).
  const sanctuaryTie = useMemo(
    () => sanctuaryTies(lattice, continent.zoneId),
    [lattice, continent.zoneId]
  )

  // Radius of the circle each GATE's geometry occupies, measured from its own footprint. Used as the
  // click target so a gate is selectable across the area it visually covers, without its SOI (302
  // units for a warpgate) hijacking clicks on facilities and towers nearby.
  const hitRadius = useMemo(() => {
    const out: Record<string, number> = {}
    for (const type of NEUTRAL_TYPES) {
      const polys = footprints?.[type]
      if (!polys?.length) continue
      const extent = polyExtent(polys)
      if (extent > 0) out[type] = extent / 2
    }
    return out
  }, [footprints])

  // One path + scale per facility type, reused by every instance of that type.
  const shapes = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [type, polys] of Object.entries(footprints ?? {})) {
      if (!polyExtent(polys)) continue
      out[type] = localPolysToPath(polys)
    }
    return out
  }, [footprints])

  /**
   * A gate's stored name records the link it shipped with, which the server may since have rewired,
   * so prefer the sanctuary the live lattice actually reports.
   */
  const labelFor = (f: Facility) => {
    const live = gateNames?.[String(f.rawName ?? f.name).toLowerCase()]
    if (live) return live
    // See ContinentModal: an unlinked gate should not advertise a stale destination.
    return f.type === 'warpgate' ? 'Warpgate' : f.name
  }

  // Which of this zone's gates the live lattice actually wires to a destination: any gate whose
  // `<zoneId>/<name>` appears as an endpoint of a cross-zone lattice link. Derived from the lattice
  // itself so gate dashing is correct even when the caller doesn't pass resolved gate labels (the
  // admin maps don't) -- otherwise every gate would read as unwired.
  const linkedGates = useMemo(() => {
    const zoneId = continent.zoneId
    const set = new Set<string>()
    const prefix = `${zoneId}/`
    for (const link of lattice ?? []) {
      for (const end of link) {
        if (typeof end === 'string' && end.startsWith(prefix)) {
          set.add(end.slice(prefix.length).toLowerCase())
        }
      }
    }
    return set
  }, [lattice, continent.zoneId])

  /** A gate is "linked" when the live lattice pairs it with a destination we could resolve. */
  const isLinked = (f: Facility) => {
    if (!NEUTRAL_TYPES.has(f.type)) return true
    const raw = String(f.rawName ?? f.name).toLowerCase()
    return gateNames?.[raw] !== undefined || linkedGates.has(raw)
  }

  /** Gates are neutral ground unless wired to a sanctuary; everything else takes its owner's colour. */
  const colourFor = (f: Facility) => {
    // A sanctuary has no rows in the control feed -- Zones.scala hands the whole zone to its empire
    // on load -- so its structures take that empire's colour directly, gates included.
    if (continent.empire !== null && continent.empire !== undefined) {
      return NEUTRAL_TYPES.has(f.type)
        ? GATE_EMPIRE[continent.empire]
        : FACTION[continent.empire] ?? NEUTRAL
    }
    if (!NEUTRAL_TYPES.has(f.type)) return factionOf(f.id, control)
    const tie = sanctuaryTie[String(f.rawName ?? f.name).toLowerCase()]
    return tie === undefined ? NEUTRAL_GROUND : GATE_EMPIRE[tie]
  }

  // --- pan / zoom ------------------------------------------------------------------------------
  // Off by default: the map is normally a whole-zone overview, and a wheel over it should scroll the
  // modal, not zoom. Turning the control on takes over the wheel and makes the map draggable.
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [navOn, setNavOn] = useState(false)
  /** Optional faint elevation contour overlay; off by default. */
  const [showElev, setShowElev] = useState(false)

  const contoursPath = useMemo(() => {
    const segs = continent.terrain.contours
    if (!segs?.length) return ''
    let d = ''
    for (const [a, b] of segs) d += `M${a[0]} ${size - a[1]}L${b[0]} ${size - b[1]}`
    return d
  }, [continent.terrain.contours, size])
  /** Viewport override while navigating: zoom factor plus the view-space point held at centre. */
  const [nav, setNav] = useState<{ scale: number; cx: number; cy: number } | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  /** Set once a pointer has travelled far enough to be a pan, so the release does not also select. */
  const dragged = useRef(false)

  // The box actually rendered. Without a nav override this is exactly the fitted view.
  const box = useMemo(() => {
    if (!nav) return { x: view.x, y: view.y, w: view.w }
    const w = view.w / nav.scale
    return { x: nav.cx - w / 2, y: nav.cy - w / 2, w }
  }, [view, nav])

  /** Keep the visible box inside the fitted view, so the zone can never be panned off-screen. */
  const clampCentre = (cx: number, cy: number, w: number): [number, number] => {
    const half = w / 2
    const lo = (min: number, max: number, v: number) => (min > max ? (min + max) / 2 : Math.min(Math.max(v, min), max))
    return [
      lo(view.x + half, view.x + view.w - half, cx),
      lo(view.y + half, view.y + view.w - half, cy)
    ]
  }

  // Wheel is bound natively rather than through React so it can be non-passive -- a passive listener
  // cannot preventDefault, and without that the page scrolls while the map zooms.
  useEffect(() => {
    const el = svgRef.current
    if (!el || !navOn) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const u = (e.clientX - rect.left) / rect.width
      const v = (e.clientY - rect.top) / rect.height
      setNav((cur) => {
        const scale = cur?.scale ?? 1
        const cx = cur?.cx ?? view.x + view.w / 2
        const cy = cur?.cy ?? view.y + view.w / 2
        const w = view.w / scale
        // The world point under the cursor, which must stay under the cursor after zooming.
        const px = cx - w / 2 + u * w
        const py = cy - w / 2 + v * w
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
        const nw = view.w / next
        const [ncx, ncy] = clampCentre(px - (u - 0.5) * nw, py - (v - 0.5) * nw, nw)
        return { scale: next, cx: ncx, cy: ncy }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [navOn, view])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!navOn) return
    dragged.current = false
    drag.current = { x: e.clientX, y: e.clientY }
    setGrabbing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dxPx = e.clientX - d.x
    const dyPx = e.clientY - d.y
    if (Math.abs(dxPx) + Math.abs(dyPx) > DRAG_SLOP) dragged.current = true
    d.x = e.clientX
    d.y = e.clientY
    setNav((cur) => {
      const scale = cur?.scale ?? 1
      const w = view.w / scale
      const cx = (cur?.cx ?? view.x + view.w / 2) - (dxPx / rect.width) * w
      const cy = (cur?.cy ?? view.y + view.w / 2) - (dyPx / rect.height) * w
      const [ncx, ncy] = clampCentre(cx, cy, w)
      return { scale, cx: ncx, cy: ncy }
    })
  }

  const endDrag = () => {
    drag.current = null
    setGrabbing(false)
  }

  /** Leaving the mode restores the fitted view, so the map is never left parked somewhere odd. */
  const toggleNav = () => {
    if (navOn) {
      setNav(null)
      endDrag()
    }
    setNavOn((on) => !on)
  }

  /** A facility click is swallowed when the pointer was dragging the map rather than picking. */
  const select = (id: number) => {
    if (dragged.current) return
    onSelect?.(id)
  }

  return (
    // Disable text selection: clicking, dragging (pan) and right-clicking on the map would otherwise
    // highlight the facility/label text inside the SVG.
    <div className="relative select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      {!hideZoom && contoursPath && (
        <button
          type="button"
          onClick={() => setShowElev((v) => !v)}
          aria-pressed={showElev}
          title={showElev ? 'Hide elevation contours' : 'Show elevation contours'}
          aria-label={showElev ? 'Hide elevation contours' : 'Show elevation contours'}
          className="absolute top-1 right-8 z-10 grid h-6 w-6 place-items-center rounded"
          style={{
            background: showElev ? 'var(--surface-raised)' : 'var(--background)',
            border: `1px solid ${showElev ? 'var(--border-active)' : 'var(--border)'}`,
            color: showElev ? 'var(--accent-primary)' : 'var(--text-muted)'
          }}
        >
          {/* stacked contour lines glyph */}
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.3}>
            <path d="M1 11c3-4 5-4 7 0s5 4 7 0" />
            <path d="M2 7c3-3.5 4-3.5 6 0s4 3.5 6 0" strokeOpacity="0.6" />
          </svg>
        </button>
      )}
      {!hideZoom && (
        <button
          type="button"
          onClick={toggleNav}
          aria-pressed={navOn}
          title={navOn ? 'Exit pan and zoom (restores full view)' : 'Pan and zoom'}
          aria-label={navOn ? 'Exit pan and zoom (restores full view)' : 'Pan and zoom'}
          className="absolute top-1 right-1 z-10 grid h-6 w-6 place-items-center rounded"
          style={{
            background: navOn ? 'var(--surface-raised)' : 'var(--background)',
            border: `1px solid ${navOn ? 'var(--border-active)' : 'var(--border)'}`,
            color: navOn ? 'var(--accent-primary)' : 'var(--text-muted)'
          }}
        >
          {/* magnifier over a move-cross: zoom and grab, in one 14px glyph */}
          <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="7" cy="7" r="4.2" />
            <path d="M10.2 10.2 L14 14" strokeLinecap="round" />
            <path d="M7 4.6v4.8M4.6 7h4.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <svg
      ref={svgRef}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.w}`}
      className="w-full h-auto"
      style={{
        background: 'var(--background)',
        maxHeight: '70vh',
        cursor: onMapClick ? 'crosshair' : navOn ? (grabbing ? 'grabbing' : 'grab') : undefined,
        touchAction: navOn ? 'none' : undefined
      }}
      onClick={
        onMapClick
          ? (e) => {
              // Screen -> SVG user space via the live CTM, so the result is correct at any zoom or
              // pan. SVG y runs the other way from world y (see flipY), hence the subtraction.
              const svg = svgRef.current
              const ctm = svg?.getScreenCTM()
              if (!svg || !ctm) return
              const pt = svg.createSVGPoint()
              pt.x = e.clientX
              pt.y = e.clientY
              const p = pt.matrixTransform(ctm.inverse())
              onMapClick(p.x, size - p.y)
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={`${continent.name} map`}
    >
      <defs>
        {/* subtle coastal falloff into the sea */}
        <filter id={ids.coastGlow} x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="0" stdDeviation={40} floodColor="#0a2a3a" floodOpacity="0.9" />
        </filter>
        {/* molten glow around lava pools */}
        <filter id={ids.lavaGlow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation={24} floodColor="#ff6a1a" floodOpacity="0.85" />
        </filter>
        {/* Ground tint is held back from the water's edge: the land is filled white, then the
            shoreline itself is stroked black at twice the setback so the inner half erases a
            COAST_SETBACK-wide band inside every coast and lake edge. Masking rather than clipping
            keeps the coastline stroke readable instead of being painted over by the biome fill. */}
        {landPath && (
          <mask id={ids.landInset} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
            <path d={landPath} fillRule="evenodd" fill="#fff" />
            <path
              d={landPath}
              fill="none"
              stroke="#000"
              strokeWidth={COAST_SETBACK * 2}
              strokeLinejoin="round"
            />
          </mask>
        )}
      </defs>

      {/* submerged-but-wadeable shelf: light water, drawn under the land it fringes */}
      {shallowPath && (
        <path d={shallowPath} fillRule="evenodd" fill="var(--shallow-fill, #3d7f9e)" opacity={0.75} />
      )}

      {/* landmass, with the ground tinted by biome class on top */}
      {landPath && (
        <>
          <path
            d={landPath}
            fillRule="evenodd"
            fill="var(--land-fill, #1b2530)"
            stroke="var(--land-coast, #5a6b78)"
            strokeWidth={10}
            strokeLinejoin="round"
            filter={`url(#${ids.coastGlow})`}
          />
          <g mask={`url(#${ids.landInset})`}>
            {biomePaths.map((b) => (
              <path key={b.cls} d={b.d} fillRule="evenodd" fill={b.fill} />
            ))}
          </g>
        </>
      )}

      {/* road network: faint surface detail, under every other overlay */}
      {roadPath && (
        <path d={roadPath} fillRule="evenodd" fill="var(--road-fill, #6b727a)" opacity={0.35} />
      )}

      {/* optional faint elevation contour lines, over the terrain and under everything else */}
      {showElev && contoursPath && (
        <path
          d={contoursPath}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth={0.6}
          strokeOpacity={0.35}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {/* faint reference grid, clipped to nothing fancy -- drawn over sea + land */}
      <g stroke="var(--border)" strokeWidth={3} opacity={0.18}>
        {Array.from({ length: 9 }, (_, i) => (i * size) / 8).map((p) => (
          <g key={p}>
            <line x1={p} y1={0} x2={p} y2={size} />
            <line x1={0} y1={p} x2={size} y2={p} />
          </g>
        ))}
      </g>

      {/* lava pools: orange molten edge-glow underneath, yellow-hot core on top */}
      {lavaPath && (
        <>
          <path
            d={lavaPath}
            fill="var(--lava-edge, #d1451b)"
            stroke="var(--lava-edge, #d1451b)"
            strokeWidth={40}
            filter={`url(#${ids.lavaGlow})`}
          />
          <path d={lavaPath} fill="var(--lava-core, #ffb52e)" />
        </>
      )}

      {/* cavern pillar / crystal formations -- drawn before the facilities so they never cover them */}
      {pillarPath && (
        <path
          d={pillarPath}
          fillRule="evenodd"
          fill="var(--crystal-fill, #7d6bd6)"
          fillOpacity={0.7}
          stroke="var(--crystal-edge, #b9a8ff)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* monoliths: side-profile marks standing at their map position */}
      {monoliths.map((m, i) => (
        <g key={`mono-${i}`}>
          <title>{m.name}</title>
          <path
            d={m.d}
            transform={m.transform}
            fill="var(--monolith, #c9bda0)"
            fillOpacity={0.9}
            stroke="var(--monolith, #c9bda0)"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      {/* bridges: light spans linking landmasses over water */}
      {bridgePath && (
        <path
          d={bridgePath}
          fill="none"
          stroke="var(--bridge, #c9b98f)"
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      )}

      {/* lattice: the capture-link network, under the facilities it joins. Non-scaling stroke so the
          links are a fixed on-screen width regardless of the zone's world size (a plain world-unit
          width would be ~0.4px on an 8192 continent -- effectively invisible). */}
      {latticePaths.map((l) => (
        <path
          key={`lat-${l.colour}`}
          d={l.d}
          fill="none"
          stroke={l.colour}
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={LATTICE_ALPHA}
        />
      ))}

      {/* capitol force domes: drawn over the facility, but pointer-events:none so the shape never
          intercepts a click -- the facility marker underneath stays fully clickable. */}
      {domes.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {domes.map((dm, i) => (
            <path
              key={`dome-${i}`}
              d={dm.d}
              fill={dm.col.solid}
              fillOpacity={0.14}
              stroke={dm.col.solid}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}

      {/* Sanctuary structures: the HART and the vehicle / dropship / spawn buildings. Drawn from the
          same model footprints as facilities and at the same true scale, but they are not capture
          points, so they take no SOI and no pointer events. */}
      {(continent.terrain.structures ?? []).length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {continent.terrain.structures.map((st, i) => {
            const shape = shapes[st.type]
            if (!shape) return null
            const th = ((st.yaw ?? 0) * Math.PI) / 180
            const cs = Math.cos(th)
            const sn = Math.sin(th)
            const col = FACTION[continent.empire ?? -1] ?? NEUTRAL
            return (
              <path
                key={`st-${i}`}
                d={shape}
                transform={`matrix(${cs} ${-sn} ${-sn} ${-cs} ${st.x} ${flipY(st.y)})`}
                fill={col.solid}
                fillOpacity={0.13}
                stroke={col.solid}
                strokeOpacity={0.55}
                strokeWidth={0.75}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </g>
      )}

      {/* SOI discs */}
      {facilities.map((f) => {
        const col = colourFor(f)
        return (
          <circle
            key={`soi-${f.id}`}
            cx={f.x}
            cy={flipY(f.y)}
            r={f.soi}
            fill={col.soi}
            stroke={col.solid}
            strokeWidth={selectedId === f.id ? 12 : 6}
            strokeOpacity={selectedId === f.id ? 1 : 0.7}
          />
        )
      })}

      {/* facility markers: the building's real above-ground outline where we have the model */}
      {facilities.map((f) => {
        const col = colourFor(f)
        const r = MARKER_R[f.category]
        const shape = shapes[f.type]
        // Place the model-local outline into world space AT TRUE SCALE: rotate by the facility's yaw
        // (degrees, about +Z) and flip Y for the screen. As one matrix: (mx,my) ->
        //   (fx + mx*cos - my*sin,  (size-fy) - mx*sin - my*cos)
        const th = ((f.yaw ?? 0) * Math.PI) / 180
        const cs = Math.cos(th)
        const sn = Math.sin(th)
        return (
          <g
            key={`m-${f.id}`}
            onClick={() => select(f.id)}
            onContextMenu={
              onFacilityContextMenu
                ? (e) => {
                    e.preventDefault()
                    onFacilityContextMenu(f, e)
                  }
                : undefined
            }
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <title>
              {labelFor(f)} — {f.type} ({col.label})
              {isLinked(f) ? '' : ' · no live link'}
            </title>
            {/* A gate's clickable area is the circle its geometry occupies -- NOT its SOI, which is
                far larger and would blanket everything nearby. Invisible, but pointer-events:all
                keeps an unpainted shape hit-testable. */}
            {hitRadius[f.type] !== undefined && (
              <circle
                cx={f.x}
                cy={flipY(f.y)}
                r={hitRadius[f.type]}
                fill="none"
                pointerEvents="all"
              />
            )}
            {shape ? (
              <path
                d={shape}
                transform={`matrix(${cs} ${-sn} ${-sn} ${-cs} ${f.x} ${flipY(f.y)})`}
                fill={col.solid}
                fillOpacity={0.18}
                stroke={col.solid}
                strokeWidth={0.75}
                strokeLinejoin="round"
                // A gate with no live link is drawn dashed, so a dormant connection is visible at a
                // glance rather than looking identical to an active one.
                strokeDasharray={isLinked(f) ? undefined : '4 3'}
                vectorEffect="non-scaling-stroke"
                // The near-transparent interior must stay selectable; `all` hit-tests the fill area
                // regardless of how faint it is painted.
                pointerEvents="all"
              />
            ) : (
              <circle
                cx={f.x}
                cy={flipY(f.y)}
                r={r}
                fill="var(--background)"
                stroke={col.solid}
                strokeWidth={10}
              />
            )}
            {f.category === 'major' && (
              <text
                x={f.x}
                y={flipY(f.y) - r - 20}
                textAnchor="middle"
                fontSize={90}
                fill="var(--text-secondary)"
                // A label is decoration, never a target. The enclosing <g> is clickable, so without
                // this the text swallows clicks meant for the map underneath -- and its legibility
                // halo is a 12px stroke, so the dead zone is far wider than the glyphs look. That is
                // what blocked placing an orbital strike anywhere near a facility name.
                pointerEvents="none"
                style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 12 }}
              >
                {f.name}
              </text>
            )}
          </g>
        )
      })}
      {/* Vehicle / air / BFR terminals, in the sanctuary's empire colour and distinguished by shape. */}
      {(continent.terrain.terminals ?? []).length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {continent.terrain.terminals.map((t, i) => {
            const shape = shapes[t.type]
            if (!shape) return null
            const col = FACTION[continent.empire ?? -1] ?? NEUTRAL
            const th = ((t.yaw ?? 0) * Math.PI) / 180
            const cs = Math.cos(th)
            const sn = Math.sin(th)
            return (
              <path
                key={`t-${i}`}
                d={shape}
                transform={`matrix(${cs} ${-sn} ${-sn} ${-cs} ${t.x} ${flipY(t.y)})`}
                fill={col.solid}
                fillOpacity={0.75}
                stroke={col.solid}
                strokeWidth={0.75}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>{TERMINAL_LABEL[t.kind] ?? t.kind}</title>
              </path>
            )
          })}
        </g>
      )}

      {/* Live combat hotspots: a dim-gold flash at each activity point, the whole layer pulsing in
          unison from opaque to transparent and back (~1.8s). Topmost so activity reads over the map. */}
      {hotspots && hotspots.length > 0 && (
        <g className="hotspot-pulse" style={{ pointerEvents: 'none' }}>
          {hotspots.map(([hx, hy], i) => (
            <polygon
              key={`hs-${i}`}
              points={hotspotPoints(hx, flipY(hy), size * 0.02)}
              fill={HOTSPOT_FILL}
              stroke={HOTSPOT_EDGE}
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            >
              <title>Combat hotspot</title>
            </polygon>
          ))}
        </g>
      )}

      {/* Live player arrows (admin-only): a faction-coloured arrowhead at each player, rotated to
          their facing. Uses the same rotate+Y-flip matrix as the terminal footprints. */}
      {players && players.length > 0 && (
        <g>
          {players.map((p, i) => {
            const A = size * 0.014
            const th = ((p.facing ?? 0) * Math.PI) / 180
            const cs = Math.cos(th)
            const sn = Math.sin(th)
            const col = FACTION[p.faction]?.solid ?? NEUTRAL.solid
            return (
              <polygon
                key={`pl-${i}`}
                points={`0,${-1.6 * A} ${-A},${A} 0,${0.35 * A} ${A},${A}`}
                transform={`matrix(${cs} ${-sn} ${-sn} ${-cs} ${p.x} ${flipY(p.y)})`}
                fill={col}
                stroke="#0b0f14"
                strokeWidth={0.9}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>{p.name ? `${p.name} (${FACTION[p.faction]?.label ?? '—'})` : 'Player'}</title>
              </polygon>
            )
          })}
        </g>
      )}

      {/* Combat snapshot entities (admin Combat view), drawn as the models' real top-down footprints
          at world scale and rotated to each entity's facing -- the same treatment facilities and
          terminals get. A footprint smaller than MIN_EXTENT is scaled up about its centre so soldiers
          and CE stay visible and clickable. Falls back to a small marker when a model is missing.
          Each entity is clickable; the selected one gets a white ring. Seated soldiers are omitted --
          they ride inside their vehicle's footprint. */}
      {combat && (
        <g>
          {combat.deployables.map((d) => {
            const polys = footprints?.[d.name]
            const cy = flipY(d.y)
            const col = FACTION[d.faction]?.solid ?? NEUTRAL.solid
            const min = size * MIN_EXTENT.deployable
            const ext = polys?.length ? polyExtent(polys) : 0
            const k = ext > 0 ? Math.max(1, min / ext) : 1
            const r = (ext > 0 ? ext * k : min) / 2
            return (
              <g
                key={`ce-${d.guid}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onEntityClick?.({ kind: 'deployable', guid: d.guid })
                }}
              >
                {selectedEntity === `deployable:${d.guid}` && (
                  <circle cx={d.x} cy={cy} r={r * 2} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {polys?.length ? (
                  <path
                    d={localPolysToPath(polys)}
                    transform={footprintTransform(d.x, cy, 0, k)}
                    fill={col}
                    fillOpacity={0.9}
                    stroke="#0b0f14"
                    strokeWidth={0.7}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{d.name}</title>
                  </path>
                ) : (
                  <rect
                    x={d.x - r}
                    y={cy - r}
                    width={r * 2}
                    height={r * 2}
                    transform={`rotate(45 ${d.x} ${cy})`}
                    fill={col}
                    stroke="#0b0f14"
                    strokeWidth={0.7}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{d.name}</title>
                  </rect>
                )}
              </g>
            )
          })}

          {combat.vehicles.map((v) => {
            const polys = footprints?.[v.name]
            const cy = flipY(v.y)
            const col = FACTION[v.faction]?.solid ?? NEUTRAL.solid
            const min = size * MIN_EXTENT.vehicle
            const ext = polys?.length ? polyExtent(polys) : 0
            const k = ext > 0 ? Math.max(1, min / ext) : 1
            const r = (ext > 0 ? ext * k : min) / 2
            return (
              <g
                key={`veh-${v.guid}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onEntityClick?.({ kind: 'vehicle', guid: v.guid })
                }}
              >
                {selectedEntity === `vehicle:${v.guid}` && (
                  <circle cx={v.x} cy={cy} r={r * 1.6} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
                {polys?.length ? (
                  <path
                    d={localPolysToPath(polys)}
                    transform={footprintTransform(v.x, cy, v.facing, k)}
                    fill={col}
                    fillOpacity={0.9}
                    stroke="#0b0f14"
                    strokeWidth={1}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{v.name}</title>
                  </path>
                ) : (
                  <polygon
                    points={`0,${-1.4 * r} ${r},${-0.3 * r} ${0.7 * r},${r} ${-0.7 * r},${r} ${-r},${-0.3 * r}`}
                    transform={footprintTransform(v.x, cy, v.facing, 1)}
                    fill={col}
                    stroke="#0b0f14"
                    strokeWidth={1}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{v.name}</title>
                  </polygon>
                )}
              </g>
            )
          })}

          {/* Infantry: a facing-aware chevron rather than a model footprint. The client's character
              records aren't posed for a top-down view (see FacilityFootprints.cs), and a real body is
              ~1 unit across -- sub-pixel on a 4096-unit map -- so a marker is both honest and more
              readable. MAX units draw larger and outlined white. */}
          {combat.soldiers
            .filter((s) => s.seated == null)
            .map((s) => {
              const cy = flipY(s.y)
              const col = FACTION[s.faction]?.solid ?? NEUTRAL.solid
              const r = (size * MIN_EXTENT.soldier * (s.max ? 1.45 : 1)) / 2
              return (
                <g
                  key={`sol-${s.guid}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEntityClick?.({ kind: 'soldier', guid: s.guid })
                  }}
                >
                  {selectedEntity === `soldier:${s.guid}` && (
                    <circle cx={s.x} cy={cy} r={r * 2} fill="none" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  )}
                  <polygon
                    points={`0,${-1.6 * r} ${-r},${r} 0,${0.35 * r} ${r},${r}`}
                    transform={footprintTransform(s.x, cy, s.facing, 1)}
                    fill={col}
                    stroke={s.max ? '#ffffff' : '#0b0f14'}
                    strokeWidth={s.max ? 1.3 : 0.9}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{s.max ? `${s.name} (MAX)` : s.name}</title>
                  </polygon>
                </g>
              )
            })}
        </g>
      )}

      {/* Where a pending orbital strike would land. The true blast is 10m or 20m across a continent
          several kilometres wide, so at any sane zoom it is sub-pixel: the real circle is drawn for
          honesty about scale, and a locator ring sized in screen space (a fraction of the current
          viewBox, so it holds still while zooming) is drawn around it so the spot can be found at
          all. Drawn last so nothing overlaps it. */}
      {aimRing && (() => {
        const cx = aimRing.x
        const cy = size - aimRing.y
        const locator = box.w * 0.018
        const arm = locator * 1.8
        return (
          <g pointerEvents="none">
            <circle
              cx={cx}
              cy={cy}
              r={aimRing.radius}
              fill="var(--accent-warning)"
              fillOpacity={0.35}
              stroke="var(--accent-warning)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={cx}
              cy={cy}
              r={locator}
              fill="none"
              stroke="var(--accent-warning)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`M${cx - arm} ${cy}h${arm * 2}M${cx} ${cy - arm}v${arm * 2}`}
              stroke="var(--accent-warning)"
              strokeWidth={1}
              strokeOpacity={0.75}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })()}
      </svg>
    </div>
  )
}
