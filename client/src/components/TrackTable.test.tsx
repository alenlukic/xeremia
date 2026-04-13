import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { ReactElement } from 'react';
import { TrackTable } from './TrackTable';
import type { Track } from '../types';

vi.mock('../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    track: null, playing: false, loading: false, currentTime: 0, duration: 0,
    volume: 0.8, error: null, play: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    togglePlayPause: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), stop: vi.fn(),
  }),
}));

/* ── virtualizer mock ── */

let mockRange: { startIndex: number; endIndex: number } | null = {
  startIndex: 0,
  endIndex: 19,
};

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(({ count }: { count: number }) => {
    if (!count || !mockRange) {
      return {
        getVirtualItems: () => [],
        getTotalSize: () => 0,
        measureElement: vi.fn(),
        range: null,
      };
    }
    const start = Math.min(mockRange.startIndex, count - 1);
    const end = Math.min(mockRange.endIndex, count - 1);
    const items: Array<{ index: number; start: number; size: number; end: number; key: number; lane: number }> = [];
    for (let i = start; i <= end; i++) {
      items.push({
        index: i,
        start: i * 40,
        size: 40,
        end: (i + 1) * 40,
        key: i,
        lane: 0,
      });
    }
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 40,
      measureElement: vi.fn(),
      range: { startIndex: start, endIndex: end },
    };
  }),
}));

/* ── ResizeObserver mock ── */

type ROCallback = (entries: ResizeObserverEntry[]) => void;
let roInstances: { cb: ROCallback; targets: Element[] }[] = [];

class ResizeObserverMock {
  private _targets: Element[] = [];

  constructor(cb: ROCallback) {
    roInstances.push({ cb, targets: this._targets });
  }

