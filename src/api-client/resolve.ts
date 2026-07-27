import { apiRequest } from './request.js';
import type { ApiClientConfig, ApiResult } from './types.js';
import type { MediaType, TmdbRef } from '../domain/media.js';

/**
 * Subplot — resolve imported watchlist titles to TMDb refs.
 *
 * IMDb rows carry a tconst (resolved via TMDb /find, which returns both movie
 * and TV buckets); title-only rows fall back to /search/{movie,tv} when the
 * media type is known, or /search/multi when it isn't (Letterboxd rows). Every
 * resolution returns a media-typed {mediaType, id} ref, never a bare id, since
 * TMDb numbers movies and TV independently. Batched: a watchlist is hundreds.
 */
export type ResolveFilmInput = {
  /** Shared filmKey — the response is keyed by this. */
  key: string;
  imdbId?: string;
  title: string;
  year?: string;
  /** 'movie' | 'tv' when known; absent → resolved via /search/multi. */
  mediaType?: MediaType;
  /**
   * Letterboxd short URI (boxd.it/…) when the row came from a Letterboxd export.
   * The film page carries the exact TMDb id + media type, so it's the
   * authoritative fallback when title+year search is unconfident.
   */
  letterboxdUri?: string;
};

/** A resolved title with the display fields the review step shows the user. */
export type ResolveMatch = TmdbRef & {
  title: string;
  year: string;
  /** TMDb poster path (e.g. "/abc.jpg"), or null. Build a URL with an image base. */
  posterPath: string | null;
};

export type ResolveResponse = {
  /** filmKey → TMDb ref, for every title that resolved. */
  resolved: Record<string, TmdbRef>;
  /** filmKey → the matched title's display info (title/year/poster), for review. */
  matches: Record<string, ResolveMatch>;
  /** filmKeys that could not be resolved to a TMDb ref. */
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
