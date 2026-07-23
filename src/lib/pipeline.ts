import {
  resolveFilms,
  getWatchProviders,
  type ApiClientConfig,
  type ResolveFilmInput,
  type FilmProviders,
} from '@subplot/api-client'
import type { StreamingFilm } from '@subplot/domain/streaming'
import type { ImportedFilm } from '@subplot/domain/imports'

// The result of the (expensive, once-per-region) network stage. Once we hold
// these, optimizeStreaming is pure + instant, so the results screen can re-run
// it live on every control change with no further network calls.
export type ResolveOutcome =
  | { ok: true; streamingFilms: StreamingFilm[]; unresolvedCount: number }
  | { ok: false; error: string }

export type PipelineProgress = {
  stage: 'resolving' | 'availability'
  /** Batches finished in this stage. */
  completed: number
  /** Total batches in this stage. */
  total: number
}

export type ProgressFn = (p: PipelineProgress) => void

const apiConfig = (): ApiClientConfig => ({
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
})

// A real watchlist runs to thousands of films, but each request is capped
// server-side (600). Chunk well under that and run a few chunks concurrently —
// Redis caching on the server keeps repeat films (and repeat runs) cheap.
const CHUNK_SIZE = 400
const CHUNK_CONCURRENCY = 3

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Run each item through `fn` with at most `limit` in flight, preserving order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * The network stage: resolve imported films to TMDb ids and fetch their watch
 * availability (region-scoped), producing the raw provider-id map each film can
 * be watched through. Both sub-stages are chunked so watchlists of any size work.
 * Optimization (which combo to recommend) happens separately + purely downstream.
 */
export async function resolveWatchlist(
  films: ImportedFilm[],
  region: string,
  onProgress?: ProgressFn,
): Promise<ResolveOutcome> {
  const cfg = apiConfig()

  const resolveInput: ResolveFilmInput[] = films.map((f) => ({
    key: f.key,
    imdbId: f.imdbId,
    title: f.title,
    year: f.year,
  }))

  // Stage 1 — resolve to TMDb ids (chunked).
  const keyToTmdb: Record<string, number> = {}
  let unresolvedCount = 0
  const resolveBatches = chunk(resolveInput, CHUNK_SIZE)
  onProgress?.({ stage: 'resolving', completed: 0, total: resolveBatches.length })
  let resolveDone = 0
  const resolveChunks = await mapLimit(resolveBatches, CHUNK_CONCURRENCY, async (batch) => {
    const r = await resolveFilms(cfg, batch)
    onProgress?.({ stage: 'resolving', completed: ++resolveDone, total: resolveBatches.length })
    return r
  })
  for (const r of resolveChunks) {
    if (!r.ok) return { ok: false, error: r.failure.error.message }
    Object.assign(keyToTmdb, r.data.resolved)
    unresolvedCount += r.data.unresolved.length
  }

  const tmdbIds = [...new Set(Object.values(keyToTmdb))]

  // Stage 2 — subscription availability per TMDb id (chunked). Availability is
  // product-critical: a failed chunk must fail the run rather than making films
  // look unavailable and turning an upstream error into a false recommendation.
  const providersById: Record<number, FilmProviders> = {}
  if (tmdbIds.length > 0) {
    const wpBatches = chunk(tmdbIds, CHUNK_SIZE)
    onProgress?.({ stage: 'availability', completed: 0, total: wpBatches.length })
    let wpDone = 0
    const wpChunks = await mapLimit(wpBatches, CHUNK_CONCURRENCY, async (batch) => {
      const w = await getWatchProviders(cfg, batch, region)
      onProgress?.({ stage: 'availability', completed: ++wpDone, total: wpBatches.length })
      return w
    })
    for (const w of wpChunks) {
      if (!w.ok) return { ok: false, error: w.failure.error.message }
      Object.assign(providersById, w.data.providers)
    }
  }

  const streamingFilms: StreamingFilm[] = films.map((f) => {
    const tmdbId = keyToTmdb[f.key]
    const providers = tmdbId != null ? providersById[tmdbId] : undefined
    // Union every bucket a film can be watched in — subscription (flatrate),
    // free (Kanopy/Hoopla), and free-with-ads (Tubi/Pluto). The catalog decides
    // which are free vs paid; the optimizer canonicalizes the raw ids.
    const providerIds = [
      ...(providers?.flatrate ?? []),
      ...(providers?.free ?? []),
      ...(providers?.ads ?? []),
    ].map((p) => p.providerId)
    return { key: f.key, title: f.title, providerIds }
  })

  return { ok: true, streamingFilms, unresolvedCount }
}
