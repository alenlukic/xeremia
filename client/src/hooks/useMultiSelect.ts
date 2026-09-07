import { useEffect, useRef, useState } from 'react'

/**
 * Row multi-selection, shared by every view that lists tracks: the browse and
 * matches tables, the pool, the tracklist and an Explorer cohort. One
 * implementation so a selection behaves the same wherever tracks appear.
 *
 * The selection is scoped to exactly what the view is listing — the rows left
 * after a search, a filter or a group tab. Select-all covers that set and
 * nothing else, so with a filter on, only matching tracks are ever eligible;
 * with no filter on, the listed rows are the whole collection anyway.
 */
export interface MultiSelect {
  selected: ReadonlySet<number>
  /** Selected ids in the order the view lists them. */
  orderedIds: number[]
  count: number
  isSelected: (id: number) => boolean
  /** Plain click clears and picks one; ctrl/meta toggles; shift extends. */
  select: (id: number, modifiers?: SelectModifiers) => void
  toggle: (id: number) => void
  selectAll: () => void
  clear: () => void
  /** Header checkmark: select everything listed, or clear when anything is. */
  toggleAll: () => void
  allSelected: boolean
  someSelected: boolean
}

export interface SelectModifiers {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

export function useMultiSelect(ids: number[]): MultiSelect {
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  )
  // Index in `ids` for shift-span endpoint one; null when no span is pending.
  const spanAnchorIndexRef = useRef<number | null>(null)
  const listedIdsKeyRef = useRef('')

  useEffect(() => {
    const key = ids.join('\0')
    if (listedIdsKeyRef.current !== key) {
      listedIdsKeyRef.current = key
      spanAnchorIndexRef.current = null
    }
  }, [ids])

  // Reads are intersected with what the view lists, so a bulk action cannot
  // reach a row the user cannot see — by construction, in the same render the
  // list narrows, with no cleanup pass to get wrong. Recomputed rather than
  // memoized: one pass over the listed rows, and `ids` is a fresh array each
  // render so a useMemo on it could not be preserved anyway.
  const visibleSelected =
    selected.size === 0 ? selected : new Set(ids.filter((id) => selected.has(id)))

  // Plain functions: consumed by inline row handlers, where identity does not
  // matter, and `ids` would defeat memoization regardless.
  const select = (id: number, modifiers: SelectModifiers = {}) => {
    const clickedIndex = ids.indexOf(id)
    if (clickedIndex < 0) {
      return
    }

    const additive = !!(modifiers.metaKey || modifiers.ctrlKey)
    if (modifiers.shiftKey) {
      if (spanAnchorIndexRef.current !== null) {
        const from = spanAnchorIndexRef.current
        const to = clickedIndex
        const [lo, hi] = from <= to ? [from, to] : [to, from]
        const range = ids.slice(lo, hi + 1)
        setSelected((current) =>
          additive ? new Set([...current, ...range]) : new Set(range),
        )
        spanAnchorIndexRef.current = null
        return
      }
      spanAnchorIndexRef.current = clickedIndex
      if (additive) {
        setSelected((current) => new Set([...current, id]))
      } else {
        setSelected(new Set([id]))
      }
      return
    }

    spanAnchorIndexRef.current = clickedIndex
    if (additive) {
      spanAnchorIndexRef.current = null
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
      return
    }
    setSelected(new Set([id]))
  }

  const toggle = (id: number) => {
    const clickedIndex = ids.indexOf(id)
    if (clickedIndex >= 0) {
      spanAnchorIndexRef.current = clickedIndex
    }
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => setSelected(new Set(ids))

  const clear = () => {
    spanAnchorIndexRef.current = null
    setSelected((current) => (current.size === 0 ? current : new Set<number>()))
  }

  const count = visibleSelected.size
  const allListedSelected = ids.length > 0 && ids.every((id) => selected.has(id))

  return {
    selected: visibleSelected,
    orderedIds: ids.filter((id) => visibleSelected.has(id)),
    count,
    isSelected: (id: number) => visibleSelected.has(id),
    select,
    toggle,
    selectAll,
    clear,
    // A partial selection clears rather than growing to everything: one
    // control must never leave more selected than the user expected.
    toggleAll: () => (count > 0 ? clear() : selectAll()),
    allSelected: allListedSelected,
    someSelected: count > 0 && !allListedSelected,
  }
}

/**
 * An inert selection, for views (and tests) that render a list without one.
 * Explicit rather than an optional prop, so a component never has to guess
 * whether it owns a selection or borrows one.
 */
export const NO_SELECTION: MultiSelect = {
  selected: new Set<number>(),
  orderedIds: [],
  count: 0,
  isSelected: () => false,
  select: () => {},
  toggle: () => {},
  selectAll: () => {},
  clear: () => {},
  toggleAll: () => {},
  allSelected: false,
  someSelected: false,
}
