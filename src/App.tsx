import { useState } from 'react'
import type { ImportedFilm, ImportSource, StreamingResult } from '@letterboxd-wrappd/domain'
import ImportStep from './components/ImportStep'
import ConfigureStep from './components/ConfigureStep'
import ResultsStep from './components/ResultsStep'
import { runOptimization } from './lib/pipeline'

type Phase = 'import' | 'configure' | 'results'

export default function App() {
  const [phase, setPhase] = useState<Phase>('import')
  const [films, setFilms] = useState<ImportedFilm[]>([])
  const [source, setSource] = useState<ImportSource>('unknown')
  const [region, setRegion] = useState('US')
  const [owned, setOwned] = useState<number[]>([])
  const [maxServices, setMaxServices] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StreamingResult | null>(null)
  const [unresolved, setUnresolved] = useState(0)

  const handleImported = (src: ImportSource, imported: ImportedFilm[]) => {
    setSource(src)
    setFilms(imported)
    setPhase('configure')
  }

  const toggleOwned = (id: number) =>
    setOwned((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const run = async () => {
    setRunning(true)
    setError(null)
    const outcome = await runOptimization(films, {
      region,
      ownedServices: owned,
      maxServices: maxServices ?? undefined,
    })
    setRunning(false)
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
            running={running}
            onToggleOwned={toggleOwned}
            onRegionChange={setRegion}
            onMaxServicesChange={setMaxServices}
            onRun={run}
          />
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
