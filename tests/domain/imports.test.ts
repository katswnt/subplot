import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWatchlist,
  parseCsv,
  parseList,
  parseImport,
  detectSource,
  type ImportedFilm,
} from "../../src/domain/imports/index.js";

// Real Letterboxd watchlist export header + rows.
const LETTERBOXD_CSV = `Date,Name,Year,Letterboxd URI
2024-01-05,Parasite,2019,https://boxd.it/hTha
2024-02-10,"Everything Everywhere All at Once",2022,https://boxd.it/oFsw
2024-03-01,Portrait of a Lady on Fire,2019,https://boxd.it/qJ0S
`;

// Real IMDb watchlist export header + rows (Const = tconst).
const IMDB_CSV = `Const,Created,Modified,Description,Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt6751668,2024-01-05,2024-01-05,,Parasite,https://www.imdb.com/title/tt6751668/,movie,8.5,132,2019,"Drama, Thriller",900000,2019-05-30,Bong Joon Ho
tt3783958,2024-02-10,2024-02-10,,La La Land,https://www.imdb.com/title/tt3783958/,movie,8.0,128,2016,"Comedy, Drama, Music",600000,2016-12-09,Damien Chazelle
tt0903747,2024-03-01,2024-03-01,,Breaking Bad,https://www.imdb.com/title/tt0903747/,tvSeries,9.5,49,2008,"Crime, Drama, Thriller",2000000,2008-01-20,
`;

// IMDb export exercising every Title Type we classify or drop.
const IMDB_TYPES_CSV = `Const,Title,Title Type,Year
tt0000001,A Movie,movie,2020
tt0000002,A Mini,tvMiniSeries,2019
tt0000003,A Series,tvSeries,2015
tt0000004,A TV Movie,tvMovie,2011
tt0000005,An Episode,tvEpisode,2015
tt0000006,A Podcast,podcastSeries,2022
`;

test("parseCsv handles quoted fields with embedded commas", () => {
  const rows = parseCsv(`a,b,c
1,"hello, world",3
`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["b"], "hello, world");
});

test("parseCsv handles escaped double-quotes", () => {
  const rows = parseCsv(`title
"She said ""hi"""
`);
  assert.equal(rows[0]["title"], 'She said "hi"');
});

test("detectSource distinguishes Letterboxd from IMDb", () => {
  assert.equal(detectSource(["Date", "Name", "Year", "Letterboxd URI"]), "letterboxd");
  assert.equal(detectSource(["Const", "Title", "Year", "Title Type"]), "imdb");
  assert.equal(detectSource(["foo", "bar"]), "unknown");
});

test("parses a Letterboxd watchlist into normalized films", () => {
  const { source, films, skipped } = parseWatchlist(LETTERBOXD_CSV);
  assert.equal(source, "letterboxd");
  assert.equal(films.length, 3);
  assert.equal(skipped, 0);
  const eeaao = films.find((f) => f.title.startsWith("Everything")) as ImportedFilm;
  assert.equal(eeaao.year, "2022");
  assert.equal(eeaao.letterboxdUri, "https://boxd.it/oFsw");
  assert.equal(eeaao.imdbId, undefined);
  assert.ok(eeaao.key, "every film has a dedup key");
});

test("parses an IMDb watchlist, keeping TV series with a media type", () => {
  const { source, films, skipped } = parseWatchlist(IMDB_CSV);
  assert.equal(source, "imdb");
  // Breaking Bad (tvSeries) is now kept → 3 titles, 0 skipped.
  assert.equal(films.length, 3);
  assert.equal(skipped, 0);
  const parasite = films.find((f) => f.title === "Parasite") as ImportedFilm;
  assert.equal(parasite.imdbId, "tt6751668");
  assert.equal(parasite.year, "2019");
  assert.equal(parasite.mediaType, "movie");
  assert.equal(parasite.letterboxdUri, undefined);
  const bb = films.find((f) => f.title === "Breaking Bad") as ImportedFilm;
  assert.equal(bb.mediaType, "tv");
});

