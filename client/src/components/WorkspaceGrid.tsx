import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { WidgetFrame } from './WidgetFrame'
import { WidgetTray } from './WidgetTray'
import {
  CUSTOM_PRESET,
  WIDGET_IDS,
  WIDGET_LABELS,
} from '../hooks/useWorkspaceLayout'
import type { WidgetId, WorkspaceLayout } from '../hooks/useWorkspaceLayout'
import './workspace.css'

// The v2 shell: a 3×2 grid with named presets, an edit mode that swaps, spans,
// removes and re-adds widgets, and draggable dividers that reallocate fr units.
// Panels are provided by App so every data hook stays where it lives today.

export interface WorkspacePanel {
  node: ReactNode
  actions?: ReactNode
}

interface Props {
  layout: WorkspaceLayout
  panels: Partial<Record<WidgetId, WorkspacePanel>>
  headerExtras?: ReactNode
}

const ROWS: (0 | 1)[] = [0, 1]
const COLS: (0 | 1 | 2)[] = [0, 1, 2]

export function WorkspaceGrid({ layout, panels, headerExtras }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    axis: 'col' | 'row'
    k: number
    x0: number
    y0: number
    fr0: number[]
  } | null>(null)
  const resize = layout.resize

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const z = dragRef.current
      const el = gridRef.current
      if (!z || !el) {
        return
      }
      const rect = el.getBoundingClientRect()
      const tot = z.fr0.reduce((a, b) => a + b, 0)
      const deltaFrac =
        z.axis === 'col'
          ? ((e.clientX - z.x0) / Math.max(60, rect.width - 48)) * tot
          : ((e.clientY - z.y0) / Math.max(60, rect.height - 24)) * tot
      resize(z.axis, z.k, z.fr0, deltaFrac)
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
  }, [resize])

  const startColDrag = useCallback(
    (k: number) => (e: React.PointerEvent) => {
      dragRef.current = {
        axis: 'col',
        k,
        x0: e.clientX,
        y0: e.clientY,
        fr0: layout.cols.slice(),
      }
    },
    [layout.cols],
  )
  const startRowDrag = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = {
        axis: 'row',
        k: 1,
        x0: e.clientX,
        y0: e.clientY,
        fr0: layout.rows.slice(),
      }
    },
    [layout.rows],
  )

  const handlePanelDrop = useCallback(
    (target: WidgetId) => (e: React.DragEvent) => {
      const src = e.dataTransfer.getData('text/panel') as WidgetId
      if (src && src !== target) {
        e.preventDefault()
        layout.swapWidgets(src, target)
      }
    },
    [layout],
  )

  // Cells no placed widget covers; the tray offers them in edit mode.
  const emptyCells = useMemo(() => {
    const taken = new Set<string>()
    for (const id of WIDGET_IDS) {
      const p = layout.place[id]
      if (!p) {
        continue
      }
      for (let i = 0; i < p.span; i++) {
        taken.add(`${p.r}:${p.c + i}`)
      }
    }
    const cells: { r: 0 | 1; c: 0 | 1 | 2 }[] = []
    for (const r of ROWS) {
      for (const c of COLS) {
        if (!taken.has(`${r}:${c}`)) {
          cells.push({ r, c })
        }
      }
    }
    return cells
  }, [layout.place])

  const presetNames = Object.keys(layout.presets)
  const totC = layout.cols[0] + layout.cols[1] + layout.cols[2]
  const totR = layout.rows[0] + layout.rows[1]

  return (
    <div className="ws-shell">
      <header className="ws-header">
        <span className="ws-wordmark">XEREMIA</span>
        <span className="ws-header-rule" />
        <span className="ws-header-label">Layout</span>
        <div className="ws-preset-pills">
          {presetNames.map((name) => (
            <button
              key={name}
              className={`ws-pill${name === layout.preset ? ' ws-pill--on' : ''}`}
              onClick={() => layout.selectPreset(name)}
            >
              {name}
            </button>
          ))}
          {layout.preset === CUSTOM_PRESET && (
            <>
              <button className="ws-pill ws-pill--on" disabled>
                {CUSTOM_PRESET}
              </button>
              <button className="ws-pill" onClick={layout.saveCustomPreset}>
                Save as preset
              </button>
            </>
          )}
        </div>
        <button
          className={`ws-pill${layout.editing ? ' ws-pill--on' : ''}`}
          aria-pressed={layout.editing}
          onClick={() => layout.setEditing(!layout.editing)}
        >
          Edit layout
        </button>
        <div className="ws-header-spacer" />
        {headerExtras}
      </header>
      <div className="ws-grid-wrap">
        <div
          ref={gridRef}
          className="ws-grid"
          role="group"
          aria-label="Workspace grid"
          style={{
            gridTemplateColumns: layout.cols.map((v) => `${v}fr`).join(' '),
            gridTemplateRows: layout.rows.map((v) => `${v}fr`).join(' '),
          }}
        >
          {WIDGET_IDS.map((id) => {
            const p = layout.place[id]
            const panel = panels[id]
            if (!p || !panel) {
              return null
            }
            return (
              <section
                key={id}
                className="ws-panel"
                aria-label={WIDGET_LABELS[id]}
                data-span={p.span}
                style={{
                  gridArea: `${p.r + 1} / ${p.c + 1} / ${p.r + 2} / ${p.c + 1 + p.span}`,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handlePanelDrop(id)}
              >
                <WidgetFrame
                  id={id}
                  title={WIDGET_LABELS[id]}
                  span={p.span}
                  editing={layout.editing}
                  actions={panel.actions}
                  onGripDragStart={(e) =>
                    e.dataTransfer.setData('text/panel', id)
                  }
                  onSpanChange={(span) => layout.setSpan(id, span)}
                  onRemove={() => layout.removeWidget(id)}
                >
                  {panel.node}
                </WidgetFrame>
              </section>
            )
          })}
          {layout.editing &&
            emptyCells.map((cell) => (
              <div
                key={`empty-${cell.r}-${cell.c}`}
                className="ws-panel ws-panel--empty"
                style={{
                  gridArea: `${cell.r + 1} / ${cell.c + 1} / ${cell.r + 2} / ${cell.c + 2}`,
                }}
              >
                <WidgetTray
                  cell={cell}
                  available={layout.missing}
                  labels={WIDGET_LABELS}
                  onAdd={layout.addWidget}
                />
              </div>
            ))}
        </div>
        {[1, 2].map((k) => (
          <div
            key={`c${k}`}
            className="ws-divider ws-divider--col"
            role="separator"
            aria-orientation="vertical"
            aria-label={`Resize column ${k}`}
            style={{
              left: `calc((100% - 48px) * ${(
                layout.cols.slice(0, k).reduce((a, b) => a + b, 0) / totC
              ).toFixed(5)} + ${8 * k - 1}px)`,
            }}
            onPointerDown={startColDrag(k)}
          />
        ))}
        <div
          className="ws-divider ws-divider--row"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize row 1"
          style={{
            top: `calc((100% - 24px) * ${(layout.rows[0] / totR).toFixed(5)} + 7px)`,
          }}
          onPointerDown={startRowDrag}
        />
      </div>
    </div>
  )
}
