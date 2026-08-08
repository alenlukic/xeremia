import { useEffect, useRef } from 'react'
import { CAMELOT_ROWS, keyDotColor } from '../utils/harmonic'
import type { Track } from '../types'
import { POOL_ROW_MIME } from '../utils'
import { displayTitle } from '../utils/trackTitle'

// The 238px overlay that lists a cohort's tracks. It floats above the grid, so
// opening it never changes the matrix width.

interface Props {
  row: number
  range: [number, number]
  cohort: Track[]
  side: 'left' | 'right'
  onClose: () => void
}

export function ExplorerInspector({
  row,
  range,
  cohort,
  side,
  onClose,
}: Props) {
  const code = CAMELOT_ROWS[row]
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div
      ref={panelRef}
      className={`xm-inspector xm-inspector--${side}`}
      role="dialog"
      aria-label={`Cohort ${code}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
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
      <div className="xm-inspector-tracks">
        {cohort.map((t) => (
          <div
            key={t.id}
            className="xm-track-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(POOL_ROW_MIME, String(t.id))
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            [{t.camelot_code} · {Math.round(t.bpm ?? 0)}] {displayTitle(t, t.id)}
          </div>
        ))}
      </div>
    </div>
  )
}
