import type { CSSProperties } from 'react'

/**
 * Cross-hatch score background for the matches table. Maps a normalized score
 * (0 = worst, 1 = best) onto a red → yellow → green hue and returns an inline
 * background composed of a flat hue tint plus a subtle repeating-linear-gradient
 * hatch. Alphas mirror the `--score-tint-alpha` / `--score-hatch-alpha` tokens
 * (kept in sync here because the hue is interpolated per value in JS).
 *
 * Callers must normalize first: per-column `_score` fields are already 0–1;
 * `overall_score` is 0–100 and must be divided by 100 (see `normalizeScore`).
 */
const TINT_ALPHA = 0.16
const HATCH_ALPHA = 0.06

// Hue stops (degrees): red → yellow → green, matching the CSS token triples.
const HUE_RED = 4
const HUE_YELLOW = 46
const HUE_GREEN = 128

function scoreHue(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped < 0.5
    ? HUE_RED + (HUE_YELLOW - HUE_RED) * (clamped / 0.5)
    : HUE_YELLOW + (HUE_GREEN - HUE_YELLOW) * ((clamped - 0.5) / 0.5)
}

/** Normalize a raw score to 0–1. `overall_score` arrives pre-scaled to 0–100. */
export function normalizeScore(
  value: number | null | undefined,
  scale: '0-1' | '0-100',
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null
  }
  return scale === '0-100' ? value / 100 : value
}

/** Inline background for a score cell, or `undefined` when the score is absent. */
export function scoreCellStyle(
  normalized: number | null,
): CSSProperties | undefined {
  if (normalized == null) {
    return undefined
  }
  const hue = scoreHue(normalized)
  const tint = `hsla(${hue}, 62%, 48%, ${TINT_ALPHA})`
  const hatch = `hsla(${hue}, 62%, 62%, ${HATCH_ALPHA})`
  return {
    backgroundColor: tint,
    backgroundImage: `repeating-linear-gradient(45deg, ${hatch} 0 2px, transparent 2px 6px)`,
  }
}
