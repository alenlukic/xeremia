/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import {
  AudioPlayerProvider,
  useAudioPlayer,
  _validationCache,
  normalizeMime,
  browserCanPlay,
  aiffToWav,
  parseAiffHeader,
  buildWavHeader,
  canUseStreamingMse,
  streamAiffAsWav,
  type AiffMetadata,
} from './useAudioPlayer'

/**
 * Build a minimal valid AIFF binary with the given parameters.
 * Contains FORM header, COMM chunk, and SSND chunk.
 * When pcmSamples is provided, it should be big-endian 16-bit sample values.
 */
function buildAiffBuffer(
  channels: number,
  frames: number,
  bitsPerSample: number,
  sampleRate: number,
  pcmSamples?: number[],
): ArrayBuffer {
  const bytesPerSample = bitsPerSample / 8
  const ssndDataSize = frames * channels * bytesPerSample
  const ssndChunkSize = 8 + ssndDataSize
  const totalSize = 4 + (8 + 18) + (8 + ssndChunkSize)
  const buf = new ArrayBuffer(12 + (8 + 18) + (8 + ssndChunkSize))
  const v = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      v.setUint8(off + i, s.charCodeAt(i))
    }
  }

  writeStr(0, 'FORM')
  v.setUint32(4, totalSize, false)
  writeStr(8, 'AIFF')

  writeStr(12, 'COMM')
  v.setUint32(16, 18, false)
  v.setInt16(20, channels, false)
  v.setUint32(22, frames, false)
  v.setInt16(26, bitsPerSample, false)
  const exp = 16383 + Math.floor(Math.log2(sampleRate))
  const mant = Math.round(
    (sampleRate / Math.pow(2, Math.floor(Math.log2(sampleRate)))) * 0x80000000,
  )
  v.setUint16(28, exp, false)
  v.setUint32(30, mant, false)
  v.setUint32(34, 0, false)

  const ssndOff = 38
  writeStr(ssndOff, 'SSND')
  v.setUint32(ssndOff + 4, ssndChunkSize, false)
  v.setUint32(ssndOff + 8, 0, false)
  v.setUint32(ssndOff + 12, 0, false)

  if (pcmSamples) {
    const dataStart = ssndOff + 16
    for (let i = 0; i < pcmSamples.length && i < frames * channels; i++) {
      if (bitsPerSample === 16) {
        v.setInt16(dataStart + i * 2, pcmSamples[i], false)
      }
    }
  }

  return buf
}

let mockPlay: ReturnType<typeof vi.fn>
let mockPause: ReturnType<typeof vi.fn>
let mockAudioElement: Record<string, unknown>
let origCreateElement: typeof document.createElement

beforeEach(() => {
  mockPlay = vi.fn().mockResolvedValue(undefined)
  mockPause = vi.fn()

  let srcValue = ''
  let hasSrc = false

  mockAudioElement = {
    play: mockPlay,
    pause: mockPause,
    volume: 0.8,
    currentTime: 0,
    duration: 0,
    error: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getAttribute: vi.fn((attr: string) =>
      attr === 'src' && hasSrc ? srcValue : null,
    ),
    removeAttribute: vi.fn((attr: string) => {
      if (attr === 'src') {
        srcValue = ''
        hasSrc = false
      }
    }),
    load: vi.fn(),
    canPlayType: vi.fn().mockReturnValue('probably'),
  }

  Object.defineProperty(mockAudioElement, 'src', {
    get: () => srcValue,
    set: (v: string) => {
      srcValue = v
      hasSrc = true
    },
    configurable: true,
  })
  origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'audio') {
      return mockAudioElement as unknown as HTMLElement
    }
    return origCreateElement(tag)
  })
  vi.spyOn(window, 'fetch').mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
  } as Response)
  _validationCache.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function TestConsumer() {
  const player = useAudioPlayer()
  return (
    <div>
      <span data-testid="track-id">{player.track?.id ?? 'none'}</span>
      <span data-testid="track-title">{player.track?.title ?? 'none'}</span>
      <span data-testid="playing">{String(player.playing)}</span>
      <span data-testid="loading">{String(player.loading)}</span>
      <span data-testid="error">{player.error ?? 'none'}</span>
      <span data-testid="volume">{player.volume}</span>
      <button
        data-testid="play-btn"
        onClick={() => player.play(1, 'Test Track')}
      >
        Play
      </button>
      <button
        data-testid="play-btn-2"
        onClick={() => player.play(2, 'Second Track')}
      >
        Play 2
      </button>
      <button data-testid="pause-btn" onClick={() => player.pause()}>
        Pause
      </button>
      <button data-testid="stop-btn" onClick={() => player.stop()}>
        Stop
      </button>
      <button data-testid="volume-btn" onClick={() => player.setVolume(0.5)}>
        Vol 50%
      </button>
      <button
        data-testid="toggle-btn"
        onClick={() => player.togglePlayPause(1, 'Test Track')}
      >
        Toggle
      </button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AudioPlayerProvider>
      <TestConsumer />
    </AudioPlayerProvider>,
  )
}

