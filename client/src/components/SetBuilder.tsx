import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PoolSubgroup, HydratedSet, Track } from '../types'
import type { NormalizedTableConfig } from '../tablePreferences'
import { exportSetM3u8 } from '../api/http'
import { QuadrantDivider, QuadrantExpandBar } from './QuadrantControls'
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
  /** Set selection/creation controls, hosted in the tracklist header. */
  setPicker?: ReactNode
  tracklistConfig: NormalizedTableConfig
  poolConfig: NormalizedTableConfig
  onTracklistToggleColumn: (columnId: string) => void
  onTracklistReorderColumn: (draggedId: string, targetId: string) => void
  onTracklistInsertColumnAfter: (
    afterColumnId: string,
    columnId: string,
  ) => void
  onTracklistColumnWidthChange: (columnId: string, width: number) => void
  onTracklistColumnWidthFlush: (columnId: string, width: number) => void
  onPoolToggleColumn: (columnId: string) => void
  onPoolReorderColumn: (draggedId: string, targetId: string) => void
  onPoolInsertColumnAfter: (afterColumnId: string, columnId: string) => void
  onPoolColumnWidthChange: (columnId: string, width: number) => void
  onPoolColumnWidthFlush: (columnId: string, width: number) => void
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
  dropTrackToSubgroup: (
    subgroupId: number,
    trackId: number,
    source: 'browse' | 'tracklist' | 'pool',
  ) => Promise<void>
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
  setPicker,
  tracklistConfig,
  poolConfig,
  onTracklistToggleColumn,
  onTracklistReorderColumn,
  onTracklistInsertColumnAfter,
  onTracklistColumnWidthChange,
  onTracklistColumnWidthFlush,
  onPoolToggleColumn,
  onPoolReorderColumn,
  onPoolInsertColumnAfter,
  onPoolColumnWidthChange,
  onPoolColumnWidthFlush,
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
  dropTrackToSubgroup,
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

  const openExplorer = useCallback(() => setSubTab('explorer'), [])
  const closeExplorer = useCallback(() => setSubTab('tracks'), [])

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

      {!activeSet && !loading && (
        <div className="set-empty-state">
          <p className="set-empty-tracks">
            No active set — create or select one to start building.
          </p>
          {setPicker}
        </div>
      )}

      {activeSet && subTab === 'tracks' && (
        <div className="set-workspace-split">
          {split === 'tracklist-collapsed' ? (
            <QuadrantExpandBar
              edge="left"
              label={`Tracklist (${activeSet.tracklist.length})`}
              ariaLabel="Expand tracklist"
              onExpand={() => setSplit('both')}
            />
          ) : (
            <SetTracklist
              allTracks={allTracks}
              tracklist={activeSet.tracklist}
              headerControls={setPicker}
              tableConfig={tracklistConfig}
              onToggleColumn={onTracklistToggleColumn}
              onReorderColumn={onTracklistReorderColumn}
              onInsertColumnAfter={onTracklistInsertColumnAfter}
              onColumnWidthChange={onTracklistColumnWidthChange}
              onColumnWidthFlush={onTracklistColumnWidthFlush}
              onOpenExplorer={openExplorer}
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
            <QuadrantDivider
              orientation="vertical"
              beforeLabel="Collapse tracklist"
              afterLabel="Collapse pool"
              onCollapseBefore={() => setSplit('tracklist-collapsed')}
              onCollapseAfter={() => setSplit('pool-collapsed')}
            />
          )}
          {split === 'pool-collapsed' ? (
            <QuadrantExpandBar
              edge="right"
              label={`Pool (${activeSet.pool.length})`}
              ariaLabel="Expand pool"
              onExpand={() => setSplit('both')}
            />
          ) : (
            <div
              className={`set-pool-pane${split === 'tracklist-collapsed' ? ' set-pool-pane--full' : ''}`}
            >
              <SetPoolTable
                allTracks={allTracks}
                pool={activeSet.pool}
                subgroups={activeSet.pool_subgroups ?? []}
                subgroupMemberships={activeSet.pool_subgroup_memberships ?? []}
                tableConfig={poolConfig}
                onToggleColumn={onPoolToggleColumn}
                onReorderColumn={onPoolReorderColumn}
                onInsertColumnAfter={onPoolInsertColumnAfter}
                onColumnWidthChange={onPoolColumnWidthChange}
                onColumnWidthFlush={onPoolColumnWidthFlush}
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
                onDropTrackToSubgroup={dropTrackToSubgroup}
                onDropFromTracklist={moveTracklistToPool}
              />
            </div>
          )}
        </div>
      )}

      {activeSet && subTab === 'explorer' && (
        <SetExplorerCanvas
          allTracks={allTracks}
          nodes={activeSet.explorer_nodes}
          edges={activeSet.explorer_edges}
          onBack={closeExplorer}
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
    </div>
  )
}
