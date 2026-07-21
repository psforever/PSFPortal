import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, DataTable, Spinner } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { factionClass } from '@/lib/factions'
import { useUser } from '@/state/UserContext'
import type { AccountProfile, Character, LoginRecord } from '@/lib/types'

/**
 * Serves both /profile (the signed-in account) and /user/:id, exactly as the
 * previous portal did — both routes rendered the same view.
 */
export function Profile() {
  const { id } = useParams<{ id: string }>()
  const { userId, loggedIn } = useUser()
  const accountId = id ?? (userId ? String(userId) : undefined)

  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [logins, setLogins] = useState<LoginRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accountId) return
    setError(null)

    api
      .get<AccountProfile>(`/user/${accountId}/profile`)
      .then(setProfile)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 403
            ? 'You do not have permission to view this account.'
            : e instanceof Error
              ? e.message
              : 'Failed to load profile'
        )
      )

    api
      .get<{ logins: LoginRecord[] }>(`/user/${accountId}/logins`)
      .then((r) => setLogins(r.logins ?? []))
      .catch(() => setLogins([]))
  }, [accountId])

  if (!loggedIn && !id) {
    return (
      <Panel title="Profile">
        <p style={{ color: 'var(--text-secondary)' }}>
          You must <Link to="/login" style={{ color: 'var(--accent-primary)' }}>log in</Link> to view
          your profile.
        </p>
      </Panel>
    )
  }

  if (error) return <Alert kind="error">{error}</Alert>
  if (!profile) return <Spinner label="Loading profile" />

  const characters: Character[] = profile.characters ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Account" className="lg:col-span-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>
          {profile.username ?? '—'}
        </h1>

        <dl className="mt-4 space-y-2 text-sm">
          {profile.email && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Email</dt>
              <dd style={{ color: 'var(--text-secondary)' }}>{profile.email}</dd>
            </div>
          )}
          {profile.created && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Created</dt>
              <dd style={{ color: 'var(--text-secondary)' }}>
                {new Date(profile.created).toLocaleDateString()}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt style={{ color: 'var(--text-muted)' }}>Status</dt>
            <dd style={{ color: profile.banned ? 'var(--text-danger)' : 'var(--accent-primary)' }}>
              {profile.banned ? 'Banned' : 'Active'}
            </dd>
          </div>
          {profile.gm && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--text-muted)' }}>Role</dt>
              <dd style={{ color: 'var(--accent-secondary)' }}>GM</dd>
            </div>
          )}
        </dl>
      </Panel>

      <Panel title="Characters" className="lg:col-span-2">
        <DataTable
          rows={characters}
          rowKey={(c) => c.id}
          empty="This account has no characters."
          columns={[
            {
              header: 'Name',
              cell: (c) => (
                <Link to={`/avatar/${c.id}`} className={factionClass(c.faction_id)}>
                  {c.name}
                </Link>
              )
            },
            { header: 'BR', align: 'right', cell: (c) => c.battle_rank ?? '—' },
            { header: 'CR', align: 'right', cell: (c) => c.command_rank ?? '—' }
          ]}
        />
      </Panel>

      <Panel title="Recent Logins" className="lg:col-span-3">
        {!logins ? (
          <Spinner />
        ) : (
          <DataTable
            rows={logins}
            rowKey={(l, i) => l.id ?? i}
            empty="No login records."
            columns={[
              {
                header: 'When',
                cell: (l) => (l.login_time ? new Date(l.login_time).toLocaleString() : '—')
              },
              { header: 'Address', cell: (l) => l.canonical_hostname ?? l.ip ?? '—' }
            ]}
          />
        )}
      </Panel>
    </div>
  )
}