describe('AudioPlayerProvider', () => {
  it('starts with no track playing', () => {
    renderWithProvider()
    expect(screen.getByTestId('track-title').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('false')
  })

  it('validates audio endpoint with HEAD then streams on play()', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(window.fetch).toHaveBeenCalledWith(
      '/api/tracks/1/audio',
      expect.objectContaining({ method: 'HEAD' }),
    )
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio')
    expect(mockPlay).toHaveBeenCalled()
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track')
  })

  it('does not use blob URLs — streams directly', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio')
    expect(URL.createObjectURL).not.toBeDefined
  })

  it('pauses playback', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('pause-btn'))
    })
    expect(mockPause).toHaveBeenCalled()
    expect(screen.getByTestId('playing').textContent).toBe('false')
  })

  it('stops and clears track', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('false')
  })

  it('stop does not surface empty-src media error', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('playing').textContent).toBe('true')

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    const errorHandler = (
      mockAudioElement.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === 'error')?.[1] as
      | (() => void)
      | undefined

    if (errorHandler) {
      mockAudioElement.error = {
        message: 'MEDIA_ELEMENT_ERROR: Empty src attribute',
      }
      await act(async () => {
        errorHandler()
      })
    }

    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(screen.getByTestId('track-title').textContent).toBe('none')
  })

  it('sets volume', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('volume-btn'))
    })
    expect(mockAudioElement.volume).toBe(0.5)
    expect(screen.getByTestId('volume').textContent).toBe('0.5')
  })

  it('shows error on fetch failure', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Track audio not found',
    )
    expect(screen.getByTestId('playing').textContent).toBe('false')
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('shows format error for 415 status', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 415,
    } as unknown as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Audio format not supported by server',
    )
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })

  it('transcodes AIFF to WAV client-side when canPlayType rejects', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:transcoded-wav')

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(aiffBuf),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(mockAudioElement.src).toBe('blob:transcoded-wav')
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('true')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('rejects truly unknown format when canPlayType returns empty', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/x-unknown-codec' }),
    } as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Audio format not supported by this browser',
    )
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('maps audio element error code to app-level message', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('playing').textContent).toBe('true')

    const errorHandler = (
      mockAudioElement.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) => call[0] === 'error')?.[1] as
      | (() => void)
      | undefined

    if (errorHandler) {
      mockAudioElement.error = {
        code: 4,
        message: 'Failed to load because no supported source was found.',
      }
      await act(async () => {
        errorHandler()
      })
    }

    expect(screen.getByTestId('error').textContent).toBe(
      'Audio format not supported',
    )
  })

  it('maps play() NotSupportedError to app-level message', async () => {
    mockPlay.mockRejectedValueOnce(
      new DOMException(
        'The element has no supported sources.',
        'NotSupportedError',
      ),
    )

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Audio format not supported',
    )
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('playing').textContent).toBe('false')
  })

  it('calls load() to reset audio element before new source', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(mockAudioElement.load).toHaveBeenCalled()
  })
})

describe('Track switching cancellation safety', () => {
  it('switching A→B makes B the active track', async () => {
    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track')
    expect(screen.getByTestId('track-id').textContent).toBe('1')

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')
    expect(screen.getByTestId('track-id').textContent).toBe('2')
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio')
  })

  it('stale fetch resolution from track A cannot overwrite track B', async () => {
    let resolveTrackA!: (v: Response) => void
    let resolveTrackB!: (v: Response) => void

    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/1/')) {
        return new Promise<Response>((r) => {
          resolveTrackA = r
        })
      }
      return new Promise<Response>((r) => {
        resolveTrackB = r
      })
    })

    renderWithProvider()

    // Start track A (fetch hangs)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('loading').textContent).toBe('true')
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track')

    // While A is still loading, start track B
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')

    // Resolve track B first — it should update state
    await act(async () => {
      resolveTrackB({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      } as Response)
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio')

    // Now resolve track A late — it must NOT overwrite track B
    await act(async () => {
      resolveTrackA({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      } as Response)
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio')
  })

  it('stale error from track A does not set error state when track B is active', async () => {
    let resolveTrackA!: (v: Response) => void

    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/1/')) {
        return new Promise<Response>((r) => {
          resolveTrackA = r
        })
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      } as Response)
    })

    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    // Switch to B before A resolves
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')
    expect(screen.getByTestId('error').textContent).toBe('none')

    // A resolves with error — must not pollute B's state
    await act(async () => {
      resolveTrackA({
        ok: false,
        status: 500,
      } as unknown as Response)
    })
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')
  })

  it('stop() during pending fetch prevents stale resolution', async () => {
    let resolveTrackA!: (v: Response) => void

    vi.spyOn(window, 'fetch').mockImplementation(() => {
      return new Promise<Response>((r) => {
        resolveTrackA = r
      })
    })

    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('loading').textContent).toBe('true')

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('none')
    expect(screen.getByTestId('loading').textContent).toBe('false')

    // Stale resolve — must not resurrect track state
    await act(async () => {
      resolveTrackA({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      } as Response)
    })
    expect(screen.getByTestId('track-title').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('false')
  })

  it('rapid A→B switching tears down previous audio element src', async () => {
    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    const pauseCallsBefore = mockPause.mock.calls.length

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    expect(mockPause.mock.calls.length).toBeGreaterThan(pauseCallsBefore)
  })
})

