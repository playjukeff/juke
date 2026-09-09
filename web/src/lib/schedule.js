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
