import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Player subsection map. Deliberately mirrors ADMIN_SECTIONS in shape so both panels stay visually and
 * structurally identical -- the difference between them is what you may do, not how they look.
 */
export interface PlayerSection {
  title: string
  items: { to: string; label: string }[]
}

export const PLAYER_SECTIONS: PlayerSection[] = [
  {
    title: 'My Account',
    // Locker and Loadouts are NOT listed here. They describe a single character, so they live inside
    // that character's page as selectable views rather than as top-level destinations that would each
    // need their own character picker.
    items: [{ to: 'characters', label: 'Characters' }]
  }
]

/** Left-hand navigation for the player panel. */
export function PlayerSidebar() {
  return (
    <aside
      className="border bg-[var(--surface)] p-3 md:sticky md:top-6 md:self-start"
      style={{ borderColor: 'var(--border)', clipPath: 'var(--clip-corner-md)' }}
    >
      <nav className="space-y-5">
        {PLAYER_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3
              className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.title}
            </h3>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    // Absolute so the link always targets the subsection under /me, not a path
                    // relative to whichever subsection is currently open.
                    to={`/me/${item.to}`}
                    className={({ isActive }) =>
                      cn(
                        'block px-2 py-1.5 text-xs uppercase tracking-[0.12em] border-l-2 transition-colors',
                        isActive
                          ? 'text-[var(--accent-primary)] border-[var(--border-active)] bg-[var(--surface-raised)]'
                          : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--accent-primary)]'
                      )
                    }
                    style={({ isActive }) =>
                      isActive ? { textShadow: 'var(--text-glow-teal)' } : undefined
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
