import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { Alert, Button, Field } from '@/components/ui'
import { api } from '@/lib/api'
import { useUser } from '@/state/UserContext'

export function Register() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { refresh } = useUser()
  const navigate = useNavigate()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!username || !password) {
      setError('Missing fields')
      return
    }
    // The API enforces this too; checking here avoids a pointless round trip.
    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      await api.post('/register', { username, password, email })
      // Registration does not create a session; sign in with the new credentials.
      await api.post('/login', { username, password })
      await refresh()
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <Panel title="Register">
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
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Field
            label="Email (optional)"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating' : 'Create account'}
            </Button>
            <Link
              to="/login"
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Log in
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  )
}