describe('Validation LRU cache', () => {
  it('populates cache on successful first play', async () => {
    renderWithProvider()
    expect(_validationCache.size).toBe(0)

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(_validationCache.size).toBe(1)
    expect(window.fetch).toHaveBeenCalledTimes(1)
  })

  it('skips validation fetch on cache hit for the same track', async () => {
    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(window.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    // Second play of same track should NOT call fetch again
    expect(window.fetch).toHaveBeenCalledTimes(1)
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('does not cache on validation failure', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(_validationCache.size).toBe(0)
    expect(screen.getByTestId('error').textContent).toBe(
      'Track audio not found',
    )
  })

  it('evicts oldest entry when cache exceeds 20 tracks', () => {
    for (let i = 1; i <= 21; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`)
    }
    expect(_validationCache.size).toBe(20)
    // Track 1 (oldest) should have been evicted
    expect(_validationCache.get(1)).toBeUndefined()
    // Track 2 through 21 should still be present
    expect(_validationCache.get(2)).toBe('/api/tracks/2/audio')
    expect(_validationCache.get(21)).toBe('/api/tracks/21/audio')
  })

  it('accessing a cached entry refreshes its LRU position', () => {
    for (let i = 1; i <= 20; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`)
    }
    // Access track 1 to refresh it
    _validationCache.get(1)
    // Add track 21 — should evict track 2 (now oldest), not track 1
    _validationCache.set(21, '/api/tracks/21/audio')
    expect(_validationCache.size).toBe(20)
    expect(_validationCache.get(1)).toBe('/api/tracks/1/audio')
    expect(_validationCache.get(2)).toBeUndefined()
  })

  it('cache miss still surfaces backend errors clearly', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('Network down'))

    renderWithProvider()

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(screen.getByTestId('error').textContent).toBe('Network down')
    expect(_validationCache.size).toBe(0)
  })

  it('stale-request protections still work with cache populated', async () => {
    // Pre-populate cache for track 1
    _validationCache.set(1, '/api/tracks/1/audio')

    let resolveTrackB!: (v: Response) => void
    vi.spyOn(window, 'fetch').mockImplementation(() => {
      return new Promise<Response>((r) => {
        resolveTrackB = r
      })
    })

    renderWithProvider()

    // Play track 1 (cache hit, no fetch)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(window.fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('track-id').textContent).toBe('1')

    // Switch to track 2 (cache miss, fetch hangs)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track')

    // Stop while B is still loading
    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })
    expect(screen.getByTestId('track-title').textContent).toBe('none')

    // Stale B resolve must not resurrect state
    await act(async () => {
      resolveTrackB({
        ok: true,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      } as Response)
    })
    expect(screen.getByTestId('track-title').textContent).toBe('none')
  })
})

