import { useState } from 'react'
import type { ResolveMatch } from '@subplot/api-client'
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
  /** Continue with these keys dropped (unmatched + anything the user skipped). */
  onConfirm: (excludedKeys: string[]) => void
  onBack: () => void
}

const posterUrl = (path: string | null): string | null =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null

export default function ReviewStep({
  flagged,
  matches,
  importedTitleByKey,
  confidentCount,
  onConfirm,
  onBack,
}: Props) {
  // Unmatched titles start skipped (nothing to price); low-confidence matches
  // start included — the user drops the wrong ones.
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(flagged.filter((v) => v.reason === 'unmatched').map((v) => v.key)),
  )

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
          These didn&rsquo;t match confidently. Keep the right ones, skip the wrong ones — then we&rsquo;ll
          price only what you keep.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flagged.map((v) => {
          const match = matches[v.key]
          const original = importedTitleByKey[v.key] ?? v.key
          const skipped = excluded.has(v.key)
          const poster = match ? posterUrl(match.posterPath) : null
          return (
            <div
              key={v.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 10,
                borderRadius: 12,
                background: 'var(--surface-card, rgba(255,255,255,0.03))',
                border: '1px solid var(--perf)',
                opacity: skipped ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 63,
                  flex: '0 0 auto',
                  borderRadius: 6,
                  background: 'var(--raised, rgba(255,255,255,0.06))',
                  backgroundImage: poster ? `url(${poster})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
                aria-hidden="true"
              >
                {poster ? '' : '🎬'}
              </div>

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
                {match ? (
                  <div style={{ fontSize: 14.5, color: 'var(--text)', marginTop: 2 }}>
                    {match.title}
                    {match.year ? (
                      <span style={{ color: 'var(--text-muted)' }}> ({match.year})</span>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ fontSize: 14.5, color: 'var(--amber)', marginTop: 2 }}>
                    No match found
                  </div>
                )}
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
          onClick={() => onConfirm([...excluded])}
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
