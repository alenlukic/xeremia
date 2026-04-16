import { memo, useMemo } from 'react';
import type { ExplorerEdge, ExplorerNode } from '../../types';
import { edgeColorForColumn, nodeHeightForTrack, NODE_H_DEFAULT } from '../../utils/explorer';
import { formatOverallScore } from '../../utils';

const NODE_W = 203;
const V_GAP = 132;
const SLOT_W = 292;
const EDGE_SLOTS = 5;
const EDGE_PAD = 23;
const SLOT_STEP = 6;
const BUCKET_GAP = 5;
const LANE_STUB = 10;
const LANE_S = 6;
const TOP_PAD = 32;
const LABEL_W = 32;
const CELL_NODE_OFFSET_Y = 0;
const LEVEL_HEIGHT = NODE_H_DEFAULT + V_GAP;

function nodeSlotX(nodeX: number, laneIndex: number): number {
  const bucket = Math.floor(laneIndex / EDGE_SLOTS);
  const slot = laneIndex % EDGE_SLOTS;
  return nodeX + EDGE_PAD + bucket * (EDGE_SLOTS * SLOT_STEP + BUCKET_GAP) + slot * SLOT_STEP;
}

function calcNodeX(colIndex: number): number {
  return LABEL_W + colIndex * SLOT_W + (SLOT_W - NODE_W) / 2;
}

function calcNodeY(level: number): number {
  return TOP_PAD + level * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y;
}

interface Props {
  edges: ExplorerEdge[];
  nodes: ExplorerNode[];
  edgeScores: Map<string, number | null>;
  loadingEdgeKeys: Set<string>;
  selectedEdgeId: number | null;
  onEdgeClick: (e: React.MouseEvent, edgeId: number) => void;
  onDeleteEdge: (edgeId: number) => void;
  totalWidth: number;
  totalHeight: number;
}

export const ExplorerEdgeLayer = memo(function ExplorerEdgeLayer({
  edges, nodes, edgeScores, loadingEdgeKeys, selectedEdgeId,
  onEdgeClick, onDeleteEdge, totalWidth, totalHeight,
}: Props) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, ExplorerNode>();
    for (const n of nodes) m.set(n.node_id, n);
    return m;
  }, [nodes]);

  return (
    <svg
      className="explorer-edge-svg"
      width={totalWidth}
      height={totalHeight}
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 3, pointerEvents: 'none' }}
    >
      {edges.map(edge => {
        const parent = nodeMap.get(edge.parent_node_id);
        const child = nodeMap.get(edge.child_node_id);
        if (!parent || !child) return null;

        const px = calcNodeX(parent.col_index);
        const py = calcNodeY(parent.level);
        const cx = calcNodeX(child.col_index);
        const cy = calcNodeY(child.level);
        const parentColIdx = parent.col_index;
        const childColIdx = child.col_index % EDGE_SLOTS;
        const laneIndex = parentColIdx * EDGE_SLOTS + childColIdx;

        const parentH = nodeHeightForTrack(parent.track?.title ?? '');
        const parentBottom = py + parentH;
        const childTop = cy;
        const startX = nodeSlotX(px, laneIndex);
        const endX = nodeSlotX(cx, laneIndex);
        const laneY = parentBottom + LANE_STUB + laneIndex * LANE_S;
        const pathD = `M ${startX} ${parentBottom} L ${startX} ${laneY} L ${endX} ${laneY} L ${endX} ${childTop}`;

        const nodeKey = `${edge.parent_node_id}-${edge.child_node_id}`;
        const score = edgeScores.get(nodeKey);
        const isLoading = loadingEdgeKeys.has(nodeKey);
        const isSelected = selectedEdgeId === edge.id;
        const strokeColor = edgeColorForColumn(childColIdx);
        const labelX = endX - 10;
        const labelY = childTop - 8;
        const edgeMidX = (startX + endX) / 2;

        return (
          <g key={`edge-${edge.id}`}>
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onClick={e => onEdgeClick(e, edge.id)}
              data-testid="explorer-edge-hitbox"
            />
            <path
              d={pathD}
              fill="none"
              stroke={isSelected ? 'var(--accent)' : strokeColor}
              strokeWidth={isSelected ? 2.5 : 1.5}
              pointerEvents="none"
            />
            {isLoading && score === undefined ? (
              <g
                className="explorer-score-spinner"
                data-testid="explorer-score-spinner"
                transform={`translate(${labelX}, ${labelY})`}
              >
                <circle
                  r={5}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  strokeDasharray="10 5"
                  opacity={0.7}
                />
              </g>
            ) : score !== undefined ? (
              <text
                x={labelX}
                y={labelY}
                textAnchor="end"
                dominantBaseline="auto"
                className="explorer-edge-label"
                fill={strokeColor}
                data-testid="explorer-edge-label"
                style={{ pointerEvents: 'auto', cursor: 'default' }}
              >
                {score !== null ? formatOverallScore(score) : '—'}
              </text>
            ) : null}
            {isSelected && (
              <g
                transform={`translate(${edgeMidX}, ${laneY})`}
                className="explorer-edge-delete"
                onClick={e => { e.stopPropagation(); onDeleteEdge(edge.id); }}
                style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                role="button"
                tabIndex={0}
                aria-label="Delete edge"
                data-testid="explorer-edge-delete-btn"
              >
                <circle r={10} fill="var(--surface)" stroke="var(--danger)" strokeWidth={1.5} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--danger)"
                  fontSize={14}
                  fontWeight="700"
                >×</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
});
