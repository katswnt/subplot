import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWatchlist,
  parseCsv,
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