  observe = vi.fn((target: Element) => {
    this._targets.push(target);
  });
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function fireResizeObserver(target: Element) {
  for (const inst of roInstances) {
    if (inst.targets.includes(target)) {
      act(() => inst.cb([] as ResizeObserverEntry[]));
    }
  }
}

/* ── helpers ── */

function makeTracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Track ${i + 1}`,
    artist_names: [`Artist`],
    bpm: 120,
    key: 'C',
    camelot_code: '01A',
    genre: 'Electronic',
    label: 'Label',
    energy: 0.5,
    date_added: null,
  }));
}

function wrap(ui: ReactElement) {
  return <DndContext>{ui}</DndContext>;
}

const tracks50 = makeTracks(50);
const selectTrack = vi.fn();

beforeEach(() => {
  mockRange = { startIndex: 0, endIndex: 19 };
  roInstances = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  selectTrack.mockClear();
});

/* ─────────────────────────────────────────────── */

describe('TrackTable virtualized render path', () => {
  it('renders rows with position:absolute and data-index when virtualItems > 0', () => {
    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const tbody = container.querySelector('.track-table tbody') as HTMLElement;
    expect(tbody).toBeTruthy();
    expect(tbody.style.position).toBe('relative');

    const rows = container.querySelectorAll('.track-table tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(20);

    const firstRow = rows[0] as HTMLElement;
    expect(firstRow.style.position).toBe('absolute');
    expect(firstRow.getAttribute('data-index')).not.toBeNull();
  });

  it('all virtualized rows have position:absolute (fails if branch removed)', () => {
    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const rows = container.querySelectorAll('.track-table tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row as HTMLElement).style.position).toBe('absolute');
    }
  });

  it('tbody height equals virtualizer total size', () => {
    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const tbody = container.querySelector('.track-table tbody') as HTMLElement;
    expect(tbody.style.height).toBe(`${50 * 40}px`);
  });
});

/* ─────────────────────────────────────────────── */

describe('TrackTable virtual-range load-more', () => {
  it('fires onLoadMore when range reaches near-bottom', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 30, endIndex: 49 };

    render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not fire when range is not near bottom', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 0, endIndex: 19 };

    render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('deduplicates: does not re-fire for the same row count', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 30, endIndex: 49 };

    const { rerender } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      wrap(
        <TrackTable
          tracks={[...tracks50]}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('resets dedup guard when user scrolls away, then re-fires on return', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 30, endIndex: 49 };

    const { rerender } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    mockRange = { startIndex: 0, endIndex: 19 };
    rerender(
      wrap(
        <TrackTable
          tracks={[...tracks50]}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    mockRange = { startIndex: 30, endIndex: 49 };
    rerender(
      wrap(
        <TrackTable
          tracks={[...tracks50]}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});

/* ─────────────────────────────────────────────── */

describe('TrackTable scroll sync', () => {
  let containerDiv: HTMLDivElement;

  function renderScrollable(overrides: Record<string, unknown> = {}) {
    containerDiv = document.createElement('div');
    Object.defineProperty(containerDiv, 'clientWidth', {
      value: 800,
      configurable: true,
    });
    document.body.appendChild(containerDiv);

    return render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
          {...overrides}
        />,
      ),
      { container: containerDiv },
    );
  }

  function getScrollElements() {
    const top = containerDiv.querySelector(
      '.track-table-top-scrollbar',
    ) as HTMLElement;
    const wrapper = containerDiv.querySelector(
      '.track-table-wrapper',
    ) as HTMLElement;

    for (const el of [top, wrapper]) {
      Object.defineProperty(el, 'scrollWidth', {
        value: 938,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(el, 'clientWidth', {
        value: 800,
        configurable: true,
        writable: true,
      });
    }

    return { top, wrapper };
  }

  afterEach(() => {
    if (containerDiv?.parentNode) {
      containerDiv.parentNode.removeChild(containerDiv);
    }
  });

  it('syncs top scrollbar scrollLeft to wrapper', () => {
    renderScrollable();
    const { top, wrapper } = getScrollElements();

    top.scrollLeft = 100;
    fireEvent.scroll(top);

    expect(wrapper.scrollLeft).toBe(100);
  });

  it('syncs wrapper scrollLeft to top scrollbar', () => {
    renderScrollable();
    const { top, wrapper } = getScrollElements();

    wrapper.scrollLeft = 75;
    fireEvent.scroll(wrapper);

    expect(top.scrollLeft).toBe(75);
  });

  it('prevents infinite sync loop via ignoreNextScroll guard', () => {
    renderScrollable();
    const { top, wrapper } = getScrollElements();

    top.scrollLeft = 50;
    fireEvent.scroll(top);
    expect(wrapper.scrollLeft).toBe(50);

    fireEvent.scroll(wrapper);
    expect(top.scrollLeft).toBe(50);

    wrapper.scrollLeft = 30;
    fireEvent.scroll(wrapper);
    expect(top.scrollLeft).toBe(30);
  });

  it('clamps synced scrollLeft to target max scroll range', () => {
    renderScrollable();
    const { top, wrapper } = getScrollElements();

    Object.defineProperty(wrapper, 'scrollWidth', {
      value: 880,
      configurable: true,
    });

    top.scrollLeft = 120;
    fireEvent.scroll(top);

    expect(wrapper.scrollLeft).toBe(80);
  });

  it('clamps wrapper->top synced scrollLeft to top max scroll range', () => {
    renderScrollable();
    const { top, wrapper } = getScrollElements();

    Object.defineProperty(top, 'scrollWidth', {
      value: 880,
      configurable: true,
    });

    wrapper.scrollLeft = 999;
    fireEvent.scroll(wrapper);

    expect(top.scrollLeft).toBe(80);
  });
});

/* ─────────────────────────────────────────────── */

describe('TrackTable ResizeObserver-driven scroll width', () => {
  let containerDiv: HTMLDivElement;

  afterEach(() => {
    if (containerDiv?.parentNode) {
      containerDiv.parentNode.removeChild(containerDiv);
    }
  });

  it('spacer width uses measured wrapperScrollWidth, not totalWidth fallback', () => {
    containerDiv = document.createElement('div');
    Object.defineProperty(containerDiv, 'clientWidth', {
      value: 800,
      configurable: true,
    });
    document.body.appendChild(containerDiv);

    render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
      { container: containerDiv },
    );

    const wrapper = containerDiv.querySelector('.track-table-wrapper') as HTMLElement;
    expect(wrapper).toBeTruthy();

    const measuredWidth = 960;
    Object.defineProperty(wrapper, 'scrollWidth', {
      value: measuredWidth,
      configurable: true,
    });

    fireResizeObserver(wrapper);

    const topScrollbar = containerDiv.querySelector('.track-table-top-scrollbar') as HTMLElement;
    expect(topScrollbar).toBeTruthy();
    const spacer = topScrollbar.firstElementChild as HTMLElement;
    expect(spacer.style.width).toBe(`${measuredWidth}px`);
  });
});

/* ─────────────────────────────────────────────── */

describe('TrackTable load-more boundary precision', () => {
  it('fires onLoadMore at exact threshold (endIndex === rows.length - 5)', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 25, endIndex: 45 };

    render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onLoadMore one index before threshold (endIndex === rows.length - 6)', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 25, endIndex: 44 };

    render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('re-fires after scrolling away from threshold and returning', () => {
    const onLoadMore = vi.fn();
    mockRange = { startIndex: 30, endIndex: 46 };

    const { rerender } = render(
      wrap(
        <TrackTable
          tracks={tracks50}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    mockRange = { startIndex: 20, endIndex: 40 };
    rerender(
      wrap(
        <TrackTable
          tracks={[...tracks50]}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    mockRange = { startIndex: 30, endIndex: 46 };
    rerender(
      wrap(
        <TrackTable
          tracks={[...tracks50]}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      ),
    );

    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});

/* ─────────────────────────────────────────────── */

describe('TrackTable date_added column', () => {
  it('renders formatted date in the Date Added column', () => {
    const tracks: Track[] = [
      {
        id: 1, title: 'Dated Track', artist_names: ['A'], bpm: 128,
        key: 'C', camelot_code: '01A', genre: 'House', label: 'L',
        energy: 7, date_added: '2025-06-15T12:00:00',
      },
    ];
    mockRange = { startIndex: 0, endIndex: 0 };

    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const cells = container.querySelectorAll('.track-table tbody td');
    const cellTexts = Array.from(cells).map(c => c.textContent);
    expect(cellTexts).toContain('2025-06-15');
  });

  it('renders em-dash for null date_added', () => {
    const tracks: Track[] = [
      {
        id: 1, title: 'No Date', artist_names: ['A'], bpm: 120,
        key: 'C', camelot_code: '01A', genre: 'House', label: 'L',
        energy: 5, date_added: null,
      },
    ];
    mockRange = { startIndex: 0, endIndex: 0 };

    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const cells = container.querySelectorAll('.track-table tbody td');
    const cellTexts = Array.from(cells).map(c => c.textContent);
    expect(cellTexts).toContain('—');
  });

  it('sorts rows by date_added ascending via internal sort', () => {
    const tracks: Track[] = [
      {
        id: 1, title: 'New', artist_names: ['A'], bpm: 120,
        key: 'C', camelot_code: '01A', genre: 'House', label: 'L',
        energy: 5, date_added: '2025-06-15',
      },
      {
        id: 2, title: 'Old', artist_names: ['B'], bpm: 130,
        key: 'D', camelot_code: '02A', genre: 'Techno', label: 'M',
        energy: 8, date_added: '2024-01-01',
      },
      {
        id: 3, title: 'No Date', artist_names: ['C'], bpm: 140,
        key: 'E', camelot_code: '03A', genre: 'Trance', label: 'N',
        energy: 6, date_added: null,
      },
    ];
    mockRange = { startIndex: 0, endIndex: 2 };

    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
        />,
      ),
    );

    const header = container.querySelector('.track-table thead th:last-of-type .th-content') as HTMLElement;
    fireEvent.click(header);

    const rows = container.querySelectorAll('.track-table tbody tr');
    expect(rows.length).toBe(3);
    const titles = Array.from(rows).map(r => {
      const cells = r.querySelectorAll('td');
      return Array.from(cells).map(c => c.textContent);
    });
    const titleCol = titles.map(t => t.find(c => c === 'Old' || c === 'New' || c === 'No Date'));
    expect(titleCol).toEqual(['No Date', 'Old', 'New']);
  });

  it('shows sort indicator when sorting prop is provided', () => {
    const tracks: Track[] = [
      {
        id: 1, title: 'Track', artist_names: ['A'], bpm: 120,
        key: 'C', camelot_code: '01A', genre: 'House', label: 'L',
        energy: 5, date_added: '2025-01-01',
      },
    ];
    mockRange = { startIndex: 0, endIndex: 0 };

    const { container } = render(
      wrap(
        <TrackTable
          tracks={tracks}
          loading={false}
          selectedTrack={null}
          selectTrack={selectTrack}
          hasMore={false}
          sorting={[{ id: 'date_added', desc: true }]}
          onSortingChange={vi.fn()}
        />,
      ),
    );

    const indicators = container.querySelectorAll('.sort-indicator');
    const texts = Array.from(indicators).map(el => el.textContent?.trim());
    expect(texts).toContain('▼');
  });
});
