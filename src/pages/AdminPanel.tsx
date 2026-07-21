import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, Button, DataTable, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { factionClass } from '@/lib/factions'
import { useUser } from '@/state/UserContext'

interface AdminUser {
  id: number
  username: string
  gm?: boolean
  banned?: boolean
  created?: string
}

interface RoleRow {
  id: number
  name: string
  faction_id?: number
  gm?: boolean
  spectate?: boolean
}

export function AdminPanel() {
  const { isAdmin } = useUser()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [roles, setRoles] = useState<RoleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<{ users?: AdminUser[] } | AdminUser[]>('/users')
      .then((r) => setUsers(Array.isArray(r) ? r : (r.users ?? [])))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load users'))

    api
      .get<{ roles?: RoleRow[] } | RoleRow[]>('/roles')
      .then((r) => setRoles(Array.isArray(r) ? r : (r.roles ?? [])))
      .catch(() => setRoles([]))
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  async function act(path: string, description: string) {
    setError(null)
    setNotice(null)
    try {
      await api.post(path)
      setNotice(description)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  if (!isAdmin) {
    return (
      <Panel title="Admin" accent="tr">
        <p style={{ color: 'var(--text-secondary)' }}>
          You do not have permission to view this page.
        </p>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

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
                    {u.username}
                  </Link>
                )
              },
              {
                header: 'Status',
                cell: (u) => (
                  <span style={{ color: u.banned ? 'var(--text-danger)' : 'var(--text-muted)' }}>
                    {u.banned ? 'Banned' : 'Active'}
                  </span>
                )
              },
              {
                header: 'GM',
                cell: (u) => (u.gm ? <span style={{ color: 'var(--accent-secondary)' }}>Yes</span> : '—')
              },
              {
                header: 'Actions',
                align: 'right',
                cell: (u) => (
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void act(
                          `/user/${u.id}/${u.gm ? 'remove_gm' : 'add_gm'}`,
                          `${u.gm ? 'Removed' : 'Granted'} GM for ${u.username}`
                        )
                      }
                    >
                      {u.gm ? 'Revoke GM' : 'Grant GM'}
                    </Button>
                    <Button
                      variant={u.banned ? 'ghost' : 'danger'}
                      onClick={() =>
                        void act(
                          `/user/${u.id}/${u.banned ? 'unban' : 'ban'}`,
                          `${u.banned ? 'Unbanned' : 'Banned'} ${u.username}`
                        )
                      }
                    >
                      {u.banned ? 'Unban' : 'Ban'}
                    </Button>
                  </div>
                )
              }
            ]}
          />
        )}
      </Panel>

      <Panel title="Character Roles" accent="vs">
        {!roles ? (
          <Spinner />
        ) : (
          <DataTable
            rows={roles}
            rowKey={(r) => r.id}
            empty="No roles assigned."
            columns={[
              {
                header: 'Character',
                cell: (r) => (
                  <Link to={`/avatar/${r.id}`} className={factionClass(r.faction_id)}>
                    {r.name}
                  </Link>
                )
              },
              { header: 'GM', cell: (r) => (r.gm ? 'Yes' : '—') },
              { header: 'Spectate', cell: (r) => (r.spectate ? 'Yes' : '—') },
              {
                header: 'Actions',
                align: 'right',
                cell: (r) => (
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void act(
                          `/roles/${r.id}/${r.gm ? 'remove_gm' : 'add_gm'}`,
                          `Updated GM role for ${r.name}`
                        )
                      }
                    >
                      {r.gm ? 'Revoke GM' : 'Grant GM'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void act(
                          `/roles/${r.id}/${r.spectate ? 'remove_spectate' : 'add_spectate'}`,
                          `Updated spectate role for ${r.name}`
                        )
                      }
                    >
                      {r.spectate ? 'Revoke Spectate' : 'Grant Spectate'}
                    </Button>
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
