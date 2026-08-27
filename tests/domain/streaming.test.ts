import test from "node:test";
import assert from "node:assert/strict";
import {
  optimizeStreaming,
  serviceBySlug,
  serviceMonthly,
  PRICES_AS_OF,
  type StreamingFilm,
} from "../../src/domain/streaming/index.js";

// Raw TMDb provider ids (canonicalized internally). Netflix 8, HBO Max 1899,
// Criterion 258, MUBI 11, Paramount+ Premium variant 2303, Tubi 73, Kanopy 191.
const NETFLIX = 8;
const MAX = 1899;
const AMAZON = 9;
const CRITERION = 258;
const MUBI = 11;
const PARAMOUNT_PREMIUM = 2303; // a variant id that must fold to 'paramount-plus'
const TUBI = 73; // free-ads
const KANOPY = 191; // free-library
const UNPRICED = 999999; // not in the catalog → orphan-maker

const price = (slug: string) => serviceMonthly(serviceBySlug.US[slug], "cheapest") ?? 0;
const film = (key: string, providerIds: number[]): StreamingFilm => ({ key, title: key, providerIds });

test("empty watchlist → empty result, owned-only recommendation", () => {
  const r = optimizeStreaming([], { region: "US" });
  assert.equal(r.totalFilms, 0);
  assert.equal(r.coverableCount, 0);
  assert.equal(r.recommended.monthlyCost, 0);
  assert.deepEqual(r.orphans, []);
  assert.deepEqual(r.free, []);
  assert.equal(r.freeCoveredCount, 0);
});

test("recommends the cheapest single service when it covers everything", () => {
  const films = [film("a", [NETFLIX]), film("b", [NETFLIX]), film("c", [NETFLIX])];
  const r = optimizeStreaming(films, { region: "US" });
  assert.deepEqual(r.recommended.addedServices, ["netflix"]);
  assert.equal(r.recommended.coveredCount, 3);
  assert.equal(r.recommended.monthlyCost, price("netflix"));
});

test("two services cover a split library; frontier is cost-ascending + Pareto", () => {
  const films = [film("n1", [NETFLIX]), film("n2", [NETFLIX]), film("m1", [MAX]), film("m2", [MAX])];
  const r = optimizeStreaming(films, { region: "US", dollarsPerFilm: 10 });
  for (let i = 1; i < r.frontier.length; i++) {
    assert.ok(r.frontier[i].monthlyCost > r.frontier[i - 1].monthlyCost);
    assert.ok(r.frontier[i].coveredCount > r.frontier[i - 1].coveredCount);
  }
  assert.equal(r.recommended.coveredCount, 4);
  assert.deepEqual(new Set(r.recommended.addedServices), new Set(["netflix", "max"]));
});

test("poor-value services are demoted by the $/film cutoff (not by film count)", () => {
  // Netflix: 15 films for $7.99 = $0.53/film (great). Paramount+: only 3 films
  // for $7.99 = $2.66/film (poor value). Default 'value' objective caps at $2/film.
  const films = [
    ...Array.from({ length: 15 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 3 }, (_, i) => film(`p${i}`, [PARAMOUNT_PREMIUM])),
  ];
  const value = optimizeStreaming(films, { region: "US" }); // objective 'value' by default
  assert.deepEqual(value.recommended.addedServices, ["netflix"]); // Paramount $2.66/film > $2
  assert.ok(value.marginalPath.some((m) => m.serviceId === "paramount-plus")); // still "if you want more"
  // 'coverage' uses a looser $4/film bar → Paramount ($2.66) qualifies.
  const coverage = optimizeStreaming(films, { region: "US", objective: "coverage" });
  assert.ok(coverage.recommended.addedServices.includes("paramount-plus"));
});

test("a poor-value giant doesn't block a good-value service behind it", () => {
  // Under ad-free pricing: Netflix Standard $17.99 (+15, $1.20/film, great),
  // HBO Max Standard $16.99 (+8, $2.12/film, poor), Amazon ad-free $11.98 (+7,
  // $1.71/film, good). Greedy-by-films would hit HBO Max before Amazon and stop,
  // stranding Amazon; the value-aware greedy skips HBO Max and keeps Amazon.
  const films = [
    ...Array.from({ length: 15 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 8 }, (_, i) => film(`h${i}`, [MAX])),
    ...Array.from({ length: 7 }, (_, i) => film(`a${i}`, [AMAZON])),
  ];
  const r = optimizeStreaming(films, { region: "US", tierPolicy: "adfree" });
  assert.deepEqual(new Set(r.recommended.addedServices), new Set(["netflix", "amazon-prime"]));
  assert.equal(r.recommended.addedServices.includes("max"), false);
  // HBO Max is still offered lower down ("if you want more").
  assert.ok(r.marginalPath.some((m) => m.serviceId === "max"));
});

