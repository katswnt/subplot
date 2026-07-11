# Subplot

**The cheapest way to watch your watchlist.**

Import your Letterboxd or IMDb watchlist and Subplot computes the lowest-cost
combination of streaming subscriptions that covers the most of it — with toggles
for your region, the services you already pay for, and a cap on how many to add.

A standalone app spun out of [Letterbddy](../../README.md), sharing its pure
workspace packages. Deployed as its own Vercel project (own function budget).

## How it works

1. **Import** — drop a Letterboxd or IMDb watchlist CSV (source auto-detected by
   `@letterboxd-wrappd/domain`'s `parseWatchlist`).
2. **Resolve** — `api/resolve.ts` maps each film to a TMDb id (IMDb tconst via
   TMDb `/find`, title-only via `/search`), Redis-cached.
3. **Availability** — `api/watch-providers.ts` fetches each film's subscription
   (`flatrate`) providers per region from TMDb `watch/providers`, Redis-cached
   under a `subplot:` key namespace.
4. **Optimize** — `optimizeStreaming` runs a weighted min-cost set-cover over the
   priced services (`SUBSCRIPTION_PRICES`), returning the cost-vs-coverage Pareto
   frontier, a recommended "knee" combo, and the orphans (films on no tracked
   subscription).

Streaming availability data by **JustWatch**, surfaced via TMDb.

## Scope

MVP is the subscription-combo optimizer on free TMDb data + a maintained price
table. 4K/HDR/audio toggles and rent/buy pricing are a designed-for V2 (Streaming
Availability API).

## Develop

```bash
npm install                 # from the repo root (workspaces)
npm run dev --workspace @letterboxd-wrappd/streaming   # Vite dev server
```

Env (Vercel project or `.env` for local API): `TMDB_API_KEY`, `REDIS_URL`.

## Deploy

Own Vercel project `subplot` (rootDirectory `apps/streaming`, framework Vite),
git-connected to this repo → auto-deploys on push to `main`. Domain:
`subplot.katswint.com`.
