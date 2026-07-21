import { NavLink } from 'react-router-dom'
import { useUser } from '@/state/UserContext'
import { cn } from '@/lib/utils'

const linkBase =
  'px-3 py-2 text-xs uppercase tracking-[0.18em] transition-colors duration-150 border-b-2 border-transparent'

function Item({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          linkBase,
          isActive
            ? 'text-[var(--accent-primary)] border-b-[var(--border-active)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--accent-primary)]'
        )
      }
      style={({ isActive }) => (isActive ? { textShadow: 'var(--text-glow-teal)' } : undefined)}
    >
      {children}
    </NavLink>
  )
}

export function Nav() {
  const { loggedIn, username, isAdmin, logout } = useUser()

  return (
    <nav
      className="border-b bg-[var(--surface)]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mx-auto max-w-6xl px-4 flex items-center gap-1">
        <span
          className="mr-4 py-2 text-sm font-bold tracking-[0.25em] uppercase"
          style={{ color: 'var(--accent-primary)', textShadow: 'var(--text-glow-teal)' }}
        >
          PSForever
        </span>

        <Item to="/">Home</Item>
        <Item to="/leaderboard">Leaderboard</Item>
        {isAdmin && <Item to="/admin">Admin</Item>}

        <div className="ml-auto flex items-center gap-1">
          {loggedIn ? (
            <>
              <Item to="/profile">{username}</Item>
              <button
                type="button"
                onClick={() => void logout()}
                className={cn(linkBase, 'text-[var(--text-muted)] hover:text-[var(--text-danger)]')}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Item to="/login">Log in</Item>
              <Item to="/register">Register</Item>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
