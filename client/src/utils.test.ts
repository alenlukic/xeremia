import { describe, it, expect } from 'vitest';
import {
  formatFloat,
  formatBpm,
  formatScore,
  formatOverallScore,
  formatDate,
  displayGenre,
  dragSensitivity,
  DRAG_SENSITIVITY_BASE,
  DRAG_DECAY,
  RESISTANCE_THRESHOLD,
} from './utils';

describe('formatFloat', () => {
  it('returns em-dash for null', () => {
    expect(formatFloat(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatFloat(undefined)).toBe('—');
  });

  it('suppresses trailing zeroes', () => {
    expect(formatFloat(1.0)).toBe('1');
    expect(formatFloat(1.1)).toBe('1.1');
    expect(formatFloat(1.10)).toBe('1.1');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatFloat(1.126)).toBe('1.13');
    expect(formatFloat(1.124)).toBe('1.12');
  });

  it('handles zero', () => {
    expect(formatFloat(0)).toBe('0');
  });
});

describe('formatScore', () => {
  it('returns em-dash for null', () => {
    expect(formatScore(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatScore(undefined)).toBe('—');
  });

  it('scales to 100 and rounds to integer', () => {
    expect(formatScore(1.0)).toBe('100');
    expect(formatScore(0.9)).toBe('90');
    expect(formatScore(0.612)).toBe('61');
    expect(formatScore(0.6124)).toBe('61');
  });

  it('uses standard half-up rounding at 0.5 threshold', () => {
    expect(formatScore(0.615)).toBe('62');
    expect(formatScore(0.005)).toBe('1');
    expect(formatScore(0.004)).toBe('0');
  });

  it('does not include percent sign', () => {
    expect(formatScore(0.5)).not.toContain('%');
  });

  it('does not include decimal places', () => {
    expect(formatScore(0.612)).not.toContain('.');
  });

  it('handles zero', () => {
    expect(formatScore(0)).toBe('0');
  });
});

describe('formatOverallScore', () => {
  it('returns em-dash for null', () => {
    expect(formatOverallScore(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatOverallScore(undefined)).toBe('—');
  });

  it('rounds a 0-100 value to integer without scaling', () => {
    expect(formatOverallScore(68.92)).toBe('69');
    expect(formatOverallScore(100)).toBe('100');
    expect(formatOverallScore(0)).toBe('0');
    expect(formatOverallScore(50.5)).toBe('51');
  });

  it('does not double-scale (no multiply by 100)', () => {
    expect(formatOverallScore(68.92)).toBe('69');
    expect(Number(formatOverallScore(68.92))).toBeLessThan(200);
  });
});

describe('dragSensitivity', () => {
  const sensAt0 = DRAG_SENSITIVITY_BASE;
  const sensAt10 = DRAG_SENSITIVITY_BASE * Math.exp(-RESISTANCE_THRESHOLD * DRAG_DECAY);
  const sensAtOldMax = DRAG_SENSITIVITY_BASE * Math.exp(-25 * DRAG_DECAY);

  it('returns base sensitivity at weight 0', () => {
    expect(dragSensitivity(0)).toBeCloseTo(sensAt0, 10);
  });

  it('matches legacy curve at threshold (weight 10)', () => {
    expect(dragSensitivity(RESISTANCE_THRESHOLD)).toBeCloseTo(sensAt10, 10);
  });

  it('reaches the old max resistance at weight 100', () => {
    expect(dragSensitivity(100)).toBeCloseTo(sensAtOldMax, 10);
  });

  it('is strictly decreasing across the full 0–100 range', () => {
    for (let w = 0; w < 100; w++) {
      expect(dragSensitivity(w)).toBeGreaterThan(dragSensitivity(w + 1));
    }
  });

  it('has no fixed plateau — every integer step changes the value', () => {
    for (let w = 0; w < 100; w++) {
      const diff = Math.abs(dragSensitivity(w) - dragSensitivity(w + 1));
      expect(diff).toBeGreaterThan(0);
    }
  });

  it('is linear in the 10–100 segment', () => {
    const s10 = dragSensitivity(10);
    const s100 = dragSensitivity(100);
    for (let w = 10; w <= 100; w++) {
      const t = (w - 10) / 90;
      const expected = s10 + t * (s100 - s10);
      expect(dragSensitivity(w)).toBeCloseTo(expected, 10);
    }
  });

  it('exponential segment 0–10 matches legacy formula exactly', () => {
    for (let w = 0; w <= 10; w++) {
      const legacy = DRAG_SENSITIVITY_BASE * Math.exp(-w * DRAG_DECAY);
      expect(dragSensitivity(w)).toBeCloseTo(legacy, 10);
    }
  });

  it('clamps negative weights to 0', () => {
    expect(dragSensitivity(-5)).toBe(dragSensitivity(0));
  });

  it('clamps weights above 100 to the max-resistance value', () => {
    expect(dragSensitivity(150)).toBeCloseTo(sensAtOldMax, 10);
  });
});

describe('formatDate', () => {
  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns em-dash for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formats ISO date string to YYYY-MM-DD', () => {
    expect(formatDate('2025-06-15T12:00:00')).toBe('2025-06-15');
  });

  it('formats date-only string with time component', () => {
    expect(formatDate('2025-01-15T10:00:00')).toBe('2025-01-15');
  });

  it('zero-pads month and day', () => {
    expect(formatDate('2025-03-05T10:00:00')).toBe('2025-03-05');
  });
});

describe('displayGenre', () => {
  it('returns null for null input', () => {
    expect(displayGenre(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(displayGenre(undefined)).toBeNull();
  });

  it('strips family prefix with ---', () => {
    expect(displayGenre('Rock---Grindcore')).toBe('Grindcore');
  });

  it('strips nested prefixes using last ---', () => {
    expect(displayGenre('Electronic---House---Deep House')).toBe('Deep House');
  });

  it('returns genre as-is when no --- present', () => {
    expect(displayGenre('Techno')).toBe('Techno');
  });

  it('handles empty string', () => {
    expect(displayGenre('')).toBe('');
  });
});

describe('formatBpm', () => {
  it('returns em-dash for null', () => {
    expect(formatBpm(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatBpm(undefined)).toBe('—');
  });

  it('rounds to nearest integer', () => {
    expect(formatBpm(128.4)).toBe('128');
    expect(formatBpm(128.5)).toBe('129');
    expect(formatBpm(128.7)).toBe('129');
  });

  it('produces no decimal places for whole numbers', () => {
    expect(formatBpm(130.0)).toBe('130');
    expect(formatBpm(90)).toBe('90');
  });

  it('does not include a decimal point', () => {
    expect(formatBpm(128.123)).not.toContain('.');
  });

  it('handles zero', () => {
    expect(formatBpm(0)).toBe('0');
  });
});
