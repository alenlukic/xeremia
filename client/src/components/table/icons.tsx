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

/** Six dots — the drag grip on a workspace widget. */
export function GripIcon({ size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="3.5" r="1.25" />
      <circle cx="10" cy="3.5" r="1.25" />
      <circle cx="6" cy="8" r="1.25" />
      <circle cx="10" cy="8" r="1.25" />
      <circle cx="6" cy="12.5" r="1.25" />
      <circle cx="10" cy="12.5" r="1.25" />
    </svg>
  )
}

/** Up arrow — promote a benched block into the committed lane. */
export function PromoteIcon({ size = 13 }: IconProps) {
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
        d="M8 13V3.6M8 3.6 4.4 7.2M8 3.6l3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Push pin — fixes a freely positioned sequencer tile in place. */
export function PinIcon({
  size = 13,
  pinned = false,
}: IconProps & { pinned?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={pinned ? 'currentColor' : 'none'}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m5.1 2.7 6.2 6.2-1.7.5-1.8 1.8-.4 2-4.6-4.6 2-.4 1.8-1.8.5-1.7-2-2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="m5.1 10.9-2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.25"
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

/** Outward arrows to a right edge — "widen by one column". */
export function WidenIcon({ size = 13 }: IconProps) {
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
        d="M6.6 4.4 3.2 8l3.4 3.6M13 3.2v9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.4 8H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Inward arrow from a right edge — "narrow by one column". */
export function NarrowIcon({ size = 13 }: IconProps) {
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
        d="M3.4 4.4 6.8 8l-3.4 3.6M13 3.2v9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 8h3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Padlock — closed pins a widget's width, open leaves it free. */
export function LockIcon({
  size = 13,
  open = false,
}: IconProps & { open?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.2"
        y="7.2"
        width="9.6"
        height="6.4"
        rx="1.3"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d={
          open
            ? 'M5.6 7.2V5.2a2.4 2.4 0 0 1 4.8-.3'
            : 'M5.6 7.2V5.2a2.4 2.4 0 0 1 4.8 0v2'
        }
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
