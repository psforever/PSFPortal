import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { Panel } from '@/components/Panel'
import { AdminPanel } from '@/pages/AdminPanel'
import { Avatar } from '@/pages/Avatar'
import { Home } from '@/pages/Home'
import { Leaderboard } from '@/pages/Leaderboard'
import { Login } from '@/pages/Login'
import { Outfit } from '@/pages/Outfit'
import { Profile } from '@/pages/Profile'
import { Register } from '@/pages/Register'
import { UserProvider, useUser } from '@/state/UserContext'

function NotFound() {
  return (
    <Panel title="404" accent="tr">
      <p style={{ color: 'var(--text-secondary)' }}>No such page.</p>
    </Panel>
  )
}

function Shell() {
  // Mirrors the old app's "prevent view pop-in" behaviour: hold render until the
  // initial /api/user probe resolves.
  const { initialised } = useUser()

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] font-mono">
      <Nav />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">
        {initialised && (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/avatar/:id" element={<Avatar />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/user/:id" element={<Profile />} />
            <Route path="/outfit/:id" element={<Outfit />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>

      <footer
        className="border-t py-4 text-center text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <p>
          PSFPortal &mdash;{' '}
          <a
            href="https://github.com/GeekOfWires/PSFPortal"
            className="hover:text-[var(--accent-primary)]"
          >
            GitHub
          </a>{' '}
          &copy; {new Date().getFullYear()} PSForever.net
        </p>
        <p className="mt-1">
          PlanetSide is a registered trademark of Daybreak Game Company, LLC. PSForever claims no
          such trademarks.
        </p>
      </footer>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <Shell />
      </UserProvider>
    </BrowserRouter>
  )
}
