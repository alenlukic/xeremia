import { useState, useCallback, useRef, useEffect } from 'react'
import type { Track, SearchSuggestion, TransitionMatch } from '../types'
import { fetchMatches } from '../api/http'

interface MatchSourceState {
  matchSource: Track | SearchSuggestion | null
  matches: TransitionMatch[]
  matchesLoading: boolean
  matchesError: string | null
  selectMatchSource: (track: Track | SearchSuggestion) => void
  clearMatchSource: () => void
  refetchMatches: () => void
}

/**
 * Retained match-source state with session-scoped match caching.
 * Search browse focus is owned separately in App; this hook only tracks
 * the active source used for Matches fetching and rendering.
 */
export function useSelectedTrack(onTrackAction?: () => void): MatchSourceState {
  const [matchSource, setMatchSource] = useState<
    Track | SearchSuggestion | null
  >(null)
  const [matches, setMatches] = useState<TransitionMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const matchCacheRef = useRef<Map<number, TransitionMatch[]>>(new Map())
  const matchSourceRef = useRef<Track | SearchSuggestion | null>(null)
  const onTrackActionRef = useRef(onTrackAction)
  useEffect(() => {
    onTrackActionRef.current = onTrackAction
  }, [onTrackAction])

  const loadMatches = useCallback((trackId: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setMatchesLoading(true)

    fetchMatches(trackId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          matchCacheRef.current.set(trackId, data)
          setMatches(data)
          setMatchesError(null)
          onTrackActionRef.current?.()
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setMatches([])
          setMatchesError(
            err instanceof Error ? err.message : 'Failed to load matches',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMatchesLoading(false)
        }
      })
  }, [])

  const selectMatchSource = useCallback(
    (track: Track | SearchSuggestion) => {
      abortRef.current?.abort()
      setMatchSource(track)
      matchSourceRef.current = track

      const cached = matchCacheRef.current.get(track.id)
      if (cached) {
        setMatches(cached)
        setMatchesError(null)
        setMatchesLoading(false)
        return
      }

      setMatches([])
      setMatchesError(null)
      loadMatches(track.id)
    },
    [loadMatches],
  )

  const clearMatchSource = useCallback(() => {
    if (matchSourceRef.current === null) {
      return
    }
    abortRef.current?.abort()
    setMatchSource(null)
    matchSourceRef.current = null
    setMatches([])
    setMatchesError(null)
    setMatchesLoading(false)
  }, [])

  const refetchMatches = useCallback(() => {
    const track = matchSourceRef.current
    if (!track) {
      return
    }
    matchCacheRef.current.delete(track.id)
    loadMatches(track.id)
  }, [loadMatches])

  return {
    matchSource,
    matches,
    matchesLoading,
    matchesError,
    selectMatchSource,
    clearMatchSource,
    refetchMatches,
  }
}
