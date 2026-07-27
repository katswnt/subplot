import { useEffect, useMemo, useState } from 'react'
import type { ImportedFilm, ImportSource } from '@subplot/domain/imports'
import { optimizeStreaming, type StreamingFilm } from '@subplot/domain/streaming'
import ImportStep from './components/ImportStep'
import OptimizerControls, { type AdPolicy, type Objective } from './components/OptimizerControls'
import ResultsStep from './components/ResultsStep'
import ReviewStep from './components/ReviewStep'
import WhereToWatch from './components/WhereToWatch'
import { resolveTitles, fetchAvailability, type PipelineProgress } from './lib/pipeline'
import { buildReviewSummary, type ReviewSummary } from '@subplot/domain/review'
import { searchTitles, type ResolveMatch, type SearchCandidate } from '@subplot/api-client'
import type { TmdbRef } from './domain/media'
import {
  loadSession,
  saveSession,
  clearSession,
  loadPrefs,
  savePrefs,
  relativeTime,
  ageInDays,
  type SavedSession,
} from './lib/session'

type Phase = 'welcome' | 'import' | 'configure' | 'working' | 'review' | 'results'
type WorkStage = 'resolving' | 'availability' | 'optimize'
type Progress = { pct: number; label: string; stage: WorkStage }

// The two network stages split the bar in half each; labels stay human.
function progressView(p: PipelineProgress): Progress {
  const frac = p.total > 0 ? p.completed / p.total : 0
  if (p.stage === 'resolving') {
    return { pct: Math.round(frac * 45), label: 'Matching your titles to the movie database…', stage: 'resolving' }
  }
  return { pct: 45 + Math.round(frac * 45), label: 'Checking where each title streams…', stage: 'availability' }
}

const WORK_STEPS: Array<{ stage: WorkStage; label: string }> = [
  { stage: 'resolving', label: 'Resolve' },
  { stage: 'availability', label: 'Availability' },
  { stage: 'optimize', label: 'Optimize' },
]

/** Price/display each film under its resolved title (or the correction the user
 *  picked), not the raw text they typed — "Sing Sing", not "sing sing". */
const applyDisplayTitles = (
  fs: ImportedFilm[],
  matches: Record<string, ResolveMatch>,
  overrides: Record<string, SearchCandidate> = {},
): ImportedFilm[] =>
  fs.map((f) => {
    const title = overrides[f.key]?.title ?? matches[f.key]?.title ?? f.title
    return title === f.title ? f : { ...f, title }
  })

