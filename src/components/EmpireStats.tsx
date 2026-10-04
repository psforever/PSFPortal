import { BarChart } from '@/components/ui/BarChart'
import { EmpireLogo } from '@/components/ui/EmpireIcons'

/**
 * Empire population: a legend of raw counts on the left, and a faction bar graph on the right (the
 * SCIFICN BarChart, one bar per empire coloured by faction). Black Ops (NL) only appears -- in both
 * the tally and the chart -- when its population is non-zero. A faint PSForever logo sits behind the
 * chart.
 */

interface Row {
  key: string
  name: string
  faction: 0 | 1 | 2 | 3
  cls: string
  secondaryCls: string
  value: number
  color: string
  glow: string
}

export function EmpireStats({
  stats
}: {
  stats: { TR: number; NC: number; VS: number; NL?: number }
}) {
  const rows: Row[] = [
    { key: 'TR', name: 'Terran Republic', faction: 0, cls: 'faction-tr', secondaryCls: 'faction-tr-secondary', value: stats.TR, color: 'var(--color-tr-bright)', glow: 'var(--glow-tr)' },
    { key: 'NC', name: 'New Conglomerate', faction: 1, cls: 'faction-nc', secondaryCls: 'faction-nc-secondary', value: stats.NC, color: 'var(--color-nc-bright)', glow: 'var(--glow-nc)' },
    { key: 'VS', name: 'Vanu Sovereignty', faction: 2, cls: 'faction-vs', secondaryCls: 'faction-vs-secondary', value: stats.VS, color: 'var(--color-vs-bright)', glow: 'var(--glow-vs)' }
  ]
  // Black Ops: shown only when present.
  if ((stats.NL ?? 0) > 0) {
    rows.push({ key: 'BO', name: 'Black Ops', faction: 3, cls: '', secondaryCls: '', value: stats.NL as number, color: '#b8bcc4', glow: 'none' })
  }

  const total = rows.reduce((s, r) => s + r.value, 0)
  const data = rows.map((r) => ({ label: r.key, value: r.value, color: r.color, glow: r.glow }))

  return (
    <div className="flex items-stretch gap-4">
      {/* legend / population counts — left of the chart */}
      <ul className="flex-1 min-w-0 flex flex-col justify-center gap-2 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <EmpireLogo faction={r.faction} size={18} title={r.name} />
              <span
                className={`${r.cls} text-xs uppercase tracking-[0.18em] truncate`}
                style={r.cls ? undefined : { color: 'var(--text-secondary)' }}
              >
                {r.name}
              </span>
            </span>
            <span
              className={`${r.secondaryCls} tabular-nums`}
              style={r.secondaryCls ? undefined : { color: 'var(--text-muted)' }}
            >
              {r.value}
            </span>
          </li>
        ))}
        <li
          className="mt-1 pt-2 border-t flex items-baseline justify-between text-xs uppercase tracking-[0.18em]"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Total</span>
          <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {total}
          </span>
        </li>
      </ul>

      {/* scificn bar graph — right */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ width: 210, background: 'var(--surface)', clipPath: 'var(--clip-corner-md)' }}
      >
        <BarChart
          style={{ width: 210, background: 'transparent', border: 'none' }}
          data={data}
          orientation="vertical"
          title="Population"
        />
      </div>
    </div>
  )
}
