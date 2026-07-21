import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { factionById } from '@/lib/factions'

/** GET /api/avatar/:avatar — note the API returns `faction`, not `faction_id`. */
interface AvatarDetail {
  id: number
  name: string
  bep: string | number
  cep: string | number
  faction: number
  gender?: number
  head?: number
  outfit?: string | null
  outfit_id?: number | null
}

interface WeaponStat {
  weapon_id?: number
  name?: string
  kills?: number
  fired?: number
  hits?: number
}

export function Avatar() {
  const { id } = useParams<{ id: string }>()
  const [avatar, setAvatar] = useState<AvatarDetail | null>(null)
  const [weapons, setWeapons] = useState<WeaponStat[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setAvatar(null)
    setError(null)

    api
      .get<AvatarDetail>(`/avatar/${id}`)
      .then(setAvatar)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? 'No such character.'
            : e instanceof Error
              ? e.message
              : 'Failed to load character'
        )
      )

    api
      .get<{ weapons: WeaponStat[] }>(`/weaponstats/${id}`)
      .then((r) => setWeapons(r.weapons ?? []))
      .catch(() => setWeapons([]))
  }, [id])

  if (error) return <Alert kind="error">{error}</Alert>
  if (!avatar) return <Spinner label="Loading character" />

  const faction = factionById(avatar.faction)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Character" className="lg:col-span-1">
        <h1 className={`text-2xl font-bold ${faction?.cls ?? ''}`}>{avatar.name}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          {faction?.name ?? 'Unknown empire'}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Battle EP</dt>
            <dd className={`tabular-nums ${faction?.secondaryCls ?? ''}`}>{avatar.bep}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Command EP</dt>
            <dd className={`tabular-nums ${faction?.secondaryCls ?? ''}`}>{avatar.cep}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Outfit</dt>
            <dd>
              {avatar.outfit && avatar.outfit_id ? (
                <Link to={`/outfit/${avatar.outfit_id}`} style={{ color: 'var(--accent-primary)' }}>
                  {avatar.outfit}
                </Link>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>None</span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Weapon Statistics" className="lg:col-span-2">
        {!weapons ? (
          <Spinner />
        ) : (
          <DataTable
            rows={weapons}
            rowKey={(w, i) => w.weapon_id ?? i}
            empty="No weapon statistics recorded."
            columns={[
              { header: 'Weapon', cell: (w) => w.name ?? `#${w.weapon_id}` },
              { header: 'Kills', align: 'right', cell: (w) => w.kills ?? 0 },
              { header: 'Fired', align: 'right', cell: (w) => w.fired ?? 0 },
              { header: 'Hits', align: 'right', cell: (w) => w.hits ?? 0 }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
