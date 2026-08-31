import { useCallback, useState } from 'react'
import { readTrackDrag } from '../utils'

export interface TrackDropTarget {
  mime: string
  onDropTrack: (trackId: number) => void
  /**
   * Handles a whole multi-selection at once. Without it the drop replays
   * {@link onDropTrack} over each dragged id in order, which is right for
   * handlers that are independent per track and wrong for any that batch —
   * those pass this instead.
   */
  onDropTracks?: (trackIds: number[]) => void
  /**
   * Must stay within the drag source's `effectAllowed` or browsers reject the
   * drop: row drags out of the tracklist/pool set `effectAllowed = 'move'`.
   * Defaults to 'copy', which suits browse-table drags.
   */
  dropEffect?: 'copy' | 'move'
}

/**
 * Container-level handlers for accepting track drags identified by custom
 * MIME types — e.g. rows dragged from the browse table, or rows moved between
 * the tracklist and pool panels. Internal row-reorder drags carry only
 * `text/plain` and are left untouched, so nested row-level drag handlers keep
 * working inside the container.
 *
 * A drag started from a multi-selection carries every selected id, and the
 * drop applies to all of them; a plain row drag carries one and behaves
 * exactly as it always has.
 *
 * `dropActive` is true while an accepted drag hovers the container; spread
 * `dropHandlers` onto the container element. With no targets the handlers
 * ignore every drag.
 */
export function useExternalTrackDrop(targets: TrackDropTarget[]) {
  const [dropActive, setDropActive] = useState(false)

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      const target = targets.find((t) =>
        e.dataTransfer?.types?.includes(t.mime),
      )
      if (!target) {
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = target.dropEffect ?? 'copy'
      setDropActive(true)
    },
    [targets],
  )

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropActive(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setDropActive(false)
      const target = targets.find((t) =>
        e.dataTransfer?.types?.includes(t.mime),
      )
      if (!target || !e.dataTransfer) {
        return
      }
      const trackIds = readTrackDrag(e.dataTransfer, target.mime)
      if (trackIds.length === 0) {
        return
      }
      e.preventDefault()
      if (target.onDropTracks) {
        target.onDropTracks(trackIds)
        return
      }
      for (const trackId of trackIds) {
        target.onDropTrack(trackId)
      }
    },
    [targets],
  )

  return {
    dropActive,
    dropHandlers: { onDragOver, onDragLeave, onDrop },
  }
}
