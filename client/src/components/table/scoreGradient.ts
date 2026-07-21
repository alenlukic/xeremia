import type { CSSProperties } from 'react'

/**
 * Cross-hatch score background for the matches table. The score is encoded by a
 * single channel — hue, red (worst) → green (best). On this dark theme the cells
 * hold *light* text, so the fills must stay dark (low lightness + low alpha over
 * the near-black surface) to keep numbers legible; the hue is instead kept
 * highly *saturated* so red reads as red and green as green rather than
 * collapsing into a muddy, meaningless olive in the mid-range. Lightness is held
 * constant so brightness never doubles up on the same signal as hue.
 *
 * Callers must normalize first: per-column `_score` fields are already 0–1;
 * `overall_score` is 0–100 and must be divided by 100 (see `normalizeScore`).
 */
const TINT_ALPHA = 0.3
const HATCH_ALPHA = 0.08

// High saturation carries the meaning; low, constant lightness keeps every fill
// dark enough for the light score text (with its shadow) to stay readable.
const SAT = 85
const LIGHT = 44
const HATCH_LIGHT = 62

// Hue endpoints (degrees): red (0) → green (1). A single linear ramp.
const HUE_RED = 2
const HUE_GREEN = 140

function scoreHue(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return HUE_RED + (HUE_GREEN - HUE_RED) * clamped
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
  const tint = `hsla(${hue}, ${SAT}%, ${LIGHT}%, ${TINT_ALPHA})`
  const hatch = `hsla(${hue}, ${SAT}%, ${HATCH_LIGHT}%, ${HATCH_ALPHA})`
  return {
    backgroundColor: tint,
    backgroundImage: [
      `repeating-linear-gradient(45deg, ${hatch} 0 1px, transparent 1px 3px)`,
      `repeating-linear-gradient(-45deg, ${hatch} 0 1px, transparent 1px 3px)`,
    ].join(', '),
  }
}
