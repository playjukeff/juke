/* A lineup's week, as the two numbers a win probability takes.
 *
 * `web/src/lib/matchup.js` imports nothing, so this runs with no npm
 * install like every other node step in tests.yml.
 *
 * ---- The assertions this file exists for ----
 *
 * Every refusal. A win probability is the most confident thing this product
 * says to somebody in-season, and every way of producing a plausible wrong
 * one here is silent: a starter with no projection reads as a lineup worth
 * less than it is, an unmeasured position spread makes the matchup look
 * MORE certain than it is, and half a lineup against a whole one reports a
 * near-certainty that is entirely an artefact of a roster nobody finished
 * setting. None of those throws and all of them render.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const { teamWeek, matchupRead } = await import(
  pathToFileURL(path.resolve("web/src/lib/matchup.js")).href
);

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};
const is = (name, got, want) =>
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want, tol) =>
  check(
    name,
    typeof got === "number" && Math.abs(got - want) <= tol,
    `got ${JSON.stringify(got)}, want ${want} +/- ${tol}`
  );

/* The real measured shape: QB swings least, DST most. Taken off the live
   board on 9 September 2026 rather than invented, so the variance arithmetic
   below is exercised against numbers the app really produces. */
const CV = { QB: 0.44, RB: 0.583, WR: 0.645, TE: 0.635, K: 0.483, DST: 0.721 };

const row = (pos, projPts, actualPts) => {
  const r = { id: pos + projPts, player: { id: pos, pos }, projPts };
  if (actualPts !== undefined) r.player.actualPts = actualPts;
  return r;
};

/* Nine seats, which is the default lineup this project is built around. */
const LINEUP = [
  row("QB", 20), row("RB", 15), row("RB", 12), row("WR", 14), row("WR", 11),
  row("WR", 9), row("TE", 8), row("K", 8), row("DST", 7),
];

// ---- the sum, and the variance that is not a sum ---------------------------
{
  const t = teamWeek(LINEUP, CV);
  near("the mean is the lineup's own total", t.mean, 104, 0.001);
  /* Variances add and standard deviations do not, which is the one piece of
     arithmetic here somebody could plausibly get wrong by summing the
     spreads. Summing them gives **60.5 against the 20.8 that is right** —
     a lineup that swings three times as much as it does, on a mean of 104,
     and a matchup that would then read very close to even whatever the two
     lineups were actually worth.

     The expected value here was hand-computed wrong first (12.63), and the
     module was right: a number in an assertion is a claim like any other. */
  const sumOfSpreads = LINEUP.reduce((a, r) => a + CV[r.player.pos] * r.projPts, 0);
  near("the spread is the root of summed variances", t.stdev, 20.85, 0.02);
  near("and the naive sum is three times it", sumOfSpreads, 60.46, 0.02);
  check(
    "which is not a difference anybody could miss",
    sumOfSpreads - t.stdev > 30,
    `stdev ${t.stdev}, naive sum ${sumOfSpreads}`
  );
  is("it reports how many seats it counted", t.starters, 9);
}

// ---- an already-scored row has no variance left ----------------------------
{
  // Same nine seats, with the QB and one WR already having played: their
  // rows carry actualPts, the rest are still projections.
  const MIXED = [
    row("QB", 20, 24.6), row("RB", 15), row("RB", 12), row("WR", 14, 9.1), row("WR", 11),
    row("WR", 9), row("TE", 8), row("K", 8), row("DST", 7),
  ];
  const t = teamWeek(MIXED, CV);
  const wantMean = 24.6 + 15 + 12 + 9.1 + 11 + 9 + 8 + 8 + 7;
  near("an already-scored row's actual replaces his projection in the mean", t.mean, wantMean, 0.001);
  const stillProjected = MIXED.filter((r) => typeof r.player.actualPts !== "number");
  const wantVariance = stillProjected.reduce((a, r) => a + (CV[r.player.pos] * r.projPts) ** 2, 0);
  near(
    "variance sums only the squared sd of still-projected rows -- an actual contributes zero",
    t.stdev,
    Math.sqrt(wantVariance),
    0.001
  );
  is("every seat still counts, whichever way it was priced", t.starters, 9);
}

