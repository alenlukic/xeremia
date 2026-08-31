import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAMELOT_ROWS, keyDotColor } from '../utils/harmonic'
import { SearchIcon } from './table/icons'
import { PlayButton } from './PlayButton'
import type { ExplorerCrate, Track } from '../types'
import { writeTrackDrag } from '../utils'
import { displayTitle } from '../utils/trackTitle'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useBulkAction } from '../hooks/useBulkAction'
import { useSelectAllShortcut } from '../hooks/useSelectAllShortcut'
import { FloatingSurface } from './FloatingSurface'
import {
  SelectionAction,
  SelectionBar,
  SelectionToggle,
} from './SelectionControls'

// The overlay that lists a cohort's tracks. It is portalled to <body> and
// pinned beside the Explorer widget rather than drawn inside it, so opening a
// cohort never covers the neighbouring cells being compared against.

/** Fixed footprint; the caller decides which side of the grid it lands on. */
export const INSPECTOR_WIDTH_PX = 238

export interface InspectorBox {
  left: number
  top: number
  height: number
  side: 'left' | 'right'
}

interface Props {
  row: number
  range: [number, number]
  cohort: Track[]
  box: InspectorBox
  onClose: () => void
  /**
   * Escape's last step. Distinct from `onClose`: dismissing the panel with ×
   * keeps the cell lit for relation reading, whereas Escape backs all the way
   * out of the cohort.
   */
  onEscape: () => void
  /** Custom crates a card can file into. Menu hidden when absent or empty. */
  crates?: ExplorerCrate[]
  // Async so a bulk action reports each track as it actually lands.
  onAddToCrate?: (crateId: number, trackId: number) => void | Promise<unknown>
  /** Set when the inspector shows a custom crate's cohort. */
  crateName?: string
  /** Crate being shown, left out of the "add to" menu. */
  activeCrateId?: number | null
  onRemoveFromCrate?: (trackId: number) => void | Promise<unknown>
}

