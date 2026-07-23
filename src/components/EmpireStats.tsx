/**
 * Empire population as a bar graph, ported from the previous portal's
 * EmpireStats.svelte.
 *
 * Layout constants are carried over verbatim so it matches the original:
 * a 220x200 black box, three faction-gradient bars at 10%/40%/70% whose
 * heights are `percentage * MAX_BAR_HEIGHT`, over a low-opacity logo, with
 * `min-height` so an empire at 0% still shows a labelled stub.
 *
 * The bars grow via a CSS height transition. On the home page the component
 * first renders with zero data and then re-renders when /api/stats resolves,
 * so the transition animates the bars up on load without any timer.
 */

const MAX_BAR_HEIGHT = 165

type Empire = 'TR' | 'NC' | 'VS'

const EMPIRES: { key: Empire; bg: string; left: string }[] = [
  { key: 'TR', bg: 'faction-tr-bg', left: '10%' },
  { key: 'NC', bg: 'faction-nc-bg', left: '40%' },
  { key: 'VS', bg: 'faction-vs-bg', left: '70%' }
]

export function EmpireStats({ stats }: { stats: Record<Empire, number> }) {
  const total = stats.TR + stats.NC + stats.VS || 1
  const pct: Record<Empire, number> = {
    TR: stats.TR / total,
    NC: stats.NC / total,
    VS: stats.VS / total
  }

  return (
    <div
      className="relative overflow-hidden mx-auto"
      style={{ width: 220, height: 200, background: '#000', border: '1px solid #fff' }}
    >
      {/* background logo loop */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 bg-no-repeat bg-center"
        style={{ opacity: 0.4, backgroundImage: "url('/img/logo_crop.png')" }}
      />

      {/* header */}
      <div
        className="absolute top-0 left-0 w-full z-0 text-center text-sm"
        style={{
          background: '#fff',
          color: '#000',
          padding: '3px 0',
          borderBottom: '3px solid #000'
        }}
      >
        Empire %
      </div>

      {/* bars */}
      {EMPIRES.map((e) => (
        <div
          key={e.key}
          className={`${e.bg} absolute bottom-0 text-center`}
          title={`${stats[e.key]} ${e.key}`}
          style={{
            left: e.left,
            height: pct[e.key] * MAX_BAR_HEIGHT,
            minWidth: 50,
            minHeight: '3em',
            border: '1px solid #fff',
            borderBottom: 0,
            textShadow: '2px 2px #000',
            transition: 'height 1s cubic-bezier(0.33, 1, 0.68, 1)'
          }}
        >
          <strong>{e.key}</strong>
          <br />
          {Math.round(pct[e.key] * 100)}%
        </div>
      ))}
    </div>
  )
}
