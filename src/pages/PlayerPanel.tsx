import { Navigate, Route, Routes } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { useUser } from '@/state/UserContext'
import { CharacterDetail } from './me/CharacterDetail'
import { CharactersSection } from './me/CharactersSection'
import { PlayerSidebar } from './me/PlayerSidebar'

/**
 * Player panel shell: the same sidebar-and-content layout as the admin panel, but gated on holding a
 * session rather than on being a GM.
 *
 * This is the departure from the old panel. Signing in used to be worth nothing unless you were an
 * admin; an ordinary player can now sign in and inspect their own characters. Nothing here can change
 * state -- it is strictly a read-only view of what the world server already holds -- and every route
 * behind it re-checks ownership server-side, so this guard is a UX affordance, not the security
 * boundary.
 */
export function PlayerPanel() {
  const { loggedIn } = useUser()

  if (!loggedIn) {
    return (
      <Panel title="My Characters" accent="tr">
        <p style={{ color: 'var(--text-secondary)' }}>Log in to view your characters.</p>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_1fr] items-start">
      <PlayerSidebar />

      <div className="min-w-0">
        <Routes>
          <Route index element={<Navigate to="characters" replace />} />
          <Route path="characters" element={<CharactersSection />} />
          <Route path="characters/:id" element={<CharacterDetail />} />
          {/* Old standalone pages, kept as redirects so existing links/bookmarks still land somewhere. */}
          <Route path="locker" element={<Navigate to="/me/characters" replace />} />
          <Route path="loadouts" element={<Navigate to="/me/characters" replace />} />
          <Route path="*" element={<Navigate to="characters" replace />} />
        </Routes>
      </div>
    </div>
  )
}
