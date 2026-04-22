import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, type DragMoveEvent, PointerSensor, useSensor, useSensors, MeasuringStrategy, pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { WeightControls } from './components/WeightControls';
import { AdminDashboard } from './components/AdminDashboard';
import { SetWorkspacePanel } from './components/SetWorkspacePanel';
import { ExplorerNodesView } from './components/ExplorerNodesView';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { PlayerBar } from './components/PlayerBar';
import { AudioPlayerProvider } from './hooks/useAudioPlayer';
import { useCacheStats } from './hooks/useCacheStats';
import { useWeights } from './hooks/useWeights';
import { useSetBuilder } from './hooks/useSetBuilder';
import { exportSetM3u8 } from './api/http';
import type { DragPayload } from './dnd';
import { DragFillContext } from './dnd';

const SNAP_MODIFIERS = [snapCenterToCursor];

const isEmptyRowId = (id: string) =>
  id.includes('drop-tracklist-empty-') || id.includes('drop-pool-empty-');

// dnd-kit's internal collisionRect / pointerCoordinates can lag behind
// fast pointer movements (the PointerSensor resets delta to zero at
// activation). Track the real pointer position at the document level
// so the collision fallback always has up-to-date coordinates.
let _lastPointerX = 0;
let _lastPointerY = 0;
if (typeof document !== 'undefined') {
  const _trackPointer = (e: PointerEvent) => {
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;
  };
  document.addEventListener('pointermove', _trackPointer, true);
  document.addEventListener('pointerup', _trackPointer, true);
}

