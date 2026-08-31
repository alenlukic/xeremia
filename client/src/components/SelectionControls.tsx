import type { ReactNode } from 'react'
import type { MultiSelect } from '../hooks/useMultiSelect'
import type { BulkProgress } from '../hooks/useBulkAction'

// The two controls every track list shares: a checkmark in the widget header
// that selects or clears everything, and a bar naming the count alongside the
// actions that make sense for that list.

interface ToggleProps {
  selection: MultiSelect
  /** What is being selected, for the accessible name. */
  label: string
  disabled?: boolean
}

/**
 * Tri-state header checkmark: empty, a dash while part of the list is picked,
 * and a tick once all of it is. Clicking selects everything, or clears when
 * anything is already selected.
 */
export function SelectionToggle({ selection, label, disabled }: ToggleProps) {
  const state = selection.allSelected
    ? 'all'
    : selection.someSelected
      ? 'some'
      : 'none'
  return (
    <button
      type="button"
      className={`sel-toggle sel-toggle--${state}`}
      role="checkbox"
      aria-checked={
        selection.allSelected ? true : selection.someSelected ? 'mixed' : false
      }
      aria-label={
        selection.count > 0 ? `Clear selection in ${label}` : `Select all ${label}`
      }
      title={
        selection.count > 0 ? `Clear selection (${selection.count})` : 'Select all'
      }
      disabled={disabled}
      onClick={selection.toggleAll}
    >
      <span className="sel-toggle-box" aria-hidden="true">
        {state === 'all' ? '✓' : state === 'some' ? '–' : ''}
      </span>
    </button>
  )
}

interface BarProps {
  selection: MultiSelect
  /** Singular noun for the count, e.g. "track". */
  noun?: string
  /** In-flight bulk action, rendered in place of the actions. */
  progress?: BulkProgress | null
  /** Context actions; rendered after the count. */
  children?: ReactNode
}

/** Shown only while something is selected, directly above the list. */
export function SelectionBar({
  selection,
  noun = 'track',
  progress,
  children,
}: BarProps) {
  if (selection.count === 0) {
    return null
  }
  const plural = selection.count === 1 ? '' : 's'
  return (
    <div className="sel-bar" role="toolbar" aria-label="Selection actions">
      <span className="sel-bar-count">
        {selection.count} {noun}
        {plural} selected
      </span>
      {progress ? (
        <span className="sel-bar-progress" role="status" aria-live="polite">
          <span className="sel-bar-progress-label">
            {progress.label} {progress.done}/{progress.total}
          </span>
          <span className="sel-bar-progress-track" aria-hidden="true">
            <span
              className="sel-bar-progress-fill"
              style={{
                width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </span>
        </span>
      ) : (
        <div className="sel-bar-actions">{children}</div>
      )}
      <button
        type="button"
        className="sel-bar-clear"
        aria-label="Clear selection"
        disabled={!!progress}
        onClick={selection.clear}
      >
        ×
      </button>
    </div>
  )
}

interface ActionProps {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

/** One action in a {@link SelectionBar}, so they read alike everywhere. */
export function SelectionAction({
  label,
  onClick,
  danger,
  disabled,
}: ActionProps) {
  return (
    <button
      type="button"
      className={`sel-action${danger ? ' sel-action--danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
