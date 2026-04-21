import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PlayerBar } from './PlayerBar';

let mockState = {
  track: null as { id: number; title: string } | null,
  playing: false,
  loading: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  error: null as string | null,
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  togglePlayPause: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  stop: vi.fn(),
};

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => mockState,
}));

beforeEach(() => {
  mockState = {
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  };
});

describe('PlayerBar visibility and dismiss (BUG-03)', () => {
  it('does not render when no track is playing and no error', () => {
    const { container } = render(<PlayerBar />);
    expect(container.querySelector('[data-testid="player-bar"]')).toBeNull();
  });

  it('renders when a track is active', () => {
    mockState.track = { id: 1, title: 'Test Song' };
    mockState.playing = true;

    render(<PlayerBar />);

    const bar = screen.getByTestId('player-bar');
    expect(bar).toBeTruthy();
    expect(screen.getByTestId('player-bar-title').textContent).toBe('Test Song');
  });

  it('renders dismiss button and dismisses on click', async () => {
    mockState.track = { id: 1, title: 'Test Song' };
    mockState.playing = true;

    const { container, rerender } = render(<PlayerBar />);

    expect(screen.getByTestId('player-bar')).toBeTruthy();
    const dismissBtn = screen.getByTestId('player-bar-dismiss');
    expect(dismissBtn).toBeTruthy();
    expect(dismissBtn.getAttribute('aria-label')).toBe('Close player');

    act(() => {
      dismissBtn.click();
    });

    rerender(<PlayerBar />);
    expect(container.querySelector('[data-testid="player-bar"]')).toBeNull();
    expect(mockState.stop).toHaveBeenCalled();
  });

  it('calls onVisibilityChange(true) when track is active, then false after dismiss', () => {
    const onChange = vi.fn();
    mockState.track = { id: 1, title: 'Song' };

    render(<PlayerBar onVisibilityChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(true);

    onChange.mockClear();
    const dismissBtn = screen.getByTestId('player-bar-dismiss');
    act(() => { dismissBtn.click(); });

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders as a flex child (not fixed-positioned)', () => {
    mockState.track = { id: 1, title: 'Test' };
    mockState.playing = true;

    render(<PlayerBar />);
    const bar = screen.getByTestId('player-bar');
    const style = window.getComputedStyle(bar);
    expect(style.position).not.toBe('fixed');
  });
});
