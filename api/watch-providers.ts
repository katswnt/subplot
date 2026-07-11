import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCached, setCached, CACHE_KEYS, CACHE_DURATION } from './_lib/redis.js';
import { sendError, sendValidationError, setCors, parseJsonBody } from './_lib/http.js';
import { validate, array, number, string } from './_lib/validate.js';
import { mapPool } from './_lib/pool.js';

/**
 * Subplot — per-film streaming availability from TMDb watch/providers.
 *
 * Provider data is universal (region-scoped, not per-user) → Redis-cached per
 * (region, tmdbId) for a strong cross-user hit rate. MVP consumes `flatrate`
 * (subscription) for the optimizer; `rent`/`buy` are carried through for V2.
 *
 * Data by JustWatch, surfaced via TMDb — attribute JustWatch in the UI.
 */

const TMDB = 'https://api.themoviedb.org/3';
const MAX_IDS = 600;

type WatchProvider = { providerId: number; name: string; logoPath?: string };
type FilmProviders = { flatrate: WatchProvider[]; rent: WatchProvider[]; buy: WatchProvider[]; link?: string };

type TmdbOffer = { provider_id?: number; provider_name?: string; logo_path?: string };
type TmdbRegion = { link?: string; flatrate?: TmdbOffer[]; rent?: TmdbOffer[]; buy?: TmdbOffer[] };

const mapOffers = (offers?: TmdbOffer[]): WatchProvider[] =>
  (offers ?? [])
    .filter((o): o is TmdbOffer & { provider_id: number } => typeof o.provider_id === 'number')
    .map((o) => ({
      providerId: o.provider_id,
      name: o.provider_name ?? '',
      logoPath: o.logo_path || undefined,
    }));

async function fetchProviders(id: number, region: string, apiKey: string): Promise<FilmProviders | null> {
  const cacheKey = `${CACHE_KEYS.WATCH_PROVIDERS}${region}:${id}`;
  const cached = await getCached<FilmProviders>(cacheKey);
  if (cached) return cached;

  const url = `${TMDB}/movie/${id}/watch/providers?api_key=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Record<string, TmdbRegion> };
  const regionData = data.results?.[region];
  const providers: FilmProviders = {
    flatrate: mapOffers(regionData?.flatrate),
    rent: mapOffers(regionData?.rent),
    buy: mapOffers(regionData?.buy),
    link: regionData?.link,
  };
  await setCached(cacheKey, providers, CACHE_DURATION.WATCH_PROVIDERS);
  return providers;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendError(req, res, 405, 'method_not_allowed', 'Use POST.');

  const body = parseJsonBody(req);
  if (!body) return sendError(req, res, 400, 'invalid_json', 'Request body must be JSON.');

  const result = validate(body, {
    tmdbIds: array(number({ integer: true, min: 1 }), { maxLength: MAX_IDS }),
    region: string({ pattern: /^[A-Z]{2}$/ }),
  });
  if (!result.ok) return sendValidationError(req, res, result.issues);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return sendError(req, res, 400, 'tmdb_api_key_required', 'TMDb API key required.');

  const { tmdbIds, region } = result.value;
  // De-dupe ids so repeated films cost one TMDb call.
  const uniqueIds = [...new Set(tmdbIds)];

  try {
    const fetched = await mapPool(uniqueIds, 8, (id) => fetchProviders(id, region, apiKey));
    const providers: Record<number, FilmProviders> = {};
    uniqueIds.forEach((id, i) => {
      const p = fetched[i];
      if (p) providers[id] = p;
    });
    return res.status(200).json({ region, providers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch watch providers.';
    return sendError(req, res, 500, 'watch_providers_failed', message);
  }
}
