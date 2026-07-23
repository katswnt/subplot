import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { optimizeStreaming, type StreamingFilm } from '@subplot/domain/streaming';
import ResultsStep from '../../src/components/ResultsStep';

// Raw TMDb provider ids: Netflix 8, Max 1899, Tubi 73 (free), Kanopy 191 (free).
const NETFLIX = 8;
const MAX = 1899;
const TUBI = 73;
const UNPRICED = 999999;

const film = (key: string, providerIds: number[]): StreamingFilm => ({ key, title: key, providerIds });

const base = {
  adPolicy: 'cheapest' as const,
  region: 'US',
  ownedTier: {} as Record<string, string>,
  onStartOver: () => {},
};

describe('ResultsStep receipt', () => {
  it('shows the big total and one WHAT-TO-ADD row per recommended service', () => {
    const films = [film('n1', [NETFLIX]), film('n2', [NETFLIX]), film('n3', [NETFLIX]), film('m1', [MAX])];
    const result = optimizeStreaming(films, { region: 'US', dollarsPerFilm: 10 });
    render(<ResultsStep {...base} result={result} />);
    // Big lime total equals the recommended monthly cost.
    expect(screen.getByTestId('receipt-total').textContent).toContain(result.recommended.monthlyCost.toFixed(2));
    // Coverage line + one hero row per added service (Netflix, Max).
    expect(screen.getByTestId('coverage').textContent).toMatch(/4 \/ 4 titles/);
    expect(screen.getAllByTestId('marginal-step').length).toBe(2);
  });

  it('surfaces orphans that no tracked service covers', () => {
    const films = [film('n1', [NETFLIX]), film('rentonly', [UNPRICED])];
    const result = optimizeStreaming(films, { region: 'US' });
    render(<ResultsStep {...base} result={result} />);
    expect(screen.getByTestId('orphans-note').textContent).toMatch(/1 titles rent\/buy only/);
  });

  it('surfaces a FREE section for films watchable at no cost', () => {
    const films = [film('t1', [TUBI]), film('t2', [TUBI]), film('n1', [NETFLIX])];
    const result = optimizeStreaming(films, { region: 'US' });
    render(<ResultsStep {...base} result={result} />);
    expect(screen.getByTestId('free-summary').textContent).toMatch(/2 TITLES FREE/);
    expect(screen.getAllByTestId('free-service').some((c) => /Tubi/.test(c.textContent ?? ''))).toBe(true);
  });

  it('surfaces the movie/show mix when the watchlist includes TV', () => {
    const films: StreamingFilm[] = [
      { key: 'm1', title: 'Dune', providerIds: [MAX], mediaType: 'movie' },
      { key: 't1', title: 'The Bear', providerIds: [NETFLIX], mediaType: 'tv' },
      { key: 't2', title: 'Severance', providerIds: [NETFLIX], mediaType: 'tv' },
    ];
    const result = optimizeStreaming(films, { region: 'US' });
    render(<ResultsStep {...base} result={result} />);
    expect(screen.getByTestId('media-mix').textContent).toMatch(/1 film · 2 TV shows/);
  });

  it('omits the movie/show mix for an all-movie watchlist', () => {
    const result = optimizeStreaming([film('n1', [NETFLIX])], { region: 'US' });
    render(<ResultsStep {...base} result={result} />);
    expect(screen.queryByTestId('media-mix')).toBeNull();
  });

  it('credits owned services and labels the total "YOU ADD"', () => {
    const films = [film('n1', [NETFLIX]), film('m1', [MAX])];
    const result = optimizeStreaming(films, { region: 'US', ownedServices: ['netflix'], dollarsPerFilm: 50 });
    render(<ResultsStep {...base} result={result} />);
    expect(screen.getByText(/YOU ADD/)).toBeTruthy();
    expect(screen.getByText(/INCLUDED · NO EXTRA COST/)).toBeTruthy();
  });

  it('fires onStartOver when the user restarts', () => {
    const onStartOver = vi.fn();
    const result = optimizeStreaming([film('n1', [NETFLIX])], { region: 'US' });
    render(<ResultsStep {...base} result={result} onStartOver={onStartOver} />);
    fireEvent.click(screen.getByText(/Start over/));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
