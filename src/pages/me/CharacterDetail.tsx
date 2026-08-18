import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, Spinner } from '@/components/ui'
import { factionById } from '@/lib/factions'
import { cn } from '@/lib/utils'
import { LoadoutsView } from './LoadoutsView'
import { LockerView } from './LockerView'
import { useMyCharacters } from './useMyCharacters'

/**
 * One of your characters, with its inventory views selectable in place.
 *
 * Locker and Loadouts were separate pages once, each with its own character picker. That was
 * redundant: both only ever describe ONE character, so the character is chosen by navigating here and
 * the views become tabs. The active view lives in the query string so a particular character's
 * loadouts stay linkable and survive a refresh.
 */
const VIEWS = [
  { key: 'locker', label: 'Locker' },
  { key: 'infantry', label: 'Infantry Loadouts' },
  { key: 'vehicles', label: 'Vehicle Loadouts' }
] as const

type ViewKey = (typeof VIEWS)[number]['key']

export function CharacterDetail() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const { characters, error } = useMyCharacters()

  const avatarId = Number.parseInt(id ?? '', 10)
  const requested = params.get('view')
  const view: ViewKey = VIEWS.some((v) => v.key === requested) ? (requested as ViewKey) : 'locker'

  if (!Number.isInteger(avatarId)) return <Navigate to="/me/characters" replace />
  if (error) return <Alert kind="error">{error}</Alert>
  if (!characters) return <Spinner label="Loading character" />

  // The list is the authority on what this account owns, so an id that is not in it is not yours --
  // the API says the same thing with a 404, this just avoids a pointless request.
  const character = characters.find((c) => c.id === avatarId)
  if (!character) {
    return (
      <Panel title="Character" accent="tr">
        <p style={{ color: 'var(--text-secondary)' }}>
          No such character on this account.{' '}
          <Link to="/me/characters" style={{ color: 'var(--accent-primary)' }}>
            Back to my characters
          </Link>
          .
        </p>
      </Panel>
    )
  }

  const faction = factionById(character.faction)

  return (
    <Panel title={character.name}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          <span className={faction?.cls ?? ''}>{faction?.name ?? 'Unknown empire'}</span>
          {' · '}BEP {character.bep ?? 0}
          {' · '}CEP {character.cep ?? 0}
        </p>
        <Link to={`/avatar/${character.id}`} className="text-xs" style={{ color: 'var(--accent-primary)' }}>
          Public profile →
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {VIEWS.map((v) => {
          const active = v.key === view
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setParams(v.key === 'locker' ? {} : { view: v.key }, { replace: true })}
              className={cn(
                'border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors',
                active
                  ? 'bg-[var(--surface-raised)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
              )}
              style={{
                borderColor: active ? 'var(--border-active)' : 'var(--border)',
                clipPath: 'var(--clip-corner-sm)'
              }}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      {view === 'locker' ? (
        <LockerView avatarId={avatarId} faction={character.faction} />
      ) : (
        <LoadoutsView avatarId={avatarId} kind={view} faction={character.faction} />
      )}
    </Panel>
  )
}
