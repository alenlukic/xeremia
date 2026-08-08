import { useEffect, useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import {
  hasDuplicatePresetName,
  isReservedPresetName,
} from '../utils/workspaceGeometry'

// The header's layout control: one pill showing the active preset that opens a
// menu of every preset. Replaces the row of pills, which grew unreadable once
// saved presets joined the built-in ones.

interface Props {
  preset: string
  presetNames: string[]
  onSelect: (name: string) => void
  onSaveCustom: (name: string) => void
  onRename: (name: string) => void
}

export function LayoutPicker({
  preset,
  presetNames,
  onSelect,
  onSaveCustom,
  onRename,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'rename' | null>(null)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useDismissOnOutsideClick(ref, open, () => {
    setOpen(false)
    setMode(null)
    triggerRef.current?.focus()
  })

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      setOpen(false)
      setMode(null)
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const trimmed = draft.trim()
  const reserved = isReservedPresetName(trimmed)
  const duplicate = hasDuplicatePresetName(
    presetNames,
    trimmed,
    mode === 'rename' ? preset : undefined,
  )
  const canSubmit =
    trimmed.length > 0 &&
    !reserved &&
    !duplicate &&
    (mode !== 'rename' || trimmed !== preset)

  const beginName = (nextMode: 'create' | 'rename') => {
    setMode(nextMode)
    setDraft(nextMode === 'rename' ? preset : '')
  }

  const submitName = () => {
    if (!mode || !canSubmit) {
      return
    }
    if (mode === 'create') {
      onSaveCustom(trimmed)
    } else {
      onRename(trimmed)
    }
    setMode(null)
    setOpen(false)
  }

  return (
    <div className="ws-picker" ref={ref}>
      <button
        ref={triggerRef}
        className={`ws-pill ws-picker-button${open ? ' ws-pill--on' : ''}`}
        aria-label="Layout preset"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          setMode(null)
        }}
      >
        <span className="ws-picker-value">{preset}</span>
        <span className="ws-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="ws-picker-menu" role="menu">
          {presetNames.map((name) => (
            <button
              key={name}
              className={`ws-picker-item${name === preset ? ' ws-picker-item--on' : ''}`}
              role="menuitemradio"
              aria-checked={name === preset}
              onClick={() => {
                onSelect(name)
                setOpen(false)
              }}
            >
              {name}
            </button>
          ))}
          <span className="ws-picker-sep" role="separator" />
          {mode ? (
            <form
              className="ws-picker-name-form"
              onSubmit={(event) => {
                event.preventDefault()
                submitName()
              }}
            >
              <input
                className="ws-picker-name-input"
                aria-label={mode === 'create' ? 'New layout name' : 'Rename layout'}
                autoFocus
                value={draft}
                placeholder={mode === 'create' ? 'Layout name' : undefined}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setOpen(false)
                    setMode(null)
                    triggerRef.current?.focus()
                  }
                }}
              />
              {(duplicate || reserved) && (
                <span className="ws-picker-name-error">
                  {duplicate ? 'Name already exists' : 'Choose a different name'}
                </span>
              )}
              <div className="ws-picker-name-actions">
                <button
                  className="ws-picker-name-cancel"
                  type="button"
                  onClick={() => setMode(null)}
                >
                  Cancel
                </button>
                <button
                  className="ws-picker-name-save"
                  type="submit"
                  disabled={!canSubmit}
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
                onClick={() => beginName('create')}
              >
                New layout…
              </button>
              <button
                className="ws-picker-item"
                role="menuitem"
                onClick={() => beginName('rename')}
              >
                Rename layout…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
