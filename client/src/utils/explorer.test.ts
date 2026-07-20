import { describe, it, expect } from 'vitest'
import {
  colorForColumn,
  EXPLORER_PALETTE,
  COLUMN_COLORS,
  ACTION_FILL,
} from './explorer'

describe('colorForColumn', () => {
  it('returns first color (cyan/blue) for column 0', () => {
    expect(colorForColumn(0)).toBe(EXPLORER_PALETTE.edgeCyan)
  })

  it('returns last color (purple) for column 4', () => {
    expect(colorForColumn(4)).toBe(EXPLORER_PALETTE.edgePurple)
  })

  it('returns distinct colors for columns 0-4', () => {
    const colors = [0, 1, 2, 3, 4].map(colorForColumn)
    expect(new Set(colors).size).toBe(5)
  })

  it('cycles back to first color at column 5', () => {
    expect(colorForColumn(5)).toBe(EXPLORER_PALETTE.edgeCyan)
  })

  it('returns consistent color for same column index', () => {
    expect(colorForColumn(2)).toBe(colorForColumn(7))
  })
})

describe('EXPLORER_PALETTE', () => {
  it('COLUMN_COLORS references palette values', () => {
    expect(COLUMN_COLORS).toEqual([
      EXPLORER_PALETTE.edgeCyan,
      EXPLORER_PALETTE.edgeGreen,
      EXPLORER_PALETTE.edgeOrange,
      EXPLORER_PALETTE.edgePink,
      EXPLORER_PALETTE.edgePurple,
    ])
  })

  it('COLUMN_COLORS has 5 distinct entries', () => {
    expect(COLUMN_COLORS.length).toBe(5)
    expect(COLUMN_COLORS[0]).toBe(EXPLORER_PALETTE.edgeCyan)
  })
})

describe('ACTION_FILL', () => {
  it('uses CSS variable tokens not raw hex', () => {
    expect(ACTION_FILL.danger).toBe('var(--danger-bright)')
    expect(ACTION_FILL.success).toBe('var(--success-bright)')
    expect(ACTION_FILL.accent).toBe('var(--accent-bright)')
  })
})
