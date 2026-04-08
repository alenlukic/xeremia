import { useState, useEffect, useCallback, useRef } from 'react';
import type { DjSet } from '../types';
import { fetchTransitionScores, exportSetM3u8 } from '../api/http';
import { formatOverallScore } from '../utils';

export const WEAK_THRESHOLD = 65;

interface Props {
  sets: DjSet[];
  activeSet: DjSet | null;
  activeSetId: string | null;
  createSet: (name: string) => void;
  selectSet: (id: string) => void;
  deleteSet: (id: string) => void;
  removeTrack: (index: number) => void;
  moveTrack: (fromIndex: number, toIndex: number) => void;
}

export function SetBuilder({
  sets,
  activeSet,
  activeSetId,
  createSet,
  selectSet,
  deleteSet,
  removeTrack,
  moveTrack,
}: Props) {
  const [newSetName, setNewSetName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [scores, setScores] = useState<Map<string, number | null>>(new Map());
  const [scoresLoading, setScoresLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trackIds =
    activeSet?.tracks.map(e => e.track.id).join(',') ?? '';

  useEffect(() => {
    if (!activeSet || activeSet.tracks.length < 2) {
      setScores(new Map());
      return;
    }

    const pairs: [number, number][] = [];
    for (let i = 0; i < activeSet.tracks.length - 1; i++) {
      pairs.push([
        activeSet.tracks[i].track.id,
        activeSet.tracks[i + 1].track.id,
      ]);
    }

    let cancelled = false;
    setScoresLoading(true);
    fetchTransitionScores(pairs)
      .then(result => {
        if (cancelled) return;
        const map = new Map<string, number | null>();
        pairs.forEach((pair, i) => {
          map.set(`${pair[0]}-${pair[1]}`, result.scores[i] ?? null);
        });
        setScores(map);
      })
      .catch(() => {
        if (!cancelled) setScores(new Map());
      })
      .finally(() => {
        if (!cancelled) setScoresLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIds]);

  useEffect(() => {
    if (showNewInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewInput]);

  const handleCreateSet = useCallback(() => {
    const name = newSetName.trim();
    if (!name) return;
    createSet(name);
    setNewSetName('');
    setShowNewInput(false);
  }, [newSetName, createSet]);

  const handleExport = useCallback(async () => {
    if (!activeSet || activeSet.tracks.length === 0) return;
    try {
      const ids = activeSet.tracks.map(e => e.track.id);
      const result = await exportSetM3u8(ids, activeSet.name);
      const blob = new Blob([result.content], { type: 'audio/x-mpegurl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* export failure is non-critical */
    }
  }, [activeSet]);

  const getScore = (fromId: number, toId: number): number | null => {
    return scores.get(`${fromId}-${toId}`) ?? null;
  };

  if (sets.length === 0 && !showNewInput) {
    return (
      <div className="set-builder">
        <div className="set-empty">
          <p>No sets yet. Create one to start building a playlist.</p>
          <button
            className="set-create-btn"
            onClick={() => setShowNewInput(true)}
          >
            + New Set
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-builder">
      <div className="set-header">
        <div className="set-selector">
          <select
            className="set-select"
            value={activeSetId ?? ''}
            onChange={e => selectSet(e.target.value)}
          >
            {sets.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.tracks.length})
              </option>
            ))}
          </select>
          <button
            className="set-create-btn"
            onClick={() => setShowNewInput(true)}
          >
            + New
          </button>
          {activeSetId && (
            <button
              className="set-delete-btn"
              onClick={() => deleteSet(activeSetId)}
              title="Delete set"
            >
              ×
            </button>
          )}
        </div>

        {showNewInput && (
          <div className="set-new-input-row">
            <input
              ref={inputRef}
              className="set-name-input"
              placeholder="Set name…"
              value={newSetName}
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateSet();
                if (e.key === 'Escape') {
                  setShowNewInput(false);
                  setNewSetName('');
                }
              }}
            />
            <button className="set-create-confirm" onClick={handleCreateSet}>
              Create
            </button>
          </div>
        )}

        {activeSet && activeSet.tracks.length > 0 && (
          <button className="set-export-btn" onClick={handleExport}>
            Export m3u8
          </button>
        )}
      </div>

      {activeSet && (
        <div className="set-track-list">
          {activeSet.tracks.length === 0 ? (
            <p className="set-empty-tracks">
              No tracks in this set. Add tracks from the Matches or Browse tab.
            </p>
          ) : (
            activeSet.tracks.map((entry, i) => (
              <div key={`set-${entry.track.id}-${i}`}>
                {i > 0 && (
                  <TransitionIndicator
                    score={getScore(
                      activeSet.tracks[i - 1].track.id,
                      entry.track.id,
                    )}
                    loading={scoresLoading}
                  />
                )}
                <div className="set-track-row">
                  <span className="set-track-num">{i + 1}</span>
                  <div className="set-track-info">
                    <span className="set-track-title">{entry.track.title}</span>
                    <span className="set-track-meta">
                      {entry.track.camelot_code && (
                        <span className="mono">{entry.track.camelot_code}</span>
                      )}
                      {entry.track.bpm != null && (
                        <span className="mono"> · {entry.track.bpm}</span>
                      )}
                    </span>
                  </div>
                  <div className="set-track-actions">
                    <button
                      className="set-move-btn"
                      disabled={i === 0}
                      onClick={() => moveTrack(i, i - 1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="set-move-btn"
                      disabled={i === activeSet.tracks.length - 1}
                      onClick={() => moveTrack(i, i + 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="set-remove-btn"
                      onClick={() => removeTrack(i)}
                      title="Remove from set"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TransitionIndicator({
  score,
  loading,
}: {
  score: number | null;
  loading: boolean;
}) {
  const isWeak = score !== null && score < WEAK_THRESHOLD;

  return (
    <div
      className={`set-transition${isWeak ? ' set-transition--weak' : ''}`}
      data-testid="transition-indicator"
    >
      <div className="set-transition-line" />
      <span
        className={`set-transition-score mono${isWeak ? ' set-transition-score--weak' : ''}`}
      >
        {loading ? '…' : score !== null ? formatOverallScore(score) : '—'}
      </span>
      <div className="set-transition-line" />
    </div>
  );
}
