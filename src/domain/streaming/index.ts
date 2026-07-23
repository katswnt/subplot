/**
 * Subplot — the streaming-combo optimizer (pure, framework-free).
 *
 * Given a watchlist where each film carries the raw TMDb provider_ids that
 * stream it (across flatrate/free/ads buckets), find the lowest-cost COMBINATION
 * of PAID subscriptions that covers the most of the list — on top of a free
 * baseline (services the user already owns + free services available to them).
 *
 * Provider ids are canonicalized through the catalog (see catalog.ts) so a film
 * on any variant of a service (pricing tier or resold channel) counts once. The
 * instance is tiny (~20 priced services) so the frontier is enumerated exactly;
 * the recommended combo comes from a greedy marginal path (each service unlocks
 * the most NEW films). Prices come from the catalog; TMDb has no price data.
 */

export * from './catalog.js';

import {
  SERVICES,
  serviceBySlug,
  providerIdToSlug,
  serviceMonthly,
  type Region,
  type ServiceKind,
  type TierPolicy,
} from './catalog.js';

/** A watchlist film + the raw TMDb provider_ids that stream it (any bucket). */
export type StreamingFilm = {
  /** Stable identity (the shared filmKey). */
  key: string;
  title: string;
  /** Raw TMDb provider_ids (flatrate ∪ free ∪ ads), canonicalized internally. */
  providerIds: number[];
};

export type OptimizeOptions = {
  region: Region;
  /** Canonical slugs the user already pays for (cost 0 → results show additions). */
  ownedServices?: string[];
  /** Cap on how many NEW paid services to add. Default 6. */
  maxServices?: number;
  /**
   * What the recommendation optimizes for (the "WHAT TO ADD" cutoff):
   * - 'value'    → best $/film; recommend services under a strict $/film bar (default $2).
   * - 'coverage' → cover the most; a looser $/film bar (default $4).
   * - 'fewest'   → only the heaviest-hitting services (cap 3).
   * Default 'value'.
   */
  objective?: 'value' | 'coverage' | 'fewest';
  /** Override the marginal $/film bar for value/coverage objectives. */
  dollarsPerFilm?: number;
  /** Count Kanopy/Hoopla (library-card) as available free. Default true. */
  includeLibraryFree?: boolean;
  /** Which pricing tier to charge per PAID service. Default 'cheapest'. */
  tierPolicy?: TierPolicy;
  /** Drop free ad-supported services (Tubi/Pluto/…) — for a "no ads anywhere"
   *  preference. Independent of tierPolicy, which only affects paid pricing.
   *  Default false. */
  excludeAdSupportedFree?: boolean;
  /** When set, the recommended combo maximizes coverage within this monthly budget. */
  maxBudget?: number;
};

export type Combo = {
  /** Every service in the combo (owned + added), by slug. */
  serviceIds: string[];
  /** Just the paid services this combo ADDS beyond owned + free. */
  addedServices: string[];
  /** Monthly cost of the ADDED services. */
  monthlyCost: number;
  coveredKeys: string[];
  coveredCount: number;
};

/** One step of the greedy add-one-at-a-time path (each service appears once). */
export type MarginalAddition = {
  serviceId: string;
  /** New films this service unlocks over everything (baseline + earlier steps). */
  addedFilms: number;
  /** Cumulative monthly cost of the added services up to and including this one. */
  monthlyCost: number;
  /** Cumulative films covered (baseline + added so far). */
  coveredCount: number;
};

/** A free service that covers ≥1 of the user's films. */
export type FreeService = {
  slug: string;
  name: string;
  kind: ServiceKind; // 'free-ads' | 'free-library'
  note?: string;
  /** How many of the user's films this service alone streams. */
  coveredCount: number;
};

/** An owned (paid) service the user is credited for. */
export type CreditedService = { slug: string; name: string; coveredCount: number };

