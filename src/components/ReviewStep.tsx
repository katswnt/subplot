import { useEffect, useRef, useState } from 'react'
import type { ResolveMatch, SearchCandidate } from '@subplot/api-client'
import type { ReviewVerdict } from '@subplot/domain/review'

type Props = {
  /** The uncertain queue (unmatched + low-confidence), worst-first. */
  flagged: ReviewVerdict[]
  /** filmKey → matched title's display info. */
  matches: Record<string, ResolveMatch>
  /** filmKey → the user's original text. */
  importedTitleByKey: Record<string, string>
  /** How many resolved cleanly and are already included. */
  confidentCount: number
  /** Free-text TMDb search for the "find the right one" picker. */
  onSearch: (query: string) => Promise<SearchCandidate[]>
  /** Continue: drop these keys, and use these user-picked matches. */
  onConfirm: (excludedKeys: string[], overrides: Record<string, SearchCandidate>) => void
  onBack: () => void
}

const posterUrl = (path: string | null): string | null =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null

/** Poster thumbnail (or a placeholder clapper). */
function Poster({ path, size = 42 }: { path: string | null; size?: number }) {
  const url = posterUrl(path)
  return (
    <div
      style={{
        width: size,
        height: Math.round(size * 1.5),
        flex: '0 0 auto',
        borderRadius: 6,
        background: 'var(--raised, rgba(255,255,255,0.06))',
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
      }}
      aria-hidden="true"
    >
      {url ? '' : '🎬'}
    </div>
  )
}

/** Inline search box + candidate results for one flagged row. */
function RowSearch({
  initialQuery,
  onSearch,
  onPick,
}: {
  initialQuery: string
  onSearch: (query: string) => Promise<SearchCandidate[]>
  onPick: (candidate: SearchCandidate) => void
}) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<SearchCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Focus the box when the row's search opens (autoFocus is a11y-linted away).
  useEffect(() => inputRef.current?.focus(), [])

  const doSearch = async () => {
    const query = q.trim()
    if (!query) return
    setLoading(true)
    setSearched(true)
    const r = await onSearch(query)
    setResults(r)
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void doSearch()
          }}
          placeholder="Search for the right title…"
          aria-label="Search for the right title"
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-1)',
            background: 'var(--bg, rgba(0,0,0,0.3))',
            border: '1px solid var(--perf)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        />
        <button
          type="button"
          onClick={() => void doSearch()}
          style={{
            border: '1px solid var(--lime)',
            background: 'rgba(198,255,61,0.12)',
            color: 'var(--lime)',
            borderRadius: 8,
            padding: '8px 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {!loading && searched && results.length === 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>No results — try different words.</p>
      )}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {results.map((c) => (
            <button
              key={`${c.mediaType}:${c.id}`}
              type="button"
              onClick={() => onPick(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                borderRadius: 8,
                padding: 6,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <Poster path={c.posterPath} size={30} />
              <span style={{ fontSize: 13.5 }}>
                {c.title}
                {c.year ? <span style={{ color: 'var(--text-muted)' }}> ({c.year})</span> : null}
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    color: 'var(--text-dimmer)',
                  }}
                >
                  {c.mediaType === 'tv' ? 'TV' : 'FILM'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ReviewStep({
  flagged,
  matches,
  importedTitleByKey,
  confidentCount,
  onSearch,
  onConfirm,
  onBack,
}: Props) {
  // Unmatched start skipped; low-confidence matches start included.
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(flagged.filter((v) => v.reason === 'unmatched').map((v) => v.key)),
  )
  const [overrides, setOverrides] = useState<Record<string, SearchCandidate>>({})
  const [searchOpen, setSearchOpen] = useState<string | null>(null)

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const pick = (key: string, candidate: SearchCandidate) => {
    setOverrides((prev) => ({ ...prev, [key]: candidate }))
    // A picked title is one you want — keep it.
    setExcluded((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setSearchOpen(null)
  }

  const keepingCount = confidentCount + flagged.filter((v) => !excluded.has(v.key)).length

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      <div>
        <p
          style={{
            margin: '0 0 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.1em',
            color: 'var(--lime)',
          }}
        >
          QUICK&nbsp;CHECK
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 27,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}
        >
          {confidentCount} matched cleanly — {flagged.length}{' '}
          {flagged.length === 1 ? 'needs' : 'need'} a look.
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)' }}>
          These didn&rsquo;t match confidently. Fix the wrong ones, skip what you don&rsquo;t want — then
          we&rsquo;ll price only what you keep.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flagged.map((v) => {
          const original = importedTitleByKey[v.key] ?? v.key
          const shown = overrides[v.key] ?? matches[v.key] ?? null
          const corrected = Boolean(overrides[v.key])
          const skipped = excluded.has(v.key)
          const isSearching = searchOpen === v.key
          return (
            <div
              key={v.key}
              style={{
                padding: 10,
                borderRadius: 12,
                background: 'var(--surface-card, rgba(255,255,255,0.03))',
                border: `1px solid ${corrected ? 'var(--lime)' : 'var(--perf)'}`,
                opacity: skipped ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Poster path={shown ? shown.posterPath : null} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--text-dimmer)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    you typed: {original}
                  </div>
                  {shown ? (
                    <div style={{ fontSize: 14.5, color: 'var(--text)', marginTop: 2 }}>
                      {shown.title}
                      {shown.year ? <span style={{ color: 'var(--text-muted)' }}> ({shown.year})</span> : null}
                      {corrected ? <span style={{ color: 'var(--lime)', fontSize: 12 }}> · your pick</span> : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14.5, color: 'var(--amber)', marginTop: 2 }}>No match found</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearchOpen(isSearching ? null : v.key)}
                    style={{
                      marginTop: 4,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--amber)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted',
                    }}
                  >
                    {isSearching ? 'close' : shown ? 'not right? search →' : 'search for it →'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(v.key)}
                  aria-pressed={!skipped}
                  aria-label={`${skipped ? 'Skipped' : 'Keeping'}: ${original}`}
                  style={{
                    flex: '0 0 auto',
                    border: `1px solid ${skipped ? 'var(--perf)' : 'var(--lime)'}`,
                    background: skipped ? 'transparent' : 'rgba(198,255,61,0.12)',
                    color: skipped ? 'var(--text-muted)' : 'var(--lime)',
                    borderRadius: 999,
                    padding: '7px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                  }}
                >
                  {skipped ? 'SKIPPED' : 'KEEP'}
                </button>
              </div>

              {isSearching && (
                <RowSearch
                  initialQuery={original}
                  onSearch={onSearch}
                  onPick={(candidate) => pick(v.key, candidate)}
                />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
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
          ← back
        </button>
        <button
          type="button"
          onClick={() => onConfirm([...excluded], overrides)}
          style={{
            background: 'var(--lime)',
            color: 'var(--on-lime)',
            border: 'none',
            borderRadius: 999,
            padding: '13px 22px',
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Looks good — price {keepingCount} {keepingCount === 1 ? 'title' : 'titles'} →
        </button>
      </div>
    </section>
  )
}
