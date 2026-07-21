import { describe, it, expect } from 'vitest'
import { normalizeScore, scoreCellStyle } from './scoreGradient'

describe('normalizeScore', () => {
  it('passes 0–1 factor scores through unchanged', () => {
    expect(normalizeScore(0.8, '0-1')).toBe(0.8)
    expect(normalizeScore(0, '0-1')).toBe(0)
  })

  it('rescales 0–100 overall scores to 0–1', () => {
    expect(normalizeScore(90, '0-100')).toBeCloseTo(0.9)
    expect(normalizeScore(100, '0-100')).toBe(1)
  })

  it('returns null for missing or non-finite values', () => {
    expect(normalizeScore(null, '0-1')).toBeNull()
    expect(normalizeScore(undefined, '0-100')).toBeNull()
    expect(normalizeScore(NaN, '0-1')).toBeNull()
  })
})

describe('scoreCellStyle', () => {
  it('returns undefined for a null score', () => {
    expect(scoreCellStyle(null)).toBeUndefined()
  })

  it('produces a tint + cross-hatch background', () => {
    const style = scoreCellStyle(0.5)
    expect(style?.backgroundColor).toMatch(/^hsla\(/)
    expect(style?.backgroundImage).toContain('repeating-linear-gradient')
  })

  it('maps low scores toward red and high scores toward green', () => {
    // Hue for a red-ish low score should be smaller than a green-ish high score.
    const low = scoreCellStyle(0)!.backgroundColor as string
    const high = scoreCellStyle(1)!.backgroundColor as string
    const hue = (s: string) => Number(s.match(/hsla\(([\d.]+)/)![1])
    expect(hue(low)).toBeLessThan(hue(high))
  })
})
