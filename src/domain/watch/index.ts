/**
 * Subplot — "where can I watch it" builder (pure, dependency-free).
 *
 * The everyday-utility view: instead of googling "[title] streaming" one by
 * one, show the whole watchlist at once — what's on the services you already
 * have (or free), and where each individual title streams. Reuses the catalog's
 * provider-id → canonical-service folding; no new network (the pipeline already
 * fetched each title's providerIds).
 */
import type { StreamingFilm } from '../streaming/index.js';
import { providerIdToSlug, serviceBySlug, type ServiceKind } from '../streaming/catalog.js';

export type WatchService = {
  slug: string;
  name: string;
  kind: ServiceKind;
  /** TMDb provider logo path (e.g. "/abc.jpg") when available, else null. */
  logoPath: string | null;
};

export type WatchTitle = {
  key: string;
  title: string;
  /** Canonical services this title streams on (deduped; yours/free first). */
  services: WatchService[];
  /** On a service you own, or a free one → watchable right now, no new sub. */
  onYourServices: boolean;
  /** Streams somewhere on a subscription/free service (even if not yours). */
  streamingSomewhere: boolean;
};

export type WatchServiceGroup = {
  slug: string;
  name: string;
  kind: ServiceKind;
  logoPath: string | null;
  owned: boolean;
  titles: Array<{ key: string; title: string }>;
};

export type WatchNow = {
  /** Every title with the services it streams on. */
  titles: WatchTitle[];
  /** Titles watchable now (on an owned or free service). */
  onYourServicesCount: number;
  /** Grouped by service for the "what's on your services" view — owned + free
   *  services that carry ≥1 title, owned first then by count. */
  yourServiceGroups: WatchServiceGroup[];
  /** Streams somewhere, but only on services you'd have to add. */
  notOnYoursCount: number;
  /** Not streaming on any subscription/free service we track. */
  nowhereCount: number;
};

/** Free services are watchable without a new subscription; owned paid ones too. */
const yoursFor = (owned: Set<string>) => (svc: WatchService): boolean =>
  svc.kind !== 'paid' || owned.has(svc.slug);

/**
 * Turn priced films into the "where to watch" model: per-title services, plus
 * a by-service grouping of what's on the user's current (owned + free) services.
 */
export function buildWatchNow(
  films: StreamingFilm[],
  ownedSlugs: string[],
  region = 'US',
  /** TMDb providerId → logo path, captured live from watch-providers. */
  providerLogos: Record<number, string> = {},
): WatchNow {
  const idToSlug = providerIdToSlug[region] ?? new Map<number, string>();
  const bySlug = serviceBySlug[region] ?? {};
  const owned = new Set(ownedSlugs);
  const isYours = yoursFor(owned);
  // A service folds many provider ids; use the logo of whichever variant has one.
  const logoFor = (ids: number[]): string | null =>
    ids.map((id) => providerLogos[id]).find(Boolean) ?? null;

  const titles: WatchTitle[] = films.map((f) => {
    const slugs = new Set<string>();
    for (const pid of f.providerIds) {
      const slug = idToSlug.get(pid);
      if (slug) slugs.add(slug);
    }
    const services: WatchService[] = [...slugs]
      .map((slug) => bySlug[slug])
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ slug: s.slug, name: s.name, kind: s.kind, logoPath: logoFor(s.providerIds) }));
    services.sort(
      (a, b) => Number(isYours(b)) - Number(isYours(a)) || a.name.localeCompare(b.name),
    );
    return {
      key: f.key,
      title: f.title,
      services,
      onYourServices: services.some(isYours),
      streamingSomewhere: services.length > 0,
    };
  });

  // Group titles under each owned/free service that carries them.
  const groups = new Map<string, WatchServiceGroup>();
  for (const t of titles) {
    for (const svc of t.services) {
      if (!isYours(svc)) continue;
      let g = groups.get(svc.slug);
      if (!g) {
        g = {
          slug: svc.slug,
          name: svc.name,
          kind: svc.kind,
          logoPath: svc.logoPath,
          owned: owned.has(svc.slug),
          titles: [],
        };
        groups.set(svc.slug, g);
      }
      g.titles.push({ key: t.key, title: t.title });
    }
  }
  const yourServiceGroups = [...groups.values()].sort(
    (a, b) =>
      Number(b.owned) - Number(a.owned) ||
      b.titles.length - a.titles.length ||
      a.name.localeCompare(b.name),
  );

  return {
    titles,
    onYourServicesCount: titles.filter((t) => t.onYourServices).length,
    yourServiceGroups,
    notOnYoursCount: titles.filter((t) => t.streamingSomewhere && !t.onYourServices).length,
    nowhereCount: titles.filter((t) => !t.streamingSomewhere).length,
  };
}
