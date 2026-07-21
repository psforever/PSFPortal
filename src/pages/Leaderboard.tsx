import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { factionClass } from '@/lib/factions'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<{ kills: KillRow[] }>('/top_kills'),
      api.get<{ outfits: OutfitRow[] }>('/top_outfits')
    ])
      .then(([k, o]) => {
        setKills(k.kills ?? [])
        setOutfits(o.outfits ?? [])
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load leaderboard')
      )
  }, [])

  if (error) return <Alert kind="error">{error}</Alert>

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Top Kills">
        {!kills ? (
          <Spinner />
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
          <Spinner />
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
