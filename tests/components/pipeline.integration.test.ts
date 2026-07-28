import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveWatchlist } from '../../src/lib/pipeline'
import { optimizeStreaming } from '@subplot/domain/streaming'
import type { ImportedFilm } from '@subplot/domain/imports'

/**
 * Integration test across the highest-risk seam the whole product depends on:
 * import → /api/resolve → /api/watch-providers → optimizeStreaming. `fetch` is
 * mocked with recorded-shape responses (no network), so a regression in the
 * client/pipeline wiring — request shape, ref keying, bucket flattening — fails
 * CI instead of only surfacing against live TMDb.
 */

// Raw TMDb provider ids: Netflix 8, HBO Max 1899, Tubi 73 (free-ads).
const films: ImportedFilm[] = [
  { key: 'k-parasite', title: 'Parasite', year: '2019', mediaType: 'movie' },
  { key: 'k-dune', title: 'Dune', year: '2021', mediaType: 'movie' },
  { key: 'k-tubi', title: 'A Free One', year: '2020', mediaType: 'movie' },
]

// filmKey → resolved TMDb id (arbitrary but distinct), mirroring /api/resolve.
const RESOLVED: Record<string, { mediaType: 'movie'; id: number }> = {
  'k-parasite': { mediaType: 'movie', id: 496243 },
  'k-dune': { mediaType: 'movie', id: 438631 },
  'k-tubi': { mediaType: 'movie', id: 111111 },
}
// refKey (`movie:<id>`) → the providers that stream it, mirroring /api/watch-providers.
const PROVIDERS: Record<string, unknown> = {
  'movie:496243': { flatrate: [{ providerId: 8, name: 'Netflix', logoPath: '/nf.png' }], free: [], ads: [], rent: [], buy: [] },
  'movie:438631': { flatrate: [{ providerId: 1899, name: 'HBO Max' }], free: [], ads: [], rent: [], buy: [] },
  'movie:111111': { flatrate: [], free: [], ads: [{ providerId: 73, name: 'Tubi', logoPath: '/tubi.png' }], rent: [], buy: [] },
}

const json = (payload: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(payload) }) as Response

afterEach(() => vi.unstubAllGlobals())

describe('resolve → availability → optimize pipeline', () => {
  it('threads a watchlist through both endpoints into a priced result', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/resolve')) {
        calls.push('resolve')
        const body = JSON.parse(String(init?.body)) as { films: { key: string }[] }
        const resolved: Record<string, unknown> = {}
        const matches: Record<string, unknown> = {}
        const unresolved: string[] = []
        for (const f of body.films) {
          if (RESOLVED[f.key]) {
            resolved[f.key] = RESOLVED[f.key]
            matches[f.key] = { ...RESOLVED[f.key], title: f.key, year: '2020', posterPath: null }
          } else unresolved.push(f.key)
        }
        return json({ resolved, matches, unresolved })
      }
      if (url.includes('/api/watch-providers')) {
        calls.push('watch-providers')
        const body = JSON.parse(String(init?.body)) as { refs: { mediaType: string; id: number }[] }
        const providers: Record<string, unknown> = {}
        for (const r of body.refs) {
          const k = `${r.mediaType}:${r.id}`
          if (PROVIDERS[k]) providers[k] = PROVIDERS[k]
        }
        return json({ region: 'US', providers })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))

    const outcome = await resolveWatchlist(films, 'US')
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Both endpoints were exercised, and every title resolved.
    expect(calls).toContain('resolve')
    expect(calls).toContain('watch-providers')
    expect(outcome.unresolvedCount).toBe(0)
    // Raw provider ids were flattened across flatrate + ads buckets.
    const byKey = Object.fromEntries(outcome.streamingFilms.map((f) => [f.key, f.providerIds]))
    expect(byKey['k-parasite']).toEqual([8])
    expect(byKey['k-tubi']).toEqual([73])
    expect(outcome.providerLogos[73]).toBe('/tubi.png')

    // The pure optimizer turns the priced films into a coherent recommendation.
    const result = optimizeStreaming(outcome.streamingFilms, { region: 'US' })
    expect(result.totalFilms).toBe(3)
    // Tubi (free-ads) is a free baseline; Netflix + Max are the paid options in
    // the greedy path (Netflix is the recommended best-value add, Max is "more").
    expect(result.free.some((s) => s.slug === 'tubi')).toBe(true)
    expect(result.recommended.addedServices).toContain('netflix')
    expect(result.marginalPath.map((m) => m.serviceId)).toEqual(expect.arrayContaining(['netflix', 'max']))
  })

  it('fails the whole run when availability errors, rather than emitting a false result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/resolve')) return json({ resolved: RESOLVED, matches: {}, unresolved: [] })
      // watch-providers 500s.
      return { ok: false, status: 500, text: async () => JSON.stringify({ error: { code: 'boom', message: 'upstream down' } }) } as Response
    }))

    const outcome = await resolveWatchlist(films, 'US')
    // A partial availability result would fabricate "not streaming" — so it fails.
    expect(outcome.ok).toBe(false)
  })
})
