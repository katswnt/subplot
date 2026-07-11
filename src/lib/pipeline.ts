import {
  resolveFilms,
  getWatchProviders,
  type ApiClientConfig,
  type ResolveFilmInput,
  type FilmProviders,
} from '@letterboxd-wrappd/api-client'
import {
  optimizeStreaming,
  type StreamingFilm,
  type StreamingResult,
} from '@letterboxd-wrappd/domain/streaming'
import type { ImportedFilm } from '@letterboxd-wrappd/domain/imports'

export type OptimizeConfig = {
  region: string
  /** Canonical service slugs the user already pays for. */
  ownedServices: string[]
  maxServices?: number
  includeLibraryFree?: boolean
  tierPolicy?: 'cheapest' | 'adfree'
  maxBudget?: number
}

export type PipelineOutcome =
  | { ok: true; result: StreamingResult; unresolvedCount: number }
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
 * The full compute path: resolve imported films to TMDb ids, fetch their
 * subscription availability, then run the cheapest-combo optimizer. Both
 * network stages are chunked so watchlists of any size work.
 * Films that don't resolve or have no provider data become orphans downstream.
 */
export async function runOptimization(
  films: ImportedFilm[],
  config: OptimizeConfig,
  onProgress?: ProgressFn,
): Promise<PipelineOutcome> {
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

  // Stage 2 — subscription availability per TMDb id (chunked). A failed chunk
  // degrades gracefully: those films fall through to orphans.
  const providersById: Record<number, FilmProviders> = {}
  if (tmdbIds.length > 0) {
    const wpBatches = chunk(tmdbIds, CHUNK_SIZE)
    onProgress?.({ stage: 'availability', completed: 0, total: wpBatches.length })
    let wpDone = 0
    const wpChunks = await mapLimit(wpBatches, CHUNK_CONCURRENCY, async (batch) => {
      const w = await getWatchProviders(cfg, batch, config.region)
      onProgress?.({ stage: 'availability', completed: ++wpDone, total: wpBatches.length })
      return w
    })
    for (const w of wpChunks) {
      if (w.ok) Object.assign(providersById, w.data.providers)
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

  const result = optimizeStreaming(streamingFilms, {
    region: config.region,
    ownedServices: config.ownedServices,
    maxServices: config.maxServices,
    includeLibraryFree: config.includeLibraryFree,
    tierPolicy: config.tierPolicy,
    maxBudget: config.maxBudget,
  })

  return { ok: true, result, unresolvedCount }
}
