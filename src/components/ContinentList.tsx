import { useEffect, useMemo, useState } from 'react'
import { ContinentModal } from '@/components/ContinentModal'
import { Panel } from '@/components/Panel'
import { Skeleton, Spinner } from '@/components/ui'
import { HotspotStar } from '@/components/ui/EmpireIcons'
import { api } from '@/lib/api'
import { factionById, factionClass } from '@/lib/factions'
import type { ContinentSummary, ZoneGroup } from '@/lib/types'

/** Per-zone live detail from /zones/details. players = [TR, NC, VS, BlackOps]. */
interface ZoneDetail {
  locked_by: number | null
  players: number[]
  hotspots: number
}

/** Faction colour class for the population numbers. */
const POP_CLS = ['faction-tr', 'faction-nc', 'faction-vs']

/** How often the zone list re-checks which continents are locked. */
const LOCK_REFRESH_MS = 60_000

/** Section order + headings for the zone list. */
const SECTIONS: { group: ZoneGroup; label: string }[] = [
  { group: 'continent', label: 'Continents' },
  { group: 'island', label: 'Battle Islands' },
  { group: 'cavern', label: 'Caverns' },
  { group: 'sanctuary', label: 'Sanctuaries' }
]

/** The playable zones, grouped; clicking a name opens its map modal. */
export function ContinentList() {
  const [zones, setZones] = useState<ContinentSummary[] | null>(null)
  const [open, setOpen] = useState<ContinentSummary | null>(null)
  const [details, setDetails] = useState<Record<string, ZoneDetail>>({})
  // The live per-zone numbers come from the login server; until the first successful read they render
  // as skeletons (the zone list itself is a static asset and always shows).
  const [detailsReady, setDetailsReady] = useState(false)

  useEffect(() => {
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setZones)
      .catch(() => setZones([]))
  }, [])

  // Per-zone live detail (lock + population + hotspots), read over the PSF-Server HTTP API; polls like the map.
  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .get<{ zones: Record<string, ZoneDetail> }>('/zones/details')
        .then((r) => {
          if (cancelled) return
          setDetails(r.zones ?? {})
          setDetailsReady(true)
        })
        .catch(() => {
          // keep the last-known numbers (and skeletons if we never loaded) and retry next tick
        })

    load()
    const timer = window.setInterval(load, LOCK_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        // Anything unlabelled (an older index file) falls back to the continent section.
        items: (zones ?? []).filter((z) => (z.group ?? 'continent') === s.group)
      })).filter((s) => s.items.length > 0),
    [zones]
  )

  // Only reserve a Black Ops column when some zone actually has Black Ops players -- but when it's
  // shown, every row reserves it so the columns still line up.
  const anyBlackOps = Object.values(details).some((d) => (d.players?.[3] ?? 0) > 0)

  return (
    <Panel title="Zones">
      {!zones ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.group}>
              <h3
                className="mb-1 text-[10px] uppercase tracking-[0.22em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {section.label}
              </h3>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {section.items.map((c) => {
                  // A locked continent shows its name in the locking empire's colour; unlocked
                  // continents keep the neutral list colour.
                  // A sanctuary is owned outright rather than locked, but it reads the same way in
                  // the list: its name always carries its empire's colour.
                  const d = details[c.zoneId]
                  const lockedBy = c.empire ?? d?.locked_by ?? null
                  const lockCls = lockedBy === null ? '' : factionClass(lockedBy)
                  const lockName = lockedBy === null ? null : factionById(lockedBy)?.name
                  return (
                    <li key={c.base}>
                      <button
                        type="button"
                        onClick={() => setOpen(c)}
                        title={
                          c.empire != null
                            ? `${c.name} — ${lockName} home zone`
                            : lockName
                              ? `${c.name} — locked by ${lockName}`
                              : c.name
                        }
                        className="w-full flex items-baseline justify-between py-1 text-left hover:text-[var(--accent-primary)]"
                      >
                        <span
                          className={`uppercase tracking-[0.12em] ${lockCls}`}
                          style={lockCls ? undefined : { color: 'var(--text-secondary)' }}
                        >
                          {c.name}
                        </span>
                        {/* Per-empire online population (TR/NC/VS, then Black Ops when any zone has
                            it) and the hotspot count. Each number is a fixed-width right-aligned
                            column so extra digits don't push the columns out of vertical alignment;
                            the hotspot count is set off to its own group behind a star marker. These
                            are live login-server figures, so they skeleton until the feed arrives. */}
                        {detailsReady ? (
                          <span className="flex items-baseline gap-3.5 text-[10px] tabular-nums shrink-0">
                            {[0, 1, 2].map((f) => (
                              <span
                                key={f}
                                className={`${POP_CLS[f]} inline-block text-right`}
                                style={{ minWidth: '2.25ch' }}
                              >
                                {d?.players?.[f] ?? 0}
                              </span>
                            ))}
                            {anyBlackOps && (
                              <span
                                className="inline-block text-right"
                                style={{ minWidth: '2.25ch', color: '#b8bcc4' }}
                                title="Black Ops"
                              >
                                {(d?.players?.[3] ?? 0) > 0 ? d?.players?.[3] : ''}
                              </span>
                            )}
                            <span
                              className="inline-flex items-center gap-1 pl-2 border-l"
                              style={{ color: '#e8843c', borderColor: 'var(--border)' }}
                              title="Hotspots"
                            >
                              <HotspotStar size={11} title="Hotspots" />
                              <span className="inline-block text-right" style={{ minWidth: '2.25ch' }}>
                                {d?.hotspots ?? 0}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3.5 shrink-0">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-3 w-6" />
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {open && <ContinentModal summary={open} onClose={() => setOpen(null)} />}
    </Panel>
  )
}
