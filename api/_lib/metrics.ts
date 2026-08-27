/**
 * Subplot — aggregate, privacy-preserving instrumentation (Tier 1).
 *
 * Emits ONE structured JSON log line per handler invocation: counts, ratios,
 * and latency ONLY. Never a title, key, TMDb/IMDb id, URI, or any user
 * identifier — so the log stream is safe to ship to Vercel's log explorer
 * without breaking Subplot's "nothing about your watchlist leaves" guarantee.
 *
 * The pure builders (`resolveMetric`, `watchProvidersMetric`) shape the payload
 * and are unit-tested for the numbers-only invariant; `logMetric` just emits.
 * See docs/instrumentation.md for the full plan (incl. the unbuilt Tier 2
 * funnel beacon).
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type ResolveMetric = {
  ns: 'subplot.metric';
  event: 'resolve';
  /** Titles in this (client-chunked) request. */
  imported: number;
  /** movie + tv. */
  resolved: number;
  unresolved: number;
  movie: number;
  tv: number;
  /** Handler wall-clock, ms. */
  ms: number;
};

export type WatchProvidersMetric = {
  ns: 'subplot.metric';
  event: 'watch_providers';
  /** Unique refs asked for this request. */
  requested: number;
  cacheHits: number;
  /** Refs fetched from TMDb (cache misses that returned providers). */
  fetched: number;
  /** Refs that yielded no providers (TMDb error or no data). */
  failed: number;
  ms: number;
};

export type Metric = ResolveMetric | WatchProvidersMetric;

export function resolveMetric(c: {
  imported: number;
  movie: number;
  tv: number;
  unresolved: number;
  ms: number;
}): ResolveMetric {
  return {
    ns: 'subplot.metric',
    event: 'resolve',
    imported: c.imported,
    resolved: c.movie + c.tv,
    unresolved: c.unresolved,
    movie: c.movie,
    tv: c.tv,
    ms: round2(c.ms),
  };
}

export function watchProvidersMetric(c: {
  requested: number;
  cacheHits: number;
  fetched: number;
  failed: number;
  ms: number;
}): WatchProvidersMetric {
  return {
    ns: 'subplot.metric',
    event: 'watch_providers',
    requested: c.requested,
    cacheHits: c.cacheHits,
    fetched: c.fetched,
    failed: c.failed,
    ms: round2(c.ms),
  };
}

/** Emit a metric as one structured log line. Fire-and-forget; never throws —
 *  telemetry must never break a request. */
export function logMetric(metric: Metric): void {
  try {
    console.log(JSON.stringify(metric));
  } catch {
    /* ignore */
  }
}
