import { memo, useState, useCallback, useEffect } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const PlayerBar = memo(function PlayerBar({ onVisibilityChange }: { onVisibilityChange?: (visible: boolean) => void }) {
  const {
    track, playing, currentTime, duration, volume, error, loading,
    pause, resume, seek, setVolume, stop,
  } = useAudioPlayer();

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (track || error) setDismissed(false);
  }, [track, error]);

  const visible = !dismissed && !!(track || error);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => seek(parseFloat(e.target.value)),
    [seek],
  );

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setVolume(parseFloat(e.target.value)),
    [setVolume],
  );

  const handleDismiss = useCallback(() => {
    stop();
    setDismissed(true);
  }, [stop]);

  if (!visible) return null;

  return (
    <div className="player-bar" data-testid="player-bar">
      <div className="player-bar__controls">
        <button
          className="player-bar__play-btn"
          onClick={playing ? pause : resume}
          disabled={loading || !!error}
          aria-label={playing ? 'Pause' : 'Play'}
          data-testid="player-bar-play-btn"
        >
          {loading ? '⏳' : playing ? '⏸' : '▶'}
        </button>
        <button
          className="player-bar__stop-btn"
          onClick={stop}
          aria-label="Stop"
          data-testid="player-bar-stop-btn"
        >
          ⏹
        </button>
      </div>

      <div className="player-bar__info">
        <span className="player-bar__title" data-testid="player-bar-title">
          {track?.title ?? ''}
        </span>
        {error && (
          <span className="player-bar__error" data-testid="player-bar-error">
            {error}
          </span>
        )}
      </div>

      <div className="player-bar__progress">
        <span className="player-bar__time mono">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="player-bar__seek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Seek"
          data-testid="player-bar-seek"
        />
        <span className="player-bar__time mono">{formatTime(duration)}</span>
      </div>

      <div className="player-bar__volume">
        <span className="player-bar__volume-icon" aria-hidden="true">
          {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </span>
        <input
          type="range"
          className="player-bar__volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolume}
          aria-label="Volume"
          data-testid="player-bar-volume"
        />
      </div>

      <button
        className="player-bar__dismiss"
        onClick={handleDismiss}
        aria-label="Close player"
        data-testid="player-bar-dismiss"
        title="Close player"
      >
        ×
      </button>
    </div>
  );
});
