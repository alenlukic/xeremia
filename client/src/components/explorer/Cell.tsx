import { memo, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { ExplorerNode } from '../../types';
import { nodeColorForLevel, nodeHeight, NODE_H_DEFAULT, cleanTitle } from '../../utils/explorer';
export interface CellProps {
  level: number;
  colIndex: number;
  node: ExplorerNode | null;
  isWarning: boolean;
  isSelected: boolean;
  isSwapSource: boolean;
  isMoveDragSource: boolean;
  inTracklist: boolean;
  isPlaying: boolean;
  onAdd: () => void;
  onNodeClick: (nodeId: string) => void;
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string, level: number, colIndex: number) => void;
  onNodeMouseUp: (nodeId: string, level: number) => void;
  onDelete: (nodeId: string) => void;
  onSwap: (nodeId: string) => void;
  onOpenChildAdd: (nodeId: string) => void;
  onAddToTracklist: (nodeId: string) => void;
  onPlayTrack: (trackId: number, title: string) => void;
}

export const Cell = memo(function Cell({
  level, colIndex, node, isWarning, isSelected, isSwapSource, isMoveDragSource, inTracklist, isPlaying,
  onAdd, onNodeClick, onNodeMouseDown, onNodeMouseUp,
  onDelete, onSwap, onOpenChildAdd, onAddToTracklist, onPlayTrack,
}: CellProps) {
  const dropId = `drop-explorer-cell-${level}-${colIndex}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!node) return;
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('.explorer-cell-action-row') || target.closest('.explorer-cell-play-btn')) return;
    e.stopPropagation();
    onNodeMouseDown(e, node.node_id, level, colIndex);
  }, [node, level, colIndex, onNodeMouseDown]);

  const handleMouseUp = useCallback(() => {
    if (!node) return;
    onNodeMouseUp(node.node_id, level);
  }, [node, level, onNodeMouseUp]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!node) return;
    e.stopPropagation();
    onNodeClick(node.node_id);
  }, [node, onNodeClick]);

  if (!node) {
    return (
      <div
        ref={setNodeRef}
        className={`explorer-cell explorer-cell--empty${isOver ? ' drop-zone--active' : ''}`}
        data-testid="explorer-cell"
        data-level={level}
        data-col-index={colIndex}
      >
        <button
          className="explorer-cell-add-btn"
          onClick={onAdd}
          aria-label={`Add track to level ${level} column ${colIndex}`}
          data-testid="cell-add-btn"
        >
          + Add
        </button>
      </div>
    );
  }

  const fullTitle = node.track?.title ?? String(node.track_id);
  const displayTitle = cleanTitle(fullTitle);
  const color = nodeColorForLevel(level);
  const wrapped = nodeHeight(displayTitle) > NODE_H_DEFAULT;

  return (
    <div
      ref={setNodeRef}
      className={
        `explorer-cell explorer-cell--occupied` +
        (isOver ? ' drop-zone--active' : '') +
        (isWarning ? ' drop-zone--warning' : '') +
        (isSelected ? ' explorer-cell--selected' : '') +
        (isSwapSource ? ' explorer-cell--swap' : '')
      }
      data-testid="explorer-cell"
      data-level={level}
      data-col-index={colIndex}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        className={`explorer-cell-action-row${isSelected ? ' explorer-cell-action-row--visible' : ''}`}
        data-testid="explorer-action-row"
      >
        <button
          className="explorer-cell-action explorer-cell-play-btn"
          onClick={e => { e.stopPropagation(); onPlayTrack(node.track_id, fullTitle); }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          data-testid="explorer-play-btn"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="explorer-cell-action explorer-cell-action--danger"
          onClick={e => { e.stopPropagation(); onDelete(node.node_id); }}
          onMouseDown={e => e.stopPropagation()}
          aria-label="Delete node"
        >×</button>
        <button
          className="explorer-cell-action"
          onClick={e => { e.stopPropagation(); onSwap(node.node_id); }}
          onMouseDown={e => e.stopPropagation()}
          aria-label="Swap track IDs"
        >↕</button>
        {!inTracklist && (
          <button
            className="explorer-cell-action explorer-cell-action--success"
            onClick={e => { e.stopPropagation(); onAddToTracklist(node.node_id); }}
            onMouseDown={e => e.stopPropagation()}
            aria-label="Add to Tracklist"
          >→TL</button>
        )}
      </div>
      <button
        className="explorer-cell-child-cue"
        onClick={e => { e.stopPropagation(); onOpenChildAdd(node.node_id); }}
        onMouseDown={e => e.stopPropagation()}
        aria-label="Add child node"
        data-testid="child-add-btn"
      >+</button>

      <div
        className={`explorer-cell-node${wrapped ? ' node-wrapped' : ''}${isMoveDragSource ? ' explorer-cell-node--move-drag' : ''}`}
        style={{ backgroundColor: color, opacity: isMoveDragSource ? 0.35 : isSwapSource ? 0.5 : 0.85 }}
        title={fullTitle}
        data-testid="explorer-node"
        data-level={level}
        data-col-index={colIndex}
      >
        <span className="explorer-cell-title">{displayTitle}</span>
      </div>
    </div>
  );
});
