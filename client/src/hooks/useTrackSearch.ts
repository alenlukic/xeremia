import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SearchSuggestion, Track } from '../types'
import { searchTracks } from '../api/http'
import {
  buildTrackSearchIndex,
  mergeSuggestions,
  searchTracksLocal,
} from '../utils/trackSearch'

const ES_DEBOUNCE_MS = 150

const esCache = new Map<string, SearchSuggestion[]>()

/**
 * Track search with instant client-side results over the in-memory
 * collection, refined by Elasticsearch when the backend is reachable.
 *
 * Local matches are computed synchronously on every `search()` call so the
 * dropdown updates with zero perceived latency; a debounced ES request then
 * re-ranks the list when it resolves (and is silently skipped on failure,
 * e.g. when Elasticsearch is down).
 */
export function useTrackSearch(allTracks: Track[]) {
  const index = useMemo(() => buildTrackSearchIndex(allTracks), [allTracks])
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentQueryRef = useRef('')

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const clear = useCallback(() => {
    currentQueryRef.current = ''
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setSuggestions([])
  }, [])

  const search = useCallback(
    (q: string) => {
      const trimmed = q.trim()
      currentQueryRef.current = trimmed
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      if (!trimmed) {
        setSuggestions([])
        return
      }

      const local = searchTracksLocal(index, trimmed)
      const cached = esCache.get(trimmed)
      setSuggestions(cached ? mergeSuggestions(cached, local) : local)
      if (cached) {
        return
      }

      debounceRef.current = setTimeout(() => {
        searchTracks(trimmed)
          .then((results) => {
            esCache.set(trimmed, results)
            if (currentQueryRef.current === trimmed) {
              setSuggestions(
                mergeSuggestions(results, searchTracksLocal(index, trimmed)),
              )
            }
          })
          .catch(() => {
            /* keep instant local results when ES is unavailable */
          })
      }, ES_DEBOUNCE_MS)
    },
    [index],
  )

  return { suggestions, search, clear }
}
