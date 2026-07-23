import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCached, setCached, CACHE_KEYS, CACHE_DURATION } from './_lib/redis.js';
import { sendError, sendValidationError, setCors, parseJsonBody } from './_lib/http.js';
import { validate, array, string, optional, oneOf } from './_lib/validate.js';
import { mapPool } from './_lib/pool.js';

/**
 * Subplot — resolve imported watchlist titles to TMDb refs.
 *
 * IMDb rows carry a tconst → TMDb /find (which returns BOTH a movie and a TV
 * bucket, so it disambiguates itself); title-only rows → /search/{movie,tv}
 * when the media type is known, else /search/multi (Letterboxd rows, where the
 * source carries no type signal — TMDb reports the type back). Every result is
 * a media-typed {mediaType, id} ref: TMDb numbers movies and TV independently,
 * so a bare id is ambiguous. Redis-cached per identifier (mappings are
 * effectively permanent), so a shared title is resolved once across all users.
 */

// Media type mirrors src/domain/media.ts — the server tsconfig can't import from
// src, so the wire contract is re-declared here (as FilmProviders is elsewhere).
type MediaType = 'movie' | 'tv';
type TmdbRef = { mediaType: MediaType; id: number };

const TMDB = 'https://api.themoviedb.org/3';
const MAX_FILMS = 600;

type FilmInput = { key: string; imdbId?: string; title: string; year?: string; mediaType?: MediaType };

async function resolveOne(film: FilmInput, apiKey: string): Promise<TmdbRef | null> {
  const headers: HeadersInit = { Accept: 'application/json' };

  // IMDb tconst → /find, which returns both movie_results and tv_results.
  if (film.imdbId && /^tt\d+$/.test(film.imdbId)) {
    const cacheKey = `${CACHE_KEYS.RESOLVE_IMDB}${film.imdbId}`;
    const cached = await getCached<TmdbRef>(cacheKey);
    if (cached) return cached;
    const url = `${TMDB}/find/${film.imdbId}?external_source=imdb_id&api_key=${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      movie_results?: Array<{ id?: number }>;
      tv_results?: Array<{ id?: number }>;
    };
    const movieId = data.movie_results?.[0]?.id;
    const tvId = data.tv_results?.[0]?.id;
    // Prefer the bucket matching the import's media hint; else whichever exists.
    let ref: TmdbRef | null = null;
    if (film.mediaType === 'tv' && typeof tvId === 'number') ref = { mediaType: 'tv', id: tvId };
    else if (film.mediaType === 'movie' && typeof movieId === 'number') ref = { mediaType: 'movie', id: movieId };
    else if (typeof movieId === 'number') ref = { mediaType: 'movie', id: movieId };
    else if (typeof tvId === 'number') ref = { mediaType: 'tv', id: tvId };
    if (ref) {
      await setCached(cacheKey, ref, CACHE_DURATION.RESOLVE);
      return ref;
    }
    return null;
  }

  // Title (+ year) → search. Endpoint follows the media hint; unknown → /multi.
  if (!film.title) return null;
  const yearKey = film.year || '';
  const mode: MediaType | 'multi' = film.mediaType ?? 'multi';
  const cacheKey = `${CACHE_KEYS.RESOLVE_SEARCH}${mode}:${film.title.toLowerCase()}|${yearKey}`;
  const cached = await getCached<TmdbRef>(cacheKey);
  if (cached) return cached;

  let ref: TmdbRef | null = null;
  const params = new URLSearchParams({ api_key: apiKey, query: film.title });
  if (mode === 'multi') {
    // /multi carries no year query param, so keep the year signal by filtering
    // its results: prefer the movie/TV hit whose release/first-air year matches
    // the import (disambiguates remakes and movie-vs-series-of-same-name), and
    // only fall back to TMDb's top-ranked hit when no year matches.
    const res = await fetch(`${TMDB}/search/multi?${params.toString()}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ id?: number; media_type?: string; release_date?: string; first_air_date?: string }>;
    };
    const candidates = (data.results ?? []).filter(
      (r) => (r.media_type === 'movie' || r.media_type === 'tv') && typeof r.id === 'number',
    );
    const yearOf = (r: { release_date?: string; first_air_date?: string }): string =>
      (r.release_date || r.first_air_date || '').slice(0, 4);
    const hit = (yearKey && candidates.find((r) => yearOf(r) === yearKey)) || candidates[0];
    if (hit && typeof hit.id === 'number') ref = { mediaType: hit.media_type as MediaType, id: hit.id };
  } else {
    // TV search filters on first_air_date_year, movie search on year.
    if (yearKey) params.set(mode === 'tv' ? 'first_air_date_year' : 'year', yearKey);
    const res = await fetch(`${TMDB}/search/${mode}?${params.toString()}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ id?: number }> };
    const id = data.results?.[0]?.id;
    if (typeof id === 'number') ref = { mediaType: mode, id };
  }
  if (ref) {
    await setCached(cacheKey, ref, CACHE_DURATION.RESOLVE);
    return ref;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendError(req, res, 405, 'method_not_allowed', 'Use POST.');

  const body = parseJsonBody(req);
  if (!body) return sendError(req, res, 400, 'invalid_json', 'Request body must be JSON.');

  const filmValidator = (value: unknown) =>
    validate<FilmInput>(value, {
      key: string({ maxLength: 300 }),
      imdbId: optional(string({ maxLength: 20 })),
      title: string({ maxLength: 300 }),
      year: optional(string({ maxLength: 8 })),
      mediaType: optional(oneOf(['movie', 'tv'] as const)),
    });

  const result = validate(body, {
    films: array(filmValidator, { maxLength: MAX_FILMS }),
  });
  if (!result.ok) return sendValidationError(req, res, result.issues);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return sendError(req, res, 400, 'tmdb_api_key_required', 'TMDb API key required.');

  try {
    const refs = await mapPool(result.value.films, 8, (f) => resolveOne(f, apiKey));
    const resolved: Record<string, TmdbRef> = {};
    const unresolved: string[] = [];
    result.value.films.forEach((film, i) => {
      const ref = refs[i];
      if (ref) resolved[film.key] = ref;
      else unresolved.push(film.key);
    });
    return res.status(200).json({ resolved, unresolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve films.';
    return sendError(req, res, 500, 'resolve_failed', message);
  }
}
