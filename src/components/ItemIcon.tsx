import SHAPES from '@/lib/itemShapes.json'

interface Shape {
  w: number
  h: number
  /** Silhouette path. */
  o?: string
  /** Interior line work: boundaries between shaded regions, drawn unfilled. */
  e?: string
  /** The marking on an ammunition box's face, where the item has one. */
  s?: string
  /** Footprint in cells, derived from the art for objects the registry gives none (melee weapons). */
  cw?: number
  ch?: number
}

const SHAPE_MAP = (SHAPES as { shapes: Record<string, Shape> }).shapes

/** Whether traced artwork exists for an item, so a caller can fall back to a label. */
export function hasIcon(internalName: string): boolean {
  return internalName in SHAPE_MAP
}

/** The item's footprint in its own pixel space, for callers that need its true proportions. */
export function iconAspect(internalName: string): { w: number; h: number } | null {
  const s = SHAPE_MAP[internalName]
  return s ? { w: s.w, h: s.h } : null
}

/**
 * Footprint in grid cells derived from the artwork, for items the registry gives none.
 *
 * Melee weapons have no `icon_width` because they live in a holster rather than the grid, so their
 * slot has nothing to size itself from without this.
 */
export function iconCells(internalName: string): { w: number; h: number } | null {
  const s = SHAPE_MAP[internalName]
  return s?.cw && s.ch ? { w: s.cw, h: s.ch } : null
}

/**
 * An item's inventory artwork, traced from the client's own icon.
 *
 * Everything is drawn as a silhouette: a solid outline with a faint fill, in `currentColor` so it
 * takes the surrounding theme. At the size of an inventory cell a shaded miniature turns to mush,
 * whereas an outline stays readable.
 *
 * Ammunition additionally carries the marking from its face, drawn more strongly than the box. Those
 * glyphs are the only thing telling one box of rounds from another, so a bare outline would make every
 * box identical -- but reproducing the original's colours to keep them would defeat the point.
 *
 * Corners are rounded by the exporter, since the traced boundary follows pixel edges and would
 * otherwise render as a staircase.
 */
export function ItemIcon({
  name,
  className,
  style
}: {
  name: string
  className?: string
  style?: React.CSSProperties
}) {
  const shape = SHAPE_MAP[name]
  if (!shape || !shape.o) return null

  return (
    <svg
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      className={className}
      style={style}
      // The icon's own aspect ratio is preserved; a caller that wants it to fill a differently-shaped
      // box should size that box to match, not stretch the artwork.
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={shape.o}
        fill="currentColor"
        fillOpacity={0.16}
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        // The viewBox is scaled to the tile, which would scale the stroke with it and leave large
        // items outlined far more heavily than small ones. This keeps every outline one pixel.
        vectorEffect="non-scaling-stroke"
      />
      {/* Interior structure, stroked only. Lighter than the silhouette so it reads as detail within
          the shape rather than competing with its outline. */}
      {shape.e && (
        <path
          d={shape.e}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={0.75}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {shape.s && (
        <path d={shape.s} fill="currentColor" fillOpacity={0.85} stroke="none" />
      )}
    </svg>
  )
}
