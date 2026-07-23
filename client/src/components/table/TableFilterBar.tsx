import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDismissOnOutsideClick } from '../../hooks/useDismissOnOutsideClick'
import { FilterIcon } from './icons'
import {
  filterLabel,
  isActiveFilter,
  isSelectFilter,
  parseNum,
  type ColumnFilter,
  type FilterableColumn,
  type FilterMap,
  type NumericFilter,
  type SelectFilter,
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

function SelectPopover({
  column,
  value,
  onChange,
}: {
  column: FilterableColumn
  value: SelectFilter
  onChange: (f: SelectFilter) => void
}) {
  const options = column.options ?? []
  const toggle = (option: string) => {
    const next = value.values.includes(option)
      ? value.values.filter((v) => v !== option)
      : [...value.values, option]
    onChange({ values: next })
  }

  return (
    <div className="filter-popover" role="dialog" aria-label="Value filter">
      {options.length === 0 ? (
        <p className="filter-popover-empty">No values available</p>
      ) : (
        <div className="filter-option-list">
          {options.map((option) => (
            <label key={option} className="filter-option">
              <input
                type="checkbox"
                checked={value.values.includes(option)}
                onChange={() => toggle(option)}
              />
              <span className="mono">{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Renders whichever popover kind the column declares. */
function FilterPopover({
  column,
  value,
  onChange,
}: {
  column: FilterableColumn
  value: ColumnFilter | undefined
  onChange: (f: ColumnFilter) => void
}) {
  if (column.kind === 'select') {
    return (
      <SelectPopover
        column={column}
        value={isSelectFilter(value) ? value : { values: [] }}
        onChange={onChange}
      />
    )
  }
  return (
    <NumericPopover
      value={value != null && !isSelectFilter(value) ? value : {}}
      onChange={onChange}
    />
  )
}

interface AddButtonProps {
  columns: FilterableColumn[]
  filters: FilterMap
  onFilterChange: (columnId: string, filter: ColumnFilter) => void
  label?: string
  /** Glyph in place of the default funnel (label stays the accessible name). */
  icon?: ReactNode
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
  icon,
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

  const openColumnDef = columns.find((c) => c.id === openColumn)

  return (
    <div className="filter-add-group" ref={ref}>
      <button
        className="filter-add-btn"
        aria-haspopup="true"
        aria-expanded={anyOpen}
        aria-label={label}
        title={label}
        onClick={() => {
          setOpenColumn(null)
          setMenuOpen((prev) => !prev)
        }}
      >
        {icon ?? <FilterIcon />}
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
      {openColumnDef && (
        <FilterPopover
          column={openColumnDef}
          value={filters[openColumnDef.id]}
          onChange={(f) => onFilterChange(openColumnDef.id, f)}
        />
      )}
    </div>
  )
}

interface PillsProps {
  columns: FilterableColumn[]
  filters: FilterMap
  onFilterChange: (columnId: string, filter: ColumnFilter) => void
  onRemove: (columnId: string) => void
}

/** Active filter pills for the control panel: editable and removable. */
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
            <FilterPopover
              column={c}
              value={filters[c.id]}
              onChange={(f) => onFilterChange(c.id, f)}
            />
          )}
        </span>
      ))}
    </div>
  )
}
