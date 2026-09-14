/* The season-value pricing function for a connected league's rooms.
 *
 * Every screen that prices a claim, a trade or a roster in points over
 * replacement asks `gapOf(player)`. It was JukeEngine.replacementGap, which
 * reads the Draft Room's own scoring and team count -- so a 12-team full-PPR
 * league was priced as a 10-team half-PPR mock (the audit of 10 September
 * 2026). This hands back the same shape of function, priced under the
 * league the snapshot describes: its rules, its lineup, its team count.
 *
 * One builder, because six screens construct a `gapOf` (the Waiver and
 * Trade rooms, the rooms grid's stakes, and v3's wire tool, trade tool and
 * league pages) and six copies of "which league do I price under" is the
 * written-down-twice failure with a pricing rule in it.
 *
 * ---- In season, it prices the REST of the season ----
 *
 * Once a regular season is being played (JukeEngine.rosLive()), a waiver
 * claim or a trade is a decision about the weeks that are left, and the
 * preseason projection is the one number that has not heard about any of
 * the weeks that have gone. So in season this prices on rosGapUnder():
 * app.js's rest-of-season points over a rest-of-season replacement, under
 * the same rules, lineup and team count (section 10a2 has the model and
 * its backtest). Out of season it is exactly the function it always was,
 * and a build of app.js that predates the season path falls through to it.
 *
 * Falls back to the Draft Room's function when the snapshot carries no
 * lineup or no teams -- an older worker -- which is exactly what every
 * caller did before. The returned function reads the board when CALLED,
 * so memoising it on (engine, snapshot) cannot freeze a value from before
 * the board arrived -- and it asks rosLive() when called too, so a page
 * held open across the nightly that starts the season does not keep
 * pricing on the preseason.
 *
 * Imports nothing, so a node suite can reach it. */
export function leagueGapOf(engine, snapshot) {
  if (!engine) return null
  const teams = snapshot && Array.isArray(snapshot.teams) ? snapshot.teams.length : 0
  const lineup = snapshot ? snapshot.lineup : null
  const rules = snapshot ? snapshot.rules || null : null
  const shaped = !!(lineup && lineup.starters && teams > 0)
  const preseason = engine.replacementGapUnder && shaped
    ? (player) => engine.replacementGapUnder(player, rules, lineup, teams)
    : engine.replacementGap || null
  if (!engine.rosLive || !engine.rosGapUnder) return preseason
  return (player) => {
    if (!engine.rosLive()) return preseason ? preseason(player) : null
    return shaped
      ? engine.rosGapUnder(player, rules, lineup, teams)
      : engine.rosGapUnder(player, rules)
  }
}

/* What that function's answer IS, in the words a caption uses.
 *
 * The figure changes horizon the day the season starts and every caption
 * beside it said "season points over replacement" — right in August and
 * wrong in October, which is this project's own right-value-wrong-column
 * failure with a horizon instead of a table. Measured on the fixture
 * league in week 5: Hunter Henry is 6.1 points BELOW replacement on the
 * preseason board and 6.2 ABOVE it on the rest of the season, and the wire
 * lists him because of the second number. A caption naming the first is
 * not a wording problem.
 *
 * Asked at render time rather than memoised, for leagueGapOf()'s own
 * reason: a page held open across the nightly that starts the season has
 * to move with it. */
export function gapUnit(engine) {
  const live = !!(engine && engine.rosLive && engine.rosLive())
  return live
    ? { short: 'ros pts', gap: 'ros pts over repl.', long: 'rest-of-season points over replacement', word: 'rest of season' }
    : { short: 'season pts', gap: 'season pts over repl.', long: 'season points over replacement', word: 'season' }
}
