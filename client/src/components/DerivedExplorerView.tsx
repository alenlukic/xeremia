import { useState, useMemo, useCallback, memo } from 'react';
import type { DerivedExplorerNode, Track } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { PlayButton } from './PlayButton';

interface Props {
  nodes: DerivedExplorerNode[];
  trackMap: Map<number, Track>;
  versionId: number;
  onSelectCandidate: (slotId: number, candidateId: number) => void;
  onRemoveCandidate: (slotId: number, candidateId: number) => void;
  onRemoveSlot: (versionId: number, slotId: number) => void;
}

export const DerivedExplorerView = memo(function DerivedExplorerView({
  nodes, trackMap, versionId, onSelectCandidate, onRemoveCandidate, onRemoveSlot,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState<{ slotId: number; candidateId: number } | null>(null);

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) =>
      a.level !== b.level ? a.level - b.level : a.col_index - b.col_index,
    );
  }, [nodes]);

  const candidateCountBySlot = useMemo(() => {
    const counts = new Map<number, number>();
    for (const n of nodes) {
      counts.set(n.slot_id, (counts.get(n.slot_id) ?? 0) + 1);
    }
    return counts;
  }, [nodes]);

  const resolveTrack = (node: DerivedExplorerNode): Track | null => {
    if (node.track) return node.track;
    return trackMap.get(node.track_id) ?? null;
  };

  const handleRemoveClick = useCallback((slotId: number, candidateId: number) => {
    const count = candidateCountBySlot.get(slotId) ?? 0;
    if (count <= 1) {
      setConfirmRemove({ slotId, candidateId });
    } else {
      onRemoveCandidate(slotId, candidateId);
    }
  }, [candidateCountBySlot, onRemoveCandidate]);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmRemove) return;
    setConfirmRemove(null);
    onRemoveSlot(versionId, confirmRemove.slotId);
  }, [confirmRemove, versionId, onRemoveSlot]);

  const handleCancelDelete = useCallback(() => {
    setConfirmRemove(null);
  }, []);

  return (
    <div className="explorer-nodes-view" data-testid="derived-explorer-view">
      <div className="set-table-scroll-shell">
        {sortedNodes.length === 0 ? (
          <p className="set-empty-tracks">No derived explorer nodes for this version.</p>
        ) : (
          <table className="set-tracklist-table explorer-nodes-table derived-explorer-table" data-testid="derived-explorer-table">
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 52 }} />
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="set-ws-th" />
                <th className="set-ws-th">Slot</th>
                <th className="set-ws-th">Pos</th>
                <th className="set-ws-th">Title</th>
                <th className="set-ws-th">Key</th>
                <th className="set-ws-th">BPM</th>
                <th className="set-ws-th set-ws-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map(node => {
                const track = resolveTrack(node);
                const title = track ? cleanTitle(track, node.track_id) : `Track ${node.track_id}`;
                return (
                  <tr
                    key={`${node.slot_id}-${node.candidate_id}`}
                    className={`derived-explorer-row${node.is_selected ? ' derived-explorer-row--selected' : ' derived-explorer-row--candidate'}`}
                    data-testid="derived-explorer-row"
                    data-selected={node.is_selected}
                  >
                    <td className="play-cell">
                      <PlayButton trackId={node.track_id} title={title} />
                    </td>
                    <td className="mono set-ws-cell-num">{node.level + 1}</td>
                    <td className="mono set-ws-cell-num">{node.col_index + 1}</td>
                    <td className="set-ws-cell-title">
                      <span className="derived-explorer-title-group">
                        <span className={node.is_selected ? 'derived-explorer-title--selected' : 'derived-explorer-title--candidate'}>
                          {title}
                        </span>
                        {node.is_selected && <span className="derived-explorer-selected-tag" data-testid="derived-selected-tag">selected</span>}
                      </span>
                    </td>
                    <td className="mono set-ws-cell-key">{track?.camelot_code ?? '—'}</td>
                    <td className="mono set-ws-cell-bpm">{track?.bpm != null ? Math.round(track.bpm) : '—'}</td>
                    <td className="set-ws-cell-actions">
                      <div className="set-ws-actions-group">
                        {!node.is_selected && (
                          <button
                            className="set-action-btn"
                            onClick={() => onSelectCandidate(node.slot_id, node.candidate_id)}
                            title="Select as active candidate"
                            data-testid={`derived-select-${node.candidate_id}`}
                          >Select</button>
                        )}
                        <button
                          className="set-action-btn set-action-btn--danger"
                          onClick={() => handleRemoveClick(node.slot_id, node.candidate_id)}
                          title="Remove candidate"
                          data-testid={`derived-remove-${node.candidate_id}`}
                        >×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {confirmRemove && (
        <div className="tracklist-confirm-overlay" onClick={handleCancelDelete} data-testid="derived-confirm-overlay">
          <div className="tracklist-confirm-modal" onClick={e => e.stopPropagation()}>
            <p>Removing the last candidate will delete this slot. Continue?</p>
            <div className="tracklist-confirm-actions">
              <button className="set-action-btn" onClick={handleCancelDelete} data-testid="derived-cancel-delete">Cancel</button>
              <button className="set-action-btn set-action-btn--danger" onClick={handleConfirmDelete} data-testid="derived-confirm-delete">Delete slot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
