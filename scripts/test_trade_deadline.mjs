/* Whether a connected league is still trading.
 *
 * `web/src/lib/tradeDeadline.js` imports nothing, which is what lets this run
 * with no npm install — like every other node step in tests.yml.
 *
 * ---- What this suite is really guarding ----
 *
 * The two platforms publish a deadline in different UNITS: ESPN an instant,
 * Sleeper a week number. A screen that had to know which it was looking at
 * would be a fork in the UI, so the whole point of `tradeWindow()` is that
 * one question is answered from either field. Half these assertions are
 * therefore the same case run twice, once per unit, which is deliberate
 * rather than duplication — a fix applied to one branch and not the other is
 * exactly the drift this shape exists to prevent.
 *
 * The other half is the refusals. Three states are not "open": no deadline
 * at all, a league with trading switched off, and a week-only deadline with
 * no current week to compare it against. Every one of those is `unknown` or
 * `disabled` rather than a cheerful `open`, because a Trade Room that says
 * the window is open when nobody knows is worse than one that says nothing.
 */

import { tradeWindow, msUntilDeadline } from "../web/src/lib/tradeDeadline.js";

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};
const is = (name, got, want) =>
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* The real values, measured 9 September 2026 against a live league of each
   platform rather than invented. If either of these ever stops parsing, the
   adapter is what changed. */
const ESPN = { at: 1796230800000, week: null, disabled: null }; // 2026-12-02T17:00Z
const SLEEPER = { at: null, week: 11, disabled: false };

const BEFORE = Date.UTC(2026, 10, 20); // 20 Nov 2026, comfortably before
const AFTER = Date.UTC(2026, 11, 10); // 10 Dec 2026, comfortably after

// ---- nothing to say -------------------------------------------------------
is("no deadline object is unknown", tradeWindow(null, {}).state, "unknown");
is("an empty deadline is unknown", tradeWindow({}, {}).state, "unknown");
is(
  "both fields null is unknown",
  tradeWindow({ at: null, week: null, disabled: null }, { week: 5 }).state,
  "unknown"
);

/* A feed's zero is missing, not midnight in 1970 -- the rule this project
   applies to every other number a platform sends. Read as a real instant it
   would put every league permanently past its deadline. */
is("an `at` of 0 is unknown, never 1970", tradeWindow({ at: 0, week: null }, { now: BEFORE }).state, "unknown");
is("a week of 0 is unknown", tradeWindow({ at: null, week: 0 }, { week: 5 }).state, "unknown");

// ---- trading switched off, which is not a shut window ----------------------
/* Sleeper carries a `trade_deadline` week on a league that forbids trading
   outright, the same way ESPN carries a FAAB budget on a league that never
   bids. Reading the week alone would count a league down to a deadline it
   can never reach. */
is(
  "disabled beats a perfectly good week",
  tradeWindow({ at: null, week: 11, disabled: true }, { week: 3 }).state,
  "disabled"
);
is(
  "and beats an instant too",
  tradeWindow({ at: ESPN.at, week: null, disabled: true }, { now: BEFORE }).state,
  "disabled"
);

// ---- ESPN: an instant, against the clock ----------------------------------
is("before the instant is open", tradeWindow(ESPN, { now: BEFORE }).state, "open");
is("after the instant is passed", tradeWindow(ESPN, { now: AFTER }).state, "passed");
/* The boundary itself. A deadline is the moment trading STOPS, so the instant
   is not still open -- and this is the one boundary that is measured rather
   than guessed, because ESPN gives a real timestamp. */
is("the instant itself is passed", tradeWindow(ESPN, { now: ESPN.at }).state, "passed");
is("one ms before is open", tradeWindow(ESPN, { now: ESPN.at - 1 }).state, "open");
is("the instant is reported back", tradeWindow(ESPN, { now: BEFORE }).at, ESPN.at);

/* An ESPN league needs no current week at all -- the clock is enough. A
   caller that had to supply one would be a caller that behaves differently
   before the season starts. */
is("no week needed for an instant", tradeWindow(ESPN, { now: BEFORE }).state, "open");

// ---- Sleeper: a week, against the snapshot's own week ----------------------
is("an earlier week is open", tradeWindow(SLEEPER, { week: 3 }).state, "open");
is("a later week is passed", tradeWindow(SLEEPER, { week: 12 }).state, "passed");

/* The unmeasured boundary, pinned in the direction the module's header
   argues for: the deadline week itself still reads as OPEN. If a real
   Sleeper league in week 12 ever shows this is a week out, this is the line
   that changes -- and it changes here rather than in a component. */
is("the deadline week itself is still open", tradeWindow(SLEEPER, { week: 11 }).state, "open");

/* Without a current week there is nothing to compare against, and 'open' is
   the wrong default: it is a guess wearing an answer's clothes. */
is("a week deadline with no current week is unknown", tradeWindow(SLEEPER, {}).state, "unknown");
is("week 0 is not a current week", tradeWindow(SLEEPER, { week: 0 }).state, "unknown");
/* The week still comes back, so a room can print "Week 11" even when it
   cannot say which side of it the league is on. */
is("and the week is still reported", tradeWindow(SLEEPER, {}).week, 11);

// ---- the instant wins where a platform somehow sent both -------------------
/* Nothing publishes both today. If something ever does, the instant is the
   sharper fact and the week must not override it. */
is(
  "an instant outranks a week",
  tradeWindow({ at: ESPN.at, week: 11, disabled: false }, { now: AFTER, week: 3 }).state,
  "passed"
);

// ---- the countdown, which only an instant can answer -----------------------
check(
  "an open instant counts down",
  msUntilDeadline(ESPN, BEFORE) === ESPN.at - BEFORE,
  `got ${msUntilDeadline(ESPN, BEFORE)}`
);
is("a passed instant has nothing left", msUntilDeadline(ESPN, AFTER), null);
/* The one that would be easy to fake. A week number cannot become a duration
   without the week-boundary table this project does not have, and inventing
   one from an average week length would put a number on screen a reader
   would take literally. */
is("a week deadline never becomes a duration", msUntilDeadline(SLEEPER, BEFORE), null);
is("neither does a disabled league", msUntilDeadline({ disabled: true }, BEFORE), null);

// ---- the shape every caller relies on --------------------------------------
/* Four states, and a caller switching on them must not be handed a fifth
   without this failing first. */
const states = new Set(
  [
    tradeWindow(null, {}),
    tradeWindow({ disabled: true }, {}),
    tradeWindow(ESPN, { now: BEFORE }),
    tradeWindow(ESPN, { now: AFTER }),
    tradeWindow(SLEEPER, { week: 3 }),
    tradeWindow(SLEEPER, { week: 12 }),
    tradeWindow(SLEEPER, {}),
  ].map((w) => w.state)
);
check(
  "exactly the four documented states are producible",
  states.size === 4 &&
    ["unknown", "disabled", "open", "passed"].every((s) => states.has(s)),
  [...states].sort().join(", ")
);

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the trade deadline`);
