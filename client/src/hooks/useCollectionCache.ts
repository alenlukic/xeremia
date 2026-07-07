import { useState, useEffect } from 'react'
import type { Track } from '../types'
import { fetchTracks, fetchTrackTraits } from '../api/http'

export type TraitMap = Map<number, Record<string, unknown>>

/**
 * Session-scoped cache for the full track collection and trait data.
 * Loads once on mount and retains data for the session lifetime.
 * Browse filtering is done client-side against this cached dataset.
 */
export function useCollectionCache() {
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [traitMap, setTraitMap] = useState<TraitMap>(new Map())
  const [tracksError, setTracksError] = useState<string | null>(null)
  const [traitsError, setTraitsError] = useState<string | null>(null)

  useEffect(() => {
    const trackPromise = fetchTracks({}).then(
      (tracks) => {
        setAllTracks(tracks)
        setTracksError(null)
      },
      (err: unknown) => {
        setAllTracks([])
        setTracksError(
          err instanceof Error ? err.message : 'Failed to load tracks',
        )
      },
    )

    const traitPromise = fetchTrackTraits().then(
      (traits) => {
        const map: TraitMap = new Map()
        for (const t of traits) {
          if (t.traits) {
            map.set(t.track_id, t.traits)
          }
        }
        setTraitMap(map)
        setTraitsError(null)
      },
      (err: unknown) => {
        setTraitMap(new Map())
        setTraitsError(
          err instanceof Error ? err.message : 'Failed to load track traits',
        )
      },
    )

    Promise.allSettled([trackPromise, traitPromise]).then(() =>
      setLoading(false),
    )
  }, [])

  return { allTracks, traitMap, loading, tracksError, traitsError }
}
