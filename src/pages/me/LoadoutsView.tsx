import { useEffect, useState } from 'react'
import { MarqueeText } from '@/components/MarqueeText'
import { Modal } from '@/components/Modal'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { ItemList, itemLabel, type InventoryItem } from './ItemList'
import { LoadoutGrid } from './LoadoutGrid'
import { suitContainer, trunkContainer, type Container } from '@/lib/exosuits'

interface InfantryLoadout {
  number: number
  name: string
  exosuit: string
  exosuit_id: number
  items: InventoryItem[]
}

interface VehicleLoadout {
  number: number
  name: string
  vehicle_id: number
  vehicle?: string
  /** Internal name (`apc_nc`), which keys the trunk-dimension table. */
  vehicle_name?: string
  items: InventoryItem[]
}

interface LoadoutsResponse {
  avatar: { id: number; name: string }
  infantry: InfantryLoadout[]
  vehicles: VehicleLoadout[]
}

/** An unnamed favourite is normal -- the client lets you save one without typing a name. */
function loadoutTitle(name: string, slot: number) {
  return name?.trim() ? name : `Favourite ${slot + 1}`
}

/**
 * One row in the loadout list.
 *
 * A loadout is summarised rather than expanded here: the interesting thing about it is the
 * arrangement, and that only reads at grid size, so the detail lives in a dialog instead of stacking
 * a dozen tables down the page.
 */
function LoadoutRow({
  slot,
  name,
  subtitle,
  count,
  onOpen
}: {
  slot: number
  name: string
  subtitle: string
  count: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-baseline justify-between gap-3 border px-3 py-2 text-left transition-colors hover:bg-[var(--surface-raised)]"
      style={{ borderColor: 'var(--border)', clipPath: 'var(--clip-corner-sm)' }}
    >
      <span className="min-w-0">
        <span className="text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>
          {loadoutTitle(name, slot)}
        </span>
        <span
          className="ml-2 text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {subtitle}
        </span>
      </span>
      <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
        {count} item{count === 1 ? '' : 's'} &rsaquo;
      </span>
    </button>
  )
}

/** The equipment layout for one loadout, at grid scale, with the hovered item's detail beneath. */
function LoadoutModal({
  title,
  subtitle,
  container,
  items,
  faction,
  onClose
}: {
  title: string
  subtitle: string
  /** Null when the vehicle's trunk size is unknown -- the grid is then not drawn at all. */
  container: Container | null
  items: InventoryItem[]
  faction?: number
  onClose: () => void
}) {
  const [hovered, setHovered] = useState<InventoryItem | null>(null)

  // The hint lives in the docked side panel rather than under the grid. Putting it inline made the
  // dialog grow and re-centre every time the pointer crossed an item, which moved the very grid you
  // were pointing at. A fixed-size panel to the right cannot disturb the dialog's layout at all.
  // Fixed height, always. The panel is docked at the dialog's own height, so anything that grows here
  // resizes and re-centres the dialog -- which moves the grid out from under the pointer that is
  // hovering it. Long descriptions marquee inside the box instead of enlarging it.
  const hint = (
    <div className="flex w-56 flex-col text-xs" style={{ height: 260 }}>
      <div
        className="mb-2 shrink-0 text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'var(--text-muted)' }}
      >
        Item
      </div>
      {hovered ? (
        <>
          <div className="shrink-0" style={{ color: 'var(--accent-primary)' }}>
            {itemLabel(hovered)}
          </div>
          <div className="mt-1 shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {hovered.type ?? hovered.className}
            {hovered.w && hovered.h ? ` · ${hovered.w}×${hovered.h}` : ''}
            {hovered.capacity !== undefined ? ` · ${hovered.capacity} rounds` : ''}
          </div>
          {hovered.ammo && hovered.ammo.length > 0 && (
            <div className="mt-1 shrink-0 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {hovered.ammo
                .filter((a) => a.display)
                .map((a) => `${a.display} ×${a.magazine}`)
                .join(', ')}
            </div>
          )}
          {hovered.info && (
            <MarqueeText height={168} className="mt-2">
              <p
                className="whitespace-pre-line text-[11px] leading-snug"
                style={{ color: 'var(--text-secondary)' }}
              >
                {hovered.info}
              </p>
            </MarqueeText>
          )}
        </>
      ) : (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Hover an item in the grid for its details.
        </p>
      )}
    </div>
  )

  return (
    <Modal title={title} onClose={onClose} wide sidePanel={hint}>
      <p
        className="mb-3 text-[10px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {subtitle}
      </p>

      {/* No scroller around the grid: the dialog is sized to its content, so it is never clipped. */}
      {container ? (
        <LoadoutGrid
          items={items}
          container={container}
          scale={22}
          faction={faction}
          onHover={setHovered}
        />
      ) : (
        <Alert kind="info">
          No trunk dimensions are known for this vehicle, so its contents cannot be laid out. The list
          below is complete.
        </Alert>
      )}

      <details className="mt-3">
        <summary
          className="cursor-pointer text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted)' }}
        >
          As a list
        </summary>
        <div className="mt-2">
          <ItemList items={items} empty="This loadout is empty." />
        </div>
      </details>
    </Modal>
  )
}

