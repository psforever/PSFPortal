import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, Button } from '@/components/ui'
import { api } from '@/lib/api'
import {
  MAX_BATTLE_RANK,
  MAX_COMMAND_RANK,
  battleRank,
  bepForBattleRank,
  cepForCommandRank,
  commandRank
} from '@/lib/ranks'

/** What the world server answers with once the change has been applied. */
interface ProgressResult {
  name: string
  bep: number
  cep: number
  battle_rank: number
  command_rank: number
  applied_live: boolean
}

/**
 * Edit a character's battle and command progression.
 *
 * Rank and experience are the same setting seen two ways: a rank IS its experience threshold, and
 * only experience is stored. So the two controls per rank are bound together -- pick BR12 and the
 * BEP box fills with BR12's threshold; type a BEP and the rank label follows it. That is not a
 * convenience, it is the honest model: there is no rank column that could disagree with the points
 * behind it, and a UI with two independent fields would imply there was.
 *
 * Ranks are for the common case, raw experience for the case ranks cannot express -- putting someone
 * partway through a rank, or matching a total exactly.
 *
 * Rendered through a portal into `document.body`: `Panel` sets `clip-path`, which establishes a
 * containing block for `position: fixed` and would otherwise confine this to the pane it opened from.
 */
export function AvatarProgressDialog({
  avatarId,
  name,
  bep,
  cep,
  onClose,
  onSaved
}: {
  avatarId: number
  name: string
  bep: number
  cep: number
  onClose: () => void
  onSaved: (result: ProgressResult) => void
}) {
  const [bepValue, setBepValue] = useState(String(bep))
  const [cepValue, setCepValue] = useState(String(cep))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const bepNum = Math.max(0, Number(bepValue) || 0)
  const cepNum = Math.max(0, Number(cepValue) || 0)
  const br = battleRank(bepNum)
  const cr = commandRank(cepNum)
  const changed = bepNum !== bep || cepNum !== cep

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await api.post<ProgressResult>(`/avatars/${avatarId}/progress`, {
        bep: bepNum,
        cep: cepNum
      })
      onSaved(result)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be applied.')
      setSaving(false)
    }
  }

  const field = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    rank: number,
    rankLabel: string,
    maxRank: number,
    minRank: number,
    toXp: (r: number) => number
  ) => (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </span>
        <span className="font-mono text-sm" style={{ color: 'var(--accent-primary)' }}>
          {rankLabel}
          {rank}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={rank}
          onChange={(e) => setValue(String(toXp(Number(e.target.value))))}
          className="px-2 py-1.5 bg-[var(--background)] border text-sm font-mono outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {Array.from({ length: maxRank - minRank + 1 }, (_, i) => i + minRank).map((r) => (
            <option key={r} value={r}>
              {rankLabel}
              {r}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-[var(--background)] border text-sm font-mono outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          aria-label={`${label} experience`}
        />
      </div>
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5, 5, 5, 0.85)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${name}`}
    >
      <div
        className="w-full max-w-lg border bg-[var(--surface)]"
        style={{ borderColor: 'var(--border)', clipPath: 'var(--clip-corner-md)' }}
      >
        <header className="border-b px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <h3
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--accent-primary)' }}
          >
            Edit {name}
          </h3>
        </header>

        <div className="space-y-5 p-4">
          {error && <Alert kind="error">{error}</Alert>}

          {field(
            'Battle Rank',
            bepValue,
            setBepValue,
            br,
            'BR',
            MAX_BATTLE_RANK,
            1,
            bepForBattleRank
          )}
          {field(
            'Command Rank',
            cepValue,
            setCepValue,
            cr,
            'CR',
            MAX_COMMAND_RANK,
            0,
            cepForCommandRank
          )}

          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Pick a rank to fill in its experience threshold, or type an exact total to place the
            character partway through a rank. Battle rank governs implant slots and uniform, so
            lowering it removes any implants beyond the new limit — the world server applies this the
            same way it applies experience a player earns, including to a character who is logged in
            right now.
          </p>
        </div>

        <footer
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {changed ? 'Unsaved changes' : 'No changes'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !changed}>
              {saving ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  )
}
