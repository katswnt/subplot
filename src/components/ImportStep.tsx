import { useRef, useState } from 'react'
import { parseWatchlist, type ImportSource, type ImportedFilm } from '@letterboxd-wrappd/domain/imports'

type Props = {
  onImported: (source: ImportSource, films: ImportedFilm[]) => void
}

export default function ImportStep({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File) => {
    setError(null)
    const text = await file.text()
    const { source, films } = parseWatchlist(text)
    if (source === 'unknown' || films.length === 0) {
      setError(
        "That doesn't look like a Letterboxd or IMDb watchlist export. Make sure you're uploading the CSV file.",
      )
      return
    }
    onImported(source, films)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%' }}>
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
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 16,
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          background: dragging ? 'var(--surface-raised)' : 'var(--surface-card)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <p style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Drop your watchlist CSV here</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            background: 'var(--accent)',
            color: '#1a1205',
            border: 'none',
            borderRadius: 999,
            padding: '0.6rem 1.4rem',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.95rem',
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
        <p style={{ margin: '0.75rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Letterboxd or IMDb — we detect which automatically.
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.9rem', margin: 0 }}>
          {error}
        </p>
      )}

      <details style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text)' }}>How do I export my watchlist?</summary>
        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0 }}>
            <strong>Letterboxd:</strong> Settings → Import &amp; Export → “Export your data”. Unzip it and
            upload <code>watchlist.csv</code>.
          </p>
          <p style={{ margin: 0 }}>
            <strong>IMDb:</strong> open your Watchlist → the ••• menu (top right) → “Export”. IMDb emails you a
            CSV, or downloads it directly. Upload that file.
          </p>
        </div>
      </details>
    </section>
  )
}
