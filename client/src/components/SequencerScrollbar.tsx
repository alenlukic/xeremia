import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

// The timeline's horizontal scrollbar. A native one can only sit at the very
// bottom of the scroll box, so this replaces it: it rides between the ruler and
// the first lane, centred, and spans a fraction of the width rather than all
// of it.

/** How much of the visible width the track occupies. */
const TRACK_FRACTION = 0.6
const MIN_THUMB_PX = 32

interface Props {
  scrollRef: RefObject<HTMLElement | null>
  /** Content-space x coordinate of the committed sequence end. */
  endOffset: number
}

interface Metrics {
  left: number
  view: number
  total: number
}

export function SequencerScrollbar({ scrollRef, endOffset }: Props) {
  const [m, setM] = useState<Metrics>({ left: 0, view: 0, total: 0 })
  const dragRef = useRef<{
    x0: number
    left0: number
    pointerId: number
    captureEl: HTMLElement
  } | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const read = () =>
      setM({
        left: el.scrollLeft,
        view: el.clientWidth,
        total: el.scrollWidth,
      })
    read()
    el.addEventListener('scroll', read, { passive: true })
    const observer = new ResizeObserver(read)
    observer.observe(el)
    // Zooming resizes the content, not the scrollport, and that changes how
    // much there is to scroll.
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild)
    }
    return () => {
      el.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [scrollRef])

  const trackW = m.view * TRACK_FRACTION
  const scrollable = Math.max(0, m.total - m.view)
  const thumbW = Math.max(
    MIN_THUMB_PX,
    m.total > 0 ? trackW * (m.view / m.total) : trackW,
  )
  const travel = Math.max(0, trackW - thumbW)
  const thumbX = scrollable > 0 ? (m.left / scrollable) * travel : 0

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return
      }
      e.preventDefault()
      const captureEl = e.currentTarget
      if (typeof captureEl.setPointerCapture === 'function') {
        try {
          captureEl.setPointerCapture(e.pointerId)
        } catch {
          /* jsdom and some UAs may not support pointer capture */
        }
      }
      dragRef.current = {
        x0: e.clientX,
        left0: m.left,
        pointerId: e.pointerId,
        captureEl,
      }
    },
    [m.left],
  )

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const z = dragRef.current
      const el = scrollRef.current
      if (!z || !el || travel <= 0) {
        return
      }
      el.scrollLeft = z.left0 + ((e.clientX - z.x0) / travel) * scrollable
    }
    function releaseCapture() {
      const drag = dragRef.current
      if (!drag) {
        return
      }
      if (
        typeof drag.captureEl.hasPointerCapture !== 'function' ||
        typeof drag.captureEl.releasePointerCapture !== 'function'
      ) {
        return
      }
      try {
        if (drag.captureEl.hasPointerCapture(drag.pointerId)) {
          drag.captureEl.releasePointerCapture(drag.pointerId)
        }
      } catch {
        /* capture may already be released */
      }
    }
    function onUp() {
      releaseCapture()
      dragRef.current = null
    }
    function onCancel() {
      releaseCapture()
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [scrollRef, travel, scrollable])

  // Nothing to scroll, nothing to draw.
  if (scrollable <= 0 || m.view === 0) {
    return null
  }

  return (
    <div className="sq-scrollbar" style={{ width: m.view }}>
      <div
        className="sq-scrollbar-track"
        style={{ width: trackW }}
        onPointerDown={(e) => {
          // Clicking the track jumps the thumb to the pointer.
          const el = scrollRef.current
          if (!el || e.target !== e.currentTarget || travel <= 0) {
            return
          }
          const rect = e.currentTarget.getBoundingClientRect()
          const at = e.clientX - rect.left - thumbW / 2
          el.scrollLeft =
            (Math.min(Math.max(at, 0), travel) / travel) * scrollable
        }}
      >
        <div
          className="sq-scrollbar-thumb"
          role="scrollbar"
          aria-label="Scroll timeline"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(
            scrollable ? (m.left / scrollable) * 100 : 0,
          )}
          style={{ width: thumbW, transform: `translateX(${thumbX}px)` }}
          onPointerDown={onPointerDown}
        />
      </div>
      <button
        className="sq-scrollbar-end"
        type="button"
        aria-label="Jump to sequence end"
        title="Jump to sequence end"
        onClick={() => {
          const el = scrollRef.current
          if (el) {
            const left = Math.min(
              scrollable,
              Math.max(0, endOffset - el.clientWidth + 24),
            )
            el.scrollLeft = left
            setM((current) => ({ ...current, left }))
          }
        }}
      >
        →
      </button>
    </div>
  )
}
