import { useState } from 'react'
import {
  effectivePlayedBpm,
  type BenchBlock,
  type BlockOverride,
  type LaidBlock,
  type OverrideMap,
} from '../hooks/useSequencer'
import {
  formatHM,
  formatMinutes,
  parseMinutes,
  parseTimeInput,
} from '../utils/time'

// The 32px inspector footer for the selected block. Both block types get the
// same controls; only a committed block's auto-scale factor is shown, and only
// a committed block persists its overrides through the tracklist endpoint.

interface Props {
  block: LaidBlock | null
  /** Set when the selection is a benched candidate rather than a committed block. */
  benched?: BenchBlock | null
  overrides: OverrideMap
  benchOverrides: OverrideMap
  onPatch: (patch: Partial<BlockOverride>) => void
  onReset: () => void
  onBench: () => void
  onCommit: () => void
  onRemove: () => void
}

export function SequencerFooter({
  block,
  benched,
  overrides,
  benchOverrides,
  onPatch,
  onReset,
  onBench,
  onCommit,
  onRemove,
}: Props) {
  if (block) {
    return (
      // Remounting on selection re-seeds the fields, so typing never fights the
      // store while one block stays selected.
      <BlockInspector
        key={`committed-${block.entry.track_id}`}
        title={block.entry.track?.title ?? ''}
        meta={`${block.entry.track?.camelot_code ?? '—'} · ${formatHM(block.t)}–${formatHM(block.t + block.dur)}`}
        scale={block.scale}
        bpmSeed={effectivePlayedBpm(block, overrides)}
        playsSeed={block.dur}
        endsSeed={block.pinned ? block.t + block.dur : null}
        override={overrides[block.entry.track_id] ?? {}}
        stateAction="Bench"
        onPatch={onPatch}
        onReset={onReset}
        onStateChange={onBench}
        onRemove={onRemove}
      />
    )
  }

  if (!benched) {
    return null
  }

  return (
    <BlockInspector
      key={`benched-${benched.entry.track_id}`}
      title={benched.entry.track?.title ?? ''}
      meta={`${benched.entry.track?.camelot_code ?? '—'} · benched · ${formatHM(benched.t)}`}
      scale={1}
      bpmSeed={benched.entry.track?.bpm ?? null}
      playsSeed={benched.dur}
      endsSeed={null}
      override={benchOverrides[benched.entry.track_id] ?? {}}
      stateAction="Commit"
      onPatch={onPatch}
      onReset={onReset}
      onStateChange={onCommit}
      onRemove={onRemove}
    />
  )
}

function BlockInspector({
  title,
  meta,
  scale,
  bpmSeed,
  playsSeed,
  endsSeed,
  override,
  stateAction,
  onPatch,
  onReset,
  onStateChange,
  onRemove,
}: {
  title: string
  meta: string
  scale: number
  bpmSeed: number | null
  playsSeed: number
  endsSeed: number | null
  override: Partial<BlockOverride>
  stateAction: 'Bench' | 'Commit'
  onPatch: (patch: Partial<BlockOverride>) => void
  onReset: () => void
  onStateChange: () => void
  onRemove: () => void
}) {
  const [bpm, setBpm] = useState(bpmSeed != null ? bpmSeed.toFixed(1) : '')
  const [plays, setPlays] = useState(formatMinutes(playsSeed))
  const [ends, setEnds] = useState(endsSeed != null ? formatHM(endsSeed) : '')

  const scaled = Math.abs(scale - 1) > 0.005

  return (
    <div className="sq-inspector">
      <span className="sq-inspector-label">{title}</span>
      <span className="sq-inspector-meta mono">
        {meta}
        {scaled && <span className="sq-scale"> ×{scale.toFixed(2)}</span>}
      </span>
      <label>
        bpm
        <input
          aria-label="Played BPM"
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseFloat(bpm)
            onPatch({
              bpmOv: Number.isFinite(parsed) && parsed >= 40 ? parsed : null,
            })
          }}
        />
      </label>
      <label>
        plays
        <input
          aria-label="Play length in minutes"
          value={plays}
          onChange={(e) => setPlays(e.target.value)}
          onBlur={() => onPatch({ durOv: parseMinutes(plays) })}
        />
        m
      </label>
      <label>
        ends
        <input
          aria-label="Pinned end time"
          value={ends}
          onChange={(e) => setEnds(e.target.value)}
          onBlur={() => onPatch({ endPin: parseTimeInput(ends) })}
        />
      </label>
      {(override.durOv != null ||
        override.endPin != null ||
        override.bpmOv != null) && (
        <span className="sq-inspector-meta">overridden</span>
      )}
      <div className="sq-inspector-spacer" />
      <button className="ws-pill" onClick={onReset}>
        Reset
      </button>
      <button className="ws-pill" onClick={onStateChange}>
        {stateAction}
      </button>
      <button className="ws-pill" onClick={onRemove}>
        Remove
      </button>
    </div>
  )
}
