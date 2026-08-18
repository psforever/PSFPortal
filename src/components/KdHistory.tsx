import { useEffect, useState } from 'react'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'

/** One active day from GET /api/avatar/:avatar/kd_byDate (newest first). */
interface KdDay {
  date: string
  kills: number
  deaths: number
}

/** Days with any activity at all are charted; more than this and a bar becomes a hairline. */
const CHART_DAYS = 14
const CHART_HEIGHT = 120 // px

/**
 * A character's per-day kills and deaths as paired bars, kills beside deaths so a bad day reads
 * instantly. Only days the character actually played exist in the data -- the server groups
 * killactivity by day and omits quiet ones, so gaps in a play streak simply do not appear.
 */
export function KdHistory({ avatarId }: { avatarId: number }) {
  const [days, setDays] = useState<KdDay[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDays(null)
    setError(null)

    api
      .get<{ kd: KdDay[] }>(`/avatar/${avatarId}/kd_byDate`)
      .then((r) => {
        if (!cancelled) setDays(r.kd ?? [])
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load battle history')
      })

    return () => {
      cancelled = true
    }
  }, [avatarId])

  if (error) return <Alert kind="error">{error}</Alert>
  if (!days) return <Spinner label="Loading battle history" />
  if (days.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)' }}>No battles recorded yet.</p>
    )
  }

  // The API is newest-first and unbounded; the chart shows a window but the ratio is all-time.
  const totals = days.reduce(
    (acc, d) => ({ kills: acc.kills + d.kills, deaths: acc.deaths + d.deaths }),
    { kills: 0, deaths: 0 }
  )
  const kd = totals.deaths > 0 ? (totals.kills / totals.deaths).toFixed(2) : `${totals.kills}.00`

  const shown = days.slice(0, CHART_DAYS).reverse()
  const max = Math.max(...shown.map((d) => Math.max(d.kills, d.deaths)), 1)

  return (
    <div>
      <div
        className="mb-3 flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>
          Last {shown.length} active day{shown.length === 1 ? '' : 's'}
        </span>
        <span>
          All-time K/D{' '}
          <span className="tabular-nums" style={{ color: 'var(--accent-primary)' }}>
            {kd}
          </span>
        </span>
      </div>

      <div
        className="flex items-end gap-1 border-b"
        style={{ height: CHART_HEIGHT, borderColor: 'var(--border)' }}
      >
        {shown.map((d) => (
          <div
            key={d.date}
            className="flex flex-1 items-end justify-center gap-0.5"
            style={{ height: '100%' }}
            title={`${d.date} — ${d.kills} kills, ${d.deaths} deaths`}
          >
            <div
              style={{
                width: '40%',
                height: `${Math.max((d.kills / max) * 100, d.kills > 0 ? 2 : 0)}%`,
                background: 'var(--color-green)',
                opacity: 0.85
              }}
            />
            <div
              style={{
                width: '40%',
                height: `${Math.max((d.deaths / max) * 100, d.deaths > 0 ? 2 : 0)}%`,
                background: 'var(--color-red)',
                opacity: 0.85
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-1">
        {shown.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 overflow-hidden text-center text-[9px] uppercase"
            style={{
              color: 'var(--text-muted)',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              // Every label collides at 14 columns; show the ends and every third between.
              visibility: i % 3 === 0 || i === shown.length - 1 ? 'visible' : 'hidden'
            }}
          >
            {d.date.replace(/, \d{4}$/, '')}
          </div>
        ))}
      </div>

      <div
        className="mt-2 flex gap-4 text-[9px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>
          <span style={{ color: 'var(--color-green)' }}>&#9632;</span> kills
        </span>
        <span>
          <span style={{ color: 'var(--color-red)' }}>&#9632;</span> deaths
        </span>
      </div>
    </div>
  )
}
