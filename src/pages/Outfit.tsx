import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { factionById, factionClass } from '@/lib/factions'
import type { OutfitMember } from '@/lib/types'

interface OutfitDetail {
  id?: number
  outfit_id?: number
  name?: string
  faction_id?: number
  created?: string
  leader?: string
  member_count?: number
  points?: number
}

export function Outfit() {
  const { id } = useParams<{ id: string }>()
  const [outfit, setOutfit] = useState<OutfitDetail | null>(null)
  const [members, setMembers] = useState<OutfitMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setError(null)

    api
      .get<OutfitDetail>(`/outfit/${id}`)
      .then((o) => setOutfit(o ?? {}))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load outfit')
      )

    api
      .get<{ members: OutfitMember[] }>(`/outfit/${id}/members`)
      .then((r) => setMembers(r.members ?? []))
      .catch(() => setMembers([]))
  }, [id])

  if (error) return <Alert kind="error">{error}</Alert>
  if (!outfit) return <Spinner label="Loading outfit" />

  // The endpoint returns an empty body for an unknown outfit.
  if (!outfit.name) {
    return (
      <Panel title="Outfit" accent="tr">
        <p style={{ color: 'var(--text-secondary)' }}>No such outfit.</p>
      </Panel>
    )
  }

  const faction = factionById(outfit.faction_id)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Outfit" className="lg:col-span-1">
        <h1 className={`text-2xl font-bold ${faction?.cls ?? ''}`}>{outfit.name}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          {faction?.name ?? 'Unknown empire'}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Members</dt>
            <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {outfit.member_count ?? members?.length ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Points</dt>
            <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {outfit.points ?? '—'}
            </dd>
          </div>
          {outfit.leader && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Leader</dt>
              <dd style={{ color: 'var(--text-secondary)' }}>{outfit.leader}</dd>
            </div>
          )}
        </dl>
      </Panel>

      <Panel title="Members" className="lg:col-span-2">
        {!members ? (
          <Spinner />
        ) : (
          <DataTable
            rows={members}
            rowKey={(m, i) => m.id ?? i}
            empty="This outfit has no members."
            columns={[
              {
                header: 'Character',
                cell: (m) => (
                  <Link to={`/avatar/${m.id}`} className={factionClass(m.faction_id)}>
                    {m.name}
                  </Link>
                )
              },
              { header: 'Rank', align: 'right', cell: (m) => m.rank ?? '—' },
              { header: 'Points', align: 'right', cell: (m) => m.points ?? '—' }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
