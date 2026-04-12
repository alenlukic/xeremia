import { useState, useEffect, useCallback, useRef, memo } from 'react';
import type { SetSummary, HydratedSet } from '../types';
import type { PendingAdd } from '../hooks/useSetBuilder';
import { exportSetM3u8 } from '../api/http';
import { SetPoolTable } from './SetPoolTable';
import { SetTracklist } from './SetTracklist';

interface Props {
  sets: SetSummary[];
  activeSetId: number | null;
  activeSet: HydratedSet | null;
  loading: boolean;
  error: string | null;
  pendingAdd: PendingAdd | null;
  createSet: (name: string) => Promise<SetSummary | null>;
  selectSet: (id: number) => void;
  deleteSet: (id: number) => void;
  removeFromPool: (trackId: number) => void;
  clearPool: () => void;
  movePoolToTracklist: (trackId: number) => void;
  addToPool: (trackId: number, title?: string) => void;
  removeFromTracklist: (trackId: number) => void;
  clearTracklist: () => void;
  moveTracklistToPool: (trackId: number) => void;
  reorderTracklist: (trackId: number, newPosition: number) => void;
  updateTracklistNote: (trackId: number, note: string) => void;
  togglePoolStar: (trackId: number, starred: boolean) => void;
  toggleTracklistStar: (trackId: number, starred: boolean) => void;
  addToTracklist: (trackId: number, title?: string) => void;
  resolvePendingAdd: (setId: number) => void;
  clearPendingAdd: () => void;
  clearError: () => void;
  poolExpanded?: boolean;
  onPoolExpandedChange?: (expanded: boolean) => void;
}

export const SetBuilder = memo(function SetBuilder({
  sets, activeSetId, activeSet, loading, error, pendingAdd,
  createSet, selectSet, deleteSet,
  removeFromPool, clearPool, movePoolToTracklist, addToPool,
  removeFromTracklist, clearTracklist, moveTracklistToPool, reorderTracklist, updateTracklistNote,
  togglePoolStar, toggleTracklistStar, addToTracklist,
  resolvePendingAdd, clearPendingAdd, clearError,
  poolExpanded: poolExpandedProp = false,
  onPoolExpandedChange,
}: Props) {
  const [newSetName, setNewSetName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const poolExpanded = poolExpandedProp;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewInput]);

  useEffect(() => {
    if (pendingAdd && !activeSetId) {
      setShowNewInput(true);
    }
  }, [pendingAdd, activeSetId]);

  const handleCreateSet = useCallback(async () => {
    const name = newSetName.trim();
    if (!name) return;
    const result = await createSet(name);
    setNewSetName('');
    setShowNewInput(false);
    if (result && pendingAdd) {
      resolvePendingAdd(result.id);
    }
  }, [newSetName, createSet, pendingAdd, resolvePendingAdd]);

  const handleCancelCreate = useCallback(() => {
    setShowNewInput(false);
    setNewSetName('');
    clearPendingAdd();
  }, [clearPendingAdd]);

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
    } catch {
      /* export failure is non-critical */
    }
  }, [activeSet]);

  const handlePoolAddTrack = useCallback((trackId: number, title?: string) => {
    addToPool(trackId, title);
    if (!poolExpanded) onPoolExpandedChange?.(true);
  }, [addToPool, poolExpanded, onPoolExpandedChange]);

  const handleTracklistAddTrack = useCallback((trackId: number, title?: string) => {
    addToTracklist(trackId, title);
  }, [addToTracklist]);

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
    );
  }

  return (
    <div className="set-builder">
      {/* Selector row */}
      <div className="set-header">
        <div className="set-selector">
          {sets.length > 0 && (
            <select
              className="set-select"
              value={activeSetId ?? ''}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) selectSet(val);
              }}
            >
              <option value="" disabled>Select a set…</option>
              {sets.map(s => (
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
          {activeSet && activeSet.tracklist.length > 0 && (
            <button className="set-export-btn" onClick={handleExport}>
              Export m3u8
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
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateSet();
                if (e.key === 'Escape') handleCancelCreate();
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

      {error && (
        <div className="set-toast" role="alert">
          <span>{error}</span>
          <button className="set-toast-dismiss" onClick={clearError} aria-label="Dismiss">×</button>
        </div>
      )}

      {!activeSet && loading && <p className="table-status">Loading set…</p>}

      {!activeSet && !loading && sets.length > 0 && (
        <div className="set-empty">
          <p>Select a set above, or create a new one.</p>
        </div>
      )}

      {activeSet && (
        <div className="set-workspace-split">
          <SetTracklist
            tracklist={activeSet.tracklist}
            onRemove={removeFromTracklist}
            onClearAll={clearTracklist}
            onMoveToPool={moveTracklistToPool}
            onReorder={reorderTracklist}
            onUpdateNote={updateTracklistNote}
            onToggleStar={toggleTracklistStar}
            onAddTrack={handleTracklistAddTrack}
          />
          <div className={`set-pool-accordion${poolExpanded ? ' expanded' : ''}`}>
            {poolExpanded && (
              <button
                className="set-pool-collapse-handle"
                onClick={() => onPoolExpandedChange?.(false)}
                aria-label="Collapse pool"
                title="Collapse pool"
              >
                ‹
              </button>
            )}
            {!poolExpanded ? (
              <button
                className="set-pool-expand-tab"
                onClick={() => onPoolExpandedChange?.(true)}
                aria-label="Expand pool"
                title="Expand pool"
              >
                <span className="set-pool-expand-chevron" aria-hidden="true">›</span>
                <span className="set-pool-expand-label">Pool ({activeSet.pool.length})</span>
              </button>
            ) : (
              <div className="set-pool-accordion-content">
                <SetPoolTable
                  pool={activeSet.pool}
                  onRemove={removeFromPool}
                  onClearAll={clearPool}
                  onMoveToTracklist={movePoolToTracklist}
                  onToggleStar={togglePoolStar}
                  onAddTrack={handlePoolAddTrack}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
