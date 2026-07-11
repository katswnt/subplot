import { SUBSCRIPTION_PRICES } from '@letterboxd-wrappd/domain'
import { formatMoney } from '../lib/explain'

type Props = {
  filmCount: number
  source: string
  region: string
  ownedServices: number[]
  maxServices: number | null
  running: boolean
  onToggleOwned: (id: number) => void
  onRegionChange: (region: string) => void
  onMaxServicesChange: (max: number | null) => void
  onRun: () => void
}

const REGIONS = Object.keys(SUBSCRIPTION_PRICES)
const MAX_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Any', value: null },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
]

const card: React.CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '1.1rem 1.25rem',
}

const chip = (active: boolean, disabled = false): React.CSSProperties => ({
  background: active ? 'var(--accent)' : 'var(--surface-raised)',
  color: active ? '#1a1205' : disabled ? 'var(--text-muted)' : 'var(--text)',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 999,
  padding: '0.3rem 0.75rem',
  fontSize: '0.85rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontWeight: active ? 700 : 400,
})

export default function ConfigureStep({
  filmCount,
  source,
  region,
  ownedServices,
  maxServices,
  running,
  onToggleOwned,
  onRegionChange,
  onMaxServicesChange,
  onRun,
}: Props) {
  const services = Object.entries(SUBSCRIPTION_PRICES[region] ?? {}).map(([id, s]) => ({
    id: Number(id),
    ...s,
  }))

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 640 }}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Imported <strong style={{ color: 'var(--text)' }}>{filmCount}</strong> films from {source}.
      </p>

      <div style={card}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }} htmlFor="region">
          Region
        </label>
        <select
          id="region"
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          style={{
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
          }}
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Services you already pay for</p>
        <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          We&rsquo;ll treat these as free and only recommend what to add.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {services.map((s) => {
            const active = ownedServices.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleOwned(s.id)}
                style={chip(active)}
              >
                {s.name} · {formatMoney(s.monthly)}
              </button>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.9rem' }}>Max services to add</p>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {MAX_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={maxServices === o.value}
              onClick={() => onMaxServicesChange(o.value)}
              style={chip(maxServices === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...card, opacity: 0.75 }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
          Quality &amp; audio <span style={{ color: 'var(--accent-2)', fontSize: '0.75rem' }}>· coming in V2</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {['4K', 'HDR', 'Original audio', '5.1 / Atmos'].map((t) => (
            <span key={t} aria-disabled style={chip(false, true)}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onRun}
        disabled={running}
        style={{
          background: running ? 'var(--surface-raised)' : 'var(--accent)',
          color: running ? 'var(--text-muted)' : '#1a1205',
          border: 'none',
          borderRadius: 999,
          padding: '0.75rem 1.5rem',
          fontWeight: 700,
          fontSize: '1rem',
          cursor: running ? 'wait' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {running ? 'Crunching your watchlist…' : 'Find my cheapest combo'}
      </button>
    </section>
  )
}
