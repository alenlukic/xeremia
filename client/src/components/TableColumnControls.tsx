import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  onRemove: () => void
  children?: React.ReactNode
  /**
   * When false, the column cannot be hidden inline: no hover-× is rendered and
   * the dwell listener is skipped. Used for identity columns (e.g. matches
   * "Track") so an accidental click can never remove them.
   */
  removable?: boolean
}

/** Left fraction of the column header that reveals the remove control. */
const LEFT_HOT_FRACTION = 0.35
const LEFT_HOT_MIN_PX = 20
const LEFT_HOT_MAX_PX = 36
/**
 * Dwell the pointer must hold inside the left hot zone before the × appears.
 * Guards against accidental removals when the header is clicked to sort.
 */
const REVEAL_DELAY_MS = 600

/**
 * Column header label with a hover "remove column" affordance to the LEFT of
 * the title. The × only surfaces after the pointer dwells over the left side of
 * the column header for {@link REVEAL_DELAY_MS} (or when the remove control
 * itself is focused). Appearing the × temporarily widens the header content so
 * it is never clipped on a narrow column. Sort indicators belong outside this
 * component, to the RIGHT of the title.
 *
 * Adding / restoring columns is handled in Admin → Preferences.
 */
export function TableColumnControls({
  label,
  onRemove,
  children,
  removable = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [leftHot, setLeftHot] = useState(false)

  useEffect(() => {
    if (!removable) {
      return
    }
    const th = ref.current?.closest('th')
    if (!th) {
      return
    }

    // Pointer currently inside the hot zone, plus the pending reveal timer.
    // Tracking the last-known state lets a continuous mousemove keep the dwell
    // timer running instead of restarting it on every event.
    let inHot = false
    let timer: number | null = null

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const onMove = (e: MouseEvent) => {
      const rect = th.getBoundingClientRect()
      if (rect.width <= 0) {
        inHot = false
        clearTimer()
        setLeftHot(false)
        return
      }
      const hotWidth = Math.min(
        LEFT_HOT_MAX_PX,
        Math.max(LEFT_HOT_MIN_PX, rect.width * LEFT_HOT_FRACTION),
      )
      const nowInHot = e.clientX - rect.left <= hotWidth
      if (nowInHot === inHot) {
        return
      }
      inHot = nowInHot
      if (nowInHot) {
        timer = window.setTimeout(() => {
          timer = null
          setLeftHot(true)
        }, REVEAL_DELAY_MS)
      } else {
        clearTimer()
        setLeftHot(false)
      }
    }
    const onLeave = () => {
      inHot = false
      clearTimer()
      setLeftHot(false)
    }

    th.addEventListener('mousemove', onMove)
    th.addEventListener('mouseleave', onLeave)
    return () => {
      clearTimer()
      th.removeEventListener('mousemove', onMove)
      th.removeEventListener('mouseleave', onLeave)
    }
  }, [removable])

  return (
    <div
      ref={ref}
      className={`table-col-controls${leftHot ? ' table-col-controls--left-hot' : ''}`}
    >
      {removable && (
        <button
          type="button"
          className="table-col-remove"
          aria-label={`Remove ${label} column`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      )}
      <span className="table-col-label">{children ?? label}</span>
    </div>
  )
}

/** Shown when every column is hidden — restoring happens in Admin → Preferences. */
export function TableColumnEmptyRecovery() {
  return (
    <p className="table-empty-columns">
      No columns visible. Restore columns in Admin → Preferences.
    </p>
  )
}
