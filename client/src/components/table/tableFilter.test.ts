import { describe, it, expect } from 'vitest'
import {
  filterLabel,
  isActiveFilter,
  parseNum,
  passesFilter,
} from './tableFilter'

describe('parseNum', () => {
  it('returns undefined for blank input', () => {
    expect(parseNum('')).toBeUndefined()
    expect(parseNum('   ')).toBeUndefined()
  })

  it('parses finite numbers and rejects non-numbers', () => {
    expect(parseNum('42')).toBe(42)
    expect(parseNum('3.5')).toBe(3.5)
    expect(parseNum('abc')).toBeUndefined()
  })
})

describe('isActiveFilter', () => {
  it('is inactive when empty or undefined', () => {
    expect(isActiveFilter(undefined)).toBe(false)
    expect(isActiveFilter({})).toBe(false)
  })

  it('is active when a bound is set', () => {
    expect(isActiveFilter({ min: 10 })).toBe(true)
    expect(isActiveFilter({ max: 90 })).toBe(true)
  })
})

describe('passesFilter', () => {
  it('respects min and max bounds', () => {
    expect(passesFilter(50, { min: 40, max: 60 })).toBe(true)
    expect(passesFilter(30, { min: 40 })).toBe(false)
    expect(passesFilter(70, { max: 60 })).toBe(false)
  })

  it('fails an active filter for missing values but passes an empty one', () => {
    expect(passesFilter(null, { min: 40 })).toBe(false)
    expect(passesFilter(null, {})).toBe(true)
  })
})

describe('filterLabel', () => {
  it('formats range, lower-bound, and upper-bound labels', () => {
    expect(filterLabel('Score', { min: 40, max: 60 })).toBe('Score: 40–60')
    expect(filterLabel('Score', { min: 40 })).toBe('Score: ≥ 40')
    expect(filterLabel('Score', { max: 60 })).toBe('Score: ≤ 60')
  })
})
