import { useState, useRef, useEffect } from 'react';

const CAMELOT_CODES = [
  '01A','01B','02A','02B','03A','03B','04A','04B',
  '05A','05B','06A','06B','07A','07B','08A','08B',
  '09A','09B','10A','10B','11A','11B','12A','12B',
];

const RANGE_DEBOUNCE_MS = 300;
const TEXT_DEBOUNCE_MS = 250;

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  activeFilterCount: number;
  camelotCodes: string[];
  bpmMin: number | undefined;
  bpmMax: number | undefined;
  artist: string;
  label: string;
  genre: string;
  dateAddedMin: string;
  dateAddedMax: string;
  setCamelotCodes: (codes: string[]) => void;
  setBpmMin: (min: number | undefined) => void;
  setBpmMax: (max: number | undefined) => void;
  setArtist: (artist: string) => void;
  setLabel: (label: string) => void;
  setGenre: (genre: string) => void;
  setDateAddedMin: (date: string) => void;
  setDateAddedMax: (date: string) => void;
  onClearFilters?: () => void;
}

export function FilterToggleButton({ expanded, onToggle, activeCount }: {
  expanded: boolean;
  onToggle: () => void;
  activeCount: number;
}) {
  return (
    <button
      className={`filter-toggle-btn${expanded ? ' filter-toggle-btn--active' : ''}${activeCount > 0 ? ' filter-toggle-btn--has-active' : ''}`}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label="Toggle filters"
      title={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'}
    >
      Filters
      {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
      <span className="caret">{expanded ? '▲' : '▼'}</span>
    </button>
  );
}

export function FilterBar({
  expanded,
  onToggleExpanded: _onToggleExpanded,
  activeFilterCount: _activeFilterCount,
  camelotCodes,
  bpmMin,
  bpmMax,
  artist,
  label,
  genre,
  dateAddedMin,
  dateAddedMax,
  setCamelotCodes,
  setBpmMin,
  setBpmMax,
  setArtist,
  setLabel,
  setGenre,
  setDateAddedMin,
  setDateAddedMax,
  onClearFilters,
}: Props) {
  const [camelotOpen, setCamelotOpen] = useState(false);
  const camelotRef = useRef<HTMLDivElement>(null);

  const [minText, setMinText] = useState(bpmMin != null ? String(bpmMin) : '');
  const [maxText, setMaxText] = useState(bpmMax != null ? String(bpmMax) : '');
  const minTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [artistText, setArtistText] = useState(artist);
  const [labelText, setLabelText] = useState(label);
  const [genreText, setGenreText] = useState(genre);
  const artistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const genreTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(minTimer.current);
      clearTimeout(maxTimer.current);
      clearTimeout(artistTimer.current);
      clearTimeout(labelTimer.current);
      clearTimeout(genreTimer.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (camelotRef.current && !camelotRef.current.contains(e.target as Node)) {
        setCamelotOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!camelotOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setCamelotOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [camelotOpen]);

  useEffect(() => { setMinText(bpmMin != null ? String(bpmMin) : ''); }, [bpmMin]);
  useEffect(() => { setMaxText(bpmMax != null ? String(bpmMax) : ''); }, [bpmMax]);
  useEffect(() => { setArtistText(artist); }, [artist]);
  useEffect(() => { setLabelText(label); }, [label]);
  useEffect(() => { setGenreText(genre); }, [genre]);

  function toggleCode(code: string) {
    if (camelotCodes.includes(code)) {
      setCamelotCodes(camelotCodes.filter((c) => c !== code));
    } else {
      setCamelotCodes([...camelotCodes, code]);
    }
  }

  function parseNum(val: string): number | undefined {
    const n = parseFloat(val);
    return Number.isNaN(n) ? undefined : n;
  }

  function handleMinChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setMinText(text);
    clearTimeout(minTimer.current);
    minTimer.current = setTimeout(() => setBpmMin(parseNum(text)), RANGE_DEBOUNCE_MS);
  }

  function handleMaxChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setMaxText(text);
    clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => setBpmMax(parseNum(text)), RANGE_DEBOUNCE_MS);
  }

  function handleMinBlur() {
    clearTimeout(minTimer.current);
    setBpmMin(parseNum(minText));
  }

  function handleMaxBlur() {
    clearTimeout(maxTimer.current);
    setBpmMax(parseNum(maxText));
  }

  function handleTextFilter(
    value: string,
    setLocal: (v: string) => void,
    setFilter: (v: string) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  ) {
    setLocal(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFilter(value), TEXT_DEBOUNCE_MS);
  }

  function handleTextBlur(
    value: string,
    setFilter: (v: string) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  ) {
    clearTimeout(timerRef.current);
    setFilter(value);
  }

  const hasAnyFilter =
    camelotCodes.length > 0 ||
    bpmMin != null ||
    bpmMax != null ||
    artist.trim() !== '' ||
    label.trim() !== '' ||
    genre.trim() !== '' ||
    dateAddedMin !== '' ||
    dateAddedMax !== '';

  if (!expanded) return null;

  return (
    <div className="filter-tray" data-testid="filter-tray">
      <div className="filter-tray-row">
        {/* Key filter */}
        <div className="filter-group" ref={camelotRef}>
          <span className="filter-label">Key</span>
          <div className="filter-input-row">
            <button
              className="filter-camelot-toggle"
              onClick={() => setCamelotOpen(!camelotOpen)}
            >
              {camelotCodes.length > 0 ? camelotCodes.join(', ') : 'All keys'}
              <span className="caret">{camelotOpen ? '▲' : '▼'}</span>
            </button>
            {camelotCodes.length > 0 && (
              <button className="clear-btn" onClick={() => setCamelotCodes([])} tabIndex={-1}>×</button>
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
                <button className="camelot-chip clear" onClick={() => setCamelotCodes([])}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* BPM range */}
        <div className="filter-group">
          <span className="filter-label">BPM</span>
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
                  clearTimeout(minTimer.current);
                  clearTimeout(maxTimer.current);
                  setMinText('');
                  setMaxText('');
                  setBpmMin(undefined);
                  setBpmMax(undefined);
                }}
                tabIndex={-1}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Artist */}
        <div className="filter-group">
          <span className="filter-label">Artist</span>
          <div className="filter-input-row">
            <input
              type="text"
              className="filter-input filter-input--text"
              placeholder="Artist…"
              value={artistText}
              onChange={(e) => handleTextFilter(e.target.value, setArtistText, setArtist, artistTimer)}
              onBlur={() => handleTextBlur(artistText, setArtist, artistTimer)}
            />
            {artistText && (
              <button className="clear-btn" onClick={() => { clearTimeout(artistTimer.current); setArtistText(''); setArtist(''); }} tabIndex={-1}>×</button>
            )}
          </div>
        </div>

        {/* Label */}
        <div className="filter-group">
          <span className="filter-label">Label</span>
          <div className="filter-input-row">
            <input
              type="text"
              className="filter-input filter-input--text"
              placeholder="Label…"
              value={labelText}
              onChange={(e) => handleTextFilter(e.target.value, setLabelText, setLabel, labelTimer)}
              onBlur={() => handleTextBlur(labelText, setLabel, labelTimer)}
            />
            {labelText && (
              <button className="clear-btn" onClick={() => { clearTimeout(labelTimer.current); setLabelText(''); setLabel(''); }} tabIndex={-1}>×</button>
            )}
          </div>
        </div>

        {/* Genre */}
        <div className="filter-group">
          <span className="filter-label">Genre</span>
          <div className="filter-input-row">
            <input
              type="text"
              className="filter-input filter-input--text"
              placeholder="Genre…"
              value={genreText}
              onChange={(e) => handleTextFilter(e.target.value, setGenreText, setGenre, genreTimer)}
              onBlur={() => handleTextBlur(genreText, setGenre, genreTimer)}
            />
            {genreText && (
              <button className="clear-btn" onClick={() => { clearTimeout(genreTimer.current); setGenreText(''); setGenre(''); }} tabIndex={-1}>×</button>
            )}
          </div>
        </div>

        {/* Date Added range */}
        <div className="filter-group">
          <span className="filter-label">Date Added</span>
          <div className="filter-range">
            <input
              type="date"
              className="filter-input filter-input--date"
              value={dateAddedMin}
              onChange={(e) => setDateAddedMin(e.target.value)}
              aria-label="Date added from"
            />
            <span className="range-sep">–</span>
            <input
              type="date"
              className="filter-input filter-input--date"
              value={dateAddedMax}
              onChange={(e) => setDateAddedMax(e.target.value)}
              aria-label="Date added to"
            />
            {(dateAddedMin || dateAddedMax) && (
              <button
                className="clear-btn"
                onClick={() => { setDateAddedMin(''); setDateAddedMax(''); }}
                tabIndex={-1}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Clear all */}
        {onClearFilters && (
          <button
            className="clear-filters-btn"
            onClick={onClearFilters}
            disabled={!hasAnyFilter}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
