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
 * Falls back to the Draft Room's function when the snapshot carries no
 * lineup or no teams -- an older worker -- which is exactly what every
 * caller did before. The returned function reads the board when CALLED,
 * so memoising it on (engine, snapshot) cannot freeze a value from before
 * the board arrived.
 *
 * Imports nothing, so a node suite can reach it. */
export function leagueGapOf(engine, snapshot) {
  if (!engine) return null
  const teams = snapshot && Array.isArray(snapshot.teams) ? snapshot.teams.length : 0
  const lineup = snapshot ? snapshot.lineup : null
  if (engine.replacementGapUnder && lineup && lineup.starters && teams > 0) {
    const rules = snapshot.rules || null
    return (player) => engine.replacementGapUnder(player, rules, lineup, teams)
  }
  return engine.replacementGap || null
}
