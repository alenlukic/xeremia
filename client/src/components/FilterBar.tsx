import { useState, useRef, useEffect } from 'react'

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

interface ColumnConfig {
  id: string
  label: string
}

interface Props {
  camelotCodes: string[]
  bpm: number | undefined
  bpmMin: number | undefined
  bpmMax: number | undefined
  setCamelotCodes: (codes: string[]) => void
  setBpm: (bpm: number | undefined) => void
  setBpmMin: (min: number | undefined) => void
  setBpmMax: (max: number | undefined) => void
  onClearFilters?: () => void
  configurableColumns?: ColumnConfig[]
  columnVisibility?: Record<string, boolean>
  onToggleColumn?: (id: string) => void
}

export function FilterBar({
  camelotCodes,
  bpm,
  bpmMin,
  bpmMax,
  setCamelotCodes,
  setBpm,
  setBpmMin,
  setBpmMax,
  onClearFilters,
  configurableColumns,
  columnVisibility,
  onToggleColumn,
}: Props) {
  const [camelotOpen, setCamelotOpen] = useState(false)
  const camelotRef = useRef<HTMLDivElement>(null)
  const [colConfigOpen, setColConfigOpen] = useState(false)
  const colConfigRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        camelotRef.current &&
        !camelotRef.current.contains(e.target as Node)
      ) {
        setCamelotOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!camelotOpen) {
      return
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + preventDefault so Escape closes only this dropdown,
        // not the browse overlay (which skips defaultPrevented events).
        e.preventDefault()
        setCamelotOpen(false)
      }
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [camelotOpen])

  useEffect(() => {
    if (!colConfigOpen) {
      return
    }
    function handleClickOutside(e: MouseEvent) {
      if (
        colConfigRef.current &&
        !colConfigRef.current.contains(e.target as Node)
      ) {
        setColConfigOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + preventDefault so Escape closes only this dropdown,
        // not the browse overlay (which skips defaultPrevented events).
        e.preventDefault()
        setColConfigOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape, true)
    }
  }, [colConfigOpen])

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

  return (
    <div className="filter-bar">
      <div className="filter-group" ref={camelotRef}>
        <label className="filter-label">Camelot</label>
        <div className="filter-input-row">
          <button
            className="filter-camelot-toggle"
            onClick={() => setCamelotOpen(!camelotOpen)}
          >
            {camelotCodes.length > 0 ? camelotCodes.join(', ') : 'All keys'}
            <span className="caret">{camelotOpen ? '▲' : '▼'}</span>
          </button>
          {camelotCodes.length > 0 && (
            <button
              className="clear-btn"
              onClick={() => setCamelotCodes([])}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
        {camelotOpen && (
          <div className="camelot-grid">
            {CAMELOT_CODES.map((code) => (
              <button
                key={code}
                className={`camelot-chip${camelotCodes.includes(code) ? ' selected' : ''}`}
                onClick={() => toggleCode(code)}
              >
                {code}
              </button>
            ))}
            {camelotCodes.length > 0 && (
              <button
                className="camelot-chip clear"
                onClick={() => setCamelotCodes([])}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="filter-group">
        <label className="filter-label">BPM</label>
        <div className="filter-input-row">
          <input
            type="number"
            className="filter-input mono"
            placeholder="Exact"
            value={bpm ?? ''}
            onChange={(e) => setBpm(parseNum(e.target.value))}
          />
          {bpm != null && (
            <button
              className="clear-btn"
              onClick={() => setBpm(undefined)}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">BPM Range</label>
        <div className="filter-range">
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
          {(minText || maxText) && (
            <button
              className="clear-btn"
              onClick={() => {
                clearTimeout(minTimer.current)
                clearTimeout(maxTimer.current)
                setMinText('')
                setMaxText('')
                setBpmMin(undefined)
                setBpmMax(undefined)
              }}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {onClearFilters && (
        <button
          className="clear-filters-btn"
          onClick={onClearFilters}
          disabled={
            camelotCodes.length === 0 &&
            bpm == null &&
            bpmMin == null &&
            bpmMax == null
          }
        >
          Clear Filters
        </button>
      )}

      {configurableColumns && configurableColumns.length > 0 && (
        <div className="column-config-group" ref={colConfigRef}>
          <button
            className="column-config-btn"
            onClick={() => setColConfigOpen(!colConfigOpen)}
          >
            Columns
            <span className="caret">{colConfigOpen ? '▲' : '▼'}</span>
          </button>
          {colConfigOpen && (
            <div className="column-config-popover">
              {configurableColumns.map((col) => (
                <label key={col.id} className="column-config-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility?.[col.id] !== false}
                    onChange={() => onToggleColumn?.(col.id)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
