import { useEffect, useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { FloatingSurface } from './FloatingSurface'
import type { WidgetId } from '../hooks/useWorkspaceLayout'

// The header control that puts a removed widget back on the canvas. It lists
// only the widgets that are currently off the grid.

interface Props {
  available: WidgetId[]
  labels: Record<WidgetId, string>
  onAdd: (id: WidgetId) => void
}

export function WidgetTray({ available, labels, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useDismissOnOutsideClick(
    ref,
    open,
    () => {
      setOpen(false)
      triggerRef.current?.focus()
    },
    menuRef,
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="ws-picker" ref={ref}>
      <button
        ref={triggerRef}
        className={`ws-pill ws-picker-button${open ? ' ws-pill--on' : ''}`}
        aria-label="Add widget"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ws-picker-value">Add widget</span>
        <span className="ws-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <FloatingSurface
          anchorRef={ref}
          floatingRef={menuRef}
          className="ws-picker-menu"
          role="menu"
          ariaLabel="Add widget"
        >
          {available.map((id) => (
            <button
              key={id}
              className="ws-picker-item"
              role="menuitem"
              onClick={() => {
                onAdd(id)
                setOpen(false)
              }}
            >
              {labels[id]}
            </button>
          ))}
        </FloatingSurface>
      )}
    </div>
  )
}
