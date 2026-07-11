import type { StreamingResult } from '@letterboxd-wrappd/domain/streaming'
import {
  marginalSteps,
  formatMoney,
  serviceLabel,
  savingsVsAllIn,
  tierTag,
  preferenceBadge,
  ownedTierFor,
  type AdPolicy,
} from '../lib/explain'

type Props = {
  result: StreamingResult
  adPolicy: AdPolicy
  region: string
  ownedTier: Record<string, string>
  unresolvedCount?: number
  onStartOver: () => void
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const perf: React.CSSProperties = { borderTop: '2px dashed var(--perf)', margin: '18px 0' }
const groupLabel = (color: string): React.CSSProperties => ({
  ...mono,
  fontSize: 10.5,
  letterSpacing: '0.18em',
  color,
  margin: '0 0 12px',
})

/** A receipt line: label … leader … count · price. */
function Line({
  left,
  tag,
  count,
  price,
  leaderColor = 'var(--perf)',
  countColor = 'var(--text-dimmer)',
  nameColor = 'var(--text)',
}: {
  left: React.ReactNode
  tag?: string
  count?: string
  price: string
  leaderColor?: string
  countColor?: string
  nameColor?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...mono, fontSize: 12.5, padding: '5px 0' }}>
      <span style={{ color: nameColor, fontWeight: 600 }}>{left}</span>
      {tag && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{tag}</span>}
      <span style={{ flex: 1, borderBottom: `1px dotted ${leaderColor}`, transform: 'translateY(-3px)' }} />
      {count && <span style={{ color: countColor }}>{count}</span>}
      <span style={{ width: 64, textAlign: 'right', color: 'var(--text)' }}>{price}</span>
    </div>
  )
}

