import { Children, type ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

/**
 * Control-panel zone of the design-system table: sits below the header and above
 * the column-title row, hosting active sort tiers, filter pills, and any
 * persistent toggle controls. Renders nothing when it has no content, so tables
 * with no active sorts/filters and no persistent controls collapse it entirely
 * (per spec: "otherwise hidden").
 */
export function TableControlPanel({ children }: Props) {
  const hasContent = Children.toArray(children).some(Boolean)
  if (!hasContent) {
    return null
  }
  return <div className="ds-table-control-panel">{children}</div>
}
