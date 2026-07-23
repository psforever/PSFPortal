import { useEffect, useState } from 'react'
import { ContinentModal } from '@/components/ContinentModal'
import { Panel } from '@/components/Panel'
import { Spinner } from '@/components/ui'
import type { ContinentSummary } from '@/lib/types'

/** The overworld continents; clicking a name opens its map modal. */
export function ContinentList() {
  const [continents, setContinents] = useState<ContinentSummary[] | null>(null)
  const [open, setOpen] = useState<ContinentSummary | null>(null)

  useEffect(() => {
    fetch('/continents/index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setContinents)
      .catch(() => setContinents([]))
  }, [])

  return (
    <Panel title="Continents">
      {!continents ? (
        <Spinner />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {continents.map((c) => (
            <li key={c.base}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                className="w-full flex items-baseline justify-between py-1 text-left hover:text-[var(--accent-primary)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="uppercase tracking-[0.12em]">{c.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {c.facilities}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <ContinentModal summary={open} onClose={() => setOpen(null)} />}
    </Panel>
  )
}
