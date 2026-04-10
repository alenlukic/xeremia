import { useState, useCallback } from 'react';
import type { ExplorerNode, ExplorerEdge } from '../types';

interface EdgeRewire {
  parent_node_id: string;
  child_node_id: string;
}

interface Props {
  node: ExplorerNode;
  edges: ExplorerEdge[];
  nodes: ExplorerNode[];
  onConfirm: (rewireEdges: EdgeRewire[]) => void;
  onCancel: () => void;
}

export function SetExplorerDeleteModal({ node, edges, nodes, onConfirm, onCancel }: Props) {
  const incoming = edges.filter(e => e.child_node_id === node.node_id);
  const outgoing = edges.filter(e => e.parent_node_id === node.node_id);
  const parentIds = incoming.map(e => e.parent_node_id);
  const childIds = outgoing.map(e => e.child_node_id);

  const parentNodes = nodes.filter(n => parentIds.includes(n.node_id));
  const childNodes = nodes.filter(n => childIds.includes(n.node_id));

  const defaultChoice = parentNodes.length === 1 ? parentNodes[0].node_id : undefined;

  const [childResolutions, setChildResolutions] = useState<Record<string, string | undefined>>(() => {
    const init: Record<string, string | undefined> = {};
    for (const c of childNodes) {
      init[c.node_id] = defaultChoice;
    }
    return init;
  });

  const setResolution = useCallback((childId: string, parentId: string | undefined) => {
    setChildResolutions(prev => ({ ...prev, [childId]: parentId }));
  }, []);

  const handleConfirm = useCallback(() => {
    const rewireEdges: EdgeRewire[] = [];
    for (const [childId, parentId] of Object.entries(childResolutions)) {
      if (parentId) {
        rewireEdges.push({ parent_node_id: parentId, child_node_id: childId });
      }
    }
    onConfirm(rewireEdges);
  }, [childResolutions, onConfirm]);

  const hasChildren = childNodes.length > 0;

  return (
    <div className="explorer-delete-overlay" onClick={onCancel}>
      <div className="explorer-delete-modal" onClick={e => e.stopPropagation()}>
        <h3>Delete Node</h3>
        <p>
          Remove <strong>{node.track?.title ?? `Node ${node.node_id}`}</strong>?
        </p>

        {incoming.length > 0 && (
          <div className="explorer-delete-section">
            <span className="text-muted">
              Parents: {parentNodes.map(n => n.track?.title ?? n.node_id).join(', ')}
            </span>
          </div>
        )}

        {hasChildren && (
          <div className="explorer-delete-section">
            <p className="text-muted" style={{ marginBottom: 8 }}>
              Choose what happens to each child:
            </p>
            {childNodes.map(child => (
              <div key={child.node_id} className="explorer-delete-child-row" data-testid="delete-child-row">
                <span className="explorer-delete-child-name">
                  {child.track?.title ?? child.node_id}
                </span>
                <div className="explorer-delete-rewire">
                  <label>
                    <input
                      type="radio"
                      name={`rewire-${child.node_id}`}
                      checked={childResolutions[child.node_id] === undefined}
                      onChange={() => setResolution(child.node_id, undefined)}
                    />
                    Orphan
                  </label>
                  {parentNodes.map(p => (
                    <label key={p.node_id}>
                      <input
                        type="radio"
                        name={`rewire-${child.node_id}`}
                        checked={childResolutions[child.node_id] === p.node_id}
                        onChange={() => setResolution(child.node_id, p.node_id)}
                      />
                      Rewire to {p.track?.title ?? p.node_id}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="explorer-delete-buttons">
          <button className="set-action-btn" onClick={onCancel}>Cancel</button>
          <button
            className="set-action-btn set-action-btn--danger"
            onClick={handleConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
