/**
 * Inline SVG empire emblems and the map hotspot marker, drawn as stylised vectors of the real
 * PlanetSide logos (see public/img/{tr,nc,vs}_med.png for the source art):
 *
 *   TR — downward red triangle with a black sword laid over it.
 *   NC — a flat vector trace of the real eagle badge, served from /img/nc_logo.svg.
 *   VS — green ring around a purple, three-pointed winged glyph.
 *   Black Ops (neutral) — a plain grey four-point spark.
 *
 * These scale cleanly to the tiny sizes the zone list uses, where the bitmap icons turn to mush.
 */

/** Faction brand colours, matching the --color-*-bright CSS variables. */
const C = {
  tr: '#e8472f',
  trEdge: '#141414',
  vs: '#c04dff',
  vsEdge: '#2a1147',
  vsRing: '#3fbf5a',
  neutral: '#b8bcc4',
  neutralEdge: '#5b606a',
  hotspot: '#d1a63a',
  hotspotEdge: '#856615'
} as const

/**
 * Points for a regular {points}-pointed star (or, with a shallow inner radius, a sunburst),
 * centred on (cx, cy). The first spike points straight up.
 */
function star(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const step = Math.PI / points
  const out: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + i * step
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return out.join(' ')
}

function svgProps(size: number, label: string | undefined) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    role: label ? ('img' as const) : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : true,
    className: 'inline-block align-middle shrink-0'
  }
}

function TR({ size, title }: { size: number; title?: string }) {
  // Inverted red triangle (black border) with a black sword straight down the middle -- no
  // crossguard, no facets: the simplest read of the emblem.
  return (
    <svg {...svgProps(size, title)}>
      {title && <title>{title}</title>}
      <path d="M2 14 L62 14 L32 63 Z" fill={C.trEdge} />
      <path d="M11 19 L53 19 L32 53 Z" fill={C.tr} />
      <path d="M32 3 L36 12 L36 57 L32 64 L28 57 L28 12 Z" fill={C.trEdge} />
    </svg>
  )
}

function NC({ size, title }: { size: number; title?: string }) {
  // The NC eagle badge is intricate (gear sunburst, navy head, star medallion, beak); a flat vector
  // trace of the real art reads far better than a hand-drawn approximation, so serve that asset.
  return (
    <img
      src="/img/nc_logo.svg"
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      className="inline-block align-middle shrink-0"
      style={{ objectFit: 'contain' }}
      draggable={false}
    />
  )
}

function VS({ size, title }: { size: number; title?: string }) {
  return (
    <svg {...svgProps(size, title)}>
      {title && <title>{title}</title>}
      <circle cx={32} cy={34} r={19} fill="none" stroke={C.vsRing} strokeWidth={4} />
      <g fill={C.vs} stroke={C.vsEdge} strokeWidth={1.5} strokeLinejoin="round">
        <path d="M32 7 L38 18 L32 28 L26 18 Z" />
        <path d="M30 26 L6 9 L26 31 Z" />
        <path d="M34 26 L58 9 L38 31 Z" />
        <path d="M32 24 L36.5 33 L32 62 L27.5 33 Z" />
      </g>
    </svg>
  )
}

function Neutral({ size, title }: { size: number; title?: string }) {
  return (
    <svg {...svgProps(size, title)}>
      {title && <title>{title}</title>}
      <polygon points={star(32, 32, 27, 9, 4)} fill={C.neutral} stroke={C.neutralEdge} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

/** The empire emblem for a faction id (0 TR, 1 NC, 2 VS, 3 Black Ops / neutral). */
export function EmpireLogo({
  faction,
  size = 16,
  title
}: {
  faction: 0 | 1 | 2 | 3
  size?: number
  title?: string
}) {
  switch (faction) {
    case 0:
      return <TR size={size} title={title} />
    case 1:
      return <NC size={size} title={title} />
    case 2:
      return <VS size={size} title={title} />
    default:
      return <Neutral size={size} title={title} />
  }
}

/** The map hotspot marker: the dim-gold eight-spike flash the game paints on the continent map. */
export function HotspotStar({
  size = 12,
  color = C.hotspot,
  title
}: {
  size?: number
  color?: string
  title?: string
}) {
  return (
    <svg {...svgProps(size, title)}>
      {title && <title>{title}</title>}
      <polygon
        points={star(32, 32, 30, 12.6, 8)}
        fill={color}
        stroke={C.hotspotEdge}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}
