interface Props {
  label: string
  onRemove: () => void
  children?: React.ReactNode
}

/**
 * A column header's label plus a quick "remove column" affordance. Adding /
 * restoring columns is handled entirely from Admin → Preferences, so there is no
 * in-table add-column control (it interfered with column resizing and drag).
 */
export function TableColumnControls({ label, onRemove, children }: Props) {
  return (
    <div className="table-col-controls">
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
    </div>
  )
}

/** Shown when every column is hidden — restoring happens in Admin → Preferences. */
export function TableColumnEmptyRecovery() {
  return (
    <p className="table-empty-columns">
      No columns visible. Restore columns in Admin → Preferences.
    </p>
  )
}
