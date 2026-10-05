// Fuzzy matching for quick open. A query matches when its characters appear
// in order in the path ("qkop" finds "quick-open.md"); spaces split it into
// parts that must each match, left to right. Matches score higher in the
// file name, at word starts and in runs, so the likeliest file comes first.

export interface Match {
  score: number;
  /** Indices of the matched characters in the target, for highlighting. */
  positions: number[];
}

const SEPARATOR = /[\\/]/;
const WORD_BREAK = /[\\/\-_. ]/;

const BONUS_CHAR = 1;
const BONUS_WORD_START = 8;
const BONUS_CONSECUTIVE = 5;
const BONUS_IN_NAME = 4;
const BONUS_NAME_START = 10;
const MAX_GAP_PENALTY = 5;

function isWordStart(target: string, i: number): boolean {
  if (i === 0) return true;
  const prev = target[i - 1];
  if (WORD_BREAK.test(prev)) return true;
  // camelCase hump: "quickOpen" → "O"
  return prev === prev.toLowerCase() && target[i] !== target[i].toLowerCase();
}

/** Scores one part matched at the given positions. */
function scorePositions(target: string, positions: number[], nameStart: number): number {
  let score = 0;
  positions.forEach((pos, i) => {
    score += BONUS_CHAR;
    if (isWordStart(target, pos)) score += BONUS_WORD_START;
    if (pos >= nameStart) score += BONUS_IN_NAME;
    if (pos === nameStart) score += BONUS_NAME_START;
    if (i > 0) {
      const gap = pos - positions[i - 1] - 1;
      score += gap === 0 ? BONUS_CONSECUTIVE : -Math.min(gap, MAX_GAP_PENALTY);
    }
  });
  return score;
}

/**
 * The best placement of `part` in `lower` at or after `from`. Tries every
 * position of the first character and extends each greedily, preferring a
 * consecutive character when there is one: cheap, and close to optimal for
 * the short strings file paths are.
 */
function matchPart(target: string, lower: string, part: string, from: number, nameStart: number): Match | null {
  let best: Match | null = null;
  for (let start = lower.indexOf(part[0], from); start !== -1; start = lower.indexOf(part[0], start + 1)) {
    const positions = [start];
    for (let i = 1; i < part.length; i++) {
      const prev = positions[i - 1];
      const next = lower[prev + 1] === part[i] ? prev + 1 : lower.indexOf(part[i], prev + 1);
      if (next === -1) break;
      positions.push(next);
    }
    if (positions.length < part.length) break; // later starts can't fit either
    const score = scorePositions(target, positions, nameStart);
    if (!best || score > best.score) best = { score, positions };
  }
  return best;
}

/** Matches `query` against `target` (a path), or returns null. An empty query matches everything with score 0. */
export function fuzzyMatch(query: string, target: string): Match | null {
  const parts = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = target.toLowerCase();
  let nameStart = 0;
  for (let i = target.length - 1; i >= 0; i--) {
    if (SEPARATOR.test(target[i])) {
      nameStart = i + 1;
      break;
    }
  }
  const result: Match = { score: 0, positions: [] };
  let from = 0;
  for (const part of parts) {
    const match = matchPart(target, lower, part, from, nameStart);
    if (!match) return null;
    result.score += match.score;
    result.positions.push(...match.positions);
    from = match.positions[match.positions.length - 1] + 1;
  }
  return result;
}

export interface Candidate {
  /** The text matched and sorted on: a path relative to the folder, or the shown location + name. */
  key: string;
  /** Position in the recent files (0 = most recent), or Infinity if not recent. */
  recent: number;
}

export interface Ranked<T> {
  item: T;
  match: Match;
}

const byPath = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/**
 * Orders candidates for display. With an empty query: recent files by
 * recency, then the rest by path. Otherwise only matches, best first, ties
 * going to the more recent file and then to the path.
 */
export function rankFiles<T extends Candidate>(items: T[], query: string): Ranked<T>[] {
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, item.key);
    if (match) ranked.push({ item, match });
  }
  return ranked.sort(
    (a, b) => b.match.score - a.match.score || a.item.recent - b.item.recent || byPath(a.item.key, b.item.key),
  );
}
