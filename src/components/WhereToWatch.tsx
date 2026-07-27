import { useMemo, useState } from 'react'
import { buildWatchNow, type WatchService } from '@subplot/domain/watch'
import type { StreamingFilm } from '@subplot/domain/streaming'

type Props = { films: StreamingFilm[]; owned: string[]; region: string }

const groupNote = (owned: boolean, kind: WatchService['kind']): string =>
  owned ? 'you have it' : kind === 'free-library' ? 'free · library card' : 'free · with ads'

function ServiceChip({ name, yours }: { name: string; yours: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 999,
        border: `1px solid ${yours ? 'var(--lime)' : 'var(--perf)'}`,
        background: yours ? 'rgba(198,255,61,0.12)' : 'transparent',
        color: yours ? 'var(--lime)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  )
}

export default function WhereToWatch({ films, owned, region }: Props) {
  const watch = useMemo(() => buildWatchNow(films, owned, region), [films, owned, region])
  const [onlyMine, setOnlyMine] = useState(false)
  const ownedSet = useMemo(() => new Set(owned), [owned])
  const isYours = (s: WatchService) => s.kind !== 'paid' || ownedSet.has(s.slug)

  const total = watch.titles.length
  const shown = onlyMine ? watch.titles.filter((t) => t.onYourServices) : watch.titles

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* Headline */}
      <div>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.1em',
            color: 'var(--lime)',
          }}
        >
          WATCH&nbsp;NOW
        </p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, margin: 0, lineHeight: 1.1 }}>
          <span style={{ color: 'var(--lime)' }}>{watch.onYourServicesCount}</span> of {total}{' '}
          {total === 1 ? 'title is' : 'titles are'} watchable right now
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-muted)' }}>
          on services you already have or free ones.
          {watch.notOnYoursCount > 0 ? ` ${watch.notOnYoursCount} stream elsewhere.` : ''}
          {watch.nowhereCount > 0 ? ` ${watch.nowhereCount} aren’t streaming.` : ''}
        </p>
      </div>

      {/* Display 1 — grouped by your services */}
      {watch.yourServiceGroups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {watch.yourServiceGroups.map((g) => (
            <div
              key={g.slug}
              style={{
                padding: 12,
                borderRadius: 12,
                background: 'var(--surface-card, rgba(255,255,255,0.03))',
                border: '1px solid var(--perf)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700 }}>{g.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: g.owned ? 'var(--lime)' : 'var(--text-muted)' }}>
                  {groupNote(g.owned, g.kind)} · {g.titles.length}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {g.titles.slice(0, 10).map((t) => t.title).join(' · ')}
                {g.titles.length > 10 ? ` · +${g.titles.length - 10} more` : ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>
          None of your titles are on services you have yet — see where each one streams below, or the “cheapest
          combo” tab for what to add.
        </p>
      )}

      {/* Display 2 — every title, where it streams */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            WHERE&nbsp;EACH&nbsp;STREAMS
          </p>
          <button
            type="button"
            onClick={() => setOnlyMine((v) => !v)}
            aria-pressed={onlyMine}
            style={{
              border: `1px solid ${onlyMine ? 'var(--lime)' : 'var(--perf)'}`,
              background: onlyMine ? 'rgba(198,255,61,0.12)' : 'transparent',
              color: onlyMine ? 'var(--lime)' : 'var(--text-muted)',
              borderRadius: 999,
              padding: '5px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {onlyMine ? '✓ on my services' : 'on my services only'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((t, i) => (
            <div
              key={t.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--perf)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.title}
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '62%' }}>
                {t.services.length === 0 ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>
                    not streaming
                  </span>
                ) : (
                  t.services.map((s) => <ServiceChip key={s.slug} name={s.name} yours={isYours(s)} />)
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <p style={{ margin: '4px 0', fontSize: 13.5, color: 'var(--text-muted)' }}>
              Nothing on your current services. Turn off the filter to see where these stream.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
