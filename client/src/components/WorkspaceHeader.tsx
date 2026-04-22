import { useState, useCallback, useRef, useEffect, memo } from 'react';
import type { SetSummary } from '../types';

interface Props {
  sets: SetSummary[];
  activeSetId: number | null;
  loading: boolean;
  createSet: (name: string) => Promise<SetSummary | null>;
  selectSet: (id: number) => void;
  deleteSet: (id: number) => void;
  showWeights: boolean;
  onToggleWeights: () => void;
  showAdmin: boolean;
  onToggleAdmin: () => void;
  onSearchOpen?: () => void;
}

export const WorkspaceHeader = memo(function WorkspaceHeader({
  sets, activeSetId, loading, createSet, selectSet, deleteSet,
  showWeights, onToggleWeights, showAdmin, onToggleAdmin, onSearchOpen,
}: Props) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewInput && inputRef.current) inputRef.current.focus();
  }, [showNewInput]);

  const handleCreate = useCallback(async () => {
    const name = newSetName.trim();
    if (!name) return;
    await createSet(name);
    setNewSetName('');
    setShowNewInput(false);
  }, [newSetName, createSet]);

  const handleCancel = useCallback(() => {
    setShowNewInput(false);
    setNewSetName('');
  }, []);

  const activeSetName = sets.find(s => s.id === activeSetId)?.name;

  return (
    <header className="workspace-header" data-testid="workspace-header">
      <div className="workspace-header__set-controls">
        {sets.length > 0 && (
          <select
            className="set-select workspace-header__select"
            value={activeSetId ?? ''}
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) selectSet(val);
            }}
            data-testid="header-set-select"
          >
            <option value="" disabled>Select a set…</option>
            {sets.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} (P:{s.pool_count} T:{s.tracklist_count})
              </option>
            ))}
          </select>
        )}
        {activeSetId && activeSetName && (
          <span className="workspace-header__set-title" data-testid="header-set-title">
            {activeSetName}
          </span>
        )}
        {!showNewInput ? (
          <button
            className="set-create-btn workspace-header__new-btn"
            onClick={() => setShowNewInput(true)}
            data-testid="header-new-set"
          >
            + New Set
          </button>
        ) : (
          <span className="workspace-header__new-inline">
            <input
              ref={inputRef}
              className="set-name-input"
              placeholder="Set name…"
              value={newSetName}
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') handleCancel();
              }}
            />
            <button className="set-create-confirm" onClick={handleCreate}>Create</button>
            <button className="set-action-btn" onClick={handleCancel}>Cancel</button>
          </span>
        )}
        {activeSetId != null && (
          <button
            className="set-delete-btn"
            onClick={() => deleteSet(activeSetId)}
            title="Delete set"
          >×</button>
        )}
      </div>

      <div className="workspace-header__spacer" />

      <div className="workspace-header__actions">
        <button
          className="workspace-header__search-trigger"
          onClick={onSearchOpen}
          title="Search (Cmd+K)"
          data-testid="header-search-trigger"
        >
          🔍 Search
        </button>
        <button
          className={`search-weights-btn${showWeights ? ' search-weights-btn--active' : ''}`}
          onClick={onToggleWeights}
          title="Weights"
          aria-label="Toggle weights"
        >⚖</button>
        <button
          className={`dock-admin-btn${showAdmin ? ' dock-admin-btn--active' : ''}`}
          onClick={onToggleAdmin}
          title="Admin Dashboard"
          aria-label="Admin Dashboard"
        >⚙</button>
      </div>

      {loading && <span className="workspace-header__loading">Loading…</span>}
    </header>
  );
});
