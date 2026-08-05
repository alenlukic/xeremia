import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The dashed button an empty grid cell shows in edit mode. Its tray lists only
// the widgets that are currently off the grid.

interface Props {
  cell: { r: 0 | 1; c: 0 | 1 | 2 }
  available: WidgetId[]
  labels: Record<WidgetId, string>
  onAdd: (id: WidgetId, cell: { r: 0 | 1; c: 0 | 1 | 2 }) => void
}

export function WidgetTray({ cell, available, labels, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismissOnOutsideClick(ref, open, () => setOpen(false))

  return (
    <div className="wt-slot" ref={ref}>
      <button
        className="wt-add"
        aria-label={`Add widget to row ${cell.r + 1} column ${cell.c + 1}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        + add widget
      </button>
      {open && (
        <div className="wt-tray" role="menu">
          {available.length === 0 && (
            <span className="wt-empty">every widget is on the grid</span>
          )}
          {available.map((id) => (
            <button
              key={id}
              className="ws-pill"
              role="menuitem"
              onClick={() => {
                onAdd(id, cell)
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
