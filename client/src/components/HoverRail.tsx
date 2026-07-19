import { useState, useRef, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export type RailOrientation = 'horizontal' | 'vertical'

const SHOW_DELAY_MS = 200
const HIDE_DELAY_MS = 400

interface Props {
  /** When true, visible rail uses full opacity instead of the default. */
  opaque?: boolean
  orientation: RailOrientation
  children: ReactNode
  /** Extra class(es) for the rail element, for content styling. */
  className?: string
}

/**
 * Auto-hide rail: invisible until the pointer dwells on the trigger sliver
 * along its edge, then stays open while hovered and hides after a delay.
 * The horizontal variant overlays the top of the viewport; the vertical
 * variant overlays the left edge of its nearest positioned ancestor.
 */
export function HoverRail({ opaque = false, orientation, children, className }: Props) {
  const [visible, setVisible] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      hideTimerRef.current = null
    }, HIDE_DELAY_MS)
  }, [clearHideTimer])

  const handleTriggerEnter = useCallback(() => {
    clearHideTimer()
    if (visible) {
      return
    }
    clearShowTimer()
    showTimerRef.current = setTimeout(() => {
      setVisible(true)
      showTimerRef.current = null
      scheduleHide()
    }, SHOW_DELAY_MS)
  }, [visible, clearHideTimer, clearShowTimer, scheduleHide])

  const handleTriggerLeave = useCallback(() => {
    clearShowTimer()
  }, [clearShowTimer])

  const handleRailEnter = useCallback(() => {
    clearHideTimer()
  }, [clearHideTimer])

  const handleRailLeave = useCallback(() => {
    scheduleHide()
  }, [scheduleHide])

  // The chevron follows the rail: it lives above the hidden bar (acting as
  // the show trigger) and re-attaches past the bar once open (acting like the
  // rest of the bar for hide/keep-open purposes), so its enter/leave behavior
  // must match whichever role it is currently playing.
  const handleChevronLeave = useCallback(() => {
    if (visible) {
      scheduleHide()
    } else {
      clearShowTimer()
    }
  }, [visible, scheduleHide, clearShowTimer])

  useEffect(() => {
    return () => {
      clearShowTimer()
      clearHideTimer()
    }
  }, [clearShowTimer, clearHideTimer])

  return (
    <>
      <div
        className={`hover-rail-trigger hover-rail-trigger--${orientation}`}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
      />
      <div
        className={`hover-rail-chevron hover-rail-chevron--${orientation}${visible ? ' hover-rail-chevron--open' : ''}`}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleChevronLeave}
        aria-hidden="true"
      >
        <span className="hover-rail-chevron-glyph">⌄</span>
      </div>
      <div
        className={[
          'hover-rail',
          `hover-rail--${orientation}`,
          visible
            ? opaque
              ? 'hover-rail--visible hover-rail--opaque'
              : 'hover-rail--visible'
            : '',
          className || '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={handleRailEnter}
        onMouseLeave={handleRailLeave}
      >
        {children}
      </div>
    </>
  )
}
