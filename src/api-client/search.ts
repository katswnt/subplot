import { apiRequest } from './request.js';
import type { ApiClientConfig, ApiResult } from './types.js';
import type { TmdbRef } from '../domain/media.js';

/**
 * Subplot — free-text TMDb search for the review step's "find the right one"
 * picker. Returns candidate movie/TV matches (a media-typed ref + display
 * fields) so the user can correct a wrong or missing match.
 */
export type SearchCandidate = TmdbRef & {
  title: string;
  year: string;
  posterPath: string | null;
};

export type SearchResponse = { candidates: SearchCandidate[] };

export const searchTitles = async (
  config: ApiClientConfig,
  query: string,
): Promise<ApiResult<SearchResponse>> =>
  apiRequest<SearchResponse>(config, '/api/search', {
    method: 'POST',
    body: { query },
  });
