import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useUser } from '@/state/UserContext'
import { cn } from '@/lib/utils'

const linkBase =
  'px-3 py-2 text-xs uppercase tracking-[0.18em] transition-colors duration-150 border-b-2 border-transparent'

function Item({
  to,
  children,
  normalCase,
  onNavigate
}: {
  to: string
  children: React.ReactNode
  /** Keep the label's own casing (usernames shouldn't be upper-cased). */
  normalCase?: boolean
  /** Called after a click, so the mobile menu can close itself on navigation. */
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          linkBase,
          normalCase && 'normal-case tracking-normal',
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

/** The nav's links, rendered both in the desktop bar and the mobile drawer. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { loggedIn, username, isAdmin, logout } = useUser()
  return (
    <>
      <Item to="/" onNavigate={onNavigate}>
        Home
      </Item>
      <Item to="/leaderboard" onNavigate={onNavigate}>
        Leaderboard
      </Item>
      <Item to="/stats" onNavigate={onNavigate}>
        Stats
      </Item>
      {/* Every signed-in player gets this, admin or not -- it is the point of letting non-GMs log in. */}
      {loggedIn && (
        <Item to="/me" onNavigate={onNavigate}>
          My Characters
        </Item>
      )}
      {isAdmin && (
        <Item to="/admin" onNavigate={onNavigate}>
          Admin
        </Item>
      )}

      <div className="flex flex-col md:ml-auto md:flex-row md:items-center md:gap-1">
        {loggedIn ? (
          <>
            <Item to="/profile" normalCase onNavigate={onNavigate}>
              {username}
            </Item>
            <button
              type="button"
              onClick={() => {
                onNavigate?.()
                void logout()
              }}
              className={cn(linkBase, 'text-left text-[var(--text-muted)] hover:text-[var(--text-danger)]')}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <Item to="/login" onNavigate={onNavigate}>
              Log in
            </Item>
            <Item to="/register" onNavigate={onNavigate}>
              Register
            </Item>
          </>
        )}
      </div>
    </>
  )
}

export function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="border-b bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-1">
          <span
            className="mr-4 py-2 text-sm font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--accent-primary)', textShadow: 'var(--text-glow-teal)' }}
          >
            PSForever
          </span>

          {/* desktop: inline links */}
          <div className="hidden flex-1 items-center gap-1 md:flex">
            <NavLinks />
          </div>

          {/* mobile: hamburger toggle */}
          <button
            type="button"
            className="ml-auto p-2 md:hidden"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2}>
              {open ? (
                <path d="M6 6 L18 18 M18 6 L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7 H20 M4 12 H20 M4 17 H20" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {/* mobile: collapsible drawer */}
        {open && (
          <div className="flex flex-col border-t py-1 md:hidden" style={{ borderColor: 'var(--border)' }}>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>
    </nav>
  )
}
