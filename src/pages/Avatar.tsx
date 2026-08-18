import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { KdHistory } from '@/components/KdHistory'
import { Panel } from '@/components/Panel'
import { hasIcon, ItemIcon } from '@/components/ItemIcon'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { factionById } from '@/lib/factions'
import { battleRankProgress, commandRankProgress, type RankProgress } from '@/lib/ranks'

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
  created?: string
  last_login?: string
}

/** GET /api/weaponstats/:avatar — names are resolved server-side from the object id. */
interface WeaponStat {
  weapon_id: number
  /** Internal registry name (`suppressor`); keys the item artwork. */
  name?: string
  /** Player-facing name (`Suppressor`), when the client named the weapon at all. */
  display?: string
  kills?: number
  fired?: number
  hits?: number
  assists?: number
}

/** A timestamp the API serialised from Postgres, as "Aug 4, 2026". Absent values read as unknown. */
function formatDate(ts?: string): string {
  if (!ts) return 'Unknown'
  const d = new Date(ts)
  return Number.isNaN(d.getTime())
    ? 'Unknown'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * One rank line: the badge, the XP total, and progress through the current rank.
 * At max rank there is no next threshold, so the bar sits full instead of implying one.
 */
function RankRow({
  label,
  abbr,
  xp,
  progress,
  colorCls
}: {
  label: string
  abbr: string
  xp: string | number
  progress: RankProgress
  colorCls?: string
}) {
  const pct = progress.needed > 0 ? Math.min((progress.into / progress.needed) * 100, 100) : 100

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className={`font-bold tabular-nums ${colorCls ?? ''}`}>
          {abbr}
          {progress.rank}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
        title={
          progress.needed > 0
            ? `${progress.into.toLocaleString()} / ${progress.needed.toLocaleString()} toward ${abbr}${progress.rank + 1}`
            : 'Maximum rank'
        }
      >
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: 'var(--accent-primary)', opacity: 0.85 }}
        />
      </div>
      <div
        className="mt-0.5 flex justify-between text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="tabular-nums">{Number(xp).toLocaleString()} XP</span>
        {progress.needed > 0 && (
          <span className="tabular-nums">
            {(progress.needed - progress.into).toLocaleString()} to {abbr}
            {progress.rank + 1}
          </span>
        )}
      </div>
    </div>
  )
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
  const br = battleRankProgress(avatar.bep)
  const cr = commandRankProgress(avatar.cep)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Character" className="lg:col-span-1">
        <h1 className={`text-2xl font-bold ${faction?.cls ?? ''}`}>{avatar.name}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          {faction?.name ?? 'Unknown empire'}
        </p>

        <div className="mt-4 space-y-3">
          <RankRow
            label="Battle Rank"
            abbr="BR"
            xp={avatar.bep}
            progress={br}
            colorCls={faction?.secondaryCls}
          />
          {/* CR0 means the character has never commanded; an empty progress bar would say otherwise. */}
          {cr.rank > 0 ? (
            <RankRow
              label="Command Rank"
              abbr="CR"
              xp={avatar.cep}
              progress={cr}
              colorCls={faction?.secondaryCls}
            />
          ) : (
            <div className="flex items-baseline justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Command Rank</span>
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            </div>
          )}
        </div>

        <dl className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: 'var(--border)' }}>
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
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Joined</dt>
            <dd>{formatDate(avatar.created)}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Last seen</dt>
            <dd>{formatDate(avatar.last_login)}</dd>
          </div>
        </dl>
      </Panel>

      <div className="grid gap-4 lg:col-span-2">
        <Panel title="Battle History">
          <KdHistory avatarId={avatar.id} />
        </Panel>

        <Panel title="Weapon Statistics">
          {!weapons ? (
            <Spinner />
          ) : (
            <DataTable
              rows={weapons}
              rowKey={(w) => w.weapon_id}
              empty="No weapon statistics recorded."
              columns={[
                {
                  header: '',
                  cell: (w) =>
                    w.name && hasIcon(w.name) ? (
                      <ItemIcon
                        name={w.name}
                        className="h-6 w-6"
                        style={{ color: 'var(--accent-primary)' }}
                      />
                    ) : null
                },
                {
                  header: 'Weapon',
                  cell: (w) => w.display ?? w.name ?? `#${w.weapon_id}`
                },
                { header: 'Kills', align: 'right', cell: (w) => w.kills ?? 0 },
                { header: 'Fired', align: 'right', cell: (w) => w.fired ?? 0 },
                { header: 'Hits', align: 'right', cell: (w) => w.hits ?? 0 },
                {
                  header: 'Accuracy',
                  align: 'right',
                  cell: (w) =>
                    w.fired ? `${Math.round(((w.hits ?? 0) / w.fired) * 100)}%` : '—'
                }
              ]}
            />
          )}
        </Panel>
      </div>
    </div>
  )
}