/**
 * One character's saved loadouts, of a single kind.
 *
 * Infantry and vehicle loadouts are separate views rather than two groups in one, because they are
 * separate things in the game: a character has ten of each, numbered independently, saved at
 * different terminals. Showing them stacked made the second kind easy to miss.
 */
export function LoadoutsView({
  avatarId,
  kind,
  faction
}: {
  avatarId: number
  kind: 'infantry' | 'vehicles'
  faction?: number
}) {
  const [loadouts, setLoadouts] = useState<LoadoutsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadouts(null)
    setError(null)
    setOpen(null)

    api
      .get<LoadoutsResponse>(`/me/characters/${avatarId}/loadouts`)
      .then((r) => {
        if (!cancelled) setLoadouts(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load loadouts')
      })

    return () => {
      cancelled = true
    }
  }, [avatarId])

  if (error) return <Alert kind="error">{error}</Alert>
  if (!loadouts) return <Spinner label="Loading loadouts" />

  if (kind === 'infantry') {
    if (loadouts.infantry.length === 0) {
      return (
        <p style={{ color: 'var(--text-secondary)' }}>
          No saved infantry loadouts. Save a favourite at an equipment terminal in game.
        </p>
      )
    }

    const shown = loadouts.infantry.find((l) => l.number === open)

    return (
      <>
        <div className="space-y-2">
          {loadouts.infantry.map((l) => (
            <LoadoutRow
              key={l.number}
              slot={l.number}
              name={l.name}
              subtitle={l.exosuit}
              count={l.items.length}
              onOpen={() => setOpen(l.number)}
            />
          ))}
        </div>

        {shown && (
          <LoadoutModal
            title={loadoutTitle(shown.name, shown.number)}
            subtitle={shown.exosuit}
            container={suitContainer(shown.exosuit_id)}
            items={shown.items}
            faction={faction}
            onClose={() => setOpen(null)}
          />
        )}
      </>
    )
  }

  if (loadouts.vehicles.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)' }}>
        No saved vehicle loadouts. Save a favourite at a vehicle terminal in game.
      </p>
    )
  }

  const shown = loadouts.vehicles.find((l) => l.number === open)

  return (
    <>
      <div className="space-y-2">
        {loadouts.vehicles.map((l) => (
          <LoadoutRow
            key={l.number}
            slot={l.number}
            name={l.name}
            subtitle={l.vehicle ?? `Vehicle ${l.vehicle_id}`}
            count={l.items.length}
            onOpen={() => setOpen(l.number)}
          />
        ))}
      </div>

      {shown && (
        <LoadoutModal
          title={loadoutTitle(shown.name, shown.number)}
          subtitle={shown.vehicle ?? `Vehicle ${shown.vehicle_id}`}
          // Each vehicle has its OWN trunk size, from the server's own definitions -- 11x7 for a
          // Phantasm, 20x16 for a Sunderer -- and trunks start at slot 30, not an exosuit's 6.
          container={trunkContainer(shown.vehicle_name, shown.vehicle)}
          items={shown.items}
          faction={faction}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
