import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { EMPIRES } from '@/lib/factions'
import { cn } from '@/lib/utils'

/**
 * Vehicles an administrator may place, mirroring the world server's own whitelist in
 * `CmdPlaceVehicle.Placeable`. Keep the two in step: a name only this list knows is rejected by the
 * server, and one only the server knows is simply unreachable from here.
 */
const VEHICLES: { group: string; items: { name: string; label: string }[] }[] = [
  {
    group: 'Ground',
    items: [
      { name: 'quadassault', label: 'Basilisk' },
      { name: 'quadstealth', label: 'Wraith' },
      { name: 'fury', label: 'Fury' },
      { name: 'lightning', label: 'Lightning' },
      { name: 'skyguard', label: 'Skyguard' },
      { name: 'prowler', label: 'Prowler' },
      { name: 'vanguard', label: 'Vanguard' },
      { name: 'magrider', label: 'Magrider' },
      { name: 'apc_tr', label: 'Juggernaut (TR APC)' },
      { name: 'apc_nc', label: 'Vindicator (NC APC)' },
      { name: 'apc_vs', label: 'Leviathan (VS APC)' },
      { name: 'ant', label: 'ANT' },
      { name: 'ams', label: 'AMS (mobile)' },
      { name: 'router', label: 'Router (mobile)' }
    ]
  },
  {
    group: 'Air',
    items: [
      { name: 'mosquito', label: 'Mosquito' },
      { name: 'lightgunship', label: 'Reaver' },
      { name: 'wasp', label: 'Wasp' },
      { name: 'liberator', label: 'Liberator' },
      { name: 'vulture', label: 'Vulture' },
      { name: 'dropship', label: 'Galaxy' },
      { name: 'galaxy_gunship', label: 'Galaxy Gunship' },
      { name: 'lodestar', label: 'Lodestar' },
      { name: 'phantasm', label: 'Phantasm' }
    ]
  }
]

const TITLES: Record<string, string> = {
  vehicle: 'Place Vehicle',
  ams: 'Place Deployed AMS',
  router: 'Place Deployed Router'
}

/**
 * Asks which empire a placement is for, and for a plain vehicle which vehicle.
 *
 * Empire is always asked rather than defaulted: a vehicle belongs to a faction the moment it exists,
 * and guessing it from the continent's owner would silently produce the wrong thing on a contested map.
 */
export function ConstructionDialog({
  kind,
  onCancel,
  onArm
}: {
  kind: 'vehicle' | 'ams' | 'router'
  onCancel: () => void
  /** Hands back the server's `kind` token, a human label, the empire, and whether a telepad follows. */
  onArm: (kind: string, label: string, faction: string, needsTelepad: boolean) => void
}) {
  const [vehicle, setVehicle] = useState('lightning')

  const label =
    kind === 'vehicle'
      ? (VEHICLES.flatMap((g) => g.items).find((v) => v.name === vehicle)?.label ?? vehicle)
      : kind === 'ams'
        ? 'deployed AMS'
        : 'deployed Router'

  const arm = (faction: string) =>
    onArm(kind === 'vehicle' ? `vehicle:${vehicle}` : kind, label, faction, kind === 'router')

  return (
    <Modal title={TITLES[kind] ?? 'Place'} onClose={onCancel}>
      {kind === 'vehicle' && (
        <label className="mb-4 block">
          <span
            className="mb-1 block text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Vehicle
          </span>
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
              background: 'var(--surface)'
            }}
          >
            {VEHICLES.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <div className="mb-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
        Empire
      </div>
      <div className="flex flex-wrap gap-2">
        {EMPIRES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => arm(e.key)}
            className={cn(
              'flex-1 rounded border px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-raised)]',
              e.cls
            )}
            style={{ borderColor: 'var(--border)' }}
          >
            {e.key}
            <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {e.name}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {kind === 'router'
          ? 'You will click the map twice: once for the Router, once for its telepad. Ground height and slope are taken from the terrain.'
          : kind === 'ams'
            ? 'You will click the map to place it. An AMS may only go on open terrain, not inside a facility.'
            : 'You will click the map to place it. Ground height and slope are taken from the terrain.'}
      </p>
    </Modal>
  )
}
