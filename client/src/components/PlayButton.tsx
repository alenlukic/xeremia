import { memo, useCallback, useContext } from 'react'
import { AudioPlayerContext } from '../hooks/useAudioPlayer'

interface Props {
  trackId: number
  title: string
  className?: string
}

export const PlayButton = memo(function PlayButton({
  trackId,
  title,
  className,
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
      {isLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
    </button>
  )
})
