import { useMemo } from 'react'
import type { Continent, Facility } from '@/lib/types'

/**
 * Renders a continent as SVG: each facility's circular sphere-of-influence,
 * coloured by its current controlling empire, with a marker per facility.
 *
 * Phase 1 draws facilities + SOI over a plain themed field. The continent
 * terrain (water/land/lava from the extracted MPO grid) is a later phase --
 * the MPO grid and PSF facility coordinates still need calibration before the
 * terrain can be aligned under the facilities.
 *
 * Coordinates: facility x/y are PSF world units in [0, worldSize]; game Y is
 * north-up, so screen Y is flipped (worldSize - y).
 */

const FACTION: Record<number, { solid: string; soi: string; label: string }> = {
  0: { solid: '#e8472f', soi: 'rgba(200,47,28,0.20)', label: 'TR' },
  1: { solid: '#2f7fe8', soi: 'rgba(5,56,163,0.22)', label: 'NC' },
  2: { solid: '#8b5cf6', soi: 'rgba(84,49,214,0.24)', label: 'VS' }
}
const NEUTRAL = { solid: '#4d7fa3', soi: 'rgba(77,127,163,0.10)', label: '—' }

function factionOf(id: number, control: Record<number, number>) {
  const f = control[id]
  return f !== undefined && FACTION[f] ? FACTION[f] : NEUTRAL
}

const MARKER_R: Record<Facility['category'], number> = {
  major: 70,
  tower: 34,
  warpgate: 60,
  minor: 44
}

export function ContinentMap({
  continent,
  control,
  selectedId,
  onSelect
}: {
  continent: Continent
  control: Record<number, number>
  selectedId?: number
  onSelect?: (id: number) => void
}) {
  const size = continent.terrain.worldSize
  const flipY = (y: number) => size - y

  // Draw the largest SOIs first so small ones (towers) stay legible on top.
  const facilities = useMemo(
    () => [...continent.facilities].sort((a, b) => b.soi - a.soi),
    [continent.facilities]
  )

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-auto"
      style={{ background: 'var(--background)', maxHeight: '70vh' }}
      role="img"
      aria-label={`${continent.name} facility map`}
    >
      {/* faint reference grid */}
      <g stroke="var(--border)" strokeWidth={4} opacity={0.35}>
        {Array.from({ length: 9 }, (_, i) => (i * size) / 8).map((p) => (
          <g key={p}>
            <line x1={p} y1={0} x2={p} y2={size} />
            <line x1={0} y1={p} x2={size} y2={p} />
          </g>
        ))}
      </g>

      {/* SOI discs */}
      {facilities.map((f) => {
        const col = factionOf(f.id, control)
        return (
          <circle
            key={`soi-${f.id}`}
            cx={f.x}
            cy={flipY(f.y)}
            r={f.soi}
            fill={col.soi}
            stroke={col.solid}
            strokeWidth={selectedId === f.id ? 12 : 6}
            strokeOpacity={selectedId === f.id ? 1 : 0.7}
          />
        )
      })}

      {/* facility markers */}
      {facilities.map((f) => {
        const col = factionOf(f.id, control)
        const r = MARKER_R[f.category]
        return (
          <g
            key={`m-${f.id}`}
            onClick={() => onSelect?.(f.id)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <title>
              {f.name} — {f.type} ({col.label})
            </title>
            <circle
              cx={f.x}
              cy={flipY(f.y)}
              r={r}
              fill="var(--background)"
              stroke={col.solid}
              strokeWidth={10}
            />
            {f.category === 'major' && (
              <text
                x={f.x}
                y={flipY(f.y) - r - 20}
                textAnchor="middle"
                fontSize={90}
                fill="var(--text-secondary)"
                style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 12 }}
              >
                {f.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
