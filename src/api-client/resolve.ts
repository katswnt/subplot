import { apiRequest } from './request.js';
import type { ApiClientConfig, ApiResult } from './types.js';

/**
 * Subplot — resolve imported watchlist films to TMDb ids.
 *
 * IMDb rows carry a tconst (resolved via TMDb /find); Letterboxd/title-only
 * rows fall back to /search/movie. Batched: a watchlist is hundreds of films.
 */
export type ResolveFilmInput = {
  /** Shared filmKey — the response is keyed by this. */
  key: string;
  imdbId?: string;
  title: string;
  year?: string;
};

export type ResolveResponse = {
  /** filmKey → TMDb id, for every film that resolved. */
  resolved: Record<string, number>;
  /** filmKeys that could not be resolved to a TMDb id. */
  unresolved: string[];
};

export const resolveFilms = async (
  config: ApiClientConfig,
  films: ResolveFilmInput[],
): Promise<ApiResult<ResolveResponse>> =>
  apiRequest<ResolveResponse>(config, '/api/resolve', {
    method: 'POST',
    body: { films },
  });
