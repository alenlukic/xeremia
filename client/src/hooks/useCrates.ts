import { useState, useCallback, useEffect, useRef } from 'react'
import type { ExplorerCrate, ExplorerCrateMembership } from '../types'
import {
  fetchCrates,
  crateCreate as apiCrateCreate,
  crateRename as apiCrateRename,
  crateDelete as apiCrateDelete,
  crateAddTrack as apiCrateAddTrack,
  crateRemoveTrack as apiCrateRemoveTrack,
} from '../api/http'

const ERROR_DISMISS_MS = 4000

/**
 * Library-scoped Explorer crates: named subsets of the whole track
 * collection. The immutable global crate (every track) is virtual and lives
 * in the Explorer UI; this hook only manages stored custom crates.
 */
export function useCrates() {
  const [crates, setCrates] = useState<ExplorerCrate[]>([])
  const [memberships, setMemberships] = useState<ExplorerCrateMembership[]>([])
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current)
      }
    }
  }, [])

  const setErrorWithAutoClear = useCallback((message: string) => {
    setError(message)
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
    }
    errorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setError(null)
      }
    }, ERROR_DISMISS_MS)
  }, [])

  const refresh = useCallback(async () => {
    const payload = await fetchCrates()
    if (mountedRef.current) {
      setCrates(payload.crates)
      setMemberships(payload.memberships)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {
      if (mountedRef.current) {
        setErrorWithAutoClear('Could not load crates.')
      }
    })
  }, [refresh, setErrorWithAutoClear])

  // Shared skeleton for crate mutations: reload on success, surface a
  // friendly error on failure.
  const runMutation = useCallback(
    async (
      mutate: () => Promise<unknown>,
      failureMessage: string,
    ): Promise<boolean> => {
      try {
        await mutate()
        await refresh()
        return true
      } catch {
        if (mountedRef.current) {
          setErrorWithAutoClear(failureMessage)
        }
        return false
      }
    },
    [refresh, setErrorWithAutoClear],
  )

  const createCrate = useCallback(
    async (name: string): Promise<ExplorerCrate | null> => {
      try {
        const crate = await apiCrateCreate(name)
        await refresh()
        return crate
      } catch {
        if (mountedRef.current) {
          setErrorWithAutoClear('Could not create crate.')
        }
        return null
      }
    },
    [refresh, setErrorWithAutoClear],
  )

  const renameCrate = useCallback(
    (crateId: number, name: string) =>
      runMutation(
        () => apiCrateRename(crateId, name),
        'Could not rename crate.',
      ),
    [runMutation],
  )

  const deleteCrate = useCallback(
    (crateId: number) =>
      runMutation(() => apiCrateDelete(crateId), 'Could not delete crate.'),
    [runMutation],
  )

  const addTrackToCrate = useCallback(
    (crateId: number, trackId: number) =>
      runMutation(
        () => apiCrateAddTrack(crateId, trackId),
        'Could not add track to crate.',
      ),
    [runMutation],
  )

  const removeTrackFromCrate = useCallback(
    (crateId: number, trackId: number) =>
      runMutation(
        () => apiCrateRemoveTrack(crateId, trackId),
        'Could not remove track from crate.',
      ),
    [runMutation],
  )

  return {
    crates,
    memberships,
    error,
    createCrate,
    renameCrate,
    deleteCrate,
    addTrackToCrate,
    removeTrackFromCrate,
  }
}
