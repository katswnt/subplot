import { SUBSCRIPTION_PRICES } from '@letterboxd-wrappd/domain'

/**
 * Subplot — app shell (slice 4).
 *
 * Wires the workspace packages and stands up the landing hero. The full
 * import → configure → results flow lands in slice 5; for now this proves the
 * domain optimizer + price table resolve through Vite's workspace aliases.
 */
export default function App() {
  const services = Object.values(SUBSCRIPTION_PRICES.US)

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 640 }}>
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
        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.1, margin: '0.5rem 0 0.75rem' }}>
          The cheapest way to watch your watchlist
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
          Import your Letterboxd or IMDb watchlist and Subplot finds the lowest-cost
          combination of streaming subscriptions that covers the most of it.
        </p>
      </div>

      <div
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '1.25rem 1.5rem',
          maxWidth: 640,
        }}
      >
        <p style={{ margin: '0 0 0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Optimizing across {services.length} US subscription services
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
          {services.map((s) => (
            <span
              key={s.name}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '0.25rem 0.7rem',
                fontSize: '0.8rem',
              }}
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Import flow coming next. Streaming data by JustWatch, via TMDb.
      </p>
    </main>
  )
}
