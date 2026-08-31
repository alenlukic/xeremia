import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDismissOnOutsideClick } from '../../hooks/useDismissOnOutsideClick'
import { FloatingSurface } from '../FloatingSurface'
import type { FloatingAlign } from '../FloatingSurface'
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

function NumericFields({
  value,
  onChange,
}: {
  value: NumericFilter
  onChange: (f: NumericFilter) => void
}) {
  return (
    <div className="filter-popover-row">
      <label className="filter-popover-label">Range</label>
      <input
        type="number"
        className="filter-input mono"
        placeholder="Min"
        value={value.min ?? ''}
        onChange={(e) => onChange({ ...value, min: parseNum(e.target.value) })}
      />
      <span className="range-sep">–</span>
      <input
        type="number"
        className="filter-input mono"
        placeholder="Max"
        value={value.max ?? ''}
        onChange={(e) => onChange({ ...value, max: parseNum(e.target.value) })}
      />
    </div>
  )
}

function SelectFields({
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

  if (options.length === 0) {
    return <p className="filter-popover-empty">No values available</p>
  }
  return (
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
  )
}

/**
 * Renders whichever popover kind the column declares, floated above the widget
 * so a long option list is never clipped by the table's scroll container.
 */
function FilterPopover({
  column,
  value,
  onChange,
  anchorRef,
  floatingRef,
  align,
}: {
  column: FilterableColumn
  value: ColumnFilter | undefined
  onChange: (f: ColumnFilter) => void
  anchorRef: React.RefObject<HTMLElement | null>
  floatingRef: React.RefObject<HTMLDivElement | null>
  align: FloatingAlign
}) {
  const isSelect = column.kind === 'select'
  return (
    <FloatingSurface
      anchorRef={anchorRef}
      floatingRef={floatingRef}
      align={align}
      className="filter-popover"
      role="dialog"
      ariaLabel={isSelect ? 'Value filter' : 'Numeric filter'}
    >
      {isSelect ? (
        <SelectFields
          column={column}
          value={isSelectFilter(value) ? value : { values: [] }}
          onChange={onChange}
        />
      ) : (
        <NumericFields
          value={value != null && !isSelectFilter(value) ? value : {}}
          onChange={onChange}
        />
      )}
    </FloatingSurface>
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
  const floatingRef = useRef<HTMLDivElement>(null)

  const anyOpen = menuOpen || openColumn !== null
  useEffect(() => {
    if (!anyOpen) {
      return
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !floatingRef.current?.contains(target)
      ) {
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
        <FloatingSurface
          anchorRef={ref}
          floatingRef={floatingRef}
          align="right"
          className="filter-add-menu"
          role="menu"
        >
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
        </FloatingSurface>
      )}
      {openColumnDef && (
        <FilterPopover
          column={openColumnDef}
          value={filters[openColumnDef.id]}
          onChange={(f) => onFilterChange(openColumnDef.id, f)}
          anchorRef={ref}
          floatingRef={floatingRef}
          align="right"
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
  // Only the pill being edited is tracked; its popover anchors to it.
  const editPillRef = useRef<HTMLSpanElement | null>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  useDismissOnOutsideClick(
    ref,
    editColumn !== null,
    () => setEditColumn(null),
    floatingRef,
  )

  const active = columns.filter((c) => isActiveFilter(filters[c.id]))
  if (active.length === 0) {
    return null
  }

  return (
    <div className="filter-pills" ref={ref}>
      {active.map((c) => (
        <span
          key={c.id}
          className="filter-pill-group"
          ref={editColumn === c.id ? editPillRef : undefined}
        >
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
              anchorRef={editPillRef}
              floatingRef={floatingRef}
              align="left"
            />
          )}
        </span>
      ))}
    </div>
  )
}
