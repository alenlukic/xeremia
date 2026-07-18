import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { PoolSubgroup, SetSummary, HydratedSet, Track } from '../types'
import type { PendingAdd } from '../hooks/useSetBuilder'
import { exportSetM3u8 } from '../api/http'
import { SetPoolTable } from './SetPoolTable'
import { SetTracklist } from './SetTracklist'
import { SetExplorerCanvas } from './SetExplorerCanvas'

type SubTab = 'tracks' | 'explorer'

interface Props {
  allTracks: Track[]
  sets: SetSummary[]
  activeSetId: number | null
  activeSet: HydratedSet | null
  loading: boolean
  error: string | null
  pendingAdd: PendingAdd | null
  createSet: (name: string) => Promise<SetSummary | null>
  selectSet: (id: number) => void
  deleteSet: (id: number) => void
  removeFromPool: (trackId: number) => void
  movePoolToTracklist: (trackId: number) => void
  reorderPool: (trackId: number, newPosition: number) => void
  addToPool: (trackId: number, title?: string) => void
  createSubgroup: (name: string) => Promise<PoolSubgroup | null>
  renameSubgroup: (subgroupId: number, name: string) => Promise<boolean>
  deleteSubgroup: (subgroupId: number) => Promise<boolean>
  reorderSubgroups: (subgroupIds: number[]) => Promise<boolean>
  addSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  removeSubgroupMember: (
    subgroupId: number,
    poolEntryId: number,
  ) => Promise<boolean>
  removeFromTracklist: (trackId: number) => void
  moveTracklistToPool: (trackId: number) => void
  reorderTracklist: (trackId: number, newPosition: number) => void
  updateTracklistNote: (trackId: number, note: string) => void
  addToTracklist: (trackId: number, title?: string) => void
  addExplorerNode: (
    trackId: number,
    parentNodeId?: string,
    level?: number,
  ) => Promise<unknown>
  deleteExplorerNode: (
    nodeId: string,
    rewireEdges?: { parent_node_id: string; child_node_id: string }[],
  ) => void
  addExplorerEdge: (parentNodeId: string, childNodeId: string) => Promise<void>
  deleteExplorerEdge: (edgeId: number) => Promise<void>
  swapExplorerNodes: (nodeAId: string, nodeBId: string) => void
  explorerNodeAddToTracklist: (nodeId: string) => void
  addSiblingNode: (
    trackId: number,
    inheritParentIds: string[],
    level: number,
  ) => Promise<unknown>
  fetchEdgeScores: (
    pairs: [number, number][],
  ) => Promise<{ scores: (number | null)[] }>
  resolvePendingAdd: (setId: number) => void
  clearPendingAdd: () => void
  clearError: () => void
}

