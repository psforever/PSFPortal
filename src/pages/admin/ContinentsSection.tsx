import { useCallback, useEffect, useRef, useState } from 'react'
import { ContinentMap } from '@/components/ContinentMap'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { Button, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { factionClass } from '@/lib/factions'
import { useToast } from '@/state/ToastContext'
import type { Continent, ContinentSummary, Facility } from '@/lib/types'
import { RandomizeDialog } from './RandomizeDialog'

/** How often the admin view re-reads every continent's ownership. */
const REFRESH_MS = 60_000

/** The empires a facility/continent can be set to, plus the neutral reset. */
const SET_OPTIONS: { faction: string; label: string; empire: number | null }[] = [
  { faction: 'TR', label: 'TR', empire: 0 },
  { faction: 'NC', label: 'NC', empire: 1 },
  { faction: 'VS', label: 'VS', empire: 2 },
  { faction: 'neutral', label: 'Neutral', empire: null }
]

/** Warpgates and geowarps are not capturable, so their ownership can't be set from the admin page. */
const GATE_TYPES = new Set(['warpgate', 'warpgate_small', 'warpgate_cavern', 'hst'])

/** Faction token -> id (0 TR / 1 NC / 2 VS / 3 neutral). */
const FACTION_ID: Record<string, number> = { TR: 0, NC: 1, VS: 2, neutral: 3 }

/** A layout: zone_number -> { local_id -> faction_id }. Same shape as the live control feed. */
type Layout = Record<number, Record<number, number>>

/** Only continents/islands/caverns have capturable bases; sanctuaries are shown but fixed. */
const SETTABLE = new Set(['continent', 'island', 'cavern'])
/** Sections rendered in the grid: the capturable groups plus the (view-only) sanctuaries. */
const SECTIONS: { group: string; label: string }[] = [
  { group: 'continent', label: 'Continents' },
  { group: 'island', label: 'Battle Islands' },
  { group: 'cavern', label: 'Caverns' },
  { group: 'sanctuary', label: 'Sanctuaries' }
]
const DISPLAY_GROUPS = new Set(SECTIONS.map((s) => s.group))

/** Right-click target: the facility, which zone it's on, and where to place the menu. */
interface Menu {
  zoneId: string
  name: string
  facility: Facility
  x: number
  y: number
}

/**
 * World Server Management -> continents. Renders every continent's map at once (no lattice overlay),
 * each coloured by live base ownership and refreshed every 60s. Right-clicking a facility sets that
 * one base's owner; the per-continent buttons sweep the whole continent. Both go through the live
 * PSF-HTTP API path (set_building_faction / set_zone_faction), so the running world server updates too.
 */
export function ContinentsSection() {
  const [summaries, setSummaries] = useState<ContinentSummary[] | null>(null)
  /** base -> full static Continent (terrain + facilities). */
  const [continents, setContinents] = useState<Record<string, Continent>>({})
  const [footprints, setFootprints] = useState<Record<string, [number, number][][]>>({})
  /** zone_number -> { local_id -> faction_id }, from /zones/control-all. */
  const [control, setControl] = useState<Record<number, Record<number, number>>>({})
  /** zone id -> live combat hotspot world coords, from /zones/details. */
  const [hotspots, setHotspots] = useState<Record<string, [number, number][]>>({})
  /** zone id -> live player markers (admin-only), from /zones/players-all. */
  const [players, setPlayers] = useState<
    Record<string, { x: number; y: number; facing: number; faction: number; name: string }[]>
  >({})
  const toast = useToast()
  const [menu, setMenu] = useState<Menu | null>(null)
  /** base -> selected facility id, for the click highlight. */
  const [selected, setSelected] = useState<Record<string, number | undefined>>({})
  /** zoneId currently applying a change, to disable its controls briefly. */
  const [pending, setPending] = useState<string | null>(null)
  const [randomizing, setRandomizing] = useState(false)
  const [randomOpen, setRandomOpen] = useState(false)
  /** The continent whose control modal is open, if any. */
  const [editZone, setEditZone] = useState<ContinentSummary | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** Live lattice + per-gate connection empire for the open modal's continent (shown in the modal). */
  const [modalLattice, setModalLattice] = useState<[string, string][]>([])
  const [modalGateEmpire, setModalGateEmpire] = useState<Record<string, 0 | 1 | 2>>({})
  /** Whether the modal's Diagnostic side panel is open. */
  const [diagOpen, setDiagOpen] = useState(false)

  // --- Draft mode: a local staging layout the admin edits, reviews, then applies (or discards).
  // Edits, Randomize, Neutralize and Load all write here; Apply pushes it live. Off by default.
  const [draftMode, setDraftMode] = useState(false)
  const [draft, setDraft] = useState<Layout>({})
  const [applying, setApplying] = useState(false)
  /** The Interstellar menu open state, and the hidden file input for Load. */
  const [barOpen, setBarOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  /** The ownership shown/edited for a zone: the draft while drafting, otherwise the live control. */
  const controlFor = (zoneNumber: number): Record<number, number> =>
    draftMode ? (draft[zoneNumber] ?? {}) : (control[zoneNumber] ?? {})

  /** Capturable (non-gate) facilities of a continent. */
  const capturable = (base: string) =>
    (continents[base]?.facilities ?? []).filter((f) => !GATE_TYPES.has(f.type))

  // Static assets (zone list, per-continent geometry, shared footprints) load once.
  useEffect(() => {
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('zone list unavailable'))))
      .then((zs: ContinentSummary[]) => {
        setSummaries(zs)
        const toLoad = zs.filter((z) => DISPLAY_GROUPS.has(z.group ?? 'continent'))
        return Promise.all(
          toLoad.map((z) =>
            fetch(`/continents/${z.base}.json`)
              .then((r) => (r.ok ? r.json() : null))
              .then((c: Continent | null) => [z.base, c] as const)
          )
        )
      })
      .then((pairs) => {
        const m: Record<string, Continent> = {}
        for (const [base, c] of pairs) if (c) m[base] = c
        setContinents(m)
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load continents'))

    fetch('/continents/footprints.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFootprints)
      .catch(() => setFootprints({}))
  }, [])

  const loadControl = useCallback(() => {
    api
      .get<{ control: Record<number, Record<number, number>> }>('/zones/control-all')
      .then((r) => setControl(r.control ?? {}))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load ownership'))
  }, [])

  // Live combat hotspots per zone, refreshed on the same tick as ownership.
  const loadHotspots = useCallback(() => {
    api
      .get<{ zones: Record<string, { hotspot_points?: [number, number][] }> }>('/zones/details')
      .then((r) => {
        const out: Record<string, [number, number][]> = {}
        for (const [zoneId, d] of Object.entries(r.zones ?? {})) out[zoneId] = d.hotspot_points ?? []
        setHotspots(out)
      })
      .catch(() => setHotspots({}))
  }, [])

  // Live player arrows per zone (admin-only feed), refreshed on the same tick.
  const loadPlayers = useCallback(() => {
    api
      .get<{
        zones: Record<string, { x: number; y: number; facing: number; faction: number; name: string }[]>
      }>('/zones/players-all')
      .then((r) => setPlayers(r.zones ?? {}))
      .catch(() => setPlayers({}))
  }, [])

  useEffect(() => {
    loadControl()
    loadHotspots()
    loadPlayers()
    const timer = window.setInterval(() => {
      loadControl()
      loadHotspots()
      loadPlayers()
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadControl, loadHotspots, loadPlayers])

  // Close the Interstellar dropdown on an outside click.
  useEffect(() => {
    if (!barOpen) return
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setBarOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [barOpen])

  // The open modal shows the continent's lattice; fetch it (and per-gate connection empires) for the
  // editing zone. Refreshed with the control tick so links recolour as ownership changes.
  useEffect(() => {
    if (!editZone) {
      setModalLattice([])
      setModalGateEmpire({})
      return
    }
    let cancelled = false
    const load = () => {
      api
        .get<{ links: [string, string][] }>(`/continents/${editZone.zoneId}/lattice`)
        .then((r) => !cancelled && setModalLattice(r.links ?? []))
        .catch(() => !cancelled && setModalLattice([]))
      api
        .get<{ gates: Record<string, 0 | 1 | 2> }>(`/continents/${editZone.zoneId}/gate-empires`)
        .then((r) => !cancelled && setModalGateEmpire(r.gates ?? {}))
        .catch(() => !cancelled && setModalGateEmpire({}))
    }
    load()
    const t = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [editZone])

  // Close the context menu on a left-click outside it, or Escape. While it's open, suppress the
  // browser's own context menu everywhere (a second right-click would otherwise pop it up); a
  // right-click on another facility still repositions the menu, handled by the map's onContextMenu.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (e.button === 0 && !menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onCtx = (e: MouseEvent) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // The DB write behind a faction change is asynchronous, so refresh once now and once shortly after
  // it has settled, plus the regular 60s tick keeps everything current.
  const refreshSoon = () => {
    loadControl()
    window.setTimeout(loadControl, 1200)
  }

  const settable = (summaries ?? []).filter((z) => SETTABLE.has(z.group))
  const displayed = (summaries ?? []).filter((z) => DISPLAY_GROUPS.has(z.group ?? 'continent'))
  const loading = !summaries || displayed.some((z) => !continents[z.base])
  const byZoneId = (id: string) => settable.find((z) => z.zoneId === id)

  // --- live edits (draft mode off): applied immediately to the running server ------------------
  async function sweepLive(zoneId: string, name: string, faction: string, label: string) {
    setPending(zoneId)
    try {
      const r = await api.post<{ buildings_changed?: number }>(`/continents/${zoneId}/faction`, { faction })
      const n = r.buildings_changed ?? 0
      toast.success(`${name}: set ${n} base${n === 1 ? '' : 's'} to ${label}`)
      refreshSoon()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set continent')
    } finally {
      setPending(null)
    }
  }
  async function setBuildingLive(m: Menu, faction: string, label: string) {
    try {
      await api.post(`/continents/${m.zoneId}/building/${m.facility.id}/faction`, { faction })
      toast.success(`${m.name}: set ${m.facility.name} to ${label}`)
      refreshSoon()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set facility')
    }
  }

  // --- draft edits (draft mode on): staged locally until applied --------------------------------
  const draftSetFaction = (zoneNumber: number, localId: number, factionId: number) =>
    setDraft((d) => ({ ...d, [zoneNumber]: { ...(d[zoneNumber] ?? {}), [localId]: factionId } }))
  const draftSweepZone = (zoneNumber: number, base: string, factionId: number) =>
    setDraft((d) => {
      const own = { ...(d[zoneNumber] ?? {}) }
      for (const f of capturable(base)) own[f.id] = factionId
      return { ...d, [zoneNumber]: own }
    })

  // --- edit routing: draft or live -------------------------------------------------------------
  function sweep(zoneId: string, name: string, faction: string, label: string) {
    if (draftMode) {
      const z = byZoneId(zoneId)
      if (z) draftSweepZone(z.number, z.base, FACTION_ID[faction])
      return
    }
    void sweepLive(zoneId, name, faction, label)
  }
  function setBuilding(m: Menu, faction: string, label: string) {
    setMenu(null)
    if (draftMode) {
      const z = byZoneId(m.zoneId)
      if (z) draftSetFaction(z.number, m.facility.id, FACTION_ID[faction])
      return
    }
    void setBuildingLive(m, faction, label)
  }

  // --- Interstellar menu actions ---------------------------------------------------------------
  /** Snapshot the live control into a draft the admin can edit before applying. */
  function enterDraft() {
    const snap: Layout = {}
    for (const z of settable) snap[z.number] = { ...(control[z.number] ?? {}) }
    setDraft(snap)
    setDraftMode(true)
    toast.success('Draft mode on — edits are staged. Apply to push them live.')
  }
  function discardDraft() {
    setDraftMode(false)
    setDraft({})
  }
  async function applyDraft() {
    setApplying(true)
    try {
      const r = await api.post<{ buildings_changed?: number }>('/zones/apply-layout', { control: draft })
      toast.success(`Applied draft: ${r.buildings_changed ?? 0} bases changed`)
      discardDraft()
      refreshSoon()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply draft')
    } finally {
      setApplying(false)
    }
  }
  /** Set every capturable base on every continent to neutral, in the draft. */
  function neutralize() {
    const next: Layout = {}
    for (const z of settable) {
      const own = { ...(draftMode ? (draft[z.number] ?? {}) : (control[z.number] ?? {})) }
      for (const f of capturable(z.base)) own[f.id] = 3
      next[z.number] = own
    }
    setDraft(next)
    setDraftMode(true)
    toast.success('Neutralized into draft. Apply to push it live.')
  }
  function saveLayout() {
    const layout: Layout = {}
    for (const z of settable) {
      layout[z.number] = { ...(draftMode ? (draft[z.number] ?? {}) : (control[z.number] ?? {})) }
    }
    const blob = new Blob([JSON.stringify({ control: layout }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'continent-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  async function loadLayout(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      setDraft((parsed.control ?? parsed) as Layout)
      setDraftMode(true)
      toast.success(`Loaded ${file.name} into draft. Apply to push it live.`)
    } catch {
      toast.error('Could not read that layout file')
    }
  }
  /** Randomize computes a layout and stages it in the draft (never applies directly). */
  async function randomizeToDraft(opts: { weights: Record<number, number>; lockHome: boolean }) {
    setRandomizing(true)
    try {
      const r = await api.post<{ control: Layout }>('/zones/randomize', { ...opts, apply: false })
      setDraft(r.control ?? {})
      setDraftMode(true)
      setRandomOpen(false)
      toast.success('Randomized into draft. Apply to push it live.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to randomize')
    } finally {
      setRandomizing(false)
    }
  }

  const MenuItem = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      type="button"
      className="block w-full px-4 py-1.5 text-left text-xs uppercase tracking-wider whitespace-nowrap hover:bg-[var(--surface-raised)]"
      style={{ color: 'var(--text-secondary)' }}
      onClick={() => {
        setBarOpen(false)
        onClick()
      }}
    >
      {label}
    </button>
  )
  const Sep = () => <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

  return (
    <div className="space-y-4">
      {/* menubar */}
      {/* No clip-path here: it would clip the absolutely-positioned dropdown that extends below. */}
      <div
        className="flex items-center gap-1 border px-1 py-0.5"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="relative" ref={barRef}>
          <button
            type="button"
            className="rounded-sm px-3 py-1 text-xs uppercase tracking-[0.14em] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent-primary)]"
            style={{
              color: barOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
              background: barOpen ? 'var(--surface-raised)' : undefined,
              borderBottom: `2px solid ${barOpen ? 'var(--border-active)' : 'transparent'}`
            }}
            onClick={() => setBarOpen((o) => !o)}
          >
            Interstellar
          </button>
          {barOpen && (
            <div
              className="absolute left-0 top-full z-40 mt-1 border shadow-lg"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', clipPath: 'var(--clip-corner-md)' }}
            >
              <MenuItem label={draftMode ? 'Exit Draft Mode' : 'Open Draft Mode'} onClick={() => (draftMode ? discardDraft() : enterDraft())} />
              <Sep />
              <MenuItem label="Load Continent Layout" onClick={() => fileRef.current?.click()} />
              <MenuItem label="Save Continent Layout" onClick={saveLayout} />
              <Sep />
              <MenuItem label="Randomize Layout" onClick={() => setRandomOpen(true)} />
              <MenuItem label="Neutralize Layout" onClick={neutralize} />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void loadLayout(f)
          e.target.value = ''
        }}
      />

      {/* draft banner */}
      {draftMode ? (
        <div
          className="flex items-center gap-3 border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--border-active)', background: 'var(--surface-raised)' }}
        >
          <span style={{ color: 'var(--accent-primary)' }} className="uppercase tracking-wider">
            Draft mode
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Edits are staged locally. Nothing is live until you apply.
          </span>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => void applyDraft()} disabled={applying}>
              {applying ? 'Applying…' : 'Apply'}
            </Button>
            <Button variant="ghost" onClick={discardDraft} disabled={applying}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Live previews, refreshed every 60&nbsp;seconds. Click a continent to open its controls.
        </p>
      )}

      {randomOpen && (
        <RandomizeDialog
          busy={randomizing}
          onClose={() => setRandomOpen(false)}
          onApply={(opts) => void randomizeToDraft(opts)}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="border p-2" style={{ borderColor: 'var(--border)' }}>
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="w-full" style={{ aspectRatio: '1 / 1' }} />
            </div>
          ))}
        </div>
      ) : (
        SECTIONS.map((section) => {
          const zones = displayed.filter((z) => z.group === section.group)
          if (!zones.length) return null
          return (
            <div key={section.group} className="space-y-2">
              <h3
                className="text-[10px] uppercase tracking-[0.22em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {section.label}
              </h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {zones.map((z) => {
                  const cont = continents[z.base]
                  if (!cont) return null
                  // Live preview only: no zoom, no facility interaction. The whole tile opens the
                  // control modal.
                  return (
                    <Panel key={z.zoneId} title={z.name} accent="vs">
                      <button
                        type="button"
                        onClick={() => setEditZone(z)}
                        className="block w-full text-left"
                        title={`Open controls for ${z.name}`}
                      >
                        <ContinentMap
                          continent={cont}
                          footprints={footprints}
                          control={controlFor(z.number)}
                          hotspots={hotspots[z.zoneId]}
                          players={players[z.zoneId]}
                          hideZoom
                        />
                      </button>
                    </Panel>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {/* Large control modal for one continent: live map + sweep buttons + right-click to set a base
          (warpgates/geowarps excluded). No zoom control. */}
      {editZone && continents[editZone.base] && (
        <Modal
          title={`${editZone.name} — ${SETTABLE.has(editZone.group) ? 'set control' : 'view'}`}
          onClose={() => setEditZone(null)}
          wide
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {SETTABLE.has(editZone.group) ? (
              <>
                <span
                  className="mr-1 text-[10px] uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Sweep continent
                </span>
                {SET_OPTIONS.map((opt) => (
                  <Button
                    key={opt.faction}
                    variant="ghost"
                    disabled={pending === editZone.zoneId}
                    onClick={() => void sweep(editZone.zoneId, editZone.name, opt.faction, opt.label)}
                  >
                    <span className={opt.empire === null ? undefined : factionClass(opt.empire)}>
                      {opt.label}
                    </span>
                  </Button>
                ))}
              </>
            ) : (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Sanctuary — bases are fixed and cannot be captured
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {SETTABLE.has(editZone.group) && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Right-click a facility to set it individually
                </span>
              )}
              <Button variant="ghost" onClick={() => setDiagOpen((o) => !o)}>
                {diagOpen ? 'Hide diagnostic' : 'Diagnostic'}
              </Button>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div className="min-w-0 flex-1">
              <ContinentMap
                continent={continents[editZone.base]}
                footprints={footprints}
                control={controlFor(editZone.number)}
                lattice={modalLattice}
                gateEmpire={modalGateEmpire}
                hotspots={hotspots[editZone.zoneId]}
                players={players[editZone.zoneId]}
                selectedId={selected[editZone.base]}
                hideZoom
                onSelect={(id) =>
                  setSelected((s) => ({
                    ...s,
                    [editZone.base]: s[editZone.base] === id ? undefined : id
                  }))
                }
                onFacilityContextMenu={(facility, e) => {
                  // Sanctuaries are view-only; their bases can't be captured.
                  if (!SETTABLE.has(editZone.group)) return
                  // Warpgates and geowarps are not capturable -- don't offer to reassign them.
                  if (GATE_TYPES.has(facility.type)) return
                  setMenu({ zoneId: editZone.zoneId, name: editZone.name, facility, x: e.clientX, y: e.clientY })
                }}
              />
            </div>
            {/* Diagnostic side window: the continent's informational figures, opened to the right. */}
            {diagOpen &&
              (() => {
                const facs = continents[editZone.base].facilities
                const nonGate = facs.filter((f) => !GATE_TYPES.has(f.type))
                const own = controlFor(editZone.number)
                const controlled = nonGate.filter((f) => own[f.id] !== undefined).length
                const gates = facs.filter((f) => GATE_TYPES.has(f.type))
                const linkedGates = gates.filter(
                  (g) => modalGateEmpire[String(g.rawName ?? g.name).toLowerCase()] !== undefined
                ).length
                const rows: [string, string | number][] = [
                  ['Facilities', facs.length],
                  ['Capturable', nonGate.length],
                  ['Controlled', `${controlled} / ${nonGate.length}`],
                  ['Gates linked', `${linkedGates} / ${gates.length}`]
                ]
                return (
                  <div
                    className="w-48 shrink-0 border p-3"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)', clipPath: 'var(--clip-corner-md)' }}
                  >
                    <div
                      className="mb-2 text-[10px] uppercase tracking-[0.2em]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Diagnostic
                    </div>
                    <dl className="space-y-1.5 text-xs">
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2">
                          <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                          <dd className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {v}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )
              })()}
          </div>
        </Modal>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-[60] border shadow-lg"
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - 180),
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            clipPath: 'var(--clip-corner-md)'
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="px-3 py-1.5 border-b text-[10px] uppercase tracking-wider"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {menu.facility.name}
          </div>
          {SET_OPTIONS.map((opt) => (
            <button
              key={opt.faction}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-xs uppercase tracking-wider hover:bg-[var(--surface-raised)]"
              onClick={() => void setBuilding(menu, opt.faction, opt.label)}
            >
              <span className={opt.empire === null ? undefined : factionClass(opt.empire)}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
