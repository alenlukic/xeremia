import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WeightControls } from './WeightControls';

const INITIAL_WEIGHTS: Record<string, number> = {
  BPM: 50,
  CAMELOT: 0,
  ENERGY: 100,
};

let setWeight: ReturnType<typeof vi.fn<(factor: string, value: number) => void>>;

beforeEach(() => {
  setWeight = vi.fn<(factor: string, value: number) => void>();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderGauges(weights = INITIAL_WEIGHTS) {
  return render(<WeightControls weights={weights} setWeight={setWeight} />);
}

function getMinusButtons() {
  return screen.getAllByRole('button').filter((b) => b.textContent === '−');
}

function getPlusButtons() {
  return screen.getAllByRole('button').filter((b) => b.textContent === '+');
}

describe('WeightControls +/- widgets', () => {
  it('renders - and + buttons for each gauge', () => {
    renderGauges();
    const factors = Object.keys(INITIAL_WEIGHTS);
    const minusBtns = getMinusButtons();
    const plusBtns = getPlusButtons();
    expect(minusBtns.length).toBe(factors.length);
    expect(plusBtns.length).toBe(factors.length);
  });

  it('clicking + increments by exactly 1', () => {
    renderGauges();
    const plusBtns = getPlusButtons();
    fireEvent.pointerDown(plusBtns[0]);
    fireEvent.pointerUp(document);
    expect(setWeight).toHaveBeenCalledWith('BPM', 51);
  });

  it('clicking - decrements by exactly 1', () => {
    renderGauges();
    const minusBtns = getMinusButtons();
    fireEvent.pointerDown(minusBtns[0]);
    fireEvent.pointerUp(document);
    expect(setWeight).toHaveBeenCalledWith('BPM', 49);
  });

  it('- click at 0 clamps to 0', () => {
    renderGauges();
    const minusBtns = getMinusButtons();
    // CAMELOT gauge is at 0 — second in the BPM group
    fireEvent.pointerDown(minusBtns[1]);
    fireEvent.pointerUp(document);
    expect(setWeight).toHaveBeenCalledWith('CAMELOT', 0);
  });

  it('+ click at 100 clamps to 100', () => {
    renderGauges();
    const plusBtns = getPlusButtons();
    // ENERGY gauge is at 100 — third button (first energy group)
    fireEvent.pointerDown(plusBtns[2]);
    fireEvent.pointerUp(document);
    expect(setWeight).toHaveBeenCalledWith('ENERGY', 100);
  });

  it('hold triggers continuous adjustment after delay', () => {
    renderGauges();
    const plusBtns = getPlusButtons();

    fireEvent.pointerDown(plusBtns[0]);

    expect(setWeight).toHaveBeenCalledTimes(1);
    expect(setWeight).toHaveBeenLastCalledWith('BPM', 51);

    act(() => { vi.advanceTimersByTime(300); });

    const callsAfterDelay = setWeight.mock.calls.length;

    act(() => { vi.advanceTimersByTime(1000); });

    fireEvent.pointerUp(document);

    const totalCalls = setWeight.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(callsAfterDelay);

    for (const [, val] of setWeight.mock.calls) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });
});
