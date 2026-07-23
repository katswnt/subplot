import { describe, expect, it } from 'vitest';

import { optimizeStreaming, type StreamingFilm } from '@subplot/domain/streaming';
import {
  describeRecommended,
  marginalSteps,
  joinNames,
  serviceLabel,
  formatMoney,
  savingsVsAllIn,
  tierTag,
  preferenceBadge,
} from '../../src/lib/explain';

const NETFLIX = 8;
const MAX = 1899;
const film = (key: string, providerIds: number[]): StreamingFilm => ({ key, title: key, providerIds });

describe('explain formatters', () => {
  it('joinNames uses commas then a final +', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A + B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B + C');
  });

  it('serviceLabel resolves canonical slugs to names, falling back to the slug', () => {
    expect(serviceLabel('US', 'netflix')).toBe('Netflix');
    expect(serviceLabel('US', 'nope')).toBe('nope');
  });

  it('formatMoney is two-decimal dollars', () => {
    expect(formatMoney(7.9)).toBe('$7.90');
  });

  it('describeRecommended names services + coverage of the recommended combo', () => {
    const result = optimizeStreaming([film('a', [NETFLIX]), film('b', [NETFLIX])], { region: 'US' });
    expect(describeRecommended(result)).toMatch(/Netflix cover 2 of 2 films for \$7\.99\/mo\./);
  });

  it('describeRecommended handles the owned-only / nothing-to-add case', () => {
    const result = optimizeStreaming([film('a', [NETFLIX])], {
      region: 'US',
      ownedServices: ['netflix'],
    });
    expect(describeRecommended(result)).toMatch(/already have/i);
  });

  it('savingsVsAllIn = all-in minus recommended, floored at 0', () => {
    // Netflix + Max both cover disjoint films; recommended likely takes both,
    // so all-in == recommended → savings 0 (never negative).
    const films = [film('a', [NETFLIX]), film('b', [MAX])];
    const r = optimizeStreaming(films, { region: 'US', dollarsPerFilm: 100 });
    expect(savingsVsAllIn(r)).toBe(Math.max(0, r.allInCost - r.recommended.monthlyCost));
    expect(savingsVsAllIn(r)).toBeGreaterThanOrEqual(0);
  });

  it('tierTag + preferenceBadge reflect the ad policy', () => {
    expect(tierTag('US', 'netflix', 'cheapest')).toMatch(/ads/i);
    expect(tierTag('US', 'netflix', 'adfree')).not.toMatch(/ads/i);
    expect(preferenceBadge('noads')).toMatch(/no ads/i);
    expect(preferenceBadge('cheapest')).toBe('Cheapest');
  });

  it('marginalSteps yields one incremental step per added service', () => {
    const films = [film('n1', [NETFLIX]), film('n2', [NETFLIX]), film('m1', [MAX])];
    const steps = marginalSteps(optimizeStreaming(films, { region: 'US', dollarsPerFilm: 10 }));
    expect(steps.length).toBe(2);
    // Steps are cost-ascending; each reports the films it unlocks.
    expect(steps[0].monthlyCost).toBeLessThanOrEqual(steps[1].monthlyCost);
    expect(steps.every((s) => s.addFilms > 0)).toBe(true);
  });
});
