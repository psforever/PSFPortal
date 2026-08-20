import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import { DataTable, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'

/** How often the log re-reads. Also its recovery cadence while the world server is down. */
const REFRESH_MS = 60_000

interface AdminAction {
  at: number
  admin: string
  action: string
  detail: Record<string, string>
  ok: boolean
  message: string
  source: string
}

function fmtWhen(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

/** Render an action's parameters compactly, e.g. `zone=z1 faction=TR`. */
function fmtDetail(detail: Record<string, string> | undefined): string {
  if (!detail) return ''
  return Object.entries(detail)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

/**
 * Audit -> Admin Log. The trail of state-changing administrative actions, held in memory by the world
 * PSF-Server HTTP API actor (never persisted) and pruned after seven days -- so this list is empty
 * after a world server restart, which is expected rather than an error.
 */
export function AdminLogSection() {
  const [actions, setActions] = useState<AdminAction[] | null>(null)
  const [retention, setRetention] = useState(7)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(() => {
    api
      .get<{ retention_days: number; actions: AdminAction[] }>('/admin-log')
      .then((r) => {
        setActions(r.actions ?? [])
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
          Admin Log
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          State-changing administrative actions, kept in memory by the world server for {retention} days.
          Cleared when the world server restarts.
        </p>
      </div>

      <Panel title="Actions">
        {!actions ? (
          unavailable ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              The PSF-Server HTTP API is unavailable; retrying every 60&nbsp;seconds.
            </p>
          ) : (
            <div className="space-y-2.5 py-1">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4" style={{ width: `${40 + ((i * 13) % 35)}%` }} />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          )
        ) : (
          <DataTable
            rows={actions}
            rowKey={(r, i) => `${r.at}-${i}`}
            empty="No administrative actions recorded yet."
            columns={[
              { header: 'When', cell: (r) => fmtWhen(r.at) },
              {
                header: 'Admin',
                cell: (r) => (
                  <span style={{ color: 'var(--text-secondary)' }}>{r.admin || 'unknown'}</span>
                )
              },
              {
                header: 'Action',
                cell: (r) => (
                  <span style={{ color: 'var(--accent-primary)' }}>{r.action}</span>
                )
              },
              {
                header: 'Detail',
                cell: (r) => (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtDetail(r.detail)}
                  </span>
                )
              },
              {
                header: 'Result',
                align: 'right',
                cell: (r) => (
                  <span
                    title={r.message}
                    style={{ color: r.ok ? 'var(--accent-primary)' : 'var(--text-danger)' }}
                  >
                    {r.ok ? 'ok' : 'failed'}
                  </span>
                )
              }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
