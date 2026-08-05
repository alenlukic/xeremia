import type { ReactNode } from 'react'
import { GripIcon } from './table/icons'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The chrome around every workspace widget: a 34px title bar that carries the
// drag grip, the span control, and the remove control while edit mode is on.

interface Props {
  id: WidgetId
  title: string
  span: 1 | 2
  editing: boolean
  children: ReactNode
  /** Header-right slot for widget-owned controls (pills, counts, buttons). */
  actions?: ReactNode
  onGripDragStart: (e: React.DragEvent) => void
  onSpanChange: (span: 1 | 2) => void
  onRemove: () => void
}

export function WidgetFrame({
  id,
  title,
  span,
  editing,
  children,
  actions,
  onGripDragStart,
  onSpanChange,
  onRemove,
}: Props) {
  return (
    <>
      <div className="wf-bar">
        {editing && (
          <span
            className="ws-grip"
            role="button"
            tabIndex={0}
            draggable
            aria-label={`Move ${title}`}
            title="Drag to swap this widget"
            onDragStart={onGripDragStart}
          >
            <GripIcon />
          </span>
        )}
        <span className="wf-title">{title}</span>
        <div className="wf-bar-spacer" />
        {actions}
        {editing && (
          <>
            <button
              className="ws-pill wf-span"
              aria-label={`Set ${title} span to ${span === 2 ? 1 : 2}`}
              onClick={() => onSpanChange(span === 2 ? 1 : 2)}
            >
              {span === 2 ? 'span 1' : 'span 2'}
            </button>
            <button
              className="ws-pill wf-remove"
              aria-label={`Remove ${title}`}
              onClick={onRemove}
            >
              ×
            </button>
          </>
        )}
      </div>
      <div className="wf-body" data-widget={id}>
        {children}
      </div>
    </>
  )
}
