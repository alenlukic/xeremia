import { useRef, useState } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { CUSTOM_PRESET } from '../hooks/useWorkspaceLayout'

// The header's layout control: one pill showing the active preset that opens a
// menu of every preset. Replaces the row of pills, which grew unreadable once
// saved presets joined the built-in ones.

interface Props {
  preset: string
  presetNames: string[]
  dirty: boolean
  onSelect: (name: string) => void
  onSaveCustom: () => void
}

export function LayoutPicker({
  preset,
  presetNames,
  dirty,
  onSelect,
  onSaveCustom,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useDismissOnOutsideClick(ref, open, () => setOpen(false))

  return (
    <div className="ws-picker" ref={ref}>
      <button
        className={`ws-pill ws-picker-button${open ? ' ws-pill--on' : ''}`}
        aria-label="Layout preset"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
          {dirty && (
            <>
              <span className="ws-picker-sep" role="separator" />
              <button
                className="ws-picker-item"
                role="menuitem"
                onClick={() => {
                  onSaveCustom()
                  setOpen(false)
                }}
              >
                Save {CUSTOM_PRESET} as preset…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
