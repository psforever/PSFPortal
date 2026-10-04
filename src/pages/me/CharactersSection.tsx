import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { factionById } from '@/lib/factions'
import { useMyCharacters } from './useMyCharacters'

/** Formats an ISO timestamp as a plain date, or a dash when the server has none. */
function date(value: string | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

/** The session's own characters. Each links through to that character's locker and loadouts. */
export function CharactersSection() {
  const { characters, error } = useMyCharacters()

  if (error) return <Alert kind="error">{error}</Alert>
  if (!characters) return <Spinner label="Loading characters" />

  return (
    <Panel title="My Characters">
      <DataTable
        rows={characters}
        rowKey={(c) => c.id}
        empty="This account has no characters yet. Create one in the game client."
        columns={[
          {
            header: 'Name',
            cell: (c) => (
              <Link to={`/me/characters/${c.id}`} className={factionById(c.faction)?.cls ?? ''}>
                {c.name}
              </Link>
            )
          },
          { header: 'Empire', cell: (c) => factionById(c.faction)?.name ?? 'Unknown' },
          { header: 'Battle EP', align: 'right', cell: (c) => c.bep ?? 0 },
          { header: 'Command EP', align: 'right', cell: (c) => c.cep ?? 0 },
          { header: 'Created', align: 'right', cell: (c) => date(c.created) },
          { header: 'Last login', align: 'right', cell: (c) => date(c.last_login) }
        ]}
      />
    </Panel>
  )
}
