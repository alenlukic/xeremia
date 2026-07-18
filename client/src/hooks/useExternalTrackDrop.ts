import { useCallback, useState } from 'react'
import { TRACK_DRAG_MIME } from '../utils'

interface ExternalTrackDropHandlers {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

/**
 * Container-level handlers for accepting external track drags (e.g. rows
 * dragged from the browse table), identified by the custom track MIME type.
 * Internal row-reorder drags carry only `text/plain` and are left untouched,
 * so nested row-level drag handlers keep working inside the container.
 *
 * `dropActive` is true while a track drag hovers the container; spread
 * `dropHandlers` onto the container element. When `onDropTrack` is omitted
 * the handlers ignore every drag.
 */
export function useExternalTrackDrop(onDropTrack?: (trackId: number) => void) {
  const [dropActive, setDropActive] = useState(false)

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onDropTrack || !e.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) {
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropActive(true)
    },
    [onDropTrack],
  )

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropActive(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setDropActive(false)
      if (!onDropTrack) {
        return
      }
      const raw = e.dataTransfer?.getData?.(TRACK_DRAG_MIME)
      const trackId = Number(raw)
      if (!raw || !Number.isInteger(trackId)) {
        return
      }
      e.preventDefault()
      onDropTrack(trackId)
    },
    [onDropTrack],
  )

  const dropHandlers: ExternalTrackDropHandlers = {
    onDragOver,
    onDragLeave,
    onDrop,
  }

  return { dropActive, dropHandlers }
}
