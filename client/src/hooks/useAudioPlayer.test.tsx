import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AudioPlayerProvider, useAudioPlayer, _validationCache } from './useAudioPlayer';

let mockPlay: ReturnType<typeof vi.fn>;
let mockPause: ReturnType<typeof vi.fn>;
let mockAudioElement: Record<string, unknown>;
let origCreateElement: typeof document.createElement;

beforeEach(() => {
  mockPlay = vi.fn().mockResolvedValue(undefined);
  mockPause = vi.fn();
  mockAudioElement = {
    play: mockPlay,
    pause: mockPause,
    volume: 0.8,
    currentTime: 0,
    duration: 0,
    src: '',
    error: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'audio') return mockAudioElement as unknown as HTMLElement;
    return origCreateElement(tag);
  });
  vi.spyOn(window, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response);
  _validationCache.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function TestConsumer() {
  const player = useAudioPlayer();
  return (
    <div>
      <span data-testid="track-id">{player.track?.id ?? 'none'}</span>
      <span data-testid="track-title">{player.track?.title ?? 'none'}</span>
      <span data-testid="playing">{String(player.playing)}</span>
      <span data-testid="loading">{String(player.loading)}</span>
      <span data-testid="error">{player.error ?? 'none'}</span>
      <span data-testid="volume">{player.volume}</span>
      <button data-testid="play-btn" onClick={() => player.play(1, 'Test Track')}>Play</button>
      <button data-testid="play-btn-2" onClick={() => player.play(2, 'Second Track')}>Play 2</button>
      <button data-testid="pause-btn" onClick={() => player.pause()}>Pause</button>
      <button data-testid="stop-btn" onClick={() => player.stop()}>Stop</button>
      <button data-testid="volume-btn" onClick={() => player.setVolume(0.5)}>Vol 50%</button>
      <button data-testid="toggle-btn" onClick={() => player.togglePlayPause(1, 'Test Track')}>Toggle</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AudioPlayerProvider>
      <TestConsumer />
    </AudioPlayerProvider>
  );
}

describe('AudioPlayerProvider', () => {
  it('starts with no track playing', () => {
    renderWithProvider();
    expect(screen.getByTestId('track-title').textContent).toBe('none');
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('validates audio endpoint then streams on play()', async () => {
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(window.fetch).toHaveBeenCalledWith('/api/tracks/1/audio');
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio');
    expect(mockPlay).toHaveBeenCalled();
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track');
  });

  it('does not use blob URLs — streams directly', async () => {
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio');
    expect(URL.createObjectURL).not.toBeDefined;
  });

  it('pauses playback', async () => {
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pause-btn'));
    });
    expect(mockPause).toHaveBeenCalled();
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('stops and clears track', async () => {
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('none');
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('sets volume', async () => {
    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('volume-btn'));
    });
    expect(mockAudioElement.volume).toBe(0.5);
    expect(screen.getByTestId('volume').textContent).toBe('0.5');
  });

  it('shows error on fetch failure', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: 'Audio file not found' }),
    } as unknown as Response);

    renderWithProvider();
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(screen.getByTestId('error').textContent).toBe('Audio file not found');
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });
});

