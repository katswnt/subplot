import { SUBSCRIPTION_PRICES, type StreamingResult, type Combo } from '@letterboxd-wrappd/domain/streaming'

/** Pure formatters that turn an optimizer result into human-readable copy. */

export const serviceLabel = (region: string, id: number): string =>
  SUBSCRIPTION_PRICES[region]?.[id]?.name ?? `#${id}`

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
  addedNames: string[]
  coveredCount: number
  monthlyCost: number
  /** Films this step unlocks over the previous frontier point. */
  addFilms: number
  /** Extra $/mo this step costs over the previous frontier point. */
  addCost: number
  /** Whether this step is at or below the recommended knee. */
  recommended: boolean
}

/** The cost-vs-coverage frontier as incremental "add X for +N films (+$Y)" steps. */
export function marginalSteps(result: StreamingResult): MarginalStep[] {
  const steps: MarginalStep[] = []
  let prev: Combo | null = null
  for (const c of result.frontier) {
    if (c.addedServices.length === 0) {
      prev = c
      continue
    }
    steps.push({
      addedNames: c.addedServices.map((id) => serviceLabel(result.region, id)),
      coveredCount: c.coveredCount,
      monthlyCost: c.monthlyCost,
      addFilms: c.coveredCount - (prev?.coveredCount ?? 0),
      addCost: Math.round((c.monthlyCost - (prev?.monthlyCost ?? 0)) * 100) / 100,
      recommended: c.monthlyCost <= result.recommended.monthlyCost,
    })
    prev = c
  }
  return steps
}
