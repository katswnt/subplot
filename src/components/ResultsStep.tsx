import type { StreamingResult } from '@letterboxd-wrappd/domain/streaming'
import { describeRecommended, marginalSteps, formatMoney, serviceLabel } from '../lib/explain'

type Props = {
  result: StreamingResult
  unresolvedCount?: number
  onStartOver: () => void
}

const card: React.CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '1.25rem 1.5rem',
}

export default function ResultsStep({ result, unresolvedCount = 0, onStartOver }: Props) {
  const rec = result.recommended
  const steps = marginalSteps(result)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 640 }}>
      {/* Recommended combo */}
      <div style={{ ...card, borderColor: 'var(--accent)' }}>
        <p
          style={{
            margin: 0,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          Recommended
        </p>
        <h2 style={{ margin: '0.35rem 0 0.5rem', fontSize: '1.4rem' }} data-testid="recommended-summary">
          {describeRecommended(result)}
        </h2>
        {rec.addedServices.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {rec.addedServices.map((id) => (
              <span
                key={id}
                style={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '0.25rem 0.7rem',
                  fontSize: '0.85rem',
                }}
              >
                {serviceLabel(result.region, id)}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{formatMoney(rec.monthlyCost)}/mo</span>
          </div>
        )}
      </div>

      {/* Marginal-value curve */}
      {steps.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 0.6rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Each service you add, cheapest first:
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {steps.map((s, i) => (
              <li
                key={i}
                data-testid="marginal-step"
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  opacity: s.recommended ? 1 : 0.55,
                }}
              >
                <span style={{ fontWeight: 600 }}>+{s.addedNames[s.addedNames.length - 1]}</span>
                <span style={{ color: 'var(--good)', fontSize: '0.85rem' }}>+{s.addFilms} films</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  +{formatMoney(s.addCost)} → {formatMoney(s.monthlyCost)}/mo
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Orphans */}
      {result.orphans.length > 0 && (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }} data-testid="orphans-note">
            {result.orphans.length} film{result.orphans.length === 1 ? '' : 's'} aren&rsquo;t on any tracked
            subscription — rent/buy pricing is coming soon.
          </p>
        </div>
      )}

      {unresolvedCount > 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          {unresolvedCount} film{unresolvedCount === 1 ? '' : 's'} couldn&rsquo;t be matched to a movie database
          entry and were skipped.
        </p>
      )}

      <button
        type="button"
        onClick={onStartOver}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          color: 'var(--accent-2)',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.9rem',
        }}
      >
        ← Start over
      </button>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', margin: 0 }}>
        Streaming availability by JustWatch, via TMDb. Prices are the standard monthly tier and may vary.
      </p>
    </section>
  )
}
