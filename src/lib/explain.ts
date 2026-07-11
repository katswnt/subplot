import { serviceBySlug, type StreamingResult } from '@letterboxd-wrappd/domain/streaming'

/** Pure formatters that turn an optimizer result into human-readable copy. */

export const serviceLabel = (region: string, slug: string): string =>
  serviceBySlug[region]?.[slug]?.name ?? slug

export const formatMoney = (n: number): string => `$${n.toFixed(2)}`

/** Join names as "A", "A + B", or "A, B + C". */
export const joinNames = (names: string[]): string => {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} + ${names[names.length - 1]}`
}

/** One-line summary of the recommended combo. */
export function describeRecommended(result: StreamingResult): string {
  const c = result.recommended
  if (c.addedServices.length === 0) {
    return result.coverableCount === 0
      ? 'None of your films are on a subscription service we track.'
      : 'The services you already have cover everything we can — no additions needed.'
  }
  const names = c.addedServices.map((id) => serviceLabel(result.region, id))
  return `${joinNames(names)} cover ${c.coveredCount} of ${result.totalFilms} films for ${formatMoney(
    c.monthlyCost,
  )}/mo.`
}

export type MarginalStep = {
  /** The single service added at this step. */
  name: string
  coveredCount: number
  /** Cumulative $/mo after this step. */
  monthlyCost: number
  /** New films this service unlocks over everything added before it. */
  addFilms: number
  /** This service's own $/mo. */
  addCost: number
  /** Whether this step is at or below the recommended knee. */
  recommended: boolean
}

/**
 * The greedy marginal path as "add X for +N new films (+$Y)" steps — one row
 * per service, best-value first. Because it's a nested chain, each service
 * appears once and films shared across services are never double-counted.
 */
export function marginalSteps(result: StreamingResult): MarginalStep[] {
  let prevCost = 0
  return result.marginalPath.map((m) => {
    const step: MarginalStep = {
      name: serviceLabel(result.region, m.serviceId),
      coveredCount: m.coveredCount,
      monthlyCost: m.monthlyCost,
      addFilms: m.addedFilms,
      addCost: Math.round((m.monthlyCost - prevCost) * 100) / 100,
      recommended: m.monthlyCost <= result.recommended.monthlyCost,
    }
    prevCost = m.monthlyCost
    return step
  })
}
