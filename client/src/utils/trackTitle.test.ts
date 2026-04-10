import { describe, it, expect } from 'vitest';
import { cleanTitle } from './trackTitle';

describe('cleanTitle', () => {
  it('strips a [key - scale - BPM] prefix', () => {
    expect(cleanTitle({ title: '[8A - Aminor - 128] Some Track' }, 1))
      .toBe('Some Track');
  });

  it('strips prefix with varied bracket content', () => {
    expect(cleanTitle({ title: '[12B - Emajor - 140.5] Another One' }, 2))
      .toBe('Another One');
  });

  it('returns title unchanged when no prefix', () => {
    expect(cleanTitle({ title: 'No Prefix Here' }, 3))
      .toBe('No Prefix Here');
  });

  it('handles empty brackets', () => {
    expect(cleanTitle({ title: '[] Rest of Title' }, 4))
      .toBe('Rest of Title');
  });

  it('returns fallback for null track', () => {
    expect(cleanTitle(null, 42)).toBe('Track #42');
  });

  it('returns fallback for undefined track', () => {
    expect(cleanTitle(undefined, 7)).toBe('Track #7');
  });

  it('preserves brackets that are not a leading prefix', () => {
    expect(cleanTitle({ title: 'Title With [Remix]' }, 5))
      .toBe('Title With [Remix]');
  });

  it('strips unbracketed key - scale - bpm prefix', () => {
    expect(cleanTitle({ title: '10A - Bm - 100.01 Title Here' }, 10))
      .toBe('Title Here');
  });

  it('strips unbracketed prefix with integer BPM', () => {
    expect(cleanTitle({ title: '3B - Cmajor - 128 My Song' }, 11))
      .toBe('My Song');
  });

  it('does not strip a title like "10A Remix"', () => {
    expect(cleanTitle({ title: '10A Remix' }, 12))
      .toBe('10A Remix');
  });

  it('does not strip partial matches missing separator', () => {
    expect(cleanTitle({ title: '10A Bm 100 Song' }, 13))
      .toBe('10A Bm 100 Song');
  });

  it('strips both bracketed and unbracketed prefixes combined', () => {
    expect(cleanTitle({ title: '[8A - Am - 128] 8A - Am - 128 Title' }, 14))
      .toBe('Title');
  });

  it('falls back to Track #<id> when stripping leaves empty string', () => {
    expect(cleanTitle({ title: '[8A - Am - 128]' }, 20))
      .toBe('Track #20');
  });

  it('falls back to Track #<id> when stripping leaves whitespace only', () => {
    expect(cleanTitle({ title: '[8A - Am - 128]   ' }, 21))
      .toBe('Track #21');
  });

  it('falls back to Track #<id> for an empty title string', () => {
    expect(cleanTitle({ title: '' }, 30)).toBe('Track #30');
  });

  it('handles 12B unbracketed prefix', () => {
    expect(cleanTitle({ title: '12B - Emaj - 140.50 Deep Track' }, 15))
      .toBe('Deep Track');
  });
});
