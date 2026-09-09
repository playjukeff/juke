/* A connected league's schedule, from the reader's side of it.
 *
 * The snapshot carries every matchup for every team; a screen almost always
 * wants one team's, so this is the projection between the two. Pure, and it
 * reads no clock -- the week is passed in, the way room.js takes `now`.
 *
 * Absent rather than empty throughout: a league with no schedule (Sleeper,
 * today) answers null and a screen draws nothing, rather than an empty
 * fixture list implying a season with no games in it.
 */

/* Every game this team plays, in week order.
 *
 * `opponentId` is null for a bye, which is a real week rather than a
 * missing one -- an odd league size produces them, and a screen that
 * dropped the row would silently renumber somebody's season. */
export function myGames(schedule, ownerId) {
  if (!schedule || !Array.isArray(schedule.matchups) || !ownerId) return null;
  const me = String(ownerId);

  const games = [];
  schedule.matchups.forEach((m) => {
    const home = m.home && m.home.teamId === me;
    const away = m.away && m.away.teamId === me;
    if (!home && !away) return;

    const mine = home ? m.home : m.away;
    const theirs = home ? m.away : m.home;
    games.push({
      week: m.week,
      home,
      playoff: m.playoff,
      opponentId: theirs ? theirs.teamId : null,
      points: mine ? mine.points : null,
      opponentPoints: theirs ? theirs.points : null,
      /* Decided from the winner ESPN states rather than by comparing the
         points, which would call an unplayed 0-0 week a draw. */
      result:
        m.winner === "UNDECIDED" ? null
        : (m.winner === "HOME") === home ? "W"
        : m.winner === "TIE" ? "T"
        : "L",
    });
  });

  if (!games.length) return null;
  return games.sort((a, b) => a.week - b.week);
}

/* Every score anybody put up in one week, for the median below.
 *
 * Both sides of every matchup, skipping the nulls a bye and an unplayed
 * week both produce. A week nobody has played answers an empty list rather
 * than a list of zeros -- the same rule matchups.js applies on the way in,
 * because a season of zeroes averages into a plausible and entirely false
 * points-per-week. */
function weekScores(schedule, week) {
  const out = [];
  (schedule.matchups || []).forEach((m) => {
    if (m.week !== week) return;
    [m.home, m.away].forEach((side) => {
      if (side && typeof side.points === "number") out.push(side.points);
    });
  });
  return out.sort((a, b) => a - b);
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* A finished season, from the reader's side of it.
 *
 * Screen 12 of the decision guide is "My League · season end", and it asks
 * for the season's costliest HABIT. That needs a decision the app graded,
 * and nothing writes one -- see CLAUDE.md's own list of what the data cannot
 * answer. So what this reports is the season itself, which the schedule
 * genuinely holds, and the habit stays absent rather than being invented out
 * of a proxy nobody measured.
 *
 * ---- The split that is worth the arithmetic ----
 *
 * `unlucky` is losses in a week where the reader outscored the league's own
 * MEDIAN. That is the one thing a fantasy manager most wants back at the end
 * of a season and the one thing a record cannot show: a 6-8 team that
 * outscored the field in four of its eight losses had a schedule, not a
 * problem.
 *
 * **It needs no threshold, which is the whole reason it is the split here.**
 * "A close loss" wants a margin -- ten points, say -- and this project's own
 * rule is that a number chosen by eye is a number nobody can check. A median
 * is read off the week that was actually played, so the answer is exact and
 * moves with the league rather than with a constant somebody picked.
 *
 * A tie counts as neither. It is not a loss, so it cannot be an unlucky one,
 * and folding it in either direction would put a thumb on a record that
 * already states it.
 */
export function seasonSummary(schedule, ownerId) {
  const games = myGames(schedule, ownerId);
  if (!games) return null;

  let won = 0, lost = 0, tied = 0, pointsFor = 0, pointsAgainst = 0;
  let unlucky = 0, outplayed = 0;
  let narrowest = null;
  let played = 0;

  games.forEach((g) => {
    // A bye and an unplayed week both arrive with no result, and neither is
    // a game that happened.
    if (!g.result) return;
    played++;
    if (g.result === "W") won++;
    else if (g.result === "T") tied++;
    else lost++;

    if (typeof g.points === "number") pointsFor += g.points;
    if (typeof g.opponentPoints === "number") pointsAgainst += g.opponentPoints;

    if (g.result !== "L") return;
    if (typeof g.points === "number" && typeof g.opponentPoints === "number") {
      const margin = g.opponentPoints - g.points;
      if (!narrowest || margin < narrowest.margin) narrowest = { week: g.week, margin };
    }
    const mid = median(weekScores(schedule, g.week));
    // A week with no median to compare against is counted in neither, rather
    // than defaulting into one. Missing is not evidence.
    if (mid === null || typeof g.points !== "number") return;
    if (g.points > mid) unlucky++;
    else outplayed++;
  });

  if (!played) return null;
  return {
    played,
    won,
    lost,
    tied,
    pointsFor: Math.round(pointsFor * 10) / 10,
    pointsAgainst: Math.round(pointsAgainst * 10) / 10,
    /* Losses in a week the reader still beat the field's median. */
    unlucky,
    /* And the ones below it. `unlucky + outplayed` need not equal `lost`:
       a loss in a week with no median is in neither, on purpose. */
    outplayed,
    narrowest,
  };
}

/* The one game a screen is asking about.
 *
 * `week` may be null -- the snapshot has none before the season starts --
 * and then this answers the first game rather than nothing, because "who do
 * I open against" is the question a preseason reader actually has. */
export function gameInWeek(schedule, ownerId, week) {
  const games = myGames(schedule, ownerId);
  if (!games) return null;
  if (!week) return games[0] || null;
  return games.find((g) => g.week === Number(week)) || null;
}
