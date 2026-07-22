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
