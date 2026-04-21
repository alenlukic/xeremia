import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import type { FilterGroup } from '../hooks/useTrackFilters';
import { isGroupActive } from '../hooks/useTrackFilters';

const CAMELOT_CODES = [
  '01A','01B','02A','02B','03A','03B','04A','04B',
  '05A','05B','06A','06B','07A','07B','08A','08B',
  '09A','09B','10A','10B','11A','11B','12A','12B',
];

const RANGE_DEBOUNCE_MS = 80;
const TEXT_DEBOUNCE_MS = 250;

interface Props {
  expanded: boolean;
  onToggleExpanded: () => void;
  activeFilterCount: number;
  filterGroups: FilterGroup[];
  addFilterGroup: () => void;
  removeFilterGroup: (id: string) => void;
  updateFilterGroup: (id: string, updates: Partial<Omit<FilterGroup, 'id'>>) => void;
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

function FilterGroupPanel({
  group,
  onUpdate,
  onRemove,
  showRemove,
}: {
  group: FilterGroup;
  onUpdate: (updates: Partial<Omit<FilterGroup, 'id'>>) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const [camelotOpen, setCamelotOpen] = useState(false);
  const camelotRef = useRef<HTMLDivElement>(null);

  const [minText, setMinText] = useState(group.bpmMin != null ? String(group.bpmMin) : '');
  const [maxText, setMaxText] = useState(group.bpmMax != null ? String(group.bpmMax) : '');
  const minTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [artistText, setArtistText] = useState(group.artist);
  const [labelText, setLabelText] = useState(group.label);
  const [genreText, setGenreText] = useState(group.genre);
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
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setCamelotOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [camelotOpen]);

  useEffect(() => { setMinText(group.bpmMin != null ? String(group.bpmMin) : ''); }, [group.bpmMin]);
  useEffect(() => { setMaxText(group.bpmMax != null ? String(group.bpmMax) : ''); }, [group.bpmMax]);
  useEffect(() => { setArtistText(group.artist); }, [group.artist]);
  useEffect(() => { setLabelText(group.label); }, [group.label]);
  useEffect(() => { setGenreText(group.genre); }, [group.genre]);

  function toggleCode(code: string) {
    if (group.camelotCodes.includes(code)) {
      onUpdate({ camelotCodes: group.camelotCodes.filter((c) => c !== code) });
    } else {
      onUpdate({ camelotCodes: [...group.camelotCodes, code] });
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
    minTimer.current = setTimeout(() => onUpdate({ bpmMin: parseNum(text) }), RANGE_DEBOUNCE_MS);
  }

  function handleMaxChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setMaxText(text);
    clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => onUpdate({ bpmMax: parseNum(text) }), RANGE_DEBOUNCE_MS);
  }

  function handleMinBlur() {
    clearTimeout(minTimer.current);
    onUpdate({ bpmMin: parseNum(minText) });
  }

  function handleMaxBlur() {
    clearTimeout(maxTimer.current);
    onUpdate({ bpmMax: parseNum(maxText) });
  }

  function handleTextFilter(
    value: string,
    setLocal: (v: string) => void,
    field: keyof Pick<FilterGroup, 'artist' | 'label' | 'genre'>,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  ) {
    setLocal(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate({ [field]: value }), TEXT_DEBOUNCE_MS);
  }

  function handleTextBlur(
    value: string,
    field: keyof Pick<FilterGroup, 'artist' | 'label' | 'genre'>,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  ) {
    clearTimeout(timerRef.current);
    onUpdate({ [field]: value });
  }

