import { DataTable } from '@/components/ui'

/** One decoded inventory item, as returned by the /me endpoints. Mirrors api/inventory.ts's DecodedItem. */
export interface InventoryItem {
  slot: number
  objectId: number
  className: string
  name: string
  display?: string
  type?: string
  ammo?: { slot: number; typeIndex: number; typeId: number; magazine: number; name?: string; display?: string }[]
  capacity?: number
  info?: string
  /** Inventory footprint in grid cells, used to place the item on the equipment grid. */
  w?: number
  h?: number
}

/**
 * A player-facing name for an item.
 *
 * Falls back to the internal registry name when the client never gave the object a display name. That
 * is not a failure worth hiding: engine-internal objects legitimately have no player-facing name, and
 * showing `apc_ballgun_l` is far more useful than showing a bare id or an empty cell.
 */
export function itemLabel(item: { display?: string; name: string }) {
  return item.display ?? item.name
}

/**
 * Ammunition loaded in an item, rendered as `Name ×25` per magazine.
 *
 * Ammo types the client never gave a display name to are dropped rather than shown under their
 * internal name. Those are bookkeeping entries, not things a player carries -- a melee weapon holds a
 * magazine of `melee_ammo`, which the game itself never surfaces, and printing it would just be noise
 * next to every knife. An unnamed ITEM still falls back to its internal name (see itemLabel); the
 * difference is that an item is always something the player owns, whereas this is an implementation
 * detail of how it fires.
 */
function ammoSummary(item: InventoryItem) {
  const named = item.ammo?.filter((a) => a.display) ?? []
  if (named.length > 0) {
    return named.map((a) => `${a.display} ×${a.magazine}`).join(', ')
  }
  if (item.capacity !== undefined) return `×${item.capacity}`
  return '—'
}

/** Shared table for locker contents and loadout contents. */
export function ItemList({ items, empty }: { items: InventoryItem[]; empty: string }) {
  return (
    <DataTable
      rows={items}
      rowKey={(i) => `${i.slot}-${i.objectId}`}
      empty={empty}
      columns={[
        { header: 'Slot', align: 'right', cell: (i) => i.slot },
        {
          header: 'Item',
          cell: (i) => (
            // The client's own tooltip text, where it has one.
            <span title={i.info ?? undefined}>{itemLabel(i)}</span>
          )
        },
        {
          header: 'Type',
          cell: (i) => (
            <span style={{ color: 'var(--text-muted)' }}>{i.type ?? i.className}</span>
          )
        },
        { header: 'Ammo', align: 'right', cell: (i) => ammoSummary(i) }
      ]}
    />
  )
}
