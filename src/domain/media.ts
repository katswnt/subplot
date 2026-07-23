/**
 * A media-typed reference to a title in TMDb.
 *
 * TMDb numbers movies and TV independently — movie 1399 and TV 1399 are
 * different titles — so a bare id is ambiguous. Every reference the pipeline
 * carries pairs the id with its media type, which is the single fact that lets
 * Subplot stream both films and shows without ever confusing one for the other
 * (in a Map key, a Redis key, or a `/movie/` vs `/tv/` endpoint).
 */
export type MediaType = "movie" | "tv";

export type TmdbRef = { mediaType: MediaType; id: number };

/** Stable string form of a ref — safe as a Map or cache key (`movie:1399`). */
export const tmdbRefKey = (ref: TmdbRef): string => `${ref.mediaType}:${ref.id}`;
