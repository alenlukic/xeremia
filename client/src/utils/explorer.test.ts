import { describe, it, expect } from 'vitest';
import {
  nodeColorForLevel,
  edgeColorForColumn,
  EXPLORER_PALETTE,
  LEVEL_COLORS,
  EDGE_COLORS,
  ACTION_FILL,
} from './explorer';

describe('nodeColorForLevel', () => {
  it('returns red for level 0', () => {
    expect(nodeColorForLevel(0)).toBe('#e53935');
  });

  it('returns blue for level 1', () => {
    expect(nodeColorForLevel(1)).toBe('#1e88e5');
  });

  it('returns green for level 2', () => {
    expect(nodeColorForLevel(2)).toBe('#43a047');
  });

  it('cycles back to red for level 3', () => {
    expect(nodeColorForLevel(3)).toBe('#e53935');
  });

  it('cycles correctly for level 5', () => {
    expect(nodeColorForLevel(5)).toBe('#43a047');
  });

  it('cycles correctly for level 6', () => {
    expect(nodeColorForLevel(6)).toBe('#e53935');
  });

  it('handles large levels', () => {
    expect(nodeColorForLevel(99)).toBe('#e53935');
    expect(nodeColorForLevel(100)).toBe('#1e88e5');
  });
});

describe('edgeColorForColumn', () => {
  it('returns first color for column 0', () => {
    expect(edgeColorForColumn(0)).toBe('#4fc3f7');
  });

  it('returns distinct colors for columns 0-4', () => {
    const colors = [0, 1, 2, 3, 4].map(edgeColorForColumn);
    expect(new Set(colors).size).toBe(5);
  });

  it('cycles back to first color at column 5', () => {
    expect(edgeColorForColumn(5)).toBe('#4fc3f7');
  });

  it('returns consistent color for same column index', () => {
    expect(edgeColorForColumn(2)).toBe(edgeColorForColumn(7));
  });
});

describe('EXPLORER_PALETTE', () => {
  it('exports named color constants', () => {
    expect(EXPLORER_PALETTE.nodeDanger).toBe('#e53935');
    expect(EXPLORER_PALETTE.nodeInfo).toBe('#1e88e5');
    expect(EXPLORER_PALETTE.nodeSuccess).toBe('#43a047');
  });

  it('LEVEL_COLORS references palette values', () => {
    expect(LEVEL_COLORS).toEqual([
      EXPLORER_PALETTE.nodeDanger,
      EXPLORER_PALETTE.nodeInfo,
      EXPLORER_PALETTE.nodeSuccess,
    ]);
  });

  it('EDGE_COLORS references palette values', () => {
    expect(EDGE_COLORS.length).toBe(5);
    expect(EDGE_COLORS[0]).toBe(EXPLORER_PALETTE.edgeCyan);
  });
});

describe('ACTION_FILL', () => {
  it('uses CSS variable tokens not raw hex', () => {
    expect(ACTION_FILL.danger).toBe('var(--danger)');
    expect(ACTION_FILL.success).toBe('var(--success)');
    expect(ACTION_FILL.accent).toBe('var(--accent)');
  });
});