export const dndCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const rect = rectIntersection(args);

  const activeEmptyId = (args.active.data.current as Record<string, unknown> | undefined)?.__emptyId as string | undefined;
  const isSelfDrop = (id: string) => {
    if (!activeEmptyId) return false;
    return id.endsWith('-' + activeEmptyId);
  };

  if (pointer.length > 0) {
    const hasCell = pointer.some(c => String(c.id).startsWith('drop-explorer-cell-'));
    if (hasCell) {
      const filtered = pointer.filter(c => String(c.id).startsWith('drop-explorer-cell-'));
      if (filtered.length > 0) return filtered;
    }
  }

  const pointerEmpty = pointer.filter(c => isEmptyRowId(String(c.id)) && !isSelfDrop(String(c.id)));
  if (pointerEmpty.length > 0) return pointerEmpty;
  const rectEmpty = rect.filter(c => isEmptyRowId(String(c.id)) && !isSelfDrop(String(c.id)));
  if (rectEmpty.length > 0) return rectEmpty;

  {
    const x = _lastPointerX;
    const y = _lastPointerY;
    const containers = Array.isArray(args.droppableContainers)
      ? args.droppableContainers
      : [...(args.droppableContainers as Iterable<unknown>)].map(
          (entry) => (Array.isArray(entry) ? entry[1] : entry) as { id: unknown; disabled: boolean; node: { current: HTMLElement | null }; data: { current?: Record<string, unknown> } },
        );
    for (const container of containers) {
      if (container.disabled) continue;
      const cid = String(container.id);
      if (!isEmptyRowId(cid) || isSelfDrop(cid)) continue;
      const node = container.node.current;
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return [{ id: container.id as string, data: { droppableContainer: container, value: 0 } }];
      }
    }
  }

  if (pointer.length > 0) {
    const activeData = args.active.data.current as DragPayload | undefined;
    if (activeData?.source === 'tracklist') {
      const isRowId = (id: string) =>
        id.startsWith('drop-tracklist-row-') || /^alt-drop-tracklist-row-/.test(id);
      const rows = pointer.filter(c => isRowId(String(c.id)));
      if (rows.length > 0) return rows;
      const rectRows = rect.filter(c => isRowId(String(c.id)));
      if (rectRows.length > 0) return rectRows;
      const filtered = pointer.filter(c => {
        const id = String(c.id);
        return id !== 'drop-tracklist' && id !== 'alt-drop-tracklist' && !isSelfDrop(id);
      });
      if (filtered.length > 0) return filtered;
    }
    const nonSelf = pointer.filter(c => !isSelfDrop(String(c.id)));
    return nonSelf.length > 0 ? nonSelf : pointer;
  }
  const nonSelfRect = rect.filter(c => !isSelfDrop(String(c.id)));
  return nonSelfRect.length > 0 ? nonSelfRect : rect;
};

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [explorerView, setExplorerView] = useState(false);
  const [dragItem, setDragItem] = useState<DragPayload | null>(null);
  const [dndWarning, setDndWarning] = useState<string | null>(null);
  const dragFillNotification = null;

  const weightsChangedRef = useRef(false);

  const {
    stats: cacheStats,
    loading: cacheLoading,
    error: cacheError,
  } = useCacheStats(showAdmin);

  const refetchMatchesNoop = useCallback(() => {}, []);

  const {
    weights,
    loading: weightsLoading,
    error: weightsError,
    saving: weightsSaving,
    saveSuccess: weightsSaveSuccess,
    setWeight: rawSetWeight,
    rawSum,
    isSumValid,
    warningMessage: weightsWarning,
    normalizeWeights,
    resetWeights,
  } = useWeights(refetchMatchesNoop);

  const setWeight = useCallback((factor: string, value: number) => {
    weightsChangedRef.current = true;
    rawSetWeight(factor, value);
  }, [rawSetWeight]);

  const handleCloseWeights = useCallback(() => {
    setShowWeights(false);
    weightsChangedRef.current = false;
  }, []);

  useEffect(() => {
    if (!showWeights) return;
    weightsChangedRef.current = false;
  }, [showWeights]);

  useEffect(() => {
    if (!showWeights && !showAdmin) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showWeights) handleCloseWeights();
        else if (showAdmin) setShowAdmin(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showWeights, showAdmin, handleCloseWeights]);

  const {
    sets,
    activeSetId: sbActiveSetId,
    activeSet,
    loading: sbLoading,
    error: sbError,
    createSet,
    selectSet,
    deleteSet,
    addToPool: sbAddToPool,
    addToTracklist: sbAddToTracklist,
    removeFromPool,
    clearPool,
    removeFromTracklist,
    clearTracklist,
    movePoolToTracklist,
    moveTracklistToPool,
    reorderPool,
    reorderTracklist,
    addToTracklistAtPosition,
    updateTracklistNote,
    explorerNodeAddToTracklist,
    isPoolAddInFlight,
    clearError,
    activeTreeId,
    selectTree,
    createSubgroup,
    renameSubgroup,
    deleteSubgroup,
    reorderSubgroups,
    addSubgroupMember,
    removeSubgroupMember,
    addEmptyRows,
    deleteEmptyRow,
    reorderEmptyRow,
  } = useSetBuilder();

  const tracklistTrackIds = useMemo(() => {
    if (!activeSet) return new Set<number>();
    return new Set(activeSet.tracklist.map(e => e.track_id));
  }, [activeSet]);

  const handleExport = useCallback(async () => {
    if (!activeSet || activeSet.tracklist.length === 0) return;
    try {
      const ids = activeSet.tracklist.map(e => e.track_id);
      const result = await exportSetM3u8(ids, activeSet.set.name);
      const blob = new Blob([result.content], { type: 'audio/x-mpegurl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* export failure is non-critical */ }
  }, [activeSet]);

  const addToPoolFn = sbAddToPool;
  const addToTracklistFn = sbAddToTracklist;

  const setBuilderRef = useRef({
    activeSet, isPoolAddInFlight, activeTreeId,
  });
  setBuilderRef.current = {
    activeSet, isPoolAddInFlight, activeTreeId,
  };

  // --- DnD ---
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const measuringConfig = useMemo(() => ({
    droppable: {
      strategy: MeasuringStrategy.WhileDragging,
      frequency: 100,
    },
  }), []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragPayload | undefined;
    if (data) setDragItem(data);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (event.activatorEvent && 'clientY' in event.activatorEvent) {
      const baseY = (event.activatorEvent as PointerEvent).clientY;
      _lastPointerY = baseY + (event.delta?.y ?? 0);
      _lastPointerX = (event.activatorEvent as PointerEvent).clientX + (event.delta?.x ?? 0);
    }
  }, []);

  const handleDragCancel = useCallback(() => {
    setDragItem(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDragItem(null);
    const { active, over: dndOver } = event;
    const payload = active.data.current as DragPayload | undefined;
    if (!payload) return;

    let over = dndOver;
    const CONTAINER_IDS = ['drop-tracklist', 'drop-pool'];
    if (
      payload.trackId > 0 &&
      (!over || CONTAINER_IDS.includes(String(over.id)))
    ) {
      const el = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(_lastPointerX, _lastPointerY)
        : null;
      const emptyTr = el?.closest?.('tr[data-empty-id]');
      if (emptyTr) {
        const domEmptyId = emptyTr.getAttribute('data-empty-id')!;
        const inTracklist = emptyTr.closest('.set-tracklist-table') != null;
        const prefix = inTracklist ? 'drop-tracklist-empty-' : 'drop-pool-empty-';
        const droppableId = prefix + domEmptyId;
        const realPosAttr = emptyTr.getAttribute('data-real-position');
        const realPosition = realPosAttr != null && !isNaN(Number(realPosAttr))
          ? parseInt(realPosAttr, 10)
          : undefined;
        over = {
          id: droppableId,
          rect: emptyTr.getBoundingClientRect(),
          data: { current: { __emptyId: domEmptyId, realPosition } },
          disabled: false,
        } as typeof dndOver;
      }
    }

    if (!over) return;
    let targetId = String(over.id);
    if (targetId.startsWith('alt-')) targetId = targetId.slice(4);
    const sb = setBuilderRef.current;
    const trackIds = payload.selectedTrackIds && payload.selectedTrackIds.length > 1
      ? payload.selectedTrackIds
      : [payload.trackId];

    if (targetId.startsWith('drop-tracklist-empty-') || targetId.startsWith('drop-pool-empty-')) {
      if (!sb.activeSet) return;
      const isTracklist = targetId.startsWith('drop-tracklist-empty-');
      const overData = over.data?.current as { __emptyId?: string; __persistedId?: number; realPosition?: number } | undefined;
      const overPersistedId = overData?.__persistedId;
      const realPosition = overData?.realPosition;
      const validTrackIds = trackIds.filter(id => id > 0);

      const dragData = active.data.current as DragPayload & { __persistedId?: number } | undefined;
      const dragPersistedId = dragData?.__persistedId;

      if (validTrackIds.length === 0 && dragPersistedId != null && overPersistedId != null) {
        if (dragPersistedId === overPersistedId) return;
        if (realPosition != null) {
          reorderEmptyRow(dragPersistedId, realPosition);
        }
        return;
      }

      if (validTrackIds.length === 0) return;

      const surfaceEmptyRows = (sb.activeSet as unknown as Record<string, unknown>).empty_rows as Array<{ id: number; set_id: number; surface: string; position: number }> | undefined;
      const sameRows = surfaceEmptyRows?.filter(
        r => r.surface === (isTracklist ? 'tracklist' : 'pool'),
      ) ?? [];
      const targetRow = overPersistedId != null
        ? sameRows.find(r => r.id === overPersistedId)
        : undefined;
      const adjacentRow = targetRow != null
        ? sameRows.find(r => r.id !== targetRow.id && Math.abs(r.position - targetRow.position) === 1)
        : undefined;
      const hasAdjacentEmpty = adjacentRow != null;
      const shouldFill = !hasAdjacentEmpty;

      for (const tid of validTrackIds) {
        if (isTracklist) {
          if (hasAdjacentEmpty && targetRow && adjacentRow) {
            const insertDisplayPos = Math.min(targetRow.position, adjacentRow.position) + 1;
            const emptysBefore = sameRows.filter(r => r.position < insertDisplayPos).length;
            const tracklistPos = insertDisplayPos - emptysBefore;
            const lowerRow = adjacentRow.position > targetRow.position ? adjacentRow : targetRow;
            reorderEmptyRow(lowerRow.id, lowerRow.position + 1);
            if (payload.source === 'tracklist') {
              reorderTracklist(tid, tracklistPos);
            } else {
              addToTracklistAtPosition(tid, tracklistPos, payload.title);
            }
          } else if (payload.source === 'tracklist' && realPosition != null) {
            reorderTracklist(tid, realPosition);
          } else if (realPosition != null) {
            addToTracklistAtPosition(tid, realPosition, payload.title);
          } else {
            addToTracklistFn(tid, payload.title);
          }
        } else {
          addToPoolFn(tid, payload.title);
        }
      }
      if (overPersistedId != null && shouldFill) {
        deleteEmptyRow(overPersistedId);
      }
      return;
    }

    if (payload.source === 'tracklist' && targetId.startsWith('drop-tracklist-row-')) {
      const dragData = active.data.current as DragPayload & { __persistedId?: number } | undefined;
      const dragPersistedId = dragData?.__persistedId;
      if (payload.trackId <= 0 && dragPersistedId != null) {
        const displayIndex = parseInt(targetId.replace('drop-tracklist-row-', ''), 10);
        if (!isNaN(displayIndex)) {
          reorderEmptyRow(dragPersistedId, displayIndex);
        }
        return;
      }

      const overRowData = over.data?.current as { trackId?: number } | undefined;
      const targetTrackId = overRowData?.trackId;
      if (targetTrackId != null && sb.activeSet) {
        const sourceEntry = sb.activeSet.tracklist.find(e => e.track_id === payload.trackId);
        const targetEntry = sb.activeSet.tracklist.find(e => e.track_id === targetTrackId);
        if (sourceEntry && targetEntry && sourceEntry.position !== targetEntry.position) {
          reorderTracklist(payload.trackId, targetEntry.position);
        }
      }
      return;
    }

    if (payload.source === 'tracklist' && targetId === 'drop-tracklist') return;

    if (payload.source === 'pool' && targetId.startsWith('drop-pool-row-')) {
      const overData = event.over?.data?.current as { entryRank?: number } | undefined;
      const targetRank = overData?.entryRank;
      if (targetRank != null && sb.activeSet) {
        const sourceRank = sb.activeSet.pool.findIndex(e => e.track_id === payload.trackId);
        if (sourceRank !== -1 && sourceRank !== targetRank) {
          reorderPool(payload.trackId, targetRank);
        }
      }
      return;
    }

    if (payload.source === 'pool' && targetId === 'drop-pool') return;

    if (targetId === 'drop-tracklist') {
      if (!sb.activeSet) {
        setDndWarning('Select or create a set first');
        setTimeout(() => setDndWarning(null), 2000);
        return;
      }
      for (const tid of trackIds) {
        addToTracklistFn(tid, payload.title);
      }
    } else if (targetId === 'drop-pool') {
      if (!sb.activeSet) {
        setDndWarning('Select or create a set first');
        setTimeout(() => setDndWarning(null), 2000);
        return;
      }
      const poolSet = new Set(sb.activeSet.pool.map(e => e.track_id));
      let anySkipped = false;
      for (const tid of trackIds) {
        if (poolSet.has(tid) || sb.isPoolAddInFlight(tid)) {
          anySkipped = true;
          continue;
        }
        addToPoolFn(tid, payload.title);
      }
      if (anySkipped && trackIds.length === 1) {
        setDndWarning('Track already in pool');
        setTimeout(() => setDndWarning(null), 2000);
      }
    }
  }, [addToTracklistFn, addToPoolFn, addToTracklistAtPosition, reorderTracklist, reorderPool, reorderEmptyRow, deleteEmptyRow]);

  return (
    <AudioPlayerProvider>
    <DragFillContext.Provider value={dragFillNotification}>
    <DndContext sensors={sensors} collisionDetection={dndCollisionDetection} measuring={measuringConfig} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="app-shell-v2">
        {/* ─── Workspace Header (48px) ─── */}
        <WorkspaceHeader
          sets={sets}
          activeSetId={sbActiveSetId}
          loading={sbLoading}
          createSet={createSet}
          selectSet={selectSet}
          deleteSet={deleteSet}
          showWeights={showWeights}
          onToggleWeights={() => setShowWeights(prev => !prev)}
          showAdmin={showAdmin}
          onToggleAdmin={() => setShowAdmin(prev => !prev)}
        />

        {sbError && (
          <div className="set-toast" role="alert">
            <span>{sbError}</span>
            <button className="set-toast-dismiss" onClick={clearError} aria-label="Dismiss">×</button>
          </div>
        )}

        {/* ─── Main workspace: tracklist zone + pool zone ─── */}
        {activeSet ? (
          <div className="workspace-body" data-testid="workspace-body">
            <div className="tracklist-zone-outer" data-testid="tracklist-zone-outer">
              <div className="tracklist-zone-header" data-testid="tracklist-zone-header">
                <h3 className="set-section-title">
                  {explorerView ? 'Explorer' : 'Tracklist'} ({explorerView ? (activeTreeId != null ? activeSet.explorer_nodes.filter(n => n.tree_id === activeTreeId).length : activeSet.explorer_nodes.length) : activeSet.tracklist.length})
                </h3>
                <button
                  className={`set-action-btn tracklist-zone-toggle${explorerView ? ' tracklist-zone-toggle--active' : ''}`}
                  onClick={() => setExplorerView(prev => !prev)}
                  title={explorerView ? 'Back to Tracklist' : 'Explorer view'}
                  data-testid="explorer-toggle"
                >
                  {explorerView ? '← Tracklist' : 'Explorer ↗'}
                </button>
                {!explorerView && activeSet.tracklist.length > 0 && (
                  <button className="set-action-btn" onClick={handleExport} data-testid="tracklist-export">
                    Export m3u8
                  </button>
                )}
                <button
                  className="set-action-btn columns-btn"
                  disabled
                  title="Column configuration (Phase B)"
                  aria-label="Configure columns"
                  data-testid="tracklist-columns-btn"
                >
                  Columns
                </button>
              </div>
              <div className="tracklist-zone-content">
                {explorerView ? (
                  <ExplorerNodesView
                    nodes={activeSet.explorer_nodes}
                    trees={activeSet.explorer_trees}
                    activeTreeId={activeTreeId}
                    onSelectTree={selectTree}
                    tracklistTrackIds={tracklistTrackIds}
                    onNodeToTracklist={explorerNodeAddToTracklist}
                  />
                ) : (
                  <SetWorkspacePanel
                    activeSet={activeSet}
                    removeFromPool={removeFromPool}
                    clearPool={clearPool}
                    movePoolToTracklist={movePoolToTracklist}
                    reorderPool={reorderPool}
                    addToPool={sbAddToPool}
                    removeFromTracklist={removeFromTracklist}
                    clearTracklist={clearTracklist}
                    moveTracklistToPool={moveTracklistToPool}
                    reorderTracklist={reorderTracklist}
                    addToTracklistAtPosition={addToTracklistAtPosition}
                    updateTracklistNote={updateTracklistNote}
                    addToTracklist={sbAddToTracklist}
                    createSubgroup={createSubgroup}
                    renameSubgroup={renameSubgroup}
                    deleteSubgroup={deleteSubgroup}
                    reorderSubgroups={reorderSubgroups}
                    addSubgroupMember={addSubgroupMember}
                    removeSubgroupMember={removeSubgroupMember}
                    addEmptyRows={addEmptyRows}
                    deleteEmptyRow={deleteEmptyRow}
                    reorderEmptyRow={reorderEmptyRow}
                    poolExpanded={true}
                    onPoolExpandedChange={() => {}}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="workspace-empty" data-testid="workspace-empty">
            <p className="text-muted" style={{ textAlign: 'center', padding: '48px 0' }}>
              {sets.length > 0 ? 'Select a set to start building.' : 'Create a set to get started.'}
            </p>
          </div>
        )}

        {/* ─── Weights overlay ─── */}
        {showWeights && (
          <>
            <div className="overlay-scrim" onClick={handleCloseWeights} />
            <div className="weights-overlay">
              <div className="weights-overlay__header">
                <span className="weights-overlay__title">Match Weights</span>
                <button className="clear-btn" onClick={handleCloseWeights} title="Close weights">×</button>
              </div>
              {!weightsLoading && Object.keys(weights).length > 0 && (
                <WeightControls
                  weights={weights}
                  setWeight={setWeight}
                  saving={weightsSaving}
                  saveSuccess={weightsSaveSuccess}
                  saveError={weightsError}
                  warningMessage={weightsWarning}
                />
              )}
              <div className="weights-overlay__actions">
                <button className="weight-normalize-btn weight-normalize-btn--secondary" onClick={resetWeights}>Reset Weights</button>
                <button className={`weight-normalize-btn${isSumValid ? ' inactive' : ''}`} disabled={isSumValid} onClick={normalizeWeights}>
                  {`Normalize (Σ ${parseFloat(rawSum.toFixed(1))})`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── Admin modal ─── */}
        {showAdmin && (
          <>
            <div className="overlay-scrim" onClick={() => setShowAdmin(false)} />
            <div className="admin-modal">
              <div className="admin-modal__header">
                <span className="admin-modal__title">Admin Dashboard</span>
                <button className="clear-btn" onClick={() => setShowAdmin(false)} title="Close admin">×</button>
              </div>
              <AdminDashboard stats={cacheStats} loading={cacheLoading} error={cacheError} />
            </div>
          </>
        )}

        {dndWarning && (
          <div className="dnd-warning-toast" role="status" data-testid="dnd-warning-toast">{dndWarning}</div>
        )}

        <PlayerBar />
      </div>

      <DragOverlay dropAnimation={null} adjustScale={false} modifiers={SNAP_MODIFIERS}>
        {dragItem && (
          <div className="dnd-drag-preview">
            {dragItem.title}
            {dragItem.selectedTrackIds && dragItem.selectedTrackIds.length > 1 && (
              <span className="dnd-drag-preview__count"> +{dragItem.selectedTrackIds.length - 1}</span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </DragFillContext.Provider>
    </AudioPlayerProvider>
  );
}
