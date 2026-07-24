import { useState, useCallback, useEffect, useRef } from 'react'
import type { SetSummary, HydratedSet, PoolSubgroup } from '../types'
import {
  fetchSets,
  createSet as apiCreateSet,
  fetchHydratedSet,
  deleteSet as apiDeleteSet,
  poolAdd,
  poolRemove,
  poolReorder,
  poolSetHighlight,
  poolMoveToTracklist,
  subgroupCreate as apiSubgroupCreate,
  subgroupRename as apiSubgroupRename,
  subgroupDelete as apiSubgroupDelete,
  subgroupReorder as apiSubgroupReorder,
  subgroupMemberReorder as apiSubgroupMemberReorder,
  subgroupAddMember as apiSubgroupAddMember,
  subgroupRemoveMember as apiSubgroupRemoveMember,
  subgroupDropTrack as apiSubgroupDropTrack,
  tracklistAdd,
  tracklistRemove,
  tracklistReorder,
  tracklistMoveToPool,
  updateTracklistNote as apiUpdateTracklistNote,
  explorerAddNode,
  explorerDeleteNode,
  explorerAddEdge,
  explorerDeleteEdge,
  explorerSwap,
  explorerNodeToTracklist,
  explorerEdgeScores,
} from '../api/http'

export interface PendingAdd {
  type: 'pool' | 'tracklist'
  trackId: number
  title: string
}

export interface SetWorkspaceState {
  sets: SetSummary[]
  activeSetId: number | null
  activeSet: HydratedSet | null
  loading: boolean
  error: string | null
  pendingAdd: PendingAdd | null
}

const ERROR_DISMISS_MS = 4000

function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/Explorer exceeds maximum/i.test(raw)) {
    return raw
  }
  if (/409|already exists|duplicate/i.test(raw)) {
    return 'This track is already in the list.'
  }
  if (/404|not found/i.test(raw)) {
    return 'Item not found — it may have been removed.'
  }
  if (/network|fetch|ECONNREFUSED/i.test(raw)) {
    return 'Network error — please check your connection.'
  }
  if (/500|internal server/i.test(raw)) {
    return 'Server error — please try again shortly.'
  }
  if (/timeout|timed out/i.test(raw)) {
    return 'Request timed out — please try again.'
  }
  return fallback
}

