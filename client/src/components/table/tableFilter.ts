/** A min/max threshold on one numeric column, in the column's displayed scale. */
export interface NumericFilter {
  min?: number
  max?: number
}

/** A set of accepted values for one categorical column (e.g. key, genre). */
export interface SelectFilter {
  values: string[]
}

export type ColumnFilter = NumericFilter | SelectFilter

export type FilterMap = Record<string, ColumnFilter>

export type FilterKind = 'numeric' | 'select'

export interface FilterableColumn {
  id: string
  label: string
  /** Defaults to 'numeric' — the min/max range popover. */
  kind?: FilterKind
  /** Choices offered by a 'select' column, in display order. */
  options?: string[]
}

export function isSelectFilter(f: ColumnFilter | undefined): f is SelectFilter {
  return f != null && Array.isArray((f as SelectFilter).values)
}

export function parseNum(val: string): number | undefined {
  if (val.trim() === '') {
    return undefined
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

export function filterLabel(label: string, f: ColumnFilter): string {
  if (isSelectFilter(f)) {
    if (f.values.length === 0) {
      return label
    }
    return f.values.length <= 2
      ? `${label}: ${f.values.join(', ')}`
      : `${label}: ${f.values.length} selected`
  }
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
export function isActiveFilter(f: ColumnFilter | undefined): f is ColumnFilter {
  if (f == null) {
    return false
  }
  if (isSelectFilter(f)) {
    return f.values.length > 0
  }
  return f.min != null || f.max != null
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

/** Does a categorical value pass the filter? An empty selection constrains nothing. */
export function passesSelectFilter(
  value: string | null | undefined,
  f: SelectFilter,
) {
  if (f.values.length === 0) {
    return true
  }
  return value != null && f.values.includes(value)
}

/** Applies whichever filter kind `f` is to `value`. */
export function passesColumnFilter(
  value: number | string | null | undefined,
  f: ColumnFilter,
) {
  if (isSelectFilter(f)) {
    return passesSelectFilter(value == null ? null : String(value), f)
  }
  return passesFilter(typeof value === 'string' ? Number(value) : value, f)
}
