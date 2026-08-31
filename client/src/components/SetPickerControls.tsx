import { useState, useRef, useEffect } from 'react'
import { Dropdown } from './Dropdown'
import type { DropdownItem } from './Dropdown'
import type { SetSummary } from '../types'
import type { PendingAdd } from '../hooks/useSetBuilder'

// The header's set control, built on the same Dropdown as the layout picker
// beside it. Sets can be renamed and deleted from the menu itself (right-click
// or double-click), so the standalone select, "+ New" and "×" buttons are gone.

interface Props {
  sets: SetSummary[]
  activeSetId: number | null
  pendingAdd: PendingAdd | null
  createSet: (name: string) => Promise<SetSummary | null>
  selectSet: (id: number) => void
  renameSet: (id: number, name: string) => void
  deleteSet: (id: number) => void
  resolvePendingAdd: (setId: number) => void
  clearPendingAdd: () => void
}

export function SetPickerControls({
  sets,
  activeSetId,
  pendingAdd,
  createSet,
  selectSet,
  renameSet,
  deleteSet,
  resolvePendingAdd,
  clearPendingAdd,
}: Props) {
  const [newSetName, setNewSetName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNewInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNewInput])

  // Open the new-set input when a pending add arrives with no active set.
  // Adjusting during render (rather than in an effect) avoids the cascading
  // render and the react-hooks/set-state-in-effect warning.
  const [prevPendingAdd, setPrevPendingAdd] = useState<
    PendingAdd | null | undefined
  >(undefined)
  if (pendingAdd !== prevPendingAdd) {
    setPrevPendingAdd(pendingAdd)
    if (pendingAdd && !activeSetId) {
      setShowNewInput(true)
    }
  }

  const handleCreateSet = async () => {
    const name = newSetName.trim()
    if (!name) {
      return
    }
    const result = await createSet(name)
    setNewSetName('')
    setShowNewInput(false)
    if (result && pendingAdd) {
      resolvePendingAdd(result.id)
    }
  }

  const handleCancelCreate = () => {
    setShowNewInput(false)
    setNewSetName('')
    clearPendingAdd()
  }

  const items: DropdownItem[] = sets.map((s) => ({
    id: String(s.id),
    label: `${s.name} (P:${s.pool_count} T:${s.tracklist_count})`,
    // The counts decorate the row but are not part of the name.
    renameValue: s.name,
    canRename: true,
    canDelete: true,
  }))

  const activeSet = sets.find((s) => s.id === activeSetId) ?? null

  const validateName = (id: string, name: string) =>
    sets.some((s) => String(s.id) !== id && s.name === name)
      ? 'Name already exists'
      : null

  return (
    <div className="set-picker-controls">
      <Dropdown
        value={activeSet ? activeSet.name : 'Select a set…'}
        ariaLabel="Set"
        items={items}
        selectedId={activeSetId === null ? null : String(activeSetId)}
        emptyLabel="No sets yet"
        onSelect={(id) => selectSet(Number(id))}
        onRename={(id, name) => renameSet(Number(id), name)}
        onDelete={(id) => deleteSet(Number(id))}
        validateName={validateName}
        footer={(close) => (
          <button
            className="ws-picker-item"
            role="menuitem"
            onClick={() => {
              close()
              setShowNewInput(true)
            }}
          >
            New set…
          </button>
        )}
      />

      {showNewInput && (
        <div className="set-new-input-row">
          {pendingAdd && (
            <span className="set-pending-hint">
              Create a set to add "{pendingAdd.title}" to {pendingAdd.type}
            </span>
          )}
          <input
            ref={inputRef}
            className="set-name-input"
            placeholder="Set name…"
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateSet()
              }
              if (e.key === 'Escape') {
                handleCancelCreate()
              }
            }}
          />
          <button className="set-create-confirm" onClick={handleCreateSet}>
            Create
          </button>
          <button className="set-action-btn" onClick={handleCancelCreate}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