export function useSetBuilder() {
  const [sets, setSets] = useState<SetSummary[]>([])
  const [activeSetId, setActiveSetId] = useState<number | null>(null)
  const [activeSet, setActiveSet] = useState<HydratedSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null)
  const mountedRef = useRef(true)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setErrorWithAutoClear = useCallback((msg: string) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
    }
    setError(msg)
    errorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setError(null)
      }
      errorTimerRef.current = null
    }, ERROR_DISMISS_MS)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current)
      }
    }
  }, [])

  const refreshSets = useCallback(async () => {
    try {
      const data = await fetchSets()
      if (mountedRef.current) {
        setSets(data)
      }
    } catch {
      /* non-critical */
    }
  }, [])

  const hydrateSet = useCallback(
    async (setId: number) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchHydratedSet(setId)
        if (mountedRef.current) {
          setActiveSet(data)
          setActiveSetId(setId)
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Failed to load set.'))
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [setErrorWithAutoClear],
  )

  useEffect(() => {
    refreshSets().then(() => {
      const stored = localStorage.getItem('xeremia-active-set-id')
      if (stored) {
        const id = Number(stored)
        if (Number.isInteger(id)) {
          hydrateSet(id)
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Only clear the stored id after a set has actually been active this
  // session (e.g. it was deleted). On mount activeSetId is still null while
  // the restore effect above reads the stored id asynchronously; removing
  // here would clobber it before it can be restored.
  const hadActiveSetRef = useRef(false)
  useEffect(() => {
    if (activeSetId !== null) {
      hadActiveSetRef.current = true
      localStorage.setItem('xeremia-active-set-id', String(activeSetId))
    } else if (hadActiveSetRef.current) {
      localStorage.removeItem('xeremia-active-set-id')
    }
  }, [activeSetId])

  const createSet = useCallback(
    async (name: string) => {
      try {
        const newSet = await apiCreateSet(name)
        await refreshSets()
        await hydrateSet(newSet.id)
        return newSet
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not create set.'))
        }
        return null
      }
    },
    [refreshSets, hydrateSet, setErrorWithAutoClear],
  )

  const selectSet = useCallback(
    (id: number) => {
      hydrateSet(id)
    },
    [hydrateSet],
  )

  const deleteSetAction = useCallback(
    async (id: number) => {
      try {
        await apiDeleteSet(id)
        await refreshSets()
        if (activeSetId === id) {
          setActiveSetId(null)
          setActiveSet(null)
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not delete set.'))
        }
      }
    },
    [activeSetId, refreshSets, setErrorWithAutoClear],
  )

  const refreshActive = useCallback(async () => {
    if (activeSetId !== null) {
      await hydrateSet(activeSetId)
      await refreshSets()
    }
  }, [activeSetId, hydrateSet, refreshSets])

  const addToPool = useCallback(
    async (trackId: number, title?: string) => {
      if (activeSetId === null) {
        setPendingAdd({
          type: 'pool',
          trackId,
          title: title ?? `Track #${trackId}`,
        })
        return
      }
      try {
        await poolAdd(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not add track to pool.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const addToTracklist = useCallback(
    async (trackId: number, title?: string) => {
      if (activeSetId === null) {
        setPendingAdd({
          type: 'tracklist',
          trackId,
          title: title ?? `Track #${trackId}`,
        })
        return
      }
      try {
        await tracklistAdd(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not add track to tracklist.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const removeFromPool = useCallback(
    async (trackId: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await poolRemove(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not remove track from pool.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const removeFromTracklist = useCallback(
    async (trackId: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await tracklistRemove(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not remove track from tracklist.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const movePoolToTracklist = useCallback(
    async (trackId: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await poolMoveToTracklist(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not move track to tracklist.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  // Shared skeleton for the boolean subgroup mutations below: no-op without
  // an active set, rehydrate on success, surface a friendly error on failure.
  const runSubgroupMutation = useCallback(
    async (
      mutate: (setId: number) => Promise<unknown>,
      failureMessage: string,
    ): Promise<boolean> => {
      if (activeSetId === null) {
        return false
      }
      try {
        await mutate(activeSetId)
        await refreshActive()
        return true
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, failureMessage))
        }
        return false
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const createSubgroup = useCallback(
    async (name: string): Promise<PoolSubgroup | null> => {
      if (activeSetId === null) {
        return null
      }
      try {
        const sg = await apiSubgroupCreate(activeSetId, name)
        await refreshActive()
        return sg
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not create group.'))
        }
        return null
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const renameSubgroup = useCallback(
    (subgroupId: number, name: string) =>
      runSubgroupMutation(
        (setId) => apiSubgroupRename(setId, subgroupId, name),
        'Could not rename group.',
      ),
    [runSubgroupMutation],
  )

  const deleteSubgroup = useCallback(
    (subgroupId: number) =>
      runSubgroupMutation(
        (setId) => apiSubgroupDelete(setId, subgroupId),
        'Could not delete group.',
      ),
    [runSubgroupMutation],
  )

  const reorderSubgroups = useCallback(
    (subgroupIds: number[]) =>
      runSubgroupMutation(
        (setId) => apiSubgroupReorder(setId, subgroupIds),
        'Could not reorder groups.',
      ),
    [runSubgroupMutation],
  )

  const reorderSubgroupMember = useCallback(
    async (
      subgroupId: number,
      poolEntryId: number,
      newPosition: number,
    ): Promise<boolean> => {
      if (activeSetId === null) {
        return false
      }
      try {
        await apiSubgroupMemberReorder(
          activeSetId,
          subgroupId,
          poolEntryId,
          newPosition,
        )
        await refreshActive()
        return true
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not reorder group tracks.'),
          )
          await refreshActive()
        }
        return false
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const addSubgroupMember = useCallback(
    (subgroupId: number, poolEntryId: number) =>
      runSubgroupMutation(
        (setId) => apiSubgroupAddMember(setId, subgroupId, poolEntryId),
        'Could not add to group.',
      ),
    [runSubgroupMutation],
  )

  const removeSubgroupMember = useCallback(
    (subgroupId: number, poolEntryId: number) =>
      runSubgroupMutation(
        (setId) => apiSubgroupRemoveMember(setId, subgroupId, poolEntryId),
        'Could not remove from group.',
      ),
    [runSubgroupMutation],
  )

  const dropTrackToSubgroup = useCallback(
    async (
      subgroupId: number,
      trackId: number,
      source: 'browse' | 'tracklist' | 'pool',
    ) => {
      if (activeSetId === null) {
        return
      }
      try {
        await apiSubgroupDropTrack(activeSetId, subgroupId, trackId, source)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not add track to group.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const moveTracklistToPool = useCallback(
    async (trackId: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await tracklistMoveToPool(activeSetId, trackId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not move track to pool.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const reorderTracklist = useCallback(
    async (trackId: number, newPosition: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await tracklistReorder(activeSetId, trackId, newPosition)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not reorder tracklist.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const reorderPool = useCallback(
    async (trackId: number, newPosition: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await poolReorder(activeSetId, trackId, newPosition)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not reorder pool.'))
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const setPoolHighlight = useCallback(
    async (trackId: number, color: string | null) => {
      if (activeSetId === null) {
        return
      }
      // Optimistic: the highlight bar should appear immediately.
      setActiveSet((prev) =>
        prev
          ? {
              ...prev,
              pool: prev.pool.map((e) =>
                e.track_id === trackId ? { ...e, highlight_color: color } : e,
              ),
            }
          : prev,
      )
      try {
        await poolSetHighlight(activeSetId, trackId, color)
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not update highlight.'),
          )
          // Reconcile with the server on failure so the UI can't drift.
          await refreshActive()
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const updateTracklistNote = useCallback(
    async (trackId: number, note: string) => {
      if (activeSetId === null) {
        return
      }
      try {
        await apiUpdateTracklistNote(activeSetId, trackId, note)
        if (mountedRef.current && activeSet) {
          setActiveSet((prev) => {
            if (!prev) {
              return prev
            }
            return {
              ...prev,
              tracklist: prev.tracklist.map((e) =>
                e.track_id === trackId ? { ...e, note } : e,
              ),
            }
          })
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not save note.'))
        }
      }
    },
    [activeSetId, activeSet, setErrorWithAutoClear],
  )

  const addExplorerNode = useCallback(
    async (trackId: number, parentNodeId?: string, level: number = 0) => {
      if (activeSetId === null) {
        return null
      }
      try {
        if (parentNodeId && activeSet) {
          const parentNode = activeSet.explorer_nodes.find(
            (n) => n.node_id === parentNodeId,
          )
          if (parentNode) {
            const targetLevel = parentNode.level + 1
            const existing = activeSet.explorer_nodes.find(
              (n) => n.track_id === trackId && n.level === targetLevel,
            )
            if (existing) {
              await explorerAddEdge(activeSetId, parentNodeId, existing.node_id)
              await refreshActive()
              return {
                node_id: existing.node_id,
                track_id: trackId,
                level: targetLevel,
              }
            }
          }
        }
        const result = await explorerAddNode(
          activeSetId,
          trackId,
          parentNodeId,
          level,
        )
        await refreshActive()
        return result
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not add node.'))
        }
        return null
      }
    },
    [activeSetId, activeSet, refreshActive, setErrorWithAutoClear],
  )

  const deleteExplorerNode = useCallback(
    async (
      nodeId: string,
      rewireEdges?: { parent_node_id: string; child_node_id: string }[],
    ) => {
      if (activeSetId === null) {
        return
      }
      try {
        await explorerDeleteNode(activeSetId, nodeId, rewireEdges)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not delete node.'))
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const addExplorerEdge = useCallback(
    async (parentNodeId: string, childNodeId: string) => {
      if (activeSetId === null) {
        return
      }
      if (
        activeSet?.explorer_edges.some(
          (e) =>
            e.parent_node_id === parentNodeId &&
            e.child_node_id === childNodeId,
        )
      ) {
        return
      }
      try {
        await explorerAddEdge(activeSetId, parentNodeId, childNodeId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not add edge.'))
        }
      }
    },
    [activeSetId, activeSet, refreshActive, setErrorWithAutoClear],
  )

  const deleteExplorerEdgeAction = useCallback(
    async (edgeId: number) => {
      if (activeSetId === null) {
        return
      }
      try {
        await explorerDeleteEdge(activeSetId, edgeId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not delete edge.'))
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const addSiblingNode = useCallback(
    async (trackId: number, inheritParentIds: string[], level: number) => {
      if (activeSetId === null) {
        return null
      }
      try {
        const firstParent = inheritParentIds[0]
        const result = await explorerAddNode(
          activeSetId,
          trackId,
          firstParent,
          level,
        )
        if (!result) {
          return null
        }
        for (let i = 1; i < inheritParentIds.length; i++) {
          await explorerAddEdge(
            activeSetId,
            inheritParentIds[i],
            result.node_id,
          )
        }
        await refreshActive()
        return result
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not add sibling.'))
        }
        return null
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const swapExplorerNodes = useCallback(
    async (nodeAId: string, nodeBId: string) => {
      if (activeSetId === null) {
        return
      }
      try {
        await explorerSwap(activeSetId, nodeAId, nodeBId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(friendlyError(err, 'Could not swap nodes.'))
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const explorerNodeAddToTracklist = useCallback(
    async (nodeId: string) => {
      if (activeSetId === null) {
        return
      }
      try {
        await explorerNodeToTracklist(activeSetId, nodeId)
        await refreshActive()
      } catch (err) {
        if (mountedRef.current) {
          setErrorWithAutoClear(
            friendlyError(err, 'Could not add to tracklist.'),
          )
        }
      }
    },
    [activeSetId, refreshActive, setErrorWithAutoClear],
  )

  const fetchEdgeScores = useCallback(
    (pairs: [number, number][]): Promise<{ scores: (number | null)[] }> => {
      if (activeSetId === null) {
        return Promise.resolve({ scores: [] })
      }
      return explorerEdgeScores(activeSetId, pairs)
    },
    [activeSetId],
  )

  const resolvePendingAdd = useCallback(
    async (setId: number) => {
      if (!pendingAdd) {
        return
      }
      const { type, trackId } = pendingAdd
      setPendingAdd(null)
      await hydrateSet(setId)
      if (type === 'pool') {
        await poolAdd(setId, trackId)
      } else {
        await tracklistAdd(setId, trackId)
      }
      await hydrateSet(setId)
      await refreshSets()
    },
    [pendingAdd, hydrateSet, refreshSets],
  )

  const clearPendingAdd = useCallback(() => {
    setPendingAdd(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    sets,
    activeSetId,
    activeSet,
    loading,
    error,
    pendingAdd,
    createSet,
    selectSet,
    deleteSet: deleteSetAction,
    addToPool,
    addToTracklist,
    removeFromPool,
    removeFromTracklist,
    movePoolToTracklist,
    moveTracklistToPool,
    createSubgroup,
    renameSubgroup,
    deleteSubgroup,
    reorderSubgroups,
    reorderSubgroupMember,
    addSubgroupMember,
    removeSubgroupMember,
    dropTrackToSubgroup,
    reorderTracklist,
    reorderPool,
    setPoolHighlight,
    updateTracklistNote,
    addExplorerNode,
    deleteExplorerNode,
    addExplorerEdge,
    deleteExplorerEdge: deleteExplorerEdgeAction,
    addSiblingNode,
    swapExplorerNodes,
    explorerNodeAddToTracklist,
    fetchEdgeScores,
    resolvePendingAdd,
    clearPendingAdd,
    clearError,
    refreshActive,
  }
}
