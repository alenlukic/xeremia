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
import { NavBarHoldContext } from '../hooks/useNavBarHold'
import { WIDGET_IDS, WIDGET_LABELS } from '../hooks/useWorkspaceLayout'
import type {
  Edge,
  Placement,
  WidgetId,
  WorkspaceLayout,
} from '../hooks/useWorkspaceLayout'
import { moveRect, resizeRect } from '../hooks/useWorkspaceLayout'
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
  /** Controls grouped with the layout picker on the left of the bar. */
  headerControls?: ReactNode
  headerExtras?: ReactNode
  /** The workspace/legacy switch, rendered as a header tab. */
  shellToggle?: ReactNode
}

/** Hover dwell before the nav bar slides in, and before it slides back out. */
const NAV_SHOW_MS = 300
const NAV_HIDE_MS = 600
/**
 * How close to the top of the viewport summons the bar, matching .ws-header's
 * own height in workspace.css: the pointer is inside the band exactly when it
 * is where the bar would be. Measured against the pointer rather than
 * hit-tested against a strip element, because a strip is only the topmost
 * element over its own few pixels — anywhere a widget, a resize handle or a
 * panel sits in front of it, the hover never arrives at all.
 */
const NAV_BAND_PX = 46
/**
 * The band shrinks to this over a widget's own title bar. That bar sits at the
 * very top of the canvas — always, for a maximized widget — so its lock,
 * maximize and close buttons (y 15–35) fall inside the full band, and reaching
 * for one would summon the nav bar on top of it. Restoring a maximized widget
 * was a race against the reveal. The extreme top edge still summons the bar
 * from anywhere, so nothing becomes unreachable.
 */
const NAV_BAND_OVER_WIDGET_PX = 12

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
  pointerId: number
  captureEl: HTMLElement
}

