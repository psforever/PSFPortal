import { api } from '@/lib/api'
import { useToast } from '@/state/ToastContext'

/**
 * Shared plumbing for an admin subsection: a POST action that surfaces a success or error toast, then
 * reloads the section's data. Every subsection follows the same fetch -> act -> reload loop, so this
 * keeps that identical across Accounts, Avatars, and whatever sections come later.
 */
export function useAdminActions(reload: () => void) {
  const toast = useToast()

  async function act(path: string, description: string) {
    try {
      await api.post(path)
      toast.success(description)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    }
  }

  return { act }
}
