import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ExplorerInspector, INSPECTOR_WIDTH_PX } from './ExplorerInspector'
import type { InspectorBox } from './ExplorerInspector'
import { ExplorerTooltip } from './ExplorerTooltip'
import {
  CELL_GAP_PX,
  CELL_HEIGHT_PX,
  CELL_WIDTH_PX,
  useExplorerMatrix,
} from '../hooks/useExplorerMatrix'
import type { MatrixFocus } from '../hooks/useExplorerMatrix'
import { bucketLoBpm, harmonyPaint } from '../utils/harmonic'
import type {
  ExplorerCrate,
  ExplorerCrateMembership,
  Track,
} from '../types'
import {
  dropTracksInOrder,
  readTrackDrag,
  POOL_ROW_MIME,
  TRACK_DRAG_MIME,
} from '../utils'

// BPM cohort matrix: 26 ×1.0293 BPM bucket rows × 24 literal Camelot columns.
// Axes never shift, harmony is hue-only, and pitch effort is the border style.
//
// Crates scope which library tracks the grid shows. The immutable "All" crate
// is virtual (every track in the collection); custom crates are stored
// library-wide and hold track-id memberships. Switching crates only refilters
// the memoized track list.

interface Props {
  /** The whole track library; the global "All" crate shows every entry. */
  tracks: Track[]
  /** Track the workspace has focused, lit here as if its cell were clicked. */
  focus?: MatrixFocus | null
  /** Custom crates. The bar stays hidden when undefined. */
  crates?: ExplorerCrate[]
  crateMemberships?: ExplorerCrateMembership[]
  onCreateCrate?: (name: string) => Promise<ExplorerCrate | null>
  onRenameCrate?: (crateId: number, name: string) => void
  onDeleteCrate?: (crateId: number) => void
  // Async so a multi-track drop can file one track before starting the next.
  onAddTrackToCrate?: (
    crateId: number,
    trackId: number,
  ) => void | Promise<unknown>
  onRemoveFromCrate?: (
    crateId: number,
    trackId: number,
  ) => void | Promise<unknown>
}

const CRATE_DROP_MIMES = [POOL_ROW_MIME, TRACK_DRAG_MIME]

/** Breathing room between the inspector and the widget it hangs off. */
const INSPECTOR_GAP_PX = 8

function dragCarriesTrack(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types)
  return CRATE_DROP_MIMES.some((mime) => types.includes(mime))
}

/** Every track the drag carries — a whole multi-selection, or the one row. */
function readDraggedTrackIds(dataTransfer: DataTransfer): number[] {
  return readTrackDrag(dataTransfer, POOL_ROW_MIME)
}

