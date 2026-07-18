export const EXPLORER_PALETTE = {
  edgeCyan: '#86A8C9',
  edgeGreen: '#71A578',
  edgeOrange: '#EF946C',
  edgePink: '#D17493',
  edgePurple: '#A977B1',
} as const

export const COLUMN_COLORS = [
  EXPLORER_PALETTE.edgeCyan,
  EXPLORER_PALETTE.edgeGreen,
  EXPLORER_PALETTE.edgeOrange,
  EXPLORER_PALETTE.edgePink,
  EXPLORER_PALETTE.edgePurple,
] as const

export const ACTION_FILL = {
  danger: 'var(--danger-bright)',
  success: 'var(--success-bright)',
  accent: 'var(--accent-bright)',
} as const

// Nodes and the edges that emit from them share one color per column index,
// so a line's color always matches its parent node — the leftmost column is
// cyan/blue, the rightmost is purple.
export function colorForColumn(columnIndex: number): string {
  return COLUMN_COLORS[columnIndex % COLUMN_COLORS.length]
}
