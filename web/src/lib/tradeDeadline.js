/* Whether a connected league is still trading, for the Trade Room.
 *
 * Screen 14 of the decision guide is "Trade · deadline passed", and until
 * 9 September 2026 CLAUDE.md listed it under the screens the data cannot
 * answer: *"No adapter reports a deadline date."* That was measured and is
 * false — both platforms publish one, and neither adapter was reading it:
 *
 *     ESPN     settings.tradeSettings.deadlineDate  1796230800000
 *              -> 2026-12-02T17:00:00Z, an INSTANT
 *     Sleeper  settings.trade_deadline              11
 *              -> a WEEK number
 *
 * That is the second blocker in that section falsified by looking rather
 * than by anything changing, after the matchups fetch. The file's own
 * instruction now reads "re-measure before re-asserting"; this is what it
 * is for.
 *
 * ---- Why the snapshot carries two fields and this file takes both ----
 *
 * Neither unit converts to the other for free. ESPN's instant becomes a week
 * only with the date each week begins, which no view the adapter requests
 * carries; Sleeper's week becomes an instant with the same missing table,
 * read from the other end. So `tradeDeadline` is `{ at, week, disabled }`
 * with each field null where its platform does not publish it — the shape
 * `waiver` already uses, for the same reason.
 *
 * What makes that workable rather than a fork is that the QUESTION is the
 * same either way: has the window shut. This answers it from whichever field
 * is present, so no screen asks which platform it is looking at.
 *
 * ---- One boundary here is unmeasured, and it errs open ----
 *
 * No Sleeper league past its own deadline was available, so which side of
 * week 11 a "week 11" deadline falls on is not established. `passed` is
 * therefore strictly LATER than the stated week: week 11 itself still reads
 * as open.
 *
 * The direction is deliberate. Wrong that way, a reader is told they may
 * still trade for one week longer than they may — and the room prints the
 * deadline week beside it, so the fact is on screen to be checked. Wrong the
 * other way, the room tells somebody the window is shut while their league
 * is still processing trades, which is a room refusing to do its job.
 * Re-measure against a real Sleeper league in week 12 and tighten it.
 */

/* The four states, and every one of them renders.
 *
 * `unknown` is the one worth naming: it means we could not find out, which
 * is not the same as "open" and must not be drawn as either open or shut.
 * That is the rule leagueStore.js paid for — a state meaning "no answer"
 * that some caller renders as nothing is how a card vanishes off a page. */
export function tradeWindow(deadline, opts) {
  const o = opts || {}
  const d = deadline || null
  if (!d) return { state: 'unknown', at: null, week: null }

  // Checked first: a league that never allows trades has no window to be
  // open or shut, and Sleeper carries a `trade_deadline` week on one of
  // those exactly as ESPN carries a FAAB budget on a league that never bids.
  if (d.disabled === true) return { state: 'disabled', at: null, week: null }

  const at = Number.isFinite(d.at) && d.at > 0 ? d.at : null
  const week = Number.isFinite(d.week) && d.week > 0 ? d.week : null
  if (at === null && week === null) return { state: 'unknown', at: null, week: null }

  // The instant is the more specific of the two and is preferred where a
  // platform gives one -- it answers to the hour rather than to the week.
  if (at !== null) {
    const now = Number.isFinite(o.now) ? o.now : Date.now()
    return { state: now >= at ? 'passed' : 'open', at, week }
  }

  // Week-only, which is Sleeper. An unknown current week cannot be compared,
  // and answering 'open' there would be a guess wearing an answer's clothes.
  const cur = Number.isFinite(o.week) && o.week > 0 ? o.week : null
  if (cur === null) return { state: 'unknown', at: null, week }
  return { state: cur > week ? 'passed' : 'open', at: null, week }
}

/* How long is left, in the milliseconds `countdown.js` already formats.
 *
 * Only ever answered off an instant. A week number cannot become a duration
 * without the table this file's header says nobody has, and returning a
 * plausible one derived from an average week length would be a number a
 * reader would take literally. */
export function msUntilDeadline(deadline, now) {
  const w = tradeWindow(deadline, { now })
  if (w.state !== 'open' || w.at === null) return null
  const t = Number.isFinite(now) ? now : Date.now()
  return Math.max(0, w.at - t)
}
