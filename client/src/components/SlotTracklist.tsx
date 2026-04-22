import { useState, useCallback, useRef, useEffect, useMemo, Fragment, memo } from 'react';
import type { SetTracklistVersion, SetTracklistSlot, SetTracklistCandidate, Track, SearchSuggestion } from '../types';
import { MAX_CANDIDATES_PER_SLOT } from '../types';
import { cleanTitle } from '../utils/trackTitle';
import { searchTracks } from '../api/http';
import { PlayButton } from './PlayButton';

interface Props {
  version: SetTracklistVersion;
  trackMap: Map<number, Track>;
  transitionScores: Map<string, number | null>;
  scoresLoading: boolean;
  onBranchFromSlot: (versionId: number, slotPosition: number, name: string) => void;
  onSelectCandidate: (slotId: number, candidateId: number) => Promise<void>;
  onRemoveCandidate: (slotId: number, candidateId: number) => Promise<void>;
  onAddCandidate: (slotId: number, trackId: number) => Promise<void>;
  onRemoveSlot: (versionId: number, slotId: number) => Promise<void>;
  onRefreshScores: () => void;
}

function trackForCandidate(c: SetTracklistCandidate, trackMap: Map<number, Track>): Track | null {
  const embedded = (c as unknown as Record<string, unknown>).track;
  if (embedded && typeof embedded === 'object' && (embedded as Record<string, unknown>).id != null) {
    return embedded as Track;
  }
  return trackMap.get(c.track_id) ?? null;
}

function TransitionInterstitial({ fromTrackId, toTrackId, score, loading }: {
  fromTrackId: number | null;
  toTrackId: number | null;
  score: number | null | undefined;
  loading: boolean;
}) {
  let display: string;
  if (!fromTrackId || !toTrackId) {
    display = '–';
  } else if (loading && score === undefined) {
    display = '…';
  } else if (score == null) {
    display = '–';
  } else {
    display = Math.round(score * 100).toString();
  }

  const isWeak = typeof score === 'number' && score < 0.4;

  return (
    <tr className={`slot-transition-row${isWeak ? ' slot-transition-row--weak' : ''}`} data-testid="slot-transition-row">
      <td colSpan={7}>
        <div className="slot-transition-inner">
          <span className="slot-transition-line" />
          <span
            className={`slot-transition-score${loading && score === undefined ? ' slot-transition-score--loading' : ''}${isWeak ? ' slot-transition-score--weak' : ''}`}
            data-testid="transition-score"
          >{display}</span>
          <span className="slot-transition-line" />
        </div>
      </td>
    </tr>
  );
}