  return (
    <div className="filter-group-panel" data-testid={`filter-group-${group.id}`}>
      <div className="filter-group" ref={camelotRef}>
        <span className="filter-label">Key</span>
        <div className="filter-input-row">
          <button
            className="filter-camelot-toggle"
            onClick={() => setCamelotOpen(!camelotOpen)}
          >
            {group.camelotCodes.length > 0 ? group.camelotCodes.join(', ') : 'All keys'}
            <span className="caret">{camelotOpen ? '▲' : '▼'}</span>
          </button>
          {group.camelotCodes.length > 0 && (
            <button className="clear-btn" onClick={() => onUpdate({ camelotCodes: [] })} tabIndex={-1}>×</button>
          )}
        </div>
        {camelotOpen && (
          <div className="camelot-grid">
            {CAMELOT_CODES.map((code) => (
              <button
                key={code}
                className={`camelot-chip${group.camelotCodes.includes(code) ? ' selected' : ''}`}
                onClick={() => toggleCode(code)}
              >
                {code}
              </button>
            ))}
            {group.camelotCodes.length > 0 && (
              <button className="camelot-chip clear" onClick={() => onUpdate({ camelotCodes: [] })}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

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
                onUpdate({ bpmMin: undefined, bpmMax: undefined });
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
            onChange={(e) => handleTextFilter(e.target.value, setArtistText, 'artist', artistTimer)}
            onBlur={() => handleTextBlur(artistText, 'artist', artistTimer)}
          />
          {artistText && (
            <button className="clear-btn" onClick={() => { clearTimeout(artistTimer.current); setArtistText(''); onUpdate({ artist: '' }); }} tabIndex={-1}>×</button>
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
            onChange={(e) => handleTextFilter(e.target.value, setLabelText, 'label', labelTimer)}
            onBlur={() => handleTextBlur(labelText, 'label', labelTimer)}
          />
          {labelText && (
            <button className="clear-btn" onClick={() => { clearTimeout(labelTimer.current); setLabelText(''); onUpdate({ label: '' }); }} tabIndex={-1}>×</button>
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
            onChange={(e) => handleTextFilter(e.target.value, setGenreText, 'genre', genreTimer)}
            onBlur={() => handleTextBlur(genreText, 'genre', genreTimer)}
          />
          {genreText && (
            <button className="clear-btn" onClick={() => { clearTimeout(genreTimer.current); setGenreText(''); onUpdate({ genre: '' }); }} tabIndex={-1}>×</button>
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
            value={group.dateAddedMin}
            onChange={(e) => onUpdate({ dateAddedMin: e.target.value })}
            aria-label="Date added from"
          />
          <span className="range-sep">–</span>
          <input
            type="date"
            className="filter-input filter-input--date"
            value={group.dateAddedMax}
            onChange={(e) => onUpdate({ dateAddedMax: e.target.value })}
            aria-label="Date added to"
          />
          {(group.dateAddedMin || group.dateAddedMax) && (
            <button
              className="clear-btn"
              onClick={() => onUpdate({ dateAddedMin: '', dateAddedMax: '' })}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {showRemove && (
        <button
          className="filter-group-remove-btn"
          onClick={onRemove}
          title="Remove filter group"
          aria-label="Remove filter group"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function FilterBar({
  expanded,
  onToggleExpanded,
  activeFilterCount: _activeFilterCount,
  filterGroups,
  addFilterGroup,
  removeFilterGroup,
  updateFilterGroup,
  onClearFilters,
}: Props) {
  const hasAnyFilter =
    filterGroups.length > 1 ||
    filterGroups.some(isGroupActive);

  const modalRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (expanded) onToggleExpanded();
  }, [expanded, onToggleExpanded]);

  useEffect(() => {
    if (!expanded) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [expanded, close]);

  if (!expanded) return null;

  return (
    <>
      <div className="overlay-scrim" onClick={close} />
      <div
        className="filter-modal"
        ref={modalRef}
        role="dialog"
        aria-label="Filters"
        data-testid="filter-tray"
      >
        <div className="filter-modal__header">
          <span className="filter-modal__title">Filters</span>
          <button
            className="filter-modal__close"
            onClick={close}
            aria-label="Close filters"
          >
            ×
          </button>
        </div>
        <div className="filter-modal__body">
          <div
            className={`filter-groups-section${filterGroups.length > 1 ? ' filter-groups-section--multi' : ''}`}
            data-testid="filter-groups"
          >
            {filterGroups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <span className="filter-or-divider" aria-hidden="true">OR</span>}
                <FilterGroupPanel
                  group={group}
                  onUpdate={(updates) => updateFilterGroup(group.id, updates)}
                  onRemove={() => removeFilterGroup(group.id)}
                  showRemove={filterGroups.length > 1}
                />
              </Fragment>
            ))}
            <button
              className="filter-add-group-btn"
              onClick={addFilterGroup}
              title="Add filter group (OR)"
              aria-label="Add filter group"
            >
              + OR Group
            </button>
          </div>

          {onClearFilters && (
            <div className="filter-tray-row">
              <button
                className="clear-filters-btn"
                onClick={onClearFilters}
                disabled={!hasAnyFilter}
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
