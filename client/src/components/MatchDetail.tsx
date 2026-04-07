import { useEffect, useReducer } from 'react';
import type {
  Track,
  SearchSuggestion,
  TransitionMatch,
  MatchDetail as MatchDetailData,
  MatchDetailTrackInfo,
} from '../types';
import type { TraitMap } from '../hooks/useCollectionCache';
import { fetchMatchDetail } from '../api/http';
import { formatFloat, formatScore, formatOverallScore, displayGenre } from '../utils';

type DetailState = { loading: boolean; detail: MatchDetailData | null; error: string | null };
type DetailAction =
  | { type: 'fetch' }
  | { type: 'success'; detail: MatchDetailData }
  | { type: 'error'; message: string };

function detailReducer(_: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case 'fetch':
      return { loading: true, detail: null, error: null };
    case 'success':
      return { loading: false, detail: action.detail, error: null };
    case 'error':
      return { loading: false, detail: null, error: action.message };
  }
}

interface Props {
  sourceTrack: Track | SearchSuggestion | null;
  match: TransitionMatch;
  onBack: () => void;
  traitMap: TraitMap;
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined)
    return <span className="text-muted">—</span>;
  if (typeof value === 'number')
    return <span className="mono">{formatFloat(value)}</span>;
  if (typeof value === 'string') return <span>{value}</span>;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted">—</span>;
    return (
      <div className="json-grid">
        {entries
          .sort(([, a], [, b]) => (Number(b) || 0) - (Number(a) || 0))
          .slice(0, 10)
          .map(([k, v]) => (
            <div key={k} className="json-row">
              <span className="json-key">{k}</span>
              <span className="mono json-val">
                {typeof v === 'number' ? formatFloat(v) : String(v)}
              </span>
            </div>
          ))}
        {entries.length > 10 && (
          <div className="json-row">
            <span className="text-muted">… {entries.length - 10} more</span>
          </div>
        )}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

const TRAIT_LABELS: Record<string, string> = {
  voice_instrumental: 'Voice / Instrumental',
  onset_density: 'Onset Density',
  spectral_flatness: 'Spectral Flatness',
  mood_theme: 'Mood / Theme',
  genre: 'Genre',
  instruments: 'Instruments',
};

type FieldDef = { label: string; getValue: (t: MatchDetailTrackInfo) => unknown };

const FIXED_ROWS: FieldDef[][] = [
  [
    { label: 'Genre', getValue: (t) => displayGenre(t.genre) },
    { label: 'Label', getValue: (t) => t.label },
  ],
  [
    { label: 'BPM', getValue: (t) => t.bpm },
    { label: 'Key', getValue: (t) => t.key },
    { label: 'Camelot', getValue: (t) => t.camelot_code },
    { label: 'Energy', getValue: (t) => t.energy },
  ],
  [
    { label: 'Voice / Instrumental', getValue: (t) => t.traits?.['voice_instrumental'] },
    { label: 'Onset Density', getValue: (t) => t.traits?.['onset_density'] },
    { label: 'Spectral Flatness', getValue: (t) => t.traits?.['spectral_flatness'] },
  ],
];

const VARIABLE_KEYS = ['mood_theme', 'genre', 'instruments'] as const;

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MatchDetail({ sourceTrack, match, onBack, traitMap }: Props) {
  const [{ loading, detail, error }, dispatch] = useReducer(detailReducer, {
    loading: true,
    detail: null,
    error: null,
  });

  useEffect(() => {
    if (!sourceTrack) return;
    dispatch({ type: 'fetch' });
    fetchMatchDetail(sourceTrack.id, match.candidate_id)
      .then((result) => {
        if (traitMap.size > 0) {
          result.on_deck.traits = traitMap.get(result.on_deck.id) ?? result.on_deck.traits;
          result.candidate.traits = traitMap.get(result.candidate.id) ?? result.candidate.traits;
        }
        dispatch({ type: 'success', detail: result });
      })
      .catch((err: unknown) => dispatch({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load match detail',
      }));
  }, [sourceTrack, match, traitMap]);

  if (loading) {
    return (
      <div className="match-detail">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <p className="table-status">Loading detail…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="match-detail">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <p className="table-status table-status--error">
          Failed to load match detail{error ? ` — ${error}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="match-detail">
      <button className="back-button" onClick={onBack}>
        ← Back to matches
      </button>

      <div className="detail-header">
        <h2 className="detail-title">
          Match Detail —{' '}
          <span className="mono">{formatOverallScore(detail.overall_score)}</span>
        </h2>
        <div className="detail-tracks-summary">
          <span>{detail.on_deck.title}</span>
          <span className="text-muted">→</span>
          <span>{detail.candidate.title}</span>
        </div>
      </div>

      <div className="detail-section">
        <h3 className="detail-section-title">Factor Breakdown</h3>
        <table className="factor-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Score</th>
              <th>Weight</th>
              <th>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {detail.factors.map((f) => (
              <tr key={f.name}>
                <td>{f.name === 'Similarity' ? 'Spectral' : f.name}</td>
                <td className="mono">{formatScore(f.score)}</td>
                <td className="mono">{formatScore(f.weight)}</td>
                <td className="mono">{formatScore(f.score * f.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="detail-section">
        <h3 className="detail-section-title">Track Inputs</h3>
        <div className="detail-tracks-grid">
          {[detail.on_deck, detail.candidate].map((track) => (
            <div key={track.id} className="detail-track-card">
              <h4 className="detail-card-title">{track.title}</h4>
              <div className="detail-card-fields">
                {FIXED_ROWS.map((row, ri) => (
                  <div key={ri} className={`detail-row detail-row--${row.length}`}>
                    {row.map((field) => (
                      <div key={field.label} className="detail-field-h">
                        <span className="detail-field-label">{field.label}</span>
                        {renderValue(field.getValue(track))}
                      </div>
                    ))}
                  </div>
                ))}
                {track.traits &&
                  VARIABLE_KEYS.map((key) => {
                    const rawVal = track.traits?.[key];
                    if (rawVal === undefined || rawVal === null) return null;
                    if (typeof rawVal !== 'object') {
                      return (
                        <div key={key} className="detail-var-section">
                          <span className="detail-field-label">
                            {TRAIT_LABELS[key] ?? key}
                          </span>
                          {renderValue(rawVal)}
                        </div>
                      );
                    }
                    let entries = Object.entries(
                      rawVal as Record<string, unknown>,
                    );
                    if (key === 'genre') {
                      entries = entries.map(([k, v]) => [
                        displayGenre(k) ?? k,
                        v,
                      ]);
                    }
                    entries.sort(
                      ([, a], [, b]) => (Number(b) || 0) - (Number(a) || 0),
                    );
                    const totalCount = entries.length;
                    entries = entries.slice(0, 10);
                    if (entries.length === 0) return null;
                    const remaining = totalCount - entries.length;
                    return (
                      <div key={key} className="detail-var-section">
                        <span className="detail-field-label">
                          {TRAIT_LABELS[key] ?? key}
                        </span>
                        <div className="detail-var-grid">
                          {entries.map(([k, v]) => (
                            <div key={k} className="detail-field-h">
                              <span className="detail-var-key">
                                {capitalizeFirst(k)}
                              </span>
                              <span className="mono detail-var-val">
                                {typeof v === 'number'
                                  ? formatFloat(v)
                                  : capitalizeFirst(String(v))}
                              </span>
                            </div>
                          ))}
                        </div>
                        {remaining > 0 && (
                          <span className="text-muted detail-var-more">
                            … {remaining} more
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