export function SetBuilder({
  allTracks,
  sets,
  activeSetId,
  activeSet,
  loading,
  error,
  pendingAdd,
  createSet,
  selectSet,
  deleteSet,
  removeFromPool,
  movePoolToTracklist,
  reorderPool,
  addToPool,
  createSubgroup,
  renameSubgroup,
  deleteSubgroup,
  reorderSubgroups,
  addSubgroupMember,
  removeSubgroupMember,
  removeFromTracklist,
  moveTracklistToPool,
  reorderTracklist,
  updateTracklistNote,
  addToTracklist,
  addExplorerNode,
  deleteExplorerNode,
  addExplorerEdge,
  deleteExplorerEdge,
  swapExplorerNodes,
  explorerNodeAddToTracklist,
  addSiblingNode,
  fetchEdgeScores,
  resolvePendingAdd,
  clearPendingAdd,
  clearError,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('tracks')
  const [newSetName, setNewSetName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [poolExpanded, setPoolExpanded] = useState(false)
  // The set picker (dropdown + new/delete) and the workspace swap in place:
  // picking a set shows the workspace; the back arrow returns to the picker.
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNewInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNewInput])

  // Open the new-set input when a pending add arrives with no active set.
  // The prev trackers start at `undefined` so the check also fires on mount
  // (matching the original effect's mount behavior), then on subsequent prop
  // changes. Adjusting during render avoids the cascading render and the
  // react-hooks/set-state-in-effect warning.
  const [prevPendingAdd, setPrevPendingAdd] = useState<
    PendingAdd | null | undefined
  >(undefined)
  const [prevActiveSetId, setPrevActiveSetId] = useState<
    number | null | undefined
  >(undefined)
  if (pendingAdd !== prevPendingAdd || activeSetId !== prevActiveSetId) {
    if (activeSetId !== prevActiveSetId && activeSetId != null) {
      setPickerOpen(false)
    }
    setPrevPendingAdd(pendingAdd)
    setPrevActiveSetId(activeSetId)
    if (pendingAdd && !activeSetId) {
      setShowNewInput(true)
    }
  }

  const handleCreateSet = useCallback(async () => {
    const name = newSetName.trim()
    if (!name) {
      return
    }
    const result = await createSet(name)
    setNewSetName('')
    setShowNewInput(false)
    if (result && pendingAdd) {
      resolvePendingAdd(result.id)
    }
  }, [newSetName, createSet, pendingAdd, resolvePendingAdd])

  const handleCancelCreate = useCallback(() => {
    setShowNewInput(false)
    setNewSetName('')
    clearPendingAdd()
  }, [clearPendingAdd])

  const handleExport = useCallback(async () => {
    if (!activeSet || activeSet.tracklist.length === 0) {
      return
    }
    try {
      const ids = activeSet.tracklist.map((e) => e.track_id)
      const result = await exportSetM3u8(ids, activeSet.set.name)
      const blob = new Blob([result.content], { type: 'audio/x-mpegurl' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* export failure is non-critical */
    }
  }, [activeSet])

  const handlePoolAddTrack = useCallback(
    (trackId: number, title?: string) => {
      addToPool(trackId, title)
    },
    [addToPool],
  )

  const handleTracklistAddTrack = useCallback(
    (trackId: number, title?: string) => {
      addToTracklist(trackId, title)
    },
    [addToTracklist],
  )

  const tracklistTrackIds = useMemo(() => {
    if (!activeSet) {
      return new Set<number>()
    }
    return new Set(activeSet.tracklist.map((e) => e.track_id))
  }, [activeSet])

  if (sets.length === 0 && !showNewInput && !pendingAdd) {
    return (
      <div className="set-builder">
        <div className="set-empty">
          <p>No sets yet. Create one to start building.</p>
          <button
            className="set-create-btn"
            onClick={() => setShowNewInput(true)}
          >
            + New Set
          </button>
        </div>
      </div>
    )
  }

  const showPicker = pickerOpen || !activeSet

  return (
    <div className="set-builder">
      {showPicker && (
        <div className="set-header">
          <div className="set-selector">
            {sets.length > 0 && (
              <select
                className="set-select"
                // While the picker is open (via the back arrow) the placeholder
                // is shown instead of the active set, so re-picking the current
                // set still fires onChange and re-renders the workspace.
                value={pickerOpen ? '' : (activeSetId ?? '')}
                onChange={(e) => {
                  if (e.target.value === '') {
                    return
                  }
                  const val = Number(e.target.value)
                  if (Number.isInteger(val)) {
                    selectSet(val)
                    // Re-picking the current set doesn't change activeSetId,
                    // so close the picker here rather than via the id tracker.
                    setPickerOpen(false)
                  }
                }}
              >
                <option value="" disabled>
                  Select a set…
                </option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (P:{s.pool_count} T:{s.tracklist_count})
                  </option>
                ))}
              </select>
            )}
            <button
              className="set-create-btn"
              onClick={() => setShowNewInput(true)}
            >
              + New
            </button>
            {activeSetId && (
              <button
                className="set-delete-btn"
                onClick={() => deleteSet(activeSetId)}
                title="Delete set"
              >
                ×
              </button>
            )}
          </div>

          {showNewInput && (
            <div className="set-new-input-row">
              {pendingAdd && (
                <span className="set-pending-hint">
                  Create a set to add "{pendingAdd.title}" to {pendingAdd.type}
                </span>
              )}
              <input
                ref={inputRef}
                className="set-name-input"
                placeholder="Set name…"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateSet()
                  }
                  if (e.key === 'Escape') {
                    handleCancelCreate()
                  }
                }}
              />
              <button className="set-create-confirm" onClick={handleCreateSet}>
                Create
              </button>
              <button className="set-action-btn" onClick={handleCancelCreate}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="set-toast" role="alert">
          <span>{error}</span>
          <button
            className="set-toast-dismiss"
            onClick={clearError}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {!activeSet && loading && <p className="table-status">Loading set…</p>}

      {activeSet && !showPicker && (
        <>
          <div className="set-sub-tabs">
            <button
              className="set-back-btn"
              aria-label="Choose set"
              title="Choose set"
              onClick={() => setPickerOpen(true)}
            >
              ←
            </button>
            <button
              className={`set-sub-tab${subTab === 'tracks' ? ' active' : ''}`}
              onClick={() => setSubTab('tracks')}
            >
              Tracks
            </button>
            <button
              className={`set-sub-tab${subTab === 'explorer' ? ' active' : ''}`}
              onClick={() => setSubTab('explorer')}
            >
              Explorer
            </button>
            {activeSet.tracklist.length > 0 && (
              <button className="set-export-btn" onClick={handleExport}>
                Export m3u8
              </button>
            )}
          </div>

          {subTab === 'tracks' && (
            <div className="set-workspace-split">
              <SetTracklist
                allTracks={allTracks}
                tracklist={activeSet.tracklist}
                onRemove={removeFromTracklist}
                onMoveToPool={moveTracklistToPool}
                onReorder={reorderTracklist}
                onUpdateNote={updateTracklistNote}
                onAddTrack={handleTracklistAddTrack}
              />
              <div
                className={`set-pool-accordion${poolExpanded ? ' expanded' : ''}`}
              >
                {poolExpanded && (
                  <button
                    className="set-pool-collapse-handle"
                    onClick={() => setPoolExpanded(false)}
                    aria-label="Collapse pool"
                    title="Collapse pool"
                  >
                    ‹
                  </button>
                )}
                {!poolExpanded ? (
                  <button
                    className="set-pool-expand-tab"
                    onClick={() => setPoolExpanded(true)}
                    aria-label="Expand pool"
                    title="Expand pool"
                  >
                    <span
                      className="set-pool-expand-chevron"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                    <span className="set-pool-expand-label">
                      Pool ({activeSet.pool.length})
                    </span>
                  </button>
                ) : (
                  <div className="set-pool-accordion-content">
                    <SetPoolTable
                      allTracks={allTracks}
                      pool={activeSet.pool}
                      subgroups={activeSet.pool_subgroups ?? []}
                      subgroupMemberships={
                        activeSet.pool_subgroup_memberships ?? []
                      }
                      onRemove={removeFromPool}
                      onMoveToTracklist={movePoolToTracklist}
                      onReorder={reorderPool}
                      onAddTrack={handlePoolAddTrack}
                      onCreateSubgroup={createSubgroup}
                      onRenameSubgroup={renameSubgroup}
                      onDeleteSubgroup={deleteSubgroup}
                      onReorderSubgroups={reorderSubgroups}
                      onAddSubgroupMember={addSubgroupMember}
                      onRemoveSubgroupMember={removeSubgroupMember}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === 'explorer' && (
            <SetExplorerCanvas
              allTracks={allTracks}
              nodes={activeSet.explorer_nodes}
              edges={activeSet.explorer_edges}
              onAddNode={addExplorerNode}
              onDeleteNode={deleteExplorerNode}
              onAddEdge={addExplorerEdge}
              onDeleteEdge={deleteExplorerEdge}
              onSwap={swapExplorerNodes}
              onNodeToTracklist={explorerNodeAddToTracklist}
              onAddSibling={addSiblingNode}
              tracklistTrackIds={tracklistTrackIds}
              fetchEdgeScores={fetchEdgeScores}
            />
          )}
        </>
      )}
    </div>
  )
}
