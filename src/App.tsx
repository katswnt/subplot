import { useMemo, useState } from 'react'
import type { ImportedFilm, ImportSource } from '@letterboxd-wrappd/domain/imports'
import { optimizeStreaming, type StreamingFilm } from '@letterboxd-wrappd/domain/streaming'
import ImportStep from './components/ImportStep'
import OptimizerControls, { type AdPolicy } from './components/OptimizerControls'
import ResultsStep from './components/ResultsStep'
import { resolveWatchlist, type PipelineProgress } from './lib/pipeline'

type Phase = 'import' | 'configure' | 'results'

// The two network stages split the bar in half each; labels stay human.
function progressView(p: PipelineProgress): { pct: number; label: string } {
  const frac = p.total > 0 ? p.completed / p.total : 0
  if (p.stage === 'resolving') {
    return { pct: Math.round(frac * 50), label: 'Matching your films to the movie database…' }
  }
  return { pct: 50 + Math.round(frac * 50), label: 'Checking where each film streams…' }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('import')
  const [films, setFilms] = useState<ImportedFilm[]>([])
  const [source, setSource] = useState<ImportSource>('unknown')

  // Optimizer controls (live-adjustable on the results screen).
  const [region, setRegion] = useState('US')
  const [owned, setOwned] = useState<string[]>([])
  const [includeLibraryFree, setIncludeLibraryFree] = useState(true)
  const [adPolicy, setAdPolicy] = useState<AdPolicy>('cheapest')
  const [budget, setBudget] = useState<number | null>(null)
  const [maxServices, setMaxServices] = useState<number | null>(null)

  // Resolved films (the once-per-region network result). Optimization is pure,
  // so we recompute the recommendation from these on every control change.
  const [resolved, setResolved] = useState<StreamingFilm[] | null>(null)
  const [unresolved, setUnresolved] = useState(0)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(() => {
    if (!resolved) return null
    return optimizeStreaming(resolved, {
      region,
      ownedServices: owned,
      maxServices: maxServices ?? undefined,
      includeLibraryFree,
      tierPolicy: adPolicy === 'cheapest' ? 'cheapest' : 'adfree',
      excludeAdSupportedFree: adPolicy === 'noads',
      maxBudget: budget ?? undefined,
    })
  }, [resolved, region, owned, maxServices, includeLibraryFree, adPolicy, budget])

  const handleImported = (src: ImportSource, imported: ImportedFilm[]) => {
    setSource(src)
    setFilms(imported)
    setPhase('configure')
  }

  const toggleOwned = (slug: string) =>
    setOwned((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]))

  const controlProps = {
    region,
    ownedServices: owned,
    includeLibraryFree,
    adPolicy,
    budget,
    maxServices,
    onToggleOwned: toggleOwned,
    onToggleLibrary: () => setIncludeLibraryFree((v) => !v),
    onAdPolicyChange: setAdPolicy,
    onBudgetChange: setBudget,
    onMaxServicesChange: setMaxServices,
    onRegionChange: setRegion,
  }

  const run = async () => {
    setRunning(true)
    setError(null)
    setProgress({ pct: 0, label: 'Reading your watchlist…' })
    const outcome = await resolveWatchlist(films, region, (p) => setProgress(progressView(p)))
    setRunning(false)
    setProgress(null)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setResolved(outcome.streamingFilms)
    setUnresolved(outcome.unresolvedCount)
    setPhase('results')
  }

  const startOver = () => {
    setPhase('import')
    setFilms([])
    setResolved(null)
    setError(null)
    setOwned([])
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
            }}
          >
            <span style={{ color: 'var(--lime)' }}>◐</span> SUBPLOT
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.16em',
              color: 'var(--amber)',
              border: '1px solid rgba(255,179,0,0.4)',
              borderRadius: 999,
              padding: '3px 9px',
            }}
          >
            BETA
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: phase === 'import' ? 22 : 16 }}>
          {phase === 'import' && <ImportStep onImported={handleImported} />}

          {phase === 'configure' && (
            <>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Imported <strong style={{ color: 'var(--text)' }}>{films.length}</strong> films from {source}.
          </p>
          <OptimizerControls {...controlProps} showRegion />
          <button
            type="button"
            onClick={run}
            disabled={running}
            style={{
              background: running ? 'var(--surface-raised)' : 'var(--accent)',
              color: running ? 'var(--text-muted)' : '#1a1205',
              border: 'none',
              borderRadius: 999,
              padding: '0.75rem 1.5rem',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: running ? 'wait' : 'pointer',
            }}
          >
            {running ? 'Crunching your watchlist…' : 'Find my cheapest combo'}
          </button>
          {progress && (
            <div style={{ width: '100%', maxWidth: 640 }} role="status" aria-live="polite">
              <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-raised)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress.pct}%`,
                    background: 'var(--accent)',
                    borderRadius: 999,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {progress.label} {progress.pct}%
              </p>
            </div>
          )}
          {error && (
            <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.9rem', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'results' && result && (
        <>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
            Tweak anything below — results update instantly, no re-upload.
          </p>
          <OptimizerControls {...controlProps} />
          <ResultsStep result={result} unresolvedCount={unresolved} onStartOver={startOver} />
        </>
      )}
        </div>
      </div>
    </div>
  )
}