export function ExplorerMatrix({
  tracks,
  focus,
  crates,
  crateMemberships,
  onCreateCrate,
  onRenameCrate,
  onDeleteCrate,
  onAddTrackToCrate,
  onRemoveFromCrate,
}: Props) {
  // null selects the virtual global crate. A deleted crate id falls back to
  // global without an effect pass.
  const [activeCrateId, setActiveCrateId] = useState<number | null>(null)
  const activeCrate =
    activeCrateId !== null
      ? (crates?.find((crate) => crate.id === activeCrateId) ?? null)
      : null

  // track_id sets per crate, rebuilt only when memberships change, so a crate
  // switch is a single O(library) filter with O(1) membership lookups.
  const crateTrackIds = useMemo(() => {
    const byCrate = new Map<number, Set<number>>()
    for (const membership of crateMemberships ?? []) {
      let ids = byCrate.get(membership.crate_id)
      if (!ids) {
        ids = new Set()
        byCrate.set(membership.crate_id, ids)
      }
      ids.add(membership.track_id)
    }
    return byCrate
  }, [crateMemberships])

  const visibleTracks = useMemo(() => {
    if (!activeCrate) {
      return tracks
    }
    const ids = crateTrackIds.get(activeCrate.id)
    if (!ids) {
      return []
    }
    return tracks.filter((track) => ids.has(track.id))
  }, [tracks, activeCrate, crateTrackIds])

  const matrix = useExplorerMatrix(visibleTracks, focus)

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const selectedCellRef = useRef<HTMLButtonElement | null>(null)

  // The inspector is placed beside the widget, on whichever side of it the
  // viewport has more room, and only overlaps the grid when neither side can
  // take it.
  const [inspectorBox, setInspectorBox] = useState<InspectorBox | null>(null)
  const inspectorOpen = matrix.inspectorOpen && matrix.selectedCohort.length > 0
  useLayoutEffect(() => {
    // A closed inspector keeps its last box rather than clearing it, which
    // saves a render; nothing reads it while closed, and reopening remeasures
    // synchronously below before the browser paints.
    if (!inspectorOpen) {
      return
    }
    const measure = () => {
      const host =
        bodyRef.current?.closest<HTMLElement>('.ws-panel') ?? bodyRef.current
      if (!host) {
        return
      }
      const rect = host.getBoundingClientRect()
      const roomRight = window.innerWidth - rect.right
      const roomLeft = rect.left
      const side = roomRight >= roomLeft ? 'right' : 'left'
      const preferred =
        side === 'right'
          ? rect.right + INSPECTOR_GAP_PX
          : rect.left - INSPECTOR_GAP_PX - INSPECTOR_WIDTH_PX
      const left = Math.min(
        window.innerWidth - INSPECTOR_GAP_PX - INSPECTOR_WIDTH_PX,
        Math.max(INSPECTOR_GAP_PX, preferred),
      )
      const top = Math.max(INSPECTOR_GAP_PX, rect.top)
      const height = Math.max(
        120,
        Math.min(rect.height, window.innerHeight - top - INSPECTOR_GAP_PX),
      )
      setInspectorBox({ left, top, height, side })
    }
    measure()
    window.addEventListener('resize', measure)
    // Capture phase: the widget sits inside the canvas's own scrollers.
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [inspectorOpen, matrix.selected])

  // Escape backs out of a cohort entirely. While the inspector is up it owns
  // the key, because it has its own layers to unwind first; this covers a lit
  // cell whose inspector has already been dismissed, including an empty cell
  // that never opened one.
  const { selected, clearSelection } = matrix
  useEffect(() => {
    if (!selected || inspectorOpen) {
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      clearSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, inspectorOpen, clearSelection])

  // A tile click in the Sequencer lights a cell here; bring it into view so the
  // cohort it names is actually on screen.
  useLayoutEffect(() => {
    if (!matrix.focusDriven || !matrix.selected || !scrollRef.current) {
      return
    }
    const cell = selectedCellRef.current
    // jsdom has no layout, so it does not implement scrollIntoView.
    if (typeof cell?.scrollIntoView !== 'function') {
      return
    }
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [matrix.focusDriven, matrix.selected])

  // Crate bar editing state. Only one inline affordance is open at a time.
  // The inputs are uncontrolled and commit on blur (Enter just blurs, Escape
  // unmounts before blur can fire), matching the Sequencer lane rename.
  const [addingCrate, setAddingCrate] = useState(false)
  const [renamingCrate, setRenamingCrate] = useState(false)
  const [confirmingCrateDelete, setConfirmingCrateDelete] = useState(false)
  const [dragOverCrateId, setDragOverCrateId] = useState<number | null>(null)
  const [dragOverBody, setDragOverBody] = useState(false)

  // The whole grid takes drops for the crate it is showing, not just the pill
  // that names it: an 18px pill is a poor target for a drag that came from
  // another widget, and the cohort a track lands in is derived from its key
  // and BPM anyway. The global crate has nothing to file into, so it takes
  // no drops.
  const crateForBodyDrop =
    activeCrate && onAddTrackToCrate ? activeCrate.id : null

  const showCrateBar = crates !== undefined || !!onCreateCrate

  const selectCrate = (crateId: number | null) => {
    setActiveCrateId(crateId)
    setRenamingCrate(false)
    setConfirmingCrateDelete(false)
  }

  const commitCreateCrate = async (raw: string) => {
    const name = raw.trim()
    setAddingCrate(false)
    if (!name || !onCreateCrate) {
      return
    }
    const created = await onCreateCrate(name)
    if (created) {
      setActiveCrateId(created.id)
    }
  }

  const commitRenameCrate = (raw: string) => {
    const name = raw.trim()
    setRenamingCrate(false)
    if (name && activeCrate && name !== activeCrate.name) {
      onRenameCrate?.(activeCrate.id, name)
    }
  }

  const cellStyle = {
    width: CELL_WIDTH_PX,
    height: CELL_HEIGHT_PX,
  }

  // `inspectorOpen` here, not `matrix.inspectorOpen`: a cell whose cohort came
  // out empty shows no panel, so it keeps its tooltip.
  const hoveringExpanded =
    inspectorOpen &&
    !!matrix.selected &&
    !!matrix.hover &&
    matrix.hover.r === matrix.selected.r &&
    matrix.hover.c === matrix.selected.c

  return (
    <div
      className={`xm-body${dragOverBody ? ' xm-body--drop' : ''}`}
      ref={bodyRef}
      onDragOver={(e) => {
        if (crateForBodyDrop === null || !dragCarriesTrack(e.dataTransfer)) {
          return
        }
        e.preventDefault()
        setDragOverBody(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverBody(false)
        }
      }}
      onDrop={(e) => {
        setDragOverBody(false)
        if (crateForBodyDrop === null || !onAddTrackToCrate) {
          return
        }
        const trackIds = readDraggedTrackIds(e.dataTransfer)
        if (trackIds.length === 0) {
          return
        }
        e.preventDefault()
        void dropTracksInOrder(trackIds, (trackId) =>
          onAddTrackToCrate(crateForBodyDrop, trackId),
        )
      }}
    >
      <div className="xm-scroll" ref={scrollRef}>
        {showCrateBar && (
          <div className="xm-crates" role="tablist" aria-label="Crates">
            <button
              className={
                activeCrate ? 'xm-crate' : 'xm-crate xm-crate--on'
              }
              role="tab"
              aria-selected={!activeCrate}
              onClick={() => selectCrate(null)}
            >
              All
            </button>
            {(crates ?? []).map((crate) => {
              const isActive = activeCrate?.id === crate.id
              if (isActive && renamingCrate) {
                return (
                  <input
                    key={crate.id}
                    className="xm-crate-input"
                    aria-label={`Rename crate ${crate.name}`}
                    defaultValue={crate.name}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        setRenamingCrate(false)
                      }
                    }}
                    onBlur={(e) => commitRenameCrate(e.target.value)}
                  />
                )
              }
              return (
                <button
                  key={crate.id}
                  className={[
                    'xm-crate',
                    isActive ? 'xm-crate--on' : '',
                    dragOverCrateId === crate.id ? 'xm-crate--drop' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Crate ${crate.name}`}
                  onClick={() => selectCrate(crate.id)}
                  onDoubleClick={() => {
                    if (onRenameCrate) {
                      selectCrate(crate.id)
                      setRenamingCrate(true)
                    }
                  }}
                  onDragOver={(e) => {
                    if (onAddTrackToCrate && dragCarriesTrack(e.dataTransfer)) {
                      e.preventDefault()
                      setDragOverCrateId(crate.id)
                    }
                  }}
                  onDragLeave={() =>
                    setDragOverCrateId((id) => (id === crate.id ? null : id))
                  }
                  onDrop={(e) => {
                    setDragOverCrateId(null)
                    if (!onAddTrackToCrate) {
                      return
                    }
                    const trackIds = readDraggedTrackIds(e.dataTransfer)
                    if (trackIds.length > 0) {
                      e.preventDefault()
                      e.stopPropagation()
                      void dropTracksInOrder(trackIds, (trackId) =>
                        onAddTrackToCrate(crate.id, trackId),
                      )
                    }
                  }}
                >
                  {crate.name}
                </button>
              )
            })}
            {onCreateCrate &&
              (addingCrate ? (
                <input
                  className="xm-crate-input"
                  aria-label="New crate name"
                  autoFocus
                  placeholder="Crate name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      setAddingCrate(false)
                    }
                  }}
                  onBlur={(e) => void commitCreateCrate(e.target.value)}
                />
              ) : (
                <button
                  className="xm-crate xm-crate--add"
                  aria-label="New crate"
                  title="New crate"
                  onClick={() => {
                    setRenamingCrate(false)
                    setAddingCrate(true)
                  }}
                >
                  +
                </button>
              ))}
            {activeCrate && !renamingCrate && !confirmingCrateDelete && (
              <span className="xm-crate-tools">
                {onRenameCrate && (
                  <button
                    className="ws-pill"
                    aria-label={`Rename crate ${activeCrate.name}`}
                    onClick={() => setRenamingCrate(true)}
                  >
                    Rename
                  </button>
                )}
                {onDeleteCrate && (
                  <button
                    className="ws-pill"
                    aria-label={`Delete crate ${activeCrate.name}`}
                    onClick={() => setConfirmingCrateDelete(true)}
                  >
                    Delete
                  </button>
                )}
              </span>
            )}
            {activeCrate && confirmingCrateDelete && (
              <span className="xm-crate-tools">
                <span className="xm-confirm">Delete crate?</span>
                <button
                  className="ws-pill"
                  aria-label="Confirm crate delete"
                  onClick={() => {
                    setConfirmingCrateDelete(false)
                    onDeleteCrate?.(activeCrate.id)
                    setActiveCrateId(null)
                  }}
                >
                  Confirm
                </button>
                <button
                  className="ws-pill"
                  aria-label="Cancel crate delete"
                  onClick={() => setConfirmingCrateDelete(false)}
                >
                  Cancel
                </button>
              </span>
            )}
          </div>
        )}
        {/* No legend: the relation colours read on their own, and the row
            it occupied is vertical space the matrix needs more. */}
        {matrix.selected && (
          <div className="xm-toolbar">
            <button className="ws-pill" onClick={matrix.clearSelection}>
              Clear selection
            </button>
          </div>
        )}
        {tracks.length === 0 ? (
          <p className="table-status">
            No tracks in the library yet — ingest tracks to build cohorts.
          </p>
        ) : activeCrate && visibleTracks.length === 0 ? (
          <p className="table-status">
            Crate is empty — drop tracks on its pill or add them from the All
            crate.
          </p>
        ) : null}
        <div className="xm-col-heads" style={{ gap: CELL_GAP_PX }}>
          {matrix.rows.map((code, r) => (
            <span
              key={code}
              className={
                matrix.selected?.r === r ? 'xm-head xm-head--on' : 'xm-head'
              }
              style={{ width: CELL_WIDTH_PX }}
            >
              {code}
            </span>
          ))}
        </div>
        {Array.from({ length: matrix.cols }, (_, c) => (
          <div key={c} className="xm-row" style={{ gap: CELL_GAP_PX }}>
            <span
              className={
                matrix.selected?.c === c
                  ? 'xm-row-head xm-row-head--on'
                  : 'xm-row-head'
              }
            >
              {Math.round(bucketLoBpm(c))}
            </span>
            {matrix.rows.map((code, r) => {
              const count = matrix.cohort(r, c).length
              const isSelected =
                !!matrix.selected &&
                matrix.selected.r === r &&
                matrix.selected.c === c
              const relation = matrix.relationTo(r, c)
              const style: React.CSSProperties = { ...cellStyle }
              if (relation && relation.p >= 0) {
                const paint = harmonyPaint(relation.p)
                style.backgroundColor = `hsla(${paint.hue},${paint.sat}%,${paint.light}%,${paint.a})`
                style.border = `1px ${relation.borderStyle} hsla(${paint.hue},${paint.sat}%,68%,.92)`
                style.color = relation.p === 0 ? '#fff4f0' : '#0d1206'
              }
              return (
                <button
                  key={code}
                  ref={isSelected ? selectedCellRef : undefined}
                  className={[
                    'xm-cell',
                    count ? `xm-cell--n${Math.min(count, 4)}` : '',
                    isSelected ? 'xm-cell--sel' : '',
                    relation && relation.p < 0 ? 'xm-cell--dim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={style}
                  aria-label={`bucket ${c + 1} ${code}, ${count} tracks`}
                  aria-pressed={isSelected}
                  onClick={() => matrix.selectCell(r, c)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    matrix.setHover({
                      r,
                      c,
                      rect: { l: rect.left, r: rect.right, t: rect.top },
                    })
                  }}
                  onMouseLeave={() =>
                    matrix.setHover((h) =>
                      h && h.r === r && h.c === c ? null : h,
                    )
                  }
                >
                  {count || ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {inspectorOpen && matrix.selected && inspectorBox && (
        <ExplorerInspector
          row={matrix.selected.r}
          range={matrix.bucketRange(matrix.selected.c)}
          cohort={matrix.selectedCohort}
          box={inspectorBox}
          onClose={matrix.closeInspector}
          onEscape={matrix.clearSelection}
          // Filing into another crate works from any cohort, including one
          // already scoped to a crate; the inspector drops the current one
          // from the menu.
          crates={crates}
          onAddToCrate={onAddTrackToCrate}
          crateName={activeCrate?.name}
          activeCrateId={activeCrate?.id ?? null}
          onRemoveFromCrate={
            activeCrate && onRemoveFromCrate
              ? (trackId) => onRemoveFromCrate(activeCrate.id, trackId)
              : undefined
          }
        />
      )}

      {/* The expanded panel already lists this cohort in full, and the tooltip
          would sit over the grid it was summoned from. Every other cell keeps
          its tooltip, which is what reads the relation against the expanded
          one. */}
      {matrix.hover && !hoveringExpanded && (
        <ExplorerTooltip
          hover={matrix.hover}
          range={matrix.bucketRange(matrix.hover.c)}
          cohortCount={matrix.cohort(matrix.hover.r, matrix.hover.c).length}
          relation={matrix.relationTo(matrix.hover.r, matrix.hover.c)}
          viewportWidth={window.innerWidth}
          viewportHeight={window.innerHeight}
        />
      )}
    </div>
  )
}
