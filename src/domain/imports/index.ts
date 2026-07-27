/**
 * Subplot — source-agnostic watchlist import (pure, dependency-free).
 *
 * Turns a Letterboxd or IMDb watchlist CSV export into a normalized list of
 * films the streaming optimizer can consume. IMDb rows carry a `tconst`
 * (tt…) resolved to a TMDb id downstream via TMDb /find; Letterboxd rows carry
 * a film URI. Everything dedupes via the shared filmKey.
 *
 * Includes a tiny RFC-4180-ish CSV parser so this stays dependency-free (the
 * app uses Papa Parse elsewhere; the domain layer must not depend on it).
 */
import { filmKey } from "../film-key.js";
import type { MediaType } from "../media.js";

export type ImportSource = "letterboxd" | "imdb" | "plaintext" | "unknown";

export type ImportedFilm = {
  title: string;
  year: string;
  /** IMDb tconst (e.g. "tt0458290") when the source carries it. */
  imdbId?: string;
  /** Letterboxd film URI when the source carries it. */
  letterboxdUri?: string;
  /** Resolved later (TMDb /find or /search). */
  tmdbId?: number;
  /** 'movie' | 'tv' when the source tells us (IMDb "Title Type"). Left unset
   *  for Letterboxd rows — Letterboxd carries no type signal, so resolution
   *  discovers it via TMDb /search/multi. */
  mediaType?: MediaType;
  /** Shared film identity key (dedup). */
  key: string;
};

export type ParseResult = {
  source: ImportSource;
  films: ImportedFilm[];
  /** Rows dropped as non-title (episodes/podcasts), unparseable, or duplicate. */
  skipped: number;
};

/** Minimal CSV parser: quoted fields, embedded commas + "" escapes, CR/LF.
 *  Returns an array of row objects keyed by the header row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

/** Detect the export source from the CSV header columns. */
export function detectSource(headers: readonly string[]): ImportSource {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  if (set.has("letterboxd uri")) return "letterboxd";
  if (set.has("const") && set.has("title")) return "imdb"; // IMDb: "Const" = tconst
  return "unknown";
}

/** Map an IMDb "Title Type" to a TMDb media type, or null to drop the row.
 *  IMDb episodic-series types (tvSeries, tvMiniSeries) resolve against TMDb's
 *  /tv endpoints; everything else (movie, tvMovie, tvSpecial, short, video, …)
 *  is a /movie. Single episodes and podcasts aren't watchlist titles worth
 *  optimizing on, so they're the only rows we still drop. */
const imdbMediaType = (titleType: string): MediaType | null => {
  const t = titleType.toLowerCase();
  if (t.includes("episode") || t.includes("podcast")) return null;
  if (t.includes("series")) return "tv"; // tvSeries, tvMiniSeries
  return "movie";
};

/** Parse a raw watchlist CSV (Letterboxd or IMDb) into normalized films. */
export function parseWatchlist(csvText: string): ParseResult {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return { source: "unknown", films: [], skipped: 0 };
  const source = detectSource(Object.keys(rows[0]));

  const seen = new Set<string>();
  const films: ImportedFilm[] = [];
  let skipped = 0;

  for (const row of rows) {
    let imported: ImportedFilm | null = null;

    if (source === "letterboxd") {
      const title = row["Name"] || "";
      const year = row["Year"] || "";
      const uri = row["Letterboxd URI"] || "";
      if (!title) { skipped++; continue; }
      const key = filmKey({ uri, name: title, year });
      imported = { title, year, letterboxdUri: uri || undefined, key };
    } else if (source === "imdb") {
      const title = row["Title"] || row["Original Title"] || "";
      const year = row["Year"] || "";
      const imdbId = (row["Const"] || "").trim();
      const titleType = row["Title Type"] || "";
      const mediaType = imdbMediaType(titleType);
      if (!title || mediaType === null) { skipped++; continue; }
      const key = filmKey({ name: title, year, mediaType });
      imported = { title, year, imdbId: imdbId || undefined, mediaType, key };
    } else {
      skipped++;
      continue;
    }

    if (!imported.key || seen.has(imported.key)) { skipped++; continue; }
    seen.add(imported.key);
    films.push(imported);
  }

  return { source, films, skipped };
}

// --- Plain-text lists (Apple Notes / Reminders / a pasted list) ---------------
//
// People who don't use Letterboxd/IMDb keep watchlists as free text: one title
// per line, often with bullets, numbers, or checkboxes. We resolve titles to
// TMDb downstream via /search/multi (no IDs here, and no type signal — so, like
// Letterboxd rows, mediaType is left unset for TMDb to discover).
//
// Deliberately conservative — over-cleaning corrupts real titles:
//   • Split on NEWLINES only. Commas are NOT delimiters ("Crouching Tiger,
//     Hidden Dragon", "Goodbye, Dragon Inn" are single titles).
//   • Only a PARENTHESIZED "(YYYY)" is treated as a year. A bare trailing year
//     is frequently the title itself ("1917", "2001", "1984").
//   • Trailing free-text notes / subtitles after a dash are LEFT IN — we can't
//     tell "The Two Towers - ..." (subtitle) from "Parasite - loved it" (note),
//     and fuzzy TMDb search tolerates the extra words better than mis-stripping.

/** Strip stacked leading list markers: bullets, "1." / "1)" / "(1)", and
 *  checkboxes ("[ ]", "[x]", ☐/☑/✓). Applied repeatedly so "- [ ] Title"
 *  (a markdown task = two markers) fully unwraps. */
const stripListMarkers = (line: string): string => {
  const marker = /^\s*(?:[-*•·–—]+|\d+[.)]|\(\d+\)|\[[ xX✓]?\]|[☐☑✓✅])\s*/;
  let s = line;
  let prev: string;
  do {
    prev = s;
    s = s.replace(marker, "");
  } while (s !== prev && s.length > 0);
  return s;
};

/** Drop a single pair of matching surrounding quotes (straight or curly). */
const stripWrappingQuotes = (s: string): string => {
  const m = s.match(/^["'“](.+)["'”]$/);
  return m ? m[1].trim() : s;
};

/**
 * Parse a free-text watchlist (Notes / Reminders / pasted text) into titles —
 * one per line. Titles carry no IDs or type; both are resolved later via TMDb
 * /search/multi. Blank lines, section headers ("To watch:"), and duplicates are
 * counted in `skipped`.
 */
export function parseList(text: string): ParseResult {
  const seen = new Set<string>();
  const films: ImportedFilm[] = [];
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = stripListMarkers(rawLine).trim();
    if (!line) {
      skipped++;
      continue;
    }
    // Section header, e.g. "To watch:" or "Horror:". "2001: A Space Odyssey"
    // is safe — it doesn't END with a colon.
    if (line.endsWith(":")) {
      skipped++;
      continue;
    }
    line = stripWrappingQuotes(line).trim();

    let year = "";
    const withYear = line.match(/^(.*\S)\s*\((\d{4})\)\s*$/);
    if (withYear) {
      line = withYear[1].trim();
      year = withYear[2];
    }
    if (!line) {
      skipped++;
      continue;
    }

    const key = filmKey({ name: line, year });
    if (!key || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    films.push({ title: line, year, key });
  }

  return { source: "plaintext", films, skipped };
}

/**
 * One entry point for any pasted/uploaded text: if the first line looks like a
 * Letterboxd/IMDb CSV header, parse it as that export; otherwise treat it as a
 * free-text list. Lets the UI accept a file drop or a paste through one call.
 */
export function parseImport(text: string): ParseResult {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  if (detectSource(headers) !== "unknown") return parseWatchlist(text);
  return parseList(text);
}
