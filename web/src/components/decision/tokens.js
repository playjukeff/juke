/* The decision system's few values that a style prop needs rather than a
   class, and the two helpers every primitive shares.

   Almost nothing is here on purpose. `cost`, `gain`, `evidence`, `stake`,
   `ink-label`, `hairline`, `divider`, the radii, the type roles and
   `font-decision` are all Tailwind tokens (web/tailwind.config.js) and the
   components use them by name. What a class cannot express is a colour
   chosen at runtime — the accent on a KPI card, the fill on a bar whose
   sign is data — because Tailwind's JIT finds classes by grepping source
   text and `bg-${accent}` compiles to nothing at all. That trap is
   documented twice already in this repo (draftRoomPositions.js's two class
   maps, RoomHero.jsx's per-room accent) and this is the third instance of
   the same answer: a literal map, read into a style prop. */

export const COST = '#E39284'
export const COST_DEEP = '#BE6153'
export const GAIN = '#ABDFC7'
export const EVIDENCE = '#AACAF2'
export const STAKE = '#FBD5A8'
export const STAKE_INK = '#161D26'
export const INK_MUTED = '#8A9BAA'

/* What a KPI card's 20x3px rule says the number IS. Four meanings, and teal
   is not among them — see KpiStrip.jsx. `cost` takes the deep step because
   the rule is a mark rather than type, and the deep step is the one this
   repo already draws marks in (NetAdpValueCard's oxblood). */
export const KPI_ACCENT = {
  cost: COST_DEEP,
  gain: GAIN,
  evidence: EVIDENCE,
  stake: STAKE,
}

/* A bar's fill. Signed bars take the sign colour; an unsigned quantity — a
   market gap, a share, a count — takes evidence, which is the whole reason
   evidence exists as a token rather than a bar just borrowing teal. */
export const BAR_FILL = {
  cost: COST_DEEP,
  gain: GAIN,
  evidence: EVIDENCE,
}

/* A real minus, never a hyphen.

   U+2212 next to U+002D in the same column of a mono table is two glyphs of
   different widths for one meaning, and the page has both: `shortName()`
   and every hyphenated surname supply the hyphen. One helper, so a sign is
   never typed by hand at a call site.

   `value` may already carry its own sign (an engine string like "+21 vs
   room"), in which case it is passed through untouched — the rule is that
   every signed number has a real sign, not that this function is the only
   thing allowed to produce one. */
export function signed(value, sign) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    if (/^[+−]/.test(value)) return value
    if (/^-/.test(value)) return '−' + value.slice(1)
    return sign === 'gain' ? '+' + value : sign === 'cost' ? '−' + value : value
  }
  const n = Math.abs(value)
  return (value < 0 || sign === 'cost' ? '−' : '+') + n
}

/* Which way a number went, for a caller that has the number rather than a
   pre-formatted string. Zero is neither: it takes the unsigned ink, because
   a nought in a sign colour claims a direction it does not have. */
export function signOf(value) {
  if (typeof value !== 'number' || value === 0) return null
  return value < 0 ? 'cost' : 'gain'
}
