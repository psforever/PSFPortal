import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContinentList } from '@/components/ContinentList'
import { EmpireStats } from '@/components/EmpireStats'
import { Panel } from '@/components/Panel'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { factionClass } from '@/lib/factions'
import type { Stats } from '@/lib/types'

/**
 * How often the home page silently re-checks server status, population and the online roster. Matches
 * the backend's 10s poll of the PSF-Server HTTP API, so a change (server down/up, a player joining or leaving)
 * shows within about one cycle. The refresh replaces the data in place -- no spinner, no flicker.
 */
const REFRESH_MS = 10_000

export function Home() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let cancelled = false

    // A failed poll keeps the last-known snapshot in place; until the very first success, the panels
    // render SCIFICN skeletons rather than an error, and keep re-checking on the interval.
    const load = () =>
      api
        .get<Stats>('/stats')
        .then((data) => {
          if (!cancelled) setStats(data)
        })
        .catch(() => {})

    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const up = stats?.status === 'UP'
  const online = stats?.players?.length ?? 0
  const last = stats?.last?.character

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="World Status">
        <>
          {/* status line over the faint PSForever logo: in colour when online, greyscale when offline */}
          <div className="relative flex min-h-[7rem] items-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 bg-no-repeat bg-center"
              style={{
                opacity: 0.28,
                backgroundImage: "url('/img/logo_crop.png')",
                backgroundSize: 'contain',
                filter: up ? undefined : 'grayscale(1)'
              }}
            />
            <div className="relative z-[1] flex items-baseline gap-3">
              {/* Server up/down is known from the status feed; the live player count only exists while
                  the login server is up, so it skeletons until then. */}
              {stats ? (
                <span
                  className="text-3xl font-bold"
                  style={{
                    color: up ? 'var(--accent-primary)' : 'var(--text-muted)',
                    textShadow: up ? 'var(--text-glow-teal)' : undefined
                  }}
                >
                  {up ? 'ONLINE' : 'OFFLINE'}
                </span>
              ) : (
                <Skeleton className="h-8 w-36" />
              )}
              {up ? (
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {online} {online === 1 ? 'player' : 'players'} connected
                </span>
              ) : (
                <Skeleton className="h-4 w-32" />
              )}
            </div>
          </div>

          {/* online roster, flowing into a few columns */}
          <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <h3
              className="mb-2 text-[10px] uppercase tracking-[0.22em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Online Players
            </h3>
            {!up ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-3.5" style={{ width: `${58 + ((i * 17) % 34)}%` }} />
                  </li>
                ))}
              </ul>
            ) : online === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No players are currently online.
              </p>
            ) : (
              <ul className="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto pr-1 text-sm sm:grid-cols-3">
                {stats?.players?.map((p) => (
                  <li key={p.id} className="truncate">
                    <Link to={`/avatar/${p.id}`} className={factionClass(p.faction_id)}>
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      </Panel>

      {/* right column: population over the database summary */}
      <div className="flex flex-col gap-4">
        <Panel title="Empire Population">
          {/* Population is a live figure -- skeleton it until the login server reports in. */}
          {up && stats ? (
            <EmpireStats stats={stats.empires} />
          ) : (
            <div className="flex items-stretch gap-4">
              <div className="flex-1 min-w-0 space-y-3 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
                <Skeleton className="h-4 w-full" />
              </div>
              <Skeleton className="h-[120px] shrink-0" style={{ width: 210 }} />
            </div>
          )}
        </Panel>

        <Panel title="Database">
          {/* Counts come from PostgreSQL, so they stay available even while the login server is down;
              only skeleton them when the stats endpoint itself hasn't responded at all. */}
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Accounts</dt>
              <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {stats ? stats.accounts : <Skeleton className="inline-block h-4 w-16" />}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Characters</dt>
              <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {stats ? stats.characters : <Skeleton className="inline-block h-4 w-16" />}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Newest character</dt>
              <dd>
                {!stats ? (
                  <Skeleton className="inline-block h-4 w-24" />
                ) : last ? (
                  <Link to={`/avatar/${last.id}`} className={factionClass(last.faction_id)}>
                    {last.name}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="md:col-span-2">
        <ContinentList />
      </div>
    </div>
  )
}
