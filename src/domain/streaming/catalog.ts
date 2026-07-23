/**
 * Subplot — the canonical streaming-service catalog (pure, dependency-free).
 *
 * TMDb fragments each service into many `provider_id` variants: pricing tiers
 * ("Paramount Plus Essential" vs "Premium", "Netflix Standard with Ads"),
 * resold channels ("… Amazon Channel", "… Roku Premium Channel", "… Apple TV
 * Channel"), and separate free/ad buckets. Keying prices on a single id per
 * service therefore MISSES coverage — a film on "Paramount Plus Premium" (2303)
 * looks like an orphan if we only priced 531.
 *
 * This catalog folds every known variant id into one canonical service, records
 * its pricing tiers (ad-supported vs ad-free), and marks free services. All ids
 * below were confirmed against live TMDb `watch/providers` data (US). Prices are
 * the standard US monthly tiers as of 2026-07 — a maintained constant.
 */

export type Region = string; // ISO 3166-1 alpha-2

export type ServiceTier = {
  id: string; // 'ads' | 'adfree' | 'standard'
  label: string;
  monthly: number;
  ads: boolean;
};

export type ServiceKind =
  | 'paid' // a normal subscription
  | 'free-ads' // free, ad-supported (Tubi, Pluto, Freevee)
  | 'free-library'; // free but needs a library card + has monthly limits (Kanopy, Hoopla)

export type StreamingService = {
  slug: string;
  name: string;
  kind: ServiceKind;
  /** Short caveat shown in the UI (library card, ads, borrow limits). */
  note?: string;
  /** Pricing tiers, sorted cheapest-first. Free services have a single $0 tier. */
  tiers: ServiceTier[];
  /** Every TMDb provider_id (tiers + resold channels) that folds to this service. */
  providerIds: number[];
};

const adfree = (monthly: number, label = 'Ad-free'): ServiceTier => ({ id: 'adfree', label, monthly, ads: false });
const withAds = (monthly: number, label = 'With ads'): ServiceTier => ({ id: 'ads', label, monthly, ads: true });

/** US catalog. Ordered roughly by how mainstream the service is. */
const US: StreamingService[] = [
  { slug: 'netflix', name: 'Netflix', kind: 'paid', tiers: [withAds(7.99), adfree(17.99, 'Standard')], providerIds: [8, 1796] },
  {
    slug: 'amazon-prime',
    name: 'Amazon Prime Video',
    kind: 'paid',
    tiers: [withAds(8.99), adfree(11.98)],
    providerIds: [9, 2100],
  },
  { slug: 'disney-plus', name: 'Disney+', kind: 'paid', tiers: [withAds(9.99), adfree(15.99)], providerIds: [337] },
  { slug: 'hulu', name: 'Hulu', kind: 'paid', tiers: [withAds(9.99), adfree(18.99)], providerIds: [15] },
  { slug: 'max', name: 'HBO Max', kind: 'paid', tiers: [withAds(9.99), adfree(16.99, 'Standard')], providerIds: [1899, 1825] },
  { slug: 'apple-tv-plus', name: 'Apple TV+', kind: 'paid', tiers: [adfree(9.99)], providerIds: [350, 2243] },
  {
    slug: 'paramount-plus',
    name: 'Paramount+',
    kind: 'paid',
    tiers: [withAds(7.99, 'Essential'), adfree(12.99, 'Premium')],
    providerIds: [531, 2616, 2303, 582, 633],
  },
  {
    slug: 'peacock',
    name: 'Peacock',
    kind: 'paid',
    tiers: [withAds(7.99, 'Premium'), adfree(13.99, 'Premium Plus')],
    providerIds: [386, 387],
  },
  { slug: 'criterion', name: 'Criterion Channel', kind: 'paid', tiers: [adfree(10.99)], providerIds: [258] },
  { slug: 'mubi', name: 'MUBI', kind: 'paid', tiers: [adfree(14.99)], providerIds: [11] },
  { slug: 'starz', name: 'Starz', kind: 'paid', tiers: [adfree(9.99)], providerIds: [43, 1794, 1855] },
  { slug: 'amc-plus', name: 'AMC+', kind: 'paid', tiers: [adfree(8.99)], providerIds: [526, 528, 635, 1854] },
  { slug: 'shudder', name: 'Shudder', kind: 'paid', tiers: [adfree(6.99)], providerIds: [99, 204, 2049] },
  { slug: 'mgm-plus', name: 'MGM+', kind: 'paid', tiers: [adfree(6.99)], providerIds: [34, 583, 636] },
  { slug: 'britbox', name: 'BritBox', kind: 'paid', tiers: [adfree(8.99)], providerIds: [151, 1852] },
  { slug: 'showtime', name: 'Showtime', kind: 'paid', tiers: [adfree(10.99)], providerIds: [37] },

  // Free — ad-supported, available to anyone.
  { slug: 'tubi', name: 'Tubi', kind: 'free-ads', note: 'Free with ads', tiers: [withAds(0)], providerIds: [73] },
  { slug: 'pluto-tv', name: 'Pluto TV', kind: 'free-ads', note: 'Free with ads', tiers: [withAds(0)], providerIds: [300] },
  { slug: 'freevee', name: 'Amazon Freevee', kind: 'free-ads', note: 'Free with ads', tiers: [withAds(0)], providerIds: [613] },
  { slug: 'roku-channel', name: 'The Roku Channel', kind: 'free-ads', note: 'Free with ads', tiers: [withAds(0)], providerIds: [207] },
  { slug: 'plex', name: 'Plex', kind: 'free-ads', note: 'Free with ads', tiers: [withAds(0)], providerIds: [538] },

  // Free — library card required, with monthly borrow limits.
  { slug: 'kanopy', name: 'Kanopy', kind: 'free-library', note: 'Free with a library card', tiers: [adfree(0)], providerIds: [191] },
  { slug: 'hoopla', name: 'Hoopla', kind: 'free-library', note: 'Free with a library card', tiers: [adfree(0)], providerIds: [212] },
];

export const SERVICES: Record<Region, StreamingService[]> = { US };

/** slug → service, per region. */
export const serviceBySlug: Record<Region, Record<string, StreamingService>> = Object.fromEntries(
  Object.entries(SERVICES).map(([region, list]) => [region, Object.fromEntries(list.map((s) => [s.slug, s]))]),
);

/** TMDb provider_id → canonical slug, per region (built once from the catalog). */
export const providerIdToSlug: Record<Region, Map<number, string>> = Object.fromEntries(
  Object.entries(SERVICES).map(([region, list]) => {
    const m = new Map<number, string>();
    for (const s of list) for (const pid of s.providerIds) m.set(pid, s.slug);
    return [region, m];
  }),
);

export type TierPolicy = 'cheapest' | 'adfree';

/**
 * The monthly price to use for a service under a tier policy:
 * - 'cheapest' → the cheapest tier (often ad-supported).
 * - 'adfree'   → the ad-free tier, or `null` if the service has no ad-free tier
 *                (e.g. Tubi/Pluto) — meaning it's excluded under an ad-free filter.
 */
export function serviceMonthly(service: StreamingService, policy: TierPolicy): number | null {
  if (policy === 'adfree') {
    const t = service.tiers.find((x) => !x.ads);
    return t ? t.monthly : null;
  }
  return Math.min(...service.tiers.map((t) => t.monthly));
}
