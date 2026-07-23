import { useMemo, useState } from 'react'
import type { ImportedFilm, ImportSource } from '@subplot/domain/imports'
import { optimizeStreaming, type StreamingFilm } from '@subplot/domain/streaming'
import ImportStep from './components/ImportStep'
import OptimizerControls, { type AdPolicy, type Objective } from './components/OptimizerControls'
import ResultsStep from './components/ResultsStep'
import { resolveWatchlist, type PipelineProgress } from './lib/pipeline'

type Phase = 'import' | 'configure' | 'working' | 'results'
type WorkStage = 'resolving' | 'availability' | 'optimize'
type Progress = { pct: number; label: string; stage: WorkStage }

// The two network stages split the bar in half each; labels stay human.
function progressView(p: PipelineProgress): Progress {
  const frac = p.total > 0 ? p.completed / p.total : 0
  if (p.stage === 'resolving') {
    return { pct: Math.round(frac * 45), label: 'Matching your films to the movie database…', stage: 'resolving' }
  }
  return { pct: 45 + Math.round(frac * 45), label: 'Checking where each film streams…', stage: 'availability' }
}

const WORK_STEPS: Array<{ stage: WorkStage; label: string }> = [
  { stage: 'resolving', label: 'Resolve' },
  { stage: 'availability', label: 'Availability' },
  { stage: 'optimize', label: 'Optimize' },
]

export default function App() {
  const [phase, setPhase] = useState<Phase>('import')
  const [films, setFilms] = useState<ImportedFilm[]>([])
  const [source, setSource] = useState<ImportSource>('unknown')

  // Optimizer controls (live-adjustable on the results screen).
  const [region, setRegion] = useState('US')
  const [owned, setOwned] = useState<string[]>([])
  const [includeLibraryFree, setIncludeLibraryFree] = useState(true)
  const [adPolicy, setAdPolicy] = useState<AdPolicy>('adfree')
  // What the recommendation optimizes for, + an optional hard budget cap ($).
  const [objective, setObjective] = useState<Objective>('value')
  const [budget, setBudget] = useState<number | null>(null)
  // Manual tier overrides for owned services (display-only: which tier you pay).
  const [ownedTier, setOwnedTier] = useState<Record<string, string>>({})
  const [editingTier, setEditingTier] = useState<string | null>(null)

  // Resolved films (the once-per-region network result). Optimization is pure,
  // so we recompute the recommendation from these on every control change.
  const [resolved, setResolved] = useState<StreamingFilm[] | null>(null)
  const [unresolved, setUnresolved] = useState(0)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const run = async () => {
    // Already resolved (returning from Plans) → recompute is instant, no re-fetch.
    if (resolved) {
      setPhase('results')
      return
    }
    setError(null)
    setProgress({ pct: 0, label: 'Reading your watchlist…', stage: 'resolving' })
    setPhase('working')
    const outcome = await resolveWatchlist(films, region, (p) => setProgress(progressView(p)))
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
    await new Promise((r) => setTimeout(r, 350))
    setProgress(null)
    setPhase('results')
  }

  const startOver = () => {
    setPhase('import')
    setFilms([])
    setResolved(null)
    setError(null)
    setOwned([])
    setOwnedTier({})
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
          {phase === 'import' && <ImportStep onImported={handleImported} />}

          {phase === 'configure' && (
            <>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
            Imported <strong style={{ color: 'var(--text)' }}>{films.length}</strong> films from{' '}
            {source === 'imdb' ? 'IMDb' : 'Letterboxd'}.{' '}
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
          <ResultsStep
            result={result}
            adPolicy={adPolicy}
            region={region}
            ownedTier={ownedTier}
            unresolvedCount={unresolved}
            onStartOver={startOver}
          />
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
