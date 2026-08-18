import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { ActionMenu } from './ActionMenu'
import { api } from '@/lib/api'
import { useAdminActions } from './useAdminActions'

/**
 * An account as the /users admin endpoint returns it: `name` is the login username, `admin` is the
 * GM flag aliased for the UI, and `inactive` doubles as the banned flag (ACCOUNT.BANNED -> inactive).
 */
interface AdminUser {
  id: number
  name: string
  admin?: boolean
  inactive?: boolean
  created?: string
  last_login?: string | Record<string, never>
}

/** Login Server Management -> account (user) administration. */
export function AccountsSection() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    api
      .get<{ users?: AdminUser[] } | AdminUser[]>('/users')
      .then((r) => setUsers(Array.isArray(r) ? r : (r.users ?? [])))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load accounts'))
  }, [])

  useEffect(load, [load])

  const { act } = useAdminActions(load)

  return (
    <div className="space-y-4">
      {loadError && <Alert kind="error">{loadError}</Alert>}

      <Panel title="Accounts">
        {!users ? (
          <Spinner />
        ) : (
          <DataTable
            rows={users}
            rowKey={(u) => u.id}
            empty="No accounts."
            columns={[
              {
                header: 'Username',
                cell: (u) => (
                  <Link to={`/user/${u.id}`} style={{ color: 'var(--accent-primary)' }}>
                    {u.name}
                  </Link>
                )
              },
              {
                header: 'Status',
                cell: (u) => (
                  <span style={{ color: u.inactive ? 'var(--text-danger)' : 'var(--text-muted)' }}>
                    {u.inactive ? 'Banned' : 'Active'}
                  </span>
                )
              },
              {
                header: 'GM',
                cell: (u) =>
                  u.admin ? <span style={{ color: 'var(--accent-secondary)' }}>Yes</span> : '—'
              },
              {
                header: 'Actions',
                align: 'right',
                cell: (u) => (
                  <div className="flex justify-end">
                    <ActionMenu
                      items={[
                        {
                          label: u.admin ? 'Revoke GM' : 'Grant GM',
                          onClick: () =>
                            void act(
                              `/user/${u.id}/${u.admin ? 'remove_gm' : 'add_gm'}`,
                              `${u.admin ? 'Removed' : 'Granted'} GM for ${u.name}`
                            )
                        },
                        {
                          label: u.inactive ? 'Unban' : 'Ban',
                          danger: !u.inactive,
                          onClick: () =>
                            void act(
                              `/user/${u.id}/${u.inactive ? 'unban' : 'ban'}`,
                              `${u.inactive ? 'Unbanned' : 'Banned'} ${u.name}`
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
