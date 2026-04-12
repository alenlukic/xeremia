import { memo, useRef, useCallback } from 'react';
import { Level } from './Level';
import { ExplorerEdgeLayer } from './ExplorerEdgeLayer';
import type { ExplorerNode, ExplorerEdge } from '../../types';
import type { ExplorerCellViewModel } from './Level';

const NODE_H = 48;
const V_GAP = 176;
const SLOT_W = 390;
const MAX_COLS = 5;
const TOP_PAD = 32;
const LEVEL_HEIGHT = NODE_H + V_GAP;

export const GRID_TOTAL_WIDTH = MAX_COLS * SLOT_W;

export interface ConnectDragState {
  sourceNodeId: string;
  sourceLevel: number;
  sourceCX: number;
  sourceCY: number;
  cursorX: number;
  cursorY: number;
}

interface ExplorerGridProps {
  viewModel: ExplorerCellViewModel[][];
  edges: ExplorerEdge[];
  nodes: ExplorerNode[];
  edgeScores: Map<string, number | null>;
  loadingEdgeKeys: Set<string>;
  selectedEdgeId: number | null;
  selectedNodeId: string | null;
  swapSource: string | null;
  warningNodeId: string | null;
  tracklistTrackIds: Set<number>;
  playingTrackId: number | null;
  connectDrag: ConnectDragState | null;
  onEdgeClick: (e: React.MouseEvent, edgeId: number) => void;
  onDeleteEdge: (edgeId: number) => void;
  onCellAdd: (level: number, colIndex: number) => void;
  onNodeClick: (nodeId: string) => void;
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string, level: number, colIndex: number) => void;
  onNodeMouseUp: (nodeId: string, level: number) => void;
  onSetDeleteTarget: (nodeId: string) => void;
  onSetSwapSource: (nodeId: string) => void;
  onOpenChildAdd: (nodeId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onPlayTrack: (trackId: number, title: string) => void;
  onGridMouseMove: (e: React.MouseEvent, gridX: number, gridY: number) => void;
  onGridMouseUp: () => void;
  onBackgroundClick: () => void;
}

export const ExplorerGrid = memo(function ExplorerGrid({
  viewModel, edges, nodes, edgeScores, loadingEdgeKeys,
  selectedEdgeId, selectedNodeId, swapSource, warningNodeId,
  tracklistTrackIds, playingTrackId, connectDrag,
  onEdgeClick, onDeleteEdge,
  onCellAdd, onNodeClick, onNodeMouseDown, onNodeMouseUp,
  onSetDeleteTarget, onSetSwapSource, onOpenChildAdd, onNodeToTracklist, onPlayTrack,
  onGridMouseMove, onGridMouseUp, onBackgroundClick,
}: ExplorerGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalHeight = TOP_PAD + viewModel.length * LEVEL_HEIGHT + NODE_H;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gridX = e.clientX - rect.left + el.scrollLeft;
    const gridY = e.clientY - rect.top + el.scrollTop;
    onGridMouseMove(e, gridX, gridY);
  }, [onGridMouseMove]);

  const handleBgClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.classList.contains('explorer-grid-scroll') ||
      target.classList.contains('explorer-grid-content') ||
      target.classList.contains('explorer-levels')
    ) {
      onBackgroundClick();
    }
  }, [onBackgroundClick]);

  return (
    <div
      ref={scrollRef}
      className="explorer-grid-scroll"
      onMouseMove={handleMouseMove}
      onMouseUp={onGridMouseUp}
      onMouseLeave={onGridMouseUp}
      onClick={handleBgClick}
    >
      <div
        className="explorer-grid-content"
        style={{ width: GRID_TOTAL_WIDTH, minHeight: totalHeight }}
      >
        <ExplorerEdgeLayer
          edges={edges}
          nodes={nodes}
          edgeScores={edgeScores}
          loadingEdgeKeys={loadingEdgeKeys}
          selectedEdgeId={selectedEdgeId}
          onEdgeClick={onEdgeClick}
          onDeleteEdge={onDeleteEdge}
          totalWidth={GRID_TOTAL_WIDTH}
          totalHeight={totalHeight}
        />

        {connectDrag && (
          <svg
            className="explorer-connect-drag-svg"
            width={GRID_TOTAL_WIDTH}
            height={totalHeight}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 3, pointerEvents: 'none' }}
          >
            <line
              x1={connectDrag.sourceCX}
              y1={connectDrag.sourceCY}
              x2={connectDrag.cursorX}
              y2={connectDrag.cursorY}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              data-testid="connect-drag-line"
            />
          </svg>
        )}

        <div className="explorer-levels" style={{ paddingTop: TOP_PAD, position: 'relative', zIndex: 2 }}>
          {viewModel.map((cells, levelIndex) => (
            <Level
              key={levelIndex}
              level={levelIndex}
              cells={cells}
              warningNodeId={warningNodeId}
              selectedNodeId={selectedNodeId}
              swapSource={swapSource}
              tracklistTrackIds={tracklistTrackIds}
              playingTrackId={playingTrackId}
              onCellAdd={onCellAdd}
              onNodeClick={onNodeClick}
              onNodeMouseDown={onNodeMouseDown}
              onNodeMouseUp={onNodeMouseUp}
              onSetDeleteTarget={onSetDeleteTarget}
              onSetSwapSource={onSetSwapSource}
              onOpenChildAdd={onOpenChildAdd}
              onNodeToTracklist={onNodeToTracklist}
              onPlayTrack={onPlayTrack}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
