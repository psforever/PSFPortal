import { useEffect, useState } from 'react'
import { ContinentMap } from '@/components/ContinentMap'
import { Modal } from '@/components/Modal'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { gateDestinations } from '@/lib/factions'
import type { Continent, ContinentSummary, ControlResponse } from '@/lib/types'

/** How often an open map re-checks base ownership. */
const CONTROL_REFRESH_MS = 60_000

const FACTION_NAME: Record<number, string> = { 0: 'TR', 1: 'NC', 2: 'VS' }
const FACTION_CLS: Record<number, string> = {
  0: 'faction-tr',
  1: 'faction-nc',
  2: 'faction-vs'
}

export function ContinentModal({
  summary,
  onClose
}: {
  summary: ContinentSummary
  onClose: () => void
}) {
  const [continent, setContinent] = useState<Continent | null>(null)
  const [footprints, setFootprints] = useState<Record<string, [number, number][][]>>({})
  const [control, setControl] = useState<Record<number, number>>({})
  const [lattice, setLattice] = useState<[string, string][]>([])
  /** warpgate raw name -> connected empire, for colouring warpgate -> first-facility links. */
  const [gateEmpire, setGateEmpire] = useState<Record<string, 0 | 1 | 2>>({})
  /** live combat hotspots for this zone, as world-coordinate [x, y]. */
  const [hotspots, setHotspots] = useState<[number, number][]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)
  /** zone id -> display name, so a gate can be labelled by where it actually leads. */
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})

  useEffect(() => {
    setContinent(null)
    setError(null)

    // Static layout asset (served from public/continents by Vite/Express).
    fetch(`/continents/${summary.base}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('map data unavailable'))))
      .then(setContinent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load continent'))

    // Zone id -> name, used to label gates by their live destination.
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((zs: { zoneId: string; name: string }[]) =>
        setZoneNames(Object.fromEntries(zs.map((z) => [z.zoneId, z.name])))
      )
      .catch(() => setZoneNames({}))

    // Per-type building outlines (shared across continents, so fetched once per open).
    fetch('/continents/footprints.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFootprints)
      .catch(() => setFootprints({}))

  }, [summary.base])

  // Live control state: fetched on open and refreshed on an interval so an open map keeps up with
  // base captures without needing to be reopened. Only the ownership feed polls -- the terrain and
  // building outlines are static assets.
  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .get<ControlResponse>(`/continents/${summary.number}/control`)
        .then((r) => {
          if (!cancelled) setControl(r.control ?? {})
        })
        .catch(() => {
          if (!cancelled) setControl({})
        })

    // The lattice is live server state too (read over the PSF-HTTP API), so it refreshes on the same tick.
    const loadLattice = () =>
      api
        .get<{ links: [string, string][] }>(`/continents/${summary.zoneId}/lattice`)
        .then((r) => {
          if (!cancelled) setLattice(r.links ?? [])
        })
        .catch(() => {
          if (!cancelled) setLattice([])
        })

    // Per-warpgate connection empire (sanctuary, or the paired continent's gateway owner). Live too,
    // since it depends on ownership on the far side of each gate.
    const loadGateEmpire = () =>
      api
        .get<{ gates: Record<string, 0 | 1 | 2> }>(`/continents/${summary.zoneId}/gate-empires`)
        .then((r) => {
          if (!cancelled) setGateEmpire(r.gates ?? {})
        })
        .catch(() => {
          if (!cancelled) setGateEmpire({})
        })

    // Live combat hotspots for this zone (positions the login server is broadcasting), from the same
    // zone-details feed the homepage list reads.
    const loadHotspots = () =>
      api
        .get<{ zones: Record<string, { hotspot_points?: [number, number][] }> }>('/zones/details')
        .then((r) => {
          if (!cancelled) setHotspots(r.zones?.[summary.zoneId]?.hotspot_points ?? [])
        })
        .catch(() => {
          if (!cancelled) setHotspots([])
        })

    load()
    loadLattice()
    loadGateEmpire()
    loadHotspots()
    const timer = window.setInterval(() => {
      load()
      loadLattice()
      loadGateEmpire()
      loadHotspots()
    }, CONTROL_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [summary.number, summary.zoneId])

  const controlled = Object.keys(control).length

  // Same correction the map applies: a gate's stored name reflects the link it shipped with, which
  // the server may have rewired, so both list and map label gates by their live destination.
  const gateNames = gateDestinations(lattice, summary.zoneId, zoneNames)
  const nameOf = (f: { name: string; rawName?: string; type?: string }) => {
    const live = gateNames[String(f.rawName ?? f.name).toLowerCase()]
    if (live) return live
    // A warpgate with no live link must not keep advertising the destination baked into its name --
    // that link may long since have been rewired elsewhere. Say nothing rather than something wrong.
    if (f.type === 'warpgate') return 'Warpgate'
    return f.name
  }

  // How many of this zone's gates the live lattice actually pairs with a destination. The rest are
  // dormant -- present in the map data but not currently wired to anything.
  const gates = (continent?.facilities ?? []).filter((f) =>
    ['warpgate', 'warpgate_small', 'warpgate_cavern', 'hst'].includes(f.type)
  )
  const gateStats = {
    total: gates.length,
    linked: gates.filter((f) => gateNames[String(f.rawName ?? f.name).toLowerCase()] !== undefined)
      .length
  }

  return (
    <Modal title={`${summary.name} — Continent Map`} onClose={onClose} wide>
      {error ? (
        <Alert kind="error">{error}</Alert>
      ) : !continent ? (
        <Spinner label={`Loading ${summary.name}`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <ContinentMap
            continent={continent}
            footprints={footprints}
            lattice={lattice}
            gateNames={gateNames}
            gateEmpire={gateEmpire}
            control={control}
            hotspots={hotspots}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((cur) => (cur === id ? undefined : id))}
          />

          <div className="min-w-0">
            <p className="mb-3 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
              {continent.facilities.length} facilities · {controlled} controlled
              {gateStats.total > 0 && (
                <> · {gateStats.linked}/{gateStats.total} gates linked</>
              )}
            </p>
            <ul className="space-y-1 text-sm max-h-[60vh] overflow-auto pr-1">
              {continent.facilities.map((f) => {
                // A sanctuary has no control rows -- the whole zone belongs to its empire.
                const faction = continent.empire ?? control[f.id]
                const owned = faction !== undefined
                return (
                  <li
                    key={f.id}
                    onClick={() => setSelectedId((cur) => (cur === f.id ? undefined : f.id))}
                    className="flex items-baseline justify-between gap-2 px-2 py-1 cursor-pointer"
                    style={{
                      background: selectedId === f.id ? 'var(--surface-raised)' : undefined,
                      borderLeft: `2px solid ${selectedId === f.id ? 'var(--border-active)' : 'transparent'}`
                    }}
                  >
                    <span className="truncate">
                      <span className={owned ? FACTION_CLS[faction] : ''} style={owned ? undefined : { color: 'var(--text-secondary)' }}>
                        {nameOf(f)}
                      </span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        {f.category}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {owned ? FACTION_NAME[faction] : 'SOI ' + f.soi}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