describe('Blob URL lifecycle (leak prevention)', () => {
  let revokeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    revokeSpy = vi.fn()
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(
      revokeSpy as (url: string) => void,
    )
  })

  it('revokes an evicted blob URL but not native endpoint URLs', () => {
    _validationCache.set(1, 'blob:track-1-wav')
    for (let i = 2; i <= 21; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`)
    }
    // Track 1 (oldest, a blob) is evicted → its blob must be revoked
    expect(revokeSpy).toHaveBeenCalledWith('blob:track-1-wav')
    expect(_validationCache.get(1)).toBeUndefined()
  })

  it('does not revoke native URLs on eviction', () => {
    for (let i = 1; i <= 21; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`)
    }
    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('revokes the blob URL when an entry is removed', () => {
    _validationCache.set(5, 'blob:track-5-wav')
    _validationCache.remove(5)
    expect(revokeSpy).toHaveBeenCalledWith('blob:track-5-wav')
  })

  it('revokes the previous blob URL when an entry is overwritten', () => {
    _validationCache.set(7, 'blob:old-wav')
    _validationCache.set(7, 'blob:new-wav')
    expect(revokeSpy).toHaveBeenCalledWith('blob:old-wav')
    expect(revokeSpy).not.toHaveBeenCalledWith('blob:new-wav')
  })

  it('revokes all cached blob URLs on clear', () => {
    _validationCache.set(1, 'blob:a')
    _validationCache.set(2, '/api/tracks/2/audio')
    _validationCache.set(3, 'blob:c')
    _validationCache.clear()
    expect(revokeSpy).toHaveBeenCalledWith('blob:a')
    expect(revokeSpy).toHaveBeenCalledWith('blob:c')
    expect(revokeSpy).not.toHaveBeenCalledWith('/api/tracks/2/audio')
  })

  it('revokes remaining blob URLs when the provider unmounts', () => {
    _validationCache.set(9, 'blob:mounted-wav')
    const { unmount } = renderWithProvider()
    unmount()
    expect(revokeSpy).toHaveBeenCalledWith('blob:mounted-wav')
  })
})

describe('Preview fetch cancellation (AbortController)', () => {
  it('aborts the in-flight preview fetch when switching tracks', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      const sig = (opts as RequestInit | undefined)?.signal
      if (sig) {
        signals.push(sig)
      }
      return new Promise<Response>(() => {
        /* never resolves — simulates a stalled LAN read */
      })
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(signals[0]?.aborted).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'))
    })
    // First track's signal must be aborted once the second play starts
    expect(signals[0]?.aborted).toBe(true)
  })

  it('aborts the in-flight preview fetch on stop', async () => {
    let capturedSignal: AbortSignal | undefined
    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      capturedSignal = (opts as RequestInit | undefined)?.signal ?? undefined
      return new Promise<Response>(() => {})
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(capturedSignal?.aborted).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })
    expect(capturedSignal?.aborted).toBe(true)
  })
})

describe('MIME normalization helpers', () => {
  it('normalizeMime strips parameters and lowercases', () => {
    expect(normalizeMime('audio/mpeg')).toBe('audio/mpeg')
    expect(normalizeMime('audio/MPEG')).toBe('audio/mpeg')
    expect(normalizeMime('audio/mpeg; charset=utf-8')).toBe('audio/mpeg')
    expect(normalizeMime('  Audio/WAV ; boundary=something ')).toBe('audio/wav')
  })

  it('browserCanPlay checks normalized type', () => {
    const el = mockAudioElement as unknown as HTMLAudioElement
    ;(el.canPlayType as ReturnType<typeof vi.fn>).mockImplementation(
      (mime: string) => (mime === 'audio/mpeg' ? 'probably' : ''),
    )
    expect(browserCanPlay(el, 'audio/mpeg')).toBe(true)
    expect(browserCanPlay(el, 'audio/mpeg; charset=utf-8')).toBe(true)
    expect(browserCanPlay(el, 'Audio/MPEG')).toBe(true)
  })

  it('browserCanPlay tries AIFF alias audio/x-aiff', () => {
    const el = mockAudioElement as unknown as HTMLAudioElement
    ;(el.canPlayType as ReturnType<typeof vi.fn>).mockImplementation(
      (mime: string) => (mime === 'audio/x-aiff' ? 'maybe' : ''),
    )
    expect(browserCanPlay(el, 'audio/aiff')).toBe(true)
    expect(browserCanPlay(el, 'audio/aif')).toBe(true)
  })

  it('browserCanPlay returns false when no variant is supported', () => {
    const el = mockAudioElement as unknown as HTMLAudioElement
    ;(el.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue('')
    expect(browserCanPlay(el, 'audio/flac')).toBe(false)
    expect(browserCanPlay(el, 'audio/aiff')).toBe(false)
  })
})

describe('Content-Type normalization in playback', () => {
  it('plays track when Content-Type has parameters', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/mpeg; charset=utf-8' }),
    } as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('true')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('plays AIFF track via client-side transcode when browser only supports wav', async () => {
    ;(
      mockAudioElement.canPlayType as ReturnType<typeof vi.fn>
    ).mockImplementation((mime: string) =>
      mime === 'audio/wav' ? 'probably' : '',
    )

    const aiffBuf = buildAiffBuffer(2, 44100, 16, 44100)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wav-from-aiff')

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(aiffBuf),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('true')
    expect(mockAudioElement.src).toBe('blob:wav-from-aiff')
  })

  it('plays AIFF track when browser supports x-aiff alias', async () => {
    ;(
      mockAudioElement.canPlayType as ReturnType<typeof vi.fn>
    ).mockImplementation((mime: string) =>
      mime === 'audio/x-aiff'
        ? 'maybe'
        : mime === 'audio/mpeg'
          ? 'probably'
          : '',
    )
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/aiff' }),
    } as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(mockPlay).toHaveBeenCalled()
  })

  it('rejects genuinely unsupported non-server-known format', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/x-unknown-codec' }),
    } as Response)

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('error').textContent).toBe(
      'Audio format not supported by this browser',
    )
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('caches transcoded blob URL for replay without re-fetching', async () => {
    ;(
      mockAudioElement.canPlayType as ReturnType<typeof vi.fn>
    ).mockImplementation((mime: string) =>
      mime === 'audio/wav' ? 'probably' : '',
    )

    const aiffBuf = buildAiffBuffer(1, 100, 16, 44100)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:transcoded-wav')

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(aiffBuf),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(screen.getByTestId('playing').textContent).toBe('true')
    expect(mockAudioElement.src).toBe('blob:transcoded-wav')
    expect(window.fetch).toHaveBeenCalledTimes(2)

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })
    expect(mockAudioElement.src).toBe('blob:transcoded-wav')
    expect(window.fetch).toHaveBeenCalledTimes(2)
  })
})

