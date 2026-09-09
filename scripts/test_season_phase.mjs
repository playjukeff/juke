/* Where a connected league is in its season.
 *
 * `web/src/lib/seasonPhase.js` imports nothing, which is what lets this run
 * with no npm install — like every other step in tests.yml.
 *
 * ---- Why this is worth a suite rather than a glance ----
 *
 * The file spent its whole life answering two values, refusing playoffs
 * because neither adapter said when they started. The schedule work made that
 * readable, and the moment a third value became possible, every caller
 * written as `phase === 'in-season'` became a latent bug: MyLeagueScreen
 * gated its entire week strip and past-week panel on exactly that, so the
 * first league to reach its own playoffs would have had the strip vanish —
 * no error, no log, in the weeks a manager looks at it most.
 *
 * So the assertions below are as much about `underWay()` as about the phase
 * itself. A positive test for ONE value of an enum is safe only while that
 * value cannot split.
 *
 * And the refusal is asserted too, in both directions: a Sleeper league still
 * has no schedule, and it must stay 'in-season' all the way through rather
 * than being guessed into a playoff by week number. A check that only proved
 * the new states would pass an implementation that had quietly started
 * guessing for everybody.
 */

import { seasonPhase, underWay } from "../web/src/lib/seasonPhase.js";

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};
const is = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* An ESPN-shaped schedule: fourteen regular weeks, three of playoffs.
   `weeks` and `regularSeasonWeeks` are what scheduleFromEspn() publishes,
   read off ESPN's own playoffTierType rather than counted here. */
const espn = { weeks: 17, regularSeasonWeeks: 14, matchups: [] };
const withWeek = (week, extra) => Object.assign({ week, draftStatus: "complete", schedule: espn }, extra);

// ---- nothing to say -------------------------------------------------------
is("no snapshot is unknown", seasonPhase(null), "unknown");
is("a drafting league is draft", seasonPhase({ draftStatus: "drafting", week: 3 }), "draft");
is("no week yet is draft", seasonPhase({ draftStatus: "complete", week: 0 }), "draft");
is("a week of null is draft", seasonPhase({ draftStatus: "complete", week: null }), "draft");

// ---- the boundary, read rather than guessed --------------------------------
is("week 1 is in-season", seasonPhase(withWeek(1)), "in-season");
is("the last regular week is in-season", seasonPhase(withWeek(14)), "in-season");
is("the first playoff week is playoffs", seasonPhase(withWeek(15)), "playoffs");
is("the last scheduled week is playoffs", seasonPhase(withWeek(17)), "playoffs");
is("past the last scheduled week is complete", seasonPhase(withWeek(18)), "complete");

/* Both tests fire past the end, and "over" is the more specific answer. An
   implementation checking playoffs first would call week 18 a playoff week
   for ever. */
is("complete beats playoffs past the end", seasonPhase(withWeek(99)), "complete");

// ---- the refusal that has to survive --------------------------------------
const sleeper = { draftStatus: "complete", schedule: null };
is("no schedule stays in-season in week 1", seasonPhase(Object.assign({ week: 1 }, sleeper)), "in-season");
is("no schedule stays in-season in week 15", seasonPhase(Object.assign({ week: 15 }, sleeper)), "in-season");
is("no schedule stays in-season in week 18", seasonPhase(Object.assign({ week: 18 }, sleeper)), "in-season");

/* A schedule that exists but says nothing about length is the same refusal.
   `weeks: 0` is the shape scheduleFromEspn() can never produce, and reading
   it as "week 1 is past the end" would call every such league complete. */
is(
  "a schedule with no weeks is not treated as a finished season",
  seasonPhase({ draftStatus: "complete", week: 5, schedule: { weeks: 0, regularSeasonWeeks: 0, matchups: [] } }),
  "in-season"
);

/* A league with no playoffs at all -- regularSeasonWeeks equal to weeks --
   must never report a playoff week, only in-season and then complete. */
const noPlayoffs = { weeks: 14, regularSeasonWeeks: 14, matchups: [] };
is(
  "a league with no playoff weeks never reports playoffs",
  seasonPhase({ draftStatus: "complete", week: 14, schedule: noPlayoffs }),
  "in-season"
);
is(
  "and is complete once past its last week",
  seasonPhase({ draftStatus: "complete", week: 15, schedule: noPlayoffs }),
  "complete"
);

// ---- underWay(), which is the question callers actually have ---------------
check("the draft is not under way", !underWay("draft"));
check("unknown is not under way", !underWay("unknown"));
check("in-season is under way", underWay("in-season"));
check("playoffs are under way", underWay("playoffs"));
check("a finished season is still under way", underWay("complete"));

/* The one that guards the bug this split would have caused. Every phase
   seasonPhase() can answer for a league that has drafted must be under way,
   or the week strip disappears for that league -- so this asks the function
   rather than restating the list, and a fifth phase added later fails here
   instead of on somebody's screen in week 15. */
const drafted = [
  seasonPhase(withWeek(1)),
  seasonPhase(withWeek(14)),
  seasonPhase(withWeek(15)),
  seasonPhase(withWeek(18)),
  seasonPhase({ draftStatus: "complete", week: 3, schedule: null }),
];
check(
  "every post-draft phase this can produce is under way",
  drafted.every(underWay),
  drafted.filter((p) => !underWay(p)).join(", ")
);

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the season phase`);