test("'fewest' keeps only the heavy hitters + the top service", () => {
  // Netflix 20, Max 15, Criterion 4 (disjoint). Fewest → the big ones only.
  const films = [
    ...Array.from({ length: 20 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 15 }, (_, i) => film(`m${i}`, [MAX])),
    ...Array.from({ length: 4 }, (_, i) => film(`c${i}`, [CRITERION])),
  ];
  const r = optimizeStreaming(films, { region: "US", objective: "fewest" });
  // Criterion's 4 < 0.25 * 20 (=5) → dropped; Netflix + Max kept.
  assert.deepEqual(new Set(r.recommended.addedServices), new Set(["netflix", "max"]));
});

test("the knee stops adding a pricey service that unlocks too few films", () => {
  const films = [
    ...Array.from({ length: 10 }, (_, i) => film(`n${i}`, [NETFLIX])),
    film("art", [MUBI]),
  ];
  const r = optimizeStreaming(films, { region: "US", dollarsPerFilm: 4 });
  assert.deepEqual(r.recommended.addedServices, ["netflix"]);
  assert.equal(r.recommended.coveredCount, 10);
});

test("owned services are free and drop out of the added cost", () => {
  const films = [film("a", [NETFLIX]), film("b", [MAX])];
  const r = optimizeStreaming(films, { region: "US", ownedServices: ["netflix"], dollarsPerFilm: 20 });
  assert.equal(r.recommended.addedServices.includes("netflix"), false);
  assert.deepEqual(r.recommended.addedServices, ["max"]);
  assert.equal(r.recommended.coveredCount, 2);
  assert.equal(r.recommended.monthlyCost, price("max"));
});

test("orphans = films on no available service (free or paid)", () => {
  const films = [film("a", [NETFLIX]), film("rentonly", [UNPRICED]), film("nowhere", [])];
  const r = optimizeStreaming(films, { region: "US" });
  assert.equal(r.coverableCount, 1);
  assert.deepEqual(new Set(r.orphans.map((f) => f.key)), new Set(["rentonly", "nowhere"]));
});

test("maxServices caps the size of the added combo", () => {
  const films = [film("a", [NETFLIX]), film("b", [MAX]), film("c", [CRITERION])];
  const r = optimizeStreaming(films, { region: "US", maxServices: 1, dollarsPerFilm: 50 });
  assert.ok(r.recommended.addedServices.length <= 1);
  assert.ok(r.frontier.every((c) => c.addedServices.length <= 1));
});

test("deterministic: same input → same result", () => {
  const films = [film("a", [NETFLIX, MAX]), film("b", [MAX]), film("c", [CRITERION])];
  const a = optimizeStreaming(films, { region: "US" });
  const b = optimizeStreaming(films, { region: "US" });
  assert.deepEqual(a.recommended, b.recommended);
  assert.deepEqual(a.frontier, b.frontier);
  assert.deepEqual(a.marginalPath, b.marginalPath);
});

test("marginal path lists each service at most once", () => {
  const films = [
    ...Array.from({ length: 20 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 15 }, (_, i) => film(`m${i}`, [MAX])),
    ...Array.from({ length: 10 }, (_, i) => film(`c${i}`, [CRITERION])),
    film("shared", [NETFLIX, MAX, CRITERION]),
  ];
  const r = optimizeStreaming(films, { region: "US", maxServices: 4, dollarsPerFilm: 100 });
  const ids = r.marginalPath.map((s) => s.serviceId);
  assert.equal(new Set(ids).size, ids.length, "no service repeats in the path");
});

