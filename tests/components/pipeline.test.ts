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
      data: { resolved: { 'film:one': { mediaType: 'movie', id: 101 } }, unresolved: [] },
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

  it('threads media-typed refs from resolve into watch-providers and onto films', async () => {
    api.resolveFilms.mockResolvedValue({
      ok: true,
      data: {
        resolved: {
          'ty:the-bear|2022': { mediaType: 'tv', id: 136315 },
          'ty:dune|2021': { mediaType: 'movie', id: 438631 },
        },
        unresolved: [],
      },
    });
    api.getWatchProviders.mockResolvedValue({
      ok: true,
      data: {
        region: 'US',
        providers: {
          'tv:136315': { flatrate: [{ providerId: 15, name: 'Hulu' }], free: [], ads: [], rent: [], buy: [] },
          'movie:438631': { flatrate: [{ providerId: 1899, name: 'Max' }], free: [], ads: [], rent: [], buy: [] },
        },
      },
    });

    const outcome = await resolveWatchlist(
      [
        { key: 'ty:the-bear|2022', title: 'The Bear', year: '2022', mediaType: 'tv' },
        { key: 'ty:dune|2021', title: 'Dune', year: '2021', mediaType: 'movie' },
      ],
      'US',
    );

    // watch-providers is asked for media-typed refs, not bare ids.
    const refsArg = api.getWatchProviders.mock.calls[0][1];
    expect(refsArg).toEqual(
      expect.arrayContaining([
        { mediaType: 'tv', id: 136315 },
        { mediaType: 'movie', id: 438631 },
      ]),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const bear = outcome.streamingFilms.find((f) => f.key === 'ty:the-bear|2022');
    const dune = outcome.streamingFilms.find((f) => f.key === 'ty:dune|2021');
    // Each title picks up its own provider (proving movie/tv keys don't collide).
    expect(bear).toMatchObject({ mediaType: 'tv', providerIds: [15] });
    expect(dune).toMatchObject({ mediaType: 'movie', providerIds: [1899] });
  });
});
