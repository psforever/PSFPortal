import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { api, ApiError, onSessionLost } from '@/lib/api'

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
  /**
   * True when the sign-in ended by itself rather than by asking.
   *
   * Set when a request comes back unauthenticated, so the login page can explain why somebody is
   * suddenly looking at it. Cleared on the next successful sign-in, and never set by `logout` --
   * a person who signed out does not need telling that they signed out.
   */
  sessionExpired: boolean
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
  const [user, setUser] = useState<
    Omit<UserState, 'initialised' | 'sessionExpired' | 'refresh' | 'logout'>
  >(LOGGED_OUT)
  const [initialised, setInitialised] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api.get<UserResponse>('/user')
      setUser({
        loggedIn: true,
        username: data.name,
        isAdmin: data.admin,
        userId: data.id
      })
      // Whatever ended the last session, this one is good.
      setSessionExpired(false)
      return true
    } catch (error) {
      // 401 (no session) and 403 (signed in, not permitted) are both answers rather than faults.
      if (!(error instanceof ApiError && (error.status === 401 || error.status === 403))) {
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
    // Signing out deliberately is not an expired session.
    setSessionExpired(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Sign out locally the moment any request reports the session is gone.
   *
   * Local only, deliberately: the session no longer exists on the server, so calling `/logout` would
   * be asking it to destroy something it has already lost. What matters is that the interface stops
   * showing a signed-in state it cannot back up -- an admin page still rendering its controls after
   * the session lapsed is a page where every button fails.
   */
  useEffect(
    () =>
      onSessionLost(() => {
        setUser(LOGGED_OUT)
        setSessionExpired(true)
        setInitialised(true)
      }),
    []
  )

  const value = useMemo<UserState>(
    () => ({ ...user, initialised, sessionExpired, refresh, logout }),
    [user, initialised, sessionExpired, refresh, logout]
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
