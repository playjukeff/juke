/* The league's schedule, and the reader's side of it.
 *
 *   node worker/test-matchups.mjs
 *
 * Both halves in one suite, the way test-countdown.mjs already covers
 * countdown.js: web/src/lib/schedule.js is a plain module with no React in
 * it, which is the whole reason the projection lives there.
 *
 * What these guard is a family of quiet wrongness. A schedule cannot throw
 * -- it renders a fixture list either way -- so every case here is one that
 * would produce a plausible, wrong season.
 */

import { scheduleFromEspn, scheduleFromSleeper } from "./matchups.js";
import { myGames, gameInWeek } from "../web/src/lib/schedule.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

const game = (week, h, a, extra = {}) => ({
  matchupPeriodId: week,
  home: { teamId: h, totalPoints: extra.hp === undefined ? 0 : extra.hp },
  away: a === null ? undefined : { teamId: a, totalPoints: extra.ap === undefined ? 0 : extra.ap },
  winner: extra.winner || "UNDECIDED",
  playoffTierType: extra.playoff ? "WINNERS_BRACKET" : "NONE",
});

console.log("--- the schedule ---");
{
  const S = scheduleFromEspn([game(2, 1, 2), game(1, 3, 4), game(1, 1, 2)]);
  check("every matchup survives", S.matchups.length, 3);
  check("and they come back in week order", S.matchups.map((m) => m.week), [1, 1, 2]);
  check("the deepest week is the season's length", S.weeks, 2);
  check("team ids are strings, matching ownerId everywhere else",
        typeof S.matchups[0].home.teamId, "string");
}

/* A week nobody has played scores 0 on both sides, and 0 is not a result.
   Storing it would let a screen average a season of zeroes into a real
   looking points-per-week. Same rule the pipeline applies to a 0 from any
   feed. */
console.log("");
console.log("--- an unplayed week has no score ---");
{
  const S = scheduleFromEspn([game(1, 1, 2)]);
  check("no points before it is played", S.matchups[0].home.points, null);
  check("and no result", S.matchups[0].winner, "UNDECIDED");
}
{
  const S = scheduleFromEspn([game(1, 1, 2, { hp: 118.4, ap: 96.2, winner: "HOME" })]);
  check("a played week keeps its points", S.matchups[0].home.points, 118.4);
  check("and its winner", S.matchups[0].winner, "HOME");
}

/* Some league sizes produce a bye. It is a real week for that team, and a
   screen that dropped the row would silently renumber somebody's season. */
console.log("");
console.log("--- a bye is a week, not a missing one ---");
{
  const S = scheduleFromEspn([game(1, 7, null)]);
  check("the row is kept", S.matchups.length, 1);
  check("with no opponent", S.matchups[0].away, null);
  const g = myGames(S, "7");
  check("and it reaches the reader as a bye", g[0].opponentId, null);
}

console.log("");
console.log("--- the reader's own season ---");
const SEASON = scheduleFromEspn([
  game(1, 9, 4, { hp: 120, ap: 101, winner: "HOME" }),
  game(1, 1, 2),
  game(2, 5, 9, { hp: 88, ap: 95, winner: "AWAY" }),
  game(3, 9, 1),
  game(4, 3, 6, { playoff: true }),
]);
{
  const g = myGames(SEASON, "9");
  check("only this team's games", g.length, 3);
  check("in week order", g.map((x) => x.week), [1, 2, 3]);
  check("home and away are the reader's own side", g.map((x) => x.home), [true, false, true]);
  check("the opponent is the OTHER team", g.map((x) => x.opponentId), ["4", "5", "1"]);
  /* A win as the home side and a win as the away side are the same result
     to the reader, which is the whole reason this is not `winner`. */
  check("a home win reads W", g[0].result, "W");
  check("an away win reads W too", g[1].result, "W");
  check("and an unplayed week has no result at all", g[2].result, null);
  check("the reader's own points, not the home team's", g[1].points, 95);
  check("and the opponent's", g[1].opponentPoints, 88);
}
check("a team with no games at all is null, never an empty season",
      myGames(SEASON, "999"), null);

/* Before the season there is no week, and "who do I open against" is the
   question a preseason reader actually has. */
console.log("");
console.log("--- which week a screen is asking about ---");
check("no week means the opening fixture", gameInWeek(SEASON, "9", null).week, 1);
check("a week that exists", gameInWeek(SEASON, "9", 2).opponentId, "5");
check("a week this team does not play is null", gameInWeek(SEASON, "9", 4), null);
check("no schedule is null, never an empty list", myGames(null, "9"), null);
check("nor is a league with no matchups", scheduleFromEspn([]), null);

/* Sleeper publishes no season schedule; its matchups endpoint answers one
   week at a time. Named rather than omitted so the gap is visible from the
   adapter instead of from an empty panel. */
console.log("");
console.log("--- Sleeper has none yet, and says so ---");
check("it answers null rather than pretending", scheduleFromSleeper(), null);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — league schedule, offline");
process.exit(failures ? 1 : 0);
