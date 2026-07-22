export interface ToggleOption {
  key: string
  label: string
  count?: number
}

interface Props {
  /** Persistent on/off filters, always visible in the control panel. */
  options: ToggleOption[]
  active: Set<string>
  onToggle: (key: string) => void
  ariaLabel: string
}

/**
 * A row of persistent on/off filter buttons (design-system control panel). Used
 * by the matches quadrant for Same/Higher/Lower; generic so other quadrants can
 * reuse it. Buttons stay visible whether on or off (unlike removable pills).
 */
export function ToggleFilterGroup({
  options,
  active,
  onToggle,
  ariaLabel,
}: Props) {
  return (
    <div className="ds-toggle-filters" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const on = active.has(opt.key)
        return (
          <button
            key={opt.key}
            type="button"
            className={`ds-toggle-filter${on ? ' ds-toggle-filter--on' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(opt.key)}
          >
            {opt.label}
            {opt.count != null && (
              <span className="ds-toggle-filter-count">{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
