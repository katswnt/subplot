import { apiRequest } from './request.js';
import type { ApiClientConfig, ApiResult } from './types.js';
import type { TmdbRef } from '../domain/media.js';

/**
 * Subplot — fetch per-title streaming availability from TMDb watch/providers.
 *
 * Takes media-typed refs (movie/tv) so each hits the right TMDb endpoint.
 * Provider data is universal (not per-user) → aggressively Redis-cached server
 * side. MVP consumes `flatrate` (subscription) for the combo optimizer; `rent`
 * and `buy` are carried through for V2 (rent/buy pricing).
 *
 * Data by JustWatch, surfaced via TMDb — attribute JustWatch in the UI.
 */
export type WatchProvider = {
  /** TMDb provider_id — the optimizer's price-table key. */
  providerId: number;
  name: string;
  logoPath?: string;
};

export type FilmProviders = {
  /** Subscription (flatrate) services. */
  flatrate: WatchProvider[];
  /** Free, no-ads services (e.g. Kanopy, Hoopla — usually library-backed). */
  free: WatchProvider[];
  /** Free, ad-supported services (e.g. Tubi, Pluto, Freevee). */
  ads: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  /** JustWatch deep link for the region, when TMDb provides one. */
  link?: string;
};

export type WatchProvidersResponse = {
  region: string;
  /** tmdbRefKey (`movie:1399`) → its providers in the region (omitted when TMDb
   *  has none). Keyed by ref, not bare id, so movie 1399 and TV 1399 never
   *  collide. */
  providers: Record<string, FilmProviders>;
};

export const getWatchProviders = async (
  config: ApiClientConfig,
  refs: TmdbRef[],
  region: string,
): Promise<ApiResult<WatchProvidersResponse>> =>
  apiRequest<WatchProvidersResponse>(config, '/api/watch-providers', {
    method: 'POST',
    body: { refs, region },
  });
