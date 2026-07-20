import { useState } from 'react'
import type { ReactNode } from 'react'

export type RailOrientation = 'horizontal' | 'vertical'

interface Props {
  orientation: RailOrientation
  children: ReactNode
  /** Extra class(es) for the rail element, for content styling. */
  className?: string
}

/**
 * Collapsible rail controlled by the chevron along its exposed edge.
 * The horizontal variant overlays the top of the viewport; the vertical
 * variant overlays the left edge of its nearest positioned ancestor.
 */
export function HoverRail({ orientation, children, className }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <>
      <button
        type="button"
        className={`hover-rail-chevron hover-rail-chevron--${orientation}${visible ? ' hover-rail-chevron--open' : ''}`}
        onClick={() => setVisible((current) => !current)}
        aria-label={`${visible ? 'Close' : 'Open'} ${orientation} navigation`}
        aria-expanded={visible}
      >
        <span className="hover-rail-chevron-glyph" aria-hidden="true" />
      </button>
      <div
        className={[
          'hover-rail',
          `hover-rail--${orientation}`,
          visible ? 'hover-rail--visible' : '',
          className || '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </>
  )
}
