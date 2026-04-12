import { useState, useRef, useEffect, useCallback } from 'react';
import type { SearchSuggestion, Track } from '../types';
import { searchTracks } from '../api/http';

const searchCache = new Map<string, SearchSuggestion[]>();

interface Props {
  selectedTrack: Track | SearchSuggestion | null;
  selectTrack: (track: Track | SearchSuggestion) => void;
  onSearchTextChange?: (text: string) => void;
  searchPadding?: { left: number; right: number } | null;
  onClearSelectedTrack?: () => void;
  searchText?: string;
  onWeightsToggle?: () => void;
  showWeights?: boolean;
  onAdminToggle?: () => void;
  showAdmin?: boolean;
}

export function SearchPanel({ selectedTrack, selectTrack, onSearchTextChange, searchPadding, onClearSelectedTrack, searchText, onWeightsToggle, showWeights, onAdminToggle, showAdmin }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedTrack) {
      setQuery(selectedTrack.title);
      setSuggestions([]);
      setOpen(false);
    }
  }, [selectedTrack]);

  useEffect(() => {
    if (searchText === '' && query !== '') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQuery('');
      setSuggestions([]);
      setOpen(false);
      onClearSelectedTrack?.();
    }
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value;
      setQuery(newQuery);

      if (selectedTrack) {
        onClearSelectedTrack?.();
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = newQuery.trim();
      if (!trimmed) {
        onSearchTextChange?.('');
        setSuggestions([]);
        setOpen(false);
        return;
      }

      onSearchTextChange?.(newQuery);

      const cached = searchCache.get(trimmed);
      if (cached) {
        setSuggestions(cached);
        setOpen(cached.length > 0);
        setActiveIdx(-1);
        return;
      }

      debounceRef.current = setTimeout(() => {
        searchTracks(newQuery).then((results) => {
          searchCache.set(trimmed, results);
          setSuggestions(results);
          setOpen(results.length > 0);
          setActiveIdx(-1);
        });
      }, 100);
    },
    [onSearchTextChange, selectedTrack, onClearSelectedTrack],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(suggestion: SearchSuggestion) {
    selectTrack(suggestion);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      className="search-bar-wrapper"
      ref={containerRef}
      style={searchPadding ? { paddingLeft: searchPadding.left, paddingRight: searchPadding.right } : undefined}
    >
      <div className="search-input-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search tracks…"
          value={query}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          style={query ? { paddingRight: '32px' } : undefined}
        />
        {query && (
          <button
            className="clear-btn clear-btn--search"
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              setQuery('');
              setSuggestions([]);
              setOpen(false);
              onSearchTextChange?.('');
              onClearSelectedTrack?.();
            }}
            tabIndex={-1}
          >
            ×
          </button>
        )}
        {open && (
          <ul className="search-dropdown">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                className={`search-item${i === activeIdx ? ' active' : ''}`}
                onMouseDown={() => handleSelect(s)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="search-item-title">{s.title}</span>
                <span className="search-item-meta">
                  {s.artist_names.join(', ')}
                  {s.camelot_code && <span className="mono"> · {s.camelot_code}</span>}
                  {s.bpm != null && <span className="mono"> · {s.bpm}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="search-actions">
        {onWeightsToggle && (
          <button
            className={`search-weights-btn${showWeights ? ' search-weights-btn--active' : ''}`}
            onClick={onWeightsToggle}
            title="Weights"
            aria-label="Toggle weights"
          >
            ⚖
          </button>
        )}
        {onAdminToggle && (
          <button
            className={`dock-admin-btn${showAdmin ? ' dock-admin-btn--active' : ''}`}
            onClick={onAdminToggle}
            title="Admin Dashboard"
            aria-label="Admin Dashboard"
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}
