import type { ReactNode } from 'react'
import { GripIcon, LockIcon } from './table/icons'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The chrome around every workspace widget: a 34px title bar that doubles as
// the drag handle for moving the widget around the canvas.

interface Props {
  id: WidgetId
  title: string
  locked: boolean
  children: ReactNode
  /** Header-right slot for widget-owned controls (pills, counts, buttons). */
  actions?: ReactNode
  onMoveStart: (e: React.PointerEvent) => void
  onToggleLock: () => void
  onRemove: () => void
}

export function WidgetFrame({
  id,
  title,
  locked,
  children,
  actions,
  onMoveStart,
  onToggleLock,
  onRemove,
}: Props) {
  return (
    <>
      <div
        className={`wf-bar${locked ? '' : ' wf-bar--draggable'}`}
        onPointerDown={locked ? undefined : onMoveStart}
      >
        {!locked && (
          <span className="ws-grip" aria-hidden="true">
            <GripIcon />
          </span>
        )}
        <span className="wf-title">{title}</span>
        <div className="wf-bar-spacer" />
        {/* Controls sit outside the drag surface so a click is not a drag. */}
        <div
          className="wf-bar-controls"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {actions}
          <button
            className={`ws-icon-btn${locked ? ' ws-icon-btn--on' : ''}`}
            aria-label={`${locked ? 'Unlock' : 'Lock'} ${title}`}
            aria-pressed={locked}
            title={
              locked
                ? 'Locked — this widget cannot be moved or resized'
                : 'Lock this widget in place'
            }
            onClick={onToggleLock}
          >
            <LockIcon open={!locked} />
          </button>
          <button
            className="ws-icon-btn wf-remove"
            aria-label={`Remove ${title}`}
            title="Remove widget"
            onClick={onRemove}
          >
            ×
          </button>
        </div>
      </div>
      <div className="wf-body" data-widget={id}>
        {children}
      </div>
    </>
  )
}
