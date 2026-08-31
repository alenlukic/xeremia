import { useCallback, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Shared anchored-menu primitive. Every widget clips its own scroll containers
// (`.ws-frame`, table wrappers, inspector lists), so a menu positioned inside
// the flow gets cut off the moment it is taller or wider than the space left
// under its trigger. Portalling to <body> and pinning to the trigger in
// viewport coordinates keeps the whole surface on screen instead.

export type FloatingAlign = 'left' | 'right'

/** Gap between the trigger and the surface, and inset from the bounds edge. */
const GAP_PX = 4
const PADDING_PX = 8
/** Assumed size before first measurement, so the first pass lands close. */
const ASSUMED_WIDTH_PX = 220
const ASSUMED_HEIGHT_PX = 160

/** A `max-width`/`max-height` in px, or Infinity when unset or relative. */
function parseCssLength(value: string): number {
  const px = Number.parseFloat(value)
  return value.endsWith('px') && Number.isFinite(px) ? px : Infinity
}

interface FloatingOptions {
  /** Which trigger edge the surface lines up with. */
  align?: FloatingAlign
  /** Match the trigger's width (search-style dropdowns). */
  matchAnchorWidth?: boolean
}

/**
 * Pin `floatingRef` to `anchorRef` in viewport coordinates. The surface is
 * clamped inside its host widget panel — or the viewport when the trigger sits
 * outside one, e.g. the app header — flipping above the trigger when there is
 * no room below and capping its size so an oversized menu scrolls rather than
 * overflowing out of view.
 */
function useAnchoredFloating(
  anchorRef: React.RefObject<HTMLElement | null>,
  floatingRef: React.RefObject<HTMLElement | null>,
  { align = 'left', matchAnchorWidth = false }: FloatingOptions = {},
) {
  // The surface's stylesheet size caps, read once before any inline write
  // overwrites them. Clamping never grows a menu past its designed size; it
  // only shrinks it to fit the available space.
  const cssLimitsRef = useRef<{ width: number; height: number } | null>(null)

  const update = useCallback(() => {
    const anchor = anchorRef.current
    const floating = floatingRef.current
    if (!anchor || !floating) {
      return
    }
    const anchorRect = anchor.getBoundingClientRect()
    const panelRect = anchor
      .closest<HTMLElement>('.ws-panel')
      ?.getBoundingClientRect()
    const bounds =
      panelRect && panelRect.width > 0 && panelRect.height > 0
        ? panelRect
        : {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight,
          }
    if (!cssLimitsRef.current) {
      const style = window.getComputedStyle(floating)
      cssLimitsRef.current = {
        width: parseCssLength(style.maxWidth),
        height: parseCssLength(style.maxHeight),
      }
    }
    const cssLimits = cssLimitsRef.current
    const maxWidth = Math.min(
      cssLimits.width,
      Math.max(120, bounds.width - PADDING_PX * 2),
    )
    const maxHeight = Math.min(
      cssLimits.height,
      Math.max(80, bounds.height - PADDING_PX * 2),
    )
    const preferredWidth = matchAnchorWidth
      ? anchorRect.width || ASSUMED_WIDTH_PX
      : floating.offsetWidth || ASSUMED_WIDTH_PX
    const width = Math.min(preferredWidth, maxWidth)
    const height = Math.min(
      floating.offsetHeight || ASSUMED_HEIGHT_PX,
      maxHeight,
    )
    const minLeft = bounds.left + PADDING_PX
    const maxLeft = Math.max(minLeft, bounds.right - PADDING_PX - width)
    const preferredLeft =
      align === 'right' ? anchorRect.right - width : anchorRect.left
    const left = Math.min(maxLeft, Math.max(minLeft, preferredLeft))
    const below = anchorRect.bottom + GAP_PX
    const above = anchorRect.top - GAP_PX - height
    const top =
      below + height <= bounds.bottom - PADDING_PX
        ? below
        : above >= bounds.top + PADDING_PX
          ? above
          : bounds.top + PADDING_PX
    Object.assign(floating.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      right: 'auto',
      bottom: 'auto',
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      overflow: 'auto',
      visibility: 'visible',
    })
    if (matchAnchorWidth) {
      floating.style.width = `${width}px`
    }
  }, [align, matchAnchorWidth, anchorRef, floatingRef])

  useLayoutEffect(() => {
    update()
    window.addEventListener('resize', update)
    // Capture phase: the trigger usually lives in a widget's own scroller.
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [update])
}

interface FloatingSurfaceProps extends FloatingOptions {
  anchorRef: React.RefObject<HTMLElement | null>
  floatingRef: React.RefObject<HTMLElement | null>
  className: string
  role?: React.AriaRole
  ariaLabel?: string
  /** Element to render; `ul` keeps list markup valid for option lists. */
  as?: 'div' | 'ul'
  onDoubleClickCapture?: React.MouseEventHandler
  children: ReactNode
}

/**
 * A menu, popover, or dropdown rendered at <body> and anchored to its trigger.
 * Starts hidden so the first measured layout is what the user sees.
 */
export function FloatingSurface({
  anchorRef,
  floatingRef,
  align,
  matchAnchorWidth,
  className,
  role,
  ariaLabel,
  as: Tag = 'div',
  onDoubleClickCapture,
  children,
}: FloatingSurfaceProps) {
  useAnchoredFloating(anchorRef, floatingRef, { align, matchAnchorWidth })
  return createPortal(
    <Tag
      ref={floatingRef as React.RefObject<HTMLDivElement & HTMLUListElement>}
      className={className}
      role={role}
      aria-label={ariaLabel}
      style={{ position: 'fixed', visibility: 'hidden' }}
      onDoubleClickCapture={onDoubleClickCapture}
    >
      {children}
    </Tag>,
    document.body,
  )
}
