import { useEffect, useRef, useState } from 'react'
import type { ColumnRegistryEntry } from '../../tablePreferences'

interface Props {
  inactiveColumns: ColumnRegistryEntry[]
  onInsert: (columnId: string) => void
}

/**
 * The "add column" affordance, rendered on a rail OUTSIDE the table's right
 * edge (absolutely positioned within `.track-table-outer`) rather than inside
 * the rightmost header cell. This keeps the `+` clear of every column's resize
 * handle — fixing the old bug where the inline `+` made the rightmost column
 * impossible to resize — and lets the rail "push out" the table area on hover.
 * Renders nothing when there are no hidden columns to add.
 */
export function ColumnInsertRail({ inactiveColumns, onInsert }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (inactiveColumns.length === 0) {
    return null
  }

  return (
    <div
      className={`ds-col-insert-rail${open ? ' ds-col-insert-rail--open' : ''}`}
      ref={ref}
    >
      <button
        type="button"
        className="ds-col-insert-btn"
        aria-label="Add column"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        +
      </button>
      {open && (
        <div className="table-col-insert-menu ds-col-insert-menu" role="menu">
          {inactiveColumns.map((col) => (
            <button
              key={col.id}
              type="button"
              role="menuitem"
              className="table-col-insert-item"
              onClick={() => {
                onInsert(col.id)
                setOpen(false)
              }}
            >
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
