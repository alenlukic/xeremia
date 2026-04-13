import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useRef } from 'react';

type MonitorCallbacks = {
  onDragStart?: () => void;
  onDragMove?: (event: unknown) => void;
  onDragEnd?: () => void;
  onDragCancel?: () => void;
};

let monitorCallbacks: MonitorCallbacks = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  useDndMonitor: (callbacks: MonitorCallbacks) => {
    monitorCallbacks = callbacks;
  },
}));

import { useEdgeAutoScroll } from './useEdgeAutoScroll';

let mockScrollTop = 0;

function makeScrollElement(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', {
    get: () => mockScrollTop,
    set: (v: number) => { mockScrollTop = v; },
    configurable: true,
  });
  Object.defineProperty(el, 'scrollHeight', { get: () => 1000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { get: () => 400, configurable: true });
  el.getBoundingClientRect = () => ({
    top: 100, bottom: 500, left: 0, right: 800,
    width: 800, height: 400, x: 0, y: 100, toJSON: () => {},
  });
  return el;
}

let scrollEl: HTMLDivElement;
let rafCallbacks: FrameRequestCallback[] = [];
let nextRafId = 1;

function TestHarness() {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeAutoScroll(ref);
  return <div ref={(node) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = scrollEl;
  }} />;
}

beforeEach(() => {
  mockScrollTop = 200;
  scrollEl = makeScrollElement();
  monitorCallbacks = {};
  rafCallbacks = [];
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return nextRafId++;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushOneFrame() {
  const cbs = rafCallbacks.splice(0);
  for (const cb of cbs) cb(0);
}

function makeMoveEvent(clientY: number) {
  return {
    activatorEvent: new PointerEvent('pointermove', { clientY }),
    delta: { x: 0, y: 0 },
  };
}

describe('useEdgeAutoScroll', () => {
  it('scrolls down when pointer is near bottom edge during drag', () => {
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(480));
    const before = mockScrollTop;
    flushOneFrame();
    expect(mockScrollTop).toBeGreaterThan(before);
  });

  it('scrolls up when pointer is near top edge during drag', () => {
    mockScrollTop = 200;
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(120));
    const before = mockScrollTop;
    flushOneFrame();
    expect(mockScrollTop).toBeLessThan(before);
  });

  it('stops scrolling on drag end', () => {
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(480));
    monitorCallbacks.onDragEnd?.();
    const afterEnd = mockScrollTop;
    flushOneFrame();
    expect(mockScrollTop).toBe(afterEnd);
  });

  it('stops scrolling on drag cancel', () => {
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(480));
    monitorCallbacks.onDragCancel?.();
    const afterCancel = mockScrollTop;
    flushOneFrame();
    expect(mockScrollTop).toBe(afterCancel);
  });

  it('does not scroll when pointer is in center of container', () => {
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    const before = mockScrollTop;
    monitorCallbacks.onDragMove?.(makeMoveEvent(300));
    flushOneFrame();
    expect(mockScrollTop).toBe(before);
  });

  it('does not scroll up when already at top', () => {
    mockScrollTop = 0;
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(120));
    flushOneFrame();
    expect(mockScrollTop).toBe(0);
  });

  it('does not scroll down when already at bottom', () => {
    mockScrollTop = 600;
    render(<TestHarness />);
    monitorCallbacks.onDragStart?.();
    monitorCallbacks.onDragMove?.(makeMoveEvent(480));
    flushOneFrame();
    expect(mockScrollTop).toBe(600);
  });

  it('does not scroll when no drag is active', () => {
    render(<TestHarness />);
    const before = mockScrollTop;
    monitorCallbacks.onDragMove?.(makeMoveEvent(480));
    flushOneFrame();
    expect(mockScrollTop).toBe(before);
  });
});
