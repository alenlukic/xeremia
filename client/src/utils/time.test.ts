import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatHM,
  parseTimeInput,
} from './time'

describe('formatHM', () => {
  it('formats minutes since midnight as H:MM', () => {
    expect(formatHM(390)).toBe('6:30')
    expect(formatHM(0)).toBe('0:00')
    expect(formatHM(552)).toBe('9:12')
  })

  it('pads single-digit minutes and rounds', () => {
    expect(formatHM(363.4)).toBe('6:03')
    expect(formatHM(-5)).toBe('0:00')
  })
})

describe('parseTimeInput', () => {
  it('parses the three accepted forms to the same value', () => {
    expect(parseTimeInput('390')).toBe(390)
    expect(parseTimeInput('6:30')).toBe(390)
    expect(parseTimeInput('6h30')).toBe(390)
  })

  it('tolerates whitespace and hour-only input', () => {
    expect(parseTimeInput('  6:30 ')).toBe(390)
    expect(parseTimeInput('6h')).toBe(360)
  })

  it('rejects nonsense and out-of-range minutes', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('later')).toBeNull()
    expect(parseTimeInput('6:75')).toBeNull()
  })
})

describe('formatDuration', () => {
  it('renders lengths as zero-padded mm:ss', () => {
    expect(formatDuration(4.5)).toBe('04:30')
    expect(formatDuration(6.44)).toBe('06:26')
    expect(formatDuration(65)).toBe('65:00')
  })
})
