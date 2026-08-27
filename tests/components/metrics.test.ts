import { describe, expect, it } from 'vitest';

import { resolveMetric, watchProvidersMetric } from '../../api/_lib/metrics';

/**
 * The privacy invariant, enforced structurally: an emitted metric may only carry
 * numbers, plus the two fixed string labels (`ns`, `event`). If a future edit
 * ever tucks a title, key, or id into a payload, this fails.
 */
const LABEL_KEYS = new Set(['ns', 'event']);

function assertAggregateOnly(metric: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(metric)) {
    if (LABEL_KEYS.has(key)) {
      expect(typeof value, `label ${key}`).toBe('string');
      continue;
    }
    expect(typeof value, `field ${key} must be a number`).toBe('number');
    expect(Number.isFinite(value as number), `field ${key} must be finite`).toBe(true);
  }
}

describe('metrics — privacy invariant', () => {
  it('resolve metric is counts + latency only, with derived resolved = movie + tv', () => {
    const m = resolveMetric({ imported: 400, movie: 300, tv: 80, unresolved: 20, ms: 1234.5 });
    assertAggregateOnly(m as unknown as Record<string, unknown>);
    expect(m.ns).toBe('subplot.metric');
    expect(m.event).toBe('resolve');
    expect(m.resolved).toBe(380);
    expect(m.ms).toBe(1234.5);
  });

  it('watch-providers metric is counts + latency only, latency rounded', () => {
    const m = watchProvidersMetric({ requested: 380, cacheHits: 350, fetched: 28, failed: 2, ms: 88.256 });
    assertAggregateOnly(m as unknown as Record<string, unknown>);
    expect(m.event).toBe('watch_providers');
    expect(m.ms).toBe(88.26);
  });

  it('serialized payloads contain no obvious identifier keys', () => {
    const json =
      JSON.stringify(resolveMetric({ imported: 1, movie: 1, tv: 0, unresolved: 0, ms: 1 })) +
      JSON.stringify(watchProvidersMetric({ requested: 1, cacheHits: 1, fetched: 0, failed: 0, ms: 1 }));
    for (const banned of ['title', 'key', 'imdb', 'tmdb', 'uri', 'id"', 'slug']) {
      expect(json.toLowerCase()).not.toContain(banned);
    }
  });
});
