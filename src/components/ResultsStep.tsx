import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import type { StreamingResult } from '@letterboxd-wrappd/domain/streaming'
import {
  marginalSteps,
  formatMoney,
  serviceLabel,
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
  fontSize: 11,
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
      {/* name + tag wrap together; the name never splits from its ＋/● marker */}
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ color: nameColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{left}</span>
        {tag && <span style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>{tag}</span>}
      </span>
      <span
        style={{ flex: '1 1 12px', minWidth: 12, borderBottom: `1px dotted ${leaderColor}`, transform: 'translateY(-3px)' }}
      />
      {count && (
        <span style={{ flex: '0 0 auto', width: 84, textAlign: 'right', color: countColor, whiteSpace: 'nowrap' }}>
          {count}
        </span>
      )}
      <span style={{ flex: '0 0 auto', width: 64, textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {price}
      </span>
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

  const total = result.totalFilms
  const included = result.baselineCoveredCount // free + owned, $0 extra
  const added = Math.max(0, rec.coveredCount - included)
  const includedPct = total ? (included / total) * 100 : 0
  const addedPct = total ? (added / total) * 100 : 0

  const freeNames = result.free.map((f) => serviceLabel(region, f.slug))
  const freeTeaser =
    freeNames.length <= 3 ? freeNames.join(', ') : `${freeNames.slice(0, 3).join(', ')} + ${freeNames.length - 3} more`
  const period = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()

  const receiptRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const saveReceipt = async () => {
    if (!receiptRef.current) return
    setSaving(true)
    try {
      const url = await toPng(receiptRef.current, { pixelRatio: 2, backgroundColor: '#100f0b', cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = 'subplot-receipt.png'
      a.click()
    } catch {
      /* best-effort */
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div
        ref={receiptRef}
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

        {/* FREE hero strip */}
        {result.freeCoveredCount > 0 && (
          <div
            data-testid="free-summary"
            style={{
              background: 'var(--lime-fill)',
              border: '1px solid var(--lime-border)',
              borderRadius: 12,
              padding: '11px 13px',
              marginBottom: 18,
            }}
          >
            <p style={{ ...mono, fontSize: 12.5, margin: 0, color: 'var(--lime)', fontWeight: 600 }}>
              {result.freeCoveredCount} FILMS FREE · $0.00
            </p>
            <p style={{ ...mono, fontSize: 11, margin: '3px 0 0', color: 'var(--text-dim)' }}>
              already streaming on {freeTeaser}
            </p>
          </div>
        )}

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
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>{preferenceBadge(adPolicy)}</p>

        {/* WHAT TO ADD — the hero */}
        <div style={perf} />
        <p style={groupLabel('var(--lime)')}>WHAT TO ADD</p>
        {recSteps.length === 0 ? (
          <p style={{ ...mono, fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>
            Nice — your free{owns ? ' and owned' : ''} services already cover everything we can.
          </p>
        ) : (
          recSteps.map((s) => (
            <div key={s.slug} data-testid="marginal-step">
              <Line
                left={<>＋ {s.name}</>}
                tag={ownedTierFor(region, s.slug, adPolicy)?.ads ? 'With ads' : undefined}
                count={`+${s.addFilms} films`}
                price={formatMoney(s.addCost)}
                leaderColor="var(--lime-leader)"
                countColor="var(--lime)"
              />
            </div>
          ))
        )}

        {/* IF YOU WANT MORE — de-emphasized via explicit colors, not opacity */}
        {moreSteps.length > 0 && (
          <>
            <div style={perf} />
            <p style={groupLabel('var(--text-dimmer)')}>IF YOU WANT MORE</p>
            <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '-6px 0 8px' }}>
              Optional — each adds fewer films for more money.
            </p>
            {moreSteps.map((s) => (
              <Line
                key={s.slug}
                left={<>＋ {s.name}</>}
                tag={ownedTierFor(region, s.slug, adPolicy)?.ads ? 'With ads' : undefined}
                count={`+${s.addFilms}`}
                price={`+${formatMoney(s.addCost)}`}
                nameColor="var(--text-dim)"
                countColor="var(--text-dimmer)"
              />
            ))}
          </>
        )}

        {/* INCLUDED · NO EXTRA COST — free + owned */}
        {(result.free.length > 0 || owns) && (
          <>
            <div style={perf} />
            <p style={groupLabel('var(--text-dimmer)')}>INCLUDED · NO EXTRA COST</p>
            {result.free.map((f) => (
              <Line
                key={f.slug}
                left={
                  <span data-testid="free-service">
                    ◉ {serviceLabel(region, f.slug)}
                  </span>
                }
                tag={f.kind === 'free-library' ? 'library' : 'free · ads'}
                count={`${f.coveredCount} films`}
                price="$0.00"
                nameColor="var(--text-2)"
              />
            ))}
            {result.owned.map((o) => {
              const tier = ownedTierFor(region, o.slug, adPolicy, ownedTier[o.slug])
              return (
                <Line
                  key={o.slug}
                  left={<>● {serviceLabel(region, o.slug)}</>}
                  tag={tier?.label}
                  count={`${o.coveredCount} films`}
                  price={formatMoney(tier?.monthly ?? 0)}
                  nameColor="var(--text-2)"
                />
              )
            })}
          </>
        )}

        {/* Coverage — two-tone bar */}
        <div style={perf} />
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          <span>COVERED</span>
          <span data-testid="coverage">
            {rec.coveredCount} / {total} films
          </span>
        </div>
        <div style={{ display: 'flex', height: 9, borderRadius: 999, background: 'var(--border-12)', overflow: 'hidden' }}>
          <div style={{ width: `${includedPct}%`, background: '#7cc93d' }} />
          <div style={{ width: `${addedPct}%`, background: 'var(--lime)' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, ...mono, fontSize: 10, color: 'var(--text-dim)', margin: '8px 0 0' }}>
          <span><span style={{ color: '#7cc93d' }}>■</span> free / included</span>
          <span><span style={{ color: 'var(--lime)' }}>■</span> added</span>
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
          onClick={saveReceipt}
          disabled={saving}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,179,0,0.4)',
            borderRadius: 999,
            padding: '8px 16px',
            cursor: saving ? 'wait' : 'pointer',
            color: 'var(--amber)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : '⤓ Save receipt'}
        </button>
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
