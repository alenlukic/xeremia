import type {
  CacheStats,
  KeyDistEntry,
  BpmDistEntry,
  CacheEntry,
  CacheExit,
} from '../types'
import { WeightControls } from './WeightControls'

interface Props {
  stats: CacheStats | null
  loading: boolean
  error: string | null
  weights: Record<string, number>
  weightsLoading: boolean
  setWeight: (factor: string, value: number) => void
  weightsSaving: boolean
  weightsSaveSuccess: boolean
  weightsError: string | null
  weightsWarning: string | null
  normalizeWeights: () => void
  resetWeights: () => void
  isSumValid: boolean
  rawSum: number
}

function ringColor(ratio: number): string {
  const pct = ratio * 100
  if (pct >= 90) {
    return '#ef4444'
  }
  if (pct >= 75) {
    return '#fb923c'
  }
  if (pct >= 50) {
    return '#facc15'
  }
  return '#4ade80'
}

function UsageRing({
  used,
  capacity,
  ratio,
}: {
  used: number
  capacity: number
  ratio: number
}) {
  const r = 52
  const stroke = 8
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(ratio, 1))
  const pct = (ratio * 100).toFixed(1)

  return (
    <div className="admin-card admin-usage-card">
      <h3 className="admin-card-title">Cache Usage</h3>
      <div className="usage-ring-container">
        <svg viewBox="0 0 128 128" className="usage-ring-svg">
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke={ringColor(ratio)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="usage-ring-center">
          <span className="usage-ring-pct">{pct}%</span>
          <span className="usage-ring-label">
            {used.toLocaleString()} / {capacity.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

function HitRateCard({
  hitRate,
  hits,
  misses,
  basis,
}: {
  hitRate: number
  hits: number
  misses: number
  basis: string
}) {
  return (
    <div className="admin-card admin-kpi-card">
      <h3 className="admin-card-title">Hit Rate</h3>
      <div className="kpi-value mono">{(hitRate * 100).toFixed(1)}%</div>
      <div className="kpi-detail text-muted">
        {hits.toLocaleString()} hits · {misses.toLocaleString()} misses
      </div>
      <div className="kpi-basis text-muted">{basis.replace(/_/g, ' ')}</div>
    </div>
  )
}

function BarChart({
  data,
  labelKey,
  valueKey,
  title,
}: {
  data: { label: string; value: number }[]
  labelKey?: string
  valueKey?: string
  title: string
}) {
  void labelKey
  void valueKey
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="admin-card admin-chart-card">
      <h3 className="admin-card-title">{title}</h3>
      {data.length === 0 ? (
        <p className="text-muted admin-empty">No data</p>
      ) : (
        <div className="bar-chart">
          {data.map((d) => (
            <div key={d.label} className="bar-row">
              <span className="bar-label mono">{d.label}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(d.value / max) * 100}%` }}
                />
              </div>
              <span className="bar-value mono">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString()
}

function RecentList({
  title,
  entries,
  exits,
}: {
  title: string
  entries?: CacheEntry[]
  exits?: CacheExit[]
}) {
  const items = entries
    ? entries.map((e) => ({ pair: e.pair, time: e.timestamp, extra: null }))
    : (exits ?? []).map((e) => ({
        pair: e.pair,
        time: e.timestamp,
        extra: e.reason,
      }))

  return (
    <div className="admin-card admin-recent-card">
      <h3 className="admin-card-title">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted admin-empty">None yet</p>
      ) : (
        <ul className="recent-list">
          {items.map((item, i) => (
            <li key={i} className="recent-item">
              <span className="mono recent-pair">
                {item.pair[0]} ↔ {item.pair[1]}
              </span>
              <span className="text-muted recent-time">
                {formatTimestamp(item.time)}
              </span>
              {item.extra && (
                <span className="text-muted recent-reason">{item.extra}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CacheStatsSection({
  stats,
  loading,
  error,
}: {
  stats: CacheStats | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return <p className="table-status">Loading admin data…</p>
  }

  if (error) {
    return <p className="table-status admin-error">{error}</p>
  }

  if (!stats) {
    return <p className="table-status">No cache data available</p>
  }

  const keyData: { label: string; value: number }[] =
    stats.key_distribution.map((d: KeyDistEntry) => ({
      label: d.key,
      value: d.count,
    }))
  const bpmData: { label: string; value: number }[] =
    stats.bpm_distribution.map((d: BpmDistEntry) => ({
      label: `${d.bin_start}–${d.bin_end}`,
      value: d.count,
    }))

  return (
    <>
      <div className="admin-top-row">
        <UsageRing
          used={stats.used}
          capacity={stats.capacity}
          ratio={stats.usage_ratio}
        />
        <HitRateCard
          hitRate={stats.hit_rate}
          hits={stats.hits}
          misses={stats.misses}
          basis={stats.hit_rate_basis}
        />
      </div>
      <div className="admin-charts-row">
        <BarChart data={keyData} title="Key Distribution" />
        <BarChart data={bpmData} title="BPM Distribution" />
      </div>
      <div className="admin-recent-row">
        <RecentList title="Recent Entries" entries={stats.recent_entries} />
        <RecentList title="Recent Exits" exits={stats.recent_exits} />
      </div>
    </>
  )
}

export function AdminDashboard({
  stats,
  loading,
  error,
  weights,
  weightsLoading,
  setWeight,
  weightsSaving,
  weightsSaveSuccess,
  weightsError,
  weightsWarning,
  normalizeWeights,
  resetWeights,
  isSumValid,
  rawSum,
}: Props) {
  return (
    <div className="admin-dashboard">
      <div className="admin-card admin-weights-card">
        <div className="admin-weights-header">
          <h3 className="admin-card-title">Transition Weights</h3>
          <div className="admin-weights-actions">
            <button
              className="weight-normalize-btn weight-normalize-btn--secondary"
              onClick={resetWeights}
            >
              Reset Weights
            </button>
            <button
              className={`weight-normalize-btn${isSumValid ? ' inactive' : ''}`}
              disabled={isSumValid}
              onClick={normalizeWeights}
            >
              Normalize Weights
              {!isSumValid && ` (${Number(rawSum.toFixed(1))})`}
            </button>
          </div>
        </div>
        {weightsLoading ? (
          <p className="table-status">Loading weights…</p>
        ) : (
          <WeightControls
            weights={weights}
            setWeight={setWeight}
            saving={weightsSaving}
            saveSuccess={weightsSaveSuccess}
            saveError={weightsError}
            warningMessage={weightsWarning}
          />
        )}
      </div>
      <CacheStatsSection stats={stats} loading={loading} error={error} />
    </div>
  )
}
