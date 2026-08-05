// Client mirror of src/harmonic_mixing/config.py (pitch bounds) and
// transition_match_finder.py (CamelotPriority relations). Keep in lockstep.

export const CAMELOT_ROWS: string[] = (() => {
  const rows: string[] = []
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, '0')
    rows.push(`${n}A`, `${n}B`)
  }
  return rows
})()

export const BPM_RATIO = 1.0293
export const BPM_BASE = 80
export const MATRIX_COLS = 26

/** Playable-length bounds implied by the pitch window: len ∈ [t·(1−0.083), t·(1+0.0905)]. */
export const DUR_MIN = 1 - 0.083
export const DUR_MAX = 1 + 0.0905

export interface PitchState {
  k: number
  lo: number
  hi: number
  name: 'as-is' | 'up' | 'down'
}

export const PITCH_STATES: PitchState[] = [
  { k: 0, lo: 0.9716, hi: 1.0293, name: 'as-is' },
  { k: 7, lo: 1.0293, hi: 1.0905, name: 'up' },
  { k: -7, lo: 0.917, hi: 0.9716, name: 'down' },
]

export const PRIORITY_NAMES = [
  'two-octave jump',
  'one-octave jump',
  'adjacent jump',
  'one-key jump',
  'same / major-minor',
] as const

export function shiftCode(code: string, k: number): string {
  const n = parseInt(code.slice(0, 2), 10)
  return String(((((n - 1 + k) % 12) + 12) % 12) + 1).padStart(2, '0') + code[2]
}

/** CamelotPriority of cand relative to src (−1 = unrelated). Mirrors _get_all_harmonic_codes. */
export function relPriority(src: string, cand: string): number {
  const N = (x: number) => (((x - 1) % 12) + 12) % 12 + 1
  const n = parseInt(src.slice(0, 2), 10)
  const L = src[2]
  const m = parseInt(cand.slice(0, 2), 10)
  if (cand[2] === L) {
    if (m === n) return 4
    if (m === N(n + 1)) return 3
    if (m === N(n + 7)) return 1
    if (m === N(n + 2)) return 0
    return -1
  }
  if (m === N(n + (L === 'A' ? 3 : -3))) return 4
  if (m === N(n + (L === 'B' ? 1 : -1))) return 2
  if (m === n) return 2
  return -1
}

export interface PairResult {
  p: number
  effort: 0 | 1 | 2
  overlap: boolean
  meet?: number
  aName?: string
  aCode?: string
  bName?: string
  bCode?: string
}

/** Best transition between two exact BPMs: 9 pitch-state pairs, real shared windows only. */
export function pairTracks(aBpm: number, aCode: string, bBpm: number, bCode: string): PairResult {
  let best: PairResult | null = null
  let overlap = false
  for (const sa of PITCH_STATES) {
    for (const sb of PITCH_STATES) {
      const lo = Math.max(aBpm * sa.lo, bBpm * sb.lo)
      const hi = Math.min(aBpm * sa.hi, bBpm * sb.hi)
      if (hi - lo < 0.4) continue
      overlap = true
      const aEff = shiftCode(aCode, sa.k)
      const bEff = shiftCode(bCode, sb.k)
      const p = relPriority(aEff, bEff)
      if (p < 0) continue
      const effort = ((sa.k ? 1 : 0) + (sb.k ? 1 : 0)) as 0 | 1 | 2
      if (!best || p > best.p || (p === best.p && effort < best.effort)) {
        best = { p, effort, overlap: true, meet: (lo + hi) / 2, aName: sa.name, aCode: aEff, bName: sb.name, bCode: bEff }
      }
    }
  }
  return best ?? { p: -1, effort: 0, overlap }
}

export function colForBpm(bpm: number): number {
  return Math.max(0, Math.min(MATRIX_COLS - 1, Math.floor(Math.log(bpm / BPM_BASE) / Math.log(BPM_RATIO))))
}

/** Harmony paint: hue alone encodes priority; sat/light/alpha constant; border style carries pitch effort. */
export function harmonyPaint(p: number): { hue: number; sat: number; light: number; a: number } {
  return { hue: 12 + 34 * p, sat: 74, light: 52, a: 0.62 }
}
