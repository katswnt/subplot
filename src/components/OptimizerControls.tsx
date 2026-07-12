import { SERVICES, type StreamingService } from '@letterboxd-wrappd/domain/streaming'
import { formatMoney, ownedTierFor } from '../lib/explain'

export type AdPolicy = 'cheapest' | 'adfree' | 'noads'

type Props = {
  region: string
  ownedServices: string[]
  includeLibraryFree: boolean
  adPolicy: AdPolicy
  budget: number | null
  maxServices: number | null
  ownedTier: Record<string, string>
  editingTier: string | null
  showRegion?: boolean
  onToggleOwned: (slug: string) => void
  onToggleLibrary: () => void
  onAdPolicyChange: (p: AdPolicy) => void
  onBudgetChange: (b: number | null) => void
  onMaxServicesChange: (m: number | null) => void
  onRegionChange: (r: string) => void
  onEditTier: (slug: string | null) => void
  onSetTier: (slug: string, tierId: string) => void
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
  { label: 'Ad-free', value: 'adfree' },
  { label: 'No ads', value: 'noads' },
]

const card: React.CSSProperties = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-09)',
  borderRadius: 16,
  padding: '18px 20px',
}
const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--text-dim)',
  margin: '0 0 12px',
}
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--lime)' : 'var(--raised)',
  color: active ? 'var(--on-lime)' : 'var(--text-2)',
  border: `1px solid ${active ? 'var(--lime)' : 'var(--border-14)'}`,
  borderRadius: 999,
  padding: '7px 13px',
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 600, // constant weight → chips don't resize when selected
})

const adPolicyHint: Record<AdPolicy, string> = {
  cheapest: '→ Cheapest tier per service — may include ads. Free ad-supported services count.',
  adfree: '→ Priced at each service’s ad-free tier. Free ad-supported services still count.',
  noads: '→ Ad-free tiers, and free ad-supported services (Tubi, Pluto…) are dropped.',
}

const Segmented = <T,>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
}) => (
  <div
    style={{
      display: 'inline-flex',
      background: 'var(--raised)',
      border: '1px solid var(--border-12)',
      borderRadius: 999,
      padding: 3,
    }}
  >
    {options.map((o) => {
      const active = o.value === value
      return (
        <button
          key={o.label}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          style={{
            background: active ? 'var(--lime)' : 'transparent',
            color: active ? 'var(--on-lime)' : 'var(--text-dim)',
            border: 'none',
            borderRadius: 999,
            padding: '7px 15px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      )
    })}
  </div>
)

export default function OptimizerControls({
  region,
  ownedServices,
  includeLibraryFree,
  adPolicy,
  budget,
  maxServices,
  ownedTier,
  editingTier,
  showRegion = false,
  onToggleOwned,
  onToggleLibrary,
  onAdPolicyChange,
  onBudgetChange,
  onMaxServicesChange,
  onRegionChange,
  onEditTier,
  onSetTier,
}: Props) {
  const services = SERVICES[region] ?? []
  const paidServices = services.filter((s) => s.kind === 'paid')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      {showRegion && REGIONS.length > 1 && (
        <div style={card}>
          <p style={sectionLabel}>Region</p>
          <select
            aria-label="Region"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            style={{
              background: 'var(--raised)',
              color: 'var(--text)',
              border: '1px solid var(--border-12)',
              borderRadius: 10,
              padding: '11px 14px',
              fontSize: 14.5,
              width: '100%',
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

      {/* How you like to watch */}
      <div style={card}>
        <p style={sectionLabel}>How you like to watch</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 66, fontSize: 13.5, color: 'var(--text-2)' }}>Ads</span>
          <Segmented options={AD_OPTIONS} value={adPolicy} onChange={onAdPolicyChange} />
        </div>
        <p style={{ margin: '12px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dimmer)' }}>
          {adPolicyHint[adPolicy]}
        </p>
      </div>

      {/* Already paying for */}
      <div style={card}>
        <p style={sectionLabel}>Already paying for</p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-dimmer)' }}>
          We treat these as free and only recommend what to add.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {paidServices.map((s) => (
            <button
              key={s.slug}
              type="button"
              aria-pressed={ownedServices.includes(s.slug)}
              onClick={() => onToggleOwned(s.slug)}
              style={chip(ownedServices.includes(s.slug))}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Credited caption + tier picker per owned service */}
        {ownedServices
          .map((slug) => services.find((s) => s.slug === slug))
          .filter((s): s is StreamingService => !!s && s.kind === 'paid')
          .map((svc) => {
            const tier = ownedTierFor(region, svc.slug, adPolicy, ownedTier[svc.slug]) ?? svc.tiers[0]
            const editing = editingTier === svc.slug
            return (
              <div key={svc.slug} style={{ marginTop: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'rgba(230,222,196,0.04)',
                    border: '1px solid var(--border-08)',
                    borderRadius: 11,
                    padding: '11px 13px',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-2)' }}>
                    {svc.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dimmer)' }}>
                    → {tier.label} · {formatMoney(tier.monthly)}
                  </span>
                  {svc.tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onEditTier(editing ? null : svc.slug)}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--amber)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        textDecoration: 'underline',
                        textDecorationStyle: 'dotted',
                      }}
                    >
                      change
                    </button>
                  )}
                </div>
                {editing && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {svc.tiers.map((t) => {
                      const selected = t.id === tier.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSetTier(svc.slug, t.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            textAlign: 'left',
                            background: selected ? 'rgba(198,255,61,0.09)' : 'var(--raised)',
                            border: `1px solid ${selected ? 'var(--lime)' : 'var(--border-12)'}`,
                            borderRadius: 9,
                            padding: '9px 11px',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: 15,
                              height: 15,
                              borderRadius: 999,
                              flex: '0 0 auto',
                              border: selected ? '4px solid var(--lime)' : '2px solid var(--text-faint)',
                              boxSizing: 'border-box',
                            }}
                          />
                          <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{t.label}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                            {t.ads ? 'With ads' : 'Ad-free'}
                          </span>
                          <span
                            style={{
                              marginLeft: 'auto',
                              width: 56,
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 13,
                              color: 'var(--text-2)',
                            }}
                          >
                            {formatMoney(t.monthly)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {/* Library card */}
      <div style={card}>
        <button
          type="button"
          aria-pressed={includeLibraryFree}
          onClick={onToggleLibrary}
          style={{ ...chip(includeLibraryFree), padding: '8px 14px' }}
        >
          {includeLibraryFree ? '✓ ' : ''}I have a library card (Kanopy &amp; Hoopla)
        </button>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-dimmer)' }}>Free with a library card.</p>
      </div>

      {/* Monthly budget */}
      <div style={card}>
        <p style={sectionLabel}>Monthly budget · optional</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            aria-label="Monthly budget"
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
              width: 130,
              background: 'var(--raised)',
              color: 'var(--text)',
              border: '1px solid var(--border-12)',
              borderRadius: 10,
              padding: '11px 14px',
              fontSize: 14.5,
            }}
          />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-dimmer)' }}>
          Set a cap and we&rsquo;ll fit the most films into it. Leave blank for the best-value pick.
        </p>
      </div>

      {/* Max services to add */}
      <div style={card}>
        <p style={sectionLabel}>Max services to add</p>
        <div style={{ display: 'flex', gap: 8 }}>
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
