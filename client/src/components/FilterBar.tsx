import { Fragment, useEffect, useRef, useState } from 'react'
import {
  FILTER_KIND_LABELS,
  isActiveCondition,
  isActiveModel,
  newCondition,
  newGroup,
  pruneModel,
  removeConditionFromModel,
  upsertCondition,
  type FilterCondition,
  type FilterKind,
  type FilterModel,
} from '../hooks/useTrackFilters'

/** Dismiss on outside mousedown or Escape while `active`. */
function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })
  useEffect(() => {
    if (!active) {
      return
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismissRef.current()
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismissRef.current()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [ref, active])
}

const CAMELOT_CODES = [
  '01A', '01B', '02A', '02B', '03A', '03B', '04A', '04B',
  '05A', '05B', '06A', '06B', '07A', '07B', '08A', '08B',
  '09A', '09B', '10A', '10B', '11A', '11B', '12A', '12B',
]

const KINDS: FilterKind[] = ['key', 'bpm', 'genre', 'label', 'dateAdded']

/** Shared props: the filter model, its setter, and the collection's value lists. */
export interface BrowseFilterProps {
  model: FilterModel
  setModel: React.Dispatch<React.SetStateAction<FilterModel>>
  genres: string[]
  labels: string[]
}

function parseNum(val: string): number | undefined {
  if (val.trim() === '') {
    return undefined
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

function conditionLabel(c: FilterCondition): string {
  const values = c.values ?? []
  switch (c.kind) {
    case 'key':
      return `Key: ${values.join(', ')}`
    case 'genre':
      return `Genre: ${values.join(', ')}`
    case 'label':
      return `Label: ${values.join(', ')}`
    case 'bpm':
      if (c.exact != null) {
        return `BPM: ${c.exact}`
      }
      if (c.min != null && c.max != null) {
        return `BPM: ${c.min}–${c.max}`
      }
      if (c.min != null) {
        return `BPM: ≥ ${c.min}`
      }
      return `BPM: ≤ ${c.max}`
    case 'dateAdded':
      if (c.after && c.before) {
        return `Date: ${c.after} – ${c.before}`
      }
      if (c.after) {
        return `Date: ≥ ${c.after}`
      }
      return `Date: ≤ ${c.before}`
  }
}

// --- Per-kind editors: each stages into the popover's draft via onChange ---

type EditorProps = {
  draft: FilterCondition
  onChange: (next: FilterCondition) => void
}

function KeyEditor({ draft, onChange }: EditorProps) {
  const values = draft.values ?? []
  const toggle = (code: string) =>
    onChange({
      ...draft,
      values: values.includes(code)
        ? values.filter((c) => c !== code)
        : [...values, code],
    })
  return (
    <div className="camelot-grid-inline">
      {CAMELOT_CODES.map((code) => (
        <button
          key={code}
          className={`camelot-chip${values.includes(code) ? ' selected' : ''}`}
          onClick={() => toggle(code)}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

function BpmEditor({ draft, onChange }: EditorProps) {
  return (
    <>
      <div className="filter-popover-row">
        <label className="filter-popover-label">Exact</label>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Exact"
          value={draft.exact ?? ''}
          onChange={(e) =>
            onChange({
              ...draft,
              exact: parseNum(e.target.value),
              min: undefined,
              max: undefined,
            })
          }
        />
      </div>
      <div className="filter-popover-row">
        <label className="filter-popover-label">Range</label>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Min"
          value={draft.min ?? ''}
          onChange={(e) =>
            onChange({ ...draft, min: parseNum(e.target.value), exact: undefined })
          }
        />
        <span className="range-sep">–</span>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Max"
          value={draft.max ?? ''}
          onChange={(e) =>
            onChange({ ...draft, max: parseNum(e.target.value), exact: undefined })
          }
        />
      </div>
    </>
  )
}

function MultiSelectEditor({
  draft,
  onChange,
  options,
  placeholder,
}: EditorProps & { options: string[]; placeholder: string }) {
  const [query, setQuery] = useState('')
  const values = draft.values ?? []
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options
  const toggle = (v: string) =>
    onChange({
      ...draft,
      values: values.includes(v)
        ? values.filter((x) => x !== v)
        : [...values, v],
    })
  return (
    <div className="filter-multiselect">
      <input
        className="filter-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="filter-multiselect-list">
        {filtered.length === 0 ? (
          <div className="filter-multiselect-empty">No matches</div>
        ) : (
          filtered.slice(0, 200).map((o) => (
            <label key={o} className="filter-multiselect-item">
              <input
                type="checkbox"
                checked={values.includes(o)}
                onChange={() => toggle(o)}
              />
              <span className="filter-multiselect-name">{o}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

function DateEditor({ draft, onChange }: EditorProps) {
  return (
    <>
      <div className="filter-popover-row">
        <label className="filter-popover-label">After</label>
        <input
          type="date"
          className="filter-input"
          value={draft.after ?? ''}
          onChange={(e) =>
            onChange({ ...draft, after: e.target.value || undefined })
          }
        />
      </div>
      <div className="filter-popover-row">
        <label className="filter-popover-label">Before</label>
        <input
          type="date"
          className="filter-input"
          value={draft.before ?? ''}
          onChange={(e) =>
            onChange({ ...draft, before: e.target.value || undefined })
          }
        />
      </div>
    </>
  )
}

function ConditionEditor({
  draft,
  onChange,
  genres,
  labels,
}: EditorProps & { genres: string[]; labels: string[] }) {
  switch (draft.kind) {
    case 'key':
      return <KeyEditor draft={draft} onChange={onChange} />
    case 'bpm':
      return <BpmEditor draft={draft} onChange={onChange} />
    case 'genre':
      return (
        <MultiSelectEditor
          draft={draft}
          onChange={onChange}
          options={genres}
          placeholder="Filter genres…"
        />
      )
    case 'label':
      return (
        <MultiSelectEditor
          draft={draft}
          onChange={onChange}
          options={labels}
          placeholder="Filter labels…"
        />
      )
    case 'dateAdded':
      return <DateEditor draft={draft} onChange={onChange} />
  }
}

/**
 * A popover that stages an edit to a single condition and commits it to the
 * model only when it closes (unmounts) — so multi-select clicks and typing never
 * re-run the search mid-edit.
 */
function ConditionPopover({
  initial,
  genres,
  labels,
  onCommit,
}: {
  initial: FilterCondition
  genres: string[]
  labels: string[]
  onCommit: (c: FilterCondition) => void
}) {
  const [draft, setDraft] = useState(initial)
  const commitRef = useRef(() => {})
  useEffect(() => {
    commitRef.current = () => onCommit(draft)
  })
  useEffect(() => () => commitRef.current(), [])
  return (
    <div
      className="filter-popover"
      role="dialog"
      aria-label={`${FILTER_KIND_LABELS[initial.kind]} filter`}
    >
      <ConditionEditor
        draft={draft}
        onChange={setDraft}
        genres={genres}
        labels={labels}
      />
    </div>
  )
}

type AddTarget =
  | { mode: 'firstGroup' }
  | { mode: 'group'; groupId: string }
  | { mode: 'newGroup' }

function addConditionByTarget(
  model: FilterModel,
  target: AddTarget,
  cond: FilterCondition,
): FilterModel {
  if (!isActiveCondition(cond)) {
    return model
  }
  switch (target.mode) {
    case 'group':
      return pruneModel(upsertCondition(model, target.groupId, cond))
    case 'newGroup':
      return [...model, newGroup([cond])]
    case 'firstGroup':
      return model.length === 0
        ? [newGroup([cond])]
        : upsertCondition(model, model[0].id, cond)
  }
}

/** "Add filter" entry point: opens a kind menu, then a create popover. */
function FilterAddControl({
  setModel,
  genres,
  labels,
  target,
  label,
  className,
}: BrowseFilterProps & {
  target: AddTarget
  label: string
  className: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [draftKind, setDraftKind] = useState<FilterKind | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const anyOpen = menuOpen || draftKind !== null
  useDismiss(ref, anyOpen, () => {
    setMenuOpen(false)
    setDraftKind(null)
  })

  return (
    <div className="filter-add-group" ref={ref}>
      <button
        className={className}
        aria-haspopup="menu"
        aria-expanded={anyOpen}
        onClick={() => {
          setDraftKind(null)
          setMenuOpen((prev) => !prev)
        }}
      >
        {label}
      </button>
      {menuOpen && (
        <div className="filter-add-menu" role="menu">
          {KINDS.map((k) => (
            <button
              key={k}
              className="filter-add-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setDraftKind(k)
              }}
            >
              {FILTER_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {draftKind && (
        <ConditionPopover
          key={draftKind}
          initial={newCondition(draftKind)}
          genres={genres}
          labels={labels}
          onCommit={(cond) =>
            setModel((prev) => addConditionByTarget(prev, target, cond))
          }
        />
      )}
    </div>
  )
}

/** An active condition rendered as an editable / removable pill. */
function ConditionPill({
  setModel,
  genres,
  labels,
  groupId,
  condition,
}: BrowseFilterProps & { groupId: string; condition: FilterCondition }) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, editing, () => setEditing(false))

  const kindLabel = FILTER_KIND_LABELS[condition.kind]

  return (
    <span className="filter-pill-group" ref={ref}>
      <span className="filter-pill">
        <button
          className="filter-pill-body"
          title={`Edit ${kindLabel} filter`}
          onClick={() => setEditing((e) => !e)}
        >
          {conditionLabel(condition)}
        </button>
        <button
          className="filter-pill-remove"
          aria-label={`Remove ${kindLabel} filter`}
          title={`Remove ${kindLabel} filter`}
          onClick={() => {
            setModel((prev) =>
              removeConditionFromModel(prev, groupId, condition.id),
            )
            setEditing(false)
          }}
        >
          ×
        </button>
      </span>
      {editing && (
        <ConditionPopover
          key={condition.id}
          initial={condition}
          genres={genres}
          labels={labels}
          onCommit={(cond) =>
            setModel((prev) => pruneModel(upsertCondition(prev, groupId, cond)))
          }
        />
      )}
    </span>
  )
}

/**
 * Browse "Add filter" entry point for the design-system header. Adds a condition
 * to the first filter group (creating it if none exists). Active groups render
 * separately via {@link BrowseFilterGroups} in the control panel.
 */
export function BrowseFilterAddButton(props: BrowseFilterProps) {
  return (
    <FilterAddControl
      {...props}
      target={{ mode: 'firstGroup' }}
      label="Add filter"
      className="filter-add-btn"
    />
  )
}

/**
 * Active filter groups for the control panel. Conditions within a group are
 * ANDed; groups are separated by "OR" and each can be extended independently,
 * with an "+ OR" affordance to start a new disjunct.
 */
export function BrowseFilterGroups(props: BrowseFilterProps) {
  const { model, genres, labels } = props
  if (!isActiveModel(model)) {
    return null
  }
  return (
    <div className="filter-groups">
      {model.map((group, i) => (
        <Fragment key={group.id}>
          {i > 0 && (
            <span className="filter-or-divider" aria-hidden="true">
              OR
            </span>
          )}
          <div className="filter-group">
            {group.conditions.map((cond) => (
              <ConditionPill
                key={cond.id}
                {...props}
                groupId={group.id}
                condition={cond}
              />
            ))}
            <FilterAddControl
              {...props}
              target={{ mode: 'group', groupId: group.id }}
              label="+ filter"
              className="filter-group-add-btn"
            />
          </div>
        </Fragment>
      ))}
      <FilterAddControl
        {...props}
        genres={genres}
        labels={labels}
        target={{ mode: 'newGroup' }}
        label="+ OR"
        className="filter-or-add-btn"
      />
    </div>
  )
}
