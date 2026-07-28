/**
 * One canonical film identity key, shared by every place that needs to dedupe
 * or match "the same film." Prefer the stable TMDb id; then the Letterboxd film
 * slug (for a full letterboxd.com/film/… URL); then a normalized title|year.
 * Same film → same key everywhere in the pipeline.
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
export function slugOfUri(uri: string | null | undefined): string {
  const canon = canonicalizeLetterboxdUri(uri || "");
  const m = canon.match(/\/film\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/** Canonical identity key: tmdb:<id> → slug:<slug> → ty:<name>|<year>.
 *  Returns "" only when there's no usable identity at all. */
export function filmKey(f: FilmKeyInput): string {
  if (typeof f.tmdbId === "number" && Number.isFinite(f.tmdbId) && f.tmdbId > 0) {
    return `tmdb:${f.tmdbId}`;
  }
  const slug = slugOfUri(f.uri);
  if (slug) return `slug:${slug}`;
  const name = (f.name ?? "").toString().trim().toLowerCase();
  const year = (f.year ?? "").toString().trim();
  if (!name) return "";
  const mt = f.mediaType ? `${f.mediaType}:` : "";
  return `ty:${mt}${name}|${year}`;
}
