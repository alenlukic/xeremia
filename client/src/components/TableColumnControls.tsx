import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ColumnRegistryEntry } from '../tablePreferences'

interface Props {
  label: string
  inactiveColumns: ColumnRegistryEntry[]
  onRemove: () => void
  onInsertAfter: (columnId: string) => void
  children?: React.ReactNode
  /**
   * Suppress the inline rightmost-column `+` insert affordance. Tables that
   * render the out-of-column {@link ColumnInsertRail} pass this so the `+`
   * never overlaps the rightmost column's resize handle.
   */
  hideInsert?: boolean
}

function useIsRightmostColumn(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
) {
  const [isRightmost, setIsRightmost] = useState(true)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) {
      return
    }
    const th = el.closest('th')
    const row = th?.parentElement
    if (!th || !row) {
      queueMicrotask(() => setIsRightmost(true))
      return
    }
    const update = () => {
      setIsRightmost(row.lastElementChild === th)
    }
    queueMicrotask(update)
    const observer = new MutationObserver(update)
    observer.observe(row, { childList: true })
    return () => observer.disconnect()
  }, [wrapperRef])

  return isRightmost
}

export function TableColumnControls({
  label,
  inactiveColumns,
  onRemove,
  onInsertAfter,
  children,
  hideInsert = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isRightmost = useIsRightmostColumn(wrapperRef) && !hideInsert
  const insertMenuOpen = menuOpen && isRightmost

  useEffect(() => {
    if (!insertMenuOpen) {
      return
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    function handlePointerDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [insertMenuOpen])

  const handleInsert = useCallback(
    (id: string) => {
      onInsertAfter(id)
      setMenuOpen(false)
    },
    [onInsertAfter],
  )

  return (
    <div className="table-col-controls" ref={wrapperRef}>
      <span className="table-col-label">{children ?? label}</span>
      <button
        type="button"
        className="table-col-remove"
        aria-label={`Remove ${label} column`}
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        ×
      </button>
      {isRightmost ? (
        <div className="table-col-insert-zone">
          <button
            type="button"
            className="table-col-insert-btn"
            aria-label={`Add column after ${label}`}
            aria-expanded={insertMenuOpen}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((prev) => !prev)
            }}
          >
            +
          </button>
          {insertMenuOpen && inactiveColumns.length > 0 && (
            <div className="table-col-insert-menu" role="menu">
              {inactiveColumns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  role="menuitem"
                  className="table-col-insert-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInsert(col.id)
                  }}
                >
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

interface EmptyRecoveryProps {
  inactiveColumns: ColumnRegistryEntry[]
  onInsert: (columnId: string) => void
}

export function TableColumnEmptyRecovery({
  inactiveColumns,
  onInsert,
}: EmptyRecoveryProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  if (inactiveColumns.length === 0) {
    return (
      <p className="table-empty-columns">
        No columns visible. Restore columns in Admin Preferences.
      </p>
    )
  }

  return (
    <div className="table-empty-columns" ref={ref}>
      <button
        type="button"
        className="table-col-recovery-btn"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Add column
      </button>
      {open && (
        <div
          className="table-col-insert-menu table-col-recovery-menu"
          role="menu"
        >
          {inactiveColumns.map((col) => (
            <button
              key={col.id}
              type="button"
              role="menuitem"
              className="table-col-insert-item"
              onClick={() => {
                onInsert(col.id)
                setOpen(false)
              }}
            >
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
