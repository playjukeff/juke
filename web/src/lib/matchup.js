/* A lineup's week as a mean and a spread, for the one matchup in front of
 * the reader.
 *
 * Imports nothing, for `leagueStore.js`'s reason: CI installs no npm
 * dependencies, every surface that draws this sits behind a connected
 * league, and the arithmetic that decides whether somebody is told they are
 * likely to lose should not be checkable only by looking at a screen.
 *
 * ---- What is here and what is deliberately not ----
 *
 * The MODEL is not here. `winRateAgainst()` in app.js is the normal
 * difference — P(i beats j) = Phi((mean_i - mean_j) / sqrt(var_i + var_j)) —
 * and its own comment records why it was split out of
 * `projectedWinPctForRoom()`: two approximations that drifted would
 * disagree by a fraction of a point and nothing would say so. So the room
 * calls `JukeEngine.winProbability()` and this file never re-derives it.
 *
 * What IS here is the part that is genuinely the caller's: turning the rows
 * a room already holds into the two numbers that model takes.
 *
 * ---- The assumption, stated once ----
 *
 * A starter's week is treated as independent of his team-mates', which is
 * the simplifying assumption `teamWeeklyStats()` already makes in app.js
 * and which projection tools of this kind make everywhere. It is what lets
 * a lineup's variance be the sum of its starters'. It is wrong in the
 * direction anybody would guess — a quarterback and his own receiver share
 * a good day — so a real lineup swings slightly more than this says, and a
 * probability built on it sits slightly closer to a certainty than it
 * should. Worth knowing before anybody reads 58% as a measurement.
 */

/* Below this many projected starters there is no lineup to price.
 *
 * Not a taste call: a "team" of two starters has a mean a third of a real
 * one's, so a matchup between a full lineup and a half-set one reports a
 * near-certainty that is entirely an artefact of a roster nobody has
 * finished setting. A reader would act on it. Sleeper pads an unfilled
 * slot with "0" and `lineupRows()` already drops those, so this is the
 * count of seats that actually carry a projection. */
const MIN_STARTERS = 5

/* One side of the matchup.
 *
 * `rows` are `lineupRows()`' own output — `{ player, projPts }` where
 * projPts is ALREADY the week under the league's rules, because that is
 * what `weekPts` is. So the mean is a sum and nothing is rescored here.
 *
 * `cv` is the measured spread per position from `JukeEngine.weeklyCV()`.
 * A position it has no entry for contributes its mean and no variance,
 * which is the conservative direction: an unmeasured spread makes the
 * matchup look MORE certain, so it is refused rather than guessed at —
 * `cv` missing entirely answers null, and one position missing from a
 * table that has the rest is a `players.js` shape nobody has seen.
 *
 * Answers null rather than a partial sum whenever a starter has no
 * projection, which is `projectedTotal()`'s own rule one file over: a total
 * that quietly omitted a player reads as a lineup worth less than it is,
 * and this one is about to be compared against another. */
export function teamWeek(rows, cv) {
  if (!Array.isArray(rows) || !cv) return null

  let mean = 0
  let variance = 0
  let counted = 0

  for (const row of rows) {
    if (!row || !row.player) return null
    if (row.projPts === null || row.projPts === undefined) return null
    const spread = cv[row.player.pos]
    if (spread === null || spread === undefined) return null
    const sd = spread * row.projPts
    mean += row.projPts
    variance += sd * sd
    counted += 1
  }

  if (counted < MIN_STARTERS) return null
  return { mean, stdev: Math.sqrt(variance), starters: counted }
}

/* How the probability should be read, in the reader's own words.
 *
 * A bare 58% is a number somebody treats as a measurement, and this one is
 * a scoring-strength estimate off two projected lineups — it does not know
 * that their tight end is questionable or that yours is on a short week.
 * The band is deliberately coarse for that reason: three states rather than
 * a percentage dressed as a forecast, and the percentage beside it.
 *
 * The boundaries are the ones the model's own error can support rather than
 * round numbers. `winRateAgainst()` is a normal difference over a CV
 * measured at MIN_SEASONS_FOR_CV per position, and the CV moves about a
 * fifth of itself between two published scoring tables — worth 1.3 points
 * of probability, measured. Ten points either side of even is comfortably
 * outside that; five would not be. */
const CLOSE = 0.1

export function matchupRead(p) {
  if (p === null || p === undefined) return null
  if (p >= 0.5 + CLOSE) return 'favoured'
  if (p <= 0.5 - CLOSE) return 'behind'
  return 'close'
}
