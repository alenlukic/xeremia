import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { dragSensitivity, gaugeWeightToFill } from '../utils';

const FUSION_SUBFACTOR_KEYS = [
  { key: 'FUSION_HARMONIC', label: 'Harmonic' },
  { key: 'FUSION_RHYTHM',   label: 'Rhythm' },
  { key: 'FUSION_TIMBRE',   label: 'Timbre' },
  { key: 'FUSION_ENERGY',   label: 'Energy' },
] as const;

const FACTOR_LABELS: Record<string, string> = {
  CAMELOT: 'Key',
  BPM: 'BPM',
  SIMILARITY: 'Spectral',
  FRESHNESS: 'Recency',
  ENERGY: 'Energy (MIK)',
  GENRE_SIMILARITY: 'Genre',
  MOOD_CONTINUITY: 'Mood',
  VOCAL_CLASH: 'Vocals',
  INSTRUMENT_SIMILARITY: 'Instruments',
};

const FACTOR_TOOLTIPS: Record<string, string> = {
  BPM: 'Tempo proximity \u2014 how closely the two tracks match in beats per minute',
  CAMELOT: 'Harmonic key compatibility using the Camelot Wheel \u2014 adjacent keys mix well',
  GENRE_SIMILARITY: 'Stylistic genre similarity between the two tracks',
  FRESHNESS: 'How recently the tracks were released \u2014 more recent tracks are favored',
  ENERGY: 'Energy level as analyzed by Mixed In Key \u2014 measures intensity and drive',
  MOOD_CONTINUITY: 'Emotional mood similarity \u2014 e.g. dark vs. euphoric, tense vs. relaxed',
  INSTRUMENT_SIMILARITY: 'Similarity in dominant instrumental texture and arrangement',
  VOCAL_CLASH: 'Vocal presence similarity \u2014 both tracks vocal, both instrumental, or mixed',
  SIMILARITY: 'Similarity in overall frequency distribution and sonic brightness',
  FUSION_HARMONIC: 'Chord and harmonic content similarity beyond simple key matching',
  FUSION_RHYTHM: 'Rhythmic pattern and groove similarity \u2014 feel, syncopation, pulse',
  FUSION_TIMBRE: 'Tonal color and texture similarity \u2014 the \u201csound\u201d of the production',
  FUSION_ENERGY: 'Energy level from fused audio analysis \u2014 complements MIK with additional signal',
};

const GAUGE_ROWS: { factors: string[]; colorClass: string }[] = [
  { factors: ['BPM', 'CAMELOT', 'GENRE_SIMILARITY', 'FRESHNESS'], colorClass: 'weight-gauge--crimson' },
  {
    factors: ['ENERGY', 'MOOD_CONTINUITY', 'INSTRUMENT_SIMILARITY', 'VOCAL_CLASH'],
    colorClass: 'weight-gauge--teal',
  },
];

interface GaugeProps {
  factor: string;
  value: number;
  onChange: (factor: string, value: number) => void;
  colorClass?: string;
  readOnly?: boolean;
  label?: string;
  hideLabel?: boolean;
  small?: boolean;
}

const ARC_RADIUS = 24;
const ARC_STROKE = 4;
const START_ANGLE = -135;
const END_ANGLE = 135;
const SWEEP = END_ANGLE - START_ANGLE;

