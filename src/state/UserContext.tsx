import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { api, ApiError } from '@/lib/api'

/** Shape returned by GET /api/user */
interface UserResponse {
  id: number
  name: string
  admin: boolean
}

export interface UserState {
  loggedIn: boolean
  username: string
  isAdmin: boolean
  userId: number
  /** false until the initial /api/user probe has resolved, to avoid view pop-in */
  initialised: boolean
  refresh: () => Promise<boolean>
  logout: () => Promise<void>
}

const UserContext = createContext<UserState | null>(null)

const LOGGED_OUT = {
  loggedIn: false,
  username: '',
  isAdmin: false,
  userId: 0
} as const

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<UserState, 'initialised' | 'refresh' | 'logout'>>(LOGGED_OUT)
  const [initialised, setInitialised] = useState(false)

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api.get<UserResponse>('/user')
      setUser({
        loggedIn: true,
        username: data.name,
        isAdmin: data.admin,
        userId: data.id
      })
      return true
    } catch (error) {
      // 403 is the API's "not logged in / not admin" signal, not an error worth surfacing.
      if (!(error instanceof ApiError && error.status === 403)) {
        console.error('Unexpected error resolving login state', error)
      }
      setUser(LOGGED_OUT)
      return false
    } finally {
      setInitialised(true)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/logout')
    } catch {
      /* logging out locally regardless of the server's answer */
    }
    setUser(LOGGED_OUT)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<UserState>(
    () => ({ ...user, initialised, refresh, logout }),
    [user, initialised, refresh, logout]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserState {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
