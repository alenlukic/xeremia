import { useState, useCallback, useRef, useEffect, memo } from 'react';
import type { SetTracklistVersion } from '../types';

interface Props {
  versions: SetTracklistVersion[];
  activeVersionId: number | null;
  onSwitch: (versionId: number) => void;
  onCreate: (name: string) => void;
  onRename: (versionId: number, name: string) => void;
  onDelete: (versionId: number) => void;
}

export const VersionTabs = memo(function VersionTabs({
  versions, activeVersionId, onSwitch, onCreate, onRename, onDelete,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState('');
  const createRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCreate && createRef.current) createRef.current.focus();
  }, [showCreate]);

  useEffect(() => {
    if (renamingId !== null && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  const handleCreate = useCallback(() => {
    const name = createName.trim();
    if (!name) return;
    onCreate(name);
    setCreateName('');
    setShowCreate(false);
  }, [createName, onCreate]);

  const handleCancelCreate = useCallback(() => {
    setShowCreate(false);
    setCreateName('');
  }, []);

  const startRename = useCallback((v: SetTracklistVersion) => {
    setRenamingId(v.id);
    setRenameName(v.name);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId === null) return;
    const name = renameName.trim();
    if (name && name !== versions.find(v => v.id === renamingId)?.name) {
      onRename(renamingId, name);
    }
    setRenamingId(null);
    setRenameName('');
  }, [renamingId, renameName, versions, onRename]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameName('');
  }, []);

  const handleDelete = useCallback((versionId: number) => {
    if (versions.length <= 1) return;
    onDelete(versionId);
  }, [versions, onDelete]);

  const sorted = [...versions].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="version-tabs" data-testid="version-tabs" ref={scrollRef}>
      <div className="version-tabs__scroll">
        {sorted.map(v => (
          <div key={v.id} className="version-tab-wrapper" data-testid={`version-tab-${v.id}`}>
            {renamingId === v.id ? (
              <span className="version-tab-rename-inline">
                <input
                  ref={renameRef}
                  className="version-tab-rename-input"
                  value={renameName}
                  onChange={e => setRenameName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  onBlur={commitRename}
                />
              </span>
            ) : (
              <button
                className={`version-tab${v.id === activeVersionId ? ' version-tab--active' : ''}`}
                onClick={() => onSwitch(v.id)}
                onDoubleClick={() => startRename(v)}
                title={v.name}
                data-testid={`version-tab-btn-${v.id}`}
              >
                {v.name}
              </button>
            )}
            <div className="version-tab-controls">
              <button
                className="version-tab-action"
                onClick={() => startRename(v)}
                title="Rename version"
                data-testid={`version-rename-${v.id}`}
              >✎</button>
              <button
                className="version-tab-action version-tab-action--danger"
                onClick={() => handleDelete(v.id)}
                disabled={versions.length <= 1}
                title={versions.length <= 1 ? 'Cannot delete the last version' : 'Delete version'}
                data-testid={`version-delete-${v.id}`}
              >×</button>
            </div>
          </div>
        ))}
        {showCreate ? (
          <span className="version-tab-create-inline">
            <input
              ref={createRef}
              className="version-tab-create-input"
              placeholder="Version name…"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') handleCancelCreate();
              }}
            />
            <button className="version-tab-action" onClick={handleCreate} title="Create">✓</button>
            <button className="version-tab-action" onClick={handleCancelCreate} title="Cancel">×</button>
          </span>
        ) : (
          <button
            className="version-tab version-tab--add"
            onClick={() => setShowCreate(true)}
            title="New version"
            data-testid="version-tab-add"
          >+</button>
        )}
      </div>
    </div>
  );
});
