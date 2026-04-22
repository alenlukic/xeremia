import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTransitionScores, TRANSITION_SCORE_BATCH_SIZE } from './http';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function okJson(data: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as Response;
}

function makePairs(count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => [i, i + 1]);
}

describe('fetchTransitionScores batching', () => {
  it('sends a single request when pairs <= TRANSITION_SCORE_BATCH_SIZE', async () => {
    const pairs = makePairs(50);
    const scores = pairs.map((_, i) => i * 0.01);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okJson({ scores }));

    const result = await fetchTransitionScores(pairs);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.scores).toEqual(scores);
  });

  it('sends a single request for exactly TRANSITION_SCORE_BATCH_SIZE pairs', async () => {
    const pairs = makePairs(TRANSITION_SCORE_BATCH_SIZE);
    const scores = pairs.map(() => 0.5);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okJson({ scores }));

    const result = await fetchTransitionScores(pairs);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.scores).toHaveLength(TRANSITION_SCORE_BATCH_SIZE);
  });

  it('batches 107 pairs into two requests (100 + 7)', async () => {
    const pairs = makePairs(107);
    const scoresA = pairs.slice(0, 100).map((_, i) => i * 0.01);
    const scoresB = pairs.slice(100).map((_, i) => (100 + i) * 0.01);

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(okJson({ scores: scoresA }))
      .mockResolvedValueOnce(okJson({ scores: scoresB }));

    const result = await fetchTransitionScores(pairs);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const firstCallBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    const secondCallBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body,
    );
    expect(firstCallBody.pairs).toHaveLength(100);
    expect(secondCallBody.pairs).toHaveLength(7);

    expect(result.scores).toHaveLength(107);
    expect(result.scores).toEqual([...scoresA, ...scoresB]);
  });

  it('batches 250 pairs into three requests (100 + 100 + 50)', async () => {
    const pairs = makePairs(250);
    const chunk1 = pairs.slice(0, 100).map(() => 0.1);
    const chunk2 = pairs.slice(100, 200).map(() => 0.2);
    const chunk3 = pairs.slice(200).map(() => 0.3);

    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(okJson({ scores: chunk1 }))
      .mockResolvedValueOnce(okJson({ scores: chunk2 }))
      .mockResolvedValueOnce(okJson({ scores: chunk3 }));

    const result = await fetchTransitionScores(pairs);

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(result.scores).toHaveLength(250);
    expect(result.scores.slice(0, 100).every(s => s === 0.1)).toBe(true);
    expect(result.scores.slice(100, 200).every(s => s === 0.2)).toBe(true);
    expect(result.scores.slice(200).every(s => s === 0.3)).toBe(true);
  });

  it('propagates error from any batch request', async () => {
    const pairs = makePairs(150);
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(okJson({ scores: pairs.slice(0, 100).map(() => 0.5) }))
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    await expect(fetchTransitionScores(pairs)).rejects.toThrow(
      'Failed to fetch transition scores: 500',
    );
  });
});
