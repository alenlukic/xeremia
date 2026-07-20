export type DividerOrientation = 'vertical' | 'horizontal'
export type QuadrantEdge = 'left' | 'right' | 'top' | 'bottom'

type ChevronDirection = 'up' | 'down' | 'left' | 'right'

function Chevron({ direction }: { direction: ChevronDirection }) {
  return (
    <svg
      className={`quad-chevron quad-chevron--${direction}`}
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
    >
      <polyline
        points="2.5,4 6,7.5 9.5,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface DividerProps {
  orientation: DividerOrientation
  beforeLabel: string
  afterLabel: string
  onCollapseBefore: () => void
  onCollapseAfter: () => void
}

/**
 * Heavy border between two quadrants. Each half of the divider belongs to
 * the quadrant it touches: hovering (or focusing) it expands the bar
 * drawer-style over that quadrant and reveals a chevron that collapses it.
 */
export function QuadrantDivider({
  orientation,
  beforeLabel,
  afterLabel,
  onCollapseBefore,
  onCollapseAfter,
}: DividerProps) {
  const beforeDirection: ChevronDirection =
    orientation === 'vertical' ? 'left' : 'up'
  const afterDirection: ChevronDirection =
    orientation === 'vertical' ? 'right' : 'down'
  return (
    <div className={`quad-divider quad-divider--${orientation}`}>
      <button
        className="quad-bar quad-bar--before"
        onClick={onCollapseBefore}
        aria-label={beforeLabel}
        title={beforeLabel}
      >
        <Chevron direction={beforeDirection} />
      </button>
      <button
        className="quad-bar quad-bar--after"
        onClick={onCollapseAfter}
        aria-label={afterLabel}
        title={afterLabel}
      >
        <Chevron direction={afterDirection} />
      </button>
    </div>
  )
}

/** Chevron points back toward where the collapsed content will reappear. */
const EXPAND_CHEVRON: Record<QuadrantEdge, ChevronDirection> = {
  left: 'right',
  right: 'left',
  top: 'down',
  bottom: 'up',
}

interface ExpandBarProps {
  /** Which edge of the layout the collapsed quadrant sits against. */
  edge: QuadrantEdge
  label: string
  ariaLabel: string
  onExpand: () => void
}

/** Slim bar standing in for a collapsed quadrant; clicking restores it. */
export function QuadrantExpandBar({
  edge,
  label,
  ariaLabel,
  onExpand,
}: ExpandBarProps) {
  return (
    <button
      className={`quad-expand quad-expand--${edge}`}
      onClick={onExpand}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Chevron direction={EXPAND_CHEVRON[edge]} />
      <span className="quad-expand-label">{label}</span>
    </button>
  )
}
