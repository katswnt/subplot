import { SERVICES, serviceMonthly } from '@letterboxd-wrappd/domain/streaming'
import { formatMoney } from '../lib/explain'

type Props = {
  filmCount: number
  source: string
  region: string
  ownedServices: string[]
  maxServices: number | null
  includeLibraryFree: boolean
  running: boolean
  onToggleOwned: (slug: string) => void
  onToggleLibrary: () => void
  onRegionChange: (region: string) => void
  onMaxServicesChange: (max: number | null) => void
  onRun: () => void
}

const REGIONS = Object.keys(SERVICES)
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
  includeLibraryFree,
  running,
  onToggleOwned,
  onToggleLibrary,
  onRegionChange,
  onMaxServicesChange,
  onRun,
}: Props) {
  // Only paid subscriptions are "services you pay for"; free ones are handled
  // automatically and surfaced in the results.
  const paidServices = (SERVICES[region] ?? []).filter((s) => s.kind === 'paid')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 640 }}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Imported <strong style={{ color: 'var(--text)' }}>{filmCount}</strong> films from {source}.
      </p>

      {/* Region picker only appears once more than one region is priced. */}
      {REGIONS.length > 1 && (
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
      )}

      <div style={card}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Services you already pay for</p>
        <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          We&rsquo;ll treat these as free and only recommend what to add.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {paidServices.map((s) => {
            const active = ownedServices.includes(s.slug)
            return (
              <button
                key={s.slug}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleOwned(s.slug)}
                style={chip(active)}
              >
                {s.name} · {formatMoney(serviceMonthly(s, 'cheapest') ?? 0)}
              </button>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <button
          type="button"
          aria-pressed={includeLibraryFree}
          onClick={onToggleLibrary}
          style={{ ...chip(includeLibraryFree), padding: '0.4rem 0.9rem' }}
        >
          {includeLibraryFree ? '✓ ' : ''}I have a library card (Kanopy &amp; Hoopla)
        </button>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Free with a library card. Free ad-supported services (Tubi, Pluto&hellip;) are always counted.
        </p>
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
          Quality &amp; audio <span style={{ color: 'var(--accent-2)', fontSize: '0.75rem' }}>· coming soon</span>
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
