import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '@/components/Panel'
import { Alert, Button, DataTable } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  type CapturedPacket,
  type CaptureState,
  type OpcodeEntry,
  TIERS,
  clearReview,
  directionOf,
  download,
  loadReview,
  saveReview,
  senderLabel,
  tierOf,
  toCsv,
  uidOf
} from '@/lib/packets'
import { PacketDetail } from './PacketDetail'

/**
 * How often the page renews its place and collects what has arrived.
 *
 * Comfortably inside the world server's twenty-second lease, so an ordinary collection never lets it
 * lapse -- while a tab that has been backgrounded gets its timers throttled, misses the renewal, and
 * has its capture stopped for it. That is the intended behaviour rather than a wrinkle: capture
 * should not outlive somebody actually watching it.
 */
const POLL_MS = 3_000

/** Ceiling on the page's own history, so a long session cannot exhaust the browser instead. */
const MAX_HISTORY = 5_000

/** Newest first, and only ever this many rows in the table at once. */
const MAX_ROWS = 400

function fmtWhen(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** A short, stable id for this tab, so the world server can tell one watcher from another. */
function newViewerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `viewer-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Audit -> Packet Review.
 *
 * Choose opcodes, collect what the world server sees on them, and read each specimen either as the
 * raw stream or as the class the login server decodes it into. Uncharted opcodes -- the ones with no
 * layout worked out yet -- have no class to show, which is the point: the field designer lets you lay
 * a layout over the bytes, watch the values it produces, and generate the packet diagram and the
 * Scala class from it.
 *
 * ==Nothing is captured unless this page is open==
 * The world server captures only while at least one page keeps saying it is watching. Stopping
 * collection, navigating away or closing the tab all end it, and there is deliberately no way to arm
 * capture and walk off, because that would leave a live server accumulating player traffic
 * indefinitely. Several admins watching at once share one capture rather than each provoking their
 * own; each reads the same window at its own pace.
 *
 * ==What is never captured==
 * The opcodes carrying an account password or a session token are refused by the world server and
 * shown here as unselectable. That is enforced there, not here.
 */
export function PacketReviewSection() {
  const viewer = useRef<string>(newViewerId())
  /**
   * Always starts at zero, even when a previous session's packets were restored.
   *
   * The world server resets its counter whenever the last watcher leaves, so a cursor carried across
   * a reload could point past the start of a fresh run and silently skip everything before it.
   * Re-reading from the beginning of the window costs one duplicate page, which the merge discards.
   */
  const cursor = useRef<number>(0)

  // Read once, before first paint, so a reload comes back with what it had rather than flashing empty.
  const restored = useRef(loadReview())

  const [opcodes, setOpcodes] = useState<OpcodeEntry[] | null>(null)
  const [state, setState] = useState<CaptureState | null>(null)
  const [collecting, setCollecting] = useState(restored.current?.collecting ?? false)
  const [packets, setPackets] = useState<CapturedPacket[]>(restored.current?.packets ?? [])
  /** The open specimen, by uid rather than id: ids restart per capture run, uids do not. */
  const [selectedUid, setSelectedUid] = useState<string | null>(restored.current?.selectedUid ?? null)
  const [error, setError] = useState('')
  const [gap, setGap] = useState(false)

  const [space, setSpace] = useState<'game' | 'control'>(restored.current?.space ?? 'game')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<{ game: Set<number>; control: Set<number> }>(() => ({
    game: new Set(restored.current?.chosen.game ?? []),
    control: new Set(restored.current?.chosen.control ?? [])
  }))

  // `collecting` and `chosen` are read inside the interval callback; refs keep it from having to be
  // torn down and rebuilt on every keystroke in the picker.
  const collectingRef = useRef(collecting)
  const chosenRef = useRef(chosen)
  useEffect(() => {
    collectingRef.current = collecting
  }, [collecting])
  useEffect(() => {
    chosenRef.current = chosen
  }, [chosen])

  // Persist on every change, so a reload at any moment comes back to where it was. Only Clear
  // removes it -- navigating away, refreshing or the world server restarting all leave it intact.
  useEffect(() => {
    saveReview({
      packets,
      chosen: { game: [...chosen.game], control: [...chosen.control] },
      selectedUid,
      collecting,
      space
    })
  }, [packets, chosen, selectedUid, collecting, space])

  useEffect(() => {
    api
      .get<{ opcodes: OpcodeEntry[]; state: CaptureState | null }>('/packets/opcodes')
      .then((r) => {
        setOpcodes(r.opcodes ?? [])
        setState(r.state)
      })
      .catch(() => setError('The world server is not reachable, so no capture can be started.'))
  }, [])

  /** Renew this page's place, then take whatever has arrived since the last collection. */
  const poll = useCallback(async () => {
    const sel = chosenRef.current
    try {
      await api.post('/packets/subscribe', {
        viewer: viewer.current,
        game: [...sel.game],
        control: [...sel.control]
      })
      const r = await api.get<{
        packets: CapturedPacket[]
        cursor: number
        oldest: number
        state: CaptureState | null
      }>(`/packets?viewer=${encodeURIComponent(viewer.current)}&since=${cursor.current}&limit=500`)

      // The window on the server holds only so much. If its oldest specimen is newer than where this
      // page had got to, packets went past between collections and were evicted before being read.
      if (cursor.current > 0 && r.oldest > cursor.current + 1) setGap(true)

      cursor.current = r.cursor ?? cursor.current
      setState(r.state)
      if (r.packets.length > 0) {
        setPackets((prev) => {
          // Re-reading from the start of the window after a reload can hand back specimens already
          // held, so the merge is by uid rather than trusting the cursor not to overlap.
          const seen = new Set(prev.map(uidOf))
          const fresh = r.packets.filter((p) => !seen.has(uidOf(p)))
          if (fresh.length === 0) return prev
          const next = [...fresh.reverse(), ...prev]
          return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next
        })
      }
      setError('')
    } catch (e) {
      setError('Collection was interrupted. The world server may be restarting.')
    }
  }, [])

  useEffect(() => {
    if (!collecting) return
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [collecting, poll])

  /** Give up this page's place at once, rather than letting the lease lapse. */
  const leave = useCallback(() => {
    // `keepalive` so the request still goes out when this fires during a page teardown, where an
    // ordinary fetch would be cancelled along with the document.
    void fetch('/api/packets/leave', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewer: viewer.current }),
      keepalive: true
    }).catch(() => {})
  }, [])

  // Leaving the page stops capture: navigating away unmounts this, and closing the tab fires
  // pagehide. The lease is the backstop for the cases neither of those reaches, such as losing the
  // network -- the world server drops the watcher on its own shortly after it stops hearing from us.
  useEffect(() => {
    const onHide = () => {
      if (collectingRef.current) leave()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [leave])

  const start = () => {
    setGap(false)
    cursor.current = 0
    setCollecting(true)
  }

  /** The only thing that discards collected packets. */
  const clearAll = () => {
    setPackets([])
    setSelectedUid(null)
    cursor.current = 0
    clearReview()
  }

  const stop = () => {
    setCollecting(false)
    leave()
  }

  const toggle = (entry: OpcodeEntry) => {
    if (entry.redacted) return
    setChosen((prev) => {
      const set = new Set(prev[entry.space])
      if (set.has(entry.opcode)) set.delete(entry.opcode)
      else set.add(entry.opcode)
      return { ...prev, [entry.space]: set }
    })
  }

  const inSpace = useMemo(
    () => (opcodes ?? []).filter((o) => o.space === space),
    [opcodes, space]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return inSpace
    return inSpace.filter(
      (o) => o.name.toLowerCase().includes(q) || String(o.opcode) === q || o.label.toLowerCase().includes(q)
    )
  }, [inSpace, search])

  const selectedCount = chosen.game.size + chosen.control.size

  /** Arm every opcode in this space that has no layout yet -- the ones worth reviewing. */
  const selectUncharted = () => {
    setChosen((prev) => ({
      ...prev,
      [space]: new Set(inSpace.filter((o) => !o.charted && !o.redacted).map((o) => o.opcode))
    }))
  }

  const clearSpace = () => setChosen((prev) => ({ ...prev, [space]: new Set() }))

  const rows = useMemo(() => packets.slice(0, MAX_ROWS), [packets])

  const exportCsv = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    download(`packet-review-${stamp}.csv`, toCsv(packets), 'text/csv;charset=utf-8')
  }

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {gap && (
        <Alert kind="info">
          Packets arrived faster than this page collected them and some were evicted from the world
          server&apos;s window before being read. Narrow the selection to see every specimen.
        </Alert>
      )}
      {state && state.dropped > 0 && (
        <Alert kind="info">
          The world server is sampling: {state.dropped.toLocaleString()} packet
          {state.dropped === 1 ? '' : 's'} were skipped to keep capture off the critical path for
          players. Everything shown is real; it is not everything that happened.
        </Alert>
      )}

      <Panel title="Capture">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {collecting ? (
              <Button variant="danger" onClick={stop}>
                Stop collecting
              </Button>
            ) : (
              <Button onClick={start} disabled={selectedCount === 0}>
                Start collecting
              </Button>
            )}
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {selectedCount === 0
                ? 'Choose at least one opcode below.'
                : `${selectedCount} opcode${selectedCount === 1 ? '' : 's'} selected`}
            </span>
            {collecting && (
              <span
                className="text-xs uppercase tracking-[0.18em] animate-pulse"
                style={{ color: 'var(--accent-primary)' }}
              >
                ● Collecting
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={exportCsv} disabled={packets.length === 0}>
                Export CSV
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={packets.length === 0}>
                Clear
              </Button>
            </div>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Capture runs only while this page is collecting. Stopping, navigating away or closing the
            tab ends it. Collected packets are held by this page, not the world server — they survive a
            reload but not closing the tab, and only Clear discards them.
            {state && state.watchers.length > 1 && (
              <>
                {' '}
                Sharing this capture with {state.watchers.length - 1} other admin
                {state.watchers.length === 2 ? '' : 's'}: {state.watchers.join(', ')}.
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {(['game', 'control'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpace(s)}
                className={cn(
                  'px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] border transition',
                  space === s ? 'border-[var(--border-active)]' : 'border-[var(--border)]'
                )}
                style={{ color: space === s ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              >
                {s === 'game' ? 'Game opcodes' : 'Control opcodes'} ({chosen[s].size})
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or number…"
              className="px-3 py-1.5 bg-[var(--background)] border text-xs outline-none flex-1 min-w-[12rem]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            />
            <Button variant="ghost" onClick={selectUncharted}>
              Select uncharted
            </Button>
            <Button variant="ghost" onClick={clearSpace}>
              Clear space
            </Button>
          </div>

          <div
            className="max-h-64 overflow-y-auto border"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
              {visible.map((entry) => {
                const on = chosen[entry.space].has(entry.opcode)
                return (
                  <label
                    key={`${entry.space}:${entry.opcode}`}
                    title={
                      entry.redacted
                        ? 'Never capturable: this packet carries a credential.'
                        : entry.charted
                          ? 'A layout for this packet exists.'
                          : 'No layout worked out yet.'
                    }
                    className={cn(
                      'flex items-center gap-2 px-2 py-1 text-xs border-b border-r cursor-pointer',
                      entry.redacted && 'cursor-not-allowed opacity-50'
                    )}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={entry.redacted}
                      onChange={() => toggle(entry)}
                    />
                    <span
                      className="font-mono truncate"
                      style={{
                        color: entry.redacted
                          ? 'var(--text-danger)'
                          : entry.charted
                            ? 'var(--text-secondary)'
                            : 'var(--text-warning)'
                      }}
                    >
                      {entry.label}
                    </span>
                    {entry.redacted && (
                      <span className="ml-auto text-[9px] uppercase" style={{ color: 'var(--text-danger)' }}>
                        locked
                      </span>
                    )}
                    {!entry.redacted && !entry.charted && (
                      <span className="ml-auto text-[9px] uppercase" style={{ color: 'var(--text-warning)' }}>
                        uncharted
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.18em]">
            {(Object.keys(TIERS) as (keyof typeof TIERS)[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5" title={TIERS[t].hint}>
                <span
                  className="inline-block h-2 w-2"
                  style={{ backgroundColor: TIERS[t].colour }}
                  aria-hidden
                />
                <span style={{ color: 'var(--text-muted)' }}>{TIERS[t].label}</span>
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={`Captured (${packets.length.toLocaleString()})`}>
        <DataTable
          rows={rows}
          rowKey={(p) => uidOf(p)}
          isRowActive={(p) => uidOf(p) === selectedUid}
          renderExpanded={(p) =>
            uidOf(p) === selectedUid ? (
              <PacketDetail packet={p} onClose={() => setSelectedUid(null)} />
            ) : null
          }
          empty={
            collecting
              ? 'Collecting. Nothing on the selected opcodes has come through yet.'
              : 'Choose opcodes and start collecting.'
          }
          columns={[
            {
              header: 'Time',
              cell: (p) => (
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {fmtWhen(p.at)}
                </span>
              )
            },
            {
              header: 'Packet',
              cell: (p) => (
                <button
                  onClick={() => setSelectedUid((prev) => (prev === uidOf(p) ? null : uidOf(p)))}
                  aria-expanded={selectedUid === uidOf(p)}
                  className="flex items-center gap-2 text-left font-mono text-xs hover:underline"
                  style={{ color: TIERS[tierOf(p.tier)].colour }}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0"
                    style={{ backgroundColor: TIERS[tierOf(p.tier)].colour }}
                    aria-hidden
                  />
                  {p.label}
                </button>
              )
            },
            {
              header: 'Kind',
              cell: (p) => (
                <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: TIERS[tierOf(p.tier)].colour }}>
                  {TIERS[tierOf(p.tier)].label}
                </span>
              )
            },
            {
              header: 'Sender',
              cell: (p) => (
                <span
                  className="text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-muted)' }}
                  title={directionOf(p.direction).hint}
                >
                  {senderLabel(p.direction)}
                </span>
              )
            },
            {
              header: 'Session',
              cell: (p) => (
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {p.session}
                </span>
              )
            },
            {
              header: 'Bytes',
              align: 'right',
              cell: (p) => <span className="font-mono text-xs">{p.length}</span>
            },
            {
              header: 'Decoded',
              cell: (p) =>
                p.charted && p.decoded ? (
                  <span className="text-[10px] uppercase" style={{ color: 'var(--accent-primary)' }}>
                    yes
                  </span>
                ) : (
                  <span className="text-[10px] uppercase" style={{ color: 'var(--text-warning)' }}>
                    {p.charted ? 'failed' : 'uncharted'}
                  </span>
                )
            }
          ]}
        />
        {packets.length > MAX_ROWS && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing the newest {MAX_ROWS.toLocaleString()} of {packets.length.toLocaleString()}. The
            CSV export contains all of them.
          </p>
        )}
      </Panel>
    </div>
  )
}
