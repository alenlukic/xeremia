import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The header control that puts a removed widget back on the canvas. It lists
// only the widgets that are currently off the grid.

interface Props {
  available: WidgetId[]
  labels: Record<WidgetId, string>
  onAdd: (id: WidgetId) => void
}

export function WidgetTray({ available, labels, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismissOnOutsideClick(ref, open, () => setOpen(false))

  return (
    <div className="ws-picker" ref={ref}>
      <button
        className={`ws-pill ws-picker-button${open ? ' ws-pill--on' : ''}`}
        aria-label="Add widget"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ws-picker-value">Add widget</span>
        <span className="ws-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="ws-picker-menu" role="menu">
          {available.map((id) => (
            <button
              key={id}
              className="ws-picker-item"
              role="menuitem"
              onClick={() => {
                onAdd(id)
                setOpen(false)
              }}
            >
              {labels[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
