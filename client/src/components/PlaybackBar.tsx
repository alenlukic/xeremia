import { useCallback } from 'react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function PlaybackBar() {
  const {
    track,
    playing,
    currentTime,
    duration,
    volume,
    togglePlayPause,
    seek,
    setVolume,
    stop,
  } = useAudioPlayer()

  const handleTogglePlayPause = useCallback(() => {
    if (track) {
      togglePlayPause(track.id, track.title)
    }
  }, [track, togglePlayPause])

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(Number(e.target.value))
    },
    [seek],
  )

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value))
    },
    [setVolume],
  )

  if (!track) {
    return null
  }

  return (
    <div className="playback-bar">
      <button
        className="playback-bar-play-btn"
        onClick={handleTogglePlayPause}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <span className="playback-bar-title" title={track.title}>
        {track.title}
      </span>
      <span className="playback-bar-time">{formatTime(currentTime)}</span>
      <input
        className="playback-bar-scrubber"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={handleSeek}
        aria-label="Seek"
      />
      <span className="playback-bar-time">{formatTime(duration)}</span>
      <div className="playback-bar-volume">
        <span aria-hidden="true">🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolume}
          aria-label="Volume"
        />
      </div>
      {!playing && (
        <button
          className="playback-bar-close"
          onClick={stop}
          aria-label="Close playback bar"
          title="Close"
        >
          ×
        </button>
      )}
    </div>
  )
}
