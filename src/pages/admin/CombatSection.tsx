import { useCallback, useEffect, useMemo, useState } from 'react'
import { ContinentMap } from '@/components/ContinentMap'
import { ActionMenu } from './ActionMenu'
import { ConstructionDialog } from './ConstructionDialog'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { factionById, factionClass } from '@/lib/factions'
import { useToast } from '@/state/ToastContext'
import type {
  CombatSelection,
  CombatSnapshot,
  Continent,
  ContinentSummary,
  ZoneGroup
} from '@/lib/types'

/** How often the grid re-checks ownership/lattice, and how often an open snapshot re-reads entities. */
const REFRESH_MS = 60_000

const SECTIONS: { group: ZoneGroup; label: string }[] = [
  { group: 'continent', label: 'Continents' },
  { group: 'island', label: 'Battle Islands' },
  { group: 'cavern', label: 'Caverns' },
  { group: 'sanctuary', label: 'Sanctuaries' }
]

/** Friendly names for the vehicle codenames the snapshot reports; unknowns are title-cased. */
const VEHICLE_NAMES: Record<string, string> = {
  ams: 'AMS',
  ant: 'ANT',
  apc_tr: 'Juggernaut',
  apc_nc: 'Juggernaut',
  apc_vs: 'Juggernaut',
  aurora: 'Aurora',
  battlewagon: 'Raider',
  dropship: 'Galaxy',
  flail: 'Flail',
  fury: 'Fury',
  galaxy_gunship: 'Galaxy Gunship',
  lodestar: 'Lodestar',
  liberator: 'Liberator',
  lightgunship: 'Reaver',
  lightning: 'Lightning',
  magrider: 'Magrider',
  mediumtransport: 'Deliverer',
  mosquito: 'Mosquito',
  prowler: 'Prowler',
  quadassault: 'Basilisk',
  quadstealth: 'Wraith',
  reaver: 'Reaver',
  router: 'Router',
  skyguard: 'Skyguard',
  switchblade: 'Switchblade',
  threemanheavybuggy: 'Marauder',
  thunderer: 'Thunderer',
  twomanheavybuggy: 'Enforcer',
  twomanhoverbuggy: 'Thresher',
  twomanassaultbuggy: 'Harasser',
  two_man_assault_buggy: 'Harasser',
  vanguard: 'Vanguard',
  vulture: 'Vulture'
}

