import { useState } from 'react'
import { Dropdown } from './Dropdown'
import type { DropdownItem } from './Dropdown'
import {
  CUSTOM_PRESET,
  hasDuplicatePresetName,
  isReservedPresetName,
} from '../utils/workspaceGeometry'

/**
 * Row id for the arrangement on screen when it matches no saved layout. It is
 * not a stored preset — the pill just calls it "Custom" — so it is listed only
 * while it is what you are looking at, and renaming it means saving it.
 */
const UNSAVED_ID = '\u0000unsaved'

// The header's layout control: one pill showing the active preset that opens a
// menu of every preset. Built on the shared Dropdown, so it looks and behaves
// exactly like the set picker beside it — including right-click Rename/Delete
// and double-click-to-rename on the saved layouts.

interface Props {
  preset: string
  presetNames: string[]
  onSelect: (name: string) => void
  onSaveCustom: (name: string, from?: string) => void
  onRename: (name: string, from?: string) => void
  onDelete: (name: string) => void
  /** Built-ins the user removed; drives the restore row. */
  hiddenPresets?: string[]
  onRestoreBuiltIns?: () => void
}

export function LayoutPicker({
  preset,
  presetNames,
  onSelect,
  onSaveCustom,
  onRename,
  onDelete,
  hiddenPresets = [],
  onRestoreBuiltIns,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  // '' means the arrangement on screen; otherwise the layout to branch off.
  const [copyFrom, setCopyFrom] = useState('')

  // Every layout can be renamed and deleted, built-ins included. A built-in is
  // regenerated from fractions rather than stored, so renaming one saves its
  // arrangement under the new name and deleting one hides it — both reversible
  // through the restore row below.
  const unsaved = preset === CUSTOM_PRESET
  const items: DropdownItem[] = [
    ...(unsaved
      ? [
          {
            id: UNSAVED_ID,
            label: `${CUSTOM_PRESET} (unsaved)`,
            renameValue: '',
            canRename: true,
            canDelete: false,
          },
        ]
      : []),
    ...presetNames.map((name) => ({
      id: name,
      label: name,
      canRename: true,
      canDelete: true,
    })),
  ]

  const validateName = (id: string, name: string) => {
    if (isReservedPresetName(name)) {
      return 'Choose a different name'
    }
    if (hasDuplicatePresetName(presetNames, name, id)) {
      return 'Name already exists'
    }
    return null
  }

  // Naming the unsaved arrangement is saving it; every other row is a move.
  const handleRename = (id: string, name: string) => {
    if (id === UNSAVED_ID) {
      onSaveCustom(name)
      return
    }
    onRename(name, id)
  }

  const trimmed = draft.trim()
  const createError = trimmed ? validateName('', trimmed) : null
  const canCreate = trimmed.length > 0 && !createError

  const cancelCreate = () => {
    setCreating(false)
    setDraft('')
    setCopyFrom('')
  }

  return (
    <Dropdown
      value={preset}
      ariaLabel="Layout preset"
      items={items}
      selectedId={unsaved ? UNSAVED_ID : preset}
      onSelect={(id) => {
        if (id !== UNSAVED_ID) {
          onSelect(id)
        }
      }}
      onRename={handleRename}
      onDelete={onDelete}
      validateName={validateName}
      lockedLabel="This arrangement is not saved yet — rename it to save it"
      footer={(close) =>
        creating ? (
          <form
            className="ws-picker-name-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canCreate) {
                return
              }
              onSaveCustom(trimmed, copyFrom || undefined)
              cancelCreate()
              close()
            }}
          >
            <input
              className="ws-picker-name-input"
              aria-label="New layout name"
              placeholder="Layout name"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelCreate()
                }
              }}
            />
            {createError && (
              <span className="ws-picker-name-error">{createError}</span>
            )}
            {/* Editing a layout now saves that layout, so branching off one is
                an explicit choice rather than something an edit does for you. */}
            <label className="ws-picker-copy-from">
              Copy from
              <select
                aria-label="Copy layout from"
                value={copyFrom}
                onChange={(event) => setCopyFrom(event.target.value)}
              >
                <option value="">Current arrangement</option>
                {presetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="ws-picker-name-actions">
              <button
                className="ws-picker-name-cancel"
                type="button"
                onClick={cancelCreate}
              >
                Cancel
              </button>
              <button
                className="ws-picker-name-save"
                type="submit"
                disabled={!canCreate}
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              className="ws-picker-item"
              role="menuitem"
              onClick={() => {
                setDraft('')
                setCreating(true)
              }}
            >
              New layout…
            </button>
            {hiddenPresets.length > 0 && onRestoreBuiltIns && (
              <button
                className="ws-picker-item"
                role="menuitem"
                onClick={() => {
                  onRestoreBuiltIns()
                  close()
                }}
              >
                Restore built-in layouts ({hiddenPresets.length})
              </button>
            )}
          </>
        )
      }
    />
  )
}
