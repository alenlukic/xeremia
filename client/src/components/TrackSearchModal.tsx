import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchSuggestion, Track } from '../types'
import { useTrackSearch } from '../hooks/useTrackSearch'

interface Props {
  allTracks: Track[]
  /** Modal heading, e.g. "Insert Track". */
  title: string
  /** Secondary line under the heading (e.g. the row being inserted after). */
  subtitle?: React.ReactNode
  onSelect: (suggestion: SearchSuggestion) => void
  onClose: () => void
}

/**
 * Modal wrapper around the same `useTrackSearch` hook that powers the track
 * browser's search bar, so instant local matches and the debounced
 * Elasticsearch refinement behave identically here.
 */
export function TrackSearchModal({
  allTracks,
  title,
  subtitle,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const { suggestions, search, clear } = useTrackSearch(allTracks)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setQuery(next)
      setActiveIdx(-1)
      if (!next.trim()) {
        clear()
        return
      }
      search(next)
    },
    [search, clear],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
        onSelect(suggestions[activeIdx])
      }
    },
    [activeIdx, suggestions, onSelect, onClose],
  )

  return (
    <div
      className="explorer-delete-overlay"
      onClick={onClose}
      onDragOver={(e) => e.preventDefault()}
    >
      <div
        className="explorer-delete-modal track-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-testid="track-search-modal"
      >
        <h3>{title}</h3>
        {subtitle && <p className="text-muted">{subtitle}</p>}

        <input
          ref={inputRef}
          type="text"
          className="set-explorer-search"
          placeholder="Search tracks…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          data-testid="track-search-modal-input"
        />

        {query.trim() !== '' && suggestions.length === 0 ? (
          <p className="text-muted">No matches found.</p>
        ) : (
          suggestions.length > 0 && (
            <ul className="track-search-modal-results">
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  className={`set-explorer-search-item${i === activeIdx ? ' active' : ''}`}
                  onMouseDown={() => onSelect(s)}
                  onMouseEnter={() => setActiveIdx(i)}
                  data-testid="track-search-modal-item"
                >
                  <span>{s.title}</span>
                  <span className="text-muted">
                    {s.artist_names.join(', ')}
                    {s.camelot_code && (
                      <span className="mono"> · {s.camelot_code}</span>
                    )}
                    {s.bpm != null && <span className="mono"> · {s.bpm}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="explorer-delete-buttons" style={{ marginTop: 12 }}>
          <button type="button" className="set-action-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