const HOLD_INITIAL_DELAY_MS = 300;
const HOLD_RATE_FACTOR = 55;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function WeightGaugeBase({ factor, value, onChange, colorClass, readOnly, label, hideLabel }: GaugeProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [dragValue, setDragValue] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamped = Math.max(0, Math.min(100, value));
  const displayValue = dragValue !== null ? dragValue : clamped;
  const fillPct = gaugeWeightToFill(displayValue);
  const valueAngle = START_ANGLE + (fillPct / 100) * SWEEP;
  const cx = 30;
  const cy = 30;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readOnly) return;
      const svg = svgRef.current;
      if (!svg) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);

      let currentWeight = clamped;

      const getAngle = (clientX: number, clientY: number) => {
        const rect = svg.getBoundingClientRect();
        const mx = clientX - rect.left - cx * (rect.width / 60);
        const my = clientY - rect.top - cy * (rect.height / 42);
        return (Math.atan2(mx, -my) * 180) / Math.PI;
      };

      let prevAngle = getAngle(e.clientX, e.clientY);

      const onMove = (ev: PointerEvent) => {
        const angle = getAngle(ev.clientX, ev.clientY);
        let rawDelta = angle - prevAngle;
        if (rawDelta > 180) rawDelta -= 360;
        if (rawDelta < -180) rawDelta += 360;
        prevAngle = angle;

        const sensitivity = dragSensitivity(currentWeight);
        currentWeight = Math.max(0, Math.min(100, currentWeight + rawDelta * sensitivity));
        setDragValue(currentWeight);
      };

      const onUp = () => {
        onChange(factor, Math.round(currentWeight));
        setDragValue(null);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [factor, onChange, readOnly, clamped],
  );

  // --- Hold-to-adjust for +/- buttons ---
  const stopHold = useCallback(() => {
    if (holdRef.current !== null) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const startHold = useCallback(
    (direction: 1 | -1) => {
      if (readOnly) return;
      stopHold();

      let currentWeight = Math.max(0, Math.min(100, value + direction));
      onChange(factor, currentWeight);

      let accumulator = 0;
      let lastTime = 0;

      const tick = () => {
        const now = performance.now();
        if (lastTime === 0) lastTime = now;
        const dt = now - lastTime;
        lastTime = now;

        const rate = (dragSensitivity(Math.abs(currentWeight)) * HOLD_RATE_FACTOR) / 1000;
        accumulator += dt * rate;

        while (accumulator >= 1) {
          accumulator -= 1;
          const next = currentWeight + direction;
          if (next < 0 || next > 100) { accumulator = 0; break; }
          currentWeight = next;
          onChange(factor, currentWeight);
        }

        holdRef.current = setTimeout(tick, 16);
      };

      holdRef.current = setTimeout(tick, HOLD_INITIAL_DELAY_MS);

      const onUp = () => {
        stopHold();
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [factor, value, onChange, readOnly, stopHold],
  );

  const handleInputBlur = useCallback(() => {
    setEditing(false);
    const num = parseFloat(inputVal);
    if (!isNaN(num)) {
      onChange(factor, Math.max(0, Math.min(100, Math.round(num))));
    }
  }, [inputVal, factor, onChange]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleInputBlur();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleInputBlur],
  );

  const displayLabel = label ?? FACTOR_LABELS[factor] ?? factor;
  const gaugeClass = ['weight-gauge', colorClass].filter(Boolean).join(' ');

  return (
    <div className={gaugeClass}>
      <div className="gauge-arc-pane">
        <svg
          ref={svgRef}
          viewBox="0 0 60 42"
          className="weight-gauge-svg"
          onPointerDown={handlePointerDown}
          style={readOnly ? { cursor: 'default' } : undefined}
        >
          <path
            d={arcPath(cx, cy, ARC_RADIUS, START_ANGLE, END_ANGLE)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
          />
          {displayValue > 0 && (
            <path
              d={arcPath(cx, cy, ARC_RADIUS, START_ANGLE, valueAngle)}
              fill="none"
              stroke="var(--gauge-accent, var(--accent))"
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
            />
          )}
        </svg>
        {!hideLabel && (
          <div className="gauge-value-overlay">
            {editing ? (
              <input
                type="number"
                className="weight-gauge-input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                min={0}
                max={100}
                autoFocus
              />
            ) : (
              <span
                className="gauge-value-display"
                style={readOnly ? undefined : { cursor: 'pointer' }}
                onClick={readOnly ? undefined : (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setInputVal(String(Math.round(clamped)));
                  setEditing(true);
                }}
              >
                {Math.round(displayValue)}
              </span>
            )}
          </div>
        )}
      </div>
      {!hideLabel && !readOnly && (
        <div className="gauge-adjust-row">
          <button
            className="gauge-adjust-btn"
            onPointerDown={(e) => { e.preventDefault(); startHold(-1); }}
            tabIndex={-1}
          >
            −
          </button>
          <button
            className="gauge-adjust-btn"
            onPointerDown={(e) => { e.preventDefault(); startHold(1); }}
            tabIndex={-1}
          >
            +
          </button>
        </div>
      )}
      {!hideLabel && (
        <span
          className="weight-gauge-label"
          data-tooltip={FACTOR_TOOLTIPS[factor] ?? undefined}
        >
          {displayLabel}
        </span>
      )}
    </div>
  );
}

const WeightGauge = memo(WeightGaugeBase);

interface Props {
  weights: Record<string, number>;
  setWeight: (factor: string, value: number) => void;
  saving?: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  warningMessage?: string | null;
}

export const WeightControls = memo(function WeightControls({
  weights,
  setWeight,
  saving,
  saveSuccess,
  saveError,
  warningMessage,
}: Props) {
  const factors = Object.keys(weights);
  if (factors.length === 0) return null;

  const showStatus = saving || saveSuccess || saveError || warningMessage;

  return (
    <div className="weight-controls-outer" data-testid="weight-controls-outer">
      <div className="weight-controls-row" data-testid="weight-controls-row">
        <div className="gauge-group gauge-group--bpm">
          {GAUGE_ROWS[0].factors
            .filter((f) => f in weights)
            .map((f) => (
              <WeightGauge
                key={f}
                factor={f}
                value={weights[f]}
                onChange={setWeight}
                colorClass={GAUGE_ROWS[0].colorClass}
              />
            ))}
        </div>
        <div className="gauge-group gauge-group--energy">
          {GAUGE_ROWS[1].factors
            .filter((f) => f in weights)
            .map((f) => (
              <WeightGauge
                key={f}
                factor={f}
                value={weights[f]}
                onChange={setWeight}
                colorClass={GAUGE_ROWS[1].colorClass}
              />
            ))}
        </div>
        <div className="gauge-group gauge-group--fusion">
          {factors.includes('SIMILARITY') && (
            <div className="fusion-pane">
              <WeightGauge
                factor="SIMILARITY"
                value={weights['SIMILARITY']}
                onChange={setWeight}
                colorClass="weight-gauge--violet"
              />
              <div className="fusion-subfactors">
                {FUSION_SUBFACTOR_KEYS.map((item) => (
                  <WeightGauge
                    key={item.key}
                    factor={item.key}
                    value={weights[item.key] ?? 0}
                    onChange={setWeight}
                    colorClass="weight-gauge--white"
                    label={item.label}
                    small
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showStatus && (
        <div className="weight-save-status" role="status">
          {saveError && (
            <span className="weight-save-status__error">{saveError}</span>
          )}
          {saving && !saveError && (
            <span className="weight-save-status__saving">Saving…</span>
          )}
          {saveSuccess && !saving && !saveError && (
            <span className="weight-save-status__success">Saved</span>
          )}
          {warningMessage && !saveError && (
            <span className="weight-save-status__warning">{warningMessage}</span>
          )}
        </div>
      )}
    </div>
  );
});
