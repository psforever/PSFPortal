import { useEffect, useState } from 'react'
import { hasIcon, ItemIcon } from '@/components/ItemIcon'
import { Panel } from '@/components/Panel'
import { DataTable, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'

/** How often the boards re-check for data (also their recovery cadence while a source is down). */
const REFRESH_MS = 60_000

/** Placeholder rows shown until the data source responds. */
function SkeletonRows({ trailing = 1 }: { trailing?: number }) {
  return (
    <div className="space-y-2.5 py-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4" style={{ width: `${45 + ((i * 13) % 34)}%` }} />
          <div className="flex gap-3">
            {Array.from({ length: trailing }, (_, j) => (
              <Skeleton key={j} className="h-4 w-10" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * One weapon's kills. `name` is the internal registry name (which keys the artwork) and `display` is
 * the client's own player-facing name; either can be absent for an object the tables do not cover.
 */
interface GunRow {
  weapon_id: number
  kills: number
  name?: string
  display?: string
}

/** One vehicle's kills, summed across every weapon it mounts. */
interface VehicleRow {
  vehicle: string
  name: string
  kills: number
  weapons: number
}

/**
 * A blank row used to pad the shorter weapon board out to the taller one's length.
 *
 * The two panels sit in the same grid row and are already stretched to the same height, so the
 * mismatch is not the box -- it is the content: a board with three rows next to one with fifteen
 * leaves most of its panel empty and reads as broken rather than as "there is less to show here".
 * Padding the rows makes the pair fill evenly whatever the data does.
 *
 * `message` carries the empty-state text on the first pad of a board that has no real rows at all,
 * so padding never costs the reader the explanation of why a board is blank.
 */
interface PadRow {
  pad: number
  message?: string
}

type Padded<T> = T | PadRow

function isPad<T>(row: Padded<T>): row is PadRow {
  return (row as PadRow).pad !== undefined
}

/**
 * Extend `rows` to `length` with blanks, keeping the empty-state text when there is nothing real.
 */
function padTo<T>(rows: T[] | null, length: number, empty: string): Padded<T>[] {
  const real: Padded<T>[] = rows ?? []
  const pads: Padded<T>[] = Array.from({ length: Math.max(0, length - real.length) }, (_, i) => ({
    pad: i,
    message: real.length === 0 && i === 0 ? empty : undefined
  }))
  return [...real, ...pads]
}

/** A padded row's cell: the empty-state line where there is one, otherwise nothing at all. */
function PadCell({ row }: { row: PadRow }) {
  return row.message ? (
    <span style={{ color: 'var(--text-muted)' }}>{row.message}</span>
  ) : (
    <span aria-hidden>&nbsp;</span>
  )
}
/**
 * Stats -- what is doing the killing, rather than who.
 *
 * Both boards come from one request: the world server counts kills per weapon and splits them in the
 * same pass, because deciding whether a weapon belongs to a vehicle needs the vehicle definitions
 * and a kill record never says what the killer was riding in. Asking twice would count the same rows
 * twice and could disagree with itself between the two answers.
 */
export function Stats() {
  const [guns, setGuns] = useState<GunRow[] | null>(null)
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api
        .get<{ guns: GunRow[]; vehicles: VehicleRow[] }>('/top_weapons')
        .then((w) => {
          if (cancelled) return
          setGuns(w.guns ?? [])
          setVehicles(w.vehicles ?? [])
        })
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Both boards render the same number of rows, so neither panel is left half empty beside the
  // other. Nothing is padded until both have answered -- padding against a board that is still
  // loading would settle on the wrong length and then jump.
  const weaponRows = guns && vehicles ? Math.max(guns.length, vehicles.length) : 0
  const gunRows = guns && vehicles ? padTo(guns, weaponRows, 'No weapon kills recorded yet.') : null
  const vehicleRows =
    guns && vehicles ? padTo(vehicles, weaponRows, 'No vehicle kills recorded yet.') : null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Top Guns">
        {!gunRows ? (
          <SkeletonRows />
        ) : (
          <DataTable
            rows={gunRows}
            rowKey={(g, i) => (isPad(g) ? `pad-${g.pad}` : g.weapon_id ?? i)}
            empty="No weapon kills recorded yet."
            columns={[
              {
                header: 'Weapon',
                cell: (g) =>
                  isPad(g) ? (
                    <PadCell row={g} />
                  ) : (
                    <span className="flex items-center gap-2">
                      {g.name && hasIcon(g.name) && (
                        <ItemIcon name={g.name} className="h-5 w-5 shrink-0" />
                      )}
                      {/* The client's own name where it has one; the registry name is the fallback,
                          and an id nothing names at all still reads as itself rather than blank. */}
                      <span>{g.display ?? g.name ?? `Object ${g.weapon_id}`}</span>
                    </span>
                  )
              },
              {
                header: 'Kills',
                align: 'right',
                cell: (g) => (isPad(g) ? '' : g.kills.toLocaleString())
              }
            ]}
          />
        )}
      </Panel>

      <Panel title="Top Vehicles" accent="tr">
        {!vehicleRows ? (
          <SkeletonRows />
        ) : (
          <DataTable
            rows={vehicleRows}
            rowKey={(v, i) => (isPad(v) ? `pad-${v.pad}` : (v.vehicle ?? i))}
            empty="No vehicle kills recorded yet."
            columns={[
              {
                header: 'Vehicle',
                cell: (v) =>
                  isPad(v) ? (
                    <PadCell row={v} />
                  ) : (
                    <span className="flex items-center gap-2">
                      {/* Keyed by the vehicle's INTERNAL name (`lightning`), not its label
                          ("Lightning") -- the shapes are filed under registry names. */}
                      {hasIcon(v.vehicle) && <ItemIcon name={v.vehicle} className="h-5 w-8 shrink-0" />}
                      <span>{v.name}</span>
                    </span>
                  )
              },
              {
                header: 'Weapons',
                align: 'right',
                cell: (v) =>
                  isPad(v) ? (
                    ''
                  ) : (
                    <span
                      style={{ color: 'var(--text-muted)' }}
                      title="Kills are summed across every weapon this vehicle mounts"
                    >
                      {v.weapons}
                    </span>
                  )
              },
              {
                header: 'Kills',
                align: 'right',
                cell: (v) => (isPad(v) ? '' : v.kills.toLocaleString())
              }
            ]}
          />
        )}
      </Panel>    </div>
  )
}
