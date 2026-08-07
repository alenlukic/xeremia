import { describe, expect, it } from 'vitest'
import {
  BPM_BASE,
  BPM_RATIO,
  CAMELOT_ROWS,
  DUR_MAX,
  DUR_MIN,
  MATRIX_COLS,
  bucketCentreBpm,
  bucketLoBpm,
  colForBpm,
  harmonyPaint,
  keyDotColor,
  pairTracks,
  relPriority,
  shiftCode,
} from './harmonic'

describe('pinned constants', () => {
  it('mirrors the backend pitch window', () => {
    expect(DUR_MIN).toBeCloseTo(0.917, 5)
    expect(DUR_MAX).toBeCloseTo(1.0905, 5)
  })

  it('keeps the matrix axes fixed', () => {
    expect(CAMELOT_ROWS).toHaveLength(24)
    expect(CAMELOT_ROWS[0]).toBe('01A')
    expect(CAMELOT_ROWS[23]).toBe('12B')
    expect(MATRIX_COLS).toBe(26)
    expect(BPM_BASE).toBe(80)
    expect(BPM_RATIO).toBeCloseTo(1.0293, 6)
  })
})

describe('bucket math', () => {
  it('places a BPM in the bucket whose range contains it', () => {
    const col = colForBpm(124)
    expect(bucketLoBpm(col)).toBeLessThanOrEqual(124)
    expect(bucketLoBpm(col + 1)).toBeGreaterThan(124)
  })

  it('clamps outside the axis instead of overflowing', () => {
    expect(colForBpm(40)).toBe(0)
    expect(colForBpm(400)).toBe(MATRIX_COLS - 1)
  })

  it('centres an empty cohort geometrically inside its bucket', () => {
    expect(bucketCentreBpm(3)).toBeGreaterThan(bucketLoBpm(3))
    expect(bucketCentreBpm(3)).toBeLessThan(bucketLoBpm(4))
  })
})

describe('relPriority', () => {
  it('scores the same code and the major-minor partner highest', () => {
    expect(relPriority('08A', '08A')).toBe(4)
    expect(relPriority('08A', '11B')).toBe(4)
  })

  it('scores one-key, adjacent, and octave jumps in descending order', () => {
    expect(relPriority('08A', '09A')).toBe(3)
    // Adjacent jumps flip the letter: the same number, and one step down for A.
    expect(relPriority('08A', '08B')).toBe(2)
    expect(relPriority('08A', '07B')).toBe(2)
    expect(relPriority('08A', '03A')).toBe(1)
    expect(relPriority('08A', '10A')).toBe(0)
  })

  it('returns -1 for an unrelated code', () => {
    expect(relPriority('08A', '02A')).toBe(-1)
    expect(relPriority('08A', '09B')).toBe(-1)
  })
})

describe('shiftCode', () => {
  it('wraps around the wheel and keeps the letter', () => {
    expect(shiftCode('12A', 1)).toBe('01A')
    expect(shiftCode('01B', -1)).toBe('12B')
    expect(shiftCode('05A', 7)).toBe('12A')
  })
})

describe('pairTracks', () => {
  it('pairs identical tracks as-is with no pitch effort', () => {
    const pair = pairTracks(124, '08A', 124, '08A')
    expect(pair.p).toBe(4)
    expect(pair.effort).toBe(0)
    expect(pair.overlap).toBe(true)
  })

  it('reports no overlap when the BPM windows never meet', () => {
    const pair = pairTracks(90, '08A', 160, '08A')
    expect(pair.overlap).toBe(false)
    expect(pair.p).toBe(-1)
  })

  it('accepts one-sided pitching and reports effort 1', () => {
    // A 7-semitone shift up is the only way these two share a window.
    const pair = pairTracks(124, '08A', 131, '03A')
    expect(pair.p).toBeGreaterThanOrEqual(0)
    expect(pair.effort).toBeGreaterThanOrEqual(1)
    expect(pair.meet).toBeGreaterThan(0)
  })

  it('rejects a shared window narrower than 0.4 BPM', () => {
    // Widest shared window here is the sliver between the pitched-up top of
    // the first track and the pitched-down bottom of the second.
    const top = 120 * DUR_MAX
    const sliver = pairTracks(120, '08A', (top - 0.3) / 0.917, '08A')
    expect(sliver.overlap).toBe(false)
    const usable = pairTracks(120, '08A', (top - 0.65) / 0.917, '08A')
    expect(usable.overlap).toBe(true)
  })

  it('finds no relation when the codes never align at a shared BPM', () => {
    const pair = pairTracks(124, '01A', 124, '07A')
    expect(pair.overlap).toBe(true)
    expect(pair.p).toBe(-1)
  })
})

describe('harmonyPaint', () => {
  it('encodes priority in hue alone', () => {
    const low = harmonyPaint(0)
    const high = harmonyPaint(4)
    expect(low.hue).toBe(12)
    expect(high.hue).toBe(148)
    expect(low.sat).toBe(high.sat)
    expect(low.light).toBe(high.light)
    expect(low.a).toBe(high.a)
  })
})

describe('keyDotColor', () => {
  it('gives every one of the 24 codes a unique color', () => {
    const colors = new Set(CAMELOT_ROWS.map((code) => keyDotColor(code)))
    expect(colors.size).toBe(24)
  })

  it('uses pastel A codes and saturated B codes', () => {
    expect(keyDotColor('01A')).toBe('hsl(0, 58%, 72%)')
    expect(keyDotColor('01B')).toBe('hsl(0, 82%, 52%)')
    expect(keyDotColor('12A')).toBe('hsl(330, 58%, 72%)')
  })

  it('returns null for a missing or malformed code', () => {
    expect(keyDotColor(null)).toBeNull()
    expect(keyDotColor('Abm')).toBeNull()
  })
})
