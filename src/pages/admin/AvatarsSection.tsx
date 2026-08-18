import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { ActionMenu } from './ActionMenu'
import { api } from '@/lib/api'
import { factionById, factionClass } from '@/lib/factions'
import { useAdminActions } from './useAdminActions'

/**
 * A character as the /characters admin endpoint returns it. `can_gm` / `can_spectate` come from the
 * avatarmodepermission table and are null when the avatar has no role row yet; the toggle endpoints
 * key off the avatar `id`.
 */
interface AdminAvatar {
  id: number
  name: string
  faction_id?: number
  account_id?: number
  last_login?: string
  can_gm?: boolean | null
  can_spectate?: boolean | null
}

const fmtDate = (v?: string) => (v ? new Date(v).toLocaleDateString() : '—')

/** World Server Management -> avatar (character) administration. */
export function AvatarsSection() {
  const [avatars, setAvatars] = useState<AdminAvatar[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    api
      .get<{ characters?: AdminAvatar[] } | AdminAvatar[]>('/characters')
      .then((r) => setAvatars(Array.isArray(r) ? r : (r.characters ?? [])))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load avatars'))
  }, [])

  useEffect(load, [load])

  const { act } = useAdminActions(load)

  return (
    <div className="space-y-4">
      {loadError && <Alert kind="error">{loadError}</Alert>}

      <Panel title="Avatars" accent="vs">
        {!avatars ? (
          <Spinner />
        ) : (
          <DataTable
            rows={avatars}
            rowKey={(a) => a.id}
            empty="No avatars."
            columns={[
              {
                header: 'Character',
                cell: (a) => (
                  <Link to={`/avatar/${a.id}`} className={factionClass(a.faction_id)}>
                    {a.name}
                  </Link>
                )
              },
              {
                header: 'Empire',
                cell: (a) => (
                  <span className={factionClass(a.faction_id)}>
                    {factionById(a.faction_id)?.key ?? '—'}
                  </span>
                )
              },
              { header: 'Last login', cell: (a) => fmtDate(a.last_login) },
              {
                header: 'GM',
                cell: (a) => (a.can_gm ? <span style={{ color: 'var(--accent-secondary)' }}>Yes</span> : '—')
              },
              { header: 'Spectate', cell: (a) => (a.can_spectate ? 'Yes' : '—') },
              {
                header: 'Actions',
                align: 'right',
                cell: (a) => (
                  <div className="flex justify-end">
                    <ActionMenu
                      items={[
                        {
                          label: a.can_gm ? 'Revoke GM' : 'Grant GM',
                          onClick: () =>
                            void act(
                              `/roles/${a.id}/${a.can_gm ? 'remove_gm' : 'add_gm'}`,
                              `${a.can_gm ? 'Revoked' : 'Granted'} GM for ${a.name}`
                            )
                        },
                        {
                          label: a.can_spectate ? 'Revoke Spectate' : 'Grant Spectate',
                          onClick: () =>
                            void act(
                              `/roles/${a.id}/${a.can_spectate ? 'remove_spectate' : 'add_spectate'}`,
                              `${a.can_spectate ? 'Revoked' : 'Granted'} spectate for ${a.name}`
                            )
                        }
                      ]}
                    />
                  </div>
                )
              }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
