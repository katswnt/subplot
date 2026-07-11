import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCached, setCached, CACHE_KEYS, CACHE_DURATION } from './_lib/redis.js';
import { sendError, sendValidationError, setCors, parseJsonBody } from './_lib/http.js';
import { validate, array, string, optional } from './_lib/validate.js';
import { mapPool } from './_lib/pool.js';

/**
 * Subplot — resolve imported watchlist films to TMDb ids.
 *
 * IMDb rows carry a tconst → TMDb /find; title-only rows → /search/movie.
 * Results are Redis-cached per identifier (mappings are effectively permanent),
 * so a shared film is resolved once across all users.
 */

const TMDB = 'https://api.themoviedb.org/3';
const MAX_FILMS = 600;

type FilmInput = { key: string; imdbId?: string; title: string; year?: string };

async function resolveOne(film: FilmInput, apiKey: string): Promise<number | null> {
  const headers: HeadersInit = { Accept: 'application/json' };

  // IMDb tconst → exact TMDb id via /find.
  if (film.imdbId && /^tt\d+$/.test(film.imdbId)) {
    const cacheKey = `${CACHE_KEYS.RESOLVE_IMDB}${film.imdbId}`;
    const cached = await getCached<number>(cacheKey);
    if (cached) return cached;
    const url = `${TMDB}/find/${film.imdbId}?external_source=imdb_id&api_key=${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { movie_results?: Array<{ id?: number }> };
    const id = data.movie_results?.[0]?.id;
    if (typeof id === 'number') {
      await setCached(cacheKey, id, CACHE_DURATION.RESOLVE);
      return id;
    }
    return null;
  }

  // Title (+ year) → best /search/movie match.
  if (!film.title) return null;
  const yearKey = film.year || '';
  const cacheKey = `${CACHE_KEYS.RESOLVE_SEARCH}${film.title.toLowerCase()}|${yearKey}`;
  const cached = await getCached<number>(cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({ api_key: apiKey, query: film.title });
  if (yearKey) params.set('year', yearKey);
  const res = await fetch(`${TMDB}/search/movie?${params.toString()}`, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ id?: number }> };
  const id = data.results?.[0]?.id;
  if (typeof id === 'number') {
    await setCached(cacheKey, id, CACHE_DURATION.RESOLVE);
    return id;
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
    });

  const result = validate(body, {
    films: array(filmValidator, { maxLength: MAX_FILMS }),
  });
  if (!result.ok) return sendValidationError(req, res, result.issues);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return sendError(req, res, 400, 'tmdb_api_key_required', 'TMDb API key required.');

  try {
    const ids = await mapPool(result.value.films, 8, (f) => resolveOne(f, apiKey));
    const resolved: Record<string, number> = {};
    const unresolved: string[] = [];
    result.value.films.forEach((film, i) => {
      const id = ids[i];
      if (typeof id === 'number') resolved[film.key] = id;
      else unresolved.push(film.key);
    });
    return res.status(200).json({ resolved, unresolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve films.';
    return sendError(req, res, 500, 'resolve_failed', message);
  }
}
