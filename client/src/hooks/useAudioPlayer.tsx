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

function audioElementErrorMessage(el: HTMLAudioElement): string {
  const code = el.error?.code;
  if (code === 4) return 'Audio format not supported';
  if (code === 2) return 'Network error during playback';
  if (code === 3) return 'Audio file could not be decoded';
  return 'Playback error';
}

const MIME_PLAY_ALTERNATIVES: Record<string, string[]> = {
  'audio/aiff': ['audio/x-aiff'],
  'audio/aif': ['audio/x-aiff'],
};

export function normalizeMime(raw: string): string {
  return raw.split(';')[0].trim().toLowerCase();
}

export function browserCanPlay(el: HTMLAudioElement, rawContentType: string): boolean {
  const mime = normalizeMime(rawContentType);
  if (el.canPlayType(mime) !== '') return true;
  const alts = MIME_PLAY_ALTERNATIVES[mime];
  return alts ? alts.some(alt => el.canPlayType(alt) !== '') : false;
}

const TRANSCODABLE_MIMES = new Set(['audio/aiff', 'audio/x-aiff', 'audio/aif']);

export interface AiffMetadata {
  channels: number;
  frames: number;
  bitsPerSample: number;
  sampleRate: number;
  ssndDataOffset: number;
  ssndDataSize: number;
}

/**
 * Parse AIFF/AIFC header metadata from a buffer.
 * Returns null if the buffer is too short (more data needed for streaming).
 * Throws on definitively invalid or unsupported input.
 */
export function parseAiffHeader(buffer: ArrayBuffer): AiffMetadata | null {
  if (buffer.byteLength < 12) return null;

  const view = new DataView(buffer);
  const td = new TextDecoder('ascii');

  const formId = td.decode(new Uint8Array(buffer, 0, 4));
  if (formId !== 'FORM') throw new Error('Not a valid AIFF file');

  const aiffId = td.decode(new Uint8Array(buffer, 8, 4));
  if (aiffId !== 'AIFF' && aiffId !== 'AIFC')
    throw new Error('Not a valid AIFF file');

  let channels = 0, sampleRate = 0, bitsPerSample = 0, frames = 0;
  let ssndDataOffset = -1;
  let ssndDataSize = 0;
  let foundComm = false;
  let foundSsnd = false;

  let off = 12;
  while (off < buffer.byteLength) {
    if (off + 8 > buffer.byteLength) return null;

    const chunkId = td.decode(new Uint8Array(buffer, off, 4));
    const chunkSize = view.getUint32(off + 4, false);

    if (chunkId === 'COMM') {
      if (off + 22 > buffer.byteLength) return null;

      channels = view.getInt16(off + 8, false);
      frames = view.getUint32(off + 10, false);
      bitsPerSample = view.getInt16(off + 14, false);

      const exp = view.getUint16(off + 16, false) & 0x7FFF;
      const mant = view.getUint32(off + 18, false);
      sampleRate = Math.round(Math.pow(2, exp - 16383) * (mant / 0x80000000));

      if (aiffId === 'AIFC') {
        if (off + 30 > buffer.byteLength) return null;
        const compType = td.decode(new Uint8Array(buffer, off + 26, 4));
        if (compType !== 'NONE' && compType !== 'none')
          throw new Error(`Unsupported AIFF-C compression: ${compType}`);
      }

      foundComm = true;
    } else if (chunkId === 'SSND') {
      if (off + 16 > buffer.byteLength) return null;

      const dataOffset = view.getUint32(off + 8, false);
      ssndDataOffset = off + 16 + dataOffset;
      ssndDataSize = chunkSize - 8 - dataOffset;
      foundSsnd = true;
    }

    if (foundComm && foundSsnd) break;

    off += 8 + chunkSize + (chunkSize % 2);
  }

  if (!foundComm || !foundSsnd) return null;

  if (channels <= 0 || sampleRate <= 0 || bitsPerSample <= 0)
    throw new Error('Invalid AIFF: COMM chunk has invalid values');

  return { channels, frames, bitsPerSample, sampleRate, ssndDataOffset, ssndDataSize };
}

