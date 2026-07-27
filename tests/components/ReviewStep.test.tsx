import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ResolveMatch } from '@subplot/api-client'
import type { ReviewVerdict } from '@subplot/domain/review'
import ReviewStep from '../../src/components/ReviewStep'

const flagged: ReviewVerdict[] = [
  { key: 'k1', score: 0, needsReview: true, reason: 'unmatched' },
  { key: 'k2', score: 0.5, needsReview: true, reason: 'low-title-match' },
]
const matches: Record<string, ResolveMatch> = {
  k2: { mediaType: 'movie', id: 1, title: 'Spider-Man: No Way Home', year: '2021', posterPath: null },
}
const importedTitleByKey = { k1: 'Griffin recommended…', k2: 'New Spider-Man' }

const setup = () => {
  const onConfirm = vi.fn<(excluded: string[]) => void>()
  render(
    <ReviewStep
      flagged={flagged}
      matches={matches}
      importedTitleByKey={importedTitleByKey}
      confidentCount={20}
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
    // Matched k2 is kept; unmatched k1 is skipped (title-based labels).
    expect(screen.getByRole('button', { name: /Keeping: New Spider-Man/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Skipped: Griffin/i })).toBeInTheDocument()
    // Keeping = 20 confident + 1 kept flagged (k2).
    expect(screen.getByRole('button', { name: /price 21 titles/i })).toBeInTheDocument()
  })

  it('confirms with the unmatched key excluded by default', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /price 21 titles/i }))
    expect(onConfirm).toHaveBeenCalledWith(['k1'])
  })

  it('lets the user skip a matched title and keep an unmatched one', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Keeping: New Spider-Man/i })) // skip k2
    fireEvent.click(screen.getByRole('button', { name: /Skipped: Griffin/i })) // keep k1
    // Now k2 excluded, k1 included → still keeping 21 (20 + k1).
    fireEvent.click(screen.getByRole('button', { name: /price 21 titles/i }))
    expect(onConfirm).toHaveBeenCalledWith(['k2'])
  })
})
