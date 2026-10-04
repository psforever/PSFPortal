import { useEffect, useState } from 'react'
import { MarqueeText } from '@/components/MarqueeText'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { lockerContainer } from '@/lib/exosuits'
import { ItemList, itemLabel, type InventoryItem } from './ItemList'
import { LoadoutGrid } from './LoadoutGrid'

interface LockerResponse {
  avatar: { id: number; name: string }
  items: InventoryItem[]
}

/**
 * One character's locker, drawn as the grid it actually is.
 *
 * The locker is a standalone 30x20 container (`LockerContainer`'s `GridInventory(30, 20)`), with no
 * holsters and raw slot indices -- so unlike an exosuit its grid starts at slot 0. It is much wider
 * than a loadout grid, so it scrolls horizontally rather than being scaled down to illegibility.
 *
 * The character is chosen by navigation, not by a picker.
 */
export function LockerView({ avatarId, faction }: { avatarId: number; faction?: number }) {
  const [locker, setLocker] = useState<LockerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<InventoryItem | null>(null)

  useEffect(() => {
    let cancelled = false
    setLocker(null)
    setError(null)
    setHovered(null)

    api
      .get<LockerResponse>(`/me/characters/${avatarId}/locker`)
      .then((r) => {
        if (!cancelled) setLocker(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load locker')
      })

    return () => {
      cancelled = true
    }
  }, [avatarId])

  if (error) return <Alert kind="error">{error}</Alert>
  if (!locker) return <Spinner label="Loading locker" />

  if (locker.items.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>This locker is empty.</p>
  }

  return (
    <div className="space-y-4">
      {/* The detail panel is a fixed-width column beside the grid, not a block beneath it, so hovering
        an item cannot reflow the page under the pointer. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <LoadoutGrid
            items={locker.items}
            container={lockerContainer()}
            faction={faction}
            onHover={setHovered}
          />
        </div>

        <div className="w-full shrink-0 lg:w-56" style={{ minHeight: 260 }}>
          <div
            className="mb-2 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Item
          </div>
          {hovered ? (
            <>
              <div className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                {itemLabel(hovered)}
              </div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {hovered.type ?? hovered.className}
                {hovered.w && hovered.h ? ` · ${hovered.w}×${hovered.h}` : ''}
                {hovered.capacity !== undefined ? ` · ${hovered.capacity} rounds` : ''}
              </div>
              {hovered.ammo && hovered.ammo.length > 0 && (
                <div className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
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
      </div>

      <details>
        <summary
          className="cursor-pointer text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--text-muted)' }}
        >
          As a list
        </summary>
        <div className="mt-2">
          <ItemList items={locker.items} empty="This locker is empty." />
        </div>
      </details>
    </div>
  )
}
