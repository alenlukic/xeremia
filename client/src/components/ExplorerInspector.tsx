import {
  CAMELOT_ROWS,
  DUR_MAX,
  DUR_MIN,
  keyDotColor,
  shiftCode,
} from '../utils/harmonic'
import type { Track } from '../types'

// The 238px overlay that lists a cohort's tracks. It floats above the grid, so
// opening it never changes the matrix width.

interface Props {
  row: number
  range: [number, number]
  cohort: Track[]
  side: 'left' | 'right'
  trackDragKey: string
  onClose: () => void
}

export function ExplorerInspector({
  row,
  range,
  cohort,
  side,
  trackDragKey,
  onClose,
}: Props) {
  const code = CAMELOT_ROWS[row]
  const centre = (range[0] + range[1]) / 2
  return (
    <div
      className={`xm-inspector xm-inspector--${side}`}
      role="dialog"
      aria-label={`Cohort ${code}`}
    >
      <div className="xm-inspector-head">
        <div className="xm-inspector-title">
          <span
            className="key-dot"
            aria-hidden="true"
            style={{ background: keyDotColor(code) ?? 'transparent' }}
          />
          {code} · {range[0].toFixed(1)}–{range[1].toFixed(1)} BPM
        </div>
        <button
          className="xm-inspector-close"
          onClick={onClose}
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>
      <div className="xm-inspector-sub">
        pairable window {(centre * DUR_MIN).toFixed(1)}–
        {(centre * DUR_MAX).toFixed(1)} BPM
      </div>
      <div className="xm-inspector-sub">
        pitched up → {shiftCode(code, 7)} · pitched down → {shiftCode(code, -7)}
      </div>
      <div className="xm-inspector-tracks">
        {cohort.map((t) => (
          <div
            key={t.id}
            className="xm-track-card"
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData(trackDragKey, String(t.id))
            }
          >
            [{t.camelot_code} · {Math.round(t.bpm ?? 0)}] {t.title}
          </div>
        ))}
      </div>
    </div>
  )
}
