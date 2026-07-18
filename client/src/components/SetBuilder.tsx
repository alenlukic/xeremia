import { useCallback, useMemo, useState } from 'react'
import type { PoolSubgroup, HydratedSet, Track } from '../types'
import { exportSetM3u8 } from '../api/http'
import { SetPoolTable } from './SetPoolTable'
import { SetTracklist } from './SetTracklist'
import { SetExplorerCanvas } from './SetExplorerCanvas'

type SubTab = 'tracks' | 'explorer'

interface Props {
  allTracks: Track[]
  activeSet: HydratedSet | null
  loading: boolean
  error: string | null
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
  clearError: () => void
}

export function SetBuilder({
  allTracks,
  activeSet,
  loading,
  error,
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
  clearError,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('tracks')
  const [poolExpanded, setPoolExpanded] = useState(false)

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

  return (
    <div className="set-builder">
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

      {activeSet && (
        <>
          <div className="set-sub-tabs">
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
