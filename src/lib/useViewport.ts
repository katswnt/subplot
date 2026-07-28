import { useEffect, useState } from 'react'

/**
 * Which results layout applies, from viewport width:
 * - `wide`    (≥1100px) → two-column desktop: receipt rail + where-to-watch
 *                          side by side, no tab.
 * - `wideish` (≥700px)  → still a single column, but shelves can go 2-up (the
 *                          intermediate laptop/half-window state).
 * Inline styles can't express media queries, and the desktop layout changes
 * *which* components mount (both lenses vs. one behind a tab), not just CSS — so
 * this is a JS breakpoint, updated on resize via matchMedia.
 */
export type Viewport = { wide: boolean; wideish: boolean }

const read = (): Viewport =>
  typeof window === 'undefined'
    ? { wide: false, wideish: false }
    : {
        wide: window.matchMedia('(min-width: 1100px)').matches,
        wideish: window.matchMedia('(min-width: 700px)').matches,
      }

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read)
  useEffect(() => {
    const queries = ['(min-width: 1100px)', '(min-width: 700px)'].map((q) => window.matchMedia(q))
    const onChange = () => setVp(read())
    queries.forEach((m) => m.addEventListener('change', onChange))
    return () => queries.forEach((m) => m.removeEventListener('change', onChange))
  }, [])
  return vp
}