function writeWavString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/**
 * Parse a raw AIFF ArrayBuffer and repackage as a WAV blob.
 *
 * Chrome has no native AIFF decoder (neither <audio> nor decodeAudioData).
 * AIFF is big-endian PCM; WAV is little-endian PCM with a different header.
 * We read the COMM and SSND chunks, swap endianness, and emit a 16-bit WAV.
 * 24-bit and 32-bit sources are truncated to the top 16 bits for preview.
 */
export function aiffToWav(buffer: ArrayBuffer): Blob {
  const meta = parseAiffHeader(buffer);
  if (!meta)
    throw new Error('Invalid AIFF: missing COMM or SSND chunk');

  const { channels, frames, bitsPerSample, sampleRate, ssndDataOffset } = meta;

  const bytesPerInputSample = bitsPerSample / 8;
  if (bytesPerInputSample < 2 || bytesPerInputSample > 4)
    throw new Error(`Unsupported AIFF bit depth: ${bitsPerSample}`);

  const totalSamples = frames * channels;
  const requiredEnd = ssndDataOffset + totalSamples * bytesPerInputSample;
  if (requiredEnd > buffer.byteLength)
    throw new Error(
      `AIFF file truncated: expected ${totalSamples * bytesPerInputSample} bytes in SSND ` +
      `but only ${Math.max(0, buffer.byteLength - ssndDataOffset)} available`
    );

  const view = new DataView(buffer);
  const wavDataBytes = totalSamples * 2;
  const wavBuf = new ArrayBuffer(44 + wavDataBytes);
  const w = new DataView(wavBuf);

  writeWavString(w, 0, 'RIFF');
  w.setUint32(4, 36 + wavDataBytes, true);
  writeWavString(w, 8, 'WAVE');
  writeWavString(w, 12, 'fmt ');
  w.setUint32(16, 16, true);
  w.setUint16(20, 1, true);
  w.setUint16(22, channels, true);
  w.setUint32(24, sampleRate, true);
  w.setUint32(28, sampleRate * channels * 2, true);
  w.setUint16(32, channels * 2, true);
  w.setUint16(34, 16, true);
  writeWavString(w, 36, 'data');
  w.setUint32(40, wavDataBytes, true);

  let rOff = ssndDataOffset;
  let wOff = 44;
  for (let i = 0; i < totalSamples; i++) {
    w.setInt16(wOff, view.getInt16(rOff, false), true);
    rOff += bytesPerInputSample;
    wOff += 2;
  }

  return new Blob([wavBuf], { type: 'audio/wav' });
}

export function buildWavHeader(meta: AiffMetadata): ArrayBuffer {
  const totalSamples = meta.frames * meta.channels;
  const wavDataBytes = totalSamples * 2;
  if (wavDataBytes > 0xFFFFFFFF - 36)
    throw new Error('AIFF file too large for WAV container');
  const buf = new ArrayBuffer(44);
  const w = new DataView(buf);

  writeWavString(w, 0, 'RIFF');
  w.setUint32(4, 36 + wavDataBytes, true);
  writeWavString(w, 8, 'WAVE');
  writeWavString(w, 12, 'fmt ');
  w.setUint32(16, 16, true);
  w.setUint16(20, 1, true);
  w.setUint16(22, meta.channels, true);
  w.setUint32(24, meta.sampleRate, true);
  w.setUint32(28, meta.sampleRate * meta.channels * 2, true);
  w.setUint16(32, meta.channels * 2, true);
  w.setUint16(34, 16, true);
  writeWavString(w, 36, 'data');
  w.setUint32(40, wavDataBytes, true);

  return buf;
}

function endianSwapPcm(input: Uint8Array, bytesPerInputSample: number): Uint8Array {
  const sampleCount = Math.floor(input.length / bytesPerInputSample);
  const output = new Uint8Array(sampleCount * 2);
  const inView = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const outView = new DataView(output.buffer);

  for (let i = 0; i < sampleCount; i++) {
    outView.setInt16(i * 2, inView.getInt16(i * bytesPerInputSample, false), true);
  }

  return output;
}

function waitForSourceBufferUpdate(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve();
  return new Promise(r => sb.addEventListener('updateend', () => r(), { once: true }));
}

