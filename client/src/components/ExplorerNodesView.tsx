import { useMemo, memo } from 'react';
import type { ExplorerNode, ExplorerTree } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { PlayButton } from './PlayButton';

interface Props {
  nodes: ExplorerNode[];
  trees?: ExplorerTree[];
  activeTreeId?: number | null;
  onSelectTree?: (treeId: number) => void;
  tracklistTrackIds: Set<number>;
  onNodeToTracklist: (nodeId: string) => void;
}

export const ExplorerNodesView = memo(function ExplorerNodesView({
  nodes, trees, activeTreeId, onSelectTree, tracklistTrackIds, onNodeToTracklist,
}: Props) {
  const filteredNodes = useMemo(() => {
    const target = activeTreeId != null
      ? nodes.filter(n => n.tree_id === activeTreeId)
      : nodes;
    return [...target].sort((a, b) => a.level !== b.level ? a.level - b.level : a.col_index - b.col_index);
  }, [nodes, activeTreeId]);

  const maxRow = filteredNodes.length > 0
    ? Math.max(...filteredNodes.map(n => n.level))
    : -1;

  return (
    <div className="explorer-nodes-view" data-testid="explorer-nodes-view">
      {trees && trees.length > 1 && (
        <div className="explorer-nodes-tree-tabs" role="tablist" aria-label="Explorer trees">
          {trees.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === activeTreeId}
              className={`pool-tab${t.id === activeTreeId ? ' pool-tab--active' : ''}`}
              onClick={() => onSelectTree?.(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="set-table-scroll-shell">
        {filteredNodes.length === 0 ? (
          <p className="set-empty-tracks">No explorer nodes yet.</p>
        ) : (
          <table className="set-tracklist-table explorer-nodes-table" data-testid="explorer-nodes-table">
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 52 }} />
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 56 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="set-ws-th" />
                <th className="set-ws-th">Row</th>
                <th className="set-ws-th">Position</th>
                <th className="set-ws-th">Title</th>
                <th className="set-ws-th">Key</th>
                <th className="set-ws-th">BPM</th>
                <th className="set-ws-th set-ws-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map(node => {
                const title = cleanTitle(node.track, node.track_id);
                const inTracklist = tracklistTrackIds.has(node.track_id);
                return (
                  <tr key={node.node_id} data-testid="explorer-node-row">
                    <td className="play-cell">
                      <PlayButton trackId={node.track_id} title={title} />
                    </td>
                    <td className="mono set-ws-cell-num">{node.level + 1}</td>
                    <td className="mono set-ws-cell-num">{node.col_index + 1}</td>
                    <td className="set-ws-cell-title">{title}</td>
                    <td className="mono set-ws-cell-key">{node.track?.camelot_code ?? '—'}</td>
                    <td className="mono set-ws-cell-bpm">{node.track?.bpm != null ? Math.round(node.track.bpm) : '—'}</td>
                    <td className="set-ws-cell-actions">
                      <div className="set-ws-actions-group">
                        {!inTracklist && (
                          <button
                            className="set-action-btn"
                            onClick={() => onNodeToTracklist(node.node_id)}
                            title="Add to Tracklist"
                          >→TL</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
