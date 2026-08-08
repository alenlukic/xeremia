// Clock helpers for the Sequencer. Every displayed time is H:MM, and every
// time input accepts the three forms a DJ actually types: 390, 6:30, 6h30.

/** Format minutes-since-midnight (or a duration in minutes) as H:MM. */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Parse 390, 6:30, or 6h30 into minutes. Returns null for anything else. */
export function parseTimeInput(value: string): number | null {
  const raw = value.trim().toLowerCase()
  if (raw === '') {
    return null
  }
  const bare = raw.match(/^\d+$/)
  if (bare) {
    return Number(raw)
  }
  const split = raw.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})$/)
  if (split) {
    const mins = Number(split[2])
    if (mins > 59) {
      return null
    }
    return Number(split[1]) * 60 + mins
  }
  const hoursOnly = raw.match(/^(\d{1,2})h$/)
  if (hoursOnly) {
    return Number(hoursOnly[1]) * 60
  }
  return null
}

/** Duration in whole seconds, rendered as mm:ss. */
export function formatDuration(minutes: number): string {
  const totalSeconds = Math.max(0, Math.round(minutes * 60))
  const wholeMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(wholeMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