test("a film on multiple services is counted once; overlap has no marginal value", () => {
  const films = [
    film("n1", [NETFLIX]),
    film("n2", [NETFLIX]),
    film("n3", [NETFLIX]),
    film("shared", [NETFLIX, MAX]),
    film("m1", [MAX]),
  ];
  const r = optimizeStreaming(films, { region: "US", dollarsPerFilm: 100 });
  assert.equal(r.marginalPath[0].serviceId, "netflix");
  assert.equal(r.marginalPath[0].addedFilms, 4);
  assert.equal(r.marginalPath[1].serviceId, "max");
  assert.equal(r.marginalPath[1].addedFilms, 1);
  assert.equal(r.marginalPath[1].coveredCount, 5);
});

test("provider-id variants fold to their canonical service", () => {
  // A film only on 'Paramount Plus Premium' (2303) must count as Paramount+,
  // not slip into orphans (the pre-V2 bug).
  const films = [film("a", [PARAMOUNT_PREMIUM]), film("b", [PARAMOUNT_PREMIUM])];
  const r = optimizeStreaming(films, { region: "US", dollarsPerFilm: 100 });
  assert.equal(r.orphans.length, 0);
  assert.deepEqual(r.recommended.addedServices, ["paramount-plus"]);
  assert.equal(r.recommended.coveredCount, 2);
});

test("free services form a baseline: free films aren't orphans or paid steps", () => {
  const films = [
    film("free1", [TUBI]), // only free
    film("both", [TUBI, NETFLIX]), // free on Tubi, also paid on Netflix
    film("paid1", [NETFLIX]), // paid only
  ];
  const r = optimizeStreaming(films, { region: "US", dollarsPerFilm: 100 });
  // Tubi covers free1 + both → freeCoveredCount 2, and it's in the free list.
  assert.equal(r.freeCoveredCount, 2);
  assert.ok(r.free.some((f) => f.slug === "tubi"));
  assert.equal(r.orphans.length, 0);
  // Netflix's ONLY marginal value is paid1 (both is already free).
  assert.equal(r.marginalPath[0].serviceId, "netflix");
  assert.equal(r.marginalPath[0].addedFilms, 1);
});

test("allInCost sums every covering paid service; owned are credited, not in all-in", () => {
  const films = [film("n", [NETFLIX]), film("m", [MAX]), film("c", [CRITERION])];
  const r = optimizeStreaming(films, { region: "US", ownedServices: ["criterion"], dollarsPerFilm: 100 });
  // Criterion owned → credited (covers c), excluded from all-in.
  assert.deepEqual(r.owned.map((o) => o.slug), ["criterion"]);
  assert.equal(r.owned[0].coveredCount, 1);
  // All-in = Netflix + Max cheapest tiers (Criterion excluded, it's owned).
  assert.equal(r.allInCost, Math.round((price("netflix") + price("max")) * 100) / 100);
});

test("budget mode caps the recommended combo; a bigger budget covers more", () => {
  const films = [
    ...Array.from({ length: 5 }, (_, i) => film(`n${i}`, [NETFLIX])),
    ...Array.from({ length: 5 }, (_, i) => film(`m${i}`, [MAX])),
    ...Array.from({ length: 5 }, (_, i) => film(`c${i}`, [CRITERION])),
  ];
  const at8 = optimizeStreaming(films, { region: "US", maxBudget: 8 });
  const at18 = optimizeStreaming(films, { region: "US", maxBudget: 18 });
  const at30 = optimizeStreaming(films, { region: "US", maxBudget: 30 });
  assert.ok(at8.recommended.monthlyCost <= 8);
  assert.ok(at18.recommended.monthlyCost <= 18);
  assert.ok(at30.recommended.coveredCount > at18.recommended.coveredCount);
  assert.ok(at18.recommended.coveredCount > at8.recommended.coveredCount);
});

test("budget mode picks the best affordable combo, not a greedy prefix", () => {
  const SHUDDER = 99; // $6.99, few films
  // MUBI ($14.99) covers 10 films; Shudder ($6.99) covers 2. Budget only fits Shudder.
  const films = [
    ...Array.from({ length: 10 }, (_, i) => film(`u${i}`, [MUBI])),
    film("s1", [SHUDDER]),
    film("s2", [SHUDDER]),
  ];
  const r = optimizeStreaming(films, { region: "US", maxBudget: 7 });
  // A greedy-by-films prefix would take MUBI first, overshoot $7, and recommend
  // nothing. The frontier-based budget pick takes the affordable Shudder instead.
  assert.deepEqual(r.recommended.addedServices, ["shudder"]);
  assert.equal(r.recommended.coveredCount, 2);
});

