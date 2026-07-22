import { useState, useRef, useEffect } from 'react'
import type { SetSummary } from '../types'
import type { PendingAdd } from '../hooks/useSetBuilder'

interface Props {
  sets: SetSummary[]
  activeSetId: number | null
  pendingAdd: PendingAdd | null
  createSet: (name: string) => Promise<SetSummary | null>
  selectSet: (id: number) => void
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

  return (
    <div className="set-picker-controls">
      {activeSetId && (
        <button
          className="set-delete-btn"
          onClick={() => deleteSet(activeSetId)}
          title="Delete set"
        >
          ×
        </button>
      )}
      {sets.length > 0 && (
        <select
          className="set-select"
          value={activeSetId ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              return
            }
            const val = Number(e.target.value)
            if (Number.isInteger(val)) {
              selectSet(val)
            }
          }}
        >
          <option value="" disabled>
            Select a set…
          </option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (P:{s.pool_count} T:{s.tracklist_count})
            </option>
          ))}
        </select>
      )}
      <button className="set-create-btn" onClick={() => setShowNewInput(true)}>
        + New
      </button>

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
