export const EXPLORER_PALETTE = {
  nodeDanger: '#e53935',
  nodeInfo: '#1e88e5',
  nodeSuccess: '#43a047',
  edgeCyan: '#4fc3f7',
  edgeGreen: '#81c784',
  edgeOrange: '#ffb74d',
  edgePink: '#f06292',
  edgePurple: '#ce93d8',
} as const

export const LEVEL_COLORS = [
  EXPLORER_PALETTE.nodeDanger,
  EXPLORER_PALETTE.nodeInfo,
  EXPLORER_PALETTE.nodeSuccess,
] as const

export const EDGE_COLORS = [
  EXPLORER_PALETTE.edgeCyan,
  EXPLORER_PALETTE.edgeGreen,
  EXPLORER_PALETTE.edgeOrange,
  EXPLORER_PALETTE.edgePink,
  EXPLORER_PALETTE.edgePurple,
] as const

export const ACTION_FILL = {
  danger: 'var(--danger)',
  success: 'var(--success)',
  accent: 'var(--accent)',
} as const

export function nodeColorForLevel(level: number): string {
  return LEVEL_COLORS[level % LEVEL_COLORS.length]
}

export function edgeColorForColumn(columnIndex: number): string {
  return EDGE_COLORS[columnIndex % EDGE_COLORS.length]
}
