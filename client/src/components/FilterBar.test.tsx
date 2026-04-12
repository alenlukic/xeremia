import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackTable } from './TrackTable';
import type { Track } from '../types';

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  }),
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('TrackTable column visibility', () => {
  const sampleTrack: Track = {
    id: 1,
    title: 'Test Title',
    artist_names: ['Artist'],
    bpm: 128,
    key: 'Am',
    camelot_code: '8A',
    genre: 'House',
    label: 'Toolroom',
    energy: 0.75,
  };

  it('hides a column when columnVisibility marks it false while Title remains', () => {
    render(
      <TrackTable
        tracks={[sampleTrack]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
        columnVisibility={{ bpm: false }}
      />
    );
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).not.toContain('BPM');
    expect(headers).toContain('Title');
  });

  it('renders BPM as a rounded integer', () => {
    render(
      <TrackTable
        tracks={[{ ...sampleTrack, bpm: 128.7 }]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
      />
    );
    const cells = screen.getAllByRole('cell');
    const bpmCell = cells.find(c => c.textContent === '129');
    expect(bpmCell).toBeTruthy();
    const fractionalCell = cells.find(c => c.textContent?.includes('128.7'));
    expect(fractionalCell).toBeFalsy();
  });

  it('renders BPM as integer with no trailing decimal for whole numbers', () => {
    render(
      <TrackTable
        tracks={[{ ...sampleTrack, bpm: 130.0 }]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
      />
    );
    const cells = screen.getAllByRole('cell');
    const bpmCell = cells.find(c => c.textContent === '130');
    expect(bpmCell).toBeTruthy();
  });
});

describe('TrackTable in-header column chooser', () => {
  const sampleTrack: Track = {
    id: 1,
    title: 'Test Title',
    artist_names: ['Artist'],
    bpm: 128,
    key: 'Am',
    camelot_code: '8A',
    genre: 'House',
    label: 'Toolroom',
    energy: 0.75,
  };

  const configurableColumns = [
    { id: 'bpm', label: 'BPM' },
    { id: 'genre', label: 'Genre' },
  ];

  it('opens popover on three-dot click and lists only configurable columns (not Title)', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onToggle = vi.fn();
    render(
      <TrackTable
        tracks={[sampleTrack]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
        configurableColumns={configurableColumns}
        onToggleColumn={onToggle}
      />
    );

    const btn = screen.getByRole('button', { name: /configure columns/i });
    await user.click(btn);

    expect(screen.getByLabelText('BPM')).toBeInTheDocument();
    expect(screen.getByLabelText('Genre')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('calls onToggleColumn when a checkbox is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onToggle = vi.fn();
    render(
      <TrackTable
        tracks={[sampleTrack]}
        loading={false}
        selectedTrack={null}
        selectTrack={vi.fn()}
        configurableColumns={configurableColumns}
        onToggleColumn={onToggle}
      />
    );

    await user.click(screen.getByRole('button', { name: /configure columns/i }));
    await user.click(screen.getByLabelText('BPM'));

    expect(onToggle).toHaveBeenCalledWith('bpm');
  });
});
