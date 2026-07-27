/**
 * Subplot — match-confidence scoring for the review step (pure, dependency-free).
 *
 * After resolution, most titles are dead-on and shouldn't cost the user a
 * glance. This scores each imported title against what TMDb returned so the UI
 * can surface ONLY the uncertain ones — an exception queue, not a review-all
 * chore. Scales from a 10-line note to a 1,400-title export: a clean export
 * flags ~nothing; a messy paste flags the few weird lines.
 */

// Leading articles + connective words that shouldn't count toward a title
// match. "v"/"vs" so "Ferrari v Ford" still scores 1.0 against "Ford v Ferrari".
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'v', 'vs', 'part']);

/** Normalize a title to comparable words: lowercase, drop apostrophes, turn
 *  punctuation into spaces, and drop articles/connectives. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Fraction of the imported title's meaningful words present in the matched
 *  title (0–1). 1 = every word is accounted for. */
export function titleMatchScore(imported: string, matched: string): number {
  const inTokens = titleTokens(imported);
  if (inTokens.length === 0) return 0;
  const matchedSet = new Set(titleTokens(matched));
  const hits = inTokens.filter((t) => matchedSet.has(t)).length;
  return hits / inTokens.length;
}

export type ReviewInput = {
  key: string;
  importedTitle: string;
  importedYear?: string;
  /** Resolved via an exact IMDb id (→ trust it), vs. a fuzzy title search. */
  hadId: boolean;
  /** The matched title's display fields, or null when nothing matched. */
  match: { title: string; year: string } | null;
};

export type ReviewReason = 'confident' | 'low-title-match' | 'year-mismatch' | 'unmatched';

export type ReviewVerdict = {
  key: string;
  /** 0–1 confidence. */
  score: number;
  needsReview: boolean;
  reason: ReviewReason;
};

/** A title scoring below this on word-coverage gets flagged for a look. */
export const REVIEW_THRESHOLD = 0.7;

/** Score one resolved (or unresolved) title. */
export function scoreMatch(item: ReviewInput): ReviewVerdict {
  if (!item.match) {
    return { key: item.key, score: 0, needsReview: true, reason: 'unmatched' };
  }
  // An exact-id resolution is trustworthy regardless of how the title reads.
  if (item.hadId) {
    return { key: item.key, score: 1, needsReview: false, reason: 'confident' };
  }
  const score = titleMatchScore(item.importedTitle, item.match.title);
  const yearMismatch =
    !!item.importedYear && !!item.match.year && item.importedYear !== item.match.year;
  if (yearMismatch) {
    return { key: item.key, score: Math.min(score, 0.5), needsReview: true, reason: 'year-mismatch' };
  }
  if (score < REVIEW_THRESHOLD) {
    return { key: item.key, score, needsReview: true, reason: 'low-title-match' };
  }
  return { key: item.key, score, needsReview: false, reason: 'confident' };
}

export type ReviewSummary = {
  verdicts: ReviewVerdict[];
  /** needsReview items, worst score first — the exception queue the UI shows. */
  flagged: ReviewVerdict[];
  confidentCount: number;
  unmatchedCount: number;
};

/** Score a whole batch and partition it into the confident set + the flagged
 *  queue (sorted worst-first) the review UI presents. */
export function buildReviewSummary(items: ReviewInput[]): ReviewSummary {
  const verdicts = items.map(scoreMatch);
  const flagged = verdicts
    .filter((v) => v.needsReview)
    .sort((a, b) => a.score - b.score);
  return {
    verdicts,
    flagged,
    confidentCount: verdicts.filter((v) => !v.needsReview).length,
    unmatchedCount: verdicts.filter((v) => v.reason === 'unmatched').length,
  };
}
