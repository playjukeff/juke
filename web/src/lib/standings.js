/* Ordering a league table, and knowing when there isn't one.
 *
 * Plain module rather than living in StandingsPanel.jsx for the reason
 * countdown.js is one: it is pure arithmetic about a league, and a node
 * suite can drive it without a browser. StandingsPanel re-exports both, so
 * no consumer had to change.
 */

/* Wins, then points for.
 *
 * ESPN publishes its own tiebreak settings and this does not read them, so
 * a league that breaks ties differently would disagree with us — worth
 * knowing before trusting the gap between two teams on the same record. */
export function ordered(teams) {
  return [...teams].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor))
}

/* Has anybody played yet.
 *
 * Reported the morning after a draft: "it's showing me in 9th place even
 * though we have yet to play a game". It was, and the number meant nothing.
 * Before week one every team is 0-0 with 0 points for, so BOTH of
 * ordered()'s keys are 0 for everybody — the sort is a no-op and what got
 * numbered 1..10 was the order ESPN happened to return its teams in. The
 * reader was ninth because their ESPN team id is 9.
 *
 * That is this project's own "a component that is the same for every team"
 * failure, one floor up: a constant presented as a ranking. Nothing is
 * wrong with the sort — there is no standing yet, and the honest answer is
 * to say so rather than to invent an order.
 *
 * StandingsPanel already knew this: it hid its KPI strip on exactly this
 * condition, and simply never applied it to the rank column beside it. */
export function hasPlayed(teams) {
  return (teams || []).some((t) => t.wins || t.losses || t.ties || t.pointsFor)
}
