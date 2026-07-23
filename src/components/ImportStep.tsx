import { useRef, useState } from 'react'
import { parseWatchlist, type ImportSource, type ImportedFilm } from '@subplot/domain/imports'

type Props = {
  onImported: (source: ImportSource, films: ImportedFilm[]) => void
}

const monoLink: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  color: 'var(--text-2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'none',
  border: 'none',
  padding: 0,
}

export default function ImportStep({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const ingest = (text: string) => {
    const { source, films } = parseWatchlist(text)
    if (source === 'unknown' || films.length === 0) {
      setError(
        "That doesn't look like a Letterboxd or IMDb watchlist export. Make sure you're uploading the CSV file.",
      )
      return
    }
    setError(null)
    onImported(source, films)
  }

  const handleFile = async (file: File) => {
    setError(null)
    ingest(await file.text())
  }

  const loadSample = async () => {
    setError(null)
    setLoadingSample(true)
    try {
      const res = await fetch('/sample-watchlist.csv')
      ingest(await res.text())
    } catch {
      setError('Could not load the sample watchlist. Try uploading your own CSV.')
    } finally {
      setLoadingSample(false)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 33,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
          }}
        >
          The cheapest way to watch your watchlist.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>
          Drop your export. Subplot prices every film against the services you can actually subscribe to,
          then finds the lowest-cost combination that covers the most of it.
        </p>
      </div>

      {/* Ticket dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--lime)' : 'rgba(198,255,61,0.4)'}`,
          borderRadius: 18,
          padding: '34px 22px',
          textAlign: 'center',
          background:
            'repeating-linear-gradient(135deg, rgba(198,255,61,0.03) 0 10px, transparent 10px 20px)',
          transition: 'border-color 0.15s',
        }}
      >
        <p
          style={{
            margin: '0 0 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          DROP&nbsp;&nbsp;watchlist.csv&nbsp;&nbsp;HERE
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            background: hover ? 'var(--lime-hi)' : 'var(--lime)',
            color: 'var(--on-lime)',
            border: 'none',
            borderRadius: 999,
            padding: '12px 24px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 14.5,
          }}
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <p
          style={{
            margin: '14px 0 0',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-dimmer)',
          }}
        >
          Letterboxd or IMDb · auto-detected
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: '#ff6b6b', fontSize: 13.5, margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ borderTop: '1px dashed var(--perf)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <button type="button" onClick={loadSample} disabled={loadingSample} style={monoLink}>
          <span style={{ color: 'var(--lime)' }}>▶</span>
          <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
            {loadingSample ? 'Loading sample…' : 'Or try a sample watchlist — 200 films'}
          </span>
        </button>

        <details style={{ color: 'var(--text-muted)' }}>
          <summary style={{ ...monoLink, listStyle: 'none' }}>
            <span style={{ color: 'var(--lime)' }}>?</span>
            <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
              How do I export my watchlist
            </span>
          </summary>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-2)' }}>Letterboxd:</strong> Settings → Import &amp; Export →
              “Export your data”. Unzip it and upload <code>watchlist.csv</code>.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-2)' }}>IMDb:</strong> open your Watchlist → the ••• menu (top
              right) → “Export”. IMDb emails you a CSV, or downloads it directly. Upload that file.
            </p>
          </div>
        </details>
      </div>
    </section>
  )
}
