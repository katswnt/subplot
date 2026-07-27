import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { StreamingFilm } from '@subplot/domain/streaming'
import WhereToWatch from '../../src/components/WhereToWatch'

// Netflix 8, Max 1899, Tubi 73 (free).
const films: StreamingFilm[] = [
  { key: 'A', title: 'On Max', providerIds: [1899] },
  { key: 'B', title: 'On Netflix', providerIds: [8] },
  { key: 'C', title: 'On Tubi', providerIds: [73] },
  { key: 'D', title: 'Nowhere', providerIds: [] },
]

describe('WhereToWatch', () => {
  it('headlines how many are watchable now (owned + free)', () => {
    render(<WhereToWatch films={films} owned={['max']} region="US" />)
    // A (Max, owned) + C (Tubi, free) = 2 of 4.
    expect(screen.getByRole('heading', { name: /2 of 4 titles are watchable right now/i })).toBeInTheDocument()
  })

  it('groups titles under your owned + free services (owned + free notes)', () => {
    render(<WhereToWatch films={films} owned={['max']} region="US" />)
    // Max is owned; Tubi is free — Netflix (not owned) gets no group.
    expect(screen.getByText(/subscribed/i)).toBeInTheDocument()
    expect(screen.getByText(/free · with ads/i)).toBeInTheDocument()
  })

  it('shows every title in the list, and filters to yours on demand', () => {
    render(<WhereToWatch films={films} owned={['max']} region="US" />)
    // Ungrouped titles (Netflix-only, nowhere) appear only in the per-title list.
    expect(screen.getByText('On Netflix')).toBeInTheDocument()
    expect(screen.getByText('not streaming')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /on my services only/i }))
    // Filtering to yours drops the Netflix-only + nowhere titles.
    expect(screen.queryByText('On Netflix')).not.toBeInTheDocument()
    expect(screen.queryByText('not streaming')).not.toBeInTheDocument()
  })
})
