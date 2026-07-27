import { afterEach, describe, expect, it } from 'vitest'

import {
  loadSession,
  saveSession,
  clearSession,
  ageInDays,
  relativeTime,
  type SavedSession,
} from '../../src/lib/session'

const base: Omit<SavedSession, 'v'> = {
  savedAt: 1_000,
  source: 'letterboxd',
  films: [{ title: 'Parasite', year: '2019', mediaType: 'movie', key: 'ty:parasite|2019' }],
  config: {
    owned: ['netflix'],
    region: 'US',
    adPolicy: 'adfree',
    objective: 'value',
    budget: null,
    includeLibraryFree: true,
    ownedTier: { netflix: 'adfree' },
  },
}

afterEach(() => {
  clearSession()
})

describe('session persistence', () => {
  it('round-trips a saved session through localStorage', () => {
    saveSession(base)
    const loaded = loadSession()
    expect(loaded).not.toBeNull()
    expect(loaded!.films).toHaveLength(1)
    expect(loaded!.films[0].title).toBe('Parasite')
    expect(loaded!.config.owned).toEqual(['netflix'])
    expect(loaded!.v).toBe(1)
  })

  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull()
  })

  it('drops a session with no films (nothing worth restoring)', () => {
    saveSession({ ...base, films: [] })
    expect(loadSession()).toBeNull()
  })

  it('drops a session written under an older schema version', () => {
    localStorage.setItem('subplot:session', JSON.stringify({ ...base, v: 0 }))
    expect(loadSession()).toBeNull()
  })

  it('ignores malformed JSON without throwing', () => {
    localStorage.setItem('subplot:session', '{not json')
    expect(loadSession()).toBeNull()
  })

  it('persists a resolved-result snapshot for instant return visits', () => {
    saveSession({
      ...base,
      resolved: {
        streamingFilms: [{ key: 'ty:parasite|2019', title: 'Parasite', providerIds: [8] }],
        unresolvedCount: 0,
        providerLogos: { 8: '/netflix.png' },
        checkedAt: 5_000,
      },
    })
    const loaded = loadSession()
    expect(loaded!.resolved?.checkedAt).toBe(5_000)
    expect(loaded!.resolved?.streamingFilms[0].providerIds).toEqual([8])
  })

  it('clearSession removes the stored session', () => {
    saveSession(base)
    clearSession()
    expect(loadSession()).toBeNull()
  })
})

describe('freshness helpers', () => {
  const day = 24 * 60 * 60 * 1000

  it('ageInDays counts whole elapsed days', () => {
    expect(ageInDays(0, 0)).toBe(0)
    expect(ageInDays(0, day - 1)).toBe(0)
    expect(ageInDays(0, day)).toBe(1)
    expect(ageInDays(0, 3 * day + 100)).toBe(3)
  })

  it('relativeTime renders human labels across scales', () => {
    const now = 100 * day
    expect(relativeTime(now, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60 * 1000, now)).toBe('5 min ago')
    expect(relativeTime(now - 3 * 60 * 60 * 1000, now)).toBe('3h ago')
    expect(relativeTime(now - day, now)).toBe('yesterday')
    expect(relativeTime(now - 4 * day, now)).toBe('4 days ago')
  })
})
