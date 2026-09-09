/* A connected league's starting lineup, offline.
 *
 *   node worker/test-lineup.mjs
 *
 * The slot ids were derived from what actually sits in each slot across a
 * real league's ten rosters, and a wrong one does not throw -- it grades a
 * lineup the league does not field. So these assert the shape of the
 * translation: what folds into what, what is not a round, and what gets
 * reported rather than guessed.
 */

import { lineupFromEspn, lineupFromSleeper } from "./lineup.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

/* The real league this was derived from: QB1 RB2 WR2 TE1 FLEX1 K1 DST1,
   five bench, one IR — which ran a 14-round draft. */
const REAL = { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 20: 5, 21: 1, 23: 1 } };

console.log("--- ESPN ---");
{
  const L = lineupFromEspn(REAL);
  check("the starters are counted by position",
        L.starters, { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 });
  check("the flex is its own seat", L.flex, 1);
  check("the bench is not a starter", L.bench, 5);
  /* Juke's `rounds` is starters + flex + superflex + bench, and this league
     really drafted 14. Two independent readings of one fact. */
  check("and rounds is what the draft actually ran", L.rounds, 14);
  check("nothing was left unmapped", L.unmapped, []);
}

/* IR is a real seat and not a round. Counting it would make this 15 and
   leave a last round nobody picked in. */
check("IR is not a round",
      lineupFromEspn({ lineupSlotCounts: { 0: 1, 20: 1, 21: 3 } }).rounds, 2);

/* Superflex is the one that matters most to get right: dropping it grades
   a two-quarterback league as a one-quarterback league, which is the
   written-down-twice drift in the shape that caused the original
   superflex grading bug. */
{
  const L = lineupFromEspn({ lineupSlotCounts: { 0: 1, 7: 1, 2: 2, 20: 4 } });
  check("the OP seat is a superflex", L.superflex, 1);
  check("and it counts toward the rounds", L.rounds, 8);
}

/* ESPN's narrower RB/WR and WR/TE flexes fold into Juke's one FLEX, which
   is slightly loose and reported rather than silent -- a seat modelled
   loosely beats a starter left out of the lineup entirely. */
{
  const L = lineupFromEspn({ lineupSlotCounts: { 0: 1, 3: 1, 5: 1, 20: 2 } });
  check("a narrow flex is still a flex", L.flex, 2);
  check("and says which ones were folded", L.looseFlex, [3, 5]);
}

check("a slot nobody can name is reported",
      lineupFromEspn({ lineupSlotCounts: { 0: 1, 20: 1, 99: 2 } }).unmapped, [99]);
check("a zero-count slot is not a seat",
      lineupFromEspn({ lineupSlotCounts: { 0: 1, 20: 1, 99: 0 } }).unmapped, []);
check("no settings is null, never an empty lineup", lineupFromEspn(null), null);
check("and neither is a lineup with no starters in it",
      lineupFromEspn({ lineupSlotCounts: { 20: 5 } }), null);

console.log("");
console.log("--- Sleeper ---");
{
  const L = lineupFromSleeper(
    ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "IR"]);
  check("its seats are tallied, not translated",
        L.starters, { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 });
  // DEF is the one word in Sleeper's list that is not already Juke's.
  check("DEF is DST", L.starters.DST, 1);
  check("the flex", L.flex, 1);
  check("the bench", L.bench, 3);
  check("IR is not a round here either", L.rounds, 12);
}
check("SUPER_FLEX is a superflex",
      lineupFromSleeper(["QB", "SUPER_FLEX", "BN"]).superflex, 1);
check("an unknown seat is reported",
      lineupFromSleeper(["QB", "BN", "DL"]).unmapped, ["DL"]);
check("nothing to read is null", lineupFromSleeper(null), null);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — league lineup, offline");
process.exit(failures ? 1 : 0);
