import { memo, useCallback, useContext } from 'react'
import { AudioPlayerContext } from '../hooks/useAudioPlayer'
import { PauseIcon, PlayIcon } from './table/icons'

interface Props {
  trackId: number
  title: string
  className?: string
  /**
   * `glyph` (the default) draws the transport as text, which is what the dense
   * table rows use. `icon` draws it as an SVG so the button can sit in a row of
   * other icon controls without reading as a different kind of thing.
   */
  variant?: 'glyph' | 'icon'
}

export const PlayButton = memo(function PlayButton({
  trackId,
  title,
  className,
  variant = 'glyph',
}: Props) {
  const ctx = useContext(AudioPlayerContext)
  const track = ctx?.track ?? null
  const playing = ctx?.playing ?? false
  const loading = ctx?.loading ?? false
  const togglePlayPause = ctx?.togglePlayPause

  const isThisTrack = track?.id === trackId
  const isPlaying = isThisTrack && playing
  const isLoading = isThisTrack && loading

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      togglePlayPause?.(trackId, title)
    },
    [trackId, title, togglePlayPause],
  )

  return (
    <button
      className={`play-btn${isPlaying ? ' play-btn--playing' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      title={isPlaying ? 'Pause' : `Play ${title}`}
      aria-label={isPlaying ? 'Pause' : `Play ${title}`}
      data-testid="play-btn"
      data-track-id={trackId}
      disabled={!togglePlayPause}
    >
      {variant === 'icon' && !isLoading ? (
        isPlaying ? (
          <PauseIcon size={14} />
        ) : (
          <PlayIcon size={14} />
        )
      ) : isLoading ? (
        '⏳'
      ) : isPlaying ? (
        '⏸'
      ) : (
        '▶'
      )}
    </button>
  )
})