export function WorkspaceGrid({
  layout,
  panels,
  headerControls,
  headerExtras,
  shellToggle,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { setBounds, unitPx } = layout
  const dragRef = useRef<Drag | null>(null)
  const dragDeltaRef = useRef({ dx: 0, dy: 0 })
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
    function previewRect(z: Drag, dx: number, dy: number): Placement {
      if (z.kind === 'move') {
        return moveRect(
          layout.place,
          z.id,
          z.start,
          z.start.x + dx,
          z.start.y + dy,
          layout.bounds,
        )
      }
      return resizeRect(layout.place, z.id, z.kind, z.start, dx, dy, layout.bounds)
    }
    function commit(z: Drag, dx: number, dy: number) {
      if (z.kind === 'move') {
        moveWidget(z.id, z.start, z.start.x + dx, z.start.y + dy)
      } else {
        resizeWidget(z.id, z.kind, z.start, dx, dy)
      }
    }
    function clearCapture(z: Drag | null) {
      if (!z) {
        return
      }
      if (
        typeof z.captureEl.hasPointerCapture !== 'function' ||
        typeof z.captureEl.releasePointerCapture !== 'function'
      ) {
        return
      }
      try {
        if (z.captureEl.hasPointerCapture(z.pointerId)) {
          z.captureEl.releasePointerCapture(z.pointerId)
        }
      } catch {
        /* pointer capture may already be gone */
      }
    }
    function onMove(e: PointerEvent) {
      const z = dragRef.current
      if (!z) {
        return
      }
      const d = unitsOf(e, z)
      dragDeltaRef.current = d
      setPreview(previewRect(z, d.dx, d.dy))
    }
    function onUp() {
      const z = dragRef.current
      if (z) {
        const d = dragDeltaRef.current
        commit(z, d.dx, d.dy)
      }
      clearCapture(z)
      dragRef.current = null
      dragDeltaRef.current = { dx: 0, dy: 0 }
      setDragging(null)
      setPreview(null)
    }
    function onCancel() {
      clearCapture(dragRef.current)
      dragRef.current = null
      dragDeltaRef.current = { dx: 0, dy: 0 }
      setDragging(null)
      setPreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [layout.bounds, layout.place, moveWidget, resizeWidget, unitPx])

  const startDrag = useCallback(
    (id: WidgetId, kind: 'move' | Edge, start: Placement) =>
      (e: React.PointerEvent) => {
        if (e.button !== 0) {
          return
        }
        e.preventDefault()
        const captureEl = e.currentTarget
        if (typeof captureEl.setPointerCapture === 'function') {
          try {
            captureEl.setPointerCapture(e.pointerId)
          } catch {
            /* jsdom may not fully implement pointer capture */
          }
        }
        dragRef.current = {
          id,
          kind,
          start,
          x0: e.clientX,
          y0: e.clientY,
          pointerId: e.pointerId,
          captureEl,
        }
        dragDeltaRef.current = { dx: 0, dy: 0 }
        setDragging(id)
        setPreview(start)
      },
    [],
  )

  const presetNames = Object.keys(layout.presets)

  // The bar hides itself so the canvas gets the whole shell, and a thin strip
  // along the top edge brings it back. Dwell times keep a pointer merely
  // crossing the top of the screen from flashing it in and out.
  const [navVisible, setNavVisible] = useState(false)
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navInsideRef = useRef(false)
  const navHoldsRef = useRef(0)
  const [navHeld, setNavHeld] = useState(false)

  const cancelNavTimer = useCallback(() => {
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current)
      navTimerRef.current = null
    }
  }, [])

  const scheduleNav = useCallback(
    (visible: boolean, delay: number) => {
      cancelNavTimer()
      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null
        setNavVisible(visible)
      }, delay)
    },
    [cancelNavTimer],
  )

  useEffect(() => cancelNavTimer, [cancelNavTimer])

  // Proximity to the top edge drives the reveal, so the gesture works over
  // widgets instead of only over the sliver of bar not covered by one. While
  // the bar is out, the band grows to its full height so running the pointer
  // along it does not start the hide countdown.
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      // The listener is on the document, so the target is whatever the pointer
      // is actually over — used here only to shrink the band, never to receive
      // the reveal, so nothing can swallow the gesture.
      const target = e.target as Element | null
      const overWidgetBar =
        typeof target?.closest === 'function' && target.closest('.wf-bar')
      const band = overWidgetBar ? NAV_BAND_OVER_WIDGET_PX : NAV_BAND_PX
      const inside = e.clientY <= band
      if (inside === navInsideRef.current) {
        return
      }
      navInsideRef.current = inside
      if (inside) {
        scheduleNav(true, NAV_SHOW_MS)
      } else if (navHoldsRef.current === 0) {
        scheduleNav(false, NAV_HIDE_MS)
      }
    }
    function onMouseLeave() {
      navInsideRef.current = false
      if (navHoldsRef.current === 0) {
        scheduleNav(false, NAV_HIDE_MS)
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [scheduleNav])

  // An open menu pins the bar. Closing it restarts the ordinary countdown,
  // unless the pointer is still resting on the bar. Handled here rather than in
  // an effect on the flag, so the reveal happens in the same tick as the menu
  // opening instead of a render later.
  const holdNav = useCallback(
    (delta: number) => {
      navHoldsRef.current = Math.max(0, navHoldsRef.current + delta)
      const held = navHoldsRef.current > 0
      setNavHeld(held)
      if (held) {
        cancelNavTimer()
        setNavVisible(true)
      } else if (!navInsideRef.current) {
        scheduleNav(false, NAV_HIDE_MS)
      }
    },
    [cancelNavTimer, scheduleNav],
  )

  const maximized = layout.maximized
  const canvasCols = layout.bounds.cols
  const canvasRows = layout.bounds.rows

  return (
    <div className="ws-shell">
      <div
        className={`ws-header-zone${navVisible ? '' : ' ws-header-zone--peek'}`}
      >
        <header
          className={`ws-header${navVisible || navHeld ? '' : ' ws-header--hidden'}`}
        >
          <span className="ws-wordmark">XEREMIA</span>
          <span className="ws-header-rule" />
          <span className="ws-header-label">Layout</span>
          <NavBarHoldContext.Provider value={holdNav}>
            <LayoutPicker
              preset={layout.preset}
              presetNames={presetNames}
              onSelect={layout.selectPreset}
              onSaveCustom={layout.saveCustomPreset}
              onRename={layout.renamePreset}
              onDelete={layout.deletePreset}
              hiddenPresets={layout.hiddenPresets}
              onRestoreBuiltIns={layout.restoreBuiltInPresets}
            />
            {headerControls}
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
          </NavBarHoldContext.Provider>
        </header>
      </div>
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
            // Maximizing hides the rest rather than reordering them, so the
            // stored rectangles are untouched and restoring is a plain toggle.
            if (maximized && maximized !== id) {
              return null
            }
            const isMaximized = maximized === id
            const locked = !!layout.locked[id]
            const rect = isMaximized
              ? { x: 0, y: 0, w: canvasCols, h: canvasRows }
              : dragging === id && preview
                ? preview
                : p
            return (
              <section
                key={id}
                className={[
                  'ws-panel',
                  dragging === id ? 'ws-panel--dragging' : '',
                  isMaximized ? 'ws-panel--maximized' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={WIDGET_LABELS[id]}
                style={{
                  left: rect.x * unitPx,
                  top: rect.y * unitPx,
                  width: rect.w * unitPx,
                  height: rect.h * unitPx,
                }}
              >
                <WidgetFrame
                  id={id}
                  title={WIDGET_LABELS[id]}
                  locked={locked}
                  maximized={isMaximized}
                  actions={panel.actions}
                  onMoveStart={startDrag(id, 'move', p)}
                  onToggleLock={() => layout.toggleLock(id)}
                  onToggleMaximize={() => layout.toggleMaximize(id)}
                  onRemove={() => layout.removeWidget(id)}
                >
                  {panel.node}
                </WidgetFrame>
                {/* Every edge and corner resizes; a locked or maximized widget
                    shows none. */}
                {!locked &&
                  !isMaximized &&
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
