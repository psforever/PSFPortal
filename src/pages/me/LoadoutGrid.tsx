import { CELL_PX, gridPosition, type Container, type Holster } from '@/lib/exosuits'
import { factionClass } from '@/lib/factions'
import { ItemIcon, hasIcon, iconCells } from '@/components/ItemIcon'
import { itemLabel, type InventoryItem } from './ItemList'

/**
 * A loadout drawn the way the game draws it: the holster row, then the inventory grid, with every item
 * occupying its true footprint in cells.
 *
 * The grid geometry is not a guess -- it comes from the exosuit's own definition (see lib/exosuits),
 * and an item's size comes from the client registry's `icon_width`/`icon_height`. A Jackhammer really
 * does span nine cells across three, so a Reinforced loadout ends up looking like the one the player
 * arranged in game rather than like a table of names.
 */

/** One placed item, sized and positioned in cell units. */
function ItemTile({
  item,
  x,
  y,
  scale,
  faction,
  onHover
}: {
  item: InventoryItem
  x: number
  y: number
  scale: number
  /** The owning character's empire, used to colour the round count as the game does. */
  faction?: number
  onHover?: (i: InventoryItem | null) => void
}) {
  const w = item.w ?? 1
  const h = item.h ?? 1
  const label = itemLabel(item)

  return (
    <div
      className="absolute overflow-hidden border"
      style={{
        left: x * scale,
        top: y * scale,
        width: w * scale,
        height: h * scale,
        borderColor: 'var(--border-active)',
        background: 'var(--surface-raised)',
        clipPath: 'var(--clip-corner-sm)'
      }}
      title={item.info ? `${label}\n\n${item.info}` : label}
      onMouseEnter={() => onHover?.(item)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* The client's own traced artwork where it exists; the name where it does not, so an item
          without an icon is still identifiable rather than an empty box. */}
      {hasIcon(item.name) ? (
        <ItemIcon
          name={item.name}
          className="pointer-events-none absolute inset-0"
          // Equipment silhouettes draw in currentColor, so the tile decides their colour and they
          // follow the theme rather than carrying a baked-in one.
          style={{ color: 'var(--accent-primary)' }}
        />
      ) : (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center leading-tight"
          style={{ fontSize: Math.max(7, Math.min(10, scale * 0.42)), color: 'var(--accent-primary)' }}
        >
          {label}
        </span>
      )}
      {item.capacity !== undefined && (
        <span
          // The round count takes the owner's empire colour, matching how the game tints it, and it
          // sits over the artwork so it needs a shadow to stay legible against a light marking.
          className={`pointer-events-none absolute bottom-0 right-0.5 tabular-nums ${factionClass(faction)}`}
          style={{
            fontWeight: 900,
            fontSize: Math.max(13, scale * 0.64),
            // Heavier text over artwork needs a heavier shadow, or the stroke of a digit picks up the
            // outline behind it and the number smears.
            textShadow: '0 0 4px rgba(0,0,0,1), 0 1px 2px rgba(0,0,0,1)'
          }}
        >
          {item.capacity}
        </span>
      )}
    </div>
  )
}

/** An empty holster, or the weapon in it. */
function HolsterSlot({
  holster,
  item,
  scale,
  onHover
}: {
  holster: Holster
  item?: InventoryItem
  scale: number
  onHover?: (i: InventoryItem | null) => void
}) {
  // The slot is drawn at the size of whatever is IN it, because the artwork keeps its own aspect
  // ratio -- a pistol is 3x3 and stretching it across a 5-wide slot made it look like a carbine. An
  // empty holster falls back to a nominal size just to show the slot exists.
  // A melee weapon has no registry footprint, so fall back to the one derived from its artwork
  // before falling back to a nominal slot size.
  const derived = item ? iconCells(item.name) : null
  const nominal = holster.kind === 'Melee' ? 3 : holster.kind === 'Pistol' ? 3 : 9
  const w = item?.w ?? derived?.w ?? nominal
  const h = item?.h ?? derived?.h ?? 3
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
        {holster.kind}
      </span>
      <div
        className="relative border"
        style={{
          width: w * scale,
          height: h * scale,
          borderColor: item ? 'var(--border-active)' : 'var(--border)',
          background: item ? 'var(--surface-raised)' : 'transparent',
          clipPath: 'var(--clip-corner-sm)'
        }}
        title={item ? itemLabel(item) : `Empty ${holster.kind.toLowerCase()} holster`}
        onMouseEnter={() => item && onHover?.(item)}
        onMouseLeave={() => onHover?.(null)}
      >
        {item &&
          (hasIcon(item.name) ? (
            <ItemIcon
              name={item.name}
              className="absolute inset-0"
              style={{ color: 'var(--accent-primary)' }}
            />
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center px-0.5 text-center leading-tight"
              style={{ fontSize: Math.max(7, scale * 0.42), color: 'var(--accent-primary)' }}
            >
              {itemLabel(item)}
            </span>
          ))}
      </div>
    </div>
  )
}

export function LoadoutGrid({
  items,
  container,
  scale = CELL_PX,
  faction,
  onHover
}: {
  items: InventoryItem[]
  /** The exosuit inventory or vehicle trunk this loadout occupies. */
  container: Container
  /** Pixels per grid cell. Defaults to the client's own 17. */
  scale?: number
  /** The owning character's empire, used to colour round counts. */
  faction?: number
  onHover?: (i: InventoryItem | null) => void
}) {
  const suit = container
  const bySlot = new Map(items.map((i) => [i.slot, i]))

  const placed = items
    .map((i) => ({ item: i, pos: gridPosition(i.slot, suit.width, suit.offset) }))
    .filter((p): p is { item: InventoryItem; pos: { x: number; y: number } } => p.pos !== null)

  // An item whose slot lands outside this container's grid would otherwise be drawn overlapping the
  // edge or silently lost. That happens when a loadout was saved in a roomier suit than the one it
  // names, so list them instead of pretending the grid holds them.
  const overflow = placed.filter(
    (p) => p.pos.x + (p.item.w ?? 1) > suit.width || p.pos.y + (p.item.h ?? 1) > suit.height
  )
  const inGrid = placed.filter((p) => !overflow.includes(p))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* A vehicle trunk has no holsters, so this row simply does not render for one. */}
        {suit.holsters.map((h) => (
          <HolsterSlot key={h.slot} holster={h} item={bySlot.get(h.slot)} scale={scale} onHover={onHover} />
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            {suit.name} · {suit.width}×{suit.height}
          </span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {suit.holsters.length > 0 ? 'Inventory' : 'Contents'}
          </span>
        </div>

        <div
          className="relative border"
          style={{
            width: suit.width * scale,
            height: suit.height * scale,
            borderColor: 'var(--border)',
            // The cell grid itself, drawn as a repeating background so it costs one element rather
            // than one per cell -- a MAX trunk is 192 cells.
            backgroundImage:
              'linear-gradient(to right, var(--border) 1px, transparent 1px),' +
              'linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
            backgroundSize: `${scale}px ${scale}px`,
            opacity: 0.999
          }}
        >
          {inGrid.map(({ item, pos }) => (
            <ItemTile
              key={`${item.slot}-${item.objectId}`}
              item={item}
              x={pos.x}
              y={pos.y}
              scale={scale}
              faction={faction}
              onHover={onHover}
            />
          ))}
        </div>
      </div>

      {overflow.length > 0 && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {overflow.length === 1 ? '1 item sits' : `${overflow.length} items sit`} outside the{' '}
          {suit.name} grid: {overflow.map((p) => itemLabel(p.item)).join(', ')}
        </p>
      )}
    </div>
  )
}
