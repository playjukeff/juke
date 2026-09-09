/* The nine verdicts a decision can carry, and nothing else.
 *
 * Juke Journey v3's own vocabulary, read out of the prototype's `badge()`
 * map rather than paraphrased from its README -- the README lists nine
 * glyphs and the source is what says which label and which colour goes
 * with each.
 *
 * ---- One copy, because three places need it and they must agree ----
 *
 * The History screen draws these, My League's past-week body draws them,
 * and the grading job WRITES them into `decisions.verdict`. A room that
 * rendered its own idea of what "changed" means, or a grader that wrote a
 * key nothing draws, would fail silently in the direction this project
 * keeps finding: the badge falls through to "pending" and a graded row
 * reads as ungraded for ever.
 *
 * So `VERDICTS` is the enum, `verdictKeys` is what a grader may write, and
 * `verdictFor()` is what a component draws. Nothing hardcodes a glyph.
 *
 * ---- The colours are tokens, not the handoff's hexes ----
 *
 * `--pos`/`--neg` are `gain`/`cost`. They were `mint`/`flow.rose`, which
 * was this codebase's positive and negative pair when this file was
 * written and stopped being it when the decision system landed: mint is
 * the rail's "you are here" and the room-card accent, and a verdict is a
 * value. `--warn` had no equivalent and is `flow.amber`; see
 * tailwind.config.js for why it is not `flow.gold`.
 *
 * Three surfaces read these and only this file writes them, which is the
 * point -- the hand-rolled copies in WeekStrip.jsx and MyLeagueDemo.jsx
 * had drifted to `text-mint` on their own and now read `VERDICTS` instead.
 */

export const VERDICTS = {
  good: { glyph: '✓', label: 'Good call', tone: 'text-gain' },
  bad: { glyph: '✕', label: 'Bad call', tone: 'text-cost' },
  ignored: { glyph: '—', label: 'Ignored', tone: 'text-ink-muted' },
  incon: { glyph: '?', label: 'Inconclusive', tone: 'text-flow-amber' },
  insuf: { glyph: '·', label: 'Insufficient evidence', tone: 'text-ink-muted' },
  changed: { glyph: '↻', label: 'Circumstances changed', tone: 'text-flow-amber' },
  recchanged: { glyph: '⇄', label: 'Recommendation changed', tone: 'text-flow-amber' },
  pending: { glyph: '◌', label: 'Pending', tone: 'text-ink-soft' },
  expired: { glyph: '⊘', label: 'Expired', tone: 'text-ink-muted' },
}

/* Every key a grader may write. Exported so the grading job and any test
   of it can be checked against this list rather than against a literal --
   a verdict nothing can draw is worse than an ungraded row, because it
   looks graded in the database and reads as pending on screen. */
export const VERDICT_KEYS = Object.keys(VERDICTS)

/* What a component draws.
 *
 * An unknown or absent verdict resolves to `pending`, which is the honest
 * answer for the state this ledger spends most of its life in: a decision
 * is written when it is made and graded only after the week is over, so
 * "not yet" is the norm rather than an edge case. */
export function verdictFor(verdict) {
  return VERDICTS[verdict] || VERDICTS.pending
}

/* ---- The outcome filter's four buckets ----
 *
 * The handoff's own set: All / Good call / Bad call / Pending / Other.
 * "Other" is every verdict that is not one of the three named ones, which
 * is five of the nine -- derived here rather than listed, so a tenth
 * verdict lands in it automatically instead of vanishing from the filter
 * the day it is added. */
export const NAMED_OUTCOMES = ['good', 'bad', 'pending']

export function matchesOutcome(bucket, verdict) {
  const key = VERDICTS[verdict] ? verdict : 'pending'
  if (bucket === 'All') return true
  if (bucket === 'Other') return NAMED_OUTCOMES.indexOf(key) < 0
  if (bucket === 'Good call') return key === 'good'
  if (bucket === 'Bad call') return key === 'bad'
  if (bucket === 'Pending') return key === 'pending'
  return true
}

/* ---- The confidence filter ----
 *
 * High >= 75, Mid 60-74, Low < 60, straight from the prototype. A decision
 * with no confidence recorded is not "low" -- it is unknown, and counting
 * it as low would be the "treat 0 from an API as missing" rule broken from
 * the other side. It matches only "All". */
export const CONFIDENCE_BUCKETS = ['All', 'High ≥75', 'Mid 60–74', 'Low <60']

/* Which bucket a number falls in, or null for a decision that recorded no
   confidence at all.
 *
 * ---- This exists so a row and the filter above it cannot disagree ----
 *
 * The decision system's global rule is that confidence never appears as a
 * bare percentage, and this screen's rows carried one -- "STRATEGY · WK 4
 * · 68%". <Confidence> is the usual replacement and it cannot be used
 * here: it shows signals, error and sample, and a decision record carries
 * none of the three. Inventing them would be the thing that rule exists to
 * stop, one layer in.
 *
 * What the record does support is the band, because the screen already
 * sorts every row into one to filter on it. So the row names the band, and
 * it reads it from the same thresholds `matchesConfidence()` reads -- a
 * second copy would let a row read "MID" while the Mid filter hid it, and
 * neither number nor label would look wrong on its own. */
export function confidenceBucket(confidence) {
  if (typeof confidence !== 'number' || !isFinite(confidence)) return null
  if (confidence >= 75) return CONFIDENCE_BUCKETS[1]
  if (confidence >= 60) return CONFIDENCE_BUCKETS[2]
  return CONFIDENCE_BUCKETS[3]
}

/* The band's name on its own -- "High", "Mid", "Low" -- for a row that has
   no room for the threshold beside it.
 *
 * Derived off the bucket rather than written down again. A second literal
 * here is how a row comes to read "Mid" for a decision the Mid filter
 * hides, and neither half looks wrong on its own. */
export function confidenceLabel(confidence) {
  const bucket = confidenceBucket(confidence)
  return bucket ? bucket.split(' ')[0] : null
}

export function matchesConfidence(bucket, confidence) {
  if (bucket === 'All') return true
  return confidenceBucket(confidence) === bucket
}
