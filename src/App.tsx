import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { Panel } from '@/components/Panel'
import { Home } from '@/pages/Home'
import { UserProvider, useUser } from '@/state/UserContext'

/** Placeholder for views still to be ported from the Svelte app. */
function Pending({ name }: { name: string }) {
  return (
    <Panel title={name}>
      <p style={{ color: 'var(--text-muted)' }}>
        Not yet ported from the previous portal.
      </p>
    </Panel>
  )
}

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
            <Route path="/login" element={<Pending name="Login" />} />
            <Route path="/register" element={<Pending name="Register" />} />
            <Route path="/leaderboard" element={<Pending name="Leaderboard" />} />
            <Route path="/avatar/:id" element={<Pending name="Avatar" />} />
            <Route path="/admin" element={<Pending name="Admin Panel" />} />
            <Route path="/profile" element={<Pending name="Profile" />} />
            <Route path="/user/:id" element={<Pending name="User" />} />
            <Route path="/outfit/:id" element={<Pending name="Outfit" />} />
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
