import { useCallback, useMemo, useState } from 'react'
import type { PoolSubgroup, HydratedSet, Track } from '../types'
import { exportSetM3u8 } from '../api/http'
import { CollapseButton } from './CollapseButton'
import { HoverRail } from './HoverRail'
import { SetPoolTable } from './SetPoolTable'
import { SetTracklist } from './SetTracklist'
import { SetExplorerCanvas } from './SetExplorerCanvas'

type SubTab = 'tracks' | 'explorer'

type WorkspaceSplit = 'both' | 'pool-collapsed' | 'tracklist-collapsed'

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
  const [split, setSplit] = useState<WorkspaceSplit>('both')

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
          <HoverRail orientation="vertical" className="set-side-rail">
            <button
              className={`set-side-tab${subTab === 'tracks' ? ' active' : ''}`}
              onClick={() => setSubTab('tracks')}
            >
              Tracks
            </button>
            <button
              className={`set-side-tab${subTab === 'explorer' ? ' active' : ''}`}
              onClick={() => setSubTab('explorer')}
            >
              Explorer
            </button>
          </HoverRail>

          {subTab === 'tracks' && (
            <div className="set-workspace-split">
              {split === 'tracklist-collapsed' ? (
                <button
                  className="set-pool-expand-tab set-tracklist-expand-tab"
                  onClick={() => setSplit('both')}
                  aria-label="Expand tracklist"
                  title="Expand tracklist"
                >
                  <span className="set-pool-expand-chevron" aria-hidden="true">
                    ›
                  </span>
                  <span className="set-pool-expand-label">
                    Tracklist ({activeSet.tracklist.length})
                  </span>
                </button>
              ) : (
                <SetTracklist
                  allTracks={allTracks}
                  tracklist={activeSet.tracklist}
                  onRemove={removeFromTracklist}
                  onMoveToPool={moveTracklistToPool}
                  onReorder={reorderTracklist}
                  onUpdateNote={updateTracklistNote}
                  onAddTrack={handleTracklistAddTrack}
                  onDropFromPool={movePoolToTracklist}
                  onExportM3u8={handleExport}
                />
              )}
              {split === 'both' && (
                <CollapseButton
                  orientation="vertical"
                  size={22}
                  direction="left"
                  label="Collapse tracklist"
                  className="set-tracklist-collapse-handle"
                  onClick={() => setSplit('tracklist-collapsed')}
                />
              )}
              <div
                className={`set-pool-accordion${split !== 'pool-collapsed' ? ' expanded' : ''}${split === 'tracklist-collapsed' ? ' set-pool-accordion--full' : ''}`}
              >
                {split === 'both' && (
                  <CollapseButton
                    orientation="vertical"
                    size={22}
                    direction="right"
                    label="Collapse pool"
                    className="set-pool-collapse-handle"
                    onClick={() => setSplit('pool-collapsed')}
                  />
                )}
                {split === 'pool-collapsed' ? (
                  <button
                    className="set-pool-expand-tab"
                    onClick={() => setSplit('both')}
                    aria-label="Expand pool"
                    title="Expand pool"
                  >
                    <span
                      className="set-pool-expand-chevron"
                      aria-hidden="true"
                    >
                      ‹
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
                      onDropFromTracklist={moveTracklistToPool}
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
