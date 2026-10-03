import { useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/Panel'
import { Alert, Button, DataTable, Field, Spinner } from '@/components/ui'
import { api } from '@/lib/api'

/** How often the schedule list re-reads. */
const REFRESH_MS = 30_000

/** One field an action declares, mirroring `ActionField` in api/actions.ts. */
type ActionField =
  | { kind: 'json'; name: string; label: string; help?: string; placeholder?: string; rows?: number }
  | { kind: 'number'; name: string; label: string; help?: string; min?: number; max?: number; step?: number; value?: number }
  | { kind: 'select'; name: string; label: string; help?: string; options: { value: string; label: string }[]; value?: string }
  | { kind: 'boolean'; name: string; label: string; help?: string; value?: boolean }

/** An action as the registry describes it: enough to build a form, and nothing about how it runs. */
interface ActionSpec {
  key: string
  label: string
  description: string
  fields: ActionField[]
}

interface Schedule {
  id: number
  name: string
  action: string
  payload: string
  enabled: boolean
  atTime?: string | null
  everyDays?: number | null
  condition?: string | null
  threshold?: number | null
  armed: boolean
  lastRun?: string | null
  lastResult?: string | null
  createdBy: string
  created?: string
}

const CONDITIONS: Record<string, string> = {
  players_below: 'Players below',
  players_above: 'Players above'
}

function fmtWhen(value?: string | null): string {
  if (!value) return 'Never'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'Never' : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
}

/** Describe a schedule's triggers in a sentence, since the columns alone read as a puzzle. */
function describeTriggers(s: Schedule): string {
  const parts: string[] = []
  if (s.atTime) {
    const days = s.everyDays ?? 1
    parts.push(days === 1 ? `daily at ${s.atTime}` : `at ${s.atTime} every ${days} days`)
  }
  if (s.condition) {
    parts.push(`when ${(CONDITIONS[s.condition] ?? s.condition).toLowerCase()} ${s.threshold}`)
  }
  // Either firing runs the action; they are alternatives, not a conjunction.
  return parts.join(', or ') || 'never'
}

/**
 * Services -> Scheduling.
 *
 * Things the portal does to the world server on its own, on a clock or when the population crosses
 * a line.
 *
 * The form below is built from the action registry the server sends, not from anything this file
 * knows about any particular action. That is deliberate: the trigger machinery is finished, but the
 * list of things worth scheduling is not, and an action should be addable without touching the UI.
 *
 * The schedules are rows in the login server's database, because the portal has none of its own and a
 * schedule has to survive a restart. The evaluation happens in the portal, every 30 seconds, and more
 * than one portal process may be running — so a process claims a run in the database before acting,
 * and exactly one can win. None of that is visible here; it matters only in that a run happens once.
 */
export function SchedulingSection() {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // New-schedule form. `params` is whatever the chosen action's fields ask for, so this component
  // never has to know what any particular action needs.
  const [actions, setActions] = useState<ActionSpec[] | null>(null)
  const [actionKey, setActionKey] = useState('')
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [name, setName] = useState('')
  const [useTime, setUseTime] = useState(true)
  const [atTime, setAtTime] = useState('04:00')
  const [everyDays, setEveryDays] = useState('1')
  const [useCondition, setUseCondition] = useState(false)
  const [condition, setCondition] = useState('players_below')
  const [threshold, setThreshold] = useState('10')

  const chosen = actions?.find((a) => a.key === actionKey)

  /** Reset the parameters to the chosen action's declared defaults. */
  const chooseAction = (key: string) => {
    setActionKey(key)
    const spec = actions?.find((a) => a.key === key)
    const next: Record<string, unknown> = {}
    for (const f of spec?.fields ?? []) {
      if ('value' in f && f.value !== undefined) next[f.name] = f.value
      else if (f.kind === 'boolean') next[f.name] = false
      else if (f.kind === 'select') next[f.name] = f.options[0]?.value ?? ''
      else next[f.name] = ''
    }
    setParams(next)
  }

  useEffect(() => {
    api
      .get<{ actions: ActionSpec[] }>('/schedules/actions')
      .then((r) => {
        setActions(r.actions ?? [])
        if (r.actions?.[0]) {
          setActionKey(r.actions[0].key)
          const next: Record<string, unknown> = {}
          for (const f of r.actions[0].fields) {
            if ('value' in f && f.value !== undefined) next[f.name] = f.value
            else if (f.kind === 'boolean') next[f.name] = false
            else if (f.kind === 'select') next[f.name] = f.options[0]?.value ?? ''
            else next[f.name] = ''
          }
          setParams(next)
        }
      })
      .catch(() => setActions([]))
  }, [])

  const load = useCallback(() => {
    api
      .get<{ schedules: Schedule[] }>('/schedules')
      .then((r) => setSchedules(r.schedules ?? []))
      .catch(() => setSchedules((prev) => prev ?? []))
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const act = async (key: string, run: () => Promise<unknown>, success: string) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await run()
      setNotice(success)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The server refused that.')
    } finally {
      setBusy(null)
    }
  }

  const create = () =>
    act(
      'create',
      () =>
        api.post('/schedules', {
          name: name.trim(),
          action: actionKey,
          params,
          at_time: useTime ? atTime : undefined,
          every_days: useTime ? Number(everyDays) : undefined,
          condition: useCondition ? condition : undefined,
          threshold: useCondition ? Number(threshold) : undefined
        }),
      'Schedule created.'
    ).then(() => {
      setName('')
      chooseAction(actionKey)
    })

  const canCreate = name.trim().length > 0 && !!actionKey && (useTime || useCondition) && busy === null

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Panel title="Scheduled Actions">
        {!schedules ? (
          <Spinner label="Reading schedules" />
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Evaluated every 30 seconds. A schedule may carry a time trigger, a condition trigger, or
              both — either one firing runs the action. A condition fires on the <em>crossing</em>, not
              while it stays true: it runs once and re-arms only when the population goes back the
              other way, so &ldquo;below 10 players&rdquo; does not re-apply all night.
            </p>
            <DataTable
              rows={schedules}
              rowKey={(s) => s.id}
              empty="No scheduled actions."
              columns={[
                { header: 'Name', cell: (s) => s.name },
                {
                  header: 'Action',
                  cell: (s) => (
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {s.action}
                    </span>
                  )
                },
                {
                  header: 'Runs',
                  cell: (s) => (
                    <span style={{ color: 'var(--text-secondary)' }}>{describeTriggers(s)}</span>
                  )
                },
                {
                  header: 'State',
                  cell: (s) =>
                    !s.enabled ? (
                      <span style={{ color: 'var(--text-muted)' }}>Paused</span>
                    ) : s.condition && !s.armed ? (
                      <span
                        style={{ color: 'var(--text-warning)' }}
                        title="The condition has fired and will not fire again until the population crosses back"
                      >
                        Fired
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-primary)' }}>Active</span>
                    )
                },
                { header: 'Last run', cell: (s) => fmtWhen(s.lastRun) },
                {
                  header: 'Result',
                  cell: (s) => (
                    <span
                      className="text-xs"
                      style={{
                        color: s.lastResult?.startsWith('failed')
                          ? 'var(--text-danger)'
                          : 'var(--text-muted)'
                      }}
                    >
                      {s.lastResult ?? '—'}
                    </span>
                  )
                },
                {
                  header: 'Actions',
                  align: 'right',
                  cell: (s) => (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          void act(
                            `toggle:${s.id}`,
                            () => api.post(`/schedules/${s.id}`, { enabled: !s.enabled }),
                            s.enabled ? `${s.name} paused.` : `${s.name} resumed.`
                          )
                        }
                      >
                        {s.enabled ? 'Pause' : 'Resume'}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy !== null}
                        onClick={() =>
                          void act(
                            `delete:${s.id}`,
                            () =>
                              fetch(`/api/schedules/${s.id}`, {
                                method: 'DELETE',
                                credentials: 'same-origin'
                              }).then((r) => {
                                if (!r.ok) throw new Error('could not delete')
                              }),
                            `${s.name} deleted.`
                          )
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  )
                }
              ]}
            />
          </>
        )}
      </Panel>

      <Panel title="New Schedule" accent="vs">
        <div className="space-y-4">
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Overnight reset"
          />

          <label className="block">
            <span
              className="mb-1 block text-[10px] uppercase tracking-[0.2em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Action
            </span>
            <select
              value={actionKey}
              onChange={(e) => chooseAction(e.target.value)}
              className="w-full bg-[var(--background)] border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {(actions ?? []).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            {chosen && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
                {chosen.description}
              </span>
            )}
          </label>

          {/* Built from what the action declares it needs. Adding an action to the registry adds its
              form here with no change to this file. */}
          {chosen?.fields.map((f) => (
            <label key={f.name} className="block">
              <span
                className="mb-1 block text-[10px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {f.label}
              </span>
              {f.kind === 'json' && (
                <textarea
                  value={String(params[f.name] ?? '')}
                  onChange={(e) => setParams((p) => ({ ...p, [f.name]: e.target.value }))}
                  rows={f.rows ?? 8}
                  spellCheck={false}
                  placeholder={f.placeholder}
                  className="w-full bg-[var(--background)] border px-3 py-2 font-mono text-xs outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                />
              )}
              {f.kind === 'number' && (
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={String(params[f.name] ?? '')}
                  onChange={(e) => setParams((p) => ({ ...p, [f.name]: e.target.value }))}
                  className="w-32 bg-[var(--background)] border px-3 py-2 font-mono text-sm outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                />
              )}
              {f.kind === 'select' && (
                <select
                  value={String(params[f.name] ?? '')}
                  onChange={(e) => setParams((p) => ({ ...p, [f.name]: e.target.value }))}
                  className="w-full bg-[var(--background)] border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {f.kind === 'boolean' && (
                <input
                  type="checkbox"
                  checked={params[f.name] === true}
                  onChange={(e) => setParams((p) => ({ ...p, [f.name]: e.target.checked }))}
                />
              )}
              {f.help && (
                <span className="mt-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {f.help}
                </span>
              )}
            </label>
          ))}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 border p-3" style={{ borderColor: 'var(--border)' }}>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.15em]">
                <input type="checkbox" checked={useTime} onChange={(e) => setUseTime(e.target.checked)} />
                <span style={{ color: 'var(--text-secondary)' }}>On a clock</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={atTime}
                  disabled={!useTime}
                  onChange={(e) => setAtTime(e.target.value)}
                  className="bg-[var(--background)] border px-2 py-1 font-mono text-sm outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>every</span>
                <input
                  type="number"
                  min={1}
                  value={everyDays}
                  disabled={!useTime}
                  onChange={(e) => setEveryDays(e.target.value)}
                  className="w-16 bg-[var(--background)] border px-2 py-1 font-mono text-sm outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>day(s)</span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Server local time. A run missed while the portal was down still fires within the hour.
              </p>
            </div>

            <div className="space-y-2 border p-3" style={{ borderColor: 'var(--border)' }}>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.15em]">
                <input
                  type="checkbox"
                  checked={useCondition}
                  onChange={(e) => setUseCondition(e.target.checked)}
                />
                <span style={{ color: 'var(--text-secondary)' }}>On population</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={condition}
                  disabled={!useCondition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="bg-[var(--background)] border px-2 py-1 text-sm outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {Object.entries(CONDITIONS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={threshold}
                  disabled={!useCondition}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-20 bg-[var(--background)] border px-2 py-1 font-mono text-sm outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                />
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Fires once on the crossing, then waits for the population to go back the other way.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => void create()} disabled={!canCreate}>
              {busy === 'create' ? 'Creating…' : 'Create schedule'}
            </Button>
            {!useTime && !useCondition && (
              <span className="text-xs" style={{ color: 'var(--text-warning)' }}>
                A schedule needs at least one trigger.
              </span>
            )}
          </div>
        </div>
      </Panel>
    </div>
  )
}
