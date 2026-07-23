/**
 * Small inline icons for table chrome. They inherit `currentColor` and are
 * marked aria-hidden — the surrounding control supplies the accessible name.
 */

interface IconProps {
  size?: number
}

/** Descending bars — "add sort". */
export function SortIcon({ size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4h11M2.5 8h7M2.5 12h3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Sliders — "add score filter" (numeric range), distinct from the funnel. */
export function SlidersIcon({ size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4.5h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="6" cy="4.5" r="1.9" fill="currentColor" />
      <circle cx="10.5" cy="11.5" r="1.9" fill="currentColor" />
    </svg>
  )
}

/** Funnel — "add filter". */
export function FilterIcon({ size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 3.5h11L9.3 8.6v4.2l-2.6 1.2V8.6L2.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
