/* A connected league's scoring, offline.
 *
 *   node worker/test-scoring.mjs
 *
 * The ids in scoring.js were derived from 319 players' real 2025 lines
 * rather than looked up, and the failure mode they guard against is silent:
 * a wrong statId scores the wrong category and reports nothing. So these
 * assert the SHAPE of the translation -- overrides, absent categories,
 * aliases, what gets reported -- which is the half a derivation cannot
 * check itself.
 */

import { rulesFromEspn, rulesFromSleeper, ESPN_STAT_IDS } from "./scoring.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

const item = (statId, points, overrides) => ({ statId, points, pointsOverrides: overrides || {} });

console.log("--- a full PPR league reads as one ---");
{
  const { rules } = rulesFromEspn([
    item(53, 1), item(42, 0.1), item(43, 6), item(3, 0.05), item(4, 6), item(24, 0.1),
  ]);
  check("a point a catch is a point a catch", rules.rec, 1);
  check("and a yard rule that is not Juke's default comes through", rules.pass_yd, 0.05);
  check("passing touchdowns too", rules.pass_td, 6);
}

/* ESPN carries receptions under 41 AND 53, identical on every player, and
   only 53 appears in a scoring table. Reading 41 makes every league in the
   world zero-PPR, silently. */
console.log("\n--- receptions are 53, never their twin 41 ---");
check("the table names 53", ESPN_STAT_IDS.rec, 53);
{
  const { rules } = rulesFromEspn([item(41, 1), item(24, 0.1)]);
  check("a point on 41 alone does not make a PPR league", rules.rec, 0);
}

/* A defence's real number lives in pointsOverrides["16"] with points: 0
   beside it, so reading `points` reports every defensive rule as zero --
   an unscored defence rather than an error. */
/* One ESPN rule paying several of Juke's.
 *
 * ESPN does not band a short field goal the way the pipeline does: statId
 * 80 is worth 3 and covers every make under forty, where STAT_FIELDS keeps
 * fgm_0_19, fgm_20_29 and fgm_30_39 apart. The season-totals derivation
 * could not reach it -- ESPN has no total corresponding to "makes under
 * forty" -- and ESPN's own applied points did: every kicker in a real 2025
 * boxscore came out exactly 6 short with two field goals inside forty, and
 * "Juke's points plus three per short make" fit 37 of 38 kicker-weeks. */
console.log("");
console.log("--- one id, several rules ---");
{
  const { rules } = rulesFromEspn([item(80, 3), item(198, 5), item(88, -1)]);
  check("every short band takes the same rate",
        [rules.fgm_0_19, rules.fgm_20_29, rules.fgm_30_39], [3, 3, 3]);
  check("and the long bands keep their own", rules.fgm_50_59, 5);
}
{
  // A league that does not score short field goals at all still says so.
  const { rules } = rulesFromEspn([item(198, 5)]);
  check("an absent shared id is a real zero, like any other",
        [rules.fgm_0_19, rules.fgm_20_29, rules.fgm_30_39], [0, 0, 0]);
}
check("and it is not reported as unmapped, having been claimed",
      rulesFromEspn([item(80, 3)]).unmapped, []);


console.log("\n--- a defence is scored through its override ---");
{
  const { rules } = rulesFromEspn([item(95, 0, { 16: 2 }), item(98, 0, { 16: 4 }), item(89, 0, { 16: 5 })]);
  check("an interception", rules.int, 2);
  check("a safety", rules.safe, 4);
  check("a shutout", rules.pts_allow_0, 5);
}
{
  // An offensive rule must NOT read the defensive override.
  const { rules } = rulesFromEspn([item(53, 1, { 16: 99 })]);
  check("and an offensive rule ignores it", rules.rec, 1);
}

/* ESPN enumerates what it scores, so a category it does not list is one the
   league does not pay for -- a real zero, not a gap for the client's own
   default to fill back in. */
console.log("\n--- a category the league omits is a zero, not a default ---");
{
  const { rules } = rulesFromEspn([item(24, 0.1)]);
  check("no reception rule means no PPR", rules.rec, 0);
  check("no interception rule means no penalty", rules.pass_int, 0);
}

console.log("\n--- what it cannot name, it reports ---");
{
  const { rules, unmapped } = rulesFromEspn([item(53, 1), item(4242, 3), item(99, 0, { 16: 1 })]);
  check("the rule it knows still lands", rules.rec, 1);
  check("and the ones it does not are named", unmapped, [99, 4242]);
}
{
  const { unmapped } = rulesFromEspn([item(53, 1), item(4242, 0)]);
  check("a category scoring nothing is not worth reporting", unmapped, []);
}

console.log("\n--- nothing to read is null, never an empty table ---");
{
  const a = rulesFromEspn([]), b = rulesFromEspn(null), c = rulesFromSleeper(null);
  check("no items", a.rules, null);
  check("no array", b.rules, null);
  check("no settings", c.rules, null);
}

/* Sleeper needs no id table: STAT_FIELDS took its key names, so its
   scoring_settings is already Juke's vocabulary. */
console.log("\n--- Sleeper passes through ---");
{
  const { rules } = rulesFromSleeper({ rec: 1, pass_td: 4, bonus_rec_te: 0.5, junk: "x" });
  check("a key Juke knows", rules.rec, 1);
  check("and another", rules.pass_td, 4);
  check("a key it does not is carried for the client to drop", rules.bonus_rec_te, 0.5);
  check("but a value that is not a number is not", rules.junk, undefined);
}

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — league scoring, offline");
process.exit(failures ? 1 : 0);
