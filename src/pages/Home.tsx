import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'
import { EMPIRES, factionClass } from '@/lib/factions'
import type { Stats } from '@/lib/types'

export function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Stats>('/stats')
      .then(setStats)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load server statistics')
      )
  }, [])

  const up = stats?.status === 'UP'
  const online = stats?.players?.length ?? 0
  const last = stats?.last?.character

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="World Status">
        {error ? (
          <p style={{ color: 'var(--text-danger)' }}>{error}</p>
        ) : (
          <div className="flex items-baseline gap-3">
            <span
              className="text-3xl font-bold"
              style={{
                color: up ? 'var(--accent-primary)' : 'var(--text-muted)',
                textShadow: up ? 'var(--text-glow-teal)' : undefined
              }}
            >
              {stats ? (up ? 'ONLINE' : 'OFFLINE') : '…'}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {online} {online === 1 ? 'player' : 'players'} connected
            </span>
          </div>
        )}
      </Panel>

      <Panel title="Empire Population">
        <ul className="space-y-2">
          {EMPIRES.map((f) => (
            <li key={f.key} className="flex items-center justify-between text-sm">
              <span className={f.cls}>{f.name}</span>
              <span className={`${f.secondaryCls} tabular-nums`}>
                {stats?.empires?.[f.key as 'TR' | 'NC' | 'VS'] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Online Players">
        {online === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No players are currently online.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stats?.players?.map((p) => (
              <li key={p.id}>
                <Link to={`/avatar/${p.id}`} className={factionClass(p.faction_id)}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Database">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Accounts</dt>
            <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {stats?.accounts ?? '…'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Characters</dt>
            <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {stats?.characters ?? '…'}
            </dd>
          </div>
          {last && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Newest character</dt>
              <dd>
                <Link to={`/avatar/${last.id}`} className={factionClass(last.faction_id)}>
                  {last.name}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Panel>
    </div>
  )
}
