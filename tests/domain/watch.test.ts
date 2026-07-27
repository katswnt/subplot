import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchNow } from '../../src/domain/watch/index.js';
import type { StreamingFilm } from '../../src/domain/streaming/index.js';

// Real TMDb provider ids from the catalog: Netflix 8 (+1796 ad tier), Max 1899,
// Tubi 73 (free-ads), Kanopy 191 (free-library), Hulu 15.
const film = (key: string, providerIds: number[]): StreamingFilm => ({ key, title: key, providerIds });

test('buildWatchNow: partitions titles by your (owned + free) services', () => {
  const films = [
    film('A', [8, 1899]), // Netflix + Max — Max owned → yours
    film('B', [8]), // Netflix only — not owned, not free
    film('C', [73]), // Tubi — free → yours
    film('D', [191]), // Kanopy — free → yours
    film('E', []), // nowhere
  ];
  const w = buildWatchNow(films, ['max'], 'US');

  assert.equal(w.onYourServicesCount, 3); // A, C, D
  assert.equal(w.notOnYoursCount, 1); // B streams (Netflix) but you don't have it
  assert.equal(w.nowhereCount, 1); // E

  const byKey = Object.fromEntries(w.titles.map((t) => [t.key, t]));
  assert.equal(byKey.A.onYourServices, true);
  assert.equal(byKey.B.onYourServices, false);
  assert.equal(byKey.B.streamingSomewhere, true);
  assert.equal(byKey.E.streamingSomewhere, false);
});

test('buildWatchNow: dedupes provider-id variants into one canonical service', () => {
  const w = buildWatchNow([film('A', [8, 1796])], [], 'US'); // both are Netflix
  assert.equal(w.titles[0].services.length, 1);
  assert.equal(w.titles[0].services[0].slug, 'netflix');
});

test('buildWatchNow: sorts a title’s services with yours/free first', () => {
  const w = buildWatchNow([film('A', [8, 1899])], ['max'], 'US'); // Netflix + Max, Max owned
  assert.equal(w.titles[0].services[0].slug, 'max'); // owned first
  assert.equal(w.titles[0].services[1].slug, 'netflix');
});

test('buildWatchNow: your-service groups list owned first, then free, with their titles', () => {
  const films = [
    film('A', [1899]), // Max
    film('B', [1899]), // Max
    film('C', [73]), // Tubi (free)
  ];
  const w = buildWatchNow(films, ['max'], 'US');
  assert.deepEqual(
    w.yourServiceGroups.map((g) => [g.slug, g.owned, g.titles.length]),
    [
      ['max', true, 2],
      ['tubi', false, 1],
    ],
  );
  // Netflix-only titles never create a group when you don't own Netflix.
  assert.equal(buildWatchNow([film('X', [8])], ['max'], 'US').yourServiceGroups.length, 0);
});

test('buildWatchNow: attaches a provider logo when one is available', () => {
  // Netflix folds ids 8 + 1796; the logo of whichever variant has one is used.
  const w = buildWatchNow([film('A', [1796])], [], 'US', { 8: '/nflx.jpg' });
  assert.equal(w.titles[0].services[0].slug, 'netflix');
  assert.equal(w.titles[0].services[0].logoPath, '/nflx.jpg');
  // No logo data → null, not a broken value.
  assert.equal(buildWatchNow([film('B', [1899])], [], 'US').titles[0].services[0].logoPath, null);
});
