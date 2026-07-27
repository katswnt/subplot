import {
  resolveFilms,
  getWatchProviders,
  type ApiClientConfig,
  type ResolveFilmInput,
  type ResolveMatch,
  type FilmProviders,
} from '@subplot/api-client'
import type { StreamingFilm } from '@subplot/domain/streaming'
import type { ImportedFilm } from '@subplot/domain/imports'
import { tmdbRefKey, type TmdbRef } from '../domain/media.js'

// The result of the (expensive, once-per-region) network stage. Once we hold
// these, optimizeStreaming is pure + instant, so the results screen can re-run
// it live on every control change with no further network calls.
export type ResolveOutcome =
  | {
      ok: true
      streamingFilms: StreamingFilm[]
      unresolvedCount: number
      /** TMDb providerId → logo path, for rendering service logos. */
      providerLogos: Record<number, string>
    }
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
// server-side (600). Smaller chunks (vs. one 400-title request) make the
// progress bar move sooner and in finer steps — a 1,400-title list becomes
// ~14 batches instead of ~4, so it doesn't sit at 0 then lurch. Redis caching
// on the server keeps repeat films (and repeat runs) cheap.
const CHUNK_SIZE = 100
const CHUNK_CONCURRENCY = 4

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

// Stage 1 alone — resolve titles to TMDb refs + display info, WITHOUT fetching
// availability. The review step sits between: resolve, let the user confirm the
// uncertain matches, THEN price only the confirmed set.
export type ResolveTitlesOutcome =
  | {
      ok: true
      /** filmKey → matched title's display info (title/year/poster), for review. */
      matches: Record<string, ResolveMatch>
      /** filmKey → TMDb ref, for every title that resolved. */
      keyToRef: Record<string, TmdbRef>
      /** filmKeys that resolved to nothing. */
      unresolvedKeys: string[]
    }
  | { ok: false; error: string }

/** Stage 1: resolve imported titles to TMDb refs + display info (chunked). */
export async function resolveTitles(
  films: ImportedFilm[],
  onProgress?: ProgressFn,
): Promise<ResolveTitlesOutcome> {
  const cfg = apiConfig()
  const resolveInput: ResolveFilmInput[] = films.map((f) => ({
    key: f.key,
    imdbId: f.imdbId,
    title: f.title,
    year: f.year,
    mediaType: f.mediaType,
    letterboxdUri: f.letterboxdUri,
  }))

  const keyToRef: Record<string, TmdbRef> = {}
  const matches: Record<string, ResolveMatch> = {}
  const unresolvedKeys: string[] = []
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
    Object.assign(keyToRef, r.data.resolved)
    Object.assign(matches, r.data.matches)
    unresolvedKeys.push(...r.data.unresolved)
  }
  return { ok: true, matches, keyToRef, unresolvedKeys }
}

/**
 * Stage 2: fetch subscription availability for the given films' refs and build
 * the raw provider-id map per film. Takes a (possibly review-filtered) film set
 * and its resolved refs. Availability is product-critical: a failed chunk must
 * fail the run rather than making titles look unavailable and turning an
 * upstream error into a false recommendation.
 */
export async function fetchAvailability(
  films: ImportedFilm[],
  keyToRef: Record<string, TmdbRef>,
  region: string,
  onProgress?: ProgressFn,
): Promise<ResolveOutcome> {
  const cfg = apiConfig()

  // Unique refs to price — de-duped by ref key (movie 1399 ≠ tv 1399).
  const uniqueRefs = [...new Map(Object.values(keyToRef).map((r) => [tmdbRefKey(r), r])).values()]

  const providersByRefKey: Record<string, FilmProviders> = {}
  if (uniqueRefs.length > 0) {
    const wpBatches = chunk(uniqueRefs, CHUNK_SIZE)
    onProgress?.({ stage: 'availability', completed: 0, total: wpBatches.length })
    let wpDone = 0
    const wpChunks = await mapLimit(wpBatches, CHUNK_CONCURRENCY, async (batch) => {
      const w = await getWatchProviders(cfg, batch, region)
      onProgress?.({ stage: 'availability', completed: ++wpDone, total: wpBatches.length })
      return w
    })
    for (const w of wpChunks) {
      if (!w.ok) return { ok: false, error: w.failure.error.message }
      Object.assign(providersByRefKey, w.data.providers)
    }
  }

  const streamingFilms: StreamingFilm[] = films.map((f) => {
    const ref = keyToRef[f.key]
    const providers = ref ? providersByRefKey[tmdbRefKey(ref)] : undefined
    // Union every bucket a title can be watched in — subscription (flatrate),
    // free (Kanopy/Hoopla), and free-with-ads (Tubi/Pluto). The catalog decides
    // which are free vs paid; the optimizer canonicalizes the raw ids.
    const providerIds = [
      ...(providers?.flatrate ?? []),
      ...(providers?.free ?? []),
      ...(providers?.ads ?? []),
    ].map((p) => p.providerId)
    // Prefer the media type TMDb confirmed (covers Letterboxd rows resolved via
    // /search/multi); fall back to the import hint for unresolved titles.
    return { key: f.key, title: f.title, providerIds, mediaType: ref?.mediaType ?? f.mediaType }
  })

  // Capture each provider's logo (union across titles) for the where-to-watch view.
  const providerLogos: Record<number, string> = {}
  for (const fp of Object.values(providersByRefKey)) {
    for (const p of [...fp.flatrate, ...fp.free, ...fp.ads]) {
      if (p.logoPath && !(p.providerId in providerLogos)) providerLogos[p.providerId] = p.logoPath
    }
  }

  const unresolvedCount = films.filter((f) => !keyToRef[f.key]).length
  return { ok: true, streamingFilms, unresolvedCount, providerLogos }
}

/**
 * The full network stage: resolve then price, in one call. Kept for the
 * no-review path (and existing callers/tests) — equivalent to resolveTitles
 * followed by fetchAvailability over the same film set.
 */
export async function resolveWatchlist(
  films: ImportedFilm[],
  region: string,
  onProgress?: ProgressFn,
): Promise<ResolveOutcome> {
  const resolved = await resolveTitles(films, onProgress)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  return fetchAvailability(films, resolved.keyToRef, region, onProgress)
}
