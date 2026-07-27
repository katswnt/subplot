import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCached, setCached, CACHE_KEYS, CACHE_DURATION } from './_lib/redis.js';
import { sendError, sendValidationError, setCors, parseJsonBody } from './_lib/http.js';
import { validate, string } from './_lib/validate.js';

/**
 * Subplot — free-text TMDb search for the review step's "find the right one"
 * picker. When a title doesn't match confidently (or matches wrong), the user
 * searches and picks the correct movie/TV result. Returns a handful of
 * candidates with the display fields the picker shows. Redis-cached by query.
 */

type MediaType = 'movie' | 'tv';
type Candidate = { mediaType: MediaType; id: number; title: string; year: string; posterPath: string | null };

type TmdbResult = {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

const TMDB = 'https://api.themoviedb.org/3';
const MAX_RESULTS = 6;

const toCandidate = (r: TmdbResult): Candidate | null => {
  if (typeof r.id !== 'number' || (r.media_type !== 'movie' && r.media_type !== 'tv')) return null;
  const mediaType = r.media_type;
  const title = (mediaType === 'tv' ? r.name : r.title) || r.title || r.name || '';
  if (!title) return null;
  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
  return { mediaType, id: r.id, title, year, posterPath: r.poster_path ?? null };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendError(req, res, 405, 'method_not_allowed', 'Use POST.');

  const body = parseJsonBody(req);
  if (!body) return sendError(req, res, 400, 'invalid_json', 'Request body must be JSON.');

  const result = validate<{ query: string }>(body, { query: string({ minLength: 1, maxLength: 300 }) });
  if (!result.ok) return sendValidationError(req, res, result.issues);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return sendError(req, res, 400, 'tmdb_api_key_required', 'TMDb API key required.');

  const query = result.value.query.trim();
  const cacheKey = `${CACHE_KEYS.SEARCH}${query.toLowerCase()}`;
  const cached = await getCached<Candidate[]>(cacheKey);
  if (cached) return res.status(200).json({ candidates: cached });

  try {
    const params = new URLSearchParams({ api_key: apiKey, query });
    const tmdb = await fetch(`${TMDB}/search/multi?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!tmdb.ok) return sendError(req, res, 502, 'tmdb_search_failed', `TMDb returned ${tmdb.status}.`);
    const data = (await tmdb.json()) as { results?: TmdbResult[] };
    const candidates = (data.results ?? [])
      .map(toCandidate)
      .filter((c): c is Candidate => c !== null)
      .slice(0, MAX_RESULTS);
    // Search results are stable enough to cache like resolutions.
    await setCached(cacheKey, candidates, CACHE_DURATION.RESOLVE);
    return res.status(200).json({ candidates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search failed.';
    return sendError(req, res, 500, 'search_failed', message);
  }
}
