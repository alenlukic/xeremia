import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { LayoutPicker } from './LayoutPicker'
import { WidgetFrame } from './WidgetFrame'
import { WidgetTray } from './WidgetTray'
import { WIDGET_IDS, WIDGET_LABELS } from '../hooks/useWorkspaceLayout'
import type {
  Edge,
  Placement,
  WidgetId,
  WorkspaceLayout,
} from '../hooks/useWorkspaceLayout'
import './workspace.css'

// The v2 shell: a discretized free-form canvas. Widgets are rectangles in grid
// units, every edge and corner resizes, and the header bar drags one around.
// Panels are provided by App so every data hook stays where it lives today.

export interface WorkspacePanel {
  node: ReactNode
  actions?: ReactNode
}

interface Props {
  layout: WorkspaceLayout
  panels: Partial<Record<WidgetId, WorkspacePanel>>
  headerExtras?: ReactNode
  /** The workspace/legacy switch, rendered as a header tab. */
  shellToggle?: ReactNode
}

const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

const EDGE_LABELS: Record<Edge, string> = {
  n: 'top',
  s: 'bottom',
  e: 'right',
  w: 'left',
  ne: 'top-right',
  nw: 'top-left',
  se: 'bottom-right',
  sw: 'bottom-left',
}

interface Drag {
  id: WidgetId
  kind: 'move' | Edge
  start: Placement
  x0: number
  y0: number
}

/** The snapped rectangle a drag is aiming at, before any clamping. */
function previewOf(z: Drag, dx: number, dy: number): Placement {
  const s = z.start
  if (z.kind === 'move') {
    return { ...s, x: s.x + dx, y: s.y + dy }
  }
  let { x, y, w, h } = s
  if (z.kind.includes('w')) {
    x = s.x + dx
    w = s.w - dx
  }
  if (z.kind.includes('e')) {
    w = s.w + dx
  }
  if (z.kind.includes('n')) {
    y = s.y + dy
    h = s.h - dy
  }
  if (z.kind.includes('s')) {
    h = s.h + dy
  }
  return { x, y, w, h }
}

export function WorkspaceGrid({
  layout,
  panels,
  headerExtras,
  shellToggle,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { setBounds, unitPx } = layout
  const dragRef = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  // The rectangle the drag would land on, drawn as a dashed outline while the
  // pointer moves so the snap target is visible before the pointer is released.
  const [preview, setPreview] = useState<Placement | null>(null)
  const { resizeWidget, moveWidget } = layout

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) {
      return
    }
    const report = () =>
      setBounds({
        cols: Math.max(1, Math.floor(el.clientWidth / unitPx)),
        rows: Math.max(1, Math.floor(el.clientHeight / unitPx)),
      })
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [setBounds, unitPx])

  useEffect(() => {
    // One unit is 8px, so a drag converts pixels to units and rounds — the
    // halfway mark decides which boundary an edge snaps to.
    function unitsOf(e: PointerEvent, z: Drag) {
      return {
        dx: Math.round((e.clientX - z.x0) / unitPx),
        dy: Math.round((e.clientY - z.y0) / unitPx),
      }
    }
    function onMove(e: PointerEvent) {
      const z = dragRef.current
      if (!z) {
        return
      }
      const d = unitsOf(e, z)
      if (!d) {
        return
      }
      if (z.kind === 'move') {
        moveWidget(z.id, z.start, z.start.x + d.dx, z.start.y + d.dy)
      } else {
        resizeWidget(z.id, z.kind, z.start, d.dx, d.dy)
      }
      setPreview(previewOf(z, d.dx, d.dy))
    }
    function onUp() {
      dragRef.current = null
      setDragging(null)
      setPreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizeWidget, moveWidget, unitPx])

  const startDrag = useCallback(
    (id: WidgetId, kind: 'move' | Edge, start: Placement) =>
      (e: React.PointerEvent) => {
        if (e.button !== 0) {
          return
        }
        e.preventDefault()
        dragRef.current = { id, kind, start, x0: e.clientX, y0: e.clientY }
        setDragging(id)
      },
    [],
  )

  const presetNames = Object.keys(layout.presets)

  return (
    <div className="ws-shell">
      <header className="ws-header">
        <span className="ws-wordmark">XEREMIA</span>
        <span className="ws-header-rule" />
        <span className="ws-header-label">Layout</span>
        <LayoutPicker
          preset={layout.preset}
          presetNames={presetNames}
          onSelect={layout.selectPreset}
          onSaveCustom={layout.saveCustomPreset}
          onRename={layout.renamePreset}
        />
        {layout.missing.length > 0 && (
          <WidgetTray
            available={layout.missing}
            labels={WIDGET_LABELS}
            onAdd={layout.addWidget}
          />
        )}
        {shellToggle}
        <div className="ws-header-spacer" />
        {headerExtras}
      </header>
      <div className="ws-grid-wrap">
        <div
          ref={canvasRef}
          className={`ws-canvas${dragging ? ' ws-canvas--dragging' : ''}`}
          role="group"
          aria-label="Workspace grid"
        >
          {/* Dashed unit guides, shown only while a drag is in flight. */}
          {dragging && (
            <div
              className="ws-guides"
              aria-hidden="true"
              style={{ backgroundSize: `${unitPx * 4}px ${unitPx * 4}px` }}
            />
          )}
          {preview && (
            <div
              className="ws-preview"
              aria-hidden="true"
              style={{
                left: preview.x * unitPx,
                top: preview.y * unitPx,
                width: preview.w * unitPx,
                height: preview.h * unitPx,
              }}
            />
          )}
          {WIDGET_IDS.map((id) => {
            const p = layout.place[id]
            const panel = panels[id]
            if (!p || !panel) {
              return null
            }
            const locked = !!layout.locked[id]
            return (
              <section
                key={id}
                className={`ws-panel${dragging === id ? ' ws-panel--dragging' : ''}`}
                aria-label={WIDGET_LABELS[id]}
                style={{
                  left: p.x * unitPx,
                  top: p.y * unitPx,
                  width: p.w * unitPx,
                  height: p.h * unitPx,
                }}
              >
                <WidgetFrame
                  id={id}
                  title={WIDGET_LABELS[id]}
                  locked={locked}
                  actions={panel.actions}
                  onMoveStart={startDrag(id, 'move', p)}
                  onToggleLock={() => layout.toggleLock(id)}
                  onRemove={() => layout.removeWidget(id)}
                >
                  {panel.node}
                </WidgetFrame>
                {/* Every edge and corner resizes; a locked widget shows none. */}
                {!locked &&
                  EDGES.map((edge) => (
                    <span
                      key={edge}
                      className={`ws-handle ws-handle--${edge}`}
                      role="separator"
                      aria-label={`Resize ${WIDGET_LABELS[id]} ${EDGE_LABELS[edge]} edge`}
                      onPointerDown={startDrag(id, edge, p)}
                    />
                  ))}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
