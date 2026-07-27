import test from 'node:test';
import assert from 'node:assert/strict';
import {
  titleTokens,
  titleMatchScore,
  scoreMatch,
  buildReviewSummary,
  REVIEW_THRESHOLD,
  type ReviewInput,
} from '../../src/domain/review/index.js';

test('titleTokens: lowercases, drops articles/connectives, punctuation, apostrophes', () => {
  assert.deepEqual(titleTokens('The Imitation Game'), ['imitation', 'game']);
  assert.deepEqual(titleTokens('Spider-Man: No Way Home'), ['spider', 'man', 'no', 'way', 'home']);
  assert.deepEqual(titleTokens("Tiffany Haddish's Special"), ['tiffany', 'haddishs', 'special']);
  assert.deepEqual(titleTokens('Ford v Ferrari'), ['ford', 'ferrari']);
});

test('titleMatchScore: exact and subset score 1, partial in between, none is 0', () => {
  assert.equal(titleMatchScore('Losers', 'Losers'), 1);
  assert.equal(titleMatchScore('Imitation game', 'The Imitation Game'), 1); // input ⊆ matched
  assert.equal(titleMatchScore('Ferrari v Ford', 'Ford v Ferrari'), 1); // same words, reordered
  assert.ok(Math.abs(titleMatchScore('New Spider-Man', 'Spider-Man: No Way Home') - 2 / 3) < 1e-9);
  assert.equal(titleMatchScore('Griffin recommended retirement home', 'The Good Place'), 0);
});

const item = (over: Partial<ReviewInput>): ReviewInput => ({
  key: 'k',
  importedTitle: 'Losers',
  hadId: false,
  match: { title: 'Losers', year: '2019' },
  ...over,
});

test('scoreMatch: unmatched titles are always flagged', () => {
  const v = scoreMatch(item({ match: null }));
  assert.equal(v.needsReview, true);
  assert.equal(v.reason, 'unmatched');
  assert.equal(v.score, 0);
});

test('scoreMatch: an exact-id resolution is trusted regardless of title wording', () => {
  const v = scoreMatch(item({ hadId: true, importedTitle: 'BB', match: { title: 'Breaking Bad', year: '2008' } }));
  assert.equal(v.needsReview, false);
  assert.equal(v.score, 1);
});

test('scoreMatch: a colloquial title with an extra word is flagged', () => {
  const v = scoreMatch(item({ importedTitle: 'New Spider-Man', match: { title: 'Spider-Man: No Way Home', year: '2021' } }));
  assert.equal(v.needsReview, true);
  assert.equal(v.reason, 'low-title-match');
  assert.ok(v.score < REVIEW_THRESHOLD);
});

test('scoreMatch: clean/subset/reordered titles are confident', () => {
  assert.equal(scoreMatch(item({ importedTitle: 'Imitation game', match: { title: 'The Imitation Game', year: '2014' } })).needsReview, false);
  assert.equal(scoreMatch(item({ importedTitle: 'Ferrari v Ford', match: { title: 'Ford v Ferrari', year: '2019' } })).needsReview, false);
  assert.equal(scoreMatch(item({ importedTitle: 'Losers', match: { title: 'Losers', year: '2019' } })).needsReview, false);
});

test('scoreMatch: a supplied year that disagrees with the match is flagged', () => {
  const v = scoreMatch(item({ importedTitle: 'Dune', importedYear: '2021', match: { title: 'Dune', year: '1984' } }));
  assert.equal(v.needsReview, true);
  assert.equal(v.reason, 'year-mismatch');
});

test('buildReviewSummary: partitions, sorts the queue worst-first, counts', () => {
  const summary = buildReviewSummary([
    item({ key: 'a', importedTitle: 'Losers', match: { title: 'Losers', year: '2019' } }), // confident
    item({ key: 'b', importedTitle: 'New Spider-Man', match: { title: 'Spider-Man: No Way Home', year: '2021' } }), // 0.667
    item({ key: 'c', importedTitle: 'Griffin recommended', match: null }), // unmatched, score 0
  ]);
  assert.equal(summary.confidentCount, 1);
  assert.equal(summary.unmatchedCount, 1);
  assert.deepEqual(summary.flagged.map((v) => v.key), ['c', 'b']); // worst (0) first
});
