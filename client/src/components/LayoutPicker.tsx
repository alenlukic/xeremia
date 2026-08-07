import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { CUSTOM_PRESET } from '../hooks/useWorkspaceLayout'

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
  useDismissOnOutsideClick(ref, open, () => {
    setOpen(false)
    setMode(null)
  })

  const trimmed = draft.trim()
  const reserved =
    trimmed.toLocaleLowerCase() === CUSTOM_PRESET.toLocaleLowerCase()
  const duplicate = presetNames.some(
    (name) =>
      name.toLocaleLowerCase() === trimmed.toLocaleLowerCase() &&
      (mode !== 'rename' || name !== preset),
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
                    setMode(null)
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
