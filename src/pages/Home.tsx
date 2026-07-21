import { useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import { api } from '@/lib/api'

/** Shape returned by GET /api/info — the PSAdmin-polled server status. */
interface ServerInfo {
  status?: string
  players?: { name: string; faction_id: number }[]
}

const FACTIONS = [
  { id: 2, key: 'tr', label: 'Terran Republic', cls: 'faction-tr' },
  { id: 1, key: 'nc', label: 'New Conglomerate', cls: 'faction-nc' },
  { id: 0, key: 'vs', label: 'Vanu Sovereignty', cls: 'faction-vs' }
] as const

export function Home() {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ServerInfo>('/info')
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load server info'))
  }, [])

  const players = info?.players ?? []
  const online = players.length
  const up = info?.status === 'UP'

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
              {info ? (up ? 'ONLINE' : 'OFFLINE') : '…'}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {online} {online === 1 ? 'player' : 'players'} connected
            </span>
          </div>
        )}
      </Panel>

      <Panel title="Empire Population">
        <ul className="space-y-2">
          {FACTIONS.map((f) => {
            const count = players.filter((p) => p.faction_id === f.id).length
            return (
              <li key={f.key} className="flex items-center justify-between text-sm">
                <span className={f.cls}>{f.label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{count}</span>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