test("ad-free tier policy prices paid ad-free tiers but KEEPS free ad-supported services", () => {
  const films = [film("n1", [NETFLIX]), film("t1", [TUBI])];
  const cheap = optimizeStreaming(films, { region: "US", tierPolicy: "cheapest", dollarsPerFilm: 100 });
  const adfree = optimizeStreaming(films, { region: "US", tierPolicy: "adfree", dollarsPerFilm: 100 });
  // Netflix's ad-free tier costs more than its cheapest (ad-supported) tier.
  const cheapNetflix = cheap.marginalPath.find((m) => m.serviceId === "netflix")!.monthlyCost;
  const adfreeNetflix = adfree.marginalPath.find((m) => m.serviceId === "netflix")!.monthlyCost;
  assert.ok(adfreeNetflix > cheapNetflix, "ad-free Netflix costs more");
  // Ad-free PRICING doesn't touch free services: Tubi still covers t1 for free.
  assert.ok(adfree.free.some((f) => f.slug === "tubi"));
  assert.equal(adfree.orphans.length, 0);
});

test("excludeAdSupportedFree drops Tubi/Pluto — a 'no ads anywhere' preference", () => {
  const films = [film("n1", [NETFLIX]), film("t1", [TUBI])];
  const withFree = optimizeStreaming(films, { region: "US" });
  const noAds = optimizeStreaming(films, { region: "US", excludeAdSupportedFree: true });
  assert.ok(withFree.free.some((f) => f.slug === "tubi"));
  // With free-ads excluded, Tubi's only film is no longer covered free → orphan
  // (nothing paid carries it), so the math shifts as expected.
  assert.equal(noAds.free.some((f) => f.slug === "tubi"), false);
  assert.ok(noAds.orphans.some((f) => f.key === "t1"));
});

test("library toggle gates Kanopy/Hoopla from the free baseline", () => {
  const films = [film("k", [KANOPY])]; // only on Kanopy (library card)
  const on = optimizeStreaming(films, { region: "US", includeLibraryFree: true });
  assert.equal(on.freeCoveredCount, 1);
  assert.equal(on.orphans.length, 0);
  const off = optimizeStreaming(films, { region: "US", includeLibraryFree: false });
  assert.equal(off.freeCoveredCount, 0);
  assert.equal(off.orphans.length, 1); // no card → nowhere to watch it free
});

test("tvCount tallies TV titles; movies and untyped titles don't count", () => {
  const films: StreamingFilm[] = [
    { key: "a", title: "Dune", providerIds: [MAX], mediaType: "movie" },
    { key: "b", title: "The Bear", providerIds: [NETFLIX], mediaType: "tv" },
    { key: "c", title: "Severance", providerIds: [NETFLIX], mediaType: "tv" },
    { key: "d", title: "Untyped", providerIds: [NETFLIX] },
  ];
  const r = optimizeStreaming(films, { region: "US" });
  assert.equal(r.totalFilms, 4);
  assert.equal(r.tvCount, 2);
});

test("overlapping catalog: the value pick is partial by design, the exact optimum stays on the frontier, and the recommendation is never dominated", () => {
  const SHUDDER = 99; // $6.99 ad-free
  const MGM = 34; // $6.99 ad-free
  // Netflix (cheapest tier $7.99) covers f1–f6; Shudder covers f1–f3 + f7;
  // MGM+ covers f4–f6 + f8. Every film overlaps two services — the case a naive
  // greedy handles worst.
  const films = [
    film("f1", [NETFLIX, SHUDDER]), film("f2", [NETFLIX, SHUDDER]), film("f3", [NETFLIX, SHUDDER]),
    film("f4", [NETFLIX, MGM]), film("f5", [NETFLIX, MGM]), film("f6", [NETFLIX, MGM]),
    film("f7", [SHUDDER]), film("f8", [MGM]),
  ];
  const r = optimizeStreaming(films, { region: "US" }); // 'value' by default

  // Value objective: Netflix alone is the best $/film (6 films for $7.99); adding a
  // $6.99 service for its 1–2 remaining films busts the $2/film bar, so the value
  // recommendation is deliberately PARTIAL (6/8), not full coverage.
  assert.deepEqual(r.recommended.addedServices, ["netflix"]);
  assert.equal(r.recommended.coveredCount, 6);

  // The exact FULL-coverage optimum is still computed and available on the frontier:
  // Shudder + MGM+ = all 8 for $13.98, beating Netflix + Shudder + MGM+ ($21.97).
  const full = r.frontier
    .filter((c) => c.coveredCount === r.totalFilms)
    .sort((a, b) => a.monthlyCost - b.monthlyCost)[0];
  assert.deepEqual(new Set(full.addedServices), new Set(["shudder", "mgm-plus"]));
  assert.equal(full.monthlyCost, Math.round((price("shudder") + price("mgm-plus")) * 100) / 100);

  // Guarantee: the recommended combo is Pareto-optimal — no frontier combo covers
  // at least as much for strictly less. (You never overpay for the coverage shown.)
  const dominated = r.frontier.some(
    (c) => c.coveredCount >= r.recommended.coveredCount && c.monthlyCost < r.recommended.monthlyCost,
  );
  assert.equal(dominated, false);
});

