import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, Button, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useUser } from '@/state/UserContext'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { refresh, sessionExpired } = useUser()
  const navigate = useNavigate()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!username || !password) {
      setError('Missing fields')
      return
    }

    setBusy(true)
    try {
      await api.post('/login', { username, password })
      await refresh()
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <Panel title="Log In">
        {/* Says why someone is looking at this page when they did not ask to be. Only shown when
            the session ended on its own; a deliberate sign-out needs no explanation. An error from
            this form's own attempt supersedes it. */}
        {!error && sessionExpired && (
          <Alert kind="info">Your session ended. Please sign in again.</Alert>
        )}
        {error && <Alert kind="error">{error}</Alert>}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Username"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in' : 'Log in'}
            </Button>
            <Link
              to="/register"
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Register
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  )
}
