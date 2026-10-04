import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'

/**
 * Randomize dialog: a triangular bias field (one empire per corner) plus a "lock home continents"
 * toggle.
 *
 * The draggable point's position is read as barycentric weights over the triangle, so it expresses
 * the full space of splits rather than just a direction:
 *   - on a corner      -> that empire 1.0, the others 0   (100% control)
 *   - at the centre     -> 1/3 each                        (balanced three-way)
 *   - on an edge midpoint -> 0.5 / 0.5, the third 0        (two-way split, third excluded)
 * The server floods each empire out from its sanctuary with a cost of distance / weight, so a weight
 * of 0 excludes that empire entirely and a higher weight pushes its front further.
 */

type Empire = 0 | 1 | 2

/** Math angles (deg, CCW from +x) for each empire corner. */
const ANGLE: Record<Empire, number> = { 0: 90, 1: 210, 2: 330 } // TR top, NC lower-left, VS lower-right
const META: Record<Empire, { key: string; color: string }> = {
  0: { key: 'TR', color: 'var(--color-tr-bright)' },
  1: { key: 'NC', color: 'var(--color-nc-bright)' },
  2: { key: 'VS', color: 'var(--color-vs-bright)' }
}

const CX = 100
const CY = 100
const R = 66
const rad = (deg: number) => (deg * Math.PI) / 180
const corner = (e: Empire): [number, number] => [
  CX + R * Math.cos(rad(ANGLE[e])),
  CY - R * Math.sin(rad(ANGLE[e]))
]
const A = corner(0)
const B = corner(1)
const C = corner(2)

/** Barycentric weights of a point over the TR/NC/VS triangle, clamped to >= 0 and normalised to 1. */
function weightsAt(px: number, py: number): Record<Empire, number> {
  const [ax, ay] = A
  const [bx, by] = B
  const [cx, cy] = C
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  let a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det
  let b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det
  let c = 1 - a - b
  a = Math.max(0, a)
  b = Math.max(0, b)
  c = Math.max(0, c)
  const s = a + b + c || 1
  return { 0: a / s, 1: b / s, 2: c / s }
}

export function RandomizeDialog({
  onClose,
  onApply,
  busy
}: {
  onClose: () => void
  onApply: (opts: { weights: Record<Empire, number>; lockHome: boolean }) => void
  busy: boolean
}) {
  // Start balanced (centre of the triangle).
  const [weights, setWeights] = useState<Record<Empire, number>>({ 0: 1 / 3, 1: 1 / 3, 2: 1 / 3 })
  const [lockHome, setLockHome] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragging = useRef(false)

  // Handle sits at the weighted average of the corners, so it always lies on/inside the triangle.
  const hx = weights[0] * A[0] + weights[1] * B[0] + weights[2] * C[0]
  const hy = weights[0] * A[1] + weights[1] * B[1] + weights[2] * C[1]

  const setFromEvent = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 200
    const y = ((e.clientY - rect.top) / rect.height) * 200
    setWeights(weightsAt(x, y))
  }

  const pct = (e: Empire) => Math.round(weights[e] * 100)

  return (
    <Modal title="Randomize continent control" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Drag the point. A corner gives that empire everything; the centre splits evenly; an edge
          splits between two empires and excludes the third.
        </p>

        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className="w-56 h-56 select-none touch-none"
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            setFromEvent(e)
          }}
          onPointerMove={(e) => dragging.current && setFromEvent(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          {/* triangle */}
          <polygon
            points={`${A[0]},${A[1]} ${B[0]},${B[1]} ${C[0]},${C[1]}`}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
          {/* corners, sized by their current weight */}
          {([0, 1, 2] as Empire[]).map((e) => {
            const [dx, dy] = corner(e)
            const [lx, ly] = [CX + (R + 16) * Math.cos(rad(ANGLE[e])), CY - (R + 16) * Math.sin(rad(ANGLE[e]))]
            return (
              <g key={e}>
                <circle cx={dx} cy={dy} r={4 + weights[e] * 10} fill={META[e].color} opacity={0.9} />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight="bold"
                  fill={META[e].color}
                >
                  {META[e].key}
                </text>
              </g>
            )
          })}
          {/* draggable handle */}
          <circle cx={hx} cy={hy} r={7} fill="var(--border-active)" stroke="var(--surface)" strokeWidth={1.5} />
        </svg>

        {/* computed split */}
        <div className="flex gap-4 text-xs tabular-nums">
          {([0, 1, 2] as Empire[]).map((e) => (
            <span key={e} style={{ color: META[e].color }}>
              {META[e].key} {pct(e)}%
            </span>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={lockHome} onChange={(e) => setLockHome(e.target.checked)} />
          Completely lock home continents (100% to their empire, then flood outward)
        </label>

        <div className="flex gap-2 self-stretch justify-end pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onApply({ weights, lockHome })} disabled={busy}>
            {busy ? 'Randomizing…' : 'Randomize'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
