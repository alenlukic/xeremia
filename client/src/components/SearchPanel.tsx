import { useState, useRef, useCallback, useMemo } from 'react'
import type { SearchSuggestion, Track } from '../types'
import { TRACK_DRAG_MIME } from '../utils'
import { useTrackSearch } from '../hooks/useTrackSearch'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { useExternalTrackDrop } from '../hooks/useExternalTrackDrop'
import type { TrackDropTarget } from '../hooks/useExternalTrackDrop'

interface Props {
  allTracks: Track[]
  selectedTrack: Track | SearchSuggestion | null
  selectTrack: (track: Track | SearchSuggestion) => void
  clearBrowseSelection: () => void
  onSearchTextChange?: (text: string) => void
  searchText?: string
  onTrackDrop?: (trackId: number) => void
}

export function SearchPanel({
  allTracks,
  selectedTrack,
  selectTrack,
  clearBrowseSelection,
  onSearchTextChange,
  searchText,
  onTrackDrop,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const { suggestions, search, clear } = useTrackSearch(allTracks)
  const dropTargets = useMemo<TrackDropTarget[]>(
    () =>
      onTrackDrop ? [{ mime: TRACK_DRAG_MIME, onDropTrack: onTrackDrop }] : [],
    [onTrackDrop],
  )
  const { dropActive, dropHandlers } = useExternalTrackDrop(dropTargets)

  // Mirror `selectedTrack` into the query input and clear local state when the
  // parent resets `searchText`. Adjusting during render (vs. in effects) avoids
  // cascading renders and the react-hooks/set-state-in-effect warning. The prev
  // trackers start at `undefined` so the mirror also fires on mount, matching
  // the original effect's mount behavior.
  const [prevSelected, setPrevSelected] = useState<
    Track | SearchSuggestion | null | undefined
  >(undefined)
  if (selectedTrack !== prevSelected) {
    setPrevSelected(selectedTrack)
    if (selectedTrack) {
      setQuery(selectedTrack.title)
    }
  }
  const [prevSearchText, setPrevSearchText] = useState<string | undefined>(
    undefined,
  )
  if (searchText !== prevSearchText) {
    setPrevSearchText(searchText)
    if (searchText === '' && !selectedTrack && query !== '') {
      setQuery('')
      clear()
      setOpen(false)
    } else if (searchText && searchText !== query) {
      setQuery(searchText)
      search(searchText)
    }
  }

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)
      clearBrowseSelection()
      onSearchTextChange?.(newQuery)
      setActiveIdx(-1)

      if (!newQuery.trim()) {
        clear()
        setOpen(false)
        return
      }
      search(newQuery)
      setOpen(true)
    },
    [clearBrowseSelection, onSearchTextChange, search, clear],
  )

  useDismissOnOutsideClick(containerRef, open, () => setOpen(false))

  function handleSelect(suggestion: SearchSuggestion) {
    selectTrack(suggestion)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div
      className={`search-bar-wrapper${dropActive ? ' search-drop-active' : ''}`}
      ref={containerRef}
      {...dropHandlers}
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
              setQuery('')
              clear()
              setOpen(false)
              clearBrowseSelection()
              onSearchTextChange?.('')
            }}
            tabIndex={-1}
          >
            ×
          </button>
        )}
        {open && suggestions.length > 0 && (
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
                  {s.camelot_code && (
                    <span className="mono"> · {s.camelot_code}</span>
                  )}
                  {s.bpm != null && <span className="mono"> · {s.bpm}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
