import { useEffect, useState } from 'react'
import { ContinentMap } from '@/components/ContinentMap'
import { Modal } from '@/components/Modal'
import { Alert, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import type { Continent, ContinentSummary, ControlResponse } from '@/lib/types'

const FACTION_NAME: Record<number, string> = { 0: 'TR', 1: 'NC', 2: 'VS' }
const FACTION_CLS: Record<number, string> = {
  0: 'faction-tr',
  1: 'faction-nc',
  2: 'faction-vs'
}

export function ContinentModal({
  summary,
  onClose
}: {
  summary: ContinentSummary
  onClose: () => void
}) {
  const [continent, setContinent] = useState<Continent | null>(null)
  const [control, setControl] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined)

  useEffect(() => {
    setContinent(null)
    setError(null)

    // Static layout asset (served from public/continents by Vite/Express).
    fetch(`/continents/${summary.base}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('map data unavailable'))))
      .then(setContinent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load continent'))

    // Live control state.
    api
      .get<ControlResponse>(`/continents/${summary.number}/control`)
      .then((r) => setControl(r.control ?? {}))
      .catch(() => setControl({}))
  }, [summary.base, summary.number])

  const controlled = Object.keys(control).length

  return (
    <Modal title={`${summary.name} — Continent Map`} onClose={onClose} wide>
      {error ? (
        <Alert kind="error">{error}</Alert>
      ) : !continent ? (
        <Spinner label={`Loading ${summary.name}`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <ContinentMap
            continent={continent}
            control={control}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((cur) => (cur === id ? undefined : id))}
          />

          <div className="min-w-0">
            <p className="mb-3 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
              {continent.facilities.length} facilities · {controlled} controlled
            </p>
            <ul className="space-y-1 text-sm max-h-[60vh] overflow-auto pr-1">
              {continent.facilities.map((f) => {
                const faction = control[f.id]
                const owned = faction !== undefined
                return (
                  <li
                    key={f.id}
                    onClick={() => setSelectedId((cur) => (cur === f.id ? undefined : f.id))}
                    className="flex items-baseline justify-between gap-2 px-2 py-1 cursor-pointer"
                    style={{
                      background: selectedId === f.id ? 'var(--surface-raised)' : undefined,
                      borderLeft: `2px solid ${selectedId === f.id ? 'var(--border-active)' : 'transparent'}`
                    }}
                  >
                    <span className="truncate">
                      <span className={owned ? FACTION_CLS[faction] : ''} style={owned ? undefined : { color: 'var(--text-secondary)' }}>
                        {f.name}
                      </span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        {f.category}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {owned ? FACTION_NAME[faction] : 'SOI ' + f.soi}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}