test("classifies IMDb Title Types into movie/tv and drops episodes/podcasts", () => {
  const { films, skipped } = parseWatchlist(IMDB_TYPES_CSV);
  const byTitle = Object.fromEntries(films.map((f) => [f.title, f.mediaType]));
  // Series types → tv.
  assert.equal(byTitle["A Mini"], "tv");
  assert.equal(byTitle["A Series"], "tv");
  // movie + tvMovie → movie (tvMovies live on TMDb's /movie endpoint).
  assert.equal(byTitle["A Movie"], "movie");
  assert.equal(byTitle["A TV Movie"], "movie");
  // Single episodes and podcasts are dropped, not emitted.
  assert.equal(byTitle["An Episode"], undefined);
  assert.equal(byTitle["A Podcast"], undefined);
  assert.equal(films.length, 4);
  assert.equal(skipped, 2);
});

test("a same-name, same-year movie and show get distinct keys", () => {
  // Two rows that would collide on ty:name|year without a media-type namespace.
  const csv = `Const,Title,Title Type,Year
tt1000001,Fargo,movie,2014
tt1000002,Fargo,tvSeries,2014
`;
  const { films, skipped } = parseWatchlist(csv);
  assert.equal(films.length, 2, "movie and show must not dedupe together");
  assert.equal(skipped, 0);
  assert.notEqual(films[0].key, films[1].key);
});

test("dedupes repeated films within one import", () => {
  const csv = `Date,Name,Year,Letterboxd URI
2024-01-01,Parasite,2019,https://boxd.it/hTha
2024-05-01,Parasite,2019,https://boxd.it/hTha
`;
  const { films, skipped } = parseWatchlist(csv);
  assert.equal(films.length, 1);
  assert.equal(skipped, 1);
});

test("empty / unknown CSV → empty result", () => {
  assert.deepEqual(parseWatchlist(""), { source: "unknown", films: [], skipped: 0 });
  const weird = parseWatchlist(`foo,bar\n1,2\n`);
  assert.equal(weird.source, "unknown");
  assert.equal(weird.films.length, 0);
});

test("rows missing a title are skipped, not emitted", () => {
  const csv = `Date,Name,Year,Letterboxd URI
2024-01-01,,2019,https://boxd.it/xxxx
2024-01-02,Parasite,2019,https://boxd.it/hTha
`;
  const { films, skipped } = parseWatchlist(csv);
  assert.equal(films.length, 1);
  assert.equal(skipped, 1);
});

test("deterministic: same CSV → identical films", () => {
  const a = parseWatchlist(IMDB_CSV);
  const b = parseWatchlist(IMDB_CSV);
  assert.deepEqual(a, b);
});

// --- Plain-text lists (Notes / Reminders / pasted text) ----------------------

test("parseList: one title per line, source is plaintext", () => {
  const r = parseList("Parasite\nThe Bear\nThe Zone of Interest");
  assert.equal(r.source, "plaintext");
  assert.deepEqual(
    r.films.map((f) => f.title),
    ["Parasite", "The Bear", "The Zone of Interest"],
  );
});

test("parseList: strips bullets, numbers, and parenthesized-number markers", () => {
  const r = parseList("- Parasite\n* Aftersun\n• Dune\n1. Heat\n2) Sicario\n(3) Arrival");
  assert.deepEqual(
    r.films.map((f) => f.title),
    ["Parasite", "Aftersun", "Dune", "Heat", "Sicario", "Arrival"],
  );
});

test("parseList: unwraps checkboxes and markdown tasks", () => {
  const r = parseList("[ ] Parasite\n[x] Aftersun\n☐ Dune\n- [ ] Heat");
  assert.deepEqual(
    r.films.map((f) => f.title),
    ["Parasite", "Aftersun", "Dune", "Heat"],
  );
});

