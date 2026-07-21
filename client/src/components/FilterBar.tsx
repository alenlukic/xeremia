import { useEffect, useRef, useState } from 'react'

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
  '01A',
  '01B',
  '02A',
  '02B',
  '03A',
  '03B',
  '04A',
  '04B',
  '05A',
  '05B',
  '06A',
  '06B',
  '07A',
  '07B',
  '08A',
  '08B',
  '09A',
  '09B',
  '10A',
  '10B',
  '11A',
  '11B',
  '12A',
  '12B',
]

const RANGE_DEBOUNCE_MS = 300

type FilterKind = 'key' | 'bpm'

/** Browse-filter state, shared by the header add-button and control-panel pills. */
export interface BrowseFilterProps {
  camelotCodes: string[]
  bpm: number | undefined
  bpmMin: number | undefined
  bpmMax: number | undefined
  setCamelotCodes: (codes: string[]) => void
  setBpm: (bpm: number | undefined) => void
  setBpmMin: (min: number | undefined) => void
  setBpmMax: (max: number | undefined) => void
}

function parseNum(val: string): number | undefined {
  if (val.trim() === '') {
    return undefined
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

function bpmPillLabel(
  bpm: number | undefined,
  bpmMin: number | undefined,
  bpmMax: number | undefined,
): string {
  if (bpm != null) {
    return `BPM: ${bpm}`
  }
  if (bpmMin != null && bpmMax != null) {
    return `BPM: ${bpmMin}–${bpmMax}`
  }
  if (bpmMin != null) {
    return `BPM: ≥ ${bpmMin}`
  }
  return `BPM: ≤ ${bpmMax}`
}

function KeyPopover({
  camelotCodes,
  setCamelotCodes,
}: Pick<BrowseFilterProps, 'camelotCodes' | 'setCamelotCodes'>) {
  function toggleCode(code: string) {
    if (camelotCodes.includes(code)) {
      setCamelotCodes(camelotCodes.filter((c) => c !== code))
    } else {
      setCamelotCodes([...camelotCodes, code])
    }
  }

  return (
    <div className="filter-popover" role="dialog" aria-label="Key filter">
      <div className="camelot-grid-inline">
        {CAMELOT_CODES.map((code) => (
          <button
            key={code}
            className={`camelot-chip${camelotCodes.includes(code) ? ' selected' : ''}`}
            onClick={() => toggleCode(code)}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  )
}

function BpmPopover({
  bpm,
  bpmMin,
  bpmMax,
  setBpm,
  setBpmMin,
  setBpmMax,
}: Pick<
  BrowseFilterProps,
  'bpm' | 'bpmMin' | 'bpmMax' | 'setBpm' | 'setBpmMin' | 'setBpmMax'
>) {
  const [minText, setMinText] = useState(bpmMin != null ? String(bpmMin) : '')
  const [maxText, setMaxText] = useState(bpmMax != null ? String(bpmMax) : '')
  const minTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Mirror numeric bpmMin/bpmMax props into the text inputs. Adjusting during
  // render (vs. in an effect) avoids a cascading render and the
  // react-hooks/set-state-in-effect warning.
  const [prevBpmMin, setPrevBpmMin] = useState(bpmMin)
  if (bpmMin !== prevBpmMin) {
    setPrevBpmMin(bpmMin)
    setMinText(bpmMin != null ? String(bpmMin) : '')
  }
  const [prevBpmMax, setPrevBpmMax] = useState(bpmMax)
  if (bpmMax !== prevBpmMax) {
    setPrevBpmMax(bpmMax)
    setMaxText(bpmMax != null ? String(bpmMax) : '')
  }

  useEffect(() => {
    return () => {
      clearTimeout(minTimer.current)
      clearTimeout(maxTimer.current)
    }
  }, [])

  function handleMinChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setMinText(text)
    if (text && bpm != null) {
      setBpm(undefined)
    }
    clearTimeout(minTimer.current)
    minTimer.current = setTimeout(
      () => setBpmMin(parseNum(text)),
      RANGE_DEBOUNCE_MS,
    )
  }

  function handleMaxChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setMaxText(text)
    if (text && bpm != null) {
      setBpm(undefined)
    }
    clearTimeout(maxTimer.current)
    maxTimer.current = setTimeout(
      () => setBpmMax(parseNum(text)),
      RANGE_DEBOUNCE_MS,
    )
  }

  function handleMinBlur() {
    clearTimeout(minTimer.current)
    setBpmMin(parseNum(minText))
  }

  function handleMaxBlur() {
    clearTimeout(maxTimer.current)
    setBpmMax(parseNum(maxText))
  }

  return (
    <div className="filter-popover" role="dialog" aria-label="BPM filter">
      <div className="filter-popover-row">
        <label className="filter-popover-label">Exact</label>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Exact"
          value={bpm ?? ''}
          onChange={(e) => setBpm(parseNum(e.target.value))}
        />
      </div>
      <div className="filter-popover-row">
        <label className="filter-popover-label">Range</label>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Min"
          value={minText}
          onChange={handleMinChange}
          onBlur={handleMinBlur}
        />
        <span className="range-sep">–</span>
        <input
          type="number"
          className="filter-input mono"
          placeholder="Max"
          value={maxText}
          onChange={handleMaxChange}
          onBlur={handleMaxBlur}
        />
      </div>
    </div>
  )
}

/**
 * Browse "Add filter" entry point for the design-system header: an "Add filter"
 * menu opens a per-kind create popover (Key or BPM). Active filters render
 * separately as pills via {@link BrowseFilterPills} in the control panel.
 */
export function BrowseFilterAddButton(props: BrowseFilterProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const anyOpen = menuOpen || openFilter !== null
  useDismiss(ref, anyOpen, () => {
    setMenuOpen(false)
    setOpenFilter(null)
  })

  function openPopover(kind: FilterKind) {
    setMenuOpen(false)
    setOpenFilter(kind)
  }

  return (
    <div className="filter-add-group" ref={ref}>
      <button
        className="filter-add-btn"
        aria-haspopup="true"
        aria-expanded={anyOpen}
        onClick={() => {
          setOpenFilter(null)
          setMenuOpen((prev) => !prev)
        }}
      >
        + Add filter
      </button>
      {menuOpen && (
        <div className="filter-add-menu">
          <button
            className="filter-add-menu-item"
            onClick={() => openPopover('key')}
          >
            Key
          </button>
          <button
            className="filter-add-menu-item"
            onClick={() => openPopover('bpm')}
          >
            BPM
          </button>
        </div>
      )}
      {openFilter === 'key' && (
        <KeyPopover
          camelotCodes={props.camelotCodes}
          setCamelotCodes={props.setCamelotCodes}
        />
      )}
      {openFilter === 'bpm' && (
        <BpmPopover
          bpm={props.bpm}
          bpmMin={props.bpmMin}
          bpmMax={props.bpmMax}
          setBpm={props.setBpm}
          setBpmMin={props.setBpmMin}
          setBpmMax={props.setBpmMax}
        />
      )}
    </div>
  )
}

/** Active browse-filter pills for the control panel: editable and removable. */
export function BrowseFilterPills(props: BrowseFilterProps) {
  const {
    camelotCodes,
    bpm,
    bpmMin,
    bpmMax,
    setCamelotCodes,
    setBpm,
    setBpmMin,
    setBpmMax,
  } = props
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, openFilter !== null, () => setOpenFilter(null))

  const hasKeyFilter = camelotCodes.length > 0
  const hasBpmFilter = bpm != null || bpmMin != null || bpmMax != null

  function clearBpmFilter() {
    setBpm(undefined)
    setBpmMin(undefined)
    setBpmMax(undefined)
  }

  if (!hasKeyFilter && !hasBpmFilter) {
    return null
  }

  return (
    <div className="filter-pills" ref={ref}>
      {hasKeyFilter && (
        <span className="filter-pill-group">
          <span className="filter-pill">
            <button
              className="filter-pill-body"
              title="Edit key filter"
              onClick={() =>
                setOpenFilter((prev) => (prev === 'key' ? null : 'key'))
              }
            >
              Key: {camelotCodes.join(', ')}
            </button>
            <button
              className="filter-pill-remove"
              aria-label="Remove key filter"
              title="Remove key filter"
              onClick={() => {
                setCamelotCodes([])
                if (openFilter === 'key') {
                  setOpenFilter(null)
                }
              }}
            >
              ×
            </button>
          </span>
          {openFilter === 'key' && (
            <KeyPopover
              camelotCodes={camelotCodes}
              setCamelotCodes={setCamelotCodes}
            />
          )}
        </span>
      )}
      {hasBpmFilter && (
        <span className="filter-pill-group">
          <span className="filter-pill">
            <button
              className="filter-pill-body"
              title="Edit BPM filter"
              onClick={() =>
                setOpenFilter((prev) => (prev === 'bpm' ? null : 'bpm'))
              }
            >
              {bpmPillLabel(bpm, bpmMin, bpmMax)}
            </button>
            <button
              className="filter-pill-remove"
              aria-label="Remove BPM filter"
              title="Remove BPM filter"
              onClick={() => {
                clearBpmFilter()
                if (openFilter === 'bpm') {
                  setOpenFilter(null)
                }
              }}
            >
              ×
            </button>
          </span>
          {openFilter === 'bpm' && (
            <BpmPopover
              bpm={bpm}
              bpmMin={bpmMin}
              bpmMax={bpmMax}
              setBpm={setBpm}
              setBpmMin={setBpmMin}
              setBpmMax={setBpmMax}
            />
          )}
        </span>
      )}
    </div>
  )
}