{
  // The branch order matters: an already-scored row must be accepted
  // BEFORE either refusal below runs, because neither refusal is about a
  // player who has already played.
  const partial = Object.fromEntries(Object.entries(CV).filter(([k]) => k !== "QB"));
  const noCv = [
    row("QB", 20, 24.6), row("RB", 15), row("RB", 12), row("WR", 14), row("WR", 11),
    row("WR", 9), row("TE", 8), row("K", 8), row("DST", 7),
  ];
  const t1 = teamWeek(noCv, partial);
  check(
    "an already-scored row with no cv entry for his position is still counted, not refused",
    !!t1 && t1.starters === 9,
    `got ${JSON.stringify(t1)}`
  );

  const noProj = [
    { id: "QBnull", player: { id: "QB", pos: "QB", actualPts: 24.6 }, projPts: null },
    row("RB", 15), row("RB", 12), row("WR", 14), row("WR", 11),
    row("WR", 9), row("TE", 8), row("K", 8), row("DST", 7),
  ];
  const t2 = teamWeek(noProj, CV);
  check(
    "and one with no projection at all is still counted, not refused",
    !!t2 && t2.starters === 9,
    `got ${JSON.stringify(t2)}`
  );
}

// ---- every refusal ---------------------------------------------------------
is("no rows at all is not a lineup", teamWeek(null, CV), null);
is("no cv table is not a spread", teamWeek(LINEUP, null), null);

{
  /* projectedTotal()'s own rule, one file over: a total that quietly omitted
     a player reads as a lineup worth less than it is, and this one is about
     to be compared against another. */
  const holed = LINEUP.map((r, i) => (i === 3 ? { ...r, projPts: null } : r));
  is("a starter with no projection refuses the whole lineup", teamWeek(holed, CV), null);
  const undef = LINEUP.map((r, i) => (i === 3 ? { ...r, projPts: undefined } : r));
  is("and undefined is the same refusal as null", teamWeek(undef, CV), null);
}

{
  const noPlayer = LINEUP.map((r, i) => (i === 2 ? { ...r, player: null } : r));
  is("an unresolved row refuses too", teamWeek(noPlayer, CV), null);
}

{
  /* The conservative direction is the one that matters. An unmeasured
     spread contributes no variance, which makes the matchup look MORE
     certain — so it is refused rather than treated as zero. */
  const partial = { QB: 0.44, RB: 0.583, WR: 0.645, TE: 0.635, K: 0.483 };
  is("a position with no measured spread refuses", teamWeek(LINEUP, partial), null);
}

{
  const short = LINEUP.slice(0, 4);
  is("half a lineup is not a lineup", teamWeek(short, CV), null);
  const five = LINEUP.slice(0, 5);
  check("and five is the floor rather than six", teamWeek(five, CV) !== null);
}

// ---- the read ---------------------------------------------------------------
/* Three states rather than a percentage dressed as a forecast. The band is
   ten points either side of even, which is comfortably outside the 1.3
   points of probability the CV's own scoring-table sensitivity is worth. */
is("clearly ahead", matchupRead(0.72), "favoured");
is("clearly behind", matchupRead(0.28), "behind");
is("a coin toss", matchupRead(0.5), "close");
is("just inside the band is still close", matchupRead(0.59), "close");
is("just outside it is not", matchupRead(0.61), "favoured");
is("the boundary itself is decided", matchupRead(0.6), "favoured");
is("and so is the other one", matchupRead(0.4), "behind");
is("no probability has no read", matchupRead(null), null);
is("undefined has no read either", matchupRead(undefined), null);

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the matchup`);
