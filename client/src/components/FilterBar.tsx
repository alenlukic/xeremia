import { useEffect, useRef, useState } from 'react'

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

interface Props {
  camelotCodes: string[]
  bpm: number | undefined
  bpmMin: number | undefined
  bpmMax: number | undefined
  setCamelotCodes: (codes: string[]) => void
  setBpm: (bpm: number | undefined) => void
  setBpmMin: (min: number | undefined) => void
  setBpmMax: (max: number | undefined) => void
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

/**
 * Browse filter controls: an "Add filter" menu opens a per-kind popover
 * (Key or BPM); active filters render as removable/editable pills on their
 * own row (`.filter-pills` wraps to a full-width line in `.browse-controls`).
 */
export function FilterBar({
  camelotCodes,
  bpm,
  bpmMin,
  bpmMax,
  setCamelotCodes,
  setBpm,
  setBpmMin,
  setBpmMax,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Which filter's params popover is open, and where it is anchored:
  // 'menu' (under the Add filter button) or 'pill' (under the filter's pill).
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null)
  const [popoverAnchor, setPopoverAnchor] = useState<'menu' | 'pill'>('menu')
  const addFilterRef = useRef<HTMLDivElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)

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

  const anythingOpen = menuOpen || openFilter !== null
  useEffect(() => {
    if (!anythingOpen) {
      return
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        !addFilterRef.current?.contains(target) &&
        !pillsRef.current?.contains(target)
      ) {
        setMenuOpen(false)
        setOpenFilter(null)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [anythingOpen])

  function toggleCode(code: string) {
    if (camelotCodes.includes(code)) {
      setCamelotCodes(camelotCodes.filter((c) => c !== code))
    } else {
      setCamelotCodes([...camelotCodes, code])
    }
  }

  function parseNum(val: string): number | undefined {
    if (val.trim() === '') {
      return undefined
    }
    const n = Number(val)
    return Number.isFinite(n) ? n : undefined
  }

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

  function openPopover(kind: FilterKind, anchor: 'menu' | 'pill') {
    setMenuOpen(false)
    setPopoverAnchor(anchor)
    setOpenFilter(kind)
  }

  function clearBpmFilter() {
    clearTimeout(minTimer.current)
    clearTimeout(maxTimer.current)
    setMinText('')
    setMaxText('')
    setBpm(undefined)
    setBpmMin(undefined)
    setBpmMax(undefined)
  }

  const hasKeyFilter = camelotCodes.length > 0
  const hasBpmFilter = bpm != null || bpmMin != null || bpmMax != null

  const keyPopover = (
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

  const bpmPopover = (
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

  const activePopover = openFilter === 'key' ? keyPopover : bpmPopover

  return (
    <>
      <div className="filter-add-group" ref={addFilterRef}>
        <button
          className="filter-add-btn"
          aria-haspopup="true"
          aria-expanded={
            menuOpen || (openFilter !== null && popoverAnchor === 'menu')
          }
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
              onClick={() => openPopover('key', 'menu')}
            >
              Key
            </button>
            <button
              className="filter-add-menu-item"
              onClick={() => openPopover('bpm', 'menu')}
            >
              BPM
            </button>
          </div>
        )}
        {openFilter !== null && popoverAnchor === 'menu' && activePopover}
      </div>

      {(hasKeyFilter || hasBpmFilter) && (
        <div className="filter-pills" ref={pillsRef}>
          {hasKeyFilter && (
            <span className="filter-pill-group">
              <span className="filter-pill">
                <button
                  className="filter-pill-body"
                  title="Edit key filter"
                  onClick={() =>
                    openFilter === 'key' && popoverAnchor === 'pill'
                      ? setOpenFilter(null)
                      : openPopover('key', 'pill')
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
              {openFilter === 'key' && popoverAnchor === 'pill' && keyPopover}
            </span>
          )}
          {hasBpmFilter && (
            <span className="filter-pill-group">
              <span className="filter-pill">
                <button
                  className="filter-pill-body"
                  title="Edit BPM filter"
                  onClick={() =>
                    openFilter === 'bpm' && popoverAnchor === 'pill'
                      ? setOpenFilter(null)
                      : openPopover('bpm', 'pill')
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
              {openFilter === 'bpm' && popoverAnchor === 'pill' && bpmPopover}
            </span>
          )}
        </div>
      )}
    </>
  )
}