describe('Track switching cancellation safety', () => {
  it('switching A→B makes B the active track', async () => {
    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track');
    expect(screen.getByTestId('track-id').textContent).toBe('1');

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');
    expect(screen.getByTestId('track-id').textContent).toBe('2');
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio');
  });

  it('stale fetch resolution from track A cannot overwrite track B', async () => {
    let resolveTrackA!: (v: Response) => void;
    let resolveTrackB!: (v: Response) => void;

    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/1/')) {
        return new Promise<Response>(r => { resolveTrackA = r; });
      }
      return new Promise<Response>(r => { resolveTrackB = r; });
    });

    renderWithProvider();

    // Start track A (fetch hangs)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('track-title').textContent).toBe('Test Track');

    // While A is still loading, start track B
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');

    // Resolve track B first — it should update state
    await act(async () => {
      resolveTrackB({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio');

    // Now resolve track A late — it must NOT overwrite track B
    await act(async () => {
      resolveTrackA({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');
    expect(mockAudioElement.src).toBe('/api/tracks/2/audio');
  });

  it('stale error from track A does not set error state when track B is active', async () => {
    let resolveTrackA!: (v: Response) => void;

    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/1/')) {
        return new Promise<Response>(r => { resolveTrackA = r; });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });

    // Switch to B before A resolves
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');
    expect(screen.getByTestId('error').textContent).toBe('none');

    // A resolves with error — must not pollute B's state
    await act(async () => {
      resolveTrackA({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Server error' }),
      } as unknown as Response);
    });
    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');
  });

  it('stop() during pending fetch prevents stale resolution', async () => {
    let resolveTrackA!: (v: Response) => void;

    vi.spyOn(window, 'fetch').mockImplementation(() => {
      return new Promise<Response>(r => { resolveTrackA = r; });
    });

    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(screen.getByTestId('loading').textContent).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('none');
    expect(screen.getByTestId('loading').textContent).toBe('false');

    // Stale resolve — must not resurrect track state
    await act(async () => {
      resolveTrackA({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    expect(screen.getByTestId('track-title').textContent).toBe('none');
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('rapid A→B switching tears down previous audio element src', async () => {
    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    const pauseCallsBefore = mockPause.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'));
    });
    expect(mockPause.mock.calls.length).toBeGreaterThan(pauseCallsBefore);
  });
});

describe('Validation LRU cache', () => {
  it('populates cache on successful first play', async () => {
    renderWithProvider();
    expect(_validationCache.size).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });

    expect(_validationCache.size).toBe(1);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  it('skips validation fetch on cache hit for the same track', async () => {
    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(window.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    // Second play of same track should NOT call fetch again
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(mockAudioElement.src).toBe('/api/tracks/1/audio');
    expect(mockPlay).toHaveBeenCalled();
  });

  it('does not cache on validation failure', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: 'Not found' }),
    } as unknown as Response);

    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });

    expect(_validationCache.size).toBe(0);
    expect(screen.getByTestId('error').textContent).toBe('Not found');
  });

  it('evicts oldest entry when cache exceeds 20 tracks', () => {
    for (let i = 1; i <= 21; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`);
    }
    expect(_validationCache.size).toBe(20);
    // Track 1 (oldest) should have been evicted
    expect(_validationCache.get(1)).toBeUndefined();
    // Track 2 through 21 should still be present
    expect(_validationCache.get(2)).toBe('/api/tracks/2/audio');
    expect(_validationCache.get(21)).toBe('/api/tracks/21/audio');
  });

  it('accessing a cached entry refreshes its LRU position', () => {
    for (let i = 1; i <= 20; i++) {
      _validationCache.set(i, `/api/tracks/${i}/audio`);
    }
    // Access track 1 to refresh it
    _validationCache.get(1);
    // Add track 21 — should evict track 2 (now oldest), not track 1
    _validationCache.set(21, '/api/tracks/21/audio');
    expect(_validationCache.size).toBe(20);
    expect(_validationCache.get(1)).toBe('/api/tracks/1/audio');
    expect(_validationCache.get(2)).toBeUndefined();
  });

  it('cache miss still surfaces backend errors clearly', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('Network down'));

    renderWithProvider();

    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });

    expect(screen.getByTestId('error').textContent).toBe('Network down');
    expect(_validationCache.size).toBe(0);
  });

  it('stale-request protections still work with cache populated', async () => {
    // Pre-populate cache for track 1
    _validationCache.set(1, '/api/tracks/1/audio');

    let resolveTrackB!: (v: Response) => void;
    vi.spyOn(window, 'fetch').mockImplementation(() => {
      return new Promise<Response>(r => { resolveTrackB = r; });
    });

    renderWithProvider();

    // Play track 1 (cache hit, no fetch)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn'));
    });
    expect(window.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('track-id').textContent).toBe('1');

    // Switch to track 2 (cache miss, fetch hangs)
    await act(async () => {
      fireEvent.click(screen.getByTestId('play-btn-2'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('Second Track');

    // Stop while B is still loading
    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'));
    });
    expect(screen.getByTestId('track-title').textContent).toBe('none');

    // Stale B resolve must not resurrect state
    await act(async () => {
      resolveTrackB({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    expect(screen.getByTestId('track-title').textContent).toBe('none');
  });
});
