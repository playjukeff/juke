/* A league table, and knowing when there is not one.
 *
 *   node worker/test-standings.mjs
 *
 * web/src/lib/standings.js is a plain module with no React in it, the same
 * arrangement countdown.js has and for the same reason: this is arithmetic
 * about a league and wants a node suite, not a browser.
 */

import { ordered, hasPlayed } from "../web/src/lib/standings.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

const team = (name, wins = 0, losses = 0, pointsFor = 0, ties = 0) =>
  ({ teamName: name, wins, losses, ties, pointsFor });

console.log("--- once somebody has played ---");
{
  const t = ordered([team("C", 1, 2, 300), team("A", 3, 0, 410), team("B", 3, 0, 455)]);
  check("wins first", t.map((x) => x.teamName)[0] !== "C", true);
  check("then points for, which breaks the tie", t.map((x) => x.teamName), ["B", "A", "C"]);
  check("and there is a standing to show", hasPlayed(t), true);
}

/* The bug this exists for. Before week one every team is 0-0 with 0 points
   for, so BOTH of ordered()'s keys are 0 for everybody -- the sort is a
   no-op and whatever order the provider returned gets numbered 1..10. The
   reader who reported this was ninth because their ESPN team id is 9. */
console.log("");
console.log("--- before anybody has ---");
{
  const fresh = [team("A"), team("B"), team("C")];
  check("nobody has played", hasPlayed(fresh), false);
  check("and the sort cannot separate them",
        ordered(fresh).map((x) => x.teamName), ["A", "B", "C"]);
}
check("a single win is enough to have a standing",
      hasPlayed([team("A", 1), team("B")]), true);
check("so is a single loss",
      hasPlayed([team("A", 0, 1), team("B")]), true);
/* A league that plays but scores nothing is vanishingly unlikely and is
   still a played week; and a tie is a result. */
check("and a tie", hasPlayed([team("A", 0, 0, 0, 1)]), true);
/* Points alone, with no record yet, is a week in progress -- which is a
   standing worth showing. */
check("points with no record yet still counts", hasPlayed([team("A", 0, 0, 88.4)]), true);

check("no teams at all is not a standing", hasPlayed([]), false);
check("and neither is nothing", hasPlayed(null), false);

/* ordered() must not reorder its input in place: MyLeagueScreen and
   LeagueBar both call it on the same snapshot array. */
console.log("");
console.log("--- it does not disturb what it was given ---");
{
  const src = [team("A", 1), team("B", 5)];
  ordered(src);
  check("the caller's array is untouched", src.map((x) => x.teamName), ["A", "B"]);
}

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — league standings, offline");
process.exit(failures ? 1 : 0);
