import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Admin subsection map. Each group is a server the portal administers; its items are the areas of
 * that server's state you can manage. Add a section or item here and it appears in the sidebar with
 * no other wiring -- the routes in AdminPanel key off the same paths.
 */
export interface AdminSection {
  title: string
  items: { to: string; label: string }[]
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: 'World Server Management',
    items: [
      { to: 'avatars', label: 'Avatars' },
      { to: 'continents', label: 'Continents' },
      { to: 'combat', label: 'Combat' }
    ]
  },
  {
    title: 'Login Server Management',
    items: [{ to: 'accounts', label: 'Accounts' }]
  },
  {
    title: 'Services',
    items: [{ to: 'scheduling', label: 'Scheduling' }]
  },
  {
    title: 'Audit',
    items: [
      { to: 'interstellar-log', label: 'Interstellar Log' },
      { to: 'admin-log', label: 'Admin Log' },
      { to: 'packet-review', label: 'Packet Review' }
    ]
  }
]

/** Left-hand navigation for the admin panel, grouped by managed server. */
export function AdminSidebar() {
  return (
    <aside
      className="border bg-[var(--surface)] p-3 md:sticky md:top-6 md:self-start"
      style={{ borderColor: 'var(--border)', clipPath: 'var(--clip-corner-md)' }}
    >
      <nav className="space-y-5">
        {ADMIN_SECTIONS.map((section) => (
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
                    // Absolute so the link always targets the subsection under /admin, not a path
                    // relative to whichever subsection is currently open.
                    to={`/admin/${item.to}`}
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
