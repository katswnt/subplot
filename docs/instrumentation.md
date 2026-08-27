# Instrumentation

Subplot's privacy stance rules out client-side product analytics: nothing about a
user's watchlist leaves the browser. Instrumentation is therefore **aggregate and
server-side** — counts, ratios, and latency only, never a title, key, TMDb/IMDb
id, URI, or any identifier. This is the `Observability` row in the README's gaps
table.

## Invariant

Every emitted value is a number, plus two fixed string labels (`ns`, `event`).
Enforced by `tests/components/metrics.test.ts`, which fails if a payload ever
carries a string field beyond those labels.

## Tier 1 — server-side handler metrics (built)

Each API handler emits **one structured JSON log line** per invocation via
`api/_lib/metrics.ts`, plus a few best-effort Redis headline counters
(`api/_lib/redis.ts` → `incrMetric`, namespace `subplot:m:*`). The log line is
the source of truth (synchronous, always emitted); the counters are a convenience
for at-a-glance totals and are a no-op when Redis is absent.

### `resolve`
Log: `{ ns:'subplot.metric', event:'resolve', imported, resolved, unresolved, movie, tv, ms }`
Counters: `resolve:movie`, `resolve:tv`, `resolve:unresolved`, `resolve:calls`

Answers: **resolution rate** (`resolved ÷ imported`) and the **movie/TV mix**
(`tv ÷ (movie+tv)`) — the headline question after the TV launch.

### `watch-providers`
Log: `{ ns:'subplot.metric', event:'watch_providers', requested, cacheHits, fetched, failed, ms }`
Counters: `wp:requested`, `wp:cacheHits`, `wp:failed`, `wp:calls`

Answers: **cache-hit rate** (`cacheHits ÷ requested`) and **provider-batch failure
rate** (`failed ÷ requested`) — health of the TMDb seam.

### Querying
- **Trends / percentiles:** filter Vercel logs for `subplot.metric` and compute
  ratios and p50/p95 latency over the `ms` field.
- **At-a-glance totals:** read the `subplot:m:*` Redis keys.

### Known limits (honest scope)
- A "run" is a client watchlist that gets chunked (~400 titles/request), so the
  server sees multiple `resolve` calls per run. The **per-title tallies are exact
  and additive** regardless of chunking; a true per-run count needs Tier 2.
- Redis counters are best-effort (fire-and-forget, no-op without Redis). The log
  line is the reliable channel.
- p50/p95 latency is computed post-hoc from the `ms` field in logs, not
  pre-aggregated.

## Tier 2 — funnel + north-star beacon (unbuilt; trigger: sustained real traffic)

The optimizer runs **client-side**, so the activation funnel past availability
(`import → resolve → review → receipt`) and the **north-star** (share of the list
a plan accounts for) can't be seen from the handlers. Capturing them requires the
client to POST an aggregate-only summary once per resolved watchlist.

**Spec:**
- `POST /api/metrics` with an **exact numeric schema**
  `{ stage, totalTitles, tvCount, resolvedCount, orphanCount, flaggedCount, coveredByRecommended }`
  — all numbers/enum; anything else → 422. Reuse the existing per-IP rate limit.
- Client fires once per **resolved** watchlist (keyed off resolve completing, not
  the live `useMemo` re-optimize), via `navigator.sendBeacon`, guarded so control
  changes don't re-send.
- Handler logs it as `event:'funnel'`; the body is never stored beyond the log.

**Why deferred:** it adds a public endpoint (attack surface, bot-pollutable) and
nudges the privacy posture from "literally nothing sent" to "anonymous aggregates
sent." That trade is worth it once the app sees traffic worth measuring — the same
trigger the README's `Observability` row already names.
