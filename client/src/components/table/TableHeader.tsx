import type { ReactNode } from 'react'

interface Props {
  /** Table title / context label, left-justified per the design-system spec. */
  title: ReactNode
  /** Primary controls for this quadrant, right-justified (e.g. Add Sort/Filter). */
  primary?: ReactNode
  /** Trailing affordance pinned to the far right (e.g. a clear/close button). */
  trailing?: ReactNode
}

/**
 * Header zone of the design-system table: the top row of every quadrant. Title
 * on the left, quadrant-specific primary controls on the right. Spacing and
 * typography stay identical across tables; each quadrant supplies its own
 * `primary` per the header contract.
 */
export function TableHeader({ title, primary, trailing }: Props) {
  return (
    <div className="ds-table-header">
      <div className="ds-table-header-title">{title}</div>
      {primary && <div className="ds-table-header-primary">{primary}</div>}
      {trailing && <div className="ds-table-header-trailing">{trailing}</div>}
    </div>
  )
}
