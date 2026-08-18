import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { DataTable, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { factionClass } from '@/lib/factions'

/** How often the leaderboard re-checks for data (also its recovery cadence while a source is down). */
const REFRESH_MS = 60_000

/** Placeholder rows shown until the table's data source responds. */
function SkeletonRows({ trailing = 1 }: { trailing?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4" style={{ width: `${45 + ((i * 13) % 34)}%` }} />
          <div className="flex gap-3">
            {Array.from({ length: trailing }, (_, j) => (
              <Skeleton key={j} className="h-4 w-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface KillRow {
  id?: number
  name: string
  faction_id?: number
  kill_count?: number
  f_kill_date?: string
}

interface OutfitRow {
  id?: number
  outfit_id?: number
  name: string
  faction_id?: number
  member_count?: number
  points?: number
}

export function Leaderboard() {
  const [kills, setKills] = useState<KillRow[] | null>(null)
  const [outfits, setOutfits] = useState<OutfitRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // Each table loads independently and keeps its last-known rows on a failed poll; until the first
    // success it shows skeletons and re-checks every 60s.
    const load = () => {
      api
        .get<{ kills: KillRow[] }>('/top_kills')
        .then((k) => !cancelled && setKills(k.kills ?? []))
        .catch(() => {})
      api
        .get<{ outfits: OutfitRow[] }>('/top_outfits')
        .then((o) => !cancelled && setOutfits(o.outfits ?? []))
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Top Kills">
        {!kills ? (
          <SkeletonRows trailing={1} />
        ) : (
          <DataTable
            rows={kills}
            rowKey={(r, i) => r.id ?? `${r.name}-${i}`}
            empty="No kills recorded yet."
            columns={[
              {
                header: 'Player',
                cell: (r) =>
                  r.id ? (
                    <Link to={`/avatar/${r.id}`} className={factionClass(r.faction_id)}>
                      {r.name}
                    </Link>
                  ) : (
                    <span className={factionClass(r.faction_id)}>{r.name}</span>
                  )
              },
              { header: 'Kills', align: 'right', cell: (r) => r.kill_count ?? 0 }
            ]}
          />
        )}
      </Panel>

      <Panel title="Top Outfits" accent="vs">
        {!outfits ? (
          <SkeletonRows trailing={2} />
        ) : (
          <DataTable
            rows={outfits}
            rowKey={(r, i) => r.outfit_id ?? r.id ?? `${r.name}-${i}`}
            empty="No outfits recorded yet."
            columns={[
              {
                header: 'Outfit',
                cell: (r) => {
                  const id = r.outfit_id ?? r.id
                  return id ? (
                    <Link to={`/outfit/${id}`} className={factionClass(r.faction_id)}>
                      {r.name}
                    </Link>
                  ) : (
                    <span className={factionClass(r.faction_id)}>{r.name}</span>
                  )
                }
              },
              { header: 'Members', align: 'right', cell: (r) => r.member_count ?? '—' },
              { header: 'Points', align: 'right', cell: (r) => r.points ?? '—' }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
