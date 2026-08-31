import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FloatingSurface } from './FloatingSurface'
import { useNavBarHold } from '../hooks/useNavBarHold'

// The one dropdown every picker in the shell is built from: a pill trigger that
// opens an anchored menu of items. Items carry their own capabilities, so the
// same component serves a list that can only be picked from and one whose
// entries can be renamed and deleted.
//
// Editing an item is reachable two ways, matching the rest of the workspace:
// right-click opens a small Rename/Delete menu beside the row, and a
// double-click goes straight to the rename input. Both are offered only where
// the item declares support for them.

/**
 * How long the menu stays open after picking a renameable row. A second click
 * inside this window is a double-click and opens the rename, which needs the
 * row still on screen to land on. Only the dismissal waits: the selection
 * itself commits on the first click, so picking never feels held back.
 */
const DOUBLE_CLICK_MS = 220

export interface DropdownItem {
  id: string
  label: string
  /**
   * Seed for the rename input when the row label is decorated with something
   * that is not part of the name, e.g. a set's track counts. Defaults to
   * `label`.
   */
  renameValue?: string
  /** Offer rename via right-click and double-click. */
  canRename?: boolean
  canDelete?: boolean
}

interface Props {
  /** Text on the closed trigger. */
  value: string
  ariaLabel: string
  items: DropdownItem[]
  selectedId?: string | null
  onSelect: (id: string) => void
  onRename?: (id: string, name: string) => void
  onDelete?: (id: string) => void
  /** Rows appended under a separator; `close` shuts the whole menu. */
  footer?: (close: () => void) => ReactNode
  /** Reason the draft name cannot be used, shown under the rename input. */
  validateName?: (id: string, name: string) => string | null
  /**
   * Shown in the right-click menu of a row that supports neither action. The
   * menu still opens: silently doing nothing is indistinguishable from the
   * feature being broken, which is exactly how it was read.
   */
  lockedLabel?: string
  /** Shown in place of the item list when there are no items. */
  emptyLabel?: string
}