/**
 * Flexible builder for AIFF/AIFC buffers with arbitrary chunk sequences.
 */
function buildCustomAiff(
  aiffType: 'AIFF' | 'AIFC',
  chunks: Array<{ id: string; data: Uint8Array }>,
): ArrayBuffer {
  let chunksSize = 0
  for (const c of chunks) {
    chunksSize += 8 + c.data.length + (c.data.length % 2)
  }
  const totalSize = 4 + chunksSize
  const buf = new ArrayBuffer(12 + chunksSize)
  const v = new DataView(buf)
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      v.setUint8(off + i, s.charCodeAt(i))
    }
  }

  ws(0, 'FORM')
  v.setUint32(4, totalSize, false)
  ws(8, aiffType)

  let off = 12
  for (const c of chunks) {
    ws(off, c.id)
    v.setUint32(off + 4, c.data.length, false)
    new Uint8Array(buf, off + 8, c.data.length).set(c.data)
    off += 8 + c.data.length + (c.data.length % 2)
  }

  return buf
}

function makeCommChunkData(
  ch: number,
  frames: number,
  bits: number,
  rate: number,
): Uint8Array {
  const buf = new ArrayBuffer(18)
  const v = new DataView(buf)
  v.setInt16(0, ch, false)
  v.setUint32(2, frames, false)
  v.setInt16(6, bits, false)
  const exp = 16383 + Math.floor(Math.log2(rate))
  const mant = Math.round(
    (rate / Math.pow(2, Math.floor(Math.log2(rate)))) * 0x80000000,
  )
  v.setUint16(8, exp, false)
  v.setUint32(10, mant, false)
  v.setUint32(14, 0, false)
  return new Uint8Array(buf)
}

function makeAifcCommChunkData(
  ch: number,
  frames: number,
  bits: number,
  rate: number,
  compType: string,
): Uint8Array {
  const buf = new ArrayBuffer(24)
  const v = new DataView(buf)
  v.setInt16(0, ch, false)
  v.setUint32(2, frames, false)
  v.setInt16(6, bits, false)
  const exp = 16383 + Math.floor(Math.log2(rate))
  const mant = Math.round(
    (rate / Math.pow(2, Math.floor(Math.log2(rate)))) * 0x80000000,
  )
  v.setUint16(8, exp, false)
  v.setUint32(10, mant, false)
  v.setUint32(14, 0, false)
  for (let i = 0; i < 4; i++) {
    v.setUint8(18 + i, compType.charCodeAt(i))
  }
  v.setUint8(22, 1)
  v.setUint8(23, 0)
  return new Uint8Array(buf)
}

function makeSsndChunkData(
  frames: number,
  channels: number,
  bytesPerSample: number,
): Uint8Array {
  const pcmSize = frames * channels * bytesPerSample
  return new Uint8Array(8 + pcmSize)
}

