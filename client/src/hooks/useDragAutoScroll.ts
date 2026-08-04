import { useCallback, useEffect, useRef } from 'react'

/** Distance from a scroll edge, in px, within which auto-scroll engages. */
const EDGE_ZONE_PX = 56
/** Speed the instant the pointer enters the edge zone (px/sec). */
const MIN_SPEED_PX_S = 90
/** Speed the ramp tops out at (px/sec). */
const MAX_SPEED_PX_S = 900
/** How long the pointer must be held in the zone to reach MAX_SPEED (ms). */
const RAMP_MS = 1400
/** Clamp for a single frame's delta so a stalled tab can't jump the scroll. */
const MAX_FRAME_MS = 100

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * Auto-scroll a container while an HTML5 drag hovers near its top/bottom edge.
 *
 * Native drag-and-drop never scrolls a nested overflow container, so a reorder
 * drag "stops" the moment the pointer hits the edge of the table viewport.
 * This drives the container's `scrollTop` from a rAF loop instead: speed scales
 * with how deep into the edge zone the pointer sits, and ramps from
 * MIN_SPEED_PX_S to MAX_SPEED_PX_S over RAMP_MS of continuous hold so a short
 * nudge creeps and a sustained hold covers a long list.
 *
 * Attach `scrollRef` to the scrolling element and `onDragOver` to it (or any
 * descendant — `dragover` bubbles). The loop stops on drag end, drop, or when
 * the pointer leaves the edge zone.
 */
export function useDragAutoScroll<T extends HTMLElement>() {
  const scrollRef = useRef<T | null>(null)
  const frameRef = useRef<number | null>(null)
  /** -1 scrolling up, 1 scrolling down, 0 idle. */
  const directionRef = useRef(0)
  /** 0..1 — how deep into the edge zone the pointer is. */
  const intensityRef = useRef(0)
  const heldMsRef = useRef(0)
  const lastTsRef = useRef(0)

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    directionRef.current = 0
    heldMsRef.current = 0
    lastTsRef.current = 0
  }, [])

  const ensureLoop = useCallback(() => {
    if (frameRef.current !== null) {
      return
    }
    lastTsRef.current = 0

    const tick = (ts: number) => {
      const el = scrollRef.current
      const direction = directionRef.current
      if (!el || direction === 0) {
        frameRef.current = null
        return
      }
      // First frame has no baseline; assume a typical 60fps step.
      const deltaMs = lastTsRef.current
        ? Math.min(ts - lastTsRef.current, MAX_FRAME_MS)
        : 16
      lastTsRef.current = ts
      heldMsRef.current += deltaMs

      const ramp = clamp01(heldMsRef.current / RAMP_MS)
      const speed =
        (MIN_SPEED_PX_S + (MAX_SPEED_PX_S - MIN_SPEED_PX_S) * ramp) *
        intensityRef.current
      const before = el.scrollTop
      el.scrollTop = before + direction * speed * (deltaMs / 1000)
      // Already pinned against the end of the range — nothing left to do.
      if (el.scrollTop === before) {
        frameRef.current = null
        directionRef.current = 0
        return
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
  }, [])

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      const el = scrollRef.current
      if (!el) {
        return
      }
      const rect = el.getBoundingClientRect()
      // A zero-height rect means the element is not laid out (jsdom, hidden
      // panes); there is nothing meaningful to scroll toward.
      if (rect.height === 0) {
        return
      }
      const distanceToTop = e.clientY - rect.top
      const distanceToBottom = rect.bottom - e.clientY

      let direction = 0
      let intensity = 0
      if (distanceToTop < EDGE_ZONE_PX) {
        direction = -1
        intensity = clamp01((EDGE_ZONE_PX - distanceToTop) / EDGE_ZONE_PX)
      } else if (distanceToBottom < EDGE_ZONE_PX) {
        direction = 1
        intensity = clamp01((EDGE_ZONE_PX - distanceToBottom) / EDGE_ZONE_PX)
      }

      if (direction === 0) {
        stop()
        return
      }
      // Reversing direction restarts the ramp, so an overshoot correction is
      // slow and controllable rather than inheriting the built-up speed.
      if (direction !== directionRef.current) {
        heldMsRef.current = 0
      }
      directionRef.current = direction
      intensityRef.current = intensity
      ensureLoop()
    },
    [ensureLoop, stop],
  )

  // `dragleave` also fires for every row the pointer crosses — including rows
  // sliding out from under a stationary pointer while auto-scroll runs — and
  // bubbles up here. `relatedTarget` cannot distinguish those (Chrome reports
  // null on dragleave), so compare the pointer against the container's box:
  // only a leave whose coordinates fall outside it is a real exit. Treating a
  // row transition as an exit would reset the acceleration ramp every frame.
  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      const el = scrollRef.current
      if (!el) {
        return
      }
      const rect = el.getBoundingClientRect()
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      if (inside) {
        return
      }
      stop()
    },
    [stop],
  )

  // The pointer can leave the container (or the drag can be cancelled) without
  // a final dragover, so end the loop on the drag's own terminal events.
  useEffect(() => {
    window.addEventListener('dragend', stop, true)
    window.addEventListener('drop', stop, true)
    return () => {
      window.removeEventListener('dragend', stop, true)
      window.removeEventListener('drop', stop, true)
      stop()
    }
  }, [stop])

  return { scrollRef, onDragOver, onDragLeave, stopAutoScroll: stop }
}
