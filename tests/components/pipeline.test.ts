import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  resolveFilms: vi.fn(),
  getWatchProviders: vi.fn(),
}));

vi.mock('@subplot/api-client', () => api);

import { chunk, resolveWatchlist } from '../../src/lib/pipeline';

describe('pipeline chunk()', () => {
  it('splits a large list into fixed-size batches (last is the remainder)', () => {
    const items = Array.from({ length: 1405 }, (_, i) => i);
    const batches = chunk(items, 400);
    expect(batches.length).toBe(4);
    expect(batches.map((b) => b.length)).toEqual([400, 400, 400, 205]);
    // No item lost or duplicated.
    expect(batches.flat()).toEqual(items);
  });

  it('returns a single batch when under the size', () => {
    expect(chunk([1, 2, 3], 400)).toEqual([[1, 2, 3]]);
  });

  it('returns no batches for an empty list', () => {
    expect(chunk([], 400)).toEqual([]);
  });
});

describe('resolveWatchlist()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops when provider availability fails instead of reporting false orphans', async () => {
    api.resolveFilms.mockResolvedValue({
      ok: true,
      data: { resolved: { 'film:one': 101 }, unresolved: [] },
    });
    api.getWatchProviders.mockResolvedValue({
      ok: false,
      failure: {
        status: 503,
        error: { code: 'watch_providers_failed', message: 'Availability is temporarily unavailable.' },
      },
    });

    const outcome = await resolveWatchlist(
      [{ key: 'film:one', title: 'Film One', year: '2024' }],
      'US',
    );

    expect(outcome).toEqual({
      ok: false,
      error: 'Availability is temporarily unavailable.',
    });
  });
});
