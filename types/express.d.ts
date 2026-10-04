// Backend-only ambient augmentations for the Express request/session, matching how the API uses them
// (session-based auth, the fetch_user middleware). Kept out of the frontend tsconfig's scope.

import 'express-session'
import 'express'

declare module 'express-session' {
  interface SessionData {
    /** Set on login; the authenticated account's id. */
    account_id?: number
  }
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by fetch_user_middleware for the ':user' route param. */
      user?: any
      /** The account behind the session, attached by sessionRequired. */
      session_account?: any
      /** The character behind the ':avatar' route param, attached by me.ts's ownedCharacter guard. */
      avatar?: any
    }
  }
}
