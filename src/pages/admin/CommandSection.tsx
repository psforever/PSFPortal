import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, Button, DataTable, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { factionByKey, factionClass } from '@/lib/factions'

/** How often the squad list re-reads; also its recovery cadence while the world server is down. */
const REFRESH_MS = 15_000

/** One occupied position in a squad. */
interface SquadMember {
  position: number
  char_id: number
  name: string
  role: string
  zone_id: number
  health: number
  armor: number
}

interface Squad {
  id: number
  faction: string
  leader: string
  leader_char_id: number
  task: string
  zone_id: number
  size: number
  capacity: number
  /** Whether the squad is advertised in its faction's squad list. */
  listed: boolean
  members: SquadMember[]
}

/**
 * World Server Management -> Command.
 *
 * Squad administration. Squads live only in the world server's memory -- there is no squad table and
 * nothing else can see one -- so this is the only view of them that exists, and the only way to act
 * on one from outside the game.
 *
 * ==On platoons==
 * PlanetSide's platoon (three squads under one leader) is NOT implemented in this server. `Platoon`
 * survives only as a chat channel and a first-time-event name; there is no platoon entity, no
 * grouping of squads, and consequently nothing to administer. This page covers squads because squads
 * are the whole of what exists -- a platoon section here would be an empty frame around nothing.
 */
export function CommandSection() {
  const [squads, setSquads] = useState<Squad[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(() => {
    api
      .get<{ count: number; squads: Squad[] }>('/squads')
      .then((r) => {
        setSquads(r.squads ?? [])
        setUnavailable(false)
      })
      .catch(() => {
        setUnavailable(true)
        // Keep the last known list rather than blanking the table on one failed poll.
        setSquads((prev) => prev ?? [])
      })
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  /** Run one mutation, then re-read rather than guessing at the result. */
  const act = async (key: string, path: string, success: string) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await api.post(path)
      setNotice(success)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The world server refused that.')
    } finally {
      setBusy(null)
    }
  }

  const empire = (faction: string) => factionByKey(faction)?.key ?? faction

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {unavailable && (
        <Alert kind="info">
          The world server is not answering. Showing the last squads it reported.
        </Alert>
      )}

      <Panel title="Squads" accent="vs">
        {!squads ? (
          <Spinner label="Reading squads" />
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Squads are held in the world server&apos;s memory and are gone when it restarts —
              there is no squad table to fall back on. Disbanding and removing go through the game&apos;s
              own squad handling, so channels, the faction squad list and an emptied squad closing
              itself all happen exactly as they would in play.
            </p>
            <DataTable
              rows={squads}
              rowKey={(s) => s.id}
              empty="No squads are formed right now."
              isRowActive={(s) => s.id === expanded}
              renderExpanded={(s) =>
                s.id === expanded ? (
                  <div className="border-l-2 bg-[var(--background)] px-4 py-3" style={{ borderColor: 'var(--border-active)' }}>
                    <DataTable
                      rows={s.members}
                      rowKey={(m) => m.char_id}
                      empty="This squad has no members."
                      columns={[
                        { header: 'Slot', cell: (m) => m.position + 1 },
                        {
                          header: 'Character',
                          cell: (m) => (
                            <span className="flex items-center gap-2">
                              <span className={factionClass(factionByKey(s.faction)?.id)}>{m.name}</span>
                              {m.char_id === s.leader_char_id && (
                                <span
                                  className="text-[9px] uppercase tracking-[0.18em]"
                                  style={{ color: 'var(--accent-primary)' }}
                                >
                                  Leader
                                </span>
                              )}
                            </span>
                          )
                        },
                        {
                          header: 'Role',
                          cell: (m) => (
                            <span style={{ color: 'var(--text-muted)' }}>{m.role || '—'}</span>
                          )
                        },
                        { header: 'Zone', cell: (m) => m.zone_id },
                        {
                          header: 'Health',
                          align: 'right',
                          cell: (m) => `${m.health} / ${m.armor}`
                        },
                        {
                          header: '',
                          align: 'right',
                          cell: (m) => (
                            <Button
                              variant="ghost"
                              disabled={busy !== null}
                              onClick={() =>
                                void act(
                                  `remove:${m.char_id}`,
                                  `/squads/members/${m.char_id}/remove`,
                                  `${m.name} removed from squad #${s.id}.`
                                )
                              }
                            >
                              {busy === `remove:${m.char_id}` ? 'Removing…' : 'Remove'}
                            </Button>
                          )
                        }
                      ]}
                    />
                  </div>
                ) : null
              }
              columns={[
                {
                  header: 'Squad',
                  cell: (s) => (
                    <button
                      onClick={() => setExpanded((cur) => (cur === s.id ? null : s.id))}
                      aria-expanded={expanded === s.id}
                      className="text-left font-mono text-xs hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      #{s.id}
                    </button>
                  )
                },
                {
                  header: 'Empire',
                  cell: (s) => (
                    <span className={factionClass(factionByKey(s.faction)?.id)}>{empire(s.faction)}</span>
                  )
                },
                {
                  header: 'Leader',
                  cell: (s) => (
                    <Link to={`/avatar/${s.leader_char_id}`} style={{ color: 'var(--text-secondary)' }}>
                      {s.leader || '—'}
                    </Link>
                  )
                },
                {
                  header: 'Task',
                  cell: (s) => (
                    <span style={{ color: 'var(--text-muted)' }}>{s.task || '—'}</span>
                  )
                },
                { header: 'Zone', cell: (s) => s.zone_id },
                {
                  header: 'Size',
                  align: 'right',
                  /*
                   * `capacity` is how many of the ten positions are ENABLED, not how many are empty.
                   *
                   * That distinction cost a wrong denominator: `Squad.Availability` is a separate
                   * flag from occupancy -- a leader may close a position, but filling one does not
                   * clear its availability -- so `size + capacity` double-counted every occupied
                   * slot and showed a two-man squad as "2 / 12". A squad is ten, always:
                   * `Squad.Membership` is a fixed `Array.fill[Member](10)`.
                   */
                  cell: (s) => (
                    <span
                      title={
                        s.capacity < 10
                          ? `${s.capacity} of 10 positions enabled by the leader`
                          : 'All 10 positions enabled'
                      }
                    >
                      {s.size} / {s.capacity}
                    </span>
                  )
                },
                {
                  header: 'Listed',
                  cell: (s) =>
                    s.listed ? (
                      <span style={{ color: 'var(--accent-primary)' }} title="Advertised in the faction squad list">
                        Yes
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )
                },
                {
                  header: 'Actions',
                  align: 'right',
                  cell: (s) => (
                    <Button
                      variant="danger"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(`disband:${s.id}`, `/squads/${s.id}/disband`, `Squad #${s.id} disbanded.`)
                      }
                    >
                      {busy === `disband:${s.id}` ? 'Disbanding…' : 'Disband'}
                    </Button>
                  )
                }
              ]}
            />
          </>
        )}
      </Panel>

      <Panel title="Platoons">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Platoons are not implemented by this server. In retail PlanetSide a platoon is three squads
          under one leader; here <span className="font-mono">Platoon</span> exists only as a chat
          channel, with no platoon entity and no grouping of squads behind it — so there is nothing to
          administer yet. This panel is a placeholder for when there is.
        </p>
      </Panel>
    </div>
  )
}
