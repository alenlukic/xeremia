import { useState } from 'react'
import {
  effectivePlayedBpm,
  type LaidBlock,
  type OverrideMap,
} from '../hooks/useSequencer'
import { keyDotColor } from '../utils/harmonic'
import { formatDuration, formatHM } from '../utils/time'

// Tracklist view of the committed lane. The BPM cell is the only editable one;
// timing mechanics stay under the hood.

interface Props {
  blocks: LaidBlock[]
  overrides: OverrideMap
  selectedTrackId: number | null
  onSelect: (trackId: number) => void
  onBpmChange: (trackId: number, bpm: number | null) => void
  onNoteChange: (trackId: number, note: string) => void
}

function NoteInput({
  trackId,
  title,
  initialNote,
  onSave,
}: {
  trackId: number
  title: string
  initialNote: string
  onSave: (trackId: number, note: string) => void
}) {
  const [value, setValue] = useState(initialNote)
  const [savedValue, setSavedValue] = useState(initialNote)
  const [previousInitialNote, setPreviousInitialNote] = useState(initialNote)

  if (initialNote !== previousInitialNote) {
    setPreviousInitialNote(initialNote)
    setSavedValue(initialNote)
    setValue(initialNote)
  }

  return (
    <input
      className="sq-note-input"
      aria-label={`Notes for ${title}`}
      placeholder="Add note…"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== savedValue) {
          setSavedValue(value)
          onSave(trackId, value)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function SequencerTracklist({
  blocks,
  overrides,
  selectedTrackId,
  onSelect,
  onBpmChange,
  onNoteChange,
}: Props) {
  const [draft, setDraft] = useState<Record<number, string>>({})

  return (
    <div className="sq-list">
      <table className="sq-list-table">
        <thead>
          <tr>
            <th className="sq-col-num">#</th>
            <th className="sq-col-title">Title</th>
            <th className="sq-col-key">Key</th>
            <th className="sq-col-bpm">BPM</th>
            <th className="sq-col-time">In</th>
            <th className="sq-col-time">Out</th>
            <th className="sq-col-length">Length</th>
            <th className="sq-col-note">Notes</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, i) => {
            const trackId = block.entry.track_id
            const ov = overrides[trackId] ?? {}
            const played = effectivePlayedBpm(block, overrides)
            const value =
              draft[trackId] ?? (played != null ? played.toFixed(1) : '')
            return (
              <tr
                key={block.entry.id}
                className={`sq-list-row${selectedTrackId === trackId ? ' sq-list-row--sel' : ''}`}
                onClick={() => onSelect(trackId)}
              >
                <td className="sq-col-num">{i + 1}</td>
                <td className="sq-col-title">
                  <span
                    className="key-dot"
                    aria-hidden="true"
                    style={{
                      background:
                        keyDotColor(block.entry.track?.camelot_code) ??
                        'transparent',
                    }}
                  />
                  {block.entry.track?.title}
                  {block.pinned && <span className="sq-flag">pinned</span>}
                  {ov.durOv != null && <span className="sq-flag">manual</span>}
                </td>
                <td className="sq-col-key mono">
                  {block.entry.track?.camelot_code}
                </td>
                <td className="sq-col-bpm">
                  <input
                    className={`sq-bpm-input${ov.bpmOv != null ? ' sq-bpm-input--ov' : ''}`}
                    aria-label={`Played BPM for ${block.entry.track?.title ?? 'track'}`}
                    value={value}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [trackId]: e.target.value }))
                    }
                    onBlur={(e) => {
                      const parsed = Number.parseFloat(e.target.value)
                      onBpmChange(
                        trackId,
                        Number.isFinite(parsed) && parsed >= 40 ? parsed : null,
                      )
                      setDraft((d) => {
                        const next = { ...d }
                        delete next[trackId]
                        return next
                      })
                    }}
                  />
                </td>
                <td className="sq-col-time mono">{formatHM(block.t)}</td>
                <td className="sq-col-time mono">
                  {formatHM(block.t + block.dur)}
                </td>
                <td className="sq-col-length mono">
                  {formatDuration(block.dur)}
                </td>
                <td className="sq-col-note">
                  <NoteInput
                    trackId={trackId}
                    title={block.entry.track?.title ?? 'track'}
                    initialNote={block.entry.note ?? ''}
                    onSave={onNoteChange}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {blocks.length === 0 && (
        <p className="table-status">
          Nothing committed yet — promote a benched track to start the spine.
        </p>
      )}
    </div>
  )
}
