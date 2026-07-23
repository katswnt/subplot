/**
 * One canonical film identity key, shared by every aggregate that needs to
 * count "unique films". The redesign grew three competing keys — canonical
 * URL, `name|year`, and a tmdb-id/slug fingerprint — so sibling numbers that
 * should agree (rated films vs unique films vs crowd-compared films) drifted.
 * This subsumes all three: prefer the stable TMDb id, then the Letterboxd
 * slug, then a normalized title|year. Same film → same key everywhere.
 */
import { canonicalizeLetterboxdUri } from "./canonical-uri.js";
import type { MediaType } from "./media.js";

export type FilmKeyInput = {
  tmdbId?: number | null;
  uri?: string | null;
  name?: string | null;
  year?: string | number | null;
  /** When known, namespaces the title|year fallback so a same-name, same-year
   *  movie and TV show never dedupe into one entry. */
  mediaType?: MediaType | null;
};

/** The Letterboxd film slug from a URI (canonicalized), or "" when absent. */
export function slugOfUri(uri: string | null | undefined, uriMap?: Record<string, string> | null): string {
  const canon = canonicalizeLetterboxdUri(uri || "", uriMap);
  const m = canon.match(/\/film\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/** Canonical identity key: tmdb:<id> → slug:<slug> → ty:<name>|<year>.
 *  Returns "" only when there's no usable identity at all. */
export function filmKey(f: FilmKeyInput, uriMap?: Record<string, string> | null): string {
  if (typeof f.tmdbId === "number" && Number.isFinite(f.tmdbId) && f.tmdbId > 0) {
    return `tmdb:${f.tmdbId}`;
  }
  const slug = slugOfUri(f.uri, uriMap);
  if (slug) return `slug:${slug}`;
  const name = (f.name ?? "").toString().trim().toLowerCase();
  const year = (f.year ?? "").toString().trim();
  if (!name) return "";
  const mt = f.mediaType ? `${f.mediaType}:` : "";
  return `ty:${mt}${name}|${year}`;
}

/** Extract a FilmKeyInput from an enriched-movie-shaped object. */
export function filmKeyInputOfMovie(movie: {
  tmdb_movie_id?: number | null;
  letterboxd_url?: string | null;
  tmdb_data?: { id?: number | null; title?: string | null; release_date?: string | null } | null;
}): FilmKeyInput {
  const year = movie.tmdb_data?.release_date
    ? String(movie.tmdb_data.release_date).slice(0, 4)
    : null;
  return {
    tmdbId: movie.tmdb_movie_id ?? movie.tmdb_data?.id ?? null,
    uri: movie.letterboxd_url ?? null,
    name: movie.tmdb_data?.title ?? null,
    year,
  };
}

/** Extract a FilmKeyInput from a Letterboxd diary/watchlist CSV row. */
export function filmKeyInputOfRow(row: {
  Name?: string;
  Year?: string;
  "Letterboxd URI"?: string;
}): FilmKeyInput {
  return {
    uri: row["Letterboxd URI"] ?? null,
    name: row.Name ?? null,
    year: row.Year ?? null,
  };
}

/** Dedupe a list by film identity, keeping the FIRST item per key. Items whose
 *  key is empty (no usable identity) are kept as-is (never merged together). */
export function dedupeFilms<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
