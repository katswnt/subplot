import { useRef, useState } from 'react'
import { parseImport, type ImportSource, type ImportedFilm } from '@subplot/domain/imports'

type Props = {
  onImported: (source: ImportSource, films: ImportedFilm[]) => void
}

type Mode = 'file' | 'paste'

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
  const [mode, setMode] = useState<Mode>('paste')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const ingest = (text: string) => {
    // parseImport auto-detects: a Letterboxd/IMDb CSV export vs. a free-text
    // list (Notes, Reminders, anywhere — one title per line).
    const { source, films } = parseImport(text)
    if (films.length === 0) {
      setError(
        'Couldn’t find any titles in that. Paste one per line, or upload a Letterboxd/IMDb CSV export.',
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

  const pasteLineCount = pasteText.split('\n').filter((l) => l.trim().length > 0).length

  const stub = (id: Mode, label: string) => {
    const active = mode === id
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setMode(id)}
        style={{
          flex: 1,
          background: active ? 'rgba(198,255,61,0.06)' : 'transparent',
          border: 'none',
          borderBottom: `2px solid ${active ? 'var(--lime)' : 'transparent'}`,
          cursor: 'pointer',
          padding: '13px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          color: active ? 'var(--lime)' : 'var(--text-muted)',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
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
          Drop an export, or paste the list you already keep in Notes. Subplot prices every title — films and
          TV — against the services you can actually subscribe to, then finds the lowest-cost combination that
          covers the most of it.
        </p>
      </div>

      {/* Split ticket: two stubs (upload | paste) on one dashed ticket. A file
          drop works in either mode. */}
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
          overflow: 'hidden',
          background: 'repeating-linear-gradient(135deg, rgba(198,255,61,0.03) 0 10px, transparent 10px 20px)',
          transition: 'border-color 0.15s',
        }}
      >
        <div role="tablist" aria-label="Import method" style={{ display: 'flex', borderBottom: '1px dashed var(--perf)' }}>
          {stub('file', 'DROP A FILE')}
          {stub('paste', 'PASTE A LIST')}
        </div>

        <div style={{ padding: '26px 22px' }}>
          {mode === 'file' ? (
            <div style={{ textAlign: 'center' }}>
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
                accept=".csv,.txt,text/csv,text/plain"
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
                Letterboxd · IMDb · or a plain .txt · auto-detected
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                }}
              >
                ONE&nbsp;TITLE&nbsp;PER&nbsp;LINE&nbsp;&nbsp;—&nbsp;&nbsp;YEARS&nbsp;OPTIONAL
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Parasite\nThe Bear\nThe Zone of Interest (2023)\n…'}
                rows={6}
                spellCheck={false}
                aria-label="Paste a watchlist, one title per line"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--text-1)',
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid var(--perf)',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>
                  {pasteLineCount} {pasteLineCount === 1 ? 'line' : 'lines'}
                </span>
                <button
                  type="button"
                  disabled={pasteLineCount === 0}
                  onClick={() => ingest(pasteText)}
                  style={{
                    background: pasteLineCount === 0 ? 'var(--raised, rgba(255,255,255,0.06))' : 'var(--lime)',
                    color: pasteLineCount === 0 ? 'var(--text-dimmer)' : 'var(--on-lime)',
                    border: 'none',
                    borderRadius: 999,
                    padding: '11px 22px',
                    fontWeight: 700,
                    fontSize: 14.5,
                    cursor: pasteLineCount === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Find my titles →
                </button>
              </div>
            </div>
          )}
        </div>
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
            {loadingSample ? 'Loading sample…' : 'Or try a sample watchlist — 200 titles'}
          </span>
        </button>

        <details style={{ color: 'var(--text-muted)' }}>
          <summary style={{ ...monoLink, listStyle: 'none' }}>
            <span style={{ color: 'var(--lime)' }}>?</span>
            <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
              How do I get my watchlist out
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
              right) → “Export”. Upload that file — TV shows come along too.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-2)' }}>Apple Notes / Reminders:</strong> select all your
              titles, copy, and paste them into the box above — one per line.
            </p>
          </div>
        </details>
      </div>
    </section>
  )
}
