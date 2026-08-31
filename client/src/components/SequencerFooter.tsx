import { useState } from 'react'
import {
  displayBpm,
  type BenchBlock,
  type BlockOverride,
  type LaidBlock,
  type OverrideMap,
} from '../hooks/useSequencer'
import { BPM_OVERRIDE_MAX, BPM_OVERRIDE_MIN } from '../constants/sequencer'
import { displayTitle } from '../utils/trackTitle'
import { formatHM, parseTimeInput } from '../utils/time'

// The inspector mirrors the Tracklist columns. Timing mechanics and scaling
// remain internal rather than becoming user-facing concepts.

interface Props {
  block: LaidBlock | null
  /** Set when the selection is a benched candidate rather than a committed block. */
  benched?: BenchBlock | null
  overrides: OverrideMap
  onPatch: (patch: Partial<BlockOverride>) => void
  onReset: () => void
  onSetBenchTime: (minutes: number) => void
  onBench: () => void
  onCommit: () => void
  onRemove: () => void
}

export function SequencerFooter({
  block,
  benched,
  overrides,
  onPatch,
  onReset,
  onSetBenchTime,
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
        title={displayTitle(block.entry.track, block.entry.track_id)}
        bpmSeed={displayBpm(block, overrides)}
        inSeed={block.t}
        outSeed={block.t + block.dur}
        onOutChange={(minutes) => onPatch({ endPin: minutes })}
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
      title={displayTitle(benched.entry.track, benched.entry.track_id)}
      bpmSeed={benched.entry.track?.bpm ?? null}
      inSeed={benched.t}
      outSeed={benched.t + benched.dur}
      onInChange={onSetBenchTime}
      onOutChange={(minutes) =>
        onPatch({
          durOv:
            minutes != null && minutes > benched.t ? minutes - benched.t : null,
        })
      }
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
  bpmSeed,
  inSeed,
  outSeed,
  onInChange,
  onOutChange,
  stateAction,
  onPatch,
  onReset,
  onStateChange,
  onRemove,
}: {
  title: string
  bpmSeed: number | null
  inSeed: number
  outSeed: number
  onInChange?: (minutes: number) => void
  onOutChange: (minutes: number | null) => void
  stateAction: 'Bench' | 'Commit'
  onPatch: (patch: Partial<BlockOverride>) => void
  onReset: () => void
  onStateChange: () => void
  onRemove: () => void
}) {
  const [bpm, setBpm] = useState(bpmSeed != null ? bpmSeed.toFixed(1) : '')
  const initialIn = formatHM(inSeed)
  const initialOut = formatHM(outSeed)
  const [inTime, setInTime] = useState(initialIn)
  const [outTime, setOutTime] = useState(initialOut)

  return (
    <div className="sq-inspector">
      <span className="sq-inspector-label">{title}</span>
      <label>
        bpm
        <input
          aria-label="Played BPM"
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseFloat(bpm)
            onPatch({
              bpmOv:
                Number.isFinite(parsed) &&
                parsed >= BPM_OVERRIDE_MIN &&
                parsed <= BPM_OVERRIDE_MAX
                  ? parsed
                  : null,
            })
          }}
        />
      </label>
      <label>
        in
        <input
          aria-label="In time"
          value={inTime}
          readOnly={!onInChange}
          onChange={(e) => setInTime(e.target.value)}
          onBlur={() => {
            if (!onInChange || inTime === initialIn) {
              return
            }
            const parsed = parseTimeInput(inTime)
            if (parsed == null) {
              setInTime(initialIn)
              return
            }
            onInChange(parsed)
          }}
        />
      </label>
      <label>
        out
        <input
          aria-label="Out time"
          value={outTime}
          onChange={(e) => setOutTime(e.target.value)}
          onBlur={() => {
            if (outTime === initialOut) {
              return
            }
            onOutChange(parseTimeInput(outTime))
          }}
        />
      </label>
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
