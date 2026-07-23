import { FACTIONS } from '@/lib/factions'

/**
 * Empire population: a legend of raw counts on the left, and a faction bar
 * graph on the right. Ported from the previous portal's EmpireStats.svelte
 * and re-themed to match the rest of the UI (navy surface, notched corners,
 * faction colours) instead of the original stark black/white box.
 *
 * Bar heights are `percentage * MAX_BAR_HEIGHT`, with a `min-height` stub so
 * an empire at 0% still shows a labelled bar. The bars grow via a CSS height
 * transition: the home page renders first with zero data and re-renders when
 * /api/stats resolves, so they animate up on load with no timer.
 */

const MAX_BAR_HEIGHT = 150
const GRAPH_HEIGHT = 190

type Empire = 'TR' | 'NC' | 'VS'

const EMPIRES = FACTIONS.filter((f): f is typeof f & { key: Empire } =>
  f.key === 'TR' || f.key === 'NC' || f.key === 'VS'
)

const BAR_LEFT: Record<Empire, string> = { TR: '10%', NC: '40%', VS: '70%' }
const BAR_BG: Record<Empire, string> = {
  TR: 'faction-tr-bg',
  NC: 'faction-nc-bg',
  VS: 'faction-vs-bg'
}

export function EmpireStats({ stats }: { stats: Record<Empire, number> }) {
  const total = stats.TR + stats.NC + stats.VS
  const denom = total || 1
  const pct = (key: Empire) => stats[key] / denom

  return (
    <div className="flex items-stretch gap-4">
      {/* legend / population counts — left of the chart */}
      <ul className="flex-1 min-w-0 flex flex-col justify-center gap-2 text-sm">
        {EMPIRES.map((e) => (
          <li key={e.key} className="flex items-baseline justify-between gap-3">
            <span className={`${e.cls} text-xs uppercase tracking-[0.18em]`}>{e.name}</span>
            <span className={`${e.secondaryCls} tabular-nums`}>{stats[e.key as Empire]}</span>
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

      {/* bar graph — right */}
      <div
        className="relative overflow-hidden shrink-0"
        style={{
          width: 210,
          height: GRAPH_HEIGHT,
          background: 'var(--background)',
          border: '1px solid var(--border)',
          clipPath: 'var(--clip-corner-md)'
        }}
      >
        {/* background logo loop */}
        <div
          aria-hidden
          className="absolute inset-0 z-0 bg-no-repeat bg-center"
          style={{ opacity: 0.28, backgroundImage: "url('/img/logo_crop.png')" }}
        />

        {/* teal baseline */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 w-full"
          style={{ height: 1, background: 'var(--border-active)', opacity: 0.6, zIndex: 1 }}
        />

        {/* bars */}
        {EMPIRES.map((e) => {
          const key = e.key as Empire
          return (
            <div
              key={key}
              className={`${BAR_BG[key]} absolute bottom-0 text-center z-[1]`}
              title={`${stats[key]} ${key}`}
              style={{
                left: BAR_LEFT[key],
                height: pct(key) * MAX_BAR_HEIGHT,
                minWidth: 48,
                minHeight: '2.75em',
                borderTop: '1px solid var(--border-active)',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                color: '#fff',
                textShadow: '1px 1px 2px #000',
                transition: 'height 1s cubic-bezier(0.33, 1, 0.68, 1)'
              }}
            >
              <strong className="text-xs">{key}</strong>
              <br />
              <span className="text-xs">{Math.round(pct(key) * 100)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
