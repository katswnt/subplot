import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ResolveMatch, SearchCandidate } from '@subplot/api-client'
import type { ReviewVerdict } from '@subplot/domain/review'
import ReviewStep from '../../src/components/ReviewStep'

const flagged: ReviewVerdict[] = [
  { key: 'k1', score: 0, needsReview: true, reason: 'unmatched' },
  { key: 'k2', score: 0.5, needsReview: true, reason: 'low-title-match' },
]
const matches: Record<string, ResolveMatch> = {
  k2: { mediaType: 'movie', id: 1, title: 'Spider-Man: No Way Home', year: '2021', posterPath: null },
}
const importedTitleByKey = { k1: 'New Zombieland', k2: 'New Spider-Man' }

const setup = (onSearch: (q: string) => Promise<SearchCandidate[]> = vi.fn(async () => [])) => {
  const onConfirm = vi.fn<(excluded: string[], overrides: Record<string, SearchCandidate>) => void>()
  render(
    <ReviewStep
      flagged={flagged}
      matches={matches}
      importedTitleByKey={importedTitleByKey}
      confidentCount={20}
      onSearch={onSearch}
      onConfirm={onConfirm}
      onBack={vi.fn()}
    />,
  )
  return { onConfirm }
}

describe('ReviewStep', () => {
  it('shows the confident count and the flagged queue', () => {
    setup()
    expect(screen.getByText(/20 matched cleanly — 2 need a look/i)).toBeInTheDocument()
    expect(screen.getByText(/you typed: New Spider-Man/i)).toBeInTheDocument()
    expect(screen.getByText(/Spider-Man: No Way Home/)).toBeInTheDocument()
    expect(screen.getByText(/No match found/i)).toBeInTheDocument()
  })

  it('defaults unmatched to skipped and matched to kept', () => {
    setup()
    expect(screen.getByRole('button', { name: /Keeping: New Spider-Man/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Skipped: New Zombieland/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /price 21 titles/i })).toBeInTheDocument()
  })

  it('confirms with the unmatched key excluded by default and no overrides', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /price 21 titles/i }))
    expect(onConfirm).toHaveBeenCalledWith(['k1'], {})
  })

  it('lets the user skip a matched title and keep an unmatched one', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Keeping: New Spider-Man/i })) // skip k2
    fireEvent.click(screen.getByRole('button', { name: /Skipped: New Zombieland/i })) // keep k1
    fireEvent.click(screen.getByRole('button', { name: /price 21 titles/i }))
    expect(onConfirm).toHaveBeenCalledWith(['k2'], {})
  })

  it('searches and picks a correct match for an unmatched title', async () => {
    const candidate: SearchCandidate = {
      mediaType: 'movie',
      id: 99,
      title: 'Zombieland: Double Tap',
      year: '2019',
      posterPath: null,
    }
    const onSearch = vi.fn(async () => [candidate])
    const { onConfirm } = setup(onSearch)

    // Open the search box on the unmatched row, search, and pick the result.
    fireEvent.click(screen.getByRole('button', { name: /search for it/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }))
    const result = await screen.findByRole('button', { name: /Zombieland: Double Tap/i })
    fireEvent.click(result)

    expect(onSearch).toHaveBeenCalledWith('New Zombieland')
    // k1 is now corrected + kept → 20 + k2 + k1 = 22.
    fireEvent.click(screen.getByRole('button', { name: /price 22 titles/i }))
    expect(onConfirm).toHaveBeenCalledWith([], { k1: candidate })
  })
})
