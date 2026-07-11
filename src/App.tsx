import { useState } from 'react'
import type { ImportedFilm, ImportSource } from '@letterboxd-wrappd/domain/imports'
import type { StreamingResult } from '@letterboxd-wrappd/domain/streaming'
import ImportStep from './components/ImportStep'
import ConfigureStep from './components/ConfigureStep'
import ResultsStep from './components/ResultsStep'
import { runOptimization, type PipelineProgress } from './lib/pipeline'

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
  const [region, setRegion] = useState('US')
  const [owned, setOwned] = useState<string[]>([])
  const [includeLibraryFree, setIncludeLibraryFree] = useState(true)
  const [maxServices, setMaxServices] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StreamingResult | null>(null)
  const [unresolved, setUnresolved] = useState(0)

  const handleImported = (src: ImportSource, imported: ImportedFilm[]) => {
    setSource(src)
    setFilms(imported)
    setPhase('configure')
  }

  const toggleOwned = (slug: string) =>
    setOwned((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]))

  const run = async () => {
    setRunning(true)
    setError(null)
    setProgress({ pct: 0, label: 'Reading your watchlist…' })
    const outcome = await runOptimization(
      films,
      { region, ownedServices: owned, maxServices: maxServices ?? undefined, includeLibraryFree },
      (p) => setProgress(progressView(p)),
    )
    setRunning(false)
    setProgress(null)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setResult(outcome.result)
    setUnresolved(outcome.unresolvedCount)
    setPhase('results')
  }

  const startOver = () => {
    setPhase('import')
    setFilms([])
    setResult(null)
    setError(null)
    setOwned([])
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '3rem 1.25rem 4rem',
      }}
    >
      <header style={{ textAlign: 'center', maxWidth: 640 }}>
        <p
          style={{
            color: 'var(--accent)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '0.8rem',
            margin: 0,
          }}
        >
          Subplot
        </p>
        <h1 style={{ fontSize: '2rem', lineHeight: 1.1, margin: '0.4rem 0 0.5rem' }}>
          The cheapest way to watch your watchlist
        </h1>
        {phase === 'import' && (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Import your Letterboxd or IMDb watchlist and we&rsquo;ll find the lowest-cost combination of
            streaming subscriptions that covers the most of it.
          </p>
        )}
      </header>

      {phase === 'import' && <ImportStep onImported={handleImported} />}

      {phase === 'configure' && (
        <>
          <ConfigureStep
            filmCount={films.length}
            source={source}
            region={region}
            ownedServices={owned}
            maxServices={maxServices}
            includeLibraryFree={includeLibraryFree}
            running={running}
            onToggleOwned={toggleOwned}
            onToggleLibrary={() => setIncludeLibraryFree((v) => !v)}
            onRegionChange={setRegion}
            onMaxServicesChange={setMaxServices}
            onRun={run}
          />
          {progress && (
            <div style={{ width: '100%', maxWidth: 640 }} role="status" aria-live="polite">
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--surface-raised)',
                  overflow: 'hidden',
                }}
              >
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
        <ResultsStep result={result} unresolvedCount={unresolved} onStartOver={startOver} />
      )}
    </main>
  )
}
