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
/** A resolved title with the display fields the review step shows the user. */
type ResolveMatch = { mediaType: MediaType; id: number; title: string; year: string; posterPath: string | null };

const TMDB = 'https://api.themoviedb.org/3';
const MAX_FILMS = 600;

type FilmInput = {
  key: string;
  imdbId?: string;
  title: string;
  year?: string;
  mediaType?: MediaType;
  letterboxdUri?: string;
};

// A single TMDb search/find result — movies carry `title`/`release_date`, TV
// carries `name`/`first_air_date`; `/multi` results also tag `media_type`.
type TmdbResult = {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

const toMatch = (mediaType: MediaType, r: TmdbResult | undefined): ResolveMatch | null => {
  if (!r || typeof r.id !== 'number') return null;
  const title = (mediaType === 'tv' ? r.name : r.title) || r.title || r.name || '';
  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
  return { mediaType, id: r.id, title, year, posterPath: r.poster_path ?? null };
};

const yearOf = (r: TmdbResult): string => (r.release_date || r.first_air_date || '').slice(0, 4);

/**
 * Pick the result whose year best matches the import — exact, then ±1 (festival
 * vs. release year), then TMDb's top-ranked hit. Beats results[0] for short /
 * common titles ("Badlands", "Z", "Stray Dogs") where TMDb ranks a newer or
 * more popular film first. Done client-side (not via TMDb's strict `year`
 * param, which would drop the right film on a ±1 gap).
 */
const pickByYear = (candidates: TmdbResult[], yearKey: string): TmdbResult | null => {
  if (candidates.length === 0) return null;
  if (!yearKey) return candidates[0];
  const y = Number(yearKey);
  const exact = candidates.find((c) => yearOf(c) === yearKey);
  if (exact) return exact;
  const near = candidates.find((c) => {
    const cy = Number(yearOf(c));
    return Number.isFinite(cy) && Math.abs(cy - y) <= 1;
  });
  return near ?? candidates[0];
};

const normalizeTitle = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Is a search hit trustworthy enough to skip the authoritative Letterboxd
 * lookup? Requires the typed words to be well-covered by the matched title AND
 * the year to line up (±1 for festival/release drift). Mirrors the client-side
 * review scorer so the fast path only keeps matches the review step wouldn't
 * flag. Deliberately strict: a miss here just triggers the URI fallback.
 */
const isConfident = (film: FilmInput, match: ResolveMatch): boolean => {
  const typed = normalizeTitle(film.title).split(' ').filter(Boolean);
  if (typed.length === 0) return false;
  const matchWords = new Set(normalizeTitle(match.title).split(' ').filter(Boolean));
  const covered = typed.filter((w) => matchWords.has(w)).length / typed.length;
  if (covered < 0.8) return false;
  const ty = Number(film.year);
  const my = Number(match.year);
  if (film.year && Number.isFinite(ty) && Number.isFinite(my) && Math.abs(my - ty) > 1) return false;
  return true;
};

/**
 * Resolve via the Letterboxd film page — the authoritative source. A Letterboxd
 * export row carries a boxd.it short URI; the film page links to
 * `themoviedb.org/{movie|tv}/{id}`, giving the EXACT id and the correct media
 * type (unlike title search, which can't reach TV miniseries when we force
 * movie, mis-picks same-year namesakes, or chokes on very long titles). Used
 * only when title+year search is unconfident, so the cost is bounded to the
 * hard cases. Cached permanently by URI (a film's TMDb id never changes).
 */
async function resolveViaLetterboxd(uri: string, apiKey: string): Promise<ResolveMatch | null> {
  if (!/^https?:\/\/(boxd\.it|letterboxd\.com)\//i.test(uri)) return null;
  const cacheKey = `${CACHE_KEYS.RESOLVE_LB}${uri}`;
  const cached = await getCached<ResolveMatch>(cacheKey);
  if (cached) return cached;

  let html: string;
  try {
    const res = await fetch(uri, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SubplotBot/1.0; +https://subplot.katswint.com)' },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // The page links to the canonical TMDb record; the link's path segment is the
  // reliable media type (the `data-tmdb-type` attribute mislabels TV as movie).
  const m = html.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
  if (!m) return null;
  const mediaType = m[1].toLowerCase() as MediaType;
  const id = Number(m[2]);
  if (!Number.isFinite(id)) return null;

  // One detail call to fill the title/year/poster the review step displays.
  const detailRes = await fetch(`${TMDB}/${mediaType}/${id}?api_key=${apiKey}`, {
    headers: { Accept: 'application/json' },
  });
  if (!detailRes.ok) return null;
  const match = toMatch(mediaType, (await detailRes.json()) as TmdbResult);
  if (!match) return null;
  await setCached(cacheKey, match, CACHE_DURATION.RESOLVE);
  return match;
}

async function resolveOne(film: FilmInput, apiKey: string): Promise<ResolveMatch | null> {
  const headers: HeadersInit = { Accept: 'application/json' };

  // IMDb tconst → /find, which returns both movie_results and tv_results.
  if (film.imdbId && /^tt\d+$/.test(film.imdbId)) {
    const cacheKey = `${CACHE_KEYS.RESOLVE_IMDB}${film.imdbId}`;
    const cached = await getCached<ResolveMatch>(cacheKey);
    if (cached) return cached;
    const url = `${TMDB}/find/${film.imdbId}?external_source=imdb_id&api_key=${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { movie_results?: TmdbResult[]; tv_results?: TmdbResult[] };
    const movie = data.movie_results?.[0];
    const tv = data.tv_results?.[0];
    // Prefer the bucket matching the import's media hint; else whichever exists.
    let match: ResolveMatch | null = null;
    if (film.mediaType === 'tv' && tv) match = toMatch('tv', tv);
    else if (film.mediaType === 'movie' && movie) match = toMatch('movie', movie);
    else if (movie) match = toMatch('movie', movie);
    else if (tv) match = toMatch('tv', tv);
    if (match) {
      await setCached(cacheKey, match, CACHE_DURATION.RESOLVE);
      return match;
    }
    return null;
  }

  // Title (+ year) → search. Endpoint follows the media hint; unknown → /multi.
  if (!film.title) {
    // No title but maybe a Letterboxd URI — still resolvable authoritatively.
    return film.letterboxdUri ? resolveViaLetterboxd(film.letterboxdUri, apiKey) : null;
  }
  const yearKey = film.year || '';
  const mode: MediaType | 'multi' = film.mediaType ?? 'multi';
  const cacheKey = `${CACHE_KEYS.RESOLVE_SEARCH}${mode}:${film.title.toLowerCase()}|${yearKey}`;
  const cached = await getCached<ResolveMatch>(cacheKey);
  // A confident cached hit is final; an unconfident one still tries the URI.
  if (cached && isConfident(film, cached)) return cached;

  let match: ResolveMatch | null = null;
  const params = new URLSearchParams({ api_key: apiKey, query: film.title });
  // A failed search (e.g. TMDb 429 under a big list) leaves `match` null so we
  // fall through to the URI fallback rather than dropping the film.
  const searchUrl = mode === 'multi' ? `${TMDB}/search/multi?${params}` : `${TMDB}/search/${mode}?${params}`;
  const res = await fetch(searchUrl, { headers });
  if (res.ok) {
    const data = (await res.json()) as { results?: TmdbResult[] };
    const candidates = (data.results ?? []).filter((r) =>
      // /multi returns mixed media (tag each); a typed endpoint is single-media.
      mode === 'multi' ? (r.media_type === 'movie' || r.media_type === 'tv') && typeof r.id === 'number' : typeof r.id === 'number',
    );
    const hit = pickByYear(candidates, yearKey);
    if (hit) match = toMatch(mode === 'multi' ? (hit.media_type as MediaType) : mode, hit);
  }

  // The search hit is only final when it's confident. Otherwise the Letterboxd
  // page is authoritative — it fixes TV titles we can't reach via /search/movie
  // ("World on a Wire"), same-year namesakes ("Hard Eight"), long titles
  // ("Jeanne Dielman…"), and transient search failures.
  if (match && isConfident(film, match)) {
    await setCached(cacheKey, match, CACHE_DURATION.RESOLVE);
    return match;
  }
  if (film.letterboxdUri) {
    const authoritative = await resolveViaLetterboxd(film.letterboxdUri, apiKey);
    if (authoritative) return authoritative;
  }
  // No URI (or its lookup failed): keep the unconfident search hit so the review
  // step can show it — better a flagged guess than a silent drop. Cache it too.
  if (match) {
    await setCached(cacheKey, match, CACHE_DURATION.RESOLVE);
    return match;
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
      letterboxdUri: optional(string({ maxLength: 200 })),
    });

  const result = validate(body, {
    films: array(filmValidator, { maxLength: MAX_FILMS }),
  });
  if (!result.ok) return sendValidationError(req, res, result.issues);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return sendError(req, res, 400, 'tmdb_api_key_required', 'TMDb API key required.');

  try {
    const found = await mapPool(result.value.films, 8, (f) => resolveOne(f, apiKey));
    const matches: Record<string, ResolveMatch> = {};
    const resolved: Record<string, TmdbRef> = {};
    const unresolved: string[] = [];
    result.value.films.forEach((film, i) => {
      const match = found[i];
      if (match) {
        matches[film.key] = match;
        resolved[film.key] = { mediaType: match.mediaType, id: match.id };
      } else {
        unresolved.push(film.key);
      }
    });
    // `matches` carries the display fields (title/year/poster) the review step
    // needs; `resolved` stays as the bare-ref map the pipeline consumes today.
    return res.status(200).json({ resolved, matches, unresolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve films.';
    return sendError(req, res, 500, 'resolve_failed', message);
  }
}
