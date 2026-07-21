import { useEffect, useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../../hooks/useDismissOnOutsideClick'
import {
  filterLabel,
  isActiveFilter,
  parseNum,
  type FilterableColumn,
  type FilterMap,
  type NumericFilter,
} from './tableFilter'

function NumericPopover({
  value,
  onChange,
}: {
  value: NumericFilter
  onChange: (f: NumericFilter) => void
}) {
  return (
    <div className="filter-popover" role="dialog" aria-label="Numeric filter">
      <div className="filter-popover-row">
        <label className="filter-popover-label">Range</label>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Min"
          value={value.min ?? ''}
          onChange={(e) =>
            onChange({ ...value, min: parseNum(e.target.value) })
          }
        />
        <span className="range-sep">–</span>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Max"
          value={value.max ?? ''}
          onChange={(e) =>
            onChange({ ...value, max: parseNum(e.target.value) })
          }
        />
      </div>
    </div>
  )
}

interface AddButtonProps {
  columns: FilterableColumn[]
  filters: FilterMap
  onFilterChange: (columnId: string, filter: NumericFilter) => void
  label?: string
}

/**
 * "Add Filter" entry point for the design-system header: opens a menu of
 * filterable columns, then a numeric min/max popover for the chosen column.
 * Active filters render separately via {@link TableFilterPills} in the control
 * panel.
 */
export function TableFilterAddButton({
  columns,
  filters,
  onFilterChange,
  label = 'Add filter',
}: AddButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openColumn, setOpenColumn] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const anyOpen = menuOpen || openColumn !== null
  useEffect(() => {
    if (!anyOpen) {
      return
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setOpenColumn(null)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setOpenColumn(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [anyOpen])

  return (
    <div className="filter-add-group" ref={ref}>
      <button
        className="filter-add-btn"
        aria-haspopup="true"
        aria-expanded={anyOpen}
        onClick={() => {
          setOpenColumn(null)
          setMenuOpen((prev) => !prev)
        }}
      >
        {label}
      </button>
      {menuOpen && (
        <div className="filter-add-menu">
          {columns.map((c) => (
            <button
              key={c.id}
              className="filter-add-menu-item"
              onClick={() => {
                setMenuOpen(false)
                setOpenColumn(c.id)
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {openColumn !== null && (
        <NumericPopover
          value={filters[openColumn] ?? {}}
          onChange={(f) => onFilterChange(openColumn, f)}
        />
      )}
    </div>
  )
}

interface PillsProps {
  columns: FilterableColumn[]
  filters: FilterMap
  onFilterChange: (columnId: string, filter: NumericFilter) => void
  onRemove: (columnId: string) => void
}

/** Active numeric-filter pills for the control panel: editable and removable. */
export function TableFilterPills({
  columns,
  filters,
  onFilterChange,
  onRemove,
}: PillsProps) {
  const [editColumn, setEditColumn] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick(ref, editColumn !== null, () => setEditColumn(null))

  const active = columns.filter((c) => isActiveFilter(filters[c.id]))
  if (active.length === 0) {
    return null
  }

  return (
    <div className="filter-pills" ref={ref}>
      {active.map((c) => (
        <span key={c.id} className="filter-pill-group">
          <span className="filter-pill">
            <button
              className="filter-pill-body"
              title={`Edit ${c.label} filter`}
              onClick={() =>
                setEditColumn((prev) => (prev === c.id ? null : c.id))
              }
            >
              {filterLabel(c.label, filters[c.id])}
            </button>
            <button
              className="filter-pill-remove"
              aria-label={`Remove ${c.label} filter`}
              title={`Remove ${c.label} filter`}
              onClick={() => {
                onRemove(c.id)
                if (editColumn === c.id) {
                  setEditColumn(null)
                }
              }}
            >
              ×
            </button>
          </span>
          {editColumn === c.id && (
            <NumericPopover
              value={filters[c.id] ?? {}}
              onChange={(f) => onFilterChange(c.id, f)}
            />
          )}
        </span>
      ))}
    </div>
  )
}