function CandidateBadge({ count, isFull, onClick }: {
  count: number;
  isFull: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  if (count <= 1) return null;
  return (
    <button
      className={`candidate-badge${isFull ? ' candidate-badge--full' : ''}`}
      onClick={onClick}
      title={`${count} candidate${count === 1 ? '' : 's'}${isFull ? ' (full)' : ''}`}
      data-testid="candidate-badge"
    >
      {count}
    </button>
  );
}

// --- Slot Management Popover ---

function SlotPopover({
  slot,
  trackMap,
  onSelect,
  onRemove,
  onAdd,
  onDeleteSlot,
  onClose,
}: {
  slot: SetTracklistSlot;
  trackMap: Map<number, Track>;
  onSelect: (candidateId: number) => void;
  onRemove: (candidateId: number) => void;
  onAdd: (trackId: number) => void;
  onDeleteSlot: () => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFull = slot.candidates.length >= MAX_CANDIDATES_PER_SLOT;
  const isLastCandidate = slot.candidates.length === 1;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(() => {
      searchTracks(q).then(setSearchResults, () => setSearchResults([]));
    }, 250);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const existingTrackIds = useMemo(
    () => new Set(slot.candidates.map(c => c.track_id)),
    [slot.candidates],
  );

  const handleRemoveClick = (candidateId: number) => {
    if (isLastCandidate) {
      setConfirmDeleteId(candidateId);
    } else {
      onRemove(candidateId);
    }
  };

  const handleConfirmDeleteSlot = () => {
    setConfirmDeleteId(null);
    onDeleteSlot();
  };

  const handleAddTrack = (trackId: number) => {
    onAdd(trackId);
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  return (
    <div className="slot-popover" ref={popoverRef} data-testid="slot-popover">
      <div className="slot-popover__header">
        <span className="slot-popover__title">
          Slot {slot.position + 1} · {slot.candidates.length}/{MAX_CANDIDATES_PER_SLOT} candidates
        </span>
        <button className="slot-popover__close" onClick={onClose} data-testid="popover-close">×</button>
      </div>

      <ul className="slot-popover__list" data-testid="popover-candidate-list">
        {slot.candidates.map(c => {
          const track = trackForCandidate(c, trackMap);
          const title = track ? cleanTitle(track, track.id) : `Track ${c.track_id}`;
          return (
            <li
              key={c.id}
              className={`slot-popover__item${c.is_selected ? ' slot-popover__item--selected' : ''}`}
              data-testid={`popover-candidate-${c.id}`}
            >
              <PlayButton trackId={c.track_id} title={title} />
              <span className="slot-popover__item-title">{title}</span>
              <span className="slot-popover__item-meta mono">
                {track?.camelot_code ?? '—'} · {track?.bpm != null ? Math.round(track.bpm) : '—'}
              </span>
              <div className="slot-popover__item-actions">
                {!c.is_selected && (
                  <button
                    className="set-action-btn"
                    onClick={() => onSelect(c.id)}
                    title="Select as active candidate"
                    data-testid={`popover-select-${c.id}`}
                  >Select</button>
                )}
                {c.is_selected && <span className="slot-popover__selected-tag" data-testid={`popover-active-${c.id}`}>Active</span>}
                <button
                  className="set-action-btn set-action-btn--danger"
                  onClick={() => handleRemoveClick(c.id)}
                  title="Remove candidate"
                  data-testid={`popover-remove-${c.id}`}
                >×</button>
              </div>
            </li>
          );
        })}
      </ul>

      {confirmDeleteId !== null && (
        <div className="slot-popover__confirm" data-testid="popover-delete-confirm">
          <p>Removing the last candidate will delete this slot. Continue?</p>
          <div className="slot-popover__confirm-actions">
            <button className="set-action-btn set-action-btn--danger" onClick={handleConfirmDeleteSlot} data-testid="popover-confirm-delete">Delete slot</button>
            <button className="set-action-btn" onClick={() => setConfirmDeleteId(null)} data-testid="popover-cancel-delete">Cancel</button>
          </div>
        </div>
      )}

      {!isFull && (
        <div className="slot-popover__add-section">
          <input
            className="slot-popover__search-input"
            placeholder="Add candidate…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            data-testid="popover-search-input"
          />
          {searchOpen && searchResults.length > 0 && (
            <ul className="slot-popover__search-results" data-testid="popover-search-results">
              {searchResults.slice(0, 8).map(s => {
                const alreadyAdded = existingTrackIds.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`slot-popover__search-item${alreadyAdded ? ' slot-popover__search-item--disabled' : ''}`}
                    onClick={alreadyAdded ? undefined : () => handleAddTrack(s.id)}
                    data-testid={`popover-search-result-${s.id}`}
                  >
                    <span>{s.title}</span>
                    <span className="mono text-muted" style={{ fontSize: 10 }}>{s.camelot_code ?? '—'} · {s.bpm != null ? Math.round(s.bpm) : '—'}</span>
                    {alreadyAdded && <span className="slot-popover__already-tag">added</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {isFull && (
        <div className="slot-popover__full-notice" data-testid="popover-full-notice">
          Slot is full ({MAX_CANDIDATES_PER_SLOT} candidates max)
        </div>
      )}
    </div>
  );
}

// --- Slot Row ---

const SlotRow = memo(function SlotRow({ slot, index, trackMap, onBranch, isPopoverOpen, onTogglePopover }: {
  slot: SetTracklistSlot;
  index: number;
  trackMap: Map<number, Track>;
  onBranch: (slotPosition: number) => void;
  isPopoverOpen: boolean;
  onTogglePopover: (slotId: number) => void;
}) {
  const selected = slot.candidates.find(c => c.is_selected);
  const track = selected ? trackForCandidate(selected, trackMap) : null;
  const title = track ? cleanTitle(track, track.id) : `Slot ${slot.position + 1}`;
  const count = slot.candidates.length;
  const isFull = count >= MAX_CANDIDATES_PER_SLOT;

  const rowClass = [
    'slot-row',
    slot.is_inherited && 'slot-row--inherited',
    isFull && 'slot-row--full',
  ].filter(Boolean).join(' ');

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePopover(slot.id);
  };

  const handleManageClick = () => {
    onTogglePopover(slot.id);
  };

  return (
    <tr className={rowClass} data-testid="slot-row" data-slot-id={slot.id}>
      <td className="play-cell">
        {selected && track && <PlayButton trackId={selected.track_id} title={title} />}
      </td>
      <td className="mono set-ws-cell-num">{index + 1}</td>
      <td className="set-ws-cell-title" style={{ position: 'relative' }}>
        <span className="slot-title-group">
          <span className="slot-title-text">{title}</span>
          <CandidateBadge count={count} isFull={isFull} onClick={handleBadgeClick} />
          {slot.is_inherited && <span className="slot-inherited-tag" data-testid="inherited-tag">inherited</span>}
        </span>
        {isPopoverOpen && <div className="slot-popover-anchor" data-testid="popover-anchor" />}
      </td>
      <td className="mono set-ws-cell-key">{track?.camelot_code ?? '—'}</td>
      <td className="mono set-ws-cell-bpm">{track?.bpm != null ? Math.round(track.bpm) : '—'}</td>
      <td className="set-ws-cell-note">
        <span className="text-muted" style={{ fontSize: 11 }}>{slot.note || ''}</span>
      </td>
      <td className="set-ws-cell-actions">
        <div className="set-ws-actions-group">
          <button
            className="set-action-btn"
            onClick={handleManageClick}
            title="Manage candidates"
            data-testid={`manage-btn-${slot.id}`}
          >Manage</button>
          <button
            className="set-action-btn"
            onClick={() => onBranch(slot.position)}
            title="Branch from this slot"
            data-testid={`branch-btn-${slot.id}`}
          >Branch</button>
        </div>
      </td>
    </tr>
  );
});

// --- Main Component ---

export const SlotTracklist = memo(function SlotTracklist({
  version, trackMap, transitionScores, scoresLoading, onBranchFromSlot,
  onSelectCandidate, onRemoveCandidate, onAddCandidate, onRemoveSlot, onRefreshScores,
}: Props) {
  const sortedSlots = useMemo(
    () => [...version.slots].sort((a, b) => a.position - b.position),
    [version.slots],
  );

  const [openPopoverSlotId, setOpenPopoverSlotId] = useState<number | null>(null);
  const [branchSlotPos, setBranchSlotPos] = useState<number | null>(null);
  const [branchName, setBranchName] = useState('');
  const branchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branchSlotPos !== null && branchInputRef.current) branchInputRef.current.focus();
  }, [branchSlotPos]);

  const handleTogglePopover = useCallback((slotId: number) => {
    setOpenPopoverSlotId(prev => prev === slotId ? null : slotId);
  }, []);

  const handleClosePopover = useCallback(() => {
    setOpenPopoverSlotId(null);
  }, []);

  const handleSelectCandidate = useCallback(async (slotId: number, candidateId: number) => {
    await onSelectCandidate(slotId, candidateId);
    onRefreshScores();
  }, [onSelectCandidate, onRefreshScores]);

  const handleRemoveCandidate = useCallback(async (slotId: number, candidateId: number) => {
    await onRemoveCandidate(slotId, candidateId);
    onRefreshScores();
  }, [onRemoveCandidate, onRefreshScores]);

  const handleAddCandidate = useCallback(async (slotId: number, trackId: number) => {
    await onAddCandidate(slotId, trackId);
  }, [onAddCandidate]);

  const handleDeleteSlot = useCallback(async (slotId: number) => {
    setOpenPopoverSlotId(null);
    await onRemoveSlot(version.id, slotId);
    onRefreshScores();
  }, [version.id, onRemoveSlot, onRefreshScores]);

  const handleBranch = useCallback((slotPosition: number) => {
    setBranchSlotPos(slotPosition);
    setBranchName(`${version.name} (branch)`);
  }, [version.name]);

  const commitBranch = useCallback(() => {
    if (branchSlotPos === null) return;
    const name = branchName.trim();
    if (!name) return;
    onBranchFromSlot(version.id, branchSlotPos, name);
    setBranchSlotPos(null);
    setBranchName('');
  }, [branchSlotPos, branchName, version.id, onBranchFromSlot]);

  const cancelBranch = useCallback(() => {
    setBranchSlotPos(null);
    setBranchName('');
  }, []);

  const scoreKey = (fromSlot: SetTracklistSlot, toSlot: SetTracklistSlot): { from: number | null; to: number | null; score: number | null | undefined } => {
    const from = fromSlot.candidates.find(c => c.is_selected);
    const to = toSlot.candidates.find(c => c.is_selected);
    if (!from || !to) return { from: null, to: null, score: undefined };
    const key = `${from.track_id}-${to.track_id}`;
    return { from: from.track_id, to: to.track_id, score: transitionScores.get(key) };
  };

  const popoverSlot = openPopoverSlotId !== null
    ? version.slots.find(s => s.id === openPopoverSlotId) ?? null
    : null;

  return (
    <div className="set-tracklist slot-tracklist" data-testid="slot-tracklist">
      <div className="set-tracklist-header">
        <h3 className="set-section-title">Tracklist ({sortedSlots.length} slots)</h3>
      </div>

      {branchSlotPos !== null && (
        <div className="slot-branch-bar" data-testid="branch-bar">
          <span className="slot-branch-label">Branch after slot {branchSlotPos + 1}:</span>
          <input
            ref={branchInputRef}
            className="version-tab-create-input"
            value={branchName}
            onChange={e => setBranchName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitBranch();
              if (e.key === 'Escape') cancelBranch();
            }}
          />
          <button className="set-action-btn" onClick={commitBranch}>Create</button>
          <button className="set-action-btn" onClick={cancelBranch}>Cancel</button>
        </div>
      )}

      <div className="set-table-scroll-shell">
        {sortedSlots.length === 0 ? (
          <p className="set-empty-tracks">No slots in this version.</p>
        ) : (
          <table className="set-tracklist-table" data-testid="slot-table">
            <colgroup>
              <col className="set-ws-col-play" />
              <col className="set-ws-col-num" />
              <col className="set-ws-col-title" />
              <col className="set-ws-col-key" />
              <col className="set-ws-col-bpm" />
              <col className="set-ws-col-note" />
              <col className="set-ws-col-actions-tracklist" />
            </colgroup>
            <thead>
              <tr>
                <th className="set-ws-th" style={{ width: 32 }} />
                <th className="set-ws-th">#</th>
                <th className="set-ws-th">Title</th>
                <th className="set-ws-th">Key</th>
                <th className="set-ws-th">BPM</th>
                <th className="set-ws-th">Note</th>
                <th className="set-ws-th set-ws-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSlots.map((slot, i) => (
                <Fragment key={slot.id}>
                  <SlotRow
                    slot={slot}
                    index={i}
                    trackMap={trackMap}
                    onBranch={handleBranch}
                    isPopoverOpen={openPopoverSlotId === slot.id}
                    onTogglePopover={handleTogglePopover}
                  />
                  {i < sortedSlots.length - 1 && (() => {
                    const s = scoreKey(slot, sortedSlots[i + 1]);
                    return (
                      <TransitionInterstitial
                        fromTrackId={s.from}
                        toTrackId={s.to}
                        score={s.score}
                        loading={scoresLoading}
                      />
                    );
                  })()}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {popoverSlot && (
        <SlotPopover
          slot={popoverSlot}
          trackMap={trackMap}
          onSelect={(candidateId) => handleSelectCandidate(popoverSlot.id, candidateId)}
          onRemove={(candidateId) => handleRemoveCandidate(popoverSlot.id, candidateId)}
          onAdd={(trackId) => handleAddCandidate(popoverSlot.id, trackId)}
          onDeleteSlot={() => handleDeleteSlot(popoverSlot.id)}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
});
