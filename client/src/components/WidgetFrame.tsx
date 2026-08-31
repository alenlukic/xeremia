import type { ReactNode } from 'react'
import { GripIcon, LockIcon, MaximizeIcon } from './table/icons'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The chrome around every workspace widget: a 34px title bar that doubles as
// the drag handle for moving the widget around the canvas.

interface Props {
  id: WidgetId
  title: string
  locked: boolean
  /** Temporarily filling the canvas; drag and resize are suspended. */
  maximized?: boolean
  children: ReactNode
  /** Header-right slot for widget-owned controls (pills, counts, buttons). */
  actions?: ReactNode
  onMoveStart: (e: React.PointerEvent) => void
  onToggleLock: () => void
  onToggleMaximize?: () => void
  onRemove: () => void
}

export function WidgetFrame({
  id,
  title,
  locked,
  maximized,
  children,
  actions,
  onMoveStart,
  onToggleLock,
  onToggleMaximize,
  onRemove,
}: Props) {
  // A maximized widget has nowhere to be dragged to, so its bar stops being a
  // drag handle until it is restored.
  const draggable = !locked && !maximized
  return (
    <>
      <div
        className={`wf-bar${draggable ? ' wf-bar--draggable' : ''}`}
        onPointerDown={draggable ? onMoveStart : undefined}
      >
        {draggable && (
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
          {onToggleMaximize && (
            <button
              className={`ws-icon-btn${maximized ? ' ws-icon-btn--on' : ''}`}
              aria-label={`${maximized ? 'Restore' : 'Maximize'} ${title}`}
              aria-pressed={!!maximized}
              title={
                maximized
                  ? 'Restore to the saved layout'
                  : 'Fill the workspace with this widget'
              }
              onClick={onToggleMaximize}
            >
              <MaximizeIcon maximized={maximized} />
            </button>
          )}
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
      <div className="wf-body wf-body--resize-safe" data-widget={id}>
        {children}
      </div>
    </>
  )
}