describe('parseAiffHeader', () => {
  it('returns null for truncated FORM header', () => {
    const buf = new ArrayBuffer(8)
    const v = new DataView(buf)
    const ws = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) {
        v.setUint8(off + i, s.charCodeAt(i))
      }
    }
    ws(0, 'FORM')
    expect(parseAiffHeader(buf)).toBeNull()
  })

  it('throws on invalid FORM identifier', () => {
    const buf = new ArrayBuffer(12)
    expect(() => parseAiffHeader(buf)).toThrow('Not a valid AIFF file')
  })

  it('returns null when COMM chunk is missing', () => {
    const buf = buildCustomAiff('AIFF', [
      { id: 'SSND', data: makeSsndChunkData(10, 1, 2) },
    ])
    expect(parseAiffHeader(buf)).toBeNull()
  })

  it('returns null when SSND chunk is missing', () => {
    const buf = buildCustomAiff('AIFF', [
      { id: 'COMM', data: makeCommChunkData(1, 10, 16, 44100) },
    ])
    expect(parseAiffHeader(buf)).toBeNull()
  })

  it('parses COMM after SSND (reversed chunk order)', () => {
    const buf = buildCustomAiff('AIFF', [
      { id: 'SSND', data: makeSsndChunkData(10, 2, 2) },
      { id: 'COMM', data: makeCommChunkData(2, 10, 16, 44100) },
    ])
    const meta = parseAiffHeader(buf)
    expect(meta).not.toBeNull()
    expect(meta!.channels).toBe(2)
    expect(meta!.frames).toBe(10)
    expect(meta!.bitsPerSample).toBe(16)
    expect(meta!.sampleRate).toBe(44100)
  })

  it('handles odd-length chunk with padding byte', () => {
    const oddData = new Uint8Array(5)
    const buf = buildCustomAiff('AIFF', [
      { id: 'COMM', data: makeCommChunkData(1, 10, 16, 44100) },
      { id: 'MARK', data: oddData },
      { id: 'SSND', data: makeSsndChunkData(10, 1, 2) },
    ])
    const meta = parseAiffHeader(buf)
    expect(meta).not.toBeNull()
    expect(meta!.channels).toBe(1)
    expect(meta!.frames).toBe(10)
  })

  it('throws on AIFC compressed format', () => {
    const buf = buildCustomAiff('AIFC', [
      { id: 'COMM', data: makeAifcCommChunkData(2, 100, 16, 44100, 'ima4') },
      { id: 'SSND', data: makeSsndChunkData(100, 2, 2) },
    ])
    expect(() => parseAiffHeader(buf)).toThrow(
      'Unsupported AIFF-C compression: ima4',
    )
  })

  it('accepts AIFC with NONE compression', () => {
    const buf = buildCustomAiff('AIFC', [
      { id: 'COMM', data: makeAifcCommChunkData(2, 100, 16, 44100, 'NONE') },
      { id: 'SSND', data: makeSsndChunkData(100, 2, 2) },
    ])
    const meta = parseAiffHeader(buf)
    expect(meta).not.toBeNull()
    expect(meta!.channels).toBe(2)
  })

  it('reports correct ssndDataOffset and ssndDataSize', () => {
    const buf = buildAiffBuffer(2, 100, 16, 44100)
    const meta = parseAiffHeader(buf)
    expect(meta).not.toBeNull()
    expect(meta!.ssndDataOffset).toBeGreaterThan(0)
    expect(meta!.ssndDataSize).toBe(100 * 2 * 2)
  })

  it('returns null for completely empty buffer', () => {
    expect(parseAiffHeader(new ArrayBuffer(0))).toBeNull()
  })
})

