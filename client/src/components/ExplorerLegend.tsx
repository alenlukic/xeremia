import { PRIORITY_NAMES, harmonyPaint } from '../utils/harmonic'

// Seven swatches: the five priority ranks in hue order, then the two pitch
// efforts drawn in the same border language the cells use.

const RANKS = [4, 3, 2, 1, 0] as const

export function ExplorerLegend() {
  return (
    <div className="xm-legend" aria-label="Harmony legend">
      {RANKS.map((p) => {
        const paint = harmonyPaint(p)
        return (
          <span
            key={p}
            className="xm-swatch"
            style={{
              backgroundColor: `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`,
              color: p === 0 ? '#fff4f0' : '#0d1206',
            }}
          >
            {PRIORITY_NAMES[p]}
          </span>
        )
      })}
      <span
        className="xm-swatch xm-swatch--effort"
        style={{ borderStyle: 'dashed' }}
      >
        one pitches
      </span>
      <span
        className="xm-swatch xm-swatch--effort"
        style={{ borderStyle: 'dotted' }}
      >
        both pitch
      </span>
    </div>
  )
}
