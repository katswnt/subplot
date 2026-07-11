# Subplot — roadmap

MVP (shipped): import a Letterboxd/IMDb watchlist → cheapest combination of
subscription services that covers the most of it, on free TMDb `watch/providers`
data + a maintained US `SUBSCRIPTION_PRICES` table. Optimizer is a greedy
marginal path (each service unlocks the most new films; overlap counted once)
with a recommended "knee," plus orphans (films on no tracked subscription).

## V2

- **Tier filter — ad-free vs ad-supported (and HD/4K).** Today `SUBSCRIPTION_PRICES`
  holds one price per service (the standard, usually ad-supported tier). Some
  users only want no-ads pricing. Model each service as multiple tiers
  `{ label, monthly, ads, maxQuality }` and let the user filter which tiers are
  eligible; the optimizer runs over the selected tier per service.
- **More services, including free ones.** We're missing a lot — notably the free
  / library-backed tiers: **Kanopy** and **Hoopla** ($0 with a library card),
  **Tubi**, **Pluto TV**, **Peacock free**, etc. Free services are always worth
  adding (cost 0), so they should be surfaced as "you can already watch N of
  these for free" and folded into coverage before any paid combo. Also expand
  paid coverage (Fubo, Philo, regional services) and add non-US regions (which
  then un-hides the region selector).
- **Budget mode.** Instead of a $/film knee, let the user say **"my streaming
  budget is $X/mo"** or **"I can add $20 to my budget"** and maximize coverage
  within that ceiling (a budget-constrained set cover — the dual of the current
  knee). Pairs naturally with owned-services (the remaining budget).

## V3

- **Rent break-even.** *"How many movies do I have to watch on this service to
  make it cheaper than renting them individually?"* Given a service's monthly
  price and the average rent price of the films it covers, break-even =
  `monthly / avgRentPrice` films/month. Show it per service ("Criterion pays for
  itself if you watch ≥3 of your list a month vs renting"). Needs per-film
  rent/buy prices — the **Streaming Availability API** (also unlocks the disabled
  4K/audio toggles). The API's response types already leave room for `rent`/`buy`.

## Done

- Progress indicator — determinate two-phase bar (matching → availability),
  driven by real batch completion, so large watchlists (1,500+ films) never look
  frozen during the ~30–60s first run.
- Batched resolve/watch-providers so any watchlist size works (was capped at 600).
- Greedy marginal path so services never repeat in the "each service you add" list.
