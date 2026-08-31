import { useCallback, useMemo, useState } from 'react'
import { MIN_COL_WIDTH } from '../tablePreferences'

/**
 * Drag-to-resize for the hand-rolled `table-layout: fixed` tables (Pool and
 * Tracklist). The tanstack tables get the same behaviour from
 * `columnResizeMode: 'onChange'`; this is the equivalent for tables whose
 * markup is built by hand, and is the single implementation both of them share.
 *
 * The live width is held locally so a drag re-renders only its own table rather
 * than every widget in the workspace, and is flushed to the persisted config on
 * mouse-up.
 */
export function useColumnResize(
  persistedWidths: Record<string, number>,
  onFlush: (columnId: string, width: number) => void,
) {
  const [liveResize, setLiveResize] = useState<{
    id: string
    width: number
  } | null>(null)

  const beginResize = useCallback(
    (colId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const th = (e.target as HTMLElement).closest('th')
      if (!th) {
        return
      }
      const startWidth = th.getBoundingClientRect().width
      const startX = e.clientX
      let latestWidth = startWidth

      function handleMove(ev: MouseEvent) {
        latestWidth = Math.max(
          MIN_COL_WIDTH,
          Math.round(startWidth + ev.clientX - startX),
        )
        setLiveResize({ id: colId, width: latestWidth })
      }

      function handleUp() {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
        setLiveResize(null)
        onFlush(colId, latestWidth)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [onFlush],
  )

  const widths = useMemo(
    () =>
      liveResize
        ? { ...persistedWidths, [liveResize.id]: liveResize.width }
        : persistedWidths,
    [persistedWidths, liveResize],
  )

  return { widths, beginResize, resizingId: liveResize?.id ?? null }
}
