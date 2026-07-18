import { useState, useEffect, useCallback } from 'react'

const MIN_COL_WIDTH = 40

function loadWidths(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {}
    }
    const widths: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        widths[key] = value
      }
    }
    return widths
  } catch {
    return {}
  }
}

/**
 * Drag-to-resize column widths for hand-rolled `table-layout: fixed` tables
 * (the tanstack tables use the built-in column sizing instead). Returned
 * widths are px overrides keyed by column id — columns without an entry keep
 * their stylesheet default. Widths persist to localStorage under `storageKey`.
 */
export function useResizableColumns(storageKey: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadWidths(storageKey),
  )

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths))
  }, [storageKey, widths])

  const beginResize = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).closest('th')
    if (!th) {
      return
    }
    const startWidth = th.getBoundingClientRect().width
    const startX = e.clientX

    function handleMove(ev: MouseEvent) {
      const next = Math.max(
        MIN_COL_WIDTH,
        Math.round(startWidth + ev.clientX - startX),
      )
      setWidths((prev) =>
        prev[colId] === next ? prev : { ...prev, [colId]: next },
      )
    }

    function handleUp() {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return { widths, beginResize }
}
