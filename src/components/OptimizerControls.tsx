import { SERVICES, serviceMonthly } from '@letterboxd-wrappd/domain/streaming'
import { formatMoney } from '../lib/explain'

export type AdPolicy = 'cheapest' | 'adfree' | 'noads'

type Props = {
  region: string
  ownedServices: string[]
  includeLibraryFree: boolean
  adPolicy: AdPolicy
  budget: number | null
  maxServices: number | null
  /** Region changes require a re-fetch, so it only appears pre-run. */
  showRegion?: boolean
  onToggleOwned: (slug: string) => void
  onToggleLibrary: () => void
  onAdPolicyChange: (p: AdPolicy) => void
  onBudgetChange: (b: number | null) => void
  onMaxServicesChange: (m: number | null) => void
  onRegionChange: (r: string) => void
}

const REGIONS = Object.keys(SERVICES)
const MAX_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Any', value: null },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
]
const AD_OPTIONS: Array<{ label: string; value: AdPolicy }> = [
  { label: 'Cheapest', value: 'cheapest' },
  { label: 'Ad-free pricing', value: 'adfree' },
  { label: 'No ads at all', value: 'noads' },
]

const card: React.CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '1.1rem 1.25rem',
}

const chip = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--accent)' : 'var(--surface-raised)',
  color: active ? '#1a1205' : 'var(--text)',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 999,
  padding: '0.3rem 0.75rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontWeight: active ? 700 : 400,
})

const adPolicyHint: Record<AdPolicy, string> = {
  cheapest: 'Cheapest tier per service (may include ads). Free ad-supported services count.',
  adfree: 'Charge each paid service’s ad-free tier. Free ad-supported services still count.',
  noads: 'Ad-free paid tiers AND drop free ad-supported services (Tubi, Pluto…) — nothing with ads.',
}

export default function OptimizerControls({
  region,
  ownedServices,
  includeLibraryFree,
  adPolicy,
  budget,
  maxServices,
  showRegion = false,
  onToggleOwned,
  onToggleLibrary,
  onAdPolicyChange,
  onBudgetChange,
  onMaxServicesChange,
  onRegionChange,
}: Props) {
  const paidServices = (SERVICES[region] ?? []).filter((s) => s.kind === 'paid')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: 640 }}>
      {showRegion && REGIONS.length > 1 && (
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
          Free with a library card.
        </p>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.9rem' }}>Ads</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {AD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={adPolicy === o.value}
              onClick={() => onAdPolicyChange(o.value)}
              style={chip(adPolicy === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {adPolicyHint[adPolicy]}
        </p>
      </div>

      <div style={card}>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem' }} htmlFor="budget">
          Monthly budget <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            id="budget"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            placeholder="no limit"
            value={budget ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              onBudgetChange(v === '' ? null : Math.max(0, Number(v)))
            }}
            style={{
              width: 120,
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0.5rem 0.75rem',
              fontSize: '0.9rem',
            }}
          />
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Set a cap and we&rsquo;ll fit the most films into it. Leave blank for the best-value pick.
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
    </div>
  )
}
