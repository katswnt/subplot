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
    expect(describeRecommended(result)).toMatch(/Netflix cover 2 of 2 titles for \$7\.99\/mo\./);
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

describe('receipt consistency — budget mode', () => {
  // Provider ids: Netflix 8 ($7.99), Shudder 99 ($6.99), MGM+ 34 ($6.99).
  // Netflix alone covers the most films, so a greedy-by-films chain leads with it.
  // But within a $14 cap the best-coverage affordable plan is Shudder+MGM+ (6
  // films, $13.98) — a different service set. The receipt must show that plan,
  // not the greedy leader. This reproduces F-03 (explanation vs algorithm drift).
  const NETFLIX = 8, SHUDDER = 99, MGM = 34;
  const budgetFilms = [
    ...Array.from({ length: 5 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 3 }, (_, i) => film(`s${i}`, [SHUDDER])),
    ...Array.from({ length: 3 }, (_, i) => film(`m${i}`, [MGM])),
  ];

  it('recommends the affordable frontier combo, not the greedy leader', () => {
    const r = optimizeStreaming(budgetFilms, { region: 'US', maxBudget: 14 });
    expect([...r.recommended.addedServices].sort()).toEqual(['mgm-plus', 'shudder']);
    expect(r.recommended.monthlyCost).toBeCloseTo(13.98, 2);
  });

  it('WHAT TO ADD rows are exactly the recommended plan and sum to the headline', () => {
    const r = optimizeStreaming(budgetFilms, { region: 'US', maxBudget: 14 });
    const recSteps = marginalSteps(r).filter((s) => s.recommended);
    // Rows == recommended plan (not the greedy leader, which would be netflix).
    expect(recSteps.map((s) => s.slug).sort()).toEqual(['mgm-plus', 'shudder']);
    // Rows reconcile with the headline total — the core "explainable" guarantee.
    const rowsCost = Math.round(recSteps.reduce((a, s) => a + s.addCost, 0) * 100) / 100;
    expect(rowsCost).toBeCloseTo(r.recommended.monthlyCost, 2);
    // And with the headline coverage.
    expect(recSteps[recSteps.length - 1].coveredCount).toBe(r.recommended.coveredCount);
  });
});
