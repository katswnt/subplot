# Subplot

**A watchlist-to-streaming-plan tool.** Import a Letterboxd or IMDb watchlist,
tell Subplot which services you already have, and get a monthly plan that makes
the cost-versus-coverage tradeoff visible.

[Try Subplot](https://subplot.katswint.com/) ·
[View the project it was extracted from](https://github.com/katswnt/letterbddy)

Subplot began inside the
[Letterbddy](https://github.com/katswnt/letterbddy) monorepo and was extracted
once its product and deployment boundaries were clear. Its app history was
preserved during the split. The small domain and API-client surfaces it depended
on now live here, so this repository installs, tests, and deploys independently.

## What this project demonstrates

- **Product judgment under imperfect data.** Streaming availability is live-ish;
  subscription prices are not available from TMDb; service names are fragmented
  across tiers and resellers. The product makes those boundaries explicit rather
  than pretending the data is more exact than it is.
- **Algorithm design with explainable output.** The domain layer computes an
  exact bounded cost/coverage frontier, then uses a deterministic marginal-value
  heuristic for the default recommendation. The UI shows the additions in order
  so a user can understand where each dollar goes.
- **Separation of concerns.** CSV parsing and optimization are pure,
  dependency-free TypeScript. Network resolution, caching, and UI state live at
  their appropriate boundaries.
- **Privacy-conscious scope.** Raw exports are parsed in the browser. There are
  no accounts, saved watchlists, or user database.
- **Production-minded failure handling.** Work is batched with bounded
  concurrency, shared public data is cached, Redis fails open, and incomplete
  provider batches fail the run rather than becoming false “not streaming”
  claims.
- **Iterative product development.** Tests cover parsing, provider
  canonicalization, free and owned-service baselines, tier policies, budgets,
  Pareto dominance, deterministic tie-breaking, and receipt explanations.

## How it works

```mermaid
flowchart LR
    CSV[Letterboxd or IMDb CSV] -->|parsed locally| Browser[React client]
    Browser --> Resolve[/api/resolve]
    Resolve <--> Cache[(Redis)]
    Resolve --> TMDb[TMDb API]
    Browser --> Providers[/api/watch-providers]
    Providers <--> Cache
    Providers --> TMDb
    Browser --> Catalog[Canonical US service catalog]
    Catalog --> Optimizer[Pure TypeScript optimizer]
    Optimizer --> Receipt[Explainable streaming receipt]
```

1. `parseWatchlist` detects the export format, keeps films, normalizes identity,
   and deduplicates rows in the browser.
2. `api/resolve.ts` maps IMDb IDs through TMDb `/find`; title-only rows use
   TMDb `/search/movie` with the release year when available.
3. `api/watch-providers.ts` retrieves region-scoped subscription, free,
   ad-supported, rental, and purchase offers. Subplot currently optimizes the
   first three buckets.
4. The catalog folds TMDb provider variants—such as direct plans, ad-supported
   tiers, and reseller channels—into one service with one price model.
5. `optimizeStreaming` applies free and already-owned services as a zero
   incremental-cost baseline, computes the bounded frontier, and produces the
   receipt.
6. Once availability is loaded, changing budgets, objectives, tiers, or owned
   services recomputes locally without another network request.

## What “cheapest” means

Subplot does not claim one universally optimal answer. “Best” depends on whether
the user values monthly price, coverage, or number of subscriptions.

### Exact result

For the tracked services, Subplot enumerates every combination of up to six new
paid services and removes dominated combinations. A plan is dominated when
another plan costs no more and covers at least as many films, with one strict
improvement. The remaining plans form the exact cost/coverage Pareto frontier
**within that six-service boundary**.

When a user sets a hard budget, the recommendation is the highest-coverage plan
on that frontier that fits the budget.

### Default recommendation

Without a budget, the recommendation is a deterministic, explainable heuristic:

1. Add the service that unlocks the most new films.
2. Continue adding services only while their marginal value clears the selected
   objective's threshold.
3. Break ties by lower price, then stable service ID.
4. Show the remaining marginal path separately as “if you want more.”

The value objective uses a stricter dollars-per-new-film bar than coverage.
“Fewest services” keeps only heavy hitters and adds at most three. This is
deliberately easier to explain than a hidden weighted score, but it is not a
proof that the default receipt is the global optimum for every possible utility
function.

## Decisions and tradeoffs

| Decision | Why | Cost / revisit trigger |
| --- | --- | --- |
| CSV import instead of OAuth or scraping | Letterboxd and IMDb exports are portable, user-controlled, and sufficient for the core question. It keeps the MVP independent of private or unstable APIs. | Import has friction and no live sync. Revisit if repeated use matters more than one-shot analysis. |
| Parse raw exports in the browser | The server does not need a copy of a user's watchlist to resolve public film metadata. | Film identifiers and titles still go to Subplot's functions and TMDb. |
| No accounts or persistence | A recommendation can be produced without identity, consent flows, or a user database. This reduces privacy and operational surface area. | Users cannot save or compare plans. Add persistence only with an explicit repeat-use case. |
| TMDb + JustWatch availability | It is accessible, region-scoped, and returns the provider IDs needed for the model. | Coverage can lag or omit offers. Subplot attributes JustWatch and avoids claiming real-time inventory. |
| Maintained canonical service catalog | TMDb splits one service across plans and reseller channels; raw IDs would undercount coverage and create false orphans. | New provider IDs and price changes require maintenance. Catalog consistency is test-gated. |
| Static subscription prices | TMDb exposes availability but not plan prices. A small explicit table is inspectable and testable. | Prices can drift. The UI should eventually display “checked on” dates and the catalog needs a scheduled review or another licensed source. |
| Seven-day availability cache | Provider data is shared across users, and a watchlist can require hundreds of TMDb calls. A week reduces latency and API load without accepting month-old buying advice. | Revisit using observed cache-hit rate, TMDb limits, and user reports; add manual refresh before increasing traffic. |
| 180-day identity cache | IMDb-to-TMDb mappings are effectively stable and reusable across users. | Version the cache key if matching rules change. |
| Exact bounded frontier + heuristic recommendation | Exhaustive enumeration gives an honest tradeoff surface at current catalog size; the heuristic gives a concise default that can be explained line by line. | Enumeration grows combinatorially. Replace it with branch-and-bound, integer programming, or a pruned search if the catalog or service cap grows materially. |
| Owned and free services are the baseline | The useful question is incremental spend, not the sticker price of services a user already has access to. | “Owned” tier selection is display context; it does not alter incremental cost because that cost is already sunk. |
| Fail a run on any provider-batch error | Missing availability is indistinguishable from “not streaming.” A partial result would create confident but false rent/buy claims. | A future version could retry and explicitly mark incomplete films, but must never silently classify them. |
| Pure domain modules | Parsing and optimization can be tested without React, Vercel, Redis, or the network. They moved into this repository during extraction so Subplot has no hidden workspace dependency. | Publish a package only if a second independent consumer needs coordinated releases. |
| Single-column, receipt-style UI | The task is linear and the result should scan like a bill: included value, what to add, and diminishing returns. | If comparison becomes the primary task, a wider frontier visualization may serve users better. |

## Guarantees and boundaries

Subplot can guarantee:

- deterministic output for the same normalized films, catalog, and controls;
- an exact Pareto frontier among tracked services for combinations up to the
  configured six-service cap;
- exact highest coverage under a user-entered budget within that boundary;
- no duplicate charge for TMDb variants that map to the same canonical service;
- no false optimization result when a provider request fails outright.

Subplot cannot guarantee:

- that TMDb/JustWatch has every current offer;
- that a title-only row matched the intended film;
- that manually maintained subscription prices changed today;
- that untracked niche services, bundles, annual plans, promotions, taxes, or
  existing bundle entitlements are represented;
- that a film marked outside the tracked subscription catalog cannot be rented
  or bought;
- that the default no-budget heuristic is a global optimum for a user's
  unexpressed preferences.

## Privacy and data flow

- The CSV file is read and parsed locally; Subplot does not upload or store the
  raw file.
- Film keys, IMDb IDs, titles, and years are sent to Subplot's resolution
  function. TMDb receives the identifiers or search query needed to find the
  film.
- Redis stores shared film-ID mappings and region/provider responses, not user
  identity or a record linking a watchlist to a person.
- There is currently no authentication, analytics SDK, or watchlist database in
  the standalone app.

## Reliability and testing

The API caps requests at 600 items. The client sends batches of 400 with at most
three batches in flight; each serverless handler makes at most eight outbound
TMDb requests concurrently. Redis is an optimization rather than a dependency:
cache failures fall back to TMDb.

The highest-risk logic has focused tests:

- CSV source detection, quoted fields, TV filtering, normalization, and dedupe;
- provider-ID uniqueness and catalog/tier consistency;
- exact-frontier dominance, service caps, budget selection, free and library
  policies, ad policies, owned services, and deterministic tie-breaking;
- result explanations, receipt rendering, and pipeline batching;
- provider-request failure behavior, so partial data cannot become false
  availability advice.

The build runs strict TypeScript checks for both the client and serverless
functions before Vite bundles the app.

## Known gaps and next decisions

These are open work, not accidental guarantees:

| Gap | Current position | Decision needed before |
| --- | --- | --- |
| US-only catalog | The app models `US`; the region abstraction remains because provider responses are region-scoped. | Exposing another region selector. Each region needs its own services, prices, tests, and currency UX. |
| Ambiguous title matching | IMDb IDs are exact; title-only imports accept TMDb's first search result, narrowed by year when present. | Claiming high-confidence matching. Add a confidence model and a review flow for ambiguous rows. |
| Price freshness | Prices are maintained constants, dated in the catalog source. | Treating the result as transaction-grade. Add visible verification dates and automated or scheduled review. |
| Rent/buy economics | The API carries rent/buy provider presence but TMDb does not provide prices. | Recommending “rent instead of subscribe.” That requires licensed price data and a break-even model. |
| API abuse controls | Inputs, sizes, methods, and concurrency are bounded; the public endpoints are otherwise unauthenticated. | Meaningful public traffic. Add rate limiting, quota monitoring, and tighter CORS/origin policy. |
| Network-level test coverage | Pure domain and React behavior are covered; serverless handlers do not yet have contract/integration tests against recorded TMDb responses. | Refactoring API boundaries or supporting more regions/providers. |
| End-to-end coverage | There is no dedicated browser test that imports a fixture and completes a mocked recommendation flow. | Frequent UI or deployment changes. |
| Observability | Errors reach the user, but there are no product-specific dashboards for resolution rate, provider failures, cache hit rate, or latency. | Operating the app as more than a portfolio-scale public demo. |

## Questions this project should prompt

### Why not solve the whole problem with set cover?

The product needs a cost/coverage tradeoff, not only minimum cardinality. The
exact bounded frontier preserves the available choices; the default heuristic
turns one choice into an explainable receipt. I would move to branch-and-bound or
an optimization solver when catalog growth makes enumeration expensive.

### How do you know the recommendation is correct?

“Correct” is split into testable claims: normalized provider coverage, exact
non-dominated plans within the cap, exact budget selection, and deterministic
heuristic behavior. External availability, identity matching, and prices are
separate data-quality questions and are described as limitations.

### Why stop rather than return a partial result when TMDb fails?

Because absence of data and absence of streaming availability look identical
downstream. A wrong receipt is worse than a retryable error. A partial-results
design would need per-film completeness state throughout the model and UI.

### What would you harden first for real traffic?

Rate limits and quota telemetry, handler contract tests, an end-to-end happy
path, visible price freshness, and ambiguous-match review. The repository's CI
already runs the build, domain tests, component tests, and lint together.

### What did AI tools contribute?

Claude Code and Codex were implementation collaborators. Kat Swint owns the
product framing, tradeoffs, acceptance decisions, and the standard of evidence:
generated changes are reviewed against the source, strict typechecks, focused
tests, and the user-visible behavior. The relevant interview question is not
whether tools were used, but which decisions Kat can explain, test, and change.

## Project map

```text
api/
├── resolve.ts                     # imported film -> TMDb ID
├── watch-providers.ts             # region-scoped availability
└── _lib/                          # validation, Redis, HTTP, concurrency

src/
├── api-client/                    # typed client boundary for both functions
├── components/                    # import, controls, receipt/results
├── domain/
│   ├── imports/                   # pure CSV import and normalization
│   └── streaming/                 # canonical catalog and optimizer
├── lib/pipeline.ts                # batched client orchestration
└── App.tsx                        # four-phase product flow

tests/
├── domain/                        # algorithm and catalog contracts
└── components/                    # UI, explanation, and pipeline behavior

index.html                          # app shell, metadata, structured data
vercel.json                        # SPA routing and function limits
.github/workflows/ci.yml           # build + test + lint gate
```

## Develop

```bash
npm install
npm run dev
```

Environment variables for the serverless functions:

```text
TMDB_API_KEY=...
REDIS_URL=...              # optional locally; caching fails open
```

The Vercel integration may expose the Redis URL as
`subplot_REDIS_URL`; the app accepts either name.

## Verify

```bash
# Client + API typecheck, then production bundle
npm run build

# Pure-domain tests, including the optimizer and catalog
npm run test:domain

# React and pipeline tests
npm run test:components

# Everything CI runs
npm run gate
```

## Deploy

Subplot is configured as a root-level Vercel project with SPA rewrites and
60-second serverless function limits. The production project still needs to be
reconnected to this extracted repository before the old monorepo copy is
retired. The custom domain is
[subplot.katswint.com](https://subplot.katswint.com/).

Streaming availability data is provided by **JustWatch via TMDb**.

Built by [Kat Swint](https://katswint.com/) with a little help from Claude Code
and Codex.
