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

test("parses an IMDb watchlist and carries the tconst, dropping TV series", () => {
  const { source, films, skipped } = parseWatchlist(IMDB_CSV);
  assert.equal(source, "imdb");
  // Breaking Bad (tvSeries) is filtered out → 2 films, 1 skipped.
  assert.equal(films.length, 2);
  assert.equal(skipped, 1);
  const parasite = films.find((f) => f.title === "Parasite") as ImportedFilm;
  assert.equal(parasite.imdbId, "tt6751668");
  assert.equal(parasite.year, "2019");
  assert.equal(parasite.letterboxdUri, undefined);
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
