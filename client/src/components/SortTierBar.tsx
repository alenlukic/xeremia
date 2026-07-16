import { useState, useCallback, useEffect, useRef } from 'react'

export interface SortDescriptor {
  id: string
  desc: boolean
}

export interface SortColumn {
  id: string
  label: string
}

interface SortTierBarProps {
  sorting: SortDescriptor[]
  columns: SortColumn[]
  onSortingChange: (sorting: SortDescriptor[]) => void
}

export function SortTierBar({
  sorting,
  columns,
  onSortingChange,
}: SortTierBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const availableColumns = columns.filter(
    (c) => !sorting.some((s) => s.id === c.id),
  )

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const addTier = useCallback(
    (colId: string) => {
      onSortingChange([...sorting, { id: colId, desc: false }])
      setMenuOpen(false)
    },
    [sorting, onSortingChange],
  )

  const removeTier = useCallback(
    (idx: number) => {
      onSortingChange(sorting.filter((_, i) => i !== idx))
    },
    [sorting, onSortingChange],
  )

  const toggleDirection = useCallback(
    (idx: number) => {
      const next = [...sorting]
      next[idx] = { ...next[idx], desc: !next[idx].desc }
      onSortingChange(next)
    },
    [sorting, onSortingChange],
  )

  const moveTierUp = useCallback(
    (idx: number) => {
      if (idx <= 0) {
        return
      }
      const next = [...sorting]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      onSortingChange(next)
    },
    [sorting, onSortingChange],
  )

  const moveTierDown = useCallback(
    (idx: number) => {
      if (idx >= sorting.length - 1) {
        return
      }
      const next = [...sorting]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      onSortingChange(next)
    },
    [sorting, onSortingChange],
  )

  const columnLabel = (id: string) =>
    columns.find((c) => c.id === id)?.label ?? id

  if (sorting.length === 0 && availableColumns.length === 0) {
    return null
  }

  return (
    <div className="sort-tier-bar" role="toolbar" aria-label="Sort tiers">
      {sorting.map((tier, idx) => (
        <span key={tier.id} className="sort-tier-pill">
          <span className="sort-tier-label">{columnLabel(tier.id)}</span>
          <button
            className="sort-tier-dir-btn"
            onClick={() => toggleDirection(idx)}
            title={tier.desc ? 'Sort ascending' : 'Sort descending'}
            aria-label={`Toggle ${columnLabel(tier.id)} direction`}
          >
            {tier.desc ? '▼' : '▲'}
          </button>
          <span className="sort-tier-controls">
            {idx > 0 && (
              <button
                className="sort-tier-ctrl-btn"
                onClick={() => moveTierUp(idx)}
                title="Increase priority"
                aria-label={`Move ${columnLabel(tier.id)} sort up`}
              >
                ‹
              </button>
            )}
            {idx < sorting.length - 1 && (
              <button
                className="sort-tier-ctrl-btn"
                onClick={() => moveTierDown(idx)}
                title="Decrease priority"
                aria-label={`Move ${columnLabel(tier.id)} sort down`}
              >
                ›
              </button>
            )}
            <button
              className="sort-tier-ctrl-btn sort-tier-ctrl-btn--danger"
              onClick={() => removeTier(idx)}
              title={`Remove ${columnLabel(tier.id)} sort`}
              aria-label={`Remove ${columnLabel(tier.id)} sort`}
            >
              ×
            </button>
          </span>
        </span>
      ))}
      {availableColumns.length > 0 && (
        <span className="sort-tier-add-wrapper" ref={wrapperRef}>
          <button
            className="sort-tier-add-btn"
            onClick={() => setMenuOpen((o) => !o)}
            title="Add sort tier"
            aria-label="Add sort tier"
          >
            +Sort
          </button>
          {menuOpen && (
            <ul className="sort-tier-menu">
              {availableColumns.map((col) => (
                <li
                  key={col.id}
                  className="sort-tier-menu-item"
                  onMouseDown={() => addTier(col.id)}
                >
                  {col.label}
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </div>
  )
}