describe('aiffToWav', () => {
  it('produces a valid WAV blob from a mono 16-bit AIFF', () => {
    const buf = buildAiffBuffer(1, 10, 16, 44100)
    const blob = aiffToWav(buf)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 10 * 1 * 2)
  })

  it('produces a valid WAV blob from a stereo 16-bit AIFF', () => {
    const buf = buildAiffBuffer(2, 100, 16, 48000)
    const blob = aiffToWav(buf)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 100 * 2 * 2)
  })

  it('handles 24-bit AIFF by truncating to 16-bit WAV', () => {
    const buf = buildAiffBuffer(2, 50, 24, 44100)
    const blob = aiffToWav(buf)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 50 * 2 * 2)
  })

  it('handles 32-bit AIFF by truncating to 16-bit WAV', () => {
    const buf = buildAiffBuffer(1, 10, 32, 44100)
    const blob = aiffToWav(buf)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 10 * 1 * 2)
  })

  it('correctly endian-swaps non-zero 16-bit PCM samples', async () => {
    const samples = [0x0102, -0x0304, 0x7f00, -0x7fff]
    const buf = buildAiffBuffer(1, 4, 16, 44100, samples)
    const blob = aiffToWav(buf)
    const wavBuf = await blob.arrayBuffer()
    const wavView = new DataView(wavBuf)
    expect(wavView.getInt16(44, true)).toBe(0x0102)
    expect(wavView.getInt16(46, true)).toBe(-0x0304)
    expect(wavView.getInt16(48, true)).toBe(0x7f00)
    expect(wavView.getInt16(50, true)).toBe(-0x7fff)
  })

  it('throws on non-AIFF data', () => {
    const buf = new ArrayBuffer(100)
    expect(() => aiffToWav(buf)).toThrow('Not a valid AIFF file')
  })

  it('throws descriptive error when SSND data exceeds buffer bounds', () => {
    const buf = buildCustomAiff('AIFF', [
      { id: 'COMM', data: makeCommChunkData(2, 1000, 16, 44100) },
      { id: 'SSND', data: makeSsndChunkData(10, 2, 2) },
    ])
    expect(() => aiffToWav(buf)).toThrow(/AIFF file truncated/)
  })

  it('throws on missing COMM or SSND', () => {
    const commOnly = buildCustomAiff('AIFF', [
      { id: 'COMM', data: makeCommChunkData(1, 10, 16, 44100) },
    ])
    expect(() => aiffToWav(commOnly)).toThrow('missing COMM or SSND')
  })

  it('works with COMM after SSND', () => {
    const buf = buildCustomAiff('AIFF', [
      { id: 'SSND', data: makeSsndChunkData(10, 1, 2) },
      { id: 'COMM', data: makeCommChunkData(1, 10, 16, 44100) },
    ])
    const blob = aiffToWav(buf)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 10 * 1 * 2)
  })
})

describe('buildWavHeader', () => {
  it('produces a 44-byte WAV header', () => {
    const meta: AiffMetadata = {
      channels: 2,
      frames: 100,
      bitsPerSample: 16,
      sampleRate: 44100,
      ssndDataOffset: 0,
      ssndDataSize: 400,
    }
    const header = buildWavHeader(meta)
    expect(header.byteLength).toBe(44)

    const v = new DataView(header)
    const td = new TextDecoder('ascii')
    expect(td.decode(new Uint8Array(header, 0, 4))).toBe('RIFF')
    expect(td.decode(new Uint8Array(header, 8, 4))).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(2)
    expect(v.getUint32(24, true)).toBe(44100)
    expect(v.getUint16(34, true)).toBe(16)
  })

  it('throws on Uint32 overflow from crafted metadata', () => {
    const meta: AiffMetadata = {
      channels: 2,
      frames: 0x80000000,
      bitsPerSample: 16,
      sampleRate: 44100,
      ssndDataOffset: 0,
      ssndDataSize: 400,
    }
    expect(() => buildWavHeader(meta)).toThrow('too large for WAV')
  })
})

describe('canUseStreamingMse', () => {
  it('returns false when MediaSource is not defined', () => {
    expect(canUseStreamingMse()).toBe(false)
  })

  it('returns true when MediaSource supports audio/wav', () => {
    ;(globalThis as Record<string, unknown>).MediaSource = {
      isTypeSupported: (mime: string) => mime.startsWith('audio/wav'),
    }
    try {
      expect(canUseStreamingMse()).toBe(true)
    } finally {
      delete (globalThis as Record<string, unknown>).MediaSource
    }
  })

  it('returns false when MediaSource rejects audio/wav', () => {
    ;(globalThis as Record<string, unknown>).MediaSource = {
      isTypeSupported: () => false,
    }
    try {
      expect(canUseStreamingMse()).toBe(false)
    } finally {
      delete (globalThis as Record<string, unknown>).MediaSource
    }
  })
})

