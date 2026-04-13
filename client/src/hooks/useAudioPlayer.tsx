import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

interface PlayingTrack {
  id: number;
  title: string;
}

interface AudioPlayerState {
  track: PlayingTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  loading: boolean;
}

interface AudioPlayerControls {
  play: (trackId: number, title: string) => void;
  pause: () => void;
  resume: () => void;
  togglePlayPause: (trackId: number, title: string) => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  stop: () => void;
}

type AudioPlayerContextValue = AudioPlayerState & AudioPlayerControls;

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

const VOLUME_KEY = 'dj-tools-player-volume';
const LRU_MAX = 20;

/**
 * Lightweight LRU that tracks recently-validated track URLs.
 * Stores only the mapping trackId→url so replay of a recently validated
 * track can skip the preflight validation fetch. Map iteration order
 * gives us LRU semantics: delete+re-set moves an entry to the end.
 */
class ValidationLRU {
  private cache = new Map<number, string>();

  get(trackId: number): string | undefined {
    const url = this.cache.get(trackId);
    if (url === undefined) return undefined;
    this.cache.delete(trackId);
    this.cache.set(trackId, url);
    return url;
  }

  set(trackId: number, url: string): void {
    this.cache.delete(trackId);
    this.cache.set(trackId, url);
    if (this.cache.size > LRU_MAX) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }
  }

  remove(trackId: number): void {
    this.cache.delete(trackId);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const _validationCache = new ValidationLRU();

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 0.8;
    const val = parseFloat(raw);
    return isNaN(val) || val < 0 || val > 1 ? 0.8 : val;
  } catch {
    return 0.8;
  }
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<AudioPlayerState>({
    track: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: readStoredVolume(),
    error: null,
    loading: false,
  });

  useEffect(() => {
    const el = document.createElement('audio');
    el.volume = readStoredVolume();
    audioRef.current = el;

    const onTimeUpdate = () => setState(s => ({ ...s, currentTime: el.currentTime }));
    const onDurationChange = () => setState(s => ({ ...s, duration: el.duration || 0 }));
    const onEnded = () => setState(s => ({ ...s, playing: false }));
    const onError = () => {
      if (!el.getAttribute('src')) return;
      const msg = el.error?.message || 'Playback error';
      setState(s => ({ ...s, playing: false, loading: false, error: msg }));
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      el.pause();
      el.removeAttribute('src');
    };
  }, []);

  const play = useCallback(async (trackId: number, title: string) => {
    const el = audioRef.current;
    if (!el) return;

    const myRequestId = ++requestIdRef.current;
    const url = `/api/tracks/${trackId}/audio`;

    el.pause();
    el.removeAttribute('src');

    setState(s => ({
      ...s,
      track: { id: trackId, title },
      playing: false,
      currentTime: 0,
      duration: 0,
      error: null,
      loading: true,
    }));

    const cached = _validationCache.get(trackId);

    if (!cached) {
      try {
        const resp = await fetch(url);

        if (requestIdRef.current !== myRequestId) return;

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          const detail = body.detail || `Audio fetch failed: ${resp.status}`;
          if (requestIdRef.current !== myRequestId) return;
          _validationCache.remove(trackId);
          setState(s => ({ ...s, loading: false, error: detail }));
          return;
        }
      } catch (err) {
        if (requestIdRef.current !== myRequestId) return;
        _validationCache.remove(trackId);
        setState(s => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Network error',
        }));
        return;
      }

      if (requestIdRef.current !== myRequestId) return;

      _validationCache.set(trackId, url);
    }

    el.src = url;
    try {
      await el.play();
      if (requestIdRef.current !== myRequestId) return;
      setState(s => ({ ...s, playing: true, loading: false }));
    } catch (err) {
      if (requestIdRef.current !== myRequestId) return;
      setState(s => ({
        ...s,
        playing: false,
        loading: false,
        error: err instanceof Error ? err.message : 'Playback failed',
      }));
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState(s => ({ ...s, playing: false }));
  }, []);

  const resume = useCallback(async () => {
    const el = audioRef.current;
    if (!el || !el.src) return;
    try {
      await el.play();
      setState(s => ({ ...s, playing: true, error: null }));
    } catch { /* autoplay blocked */ }
  }, []);

  const togglePlayPause = useCallback((trackId: number, title: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (state.track?.id === trackId && state.playing) {
      pause();
    } else if (state.track?.id === trackId && !state.playing && el.src) {
      resume();
    } else {
      play(trackId, title);
    }
  }, [state.track?.id, state.playing, pause, resume, play]);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (el && isFinite(time)) {
      el.currentTime = time;
      setState(s => ({ ...s, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    if (audioRef.current) audioRef.current.volume = v;
    setState(s => ({ ...s, volume: v }));
    try { localStorage.setItem(VOLUME_KEY, String(v)); } catch {}
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current++;
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
    }
    setState(s => ({
      ...s,
      track: null,
      playing: false,
      currentTime: 0,
      duration: 0,
      error: null,
      loading: false,
    }));
  }, []);

  const value: AudioPlayerContextValue = {
    ...state,
    play,
    pause,
    resume,
    togglePlayPause,
    seek,
    setVolume,
    stop,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
