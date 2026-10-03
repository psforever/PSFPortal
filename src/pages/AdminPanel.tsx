import { Navigate, Route, Routes } from 'react-router-dom'
import { Panel } from '@/components/Panel'
import { useUser } from '@/state/UserContext'
import { AccountsSection } from './admin/AccountsSection'
import { AdminLogSection } from './admin/AdminLogSection'
import { AdminSidebar } from './admin/AdminSidebar'
import { AvatarsSection } from './admin/AvatarsSection'
import { CombatSection } from './admin/CombatSection'
import { ContinentsSection } from './admin/ContinentsSection'
import { InterstellarLogSection } from './admin/InterstellarLogSection'
import { PacketReviewSection } from './admin/PacketReviewSection'
import { SchedulingSection } from './admin/SchedulingSection'

/**
 * Admin panel shell: a left sidebar of subsections (grouped by which server they administer) beside
 * the active subsection's content. Subsections are nested routes under /admin, so each is
 * deep-linkable and the sidebar reflects the current one.
 */
export function AdminPanel() {
  const { isAdmin } = useUser()

  if (!isAdmin) {
    return (
      <Panel title="Admin" accent="tr">
        <p style={{ color: 'var(--text-secondary)' }}>
          You do not have permission to view this page.
        </p>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[13rem_1fr] items-start">
      <AdminSidebar />

      <div className="min-w-0">
        <Routes>
          <Route index element={<Navigate to="accounts" replace />} />
          <Route path="accounts" element={<AccountsSection />} />
          <Route path="scheduling" element={<SchedulingSection />} />
          <Route path="avatars" element={<AvatarsSection />} />
          <Route path="continents" element={<ContinentsSection />} />
          <Route path="combat" element={<CombatSection />} />
          <Route path="interstellar-log" element={<InterstellarLogSection />} />
          <Route path="packet-review" element={<PacketReviewSection />} />
          <Route path="admin-log" element={<AdminLogSection />} />
          <Route path="*" element={<Navigate to="accounts" replace />} />
        </Routes>
      </div>
    </div>
  )
}