describe('Streaming AIFF via MSE', () => {
  class MockSourceBuffer extends EventTarget {
    updating = false
    appendBuffer(_data: ArrayBuffer | Uint8Array) {
      this.updating = true
      queueMicrotask(() => {
        this.updating = false
        this.dispatchEvent(new Event('updateend'))
      })
    }
  }

  class MockMediaSource extends EventTarget {
    readyState = 'closed'
    addSourceBuffer(_mime: string) {
      return new MockSourceBuffer()
    }
    endOfStream(_r?: string) {
      this.readyState = 'ended'
    }
    static isTypeSupported(m: string) {
      return m.startsWith('audio/wav')
    }
    constructor() {
      super()
      queueMicrotask(() => {
        ;(this as { readyState: string }).readyState = 'open'
        this.dispatchEvent(new Event('sourceopen'))
      })
    }
  }

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).MediaSource = MockMediaSource
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-ms')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).MediaSource
  })

  it('uses streaming path when MSE is available', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)
    const data = new Uint8Array(aiffBuf)

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      let pos = 0
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          pull(controller) {
            if (pos >= data.length) {
              controller.close()
              return
            }
            const end = Math.min(pos + 512, data.length)
            controller.enqueue(new Uint8Array(data.subarray(pos, end)))
            pos = end
          },
        }),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(screen.getByTestId('playing').textContent).toBe('true')
    expect(screen.getByTestId('error').textContent).toBe('none')
  })

  it('falls back to full download when MSE is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).MediaSource
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-wav')

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(aiffBuf),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(mockAudioElement.src).toBe('blob:fallback-wav')
    expect(screen.getByTestId('playing').textContent).toBe('true')
  })

  it('seek-ahead while streaming does not crash', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)
    const data = new Uint8Array(aiffBuf)

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      let pos = 0
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          pull(controller) {
            if (pos >= data.length) {
              controller.close()
              return
            }
            const end = Math.min(pos + 512, data.length)
            controller.enqueue(new Uint8Array(data.subarray(pos, end)))
            pos = end
          },
        }),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    expect(screen.getByTestId('playing').textContent).toBe('true')

    await act(async () => {
      mockAudioElement.currentTime = 999
    })

    expect(screen.getByTestId('error').textContent).toBe('none')
  })

  it('cancellation stops streaming without crash', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)
    const data = new Uint8Array(aiffBuf)

    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      let pos = 0
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({
          pull(controller) {
            if (pos >= data.length) {
              controller.close()
              return
            }
            const end = Math.min(pos + 512, data.length)
            controller.enqueue(new Uint8Array(data.subarray(pos, end)))
            pos = end
          },
        }),
      } as unknown as Response)
    })

    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'))
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    expect(screen.getByTestId('track-title').textContent).toBe('none')
    expect(screen.getByTestId('playing').textContent).toBe('false')
    expect(screen.getByTestId('error').textContent).toBe('none')
  })
})

describe('streamAiffAsWav direct', () => {
  it('throws when fetch returns non-ok status', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const el = mockAudioElement as unknown as HTMLAudioElement
    await expect(streamAiffAsWav('/audio', el, () => false)).rejects.toThrow(
      'Audio unavailable (500)',
    )
  })

  it('throws when response has no body', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      body: null,
    } as unknown as Response)

    const el = mockAudioElement as unknown as HTMLAudioElement
    await expect(streamAiffAsWav('/audio', el, () => false)).rejects.toThrow(
      'Streaming not supported',
    )
  })

  it('returns immediately when cancelled during header parse', async () => {
    const readerCancel = vi.fn()

    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: () =>
            Promise.resolve({ done: false, value: new Uint8Array(4) }),
          cancel: readerCancel,
        }),
      },
    } as unknown as Response)

    const el = mockAudioElement as unknown as HTMLAudioElement
    await streamAiffAsWav('/audio', el, () => true)
    expect(readerCancel).toHaveBeenCalled()
  })

  it('throws descriptive error when stream ends before header complete', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array([0x46, 0x4f, 0x52, 0x4d]),
            })
            .mockResolvedValueOnce({ done: true }),
          cancel: vi.fn(),
        }),
      },
    } as unknown as Response)

    const el = mockAudioElement as unknown as HTMLAudioElement
    await expect(streamAiffAsWav('/audio', el, () => false)).rejects.toThrow(
      'AIFF file truncated: stream ended before header complete',
    )
  })
})

describe('Streaming MSE fallback to full download', () => {
  it('falls back to full-download when streaming throws', async () => {
    ;(mockAudioElement.canPlayType as ReturnType<typeof vi.fn>).mockReturnValue(
      '',
    )

    const aiffBuf = buildAiffBuffer(2, 100, 16, 44100)

    let fetchCount = 0
    vi.spyOn(window, 'fetch').mockImplementation((_url, opts) => {
      if ((opts as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'audio/aiff' }),
        } as Response)
      }
      fetchCount++
      if (fetchCount === 1) {
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: () => Promise.reject(new Error('network failure')),
              cancel: vi.fn(),
            }),
          },
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(aiffBuf),
      } as unknown as Response)
    })
    ;(globalThis as Record<string, unknown>).MediaSource = class extends (
      EventTarget
    ) {
      readyState = 'open'
      addSourceBuffer() {
        return new EventTarget()
      }
      endOfStream() {}
      static isTypeSupported(m: string) {
        return m.startsWith('audio/wav')
      }
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    try {
      renderWithProvider()
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-btn'))
      })

      expect(mockAudioElement.src).toBe('blob:fallback')
      expect(screen.getByTestId('playing').textContent).toBe('true')
    } finally {
      delete (globalThis as Record<string, unknown>).MediaSource
    }
  })
})
