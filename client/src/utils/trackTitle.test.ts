import { describe, it, expect } from 'vitest'
import { displayTitle } from './trackTitle'

describe('displayTitle', () => {
  it('keeps a bracketed metadata prefix verbatim', () => {
    expect(displayTitle({ title: '[8A - Aminor - 128] Some Track' }, 1)).toBe(
      '[8A - Aminor - 128] Some Track',
    )
  })

  it('keeps an unbracketed metadata prefix verbatim', () => {
    expect(displayTitle({ title: '10A - Bm - 100.01 Title Here' }, 10)).toBe(
      '10A - Bm - 100.01 Title Here',
    )
  })

  it('returns a plain title unchanged', () => {
    expect(displayTitle({ title: 'No Prefix Here' }, 3)).toBe('No Prefix Here')
  })

  it('trims surrounding whitespace', () => {
    expect(displayTitle({ title: '  Padded Title  ' }, 4)).toBe('Padded Title')
  })

  it('returns fallback for null track', () => {
    expect(displayTitle(null, 42)).toBe('Track #42')
  })

  it('returns fallback for undefined track', () => {
    expect(displayTitle(undefined, 7)).toBe('Track #7')
  })

  it('returns fallback for an empty title string', () => {
    expect(displayTitle({ title: '' }, 30)).toBe('Track #30')
  })

  it('returns fallback for a whitespace-only title', () => {
    expect(displayTitle({ title: '   ' }, 31)).toBe('Track #31')
  })
})
