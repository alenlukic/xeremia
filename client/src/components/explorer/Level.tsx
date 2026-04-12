import { memo } from 'react';
import { Cell } from './Cell';
import type { ExplorerNode } from '../../types';

export interface ExplorerCellViewModel {
  level: number;
  colIndex: number;
  node: ExplorerNode | null;
}

export interface LevelProps {
  level: number;
  cells: ExplorerCellViewModel[];
  warningNodeId: string | null;
  selectedNodeId: string | null;
  swapSource: string | null;
  tracklistTrackIds: Set<number>;
  playingTrackId: number | null;
  onCellAdd: (level: number, colIndex: number) => void;
  onNodeClick: (nodeId: string) => void;
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string, level: number, colIndex: number) => void;
  onNodeMouseUp: (nodeId: string, level: number) => void;
  onSetDeleteTarget: (nodeId: string) => void;
  onSetSwapSource: (nodeId: string) => void;
  onOpenChildAdd: (nodeId: string) => void;
  onNodeToTracklist: (nodeId: string) => void;
  onPlayTrack: (trackId: number, title: string) => void;
}

export const Level = memo(function Level({
  level, cells, warningNodeId, selectedNodeId, swapSource,
  tracklistTrackIds, playingTrackId,
  onCellAdd, onNodeClick, onNodeMouseDown, onNodeMouseUp,
  onSetDeleteTarget, onSetSwapSource, onOpenChildAdd, onNodeToTracklist, onPlayTrack,
}: LevelProps) {
  return (
    <div className="explorer-level" data-testid="explorer-level" data-level={level}>
      <span className="explorer-level-label">{level}</span>
      <div className="explorer-level-cells">
        {cells.map(cell => (
          <Cell
            key={`${cell.level}-${cell.colIndex}`}
            level={cell.level}
            colIndex={cell.colIndex}
            node={cell.node}
            isWarning={cell.node ? warningNodeId === cell.node.node_id : false}
            isSelected={cell.node ? selectedNodeId === cell.node.node_id : false}
            isSwapSource={cell.node ? swapSource === cell.node.node_id : false}
            inTracklist={cell.node ? tracklistTrackIds.has(cell.node.track_id) : false}
            isPlaying={cell.node ? playingTrackId === cell.node.track_id : false}
            onAdd={() => onCellAdd(cell.level, cell.colIndex)}
            onNodeClick={onNodeClick}
            onNodeMouseDown={onNodeMouseDown}
            onNodeMouseUp={onNodeMouseUp}
            onDelete={onSetDeleteTarget}
            onSwap={onSetSwapSource}
            onOpenChildAdd={onOpenChildAdd}
            onAddToTracklist={onNodeToTracklist}
            onPlayTrack={onPlayTrack}
          />
        ))}
      </div>
    </div>
  );
});
