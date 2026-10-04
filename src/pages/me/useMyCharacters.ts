import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface MyCharacter {
  id: number
  name: string
  faction: number
  bep: number | string
  cep: number | string
  created?: string
  last_login?: string
}

/**
 * The session's own characters, fetched once per mount.
 *
 * Both the Locker and Loadouts sections need this list before they can ask for anything, so it lives
 * in a hook rather than being threaded down from the panel shell -- each section owns its own request
 * and its own loading state, and neither blocks the other.
 */
export function useMyCharacters() {
  const [characters, setCharacters] = useState<MyCharacter[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    api
      .get<{ characters: MyCharacter[] }>('/me/characters')
      .then((r) => {
        if (!cancelled) setCharacters(r.characters ?? [])
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load characters')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { characters, error }
}