export function ExplorerInspector({
  row,
  range,
  cohort,
  box,
  onClose,
  onEscape,
  crates,
  onAddToCrate,
  crateName,
  activeCrateId,
  onRemoveFromCrate,
}: Props) {
  const code = CAMELOT_ROWS[row]
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Track id whose crate menu is open; one menu at a time.
  const [menuTrackId, setMenuTrackId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [bulkCrateOpen, setBulkCrateOpen] = useState(false)
  // Guarding the trigger as well as the menu: a mousedown on the open card's
  // own "+" would otherwise dismiss before its click could toggle, so the
  // button reopened the menu it had just closed.
  useDismissOnOutsideClick(
    menuTriggerRef,
    menuTrackId !== null,
    () => setMenuTrackId(null),
    menuRef,
  )

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Escape unwinds one layer at a time. Bound to the window rather than the
  // panel so it still closes the cohort after focus has moved into the grid.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      if (menuTrackId !== null) {
        setMenuTrackId(null)
      } else if (searching) {
        setSearching(false)
        setQuery('')
      } else {
        onEscape()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuTrackId, searching, onEscape])

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) {
      return cohort
    }
    return cohort.filter((t) =>
      displayTitle(t, t.id).toLocaleLowerCase().includes(needle),
    )
  }, [cohort, query])

  const selection = useMultiSelect(
    useMemo(() => visible.map((t) => t.id), [visible]),
  )
  useSelectAllShortcut(panelRef, selection.selectAll)
  const bulk = useBulkAction()

  // A crate cannot be filed into itself, so the one on screen is left out.
  const addableCrates = (crates ?? []).filter(
    (crate) => crate.id !== activeCrateId,
  )
  const crateMenu =
    onAddToCrate && addableCrates.length > 0
      ? { crates: addableCrates, onAddToCrate }
      : null

  return createPortal(
    <div
      ref={panelRef}
      className={`xm-inspector xm-inspector--${box.side}`}
      role="dialog"
      aria-label={`Cohort ${code}`}
      tabIndex={-1}
      style={{
        left: box.left,
        top: box.top,
        height: box.height,
        width: INSPECTOR_WIDTH_PX,
      }}
    >
      <div className="xm-inspector-head">
        {searching ? (
          <input
            className="xm-inspector-search"
            aria-label={`Filter cohort ${code}`}
            placeholder="Filter tracks…"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : (
          <div className="xm-inspector-title">
            <span
              className="key-dot"
              aria-hidden="true"
              style={{ background: keyDotColor(code) ?? 'transparent' }}
            />
            {code} · {range[0].toFixed(1)}–{range[1].toFixed(1)} BPM
            {crateName ? ` · ${crateName}` : ''}
          </div>
        )}
        <button
          className={`xm-inspector-search-btn${
            searching ? ' xm-inspector-search-btn--on' : ''
          }`}
          aria-label={searching ? 'Close filter' : 'Filter cohort'}
          aria-pressed={searching}
          title={searching ? 'Close filter' : 'Filter cohort'}
          onClick={() =>
            setSearching((open) => {
              if (open) {
                setQuery('')
              }
              return !open
            })
          }
        >
          <SearchIcon size={12} />
        </button>
        <SelectionToggle selection={selection} label="cohort" />
        <button
          className="xm-inspector-close"
          onClick={onClose}
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>
      <SelectionBar selection={selection} progress={bulk.progress}>
        {addableCrates.length > 0 && onAddToCrate && (
          <SelectionAction
            label="Add to crate…"
            disabled={bulk.running}
            onClick={() => setBulkCrateOpen((open) => !open)}
          />
        )}
        {onRemoveFromCrate && (
          <SelectionAction
            label="Remove from crate"
            danger
            disabled={bulk.running}
            onClick={() =>
              void bulk.run(
                'Removing',
                selection.orderedIds,
                onRemoveFromCrate,
                selection.clear,
              )
            }
          />
        )}
      </SelectionBar>
      {bulkCrateOpen && onAddToCrate && (
        <div className="xm-bulk-crates" role="group" aria-label="Add selection to crate">
          {addableCrates.map((crate) => (
            <button
              key={crate.id}
              className="sel-action"
              onClick={() => {
                setBulkCrateOpen(false)
                void bulk.run(
                  `Adding to ${crate.name}`,
                  selection.orderedIds,
                  (id) => onAddToCrate(crate.id, id),
                  selection.clear,
                )
              }}
            >
              {crate.name}
            </button>
          ))}
        </div>
      )}
      <div className="xm-inspector-tracks">
        {visible.length === 0 && (
          <p className="xm-inspector-empty">No tracks match.</p>
        )}
        {visible.map((t) => {
          const title = displayTitle(t, t.id)
          return (
            <div
              key={t.id}
              className={`xm-track-card${
                selection.isSelected(t.id) ? ' is-multi-selected' : ''
              }`}
              draggable
              onClick={(event) => {
                // Buttons inside the card own their own clicks.
                if ((event.target as HTMLElement).closest('button')) {
                  return
                }
                selection.select(t.id, event)
              }}
              onDragStart={(e) => {
                // Dragging a row that is part of the selection takes the whole
                // selection with it; dragging any other row takes just itself.
                const ids = selection.isSelected(t.id)
                  ? selection.orderedIds
                  : [t.id]
                writeTrackDrag(e.dataTransfer, t.id, ids)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              {/* Always in the flow, revealed on hover. Inserting it on hover
                  instead would shove the title sideways under the pointer. */}
              <PlayButton
                trackId={t.id}
                title={title}
                className="xm-card-play"
                variant="icon"
              />
              <span className="xm-track-card-label">{title}</span>
              {crateMenu && (
                <button
                  // Only the open card's trigger is tracked: the crate menu
                  // floats above the inspector's own scroller and anchors here.
                  ref={menuTrackId === t.id ? menuTriggerRef : undefined}
                  className="xm-card-action"
                  aria-label={`Add ${title} to a crate`}
                  aria-expanded={menuTrackId === t.id}
                  onClick={() =>
                    setMenuTrackId((open) => (open === t.id ? null : t.id))
                  }
                >
                  +
                </button>
              )}
              {onRemoveFromCrate && (
                <button
                  className="xm-card-action"
                  aria-label={`Remove ${title} from crate`}
                  onClick={() => onRemoveFromCrate(t.id)}
                >
                  ×
                </button>
              )}
              {crateMenu && menuTrackId === t.id && (
                <FloatingSurface
                  anchorRef={menuTriggerRef}
                  floatingRef={menuRef}
                  align="right"
                  className="xm-card-menu"
                  role="menu"
                  ariaLabel={`Crates for ${title}`}
                >
                  {crateMenu.crates.map((crate) => (
                    <button
                      key={crate.id}
                      className="xm-card-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuTrackId(null)
                        crateMenu.onAddToCrate(crate.id, t.id)
                      }}
                    >
                      {crate.name}
                    </button>
                  ))}
                </FloatingSurface>
              )}
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
