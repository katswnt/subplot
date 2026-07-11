# Subplot — roadmap

MVP (shipped): import a Letterboxd/IMDb watchlist → cheapest combination of
subscription services that covers the most of it, on free TMDb `watch/providers`
data + a maintained US `SUBSCRIPTION_PRICES` table. Optimizer is a greedy
marginal path (each service unlocks the most new films; overlap counted once)
with a recommended "knee," plus orphans (films on no tracked subscription).

## V3 (next)

- **Rent break-even.** *"How many movies do I have to watch on this service to
  make it cheaper than renting them individually?"* Given a service's monthly
  price and the average rent price of the films it covers, break-even =
  `monthly / avgRentPrice` films/month. Show it per service ("Criterion pays for
  itself if you watch ≥3 of your list a month vs renting"). Needs per-film
  rent/buy prices — the **Streaming Availability API** (also unlocks the disabled
  4K/audio toggles). The API's response types already leave room for `rent`/`buy`.
- **More coverage & regions.** Add remaining niche subscriptions (Fubo, Philo,
  Cineverse, Screambox…) so fewer films are orphaned, and non-US regions (which
  un-hides the region selector).
- **HD/4K + audio filter.** Real per-offer quality/audio (Streaming Availability
  API) to power the "coming soon" 4K/HDR/Atmos chips.

## Done

### V2 — canonical catalog, free services, tier filter, budget mode
- **Canonical service catalog** (`streaming/catalog.ts`): folds every TMDb
  provider-id variant (pricing tiers + resold channels) into one slug, fixing a
  coverage-undercount bug (e.g. "Paramount Plus Premium" 2303 was orphaning).
- **Free services** — Kanopy/Hoopla (library card) + Tubi/Pluto/Freevee/Roku/Plex
  (ads), surfaced in a separate "Free" section; the endpoint now reads TMDb's
  `free`/`ads` buckets, not just `flatrate`. Library-card toggle gates Kanopy/Hoopla.
- **Ad-free tier filter** — "Ad-free pricing only" prices each service's ad-free
  tier and drops always-ads services.
- **Budget mode** — "Monthly budget $X" picks the richest affordable combo from
  the exact Pareto frontier (not a greedy prefix).

### Earlier
- Progress indicator — determinate two-phase bar (matching → availability),
  driven by real batch completion, so large watchlists (1,500+ films) never look
  frozen during the ~30–60s first run.
- Batched resolve/watch-providers so any watchlist size works (was capped at 600).
- Greedy marginal path so services never repeat in the "each service you add" list.