export function Dropdown({
  value,
  ariaLabel,
  items,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  footer,
  validateName,
  lockedLabel = 'No actions for this item',
  emptyLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  // Item whose right-click menu is showing; at most one at a time.
  const [contextId, setContextId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Row clicked but not yet committed, lit as selected so the held commit
  // reads as instant.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  // The row the context menu hangs off. Written before the state flip so the
  // first measured layout already knows where to sit.
  const contextAnchorRef = useRef<HTMLElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)

  // An open menu pins the auto-hiding nav bar, so reaching for it does not
  // dismiss the bar it belongs to.
  useNavBarHold(open)

  const closeContext = useCallback(() => {
    setContextId(null)
    setConfirmDeleteId(null)
  }, [])

  const cancelPendingSelect = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setPendingId(null)
  }, [])

  useEffect(() => cancelPendingSelect, [cancelPendingSelect])

  const close = useCallback(() => {
    setOpen(false)
    setRenamingId(null)
    closeContext()
  }, [closeContext])

  const beginRename = useCallback(
    (item: DropdownItem) => {
      cancelPendingSelect()
      closeContext()
      setRenamingId(item.id)
      setDraft(item.renameValue ?? item.label)
    },
    [cancelPendingSelect, closeContext],
  )

  // Every row commits on the first click. A renameable one then holds the menu
  // open for the double-click window, so a second click can still reach the row
  // and open the rename; `beginRename` cancels the pending dismissal.
  const selectItem = useCallback(
    (item: DropdownItem) => {
      onSelect(item.id)
      if (!onRename || !item.canRename) {
        close()
        return
      }
      cancelPendingSelect()
      setPendingId(item.id)
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        setPendingId(null)
        close()
      }, DOUBLE_CLICK_MS)
    },
    [cancelPendingSelect, close, onRename, onSelect],
  )

  // The menu and the context menu both portal to <body>, so neither is inside
  // the trigger's subtree and the shared outside-click hook cannot cover both.
  useEffect(() => {
    if (!open) {
      return
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current?.contains(target) ||
        menuRef.current?.contains(target) ||
        contextMenuRef.current?.contains(target)
      ) {
        return
      }
      close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, close])

  // Escape unwinds one layer at a time: context menu, then rename, then the
  // menu itself — so it never discards more than the user asked it to.
  useEffect(() => {
    if (!open) {
      return
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') {
        return
      }
      e.preventDefault()
      if (contextId !== null) {
        closeContext()
      } else if (renamingId !== null) {
        setRenamingId(null)
      } else {
        close()
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, contextId, renamingId, close, closeContext])

  const trimmed = draft.trim()
  const renameError =
    renamingId !== null && validateName ? validateName(renamingId, trimmed) : null
  const renameTarget = items.find((item) => item.id === renamingId) ?? null
  const renameOriginal = renameTarget
    ? (renameTarget.renameValue ?? renameTarget.label)
    : null
  const canSubmitRename =
    trimmed.length > 0 && !renameError && trimmed !== renameOriginal

  const submitRename = () => {
    if (renamingId === null || !canSubmitRename) {
      return
    }
    onRename?.(renamingId, trimmed)
    setRenamingId(null)
    setOpen(false)
  }

  const contextItem = items.find((item) => item.id === contextId) ?? null
  const showRenameAction = !!onRename && !!contextItem?.canRename
  const showDeleteAction = !!onDelete && !!contextItem?.canDelete

  return (
    <div className="ws-picker" ref={ref}>
      <button
        ref={triggerRef}
        className={`ws-pill ws-picker-button${open ? ' ws-pill--on' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close()
          } else {
            setOpen(true)
          }
        }}
      >
        <span className="ws-picker-value">{value}</span>
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
          ariaLabel={ariaLabel}
        >
          {items.length === 0 && emptyLabel && (
            <span className="ws-picker-empty">{emptyLabel}</span>
          )}
          {items.map((item) => {
            if (renamingId === item.id) {
              return (
                <form
                  key={item.id}
                  className="ws-picker-name-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitRename()
                  }}
                >
                  <input
                    className="ws-picker-name-input"
                    aria-label={`Rename ${item.label}`}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setRenamingId(null)
                      }
                    }}
                  />
                  {renameError && (
                    <span className="ws-picker-name-error">{renameError}</span>
                  )}
                  <div className="ws-picker-name-actions">
                    <button
                      className="ws-picker-name-cancel"
                      type="button"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="ws-picker-name-save"
                      type="submit"
                      disabled={!canSubmitRename}
                    >
                      Save
                    </button>
                  </div>
                </form>
              )
            }
            return (
              <button
                key={item.id}
                className={`ws-picker-item${
                  item.id === selectedId || item.id === pendingId
                    ? ' ws-picker-item--on'
                    : ''
                }`}
                role="menuitemradio"
                aria-checked={item.id === selectedId}
                onClick={() => selectItem(item)}
                onDoubleClick={(event) => {
                  if (!onRename || !item.canRename) {
                    return
                  }
                  event.preventDefault()
                  event.stopPropagation()
                  beginRename(item)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  cancelPendingSelect()
                  contextAnchorRef.current = event.currentTarget
                  setConfirmDeleteId(null)
                  setContextId(item.id)
                }}
              >
                {item.label}
              </button>
            )
          })}
          {footer && (
            <>
              <span className="ws-picker-sep" role="separator" />
              {footer(close)}
            </>
          )}
        </FloatingSurface>
      )}
      {open && contextItem && (
        <FloatingSurface
          anchorRef={contextAnchorRef}
          floatingRef={contextMenuRef}
          align="left"
          className="ws-picker-menu ws-picker-context"
          role="menu"
          ariaLabel={`Actions for ${contextItem.label}`}
        >
          {confirmDeleteId === contextItem.id ? (
            <>
              <span className="ws-picker-confirm">Delete {contextItem.label}?</span>
              <button
                className="ws-picker-item ws-picker-item--danger"
                role="menuitem"
                onClick={() => {
                  const id = contextItem.id
                  closeContext()
                  onDelete?.(id)
                }}
              >
                Confirm delete
              </button>
              <button
                className="ws-picker-item"
                role="menuitem"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {showRenameAction && (
                <button
                  className="ws-picker-item"
                  role="menuitem"
                  onClick={() => beginRename(contextItem)}
                >
                  Rename
                </button>
              )}
              {showDeleteAction && (
                <button
                  className="ws-picker-item ws-picker-item--danger"
                  role="menuitem"
                  onClick={() => setConfirmDeleteId(contextItem.id)}
                >
                  Delete
                </button>
              )}
              {!showRenameAction && !showDeleteAction && (
                <span className="ws-picker-note">{lockedLabel}</span>
              )}
            </>
          )}
        </FloatingSurface>
      )}
    </div>
  )
}
