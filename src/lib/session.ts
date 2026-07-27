import type { ImportedFilm, ImportSource } from '@subplot/domain/imports'
import type { StreamingFilm } from '@subplot/domain/streaming'
import type { AdPolicy, Objective } from '../components/OptimizerControls'

/**
 * Device-local session persistence so people don't re-paste/re-upload every
 * visit. Lives ONLY in this browser's localStorage — never sent to a server,
 * no cookie, no account, nothing to track. One versioned key; bump `V` to
 * invalidate old shapes.
 */
const KEY = 'subplot:session'
const V = 1
const PREFS_KEY = 'subplot:prefs'
const PREFS_V = 1

export type SessionConfig = {
  owned: string[]
  region: string
  adPolicy: AdPolicy
  objective: Objective
  budget: number | null
  includeLibraryFree: boolean
  ownedTier: Record<string, string>
}

export type SavedSession = {
  v: number
  savedAt: number
  source: ImportSource
  films: ImportedFilm[]
  config: SessionConfig
  /** The last priced result, so a return visit can show results instantly. */
  resolved?: {
    streamingFilms: StreamingFilm[]
    unresolvedCount: number
    providerLogos: Record<number, string>
    checkedAt: number
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SavedSession
    if (s.v !== V || !Array.isArray(s.films) || s.films.length === 0) return null
    return s
  } catch {
    return null
  }
}

export function saveSession(s: Omit<SavedSession, 'v'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: V }))
  } catch {
    // Quota exceeded / private mode / disabled storage — persistence is a
    // nicety, never block the app on it.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Durable optimizer preferences — which services you own (+ tiers), ad policy,
 * objective, budget, region. Stored SEPARATELY from the session so they stick
 * across watchlists and survive "Start fresh": your subscriptions are a
 * standing fact about you, not part of one list. Pre-selected on every visit.
 */
export function loadPrefs(): SessionConfig | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { v: number; config: SessionConfig }
    if (p.v !== PREFS_V || !p.config || !Array.isArray(p.config.owned)) return null
    return p.config
  } catch {
    return null
  }
}

export function savePrefs(config: SessionConfig): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: PREFS_V, config }))
  } catch {
    // persistence is a nicety, never block on it
  }
}

/** How stale the cached availability is, in whole days. */
export function ageInDays(ts: number, now: number): number {
  return Math.floor((now - ts) / (24 * 60 * 60 * 1000))
}

/** Short relative label for "saved 3 days ago" etc. */
export function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