async function appendToSourceBuffer(sb: SourceBuffer, data: ArrayBuffer | Uint8Array): Promise<void> {
  await waitForSourceBufferUpdate(sb);
  sb.appendBuffer(data as BufferSource);
  await new Promise<void>(r => sb.addEventListener('updateend', () => r(), { once: true }));
}

export function canUseStreamingMse(): boolean {
  if (typeof MediaSource === 'undefined') return false;
  return MediaSource.isTypeSupported('audio/wav; codecs="1"') ||
    MediaSource.isTypeSupported('audio/wav');
}

/**
 * Stream an AIFF file from the given URL, transcoding to WAV on the fly
 * using MediaSource Extensions. Resolves once playback begins; continues
 * streaming in the background until the file is fully transcoded or
 * isCancelled() returns true.
 */
export async function streamAiffAsWav(
  url: string,
  audioEl: HTMLAudioElement,
  isCancelled: () => boolean,
): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Audio unavailable (${resp.status})`);
  if (!resp.body) throw new Error('Streaming not supported');

  const reader = resp.body.getReader();
  let accumulated = new Uint8Array(0);
  let metadata: AiffMetadata | null = null;

  try {
    while (!metadata) {
      if (isCancelled()) { reader.cancel(); return; }
      const { done, value } = await reader.read();
      if (done) throw new Error('AIFF file truncated: stream ended before header complete');

      const next = new Uint8Array(accumulated.length + value.length);
      next.set(accumulated);
      next.set(value, accumulated.length);
      accumulated = next;

      metadata = parseAiffHeader(accumulated.buffer);
    }
  } catch (e) {
    reader.cancel();
    throw e;
  }

  if (isCancelled()) { reader.cancel(); return; }

  const { channels, frames, bitsPerSample, ssndDataOffset } = metadata;
  const bytesPerInputSample = bitsPerSample / 8;
  if (bytesPerInputSample < 2 || bytesPerInputSample > 4) {
    reader.cancel();
    throw new Error(`Unsupported AIFF bit depth: ${bitsPerSample}`);
  }

  const totalPcmBytes = frames * channels * bytesPerInputSample;

  const mediaSource = new MediaSource();
  const msUrl = URL.createObjectURL(mediaSource);
  audioEl.src = msUrl;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MediaSource failed to open')), 5000);
    mediaSource.addEventListener('sourceopen', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });

  URL.revokeObjectURL(msUrl);

  if (isCancelled()) { reader.cancel(); return; }

  const mimeType = MediaSource.isTypeSupported('audio/wav; codecs="1"')
    ? 'audio/wav; codecs="1"'
    : 'audio/wav';
  const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

  const wavHeader = buildWavHeader(metadata);
  await appendToSourceBuffer(sourceBuffer, wavHeader);

  let pcmBytesProcessed = 0;
  let remainder = new Uint8Array(0);

  if (accumulated.length > ssndDataOffset) {
    const available = accumulated.subarray(
      ssndDataOffset,
      Math.min(accumulated.length, ssndDataOffset + totalPcmBytes),
    );
    const usable = Math.floor(available.length / bytesPerInputSample) * bytesPerInputSample;
    if (usable > 0) {
      await appendToSourceBuffer(sourceBuffer, endianSwapPcm(available.subarray(0, usable), bytesPerInputSample));
      pcmBytesProcessed += usable;
    }
    if (usable < available.length) {
      remainder = new Uint8Array(available.subarray(usable));
    }
  }

  let filePos = accumulated.length;
  let skipBytes = Math.max(0, ssndDataOffset - filePos);

  try {
    await audioEl.play();
  } catch (playErr) {
    reader.cancel();
    throw playErr;
  }

  const background = async () => {
    try {
      while (pcmBytesProcessed < totalPcmBytes) {
        if (isCancelled()) { reader.cancel(); break; }

        const { done, value } = await reader.read();
        if (done) break;

        let chunk = value;
        filePos += chunk.length;

        if (skipBytes > 0) {
          if (chunk.length <= skipBytes) {
            skipBytes -= chunk.length;
            continue;
          }
          chunk = chunk.subarray(skipBytes);
          skipBytes = 0;
        }

        const bytesRemaining = totalPcmBytes - pcmBytesProcessed;
        if (chunk.length > bytesRemaining) {
          chunk = chunk.subarray(0, bytesRemaining);
        }

        if (remainder.length > 0) {
          const combined = new Uint8Array(remainder.length + chunk.length);
          combined.set(remainder);
          combined.set(chunk, remainder.length);
          chunk = combined;
          remainder = new Uint8Array(0);
        }

        const usable = Math.floor(chunk.length / bytesPerInputSample) * bytesPerInputSample;
        if (usable < chunk.length) {
          remainder = new Uint8Array(chunk.subarray(usable));
        }

        if (usable > 0) {
          if (isCancelled()) { reader.cancel(); break; }
          await appendToSourceBuffer(sourceBuffer, endianSwapPcm(chunk.subarray(0, usable), bytesPerInputSample));
          pcmBytesProcessed += usable;
        }
      }

      if (!isCancelled() && mediaSource.readyState === 'open') {
        await waitForSourceBufferUpdate(sourceBuffer);
        mediaSource.endOfStream();
      }
    } catch {
      reader.cancel();
      try {
        if (mediaSource.readyState === 'open') mediaSource.endOfStream('decode');
      } catch { /* already closed */ }
    }
  };

  background();
}

function playbackErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotSupportedError': return 'Audio format not supported';
      case 'NotAllowedError': return 'Playback blocked by browser';
      case 'AbortError': return 'Playback was interrupted';
    }
  }
  return err instanceof Error ? err.message : 'Playback failed';
}

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
      const msg = audioElementErrorMessage(el);
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
    el.load();

    setState(s => ({
      ...s,
      track: { id: trackId, title },
      playing: false,
      currentTime: 0,
      duration: 0,
      error: null,
      loading: true,
    }));

    let playUrl = _validationCache.get(trackId);

    if (!playUrl) {
      try {
        const resp = await fetch(url, { method: 'HEAD' });

        if (requestIdRef.current !== myRequestId) return;

        if (!resp.ok) {
          const detail = resp.status === 404
            ? 'Track audio not found'
            : resp.status === 415
              ? 'Audio format not supported by server'
              : `Audio unavailable (${resp.status})`;
          _validationCache.remove(trackId);
          setState(s => ({ ...s, loading: false, error: detail }));
          return;
        }

        const contentType = resp.headers?.get('content-type');
        if (contentType && !browserCanPlay(el, contentType)) {
          const mime = normalizeMime(contentType);
          if (!TRANSCODABLE_MIMES.has(mime)) {
            _validationCache.remove(trackId);
            setState(s => ({
              ...s,
              loading: false,
              error: 'Audio format not supported by this browser',
            }));
            return;
          }

          if (canUseStreamingMse()) {
            try {
              await streamAiffAsWav(url, el, () => requestIdRef.current !== myRequestId);
              if (requestIdRef.current !== myRequestId) return;
              setState(s => ({ ...s, playing: true, loading: false }));
              return;
            } catch {
              if (requestIdRef.current !== myRequestId) return;
              // MSE streaming failed — fall through to full-download fallback
            }
          }

          try {
            const audioResp = await fetch(url);
            if (requestIdRef.current !== myRequestId) return;
            if (!audioResp.ok) {
              setState(s => ({ ...s, loading: false, error: `Audio unavailable (${audioResp.status})` }));
              return;
            }
            const arrayBuf = await audioResp.arrayBuffer();
            if (requestIdRef.current !== myRequestId) return;
            playUrl = URL.createObjectURL(aiffToWav(arrayBuf));
          } catch (decodeErr) {
            if (requestIdRef.current !== myRequestId) return;
            _validationCache.remove(trackId);
            setState(s => ({
              ...s,
              loading: false,
              error: decodeErr instanceof Error ? decodeErr.message : 'Audio decode failed',
            }));
            return;
          }
        } else {
          playUrl = url;
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

      _validationCache.set(trackId, playUrl);
    }

    el.src = playUrl;
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
        error: playbackErrorMessage(err),
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
