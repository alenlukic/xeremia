/** A min/max threshold on one numeric column, in the column's displayed scale. */
export interface NumericFilter {
  min?: number
  max?: number
}

export type FilterMap = Record<string, NumericFilter>

export interface FilterableColumn {
  id: string
  label: string
}

export function parseNum(val: string): number | undefined {
  if (val.trim() === '') {
    return undefined
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

export function filterLabel(label: string, f: NumericFilter): string {
  if (f.min != null && f.max != null) {
    return `${label}: ${f.min}–${f.max}`
  }
  if (f.min != null) {
    return `${label}: ≥ ${f.min}`
  }
  if (f.max != null) {
    return `${label}: ≤ ${f.max}`
  }
  return label
}

/** Whether a filter constrains anything (an all-empty filter is inert). */
export function isActiveFilter(
  f: NumericFilter | undefined,
): f is NumericFilter {
  return f != null && (f.min != null || f.max != null)
}

/** Does a numeric value pass the filter? Absent values fail an active filter. */
export function passesFilter(
  value: number | null | undefined,
  f: NumericFilter,
) {
  if (value == null) {
    return f.min == null && f.max == null
  }
  if (f.min != null && value < f.min) {
    return false
  }
  if (f.max != null && value > f.max) {
    return false
  }
  return true
}