export default function App() {
  // Read any device-local session synchronously so the very first render can
  // decide between the welcome screen and a fresh import (no setState-in-effect).
  const [restored, setRestored] = useState<SavedSession | null>(() => loadSession())
  const [phase, setPhase] = useState<Phase>(() => (loadSession() ? 'welcome' : 'import'))
  // One stable "now" for relative-time labels — pinned at mount, not read during
  // each render (Date.now() in render is impure).
  const [now] = useState(() => Date.now())
  const [films, setFilms] = useState<ImportedFilm[]>([])
  const [source, setSource] = useState<ImportSource>('unknown')

  // Durable preferences (services, tiers, ad policy, …) — remembered across
  // watchlists and "Start fresh", so your subscriptions come pre-selected.
  const [prefs] = useState(() => loadPrefs())

  // Optimizer controls (live-adjustable on the results screen), seeded from any
  // saved preferences so a returning visitor doesn't re-pick their services.
  const [region, setRegion] = useState(prefs?.region ?? 'US')
  const [owned, setOwned] = useState<string[]>(prefs?.owned ?? [])
  const [includeLibraryFree, setIncludeLibraryFree] = useState(prefs?.includeLibraryFree ?? true)
  const [adPolicy, setAdPolicy] = useState<AdPolicy>(prefs?.adPolicy ?? 'adfree')
  // What the recommendation optimizes for, + an optional hard budget cap ($).
  const [objective, setObjective] = useState<Objective>(prefs?.objective ?? 'value')
  const [budget, setBudget] = useState<number | null>(prefs?.budget ?? null)
  // Manual tier overrides for owned services (display-only: which tier you pay).
  const [ownedTier, setOwnedTier] = useState<Record<string, string>>(prefs?.ownedTier ?? {})
  const [editingTier, setEditingTier] = useState<string | null>(null)

  // Resolved films (the once-per-region network result). Optimization is pure,
  // so we recompute the recommendation from these on every control change.
  const [resolved, setResolved] = useState<StreamingFilm[] | null>(null)
  const [unresolved, setUnresolved] = useState(0)
  const [providerLogos, setProviderLogos] = useState<Record<number, string>>({})
  const [resolvedAt, setResolvedAt] = useState<number | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Results view: the cheapest-combo receipt, or the where-to-watch breakdown.
  const [resultsTab, setResultsTab] = useState<'combo' | 'watch'>('combo')

  // Between resolve and pricing: the uncertain-match queue + the resolve output
  // we carry across the review step so we only price what the user confirms.
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null)
  const [resolveData, setResolveData] = useState<{
    matches: Record<string, ResolveMatch>
    keyToRef: Record<string, TmdbRef>
  } | null>(null)

  const result = useMemo(() => {
    if (!resolved) return null
    return optimizeStreaming(resolved, {
      region,
      ownedServices: owned,
      objective,
      includeLibraryFree,
      tierPolicy: adPolicy === 'cheapest' ? 'cheapest' : 'adfree',
      excludeAdSupportedFree: adPolicy === 'noads',
      maxBudget: budget ?? undefined,
    })
  }, [resolved, region, owned, objective, budget, includeLibraryFree, adPolicy])

  const handleImported = (src: ImportSource, imported: ImportedFilm[]) => {
    setSource(src)
    setFilms(imported)
    setPhase('configure')
  }

  const toggleOwned = (slug: string) =>
    setOwned((prev) => {
      if (prev.includes(slug)) {
        // De-selecting clears its tier override + closes the picker.
        setOwnedTier((prevTiers) => {
          const next = { ...prevTiers }
          delete next[slug]
          return next
        })
        setEditingTier((e) => (e === slug ? null : e))
        return prev.filter((x) => x !== slug)
      }
      return [...prev, slug]
    })

  const controlProps = {
    region,
    ownedServices: owned,
    includeLibraryFree,
    adPolicy,
    objective,
    budget,
    ownedTier,
    editingTier,
    onToggleOwned: toggleOwned,
    onToggleLibrary: () => setIncludeLibraryFree((v) => !v),
    onAdPolicyChange: setAdPolicy,
    onObjectiveChange: setObjective,
    onBudgetChange: setBudget,
    onRegionChange: setRegion,
    onEditTier: (slug: string | null) => setEditingTier((e) => (e === slug ? null : slug)),
    onSetTier: (slug: string, tierId: string) => {
      setOwnedTier((prev) => ({ ...prev, [slug]: tierId }))
      setEditingTier(null)
    },
  }

  // Persist the session (list + config + last result) whenever it changes.
  // Device-local only — never sent to a server, no cookie, nothing to track.
  // films.length === 0 skips the initial (empty) render, so nothing overwrites
  // a saved session until the user actually has a list.
  useEffect(() => {
    if (films.length === 0) return
    saveSession({
      savedAt: Date.now(),
      source,
      films,
      config: { owned, region, adPolicy, objective, budget, includeLibraryFree, ownedTier },
      resolved:
        resolved && resolvedAt
          ? { streamingFilms: resolved, unresolvedCount: unresolved, providerLogos, checkedAt: resolvedAt }
          : undefined,
    })
  }, [
    films,
    source,
    owned,
    region,
    adPolicy,
    objective,
    budget,
    includeLibraryFree,
    ownedTier,
    resolved,
    unresolved,
    providerLogos,
    resolvedAt,
  ])

  // Persist the optimizer preferences on their own, independent of any list —
  // so services/tiers/ad policy come pre-selected on the next visit and survive
  // "Start fresh". Unlike the session effect, this runs even with no films.
  useEffect(() => {
    savePrefs({ owned, region, adPolicy, objective, budget, includeLibraryFree, ownedTier })
  }, [owned, region, adPolicy, objective, budget, includeLibraryFree, ownedTier])

  // Resume a saved session: rehydrate everything and jump to the freshest phase.
  const resumeSaved = () => {
    if (!restored) return
    const { config, resolved: cached } = restored
    setSource(restored.source)
    setFilms(restored.films)
    setOwned(config.owned)
    setRegion(config.region)
    setAdPolicy(config.adPolicy)
    setObjective(config.objective)
    setBudget(config.budget)
    setIncludeLibraryFree(config.includeLibraryFree)
    setOwnedTier(config.ownedTier)
    if (cached) {
      setResolved(cached.streamingFilms)
      setUnresolved(cached.unresolvedCount)
      setProviderLogos(cached.providerLogos)
      setResolvedAt(cached.checkedAt)
      setPhase('results')
    } else {
      setPhase('configure')
    }
    setRestored(null)
  }

  // Stage 2 + reveal: price the confirmed films and show the receipt.
  const priceAndReveal = async (keptFilms: ImportedFilm[], keyToRef: Record<string, TmdbRef>) => {
    setError(null)
    setProgress({ pct: 45, label: 'Checking where each title streams…', stage: 'availability' })
    setPhase('working')
    const outcome = await fetchAvailability(keptFilms, keyToRef, region, (p) => setProgress(progressView(p)))
    if (!outcome.ok) {
      setError(outcome.error)
      setProgress(null)
      setPhase('configure')
      return
    }
    // The optimize step is instant (pure, in useMemo) — flash it, then reveal.
    setProgress({ pct: 100, label: 'Finding your cheapest combo…', stage: 'optimize' })
    setResolved(outcome.streamingFilms)
    setUnresolved(outcome.unresolvedCount)
    setProviderLogos(outcome.providerLogos)
    setResolvedAt(Date.now())
    await new Promise((r) => setTimeout(r, 350))
    setProgress(null)
    setPhase('results')
  }

  const run = async () => {
    // Already resolved (returning from Plans) → recompute is instant, no re-fetch.
    if (resolved) {
      setPhase('results')
      return
    }
    setError(null)
    setProgress({ pct: 0, label: 'Reading your watchlist…', stage: 'resolving' })
    setPhase('working')
    // Stage 1 — resolve titles to TMDb refs + display info.
    const titles = await resolveTitles(films, (p) => setProgress(progressView(p)))
    if (!titles.ok) {
      setError(titles.error)
      setProgress(null)
      setPhase('configure')
      return
    }
    setResolveData({ matches: titles.matches, keyToRef: titles.keyToRef })
    // Score every match; only the uncertain ones become a review queue.
    const summary = buildReviewSummary(
      films.map((f) => {
        const m = titles.matches[f.key]
        return {
          key: f.key,
          importedTitle: f.title,
          importedYear: f.year || undefined,
          // An imdb id OR an authoritative Letterboxd-page match is trusted as-is
          // (no fuzzy re-scoring) — the resolver already used the exact TMDb id.
          hadId: Boolean(f.imdbId) || Boolean(m?.trusted),
          match: m ? { title: m.title, year: m.year } : null,
        }
      }),
    )
    // Nothing uncertain → skip review entirely, price everything.
    if (summary.flagged.length === 0) {
      await priceAndReveal(applyDisplayTitles(films, titles.matches), titles.keyToRef)
      return
    }
    setReviewSummary(summary)
    setProgress(null)
    setPhase('review')
  }

  // Free-text search for the review "find the right one" picker.
  const searchForTitle = async (query: string): Promise<SearchCandidate[]> => {
    const r = await searchTitles(
      { baseUrl: typeof window !== 'undefined' ? window.location.origin : '' },
      query,
    )
    return r.ok ? r.data.candidates : []
  }

  // From the review step: drop the skipped keys, fold in user-picked matches
  // (which give real refs to previously-unmatched titles), then price the rest.
  const confirmReview = async (
    excludedKeys: string[],
    overrides: Record<string, SearchCandidate>,
  ) => {
    if (!resolveData) return
    const keyToRef: Record<string, TmdbRef> = { ...resolveData.keyToRef }
    for (const [key, cand] of Object.entries(overrides)) {
      keyToRef[key] = { mediaType: cand.mediaType, id: cand.id }
    }
    const excluded = new Set(excludedKeys)
    const kept = films.filter((f) => !excluded.has(f.key))
    await priceAndReveal(applyDisplayTitles(kept, resolveData.matches, overrides), keyToRef)
  }

  const startOver = () => {
    // Clears the list + result, NOT the service preferences — those are durable
    // (savePrefs keeps them) so a new watchlist starts with your services set.
    clearSession()
    setRestored(null)
    setResolvedAt(null)
    setPhase('import')
    setFilms([])
    setResolved(null)
    setReviewSummary(null)
    setResolveData(null)
    setError(null)
    setEditingTier(null)
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        background: 'radial-gradient(900px 520px at 50% -8%, #1a1810 0%, #0c0b08 62%)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 472, padding: '40px 22px 90px' }}>
        {/* Persistent brand bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 30,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <img src="/favicon.svg" alt="" width={19} height={19} />
            SUBPLOT
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: phase === 'import' ? 22 : 16 }}>
          {phase === 'welcome' && restored && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                background: 'var(--surface-card)',
                border: '1px solid var(--raised)',
                borderRadius: 16,
                padding: '22px 20px',
              }}
            >
              <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dimmer)' }}>
                Welcome back
              </p>
              <p style={{ margin: 0, fontSize: 15.5, color: 'var(--text)' }}>
                You have <strong>{restored.films.length}</strong>{' '}
                {restored.films.length === 1 ? 'title' : 'titles'} saved on this device
                {restored.resolved ? (
                  <>
                    {' '}— last checked{' '}
                    <span style={{ color: 'var(--text-muted)' }}>{relativeTime(restored.resolved.checkedAt, now)}</span>.
                  </>
                ) : (
                  <>
                    {' '}from{' '}
                    {restored.source === 'imdb' ? 'IMDb' : restored.source === 'plaintext' ? 'your list' : 'Letterboxd'}.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={resumeSaved}
                  style={{
                    background: 'var(--lime)',
                    color: 'var(--on-lime)',
                    border: 'none',
                    borderRadius: 999,
                    padding: '12px 22px',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 700,
                    fontSize: 14.5,
                    cursor: 'pointer',
                  }}
                >
                  {restored.resolved ? 'Show my results →' : 'Pick up where I left off →'}
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  style={{
                    background: 'none',
                    border: '1px solid var(--raised)',
                    borderRadius: 999,
                    padding: '12px 20px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 14.5,
                    cursor: 'pointer',
                  }}
                >
                  Start fresh
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dimmer)' }}>
                Saved only on this device — nothing is sent to a server.
              </p>
            </div>
          )}

          {phase === 'import' && <ImportStep onImported={handleImported} />}

          {phase === 'configure' && (
            <>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
            Imported <strong style={{ color: 'var(--text)' }}>{films.length}</strong> titles from{' '}
            {source === 'imdb' ? 'IMDb' : source === 'plaintext' ? 'your list' : 'Letterboxd'}.{' '}
            <button
              type="button"
              onClick={startOver}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--amber)',
                fontSize: 13.5,
                textDecoration: 'underline',
                textDecorationStyle: 'dotted',
              }}
            >
              change
            </button>
          </p>
          <OptimizerControls {...controlProps} showRegion />
          <button
            type="button"
            onClick={run}
            style={{
              background: 'var(--lime)',
              color: 'var(--on-lime)',
              border: 'none',
              borderRadius: 999,
              padding: '14px 24px',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 15.5,
              cursor: 'pointer',
            }}
          >
            Find my cheapest combo →
          </button>
          {error && (
            <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.9rem', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'review' && reviewSummary && resolveData && (
        <ReviewStep
          flagged={reviewSummary.flagged}
          matches={resolveData.matches}
          importedTitleByKey={Object.fromEntries(films.map((f) => [f.key, f.title]))}
          confidentCount={reviewSummary.confidentCount}
          onSearch={searchForTitle}
          onConfirm={confirmReview}
          onBack={() => {
            setReviewSummary(null)
            setPhase('configure')
          }}
        />
      )}

      {phase === 'working' && progress && (
        <div style={{ padding: '24px 0' }} role="status" aria-live="polite">
          {/* Staged stepper */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {WORK_STEPS.map((step, i) => {
              const activeIdx = WORK_STEPS.findIndex((s) => s.stage === progress.stage)
              const done = i < activeIdx
              const active = i === activeIdx
              return (
                <div key={step.stage} style={{ flex: 1 }}>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 999,
                      background: done || active ? 'var(--lime)' : 'var(--raised)',
                      opacity: active ? 1 : done ? 0.6 : 1,
                    }}
                  />
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      letterSpacing: '0.06em',
                      color: active ? 'var(--lime)' : 'var(--text-dim)',
                    }}
                  >
                    {i + 1} · {step.label}
                  </p>
                </div>
              )
            })}
          </div>

          <div style={{ height: 8, borderRadius: 999, background: 'var(--raised)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress.pct}%`,
                background: 'var(--lime)',
                borderRadius: 999,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <p style={{ margin: '12px 0 0', color: 'var(--text-2)', fontSize: 14 }}>
            {progress.label} <span style={{ color: 'var(--text-dim)' }}>{progress.pct}%</span>
          </p>
          <p style={{ margin: '8px 0 0', color: 'var(--text-dimmer)', fontSize: 12.5, lineHeight: 1.5 }}>
            A big library can take 30–60s the first time as we look up every film. Repeat runs are cached and
            near-instant.
          </p>
        </div>
      )}

      {phase === 'results' && result && (
        <>
          {/* Two lenses on the same result: what to subscribe to (receipt) vs.
              where each title streams now. */}
          <div
            role="tablist"
            aria-label="Results view"
            style={{ display: 'flex', gap: 6, background: 'var(--raised)', padding: 4, borderRadius: 999 }}
          >
            {([
              ['combo', '💸 Cheapest combo'],
              ['watch', '📺 Where to watch'],
            ] as const).map(([tab, label]) => {
              const active = resultsTab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setResultsTab(tab)}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 999,
                    padding: '9px 14px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13.5,
                    fontWeight: 700,
                    background: active ? 'var(--lime)' : 'transparent',
                    color: active ? 'var(--on-lime)' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p
            style={{
              margin: '2px 0 2px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-dimmer)',
            }}
          >
            {resultsTab === 'combo'
              ? 'the cheapest plans to cover your list — tap “Where to watch” for what’s streaming now ↑'
              : 'what’s on your services now — tap “Cheapest combo” for the best plans to add ↑'}
          </p>
          {resolvedAt && (
            <p
              style={{
                margin: '0 0 2px',
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--text-dimmer)',
              }}
            >
              streaming checked {relativeTime(resolvedAt, now)}
              {ageInDays(resolvedAt, now) >= 1 && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={run}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--amber)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                    }}
                  >
                    refresh
                  </button>
                </>
              )}
            </p>
          )}

          {resultsTab === 'watch' ? (
            <WhereToWatch films={resolved ?? []} owned={owned} region={region} providerLogos={providerLogos} />
          ) : (
            <ResultsStep
              result={result}
              adPolicy={adPolicy}
              region={region}
              ownedTier={ownedTier}
              unresolvedCount={unresolved}
              onStartOver={startOver}
            />
          )}
          <details open style={{ marginTop: 4 }}>
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                color: 'var(--lime)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.14em',
              }}
            >
              ADJUST · UPDATES LIVE
            </summary>
            <div style={{ marginTop: 16 }}>
              <OptimizerControls {...controlProps} compact />
              <button
                type="button"
                onClick={() => setPhase('configure')}
                style={{
                  marginTop: 14,
                  background: 'transparent',
                  border: '1px solid rgba(255,179,0,0.4)',
                  borderRadius: 999,
                  padding: '9px 16px',
                  cursor: 'pointer',
                  color: 'var(--amber)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Plans → edit owned services &amp; tiers
              </button>
            </div>
          </details>
        </>
      )}
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 40,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-faint)',
          }}
        >
          Built by{' '}
          <a
            href="https://katswint.com"
            target="_blank"
            rel="me author noopener noreferrer"
            style={{ color: 'var(--amber)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
          >
            Kat Swint
          </a>{' '}
          with a little help from Claude Code and Codex
        </p>
      </div>
    </div>
  )
}