function titleCase(codename: string): string {
  return codename.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function vehicleName(codename: string): string {
  return VEHICLE_NAMES[codename] ?? titleCase(codename)
}

const ROLE_LABEL: Record<string, string> = {
  pilot: 'pilot',
  driver: 'driver',
  gunner: 'gunner',
  passenger: 'passenger',
  max: 'MAX seat'
}

/**
 * The one-line role shown under a soldier's name. On foot -> "Soldier". Seated -> "<Vehicle> (role)".
 * A vehicle riding in a carrier's cargo (e.g. an AMS in a Lodestar) reads as "<Carrier> (Vehicle - <carried>)".
 */
function soldierSubtitle(guid: number, seated: number | null, snap: CombatSnapshot): string {
  if (seated == null) return 'Soldier'
  const vehicle = snap.vehicles.find((v) => v.guid === seated)
  if (!vehicle) return 'Soldier'
  const carrier = snap.vehicles.find((v) => v.cargo.some((c) => c.guid === vehicle.guid))
  if (carrier) return `${vehicleName(carrier.name)} (Vehicle - ${vehicleName(vehicle.name)})`
  const seat = vehicle.seats.find((s) => s.occupant?.guid === guid)
  const role = seat ? ROLE_LABEL[seat.role] ?? seat.role : 'passenger'
  return `${vehicleName(vehicle.name)} (${role})`
}

/**
 * Sub-categories the filters can isolate within each entity class.
 *
 * CE categories are the server's own DeployableCategory values (Deployable.scala), so they line up
 * with how the game groups engineering gear. Soldiers split by whether they're on foot, in a MAX, or
 * riding in a vehicle; vehicles split into ground and air (VehicleDefinition.CanFly), which is the
 * distinction that matters when reading a fight off the map.
 */
const CE_CATEGORIES = [
  'Boomers',
  'Mines',
  'SmallTurrets',
  'FieldTurrets',
  'Sensors',
  'TankTraps',
  'ShieldGenerators',
  'Telepads'
] as const

/** Pretty labels for the CE category keys. */
const CE_LABEL: Record<string, string> = {
  Boomers: 'Boomers',
  Mines: 'Mines',
  SmallTurrets: 'Small turrets',
  FieldTurrets: 'Field turrets',
  Sensors: 'Sensors',
  TankTraps: 'Tank traps',
  ShieldGenerators: 'Shield gens',
  Telepads: 'Telepads',
  None: 'Other'
}

/** Vehicle codenames that fly, so the map can split air from ground without another server field. */
const AIR_VEHICLES = new Set([
  'dropship',
  'galaxy_gunship',
  'liberator',
  'lightgunship',
  'lodestar',
  'mosquito',
  'vulture',
  'wasp',
  'phantasm'
])

type SoldierKind = 'foot' | 'max' | 'mounted'
type VehicleKind = 'ground' | 'air'

interface Filters {
  soldiers: boolean
  vehicles: boolean
  deployables: boolean
  factions: Set<number>
  soldierKinds: Set<SoldierKind>
  vehicleKinds: Set<VehicleKind>
  ceCategories: Set<string>
}

/**
 * Combat: pick a continent (capture state + lattice, no entities), then open it to load a live
 * snapshot of soldiers, vehicles and deployables. Filters on the right isolate categories/factions;
 * clicking an entity opens a detail card with its name and, for players, their seat context.
 */
export function CombatSection() {
  const [summaries, setSummaries] = useState<ContinentSummary[] | null>(null)
  const [continents, setContinents] = useState<Record<string, Continent>>({})
  const [footprints, setFootprints] = useState<Record<string, [number, number][][]>>({})
  const [control, setControl] = useState<Record<number, Record<number, number>>>({})
  const [lattices, setLattices] = useState<Record<string, [string, string][]>>({})
  const toast = useToast()

  const [openZone, setOpenZone] = useState<ContinentSummary | null>(null)
  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null)
  const [selected, setSelected] = useState<CombatSelection | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  /** Armed orbital strike waiting for the admin to click a target on the map. */
  const [aiming, setAiming] = useState<{ radius: number } | null>(null)
  /** Construction chosen from the menu, waiting for an empire to be picked. */
  const [constructing, setConstructing] = useState<{ kind: 'vehicle' | 'ams' | 'router' } | null>(null)
  /**
   * An armed placement waiting for map clicks. A Router needs two: the vehicle, then its telepad, so
   * `first` holds the Router's point while the second click is collected.
   */
  const [placing, setPlacing] = useState<
    { kind: string; label: string; faction: string; needsTelepad: boolean; first?: { x: number; y: number } } | null
  >(null)
  /** A continent-wide action that has been chosen but not yet password-confirmed. */
  const [pending, setPending] = useState<
    { action: string; prompt: string; x?: number; y?: number; radius?: number } | null
  >(null)
  const [filters, setFilters] = useState<Filters>({
    soldiers: true,
    vehicles: true,
    deployables: true,
    factions: new Set([0, 1, 2, 3]),
    soldierKinds: new Set<SoldierKind>(['foot', 'max', 'mounted']),
    vehicleKinds: new Set<VehicleKind>(['ground', 'air']),
    ceCategories: new Set<string>([...CE_CATEGORIES, 'None'])
  })

  // Static assets: the zone list, each map, and the shared building footprints.
  useEffect(() => {
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zone list unavailable'))))
      .then((list: ContinentSummary[]) => {
        setSummaries(list)
        return Promise.all(
          list.map((z) =>
            fetch(`/continents/${z.base}.json`)
              .then((r) => (r.ok ? r.json() : null))
              .then((c: Continent | null) => (c ? ([z.base, c] as const) : null))
          )
        )
      })
      .then((entries) => {
        const m: Record<string, Continent> = {}
        for (const e of entries) if (e) m[e[0]] = e[1]
        setContinents(m)
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load continents'))

    fetch('/continents/footprints.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFootprints)
      .catch(() => setFootprints({}))
  }, [])

  // Live ownership + lattice for the selection grid, on the 60s cadence.
  const loadGrid = useCallback(() => {
    api
      .get<{ control: Record<number, Record<number, number>> }>('/zones/control-all')
      .then((r) => setControl(r.control ?? {}))
      .catch(() => {})
    if (summaries)
      Promise.all(
        summaries.map((z) =>
          api
            .get<{ links: [string, string][] }>(`/continents/${z.zoneId}/lattice`)
            .then((r) => [z.zoneId, r.links ?? []] as const)
            .catch(() => [z.zoneId, [] as [string, string][]] as const)
        )
      ).then((pairs) => setLattices(Object.fromEntries(pairs)))
  }, [summaries])

  useEffect(() => {
    loadGrid()
    const timer = window.setInterval(loadGrid, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadGrid])

  // Entities for the open continent only -- fetched on open and refreshed on the 60s tick.
  const loadSnapshot = useCallback(() => {
    if (!openZone) return Promise.resolve()
    return api
      .get<CombatSnapshot>(`/zones/${openZone.zoneId}/combat`)
      .then((s) => setSnapshot(s))
      .catch(() => {})
  }, [openZone])

  useEffect(() => {
    if (!openZone) {
      setSnapshot(null)
      setSelected(null)
      return
    }
    loadSnapshot()
    const timer = window.setInterval(loadSnapshot, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [openZone, loadSnapshot])

  /**
   * Run one entity action against the world server, then re-read the snapshot rather than guessing
   * at the outcome -- a destroyed vehicle leaves a wreck, a kicked player takes a moment to go, and
   * the server is the only thing that knows what actually happened.
   */
  const runAction = useCallback(
    async (action: string) => {
      if (!openZone || !selected) return
      setActionBusy(true)
      try {
        const r = await api.post<{ message?: string }>(
          `/zones/${openZone.zoneId}/entities/${selected.guid}/action`,
          { action }
        )
        toast.success(r?.message?.trim() || 'Done')
        // The entity is usually gone now, so drop the selection instead of showing a stale panel.
        if (action !== 'kick') setSelected(null)
        await loadSnapshot()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setActionBusy(false)
      }
    },
    [openZone, selected, toast, loadSnapshot]
  )

  /**
   * Move a live player: a forced sanctuary recall, or a transfer to another continent.
   *
   * Targeted by NAME rather than guid, because that is what the world server's transfer endpoint
   * takes -- a guid only means anything inside one zone, and the player is about to leave it.
   * The selection is dropped afterwards: they are no longer in this snapshot.
   */
  const runTransfer = useCallback(
    async (name: string, to: string) => {
      setActionBusy(true)
      try {
        const r = await api.post<{ message?: string }>(
          `/players/${encodeURIComponent(name)}/transfer`,
          { to }
        )
        toast.success(r?.message?.trim() || 'Done')
        setSelected(null)
        await loadSnapshot()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Transfer failed')
      } finally {
        setActionBusy(false)
      }
    },
    [toast, loadSnapshot]
  )

  /**
   * Send a placement. Only x/y go over the wire -- the world server derives ground height and the
   * vehicle's attitude from the terrain, so the portal never needs to know either.
   */
  const sendPlacement = useCallback(
    async (
      kind: string,
      label: string,
      faction: string,
      at: { x: number; y: number },
      telepad?: { x: number; y: number }
    ) => {
      if (!openZone) return
      setActionBusy(true)
      try {
        const r = await api.post<{ message?: string }>(`/zones/${openZone.zoneId}/vehicles`, {
          kind,
          faction,
          x: Math.round(at.x),
          y: Math.round(at.y),
          ...(telepad ? { telepad_x: Math.round(telepad.x), telepad_y: Math.round(telepad.y) } : {})
        })
        toast.success(r?.message?.trim() || `Placed ${label}`)
        await loadSnapshot()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Placement failed')
      } finally {
        setActionBusy(false)
        setPlacing(null)
      }
    },
    [openZone, toast, loadSnapshot]
  )

  /** Fire the pending continent-wide action once the admin has re-entered their password. */
  const confirmPending = useCallback(
    async (password: string) => {
      if (!openZone || !pending) return
      setActionBusy(true)
      try {
        const r = await api.post<{ message?: string }>(`/zones/${openZone.zoneId}/action`, {
          action: pending.action,
          x: pending.x,
          y: pending.y,
          radius: pending.radius,
          password
        })
        toast.success(r?.message?.trim() || 'Done')
        setPending(null)
        setSelected(null)
        await loadSnapshot()
      } catch (e) {
        // Left open on failure -- a mistyped password should not mean re-arming the whole action.
        toast.error(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setActionBusy(false)
      }
    },
    [openZone, pending, toast, loadSnapshot]
  )

  /** Leaving the continent must not leave a strike armed or a confirmation half-open. */
  useEffect(() => {
    setAiming(null)
    setPending(null)
  }, [openZone])

  const enactItems = useMemo(
    () => [
      {
        label: 'Kill All',
        danger: true,
        onClick: () =>
          setPending({
            action: 'killall',
            prompt: `Kill every player on ${openZone?.name ?? 'this continent'}. This cannot be undone.`
          })
      },
      {
        label: 'Kick All',
        danger: true,
        onClick: () =>
          setPending({
            action: 'kickall',
            prompt: `Disconnect every player on ${openZone?.name ?? 'this continent'}. This cannot be undone.`
          })
      },
      // The game's two orbital strikes, the CR4 and CR5 Command Uplink Device calls. Aimed by
      // clicking the map; the confirmation only appears once a target is picked.
      ...[
        { radius: 10, cr: 'CR4' },
        { radius: 20, cr: 'CR5' }
      ].map(({ radius, cr }) => ({
        label: `Orbital Strike — ${cr} (${radius}m)`,
        danger: true,
        onClick: () => {
          setAiming({ radius })
          toast.info(`Click the map to aim the ${cr} orbital strike`)
        }
      }))
    ],
    [openZone, toast]
  )

  /**
   * Construction: put something into the world rather than change something already in it. Kept as its
   * own menu beside Enact because Enact's entries all act on what is already there, and mixing a
   * creation into a list of kills and captures invites the wrong click.
   */
  const constructItems = useMemo(
    () => [
      { label: 'Place Vehicle…', onClick: () => setConstructing({ kind: 'vehicle' }) },
      { label: '', onClick: () => {}, separator: true },
      { label: 'Place Deployed AMS…', onClick: () => setConstructing({ kind: 'ams' }) },
      { label: 'Place Deployed Router…', onClick: () => setConstructing({ kind: 'router' }) }
    ],
    []
  )

  const controlFor = (zoneNumber: number) => control[zoneNumber] ?? {}

  const grouped = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: (summaries ?? []).filter((z) => (z.group ?? 'continent') === s.group)
      })).filter((s) => s.items.length > 0),
    [summaries]
  )

  // The snapshot, narrowed to what the filters allow, is what actually gets drawn + listed.
  const filtered = useMemo(() => {
    if (!snapshot) return null
    const okF = (f: number) => filters.factions.has(f)
    const soldierKind = (s: { max: boolean; seated: number | null }): SoldierKind =>
      s.seated != null ? 'mounted' : s.max ? 'max' : 'foot'
    const vehicleKind = (v: { name: string }): VehicleKind =>
      AIR_VEHICLES.has(v.name) ? 'air' : 'ground'
    return {
      soldiers: filters.soldiers
        ? snapshot.soldiers.filter((s) => okF(s.faction) && filters.soldierKinds.has(soldierKind(s)))
        : [],
      vehicles: filters.vehicles
        ? snapshot.vehicles.filter((v) => okF(v.faction) && filters.vehicleKinds.has(vehicleKind(v)))
        : [],
      deployables: filters.deployables
        ? snapshot.deployables.filter(
            (d) => okF(d.faction) && filters.ceCategories.has(d.category || 'None')
          )
        : []
    }
  }, [snapshot, filters])

  /** Toggle one member of a Set-valued filter (factions, soldier kinds, vehicle kinds, CE categories). */
  function toggleIn<K extends 'factions' | 'soldierKinds' | 'vehicleKinds' | 'ceCategories'>(
    key: K,
    value: Filters[K] extends Set<infer T> ? T : never
  ) {
    setFilters((cur) => {
      const next = new Set(cur[key] as Set<unknown>)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return { ...cur, [key]: next } as Filters
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--accent-primary)' }}>
          Combat
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Select a continent to load a live snapshot of soldiers, vehicles and deployables. Snapshots
          refresh every 60 seconds.
        </p>
      </div>

      {!summaries ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="border p-2" style={{ borderColor: 'var(--border)' }}>
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="w-full" style={{ aspectRatio: '1 / 1' }} />
            </div>
          ))}
        </div>
      ) : (
        grouped.map((section) => (
          <div key={section.group} className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--text-muted)' }}>
              {section.label}
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {section.items.map((z) => {
                const cont = continents[z.base]
                if (!cont) return null
                return (
                  <Panel key={z.zoneId} title={z.name} accent="vs">
                    <button
                      type="button"
                      onClick={() => setOpenZone(z)}
                      className="block w-full text-left"
                      title={`Open combat snapshot for ${z.name}`}
                    >
                      <ContinentMap
                        continent={cont}
                        footprints={footprints}
                        control={controlFor(z.number)}
                        lattice={lattices[z.zoneId]}
                        hideZoom
                      />
                    </button>
                  </Panel>
                )
              })}
            </div>
          </div>
        ))
      )}

      {openZone && continents[openZone.base] && (
        <Modal
          title={`${openZone.name} — Combat`}
          onClose={() => setOpenZone(null)}
          wide
          leftPanel={
            <EntityList
              snapshot={snapshot}
              selected={selected}
              onSelect={setSelected}
            />
          }
          sidePanel={
            <div className="p-3">
              <CombatDetail
                selected={selected}
                snapshot={snapshot}
                busy={actionBusy}
                onAction={runAction}
                onTransfer={runTransfer}
                zones={summaries ?? []}
              />
            </div>
          }
        >
          <div className="flex gap-3 items-start">
            {/* live entity map */}
            <div className="min-w-0 flex-1">
              {/* Menu bar: everything here acts on the whole continent, not the selection. */}
              <div
                className="mb-2 flex items-center gap-2 border-b pb-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <ActionMenu label="Enact" items={enactItems} />
                <ActionMenu label="Construction" items={constructItems} />
                {aiming && (
                  <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent-warning)' }}>
                    Click the map to aim a {aiming.radius}m strike
                    <button
                      type="button"
                      onClick={() => setAiming(null)}
                      className="rounded border px-1.5 py-0.5 text-[10px]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              {/* The map is the point of this dialog, so it takes as much of the viewport as it can.
                  ContinentMap renders a SQUARE svg that fills its container's width, so setting the
                  width sets both dimensions: 90vh leaves a 5% margin above and below. The second term
                  stops it shoving the entity list and detail panel off-screen on a wide-but-short
                  window -- 34rem is those two panels plus the dialog's own padding. */}
              <div
                // The map svg is SQUARE (its viewBox is the zone's square extent) and fills its
                // container's width, so width alone sets both dimensions -- no height rule needed, and
                // trying to drive it by height instead just lets this box collapse.
                //
                // 84vh rather than 90 because the dialog's title bar and padding sit outside this box;
                // the whole dialog then lands near 90vh, leaving roughly 5% above and below. The second
                // term stops a wide-but-short window pushing the entity list and detail panel
                // off-screen -- 34rem is those two panels plus the dialog's own padding.
                // The svg fills its container's WIDTH but takes its height from its own layout, which
                // left it letterboxed inside a square box -- 605 wide but only 504 tall, so the map drew
                // at 70% of the viewport instead of 84%. Forcing both axes makes it fill the square, and
                // since its viewBox is square too there is no distortion.
                // ContinentMap's root is a positioned div (it holds the zoom buttons), so the svg is a
                // GRANDCHILD -- a direct-child selector silently matched nothing, which is why earlier
                // attempts left the map letterboxed at 70% of the viewport. Both levels need the height.
                className="[&>div]:h-full [&>div>svg]:h-full [&>div>svg]:w-full"
                style={{ width: 'min(84vh, calc(100vw - 34rem))', aspectRatio: '1 / 1' }}
              >
              {!snapshot ? (
                <Skeleton className="w-full" style={{ aspectRatio: '1 / 1' }} />
              ) : (
                <ContinentMap
                  continent={continents[openZone.base]}
                  footprints={footprints}
                  control={controlFor(openZone.number)}
                  lattice={lattices[openZone.zoneId]}
                  combat={filtered ?? undefined}
                  selectedEntity={selected ? `${selected.kind}:${selected.guid}` : undefined}
                  onEntityClick={(sel) => setSelected(sel)}
                  onMapClick={
                    placing
                      ? (x, y) => {
                          // A Router is useless without its telepad, so the first click sites the
                          // vehicle and the second sites the pad; both go in one request.
                          if (placing.needsTelepad && !placing.first) {
                            setPlacing({ ...placing, first: { x, y } })
                            toast.info('Now click where the telepad should go')
                            return
                          }
                          const at = placing.first ?? { x, y }
                          const pad = placing.first ? { x, y } : undefined
                          void sendPlacement(placing.kind, placing.label, placing.faction, at, pad)
                        }
                      : aiming
                      ? (x, y) => {
                          setPending({
                            action: 'strike',
                            x,
                            y,
                            radius: aiming.radius,
                            prompt: `Call in a ${aiming.radius}m orbital strike at ${Math.round(x)}, ${Math.round(y)} on ${openZone.name}. Everyone in the zone will see it land. This cannot be undone.`
                          })
                          setAiming(null)
                        }
                      : undefined
                  }
                  aimRing={
                    pending?.action === 'strike' && pending.x != null && pending.y != null
                      ? { x: pending.x, y: pending.y, radius: pending.radius ?? 10 }
                      : undefined
                  }
                />
              )}
              </div>
            </div>

            {/* filter panel: entity classes, their sub-categories, and empires */}
            <div className="w-44 shrink-0 space-y-3 overflow-y-auto text-sm" style={{ maxHeight: '70vh' }}>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                  Soldiers
                </div>
                <label className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={filters.soldiers}
                    onChange={(e) => setFilters((c) => ({ ...c, soldiers: e.target.checked }))}
                  />
                  <span>All soldiers</span>
                  <span className="ml-auto tabular-nums text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {snapshot ? snapshot.soldiers.length : 0}
                  </span>
                </label>
                {(
                  [
                    ['foot', 'On foot'],
                    ['max', 'MAX'],
                    ['mounted', 'In a vehicle']
                  ] as [SoldierKind, string][]
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 py-0.5 pl-4">
                    <input
                      type="checkbox"
                      disabled={!filters.soldiers}
                      checked={filters.soldierKinds.has(k)}
                      onChange={() => toggleIn('soldierKinds', k)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                  Vehicles
                </div>
                <label className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={filters.vehicles}
                    onChange={(e) => setFilters((c) => ({ ...c, vehicles: e.target.checked }))}
                  />
                  <span>All vehicles</span>
                  <span className="ml-auto tabular-nums text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {snapshot ? snapshot.vehicles.length : 0}
                  </span>
                </label>
                {(
                  [
                    ['ground', 'Ground'],
                    ['air', 'Air']
                  ] as [VehicleKind, string][]
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 py-0.5 pl-4">
                    <input
                      type="checkbox"
                      disabled={!filters.vehicles}
                      checked={filters.vehicleKinds.has(k)}
                      onChange={() => toggleIn('vehicleKinds', k)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                  CE
                </div>
                <label className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={filters.deployables}
                    onChange={(e) => setFilters((c) => ({ ...c, deployables: e.target.checked }))}
                  />
                  <span>All CE</span>
                  <span className="ml-auto tabular-nums text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {snapshot ? snapshot.deployables.length : 0}
                  </span>
                </label>
                {CE_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 py-0.5 pl-4">
                    <input
                      type="checkbox"
                      disabled={!filters.deployables}
                      checked={filters.ceCategories.has(c)}
                      onChange={() => toggleIn('ceCategories', c)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>{CE_LABEL[c] ?? c}</span>
                    <span className="ml-auto tabular-nums text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {snapshot ? snapshot.deployables.filter((d) => (d.category || 'None') === c).length : 0}
                    </span>
                  </label>
                ))}
              </div>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                  Empire
                </div>
                {[0, 1, 2, 3].map((f) => (
                  <label key={f} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={filters.factions.has(f)}
                      onChange={() => toggleIn('factions', f)}
                    />
                    <span>{factionById(f)?.key ?? 'NL'}</span>
                  </label>
                ))}
              </div>
            </div>

          </div>
        </Modal>
      )}

      {constructing && (
        <ConstructionDialog
          kind={constructing.kind}
          onCancel={() => setConstructing(null)}
          onArm={(kind, label, faction, needsTelepad) => {
            setConstructing(null)
            setAiming(null)
            setPlacing({ kind, label, faction, needsTelepad })
            toast.info(
              needsTelepad
                ? `Click the map to place the ${label}, then again for its telepad`
                : `Click the map to place the ${label}`
            )
          }}
        />
      )}

      {pending && (
        <ConfirmDialog
          prompt={pending.prompt}
          busy={actionBusy}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  )
}

/**
 * The always-docked "Entities" panel: everything currently on the continent, grouped. Every player is
 * listed even while mounted -- picking a mounted player selects the VEHICLE they're riding, since that
 * is the entity on the map and the thing an admin can act on.
 */
function EntityList({
  snapshot,
  selected,
  onSelect
}: {
  snapshot: CombatSnapshot | null
  selected: CombatSelection | null
  onSelect: (sel: CombatSelection) => void
}) {
  const isSel = (kind: CombatSelection['kind'], guid: number) =>
    selected?.kind === kind && selected?.guid === guid

  const Row = ({
    label,
    sub,
    kind,
    guid,
    faction
  }: {
    label: string
    sub?: string
    kind: CombatSelection['kind']
    guid: number
    faction: number
  }) => (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ kind, guid })}
        className="flex w-full items-baseline justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-[var(--surface-raised)]"
        style={{
          background: isSel(kind, guid) ? 'var(--surface-raised)' : undefined,
          borderLeft: `2px solid ${isSel(kind, guid) ? 'var(--border-active)' : 'transparent'}`
        }}
      >
        <span className={`truncate ${factionClass(faction)}`}>{label}</span>
        {sub && (
          <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {sub}
          </span>
        )}
      </button>
    </li>
  )

  return (
    <div className="p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
        Entities
      </div>
      {!snapshot ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${55 + ((i * 11) % 40)}%` }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
              Players ({snapshot.soldiers.length})
            </div>
            {snapshot.soldiers.length === 0 ? (
              <p className="px-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                None present.
              </p>
            ) : (
              <ul>
                {snapshot.soldiers.map((s) => {
                  // A mounted player isn't its own map entity -- select the vehicle instead.
                  const mounted = s.seated != null
                  return (
                    <Row
                      key={s.guid}
                      label={s.name}
                      sub={mounted ? 'mounted' : s.max ? 'MAX' : undefined}
                      kind={mounted ? 'vehicle' : 'soldier'}
                      guid={mounted ? (s.seated as number) : s.guid}
                      faction={s.faction}
                    />
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
              Vehicles ({snapshot.vehicles.length})
            </div>
            {snapshot.vehicles.length === 0 ? (
              <p className="px-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                None present.
              </p>
            ) : (
              <ul>
                {snapshot.vehicles.map((v) => {
                  const crew = v.seats.filter((st) => st.occupant).length
                  return (
                    <Row
                      key={v.guid}
                      label={vehicleName(v.name)}
                      sub={crew > 0 ? `${crew} crew` : undefined}
                      kind="vehicle"
                      guid={v.guid}
                      faction={v.faction}
                    />
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
              CE ({snapshot.deployables.length})
            </div>
            {snapshot.deployables.length === 0 ? (
              <p className="px-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                None present.
              </p>
            ) : (
              <ul>
                {snapshot.deployables.map((d) => (
                  <Row
                    key={d.guid}
                    label={titleCase(d.name)}
                    kind="deployable"
                    guid={d.guid}
                    faction={d.faction}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The always-docked selection panel: an entity's title (player name for soldiers) plus a role/type
 * subtitle. Renders a placeholder while nothing is selected rather than disappearing, so the modal's
 * layout never shifts.
 */
/**
 * Password re-entry before a continent-wide action.
 *
 * The admin already holds a session, so this is not authentication -- it is a deliberate speed bump
 * in front of the four actions that cannot be undone and are not aimed at any one entity. The server
 * checks the password against the session's own account and rate-limits failures.
 */
function ConfirmDialog({
  prompt,
  busy,
  onCancel,
  onConfirm
}: {
  prompt: string
  busy: boolean
  onCancel: () => void
  onConfirm: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded border p-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--accent-warning)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (password) onConfirm(password)
        }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--accent-warning)' }}>
          Confirm
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {prompt}
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          className="mt-3 w-full rounded border px-2 py-1 text-sm"
          style={{
            background: 'var(--background)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-3 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="rounded border px-3 py-1 text-xs disabled:opacity-40"
            style={{ borderColor: 'var(--accent-warning)', color: 'var(--accent-warning)' }}
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * What can be done to the selected entity, and how alarming each one is.
 *
 * `danger` marks the actions that end something irreversibly -- a kill, a destroy -- so they read
 * differently from a deconstruct, which merely recalls the entity.
 */
/**
 * Move a selected player somewhere else.
 *
 * Recall is a separate button rather than another entry in the zone list because it is not a
 * destination: the world server derives the right sanctuary from the player's OWN faction, so it is
 * one click that does the right thing for anybody, and an administrator never has to know their empire.
 */
function PlayerTransferControls({
  name,
  zones,
  busy,
  onTransfer
}: {
  name: string
  zones: ContinentSummary[]
  busy: boolean
  onTransfer: (name: string, to: string) => void
}) {
  const [zone, setZone] = useState('')

  // Matches the Actions buttons above rather than the generic <Button>, so the panel reads as one
  // control surface instead of two visually different ones stacked together.
  const action =
    'w-full rounded border px-2 py-1 text-left text-xs transition-colors disabled:opacity-40'

  return (
    <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
        Move Player
      </div>

      {/* Recall is its own button, not an entry in the list below: it is not a destination. The world
          server derives the correct sanctuary from the player's OWN faction, so this is one click
          that is right for anybody and never requires knowing their empire. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => onTransfer(name, 'sanctuary')}
        className={action}
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        Recall to Sanctuary
      </button>

      <div className="flex gap-1.5">
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          aria-label={`Send ${name} to continent`}
          disabled={busy}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-xs disabled:opacity-40"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            background: 'var(--surface)'
          }}
        >
          <option value="">Send to…</option>
          {zones.map((z) => (
            <option key={z.zoneId} value={z.zoneId}>
              {z.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !zone}
          onClick={() => onTransfer(name, zone)}
          className="shrink-0 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40"
          style={{ borderColor: 'var(--border-active)', color: 'var(--accent-primary)' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

function actionsFor(
  kind: CombatSelection['kind'],
  faction: number
): { action: string; label: string; danger?: boolean }[] {
  if (kind === 'soldier') {
    return [
      { action: 'kill', label: 'Kill', danger: true },
      { action: 'kick', label: 'Kick', danger: true }
    ]
  }
  if (kind === 'vehicle') {
    return [
      { action: 'deconstruct', label: 'Deconstruct' },
      { action: 'destroy', label: 'Destroy', danger: true },
      // Only the two empires that do not already own it are worth offering.
      ...[0, 1, 2]
        .filter((f) => f !== faction)
        .map((f) => ({
          action: `hack:${['TR', 'NC', 'VS'][f]}`,
          label: `Hack to ${['TR', 'NC', 'VS'][f]}`
        }))
    ]
  }
  return [
    { action: 'deconstruct', label: 'Deconstruct' },
    { action: 'destroy', label: 'Destroy', danger: true }
  ]
}

function CombatDetail({
  selected,
  snapshot,
  busy,
  onAction,
  onTransfer,
  zones
}: {
  selected: CombatSelection | null
  snapshot: CombatSnapshot | null
  busy: boolean
  onAction: (action: string) => void
  onTransfer: (name: string, to: string) => void
  zones: ContinentSummary[]
}) {
  if (!selected || !snapshot) {
    return (
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          Selection
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Select an entity on the map or in the Entities list.
        </p>
      </div>
    )
  }

  let title = ''
  let subtitle = ''
  let extra: { label: string; value: string }[] = []
  let faction = 3

  if (selected.kind === 'soldier') {
    const s = snapshot.soldiers.find((x) => x.guid === selected.guid)
    if (s) {
      title = s.name
      faction = s.faction
      subtitle = s.max && s.seated == null ? 'MAX' : soldierSubtitle(s.guid, s.seated, snapshot)
      extra = [{ label: 'Empire', value: factionById(s.faction)?.key ?? 'NL' }]
    }
  } else if (selected.kind === 'vehicle') {
    const v = snapshot.vehicles.find((x) => x.guid === selected.guid)
    if (v) {
      title = vehicleName(v.name)
      faction = v.faction
      const crew = v.seats.filter((st) => st.occupant).length
      subtitle = `Vehicle · ${crew} aboard`
      extra = [
        { label: 'Empire', value: factionById(v.faction)?.key ?? 'NL' },
        ...v.seats
          .filter((st) => st.occupant)
          .map((st) => ({ label: ROLE_LABEL[st.role] ?? st.role, value: st.occupant?.name ?? '' })),
        ...v.cargo.map((c) => ({ label: 'cargo', value: vehicleName(c.name) }))
      ]
    }
  } else {
    const d = snapshot.deployables.find((x) => x.guid === selected.guid)
    if (d) {
      title = titleCase(d.name)
      faction = d.faction
      subtitle = CE_LABEL[d.category || 'None'] ?? d.category
      extra = [{ label: 'Empire', value: factionById(d.faction)?.key ?? 'NL' }]
    }
  }

  return (
    <div>
      <div className="mb-2">
        <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title || 'Unknown'}
        </div>
        <div className="text-xs" style={{ color: 'var(--accent-primary)' }}>
          {subtitle}
        </div>
      </div>
      {extra.length > 0 && (
        <dl className="space-y-1 border-t pt-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          {extra.map((row, i) => (
            <div key={i} className="flex justify-between gap-2">
              <dt className="capitalize" style={{ color: 'var(--text-muted)' }}>
                {row.label}
              </dt>
              <dd className="truncate text-right" style={{ color: 'var(--text-secondary)' }}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Entity actions. Only offered once the entity is actually in the snapshot -- acting on one
          that has already gone would just produce an error from the world server. */}
      {title && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
            Actions
          </div>
          {actionsFor(selected.kind, faction).map((a) => (
            <button
              key={a.action}
              type="button"
              disabled={busy}
              onClick={() => onAction(a.action)}
              className="w-full rounded border px-2 py-1 text-left text-xs transition-colors disabled:opacity-40"
              style={{
                borderColor: a.danger ? 'var(--accent-warning)' : 'var(--border)',
                color: a.danger ? 'var(--accent-warning)' : 'var(--text-secondary)'
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {selected.kind === 'soldier' && title && (
        <PlayerTransferControls name={title} zones={zones} busy={busy} onTransfer={onTransfer} />
      )}
    </div>
  )
}