test("parseList: extracts a parenthesized year but leaves a bare year title intact", () => {
  const r = parseList("Dune (2021)\n1917\n2001: A Space Odyssey");
  assert.equal(r.films[0].title, "Dune");
  assert.equal(r.films[0].year, "2021");
  assert.equal(r.films[1].title, "1917");
  assert.equal(r.films[1].year, "");
  assert.equal(r.films[2].title, "2001: A Space Odyssey");
});

test("parseList: leaves mediaType unset (TMDb /search/multi discovers it)", () => {
  const r = parseList("The Bear");
  assert.equal(r.films[0].mediaType, undefined);
});

test("parseList: does NOT split on commas (comma-bearing titles stay whole)", () => {
  const r = parseList("Crouching Tiger, Hidden Dragon\nGoodbye, Dragon Inn");
  assert.equal(r.films.length, 2);
  assert.equal(r.films[0].title, "Crouching Tiger, Hidden Dragon");
});

test("parseList: skips blank lines and section headers, counts them", () => {
  const r = parseList("To watch:\n\nParasite\n  \nHorror:\nHereditary");
  assert.deepEqual(
    r.films.map((f) => f.title),
    ["Parasite", "Hereditary"],
  );
  assert.equal(r.skipped, 4);
});

test("parseList: dedupes case/space-insensitively via filmKey", () => {
  const r = parseList("Parasite\nparasite\n  Parasite  ");
  assert.equal(r.films.length, 1);
  assert.equal(r.skipped, 2);
});

test("parseList: strips wrapping quotes but keeps trailing notes", () => {
  const r = parseList('"Parasite"\nThe Two Towers - extended');
  assert.equal(r.films[0].title, "Parasite");
  assert.equal(r.films[1].title, "The Two Towers - extended");
});

test("parseImport: dispatches CSV exports to parseWatchlist, free text to parseList", () => {
  assert.equal(parseImport(LETTERBOXD_CSV).source, "letterboxd");
  assert.equal(parseImport(IMDB_CSV).source, "imdb");
  assert.equal(parseImport("Parasite\nThe Bear").source, "plaintext");
});

test("parseList: strips a trailing streaming-service parenthetical", () => {
  const r = parseList("Losers (Netflix)\nRun (HBO)");
  assert.deepEqual(r.films.map((f) => f.title), ["Losers", "Run"]);
});

test("parseList: strips a trailing (season N) parenthetical", () => {
  const r = parseList("Marvelous Mrs. Maisel (season 2)");
  assert.equal(r.films[0].title, "Marvelous Mrs. Maisel");
});

test("parseList: strips a trailing 'season N' / 'season finale' qualifier", () => {
  const r = parseList("Big Little Lies season 2\nFleabag season finale");
  assert.deepEqual(r.films.map((f) => f.title), ["Big Little Lies", "Fleabag"]);
});

test("parseList: still captures a parenthesized year (loop keeps year, drops notes)", () => {
  const r = parseList("Dune (2021)\nLosers (Netflix) (2019)");
  assert.equal(r.films[0].title, "Dune");
  assert.equal(r.films[0].year, "2021");
  assert.equal(r.films[1].title, "Losers");
  assert.equal(r.films[1].year, "2019");
});

test("parseList: skips a bare header word line but keeps a short real title", () => {
  const r = parseList("TV\nUp\nMovies\nIt");
  assert.deepEqual(r.films.map((f) => f.title), ["Up", "It"]);
  assert.equal(r.skipped, 2); // "TV", "Movies"
});

test("parseList: only strips a TRAILING season word (leading 'Season' survives)", () => {
  const r = parseList("Season of the Witch");
  assert.equal(r.films[0].title, "Season of the Witch");
});

test("parseList: preserves a long (>20 char) parenthetical title", () => {
  const r = parseList("Birdman or (The Unexpected Virtue of Ignorance)");
  assert.equal(r.films[0].title, "Birdman or (The Unexpected Virtue of Ignorance)");
});