export type StreamingResult = {
  region: Region;
  totalFilms: number;
  /** Films watchable on at least one AVAILABLE service (free or paid). */
  coverableCount: number;
  /** Cost-vs-coverage Pareto frontier of paid combos, ascending by cost. */
  frontier: Combo[];
  /** Greedy marginal path of PAID additions (on top of owned + free). */
  marginalPath: MarginalAddition[];
  /** The best-value paid combo (knee, or budget-constrained). */
  recommended: Combo;
  /** Free services that cover ≥1 film, most-coverage first. */
  free: FreeService[];
  /** Union of films watchable free (given the library toggle + tier policy). */
  freeCoveredCount: number;
  /** Films already covered at $0 extra — free ∪ owned (the receipt's "included"). */
  baselineCoveredCount: number;
  /** Owned paid services that cover ≥1 film (the "credited" receipt rows). */
  owned: CreditedService[];
  /** Cost to subscribe to EVERY covering paid service you don't own — the
   *  "vs $X all-in" baseline for the savings figure. */
  allInCost: number;
  /** Films on NO available service → rent/buy (a V3 concern). */
  orphans: StreamingFilm[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** All subsets of `items` with size in [1, maxSize]. */
function subsetsUpTo<T>(items: readonly T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  const rec = (start: number, acc: T[]) => {
    if (acc.length > 0) out.push(acc.slice());
    if (acc.length === maxSize) return;
    for (let i = start; i < n; i++) {
      acc.push(items[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function optimizeStreaming(
  films: readonly StreamingFilm[],
  opts: OptimizeOptions,
): StreamingResult {
  const region = opts.region;
  const catalog = SERVICES[region] ?? [];
  const bySlug = serviceBySlug[region] ?? {};
  const idToSlug = providerIdToSlug[region] ?? new Map<number, string>();
  const owned = new Set(opts.ownedServices ?? []);
  const maxServices = Math.max(1, opts.maxServices ?? 6);
  const includeLibraryFree = opts.includeLibraryFree ?? true;
  const policy: TierPolicy = opts.tierPolicy ?? 'cheapest';
  const excludeAdSupportedFree = opts.excludeAdSupportedFree ?? false;
  const budget = opts.maxBudget;

  // Coverage: canonical slug → set of film keys it streams.
  const coverage = new Map<string, Set<string>>();
  for (const f of films) {
    const slugs = new Set<string>();
    for (const pid of f.providerIds) {
      const s = idToSlug.get(pid);
      if (s) slugs.add(s);
    }
    for (const slug of slugs) {
      let set = coverage.get(slug);
      if (!set) coverage.set(slug, (set = new Set()));
      set.add(f.key);
    }
  }

  // Paid price for a slug under the tier policy (null → not priceable/excluded).
  const priceOf = (slug: string): number | null => {
    const svc = bySlug[slug];
    return svc && svc.kind === 'paid' ? serviceMonthly(svc, policy) : null;
  };

  // Is a slug usable for this user, given ownership / free availability / policy?
  const isAvailableFree = (slug: string): boolean => {
    const svc = bySlug[slug];
    if (!svc) return false;
    if (svc.kind === 'free-ads') return !excludeAdSupportedFree; // "no ads anywhere" drops these
    if (svc.kind === 'free-library') return includeLibraryFree;
    return false;
  };
  const usableSlug = (slug: string): boolean =>
    isAvailableFree(slug) || priceOf(slug) != null; // paid + priceable, or available free

  // Coverable / orphans: a film is coverable if any of its slugs is usable.
  const filmSlugs = (f: StreamingFilm): string[] => {
    const out = new Set<string>();
    for (const pid of f.providerIds) {
      const s = idToSlug.get(pid);
      if (s) out.add(s);
    }
    return [...out];
  };
  const coverableKeys = new Set<string>();
  const orphans: StreamingFilm[] = [];
  for (const f of films) {
    if (filmSlugs(f).some(usableSlug)) coverableKeys.add(f.key);
    else orphans.push(f);
  }

  // Free services covering ≥1 film (available ones only), + the free baseline.
  const free: FreeService[] = [];
  const freeCovered = new Set<string>();
  for (const svc of catalog) {
    if (svc.kind === 'paid') continue;
    const set = coverage.get(svc.slug);
    if (!set || set.size === 0 || !isAvailableFree(svc.slug)) continue;
    free.push({ slug: svc.slug, name: svc.name, kind: svc.kind, note: svc.note, coveredCount: set.size });
    for (const k of set) freeCovered.add(k);
  }
  free.sort((a, b) => b.coveredCount - a.coveredCount || a.slug.localeCompare(b.slug));

  // Films already covered for $0: owned paid services + available free services.
  const baseline = new Set<string>(freeCovered);
  for (const slug of owned) for (const k of coverage.get(slug) ?? []) baseline.add(k);

  // Paid candidates = priceable paid services with coverage, not owned.
  const candidates = [...coverage.keys()].filter(
    (slug) => !owned.has(slug) && priceOf(slug) != null,
  );

  // Credited (owned) services that actually cover something, most-coverage first.
  const ownedList: CreditedService[] = [];
  for (const slug of owned) {
    const svc = bySlug[slug];
    const set = coverage.get(slug);
    if (!svc || !set || set.size === 0) continue;
    ownedList.push({ slug, name: svc.name, coveredCount: set.size });
  }
  ownedList.sort((a, b) => b.coveredCount - a.coveredCount || a.slug.localeCompare(b.slug));

  // "All-in" = subscribing to every covering paid service you don't own.
  const allInCost = round2(candidates.reduce((sum, slug) => sum + (priceOf(slug) ?? 0), 0));

  const makeCombo = (added: string[]): Combo => {
    const covered = new Set(baseline);
    let cost = 0;
    for (const slug of added) {
      cost += priceOf(slug) ?? 0;
      for (const k of coverage.get(slug) ?? []) covered.add(k);
    }
    return {
      serviceIds: [...owned, ...added],
      addedServices: added,
      monthlyCost: round2(cost),
      coveredKeys: [...covered],
      coveredCount: covered.size,
    };
  };

  // Pareto frontier of paid combos (bounded by maxServices) + the baseline combo.
  const combos: Combo[] = [makeCombo([])];
  for (const subset of subsetsUpTo(candidates, Math.min(maxServices, candidates.length))) {
    combos.push(makeCombo(subset));
  }
  const dominated = (a: Combo, b: Combo) =>
    b.coveredCount >= a.coveredCount &&
    b.monthlyCost <= a.monthlyCost &&
    (b.coveredCount > a.coveredCount || b.monthlyCost < a.monthlyCost);
  const frontier = combos
    .filter((c) => !combos.some((o) => o !== c && dominated(c, o)))
    .sort((a, b) => a.monthlyCost - b.monthlyCost || b.coveredCount - a.coveredCount)
    .filter((c, i, arr) => i === 0 || c.coveredCount > arr[i - 1].coveredCount);

  const objective = opts.objective ?? 'value';
  const perFilmBar = opts.dollarsPerFilm ?? (objective === 'value' ? 2 : 4);
  const recCap = objective === 'fewest' ? Math.min(3, maxServices) : maxServices;

  // Append services to `out` greedily by marginal films (ties → cheaper, then
  // slug), mutating covered/used. A film on several services is counted once.
  const appendGreedyByFilms = (
    covered: Set<string>,
    used: Set<string>,
    startCost: number,
    out: MarginalAddition[],
  ) => {
    let runningCost = startCost;
    while (used.size < candidates.length) {
      let best: string | null = null;
      let bestNew = -1;
      let bestCost = Infinity;
      for (const slug of candidates) {
        if (used.has(slug)) continue;
        let n = 0;
        for (const k of coverage.get(slug) ?? []) if (!covered.has(k)) n++;
        if (n <= 0) continue;
        const c = priceOf(slug) ?? 0;
        if (n > bestNew || (n === bestNew && (c < bestCost || (c === bestCost && best != null && slug < best)))) {
          best = slug;
          bestNew = n;
          bestCost = c;
        }
      }
      if (best == null) break;
      used.add(best);
      runningCost += priceOf(best) ?? 0;
      for (const k of coverage.get(best) ?? []) covered.add(k);
      out.push({ serviceId: best, addedFilms: bestNew, monthlyCost: round2(runningCost), coveredCount: covered.size });
    }
  };

  let marginalPath: MarginalAddition[];
  let recommended: Combo;

  if (budget != null) {
    // Budget: recommend the richest AFFORDABLE combo from the exact Pareto
    // frontier (max coverage within the cap). marginalPath is a plain greedy chain.
    marginalPath = [];
    appendGreedyByFilms(new Set(baseline), new Set(), 0, marginalPath);
    recommended = frontier[0]; // cheapest = baseline (cost 0)
    for (const c of frontier) {
      if (c.monthlyCost <= budget) recommended = c; // frontier is cost-ascending
      else break;
    }
  } else {
    // No budget → value-aware greedy. Phase 1 builds the recommended set by
    // picking, at each step, the service unlocking the most new films AMONG those
    // that still clear the value bar — so a poor-value giant no longer blocks a
    // smaller good-value service behind it. The single best add is always kept.
    // Phase 2 appends the rest by coverage for "if you want more".
    const covered = new Set(baseline);
    const used = new Set<string>();
    const recEntries: MarginalAddition[] = [];
    let runningCost = 0;
    let topFilms = 0;
    while (recEntries.length < recCap) {
      let best: string | null = null;
      let bestNew = -1;
      let bestCost = Infinity;
      for (const slug of candidates) {
        if (used.has(slug)) continue;
        let n = 0;
        for (const k of coverage.get(slug) ?? []) if (!covered.has(k)) n++;
        if (n <= 0) continue;
        const c = priceOf(slug) ?? 0;
        const passes =
          recEntries.length === 0
            ? true // the single best add is always eligible
            : objective === 'fewest'
              ? n >= 0.25 * topFilms // heavy hitters only
              : c / n <= perFilmBar; // value / coverage: by $/film
        if (!passes) continue;
        if (n > bestNew || (n === bestNew && (c < bestCost || (c === bestCost && best != null && slug < best)))) {
          best = slug;
          bestNew = n;
          bestCost = c;
        }
      }
      if (best == null) break;
      if (recEntries.length === 0) topFilms = bestNew;
      used.add(best);
      runningCost += priceOf(best) ?? 0;
      for (const k of coverage.get(best) ?? []) covered.add(k);
      recEntries.push({ serviceId: best, addedFilms: bestNew, monthlyCost: round2(runningCost), coveredCount: covered.size });
    }
    recommended = makeCombo(recEntries.map((e) => e.serviceId));
    const moreEntries: MarginalAddition[] = [];
    appendGreedyByFilms(covered, used, runningCost, moreEntries);
    marginalPath = [...recEntries, ...moreEntries];
  }

  return {
    region,
    totalFilms: films.length,
    coverableCount: coverableKeys.size,
    frontier,
    marginalPath,
    recommended,
    free,
    freeCoveredCount: freeCovered.size,
    baselineCoveredCount: baseline.size,
    owned: ownedList,
    allInCost,
    orphans,
  };
}