export default function ResultsStep({
  result,
  adPolicy,
  region,
  ownedTier,
  unresolvedCount = 0,
  onStartOver,
}: Props) {
  const rec = result.recommended
  const owns = result.owned.length > 0
  const steps = marginalSteps(result)
  const recSteps = steps.filter((s) => s.recommended)
  const moreSteps = steps.filter((s) => !s.recommended)
  const savings = savingsVsAllIn(result)
  const youAlreadyPay =
    Math.round(
      result.owned.reduce(
        (sum, o) => sum + (ownedTierFor(region, o.slug, adPolicy, ownedTier[o.slug])?.monthly ?? 0),
        0,
      ) * 100,
    ) / 100
  const coveragePct = result.totalFilms ? Math.round((rec.coveredCount / result.totalFilms) * 100) : 0
  const period = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div
        style={{
          background: 'var(--surface-receipt)',
          border: '1px solid var(--border-12)',
          borderRadius: 22,
          padding: '22px 24px',
          boxShadow: '0 30px 60px -30px rgba(0,0,0,0.8)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 10.5, letterSpacing: '0.18em', color: 'var(--text-muted)' }}>
          <span>STREAMING RECEIPT</span>
          <span>
            {period} · {region}
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border-12)', margin: '12px 0 18px' }} />

        {/* Total */}
        <p style={{ ...mono, fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--text-muted)', margin: 0 }}>
          {owns ? 'YOU ADD / MONTH' : 'MONTHLY TOTAL'}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0 6px' }}>
          <span
            data-testid="receipt-total"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em', color: 'var(--lime)', lineHeight: 1 }}
          >
            {formatMoney(rec.monthlyCost)}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/mo</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 4px' }}>{preferenceBadge(adPolicy)}</p>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
          {owns && <>on top of the {formatMoney(youAlreadyPay)} you already pay · </>}
          {!owns && savings > 0 && <>vs {formatMoney(result.allInCost)} all-in · </>}
          {savings > 0 && <span style={{ color: 'var(--amber)' }}>save {formatMoney(savings)} vs all-in</span>}
        </p>

        {/* FREE — what you can already watch at no cost */}
        {result.free.length > 0 && (
          <>
            <div style={perf} />
            <p style={groupLabel('var(--lime)')} data-testid="free-summary">
              FREE · {result.freeCoveredCount} FILMS, NO CHARGE
            </p>
            {result.free.map((f) => (
              <Line
                key={f.slug}
                left={
                  <span data-testid="free-service">
                    {f.kind === 'free-library' ? '📚' : '▶'} {serviceLabel(region, f.slug)}
                  </span>
                }
                count={`${f.coveredCount} films`}
                price="$0.00"
                leaderColor="var(--lime-leader)"
                countColor="var(--lime)"
              />
            ))}
          </>
        )}

        {/* CREDITED — services you already own */}
        {owns && (
          <>
            <div style={perf} />
            <div style={{ opacity: 0.62 }}>
              <p style={groupLabel('var(--text-dimmer)')}>ALREADY PAYING · CREDITED</p>
              {result.owned.map((o) => {
                const tier = ownedTierFor(region, o.slug, adPolicy, ownedTier[o.slug])
                return (
                  <Line
                    key={o.slug}
                    left={<>● {serviceLabel(region, o.slug)}</>}
                    tag={tier?.label}
                    count={`${o.coveredCount} films`}
                    price={formatMoney(tier?.monthly ?? 0)}
                    nameColor="var(--text-dim)"
                  />
                )
              })}
            </div>
          </>
        )}

        {/* WHAT TO ADD — the hero */}
        <div style={perf} />
        <p style={groupLabel('var(--lime)')}>WHAT TO ADD</p>
        {recSteps.length === 0 ? (
          <p style={{ ...mono, fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
            Nothing to add — you&rsquo;re covered by what&rsquo;s free{owns ? ' and what you own' : ''}.
          </p>
        ) : (
          recSteps.map((s) => (
            <div key={s.slug} data-testid="marginal-step">
              <Line
                left={<>＋ {s.name}</>}
                tag={tierTag(region, s.slug, adPolicy)}
                count={`+${s.addFilms} films`}
                price={formatMoney(s.addCost)}
                leaderColor="var(--lime-leader)"
                countColor="var(--lime)"
              />
            </div>
          ))
        )}

        {/* IF YOU WANT MORE — de-emphasized */}
        {moreSteps.length > 0 && (
          <>
            <div style={perf} />
            <div style={{ opacity: 0.5 }}>
              <p style={groupLabel('var(--text-dimmer)')}>IF YOU WANT MORE</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '-6px 0 8px' }}>
                Optional — each adds fewer films for more money.
              </p>
              {moreSteps.map((s) => (
                <Line
                  key={s.slug}
                  left={<>＋ {s.name}</>}
                  tag={tierTag(region, s.slug, adPolicy)}
                  count={`+${s.addFilms}`}
                  price={`+${formatMoney(s.addCost)}`}
                  nameColor="var(--text-dim)"
                />
              ))}
            </div>
          </>
        )}

        {/* Coverage */}
        <div style={perf} />
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          <span>COVERED</span>
          <span data-testid="coverage">
            {rec.coveredCount} / {result.totalFilms} films
          </span>
        </div>
        <div style={{ height: 9, borderRadius: 999, background: 'var(--border-12)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${coveragePct}%`, background: 'var(--lime)', borderRadius: 999 }} />
        </div>
        {(result.orphans.length > 0 || unresolvedCount > 0) && (
          <p style={{ ...mono, fontSize: 11, color: 'var(--text-dimmer)', margin: '10px 0 0' }} data-testid="orphans-note">
            {result.orphans.length > 0 && `${result.orphans.length} films rent/buy only`}
            {result.orphans.length > 0 && unresolvedCount > 0 && ' · '}
            {unresolvedCount > 0 && `${unresolvedCount} unmatched, skipped`}
          </p>
        )}

        {/* Barcode footer */}
        <div style={{ borderTop: '1px dashed var(--perf)', margin: '18px 0 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              width: 150,
              height: 26,
              background:
                'repeating-linear-gradient(90deg, #f4f1e6 0 2px, transparent 2px 4px, #f4f1e6 4px 5px, transparent 5px 9px)',
            }}
          />
          <span style={{ ...mono, fontSize: 9, color: 'var(--text-dimmer)', textAlign: 'right' }}>
            SUBPLOT / JUSTWATCH·TMDB
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={onStartOver}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13.5 }}
        >
          ← Start over
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-dimmer)', margin: 0, lineHeight: 1.5 }}>
        Streaming availability by JustWatch, via TMDb. Prices are the standard monthly tier and may vary.
      </p>
    </section>
  )
}
