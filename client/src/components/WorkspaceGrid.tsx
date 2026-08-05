import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout'
import type { WidgetId } from '../hooks/useWorkspaceLayout'
import './workspace.css'

// The v2 shell: a 3×2 grid with named presets, drag-to-swap widgets, and
// draggable dividers that reallocate fr units (README: "Workspace shell").
// Panels are provided by App so all data hooks stay where they live today.

interface Props {
  panels: Record<WidgetId, ReactNode>
  headerExtras?: ReactNode
}

const WIDGET_LABELS: Record<WidgetId, string> = {
  browser: 'Browser',
  matches: 'Matches',
  pool: 'Pool',
  explorer: 'Explorer',
  sequencer: 'Sequencer',
}

export function WorkspaceGrid({ panels, headerExtras }: Props) {
  const layout = useWorkspaceLayout()
  const gridRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    axis: 'col' | 'row'
    k: number
    x0: number
    y0: number
    fr0: number[]
  } | null>(null)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const z = dragRef.current
      const el = gridRef.current
      if (!z || !el) return
      const rect = el.getBoundingClientRect()
      const tot = z.fr0.reduce((a, b) => a + b, 0)
      const deltaFrac =
        z.axis === 'col'
          ? ((e.clientX - z.x0) / Math.max(60, rect.width - 48)) * tot
          : ((e.clientY - z.y0) / Math.max(60, rect.height - 24)) * tot
      layout.resize(z.axis, z.k, z.fr0, deltaFrac)
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [layout.resize])

  const startColDrag = useCallback(
    (k: number) => (e: React.PointerEvent) => {
      dragRef.current = { axis: 'col', k, x0: e.clientX, y0: e.clientY, fr0: layout.cols.slice() }
    },
    [layout.cols],
  )
  const startRowDrag = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { axis: 'row', k: 1, x0: e.clientX, y0: e.clientY, fr0: layout.rows.slice() }
    },
    [layout.rows],
  )

  const swap = useCallback(
    (a: WidgetId, b: WidgetId) => {
      layout.setPlace((place) => {
        const next = { ...place }
        const t = next[a]
        next[a] = next[b]
        next[b] = t
        return next
      })
    },
    [layout.setPlace],
  )

  const handlePanelDrop = useCallback(
    (target: WidgetId) => (e: React.DragEvent) => {
      const src = e.dataTransfer.getData('text/panel') as WidgetId
      if (src && src !== target) {
        e.preventDefault()
        swap(src, target)
      }
    },
    [swap],
  )

  const totC = layout.cols[0] + layout.cols[1] + layout.cols[2]
  const totR = layout.rows[0] + layout.rows[1]

  return (
    <div className="ws-shell">
      <header className="ws-header">
        <span className="ws-wordmark">XEREMIA</span>
        <span className="ws-header-rule" />
        <span className="ws-header-label">Layout</span>
        <div className="ws-preset-pills">
          {Object.keys(layout.presets)
            .concat(layout.preset === 'Custom' ? ['Custom'] : [])
            .map((name) => (
              <button
                key={name}
                className={`ws-pill${name === layout.preset ? ' ws-pill--on' : ''}`}
                onClick={() => layout.selectPreset(name)}
              >
                {name}
              </button>
            ))}
          {layout.preset === 'Custom' && (
            <button className="ws-pill" onClick={layout.saveCustomPreset}>
              Save as preset
            </button>
          )}
        </div>
        <div className="ws-header-spacer" />
        {headerExtras}
      </header>
      <div className="ws-grid-wrap">
        <div
          ref={gridRef}
          className="ws-grid"
          style={{
            gridTemplateColumns: layout.cols.map((v) => `${v}fr`).join(' '),
            gridTemplateRows: layout.rows.map((v) => `${v}fr`).join(' '),
          }}
        >
          {(Object.keys(panels) as WidgetId[]).map((id) => {
            const p = layout.place[id]
            if (!p) return null
            return (
              <section
                key={id}
                className="ws-panel"
                aria-label={WIDGET_LABELS[id]}
                style={{ gridArea: `${p.r + 1} / ${p.c + 1} / ${p.r + 2} / ${p.c + 1 + p.span}` }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handlePanelDrop(id)}
              >
                <span
                  className="ws-grip"
                  draggable
                  title="Drag to move this widget"
                  onDragStart={(e) => e.dataTransfer.setData('text/panel', id)}
                />
                {panels[id]}
              </section>
            )
          })}
        </div>
        {[1, 2].map((k) => (
          <div
            key={`c${k}`}
            className="ws-divider ws-divider--col"
            style={{
              left: `calc((100% - 48px) * ${(layout.cols.slice(0, k).reduce((a, b) => a + b, 0) / totC).toFixed(5)} + ${8 * k - 1}px)`,
            }}
            onPointerDown={startColDrag(k)}
          />
        ))}
        <div
          className="ws-divider ws-divider--row"
          style={{ top: `calc((100% - 24px) * ${(layout.rows[0] / totR).toFixed(5)} + 7px)` }}
          onPointerDown={startRowDrag}
        />
      </div>
    </div>
  )
}
