import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import { DataTable, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { factionById, factionClass } from '@/lib/factions'

/** How often the log re-reads; also its recovery cadence while the world server is down. */
const REFRESH_MS = 60_000

interface InterstellarEvent {
  at: number
  kind: string
  zone: string
  base: string
  /** Player (or admin) responsible; empty for a plain ownership change, which has no actor. */
  actor: string
  from: number
  to: number
  flipped: boolean
}

/**
 * Human-readable label per event kind, and whether it resulted in the base changing hands. Kept in
 * one place so the table and any future filtering agree on the wording.
 */
const KIND: Record<string, { label: string; won: boolean }> = {
  HackStarted: { label: 'Hack Started', won: false },
  HackHoldCompleted: { label: 'Hack and Hold Completed', won: true },
  HackHoldFailed: { label: 'Hack and Hold Failed', won: false },
  LluPickedUp: { label: 'LLU Picked Up', won: false },
  LluDelivered: { label: 'LLU Delivered', won: true },
  LluLost: { label: 'LLU Lost', won: false },
  LluDestroyed: { label: 'LLU Destroyed', won: false },
  LluBypassCompleted: { label: 'LLU Bypass — Hack and Hold Completed', won: true },
  LluBypassFailed: { label: 'LLU Bypass — Hack and Hold Failed', won: false },
  PortalDesignation: { label: 'Portal Designation', won: true }
}

function fmtWhen(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

/** Faction id -> short empire tag; ids outside TR/NC/VS read as neutral. */
function empire(id: number): string {
  return factionById(id)?.key ?? '—'
}

/**
 * Audit -> Interstellar Log. Who hacked what, and when bases flipped or failed to flip. Held in
 * memory by the PSF-HTTP API actor (never persisted) and pruned after seven days, so it
 * is empty after a world server restart -- expected rather than an error.
 */
export function InterstellarLogSection() {
  const [events, setEvents] = useState<InterstellarEvent[] | null>(null)
  const [retention, setRetention] = useState(7)
  const [unavailable, setUnavailable] = useState(false)
  /**
   * Zone id -> continent name, from the continent index the portal already ships.
   *
   * The world server reports a zone by its internal id (`z1`, `home2`), which is what the rest of the
   * PSF-HTTP API speaks. Resolving it here rather than server-side keeps the event payload as the
   * server's own vocabulary and reuses a file the portal loads anyway -- and an id the index does not
   * know still renders as itself rather than disappearing.
   */
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((zones: { zoneId: string; name: string }[]) =>
        setZoneNames(Object.fromEntries(zones.map((z) => [z.zoneId, z.name])))
      )
      .catch(() => setZoneNames({}))
  }, [])

  const load = useCallback(() => {
    api
      .get<{ retention_days: number; events: InterstellarEvent[] }>('/interstellar-log')
      .then((r) => {
        setEvents(r.events ?? [])
        setRetention(r.retention_days ?? 7)
        setUnavailable(false)
      })
      .catch(() => setUnavailable(true))
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h2
          className="text-sm font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--accent-primary)' }}
        >
          Interstellar Log
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Base captures and failed captures, kept in memory by the world server for {retention} days.
          Cleared when the world server restarts.
        </p>
      </div>

      <Panel title="Events">
        {!events ? (
          unavailable ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              The PSF-HTTP API is unavailable; retrying every 60&nbsp;seconds.
            </p>
          ) : (
            <div className="space-y-2.5 py-1">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4" style={{ width: `${42 + ((i * 11) % 33)}%` }} />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          )
        ) : (
          <DataTable
            rows={events}
            rowKey={(r, i) => `${r.at}-${i}`}
            empty="No base activity recorded yet."
            columns={[
              { header: 'When', cell: (r) => fmtWhen(r.at) },
              {
                header: 'Continent',
                cell: (r) => (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {zoneNames[r.zone] ?? r.zone}
                    {zoneNames[r.zone] && (
                      <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {r.zone}
                      </span>
                    )}
                  </span>
                )
              },
              {
                header: 'Facility',
                cell: (r) =>
                  r.base ? (
                    <span style={{ color: 'var(--text-secondary)' }}>{r.base}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                  )
              },
              {
                header: 'Event',
                cell: (r) => (
                  <span style={{ color: 'var(--accent-primary)' }}>{KIND[r.kind]?.label ?? r.kind}</span>
                )
              },
              {
                // Only hacks, hack clears and LLU pickups have a responsible player; an ownership
                // change on its own does not, so it is left blank rather than invented.
                header: 'Player',
                cell: (r) =>
                  r.actor ? (
                    <span style={{ color: 'var(--text-secondary)' }}>{r.actor}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )
              },
              {
                header: 'Ownership',
                align: 'right',
                cell: (r) =>
                  r.flipped ? (
                    <span>
                      {r.from >= 0 && r.from <= 2 && (
                        <>
                          <span className={factionClass(r.from)}>{empire(r.from)}</span>
                          <span style={{ color: 'var(--text-muted)' }}> → </span>
                        </>
                      )}
                      <span className={factionClass(r.to)}>{empire(r.to)}</span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>held</span>
                  )
              }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
