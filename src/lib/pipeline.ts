import {
  resolveFilms,
  getWatchProviders,
  type ApiClientConfig,
  type ResolveFilmInput,
} from '@letterboxd-wrappd/api-client'
import {
  optimizeStreaming,
  type ImportedFilm,
  type StreamingFilm,
  type StreamingResult,
} from '@letterboxd-wrappd/domain'

export type OptimizeConfig = {
  region: string
  ownedServices: number[]
  maxServices?: number
}

export type PipelineOutcome =
  | { ok: true; result: StreamingResult; unresolvedCount: number }
  | { ok: false; error: string }

const apiConfig = (): ApiClientConfig => ({
  baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
})

/**
 * The full compute path: resolve imported films to TMDb ids, fetch their
 * subscription availability, then run the cheapest-combo optimizer.
 * Films that don't resolve or have no provider data become orphans downstream.
 */
export async function runOptimization(
  films: ImportedFilm[],
  config: OptimizeConfig,
): Promise<PipelineOutcome> {
  const cfg = apiConfig()

  const resolveInput: ResolveFilmInput[] = films.map((f) => ({
    key: f.key,
    imdbId: f.imdbId,
    title: f.title,
    year: f.year,
  }))

  const resolved = await resolveFilms(cfg, resolveInput)
  if (!resolved.ok) return { ok: false, error: resolved.failure.error.message }

  const keyToTmdb = resolved.data.resolved
  const tmdbIds = [...new Set(Object.values(keyToTmdb))]

  // No film resolved → everything is an orphan; still return a valid result.
  const providersById =
    tmdbIds.length === 0
      ? {}
      : await (async () => {
          const wp = await getWatchProviders(cfg, tmdbIds, config.region)
          return wp.ok ? wp.data.providers : {}
        })()

  const streamingFilms: StreamingFilm[] = films.map((f) => {
    const tmdbId = keyToTmdb[f.key]
    const providers = tmdbId != null ? providersById[tmdbId] : undefined
    const providerIds = (providers?.flatrate ?? []).map((p) => p.providerId)
    return { key: f.key, title: f.title, providerIds }
  })

  const result = optimizeStreaming(streamingFilms, {
    region: config.region,
    ownedServices: config.ownedServices,
    maxServices: config.maxServices,
  })

  return { ok: true, result, unresolvedCount: resolved.data.unresolved.length }
}
