import { useEffect, useMemo, useRef, useState } from 'react'
import { TABLE_REGISTRIES, type TableId } from '../tablePreferences'

/** Width used when a column declares no default anywhere. */
const FALLBACK_COL_WIDTH = 80

/**
 * Resolved widths for a hand-rolled `table-layout: fixed` table, plus the total
 * the table itself should be set to.
 *
 * Every visible column gets an explicit width, and the table is sized to their
 * sum. That is what keeps columns independent: a `width: 100%` table with one
 * unsized column makes the browser redistribute the leftover space on every
 * change, so resizing one column visibly moved the others and a column dragged
 * narrow sprang back as the table re-stretched. The wrapper scrolls when the
 * total exceeds it, matching the tanstack tables.
 *
 * `flexColumnId` names the column that soaks up slack, and only for its
 * *initial* width — once it has been resized, or another column has, its
 * width is fixed like any other. This is the same arrangement the browse table
 * uses, where the container only feeds the first sizing pass.
 */
export function useFixedTableWidths({
  tableId,
  visibleColumnIds,
  widths,
  flexColumnId,
  leadingWidth = 0,
}: {
  tableId: TableId
  visibleColumnIds: string[]
  /** Persisted widths, with any in-flight drag already merged in. */
  widths: Record<string, number>
  flexColumnId?: string
  /** Width of any non-preference column rendered before the rest, e.g. the row × . */
  leadingWidth?: number
}) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = outerRef.current
    if (!el) {
      return
    }
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const defaults = useMemo(() => {
    const byId = new Map(TABLE_REGISTRIES[tableId].map((e) => [e.id, e]))
    return (id: string) => byId.get(id)?.defaultWidth ?? FALLBACK_COL_WIDTH
  }, [tableId])

  return useMemo(() => {
    const resolved: Record<string, number> = {}
    for (const id of visibleColumnIds) {
      resolved[id] = widths[id] ?? defaults(id)
    }
    // Give the flex column the slack, but only while it has no width of its
    // own — otherwise it would silently resize whenever a sibling did.
    if (
      flexColumnId &&
      visibleColumnIds.includes(flexColumnId) &&
      widths[flexColumnId] == null &&
      containerWidth > 0
    ) {
      const others = visibleColumnIds.reduce(
        (sum, id) => (id === flexColumnId ? sum : sum + resolved[id]),
        0,
      )
      resolved[flexColumnId] = Math.max(
        defaults(flexColumnId),
        containerWidth - leadingWidth - others,
      )
    }
    const total =
      leadingWidth +
      visibleColumnIds.reduce((sum, id) => sum + resolved[id], 0)
    return { outerRef, widths: resolved, totalWidth: total }
  }, [
    visibleColumnIds,
    widths,
    defaults,
    flexColumnId,
    leadingWidth,
    containerWidth,
  ])
}