test("property: across random instances + objectives the recommendation is a non-dominated frontier point, and the receipt reconciles", () => {
  // Seeded LCG so any failure reproduces exactly (no Math.random in the suite).
  let seed = 987654321;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const SHUDDER = 99, MGM = 34, STARZ = 43, AMC = 526;
  const POOL = [NETFLIX, MAX, AMAZON, CRITERION, MUBI, SHUDDER, MGM, PARAMOUNT_PREMIUM, STARZ, AMC];
  const OBJECTIVES: Array<'value' | 'coverage' | 'fewest'> = ['value', 'coverage', 'fewest'];

  for (let trial = 0; trial < 400; trial++) {
    const n = 3 + Math.floor(rand() * 12);
    const films = Array.from({ length: n }, (_, i) => {
      const ids = POOL.filter(() => rand() < 0.3);
      if (ids.length === 0) ids.push(POOL[Math.floor(rand() * POOL.length)]);
      return film(`f${i}`, ids);
    });
    const objective = OBJECTIVES[Math.floor(rand() * OBJECTIVES.length)];
    const r = optimizeStreaming(films, { region: 'US', objective });
    const where = `trial ${trial}, objective ${objective}`;

    // (1) S-01: the recommendation is never Pareto-dominated by a frontier point.
    const dominated = r.frontier.some(
      (c) =>
        (c.coveredCount > r.recommended.coveredCount && c.monthlyCost <= r.recommended.monthlyCost) ||
        (c.coveredCount >= r.recommended.coveredCount && c.monthlyCost < r.recommended.monthlyCost),
    );
    assert.equal(dominated, false, `dominated recommendation — ${where}`);

    // (2) It is a member of the exact frontier (same coverage + cost as some point).
    const onFrontier = r.frontier.some(
      (c) => c.coveredCount === r.recommended.coveredCount && c.monthlyCost === r.recommended.monthlyCost,
    );
    assert.ok(onFrontier, `recommendation off the frontier — ${where}`);

    // (3) F-03: the receipt reconciles. Every recommended service appears in the
    // marginal path, and the cumulative cost/coverage at the last of them equals
    // the headline — so WHAT TO ADD is exactly the plan and sums to the total.
    const recSlugs = new Set(r.recommended.addedServices);
    const recPath = r.marginalPath.filter((m) => recSlugs.has(m.serviceId));
    assert.equal(recPath.length, r.recommended.addedServices.length, `missing plan services in path — ${where}`);
    if (recPath.length > 0) {
      const last = recPath[recPath.length - 1];
      assert.equal(last.monthlyCost, r.recommended.monthlyCost, `rows don't sum to headline — ${where}`);
      assert.equal(last.coveredCount, r.recommended.coveredCount, `coverage mismatch — ${where}`);
    }
  }
});

test("catalog price snapshot is fresh (staleness alarm — re-verify prices and bump PRICES_AS_OF when this fails)", () => {
  const asOf = new Date(`${PRICES_AS_OF}-01T00:00:00Z`);
  assert.ok(!Number.isNaN(asOf.getTime()), "PRICES_AS_OF must be 'YYYY-MM'");
  const monthsOld = (Date.now() - asOf.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  assert.ok(
    monthsOld <= 12,
    `Prices last checked ${PRICES_AS_OF} (~${monthsOld.toFixed(0)} months ago) — re-verify and bump PRICES_AS_OF.`,
  );
});
