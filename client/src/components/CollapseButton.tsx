export type CollapseOrientation = 'horizontal' | 'vertical'
export type CollapseDirection = 'up' | 'down' | 'left' | 'right'

interface Props {
  orientation: CollapseOrientation
  /** Thickness in px — height for horizontal buttons, width for vertical. */
  size: number
  /** Which way the chevron points (= the direction the content sweeps). */
  direction: CollapseDirection
  label: string
  onClick: () => void
  className?: string
}

export function CollapseButton({
  orientation,
  size,
  direction,
  label,
  onClick,
  className,
}: Props) {
  const style =
    orientation === 'horizontal'
      ? { height: size }
      : { width: size, minWidth: size }
  return (
    <button
      className={`collapse-btn${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {/* One CSS-drawn chevron rotated per direction, so paired buttons stay
          aligned instead of drifting on font glyph metrics. */}
      <span
        className={`collapse-btn-chevron collapse-btn-chevron--${direction}`}
        aria-hidden="true"
      />
    </button>
  )
}
