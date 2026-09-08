/* The Prospect Room's arithmetic, and its refusals.
 *
 * This room has the largest honesty problem in the product: ROOMS' blurb
 * promises college production and NFL translation, and neither exists
 * anywhere in this repository. So most of what is asserted here is about
 * what the room declines to say — which is the part that would rot
 * silently, because a screen that quietly shows six fields looks complete.
 *
 * Run: node scripts/test_prospect_board.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { rookies, knownAbout, evidence } = await import(
  pathToFileURL(path.resolve("web/src/components/rooms/prospectBoard.js")).href
);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

const BOARD = [
  { id: "r1", name: "Rookie One", pos: "RB", team: "DET", projPts: 200 },
  { id: "r2", name: "Rookie Two", pos: "WR", team: "GB", projPts: 140 },
  { id: "r3", name: "Rookie Three", pos: "TE", team: "SF", projPts: 60 },
  { id: "v1", name: "Veteran", pos: "RB", team: "ATL", projPts: 300 },
  { id: "u1", name: "Unmatched", pos: "WR", team: "NYJ", projPts: 90 },
  { id: "k1", name: "Rookie Kicker", pos: "K", team: "LAR", projPts: 130 },
  { id: "d1", name: "Deep Rookie", pos: "WR", team: "CHI", projPts: 20, deep: true },
  { id: "p0", name: "No Projection", pos: "TE", team: "MIA", projPts: null },
];

const STATS = {
  r1: { exp: 0, col: "Notre Dame", age: 21, ht: "70", wt: "205", depth: "RB", order: 2 },
  r2: { exp: 0, col: "Ohio State", age: 22 },
  r3: { exp: 0, col: "Texas", age: 21, depth: "TE", order: 1 },
  v1: { exp: 4, col: "Alabama", age: 26, depth: "RB", order: 1 },
  k1: { exp: 0, col: "Utah" },
  d1: { exp: 0, col: "Illinois", age: 23 },
  p0: { exp: 0, col: "Duke", age: 22, depth: "TE", order: 3 },
  // u1 deliberately absent: the crosswalk never placed him.
};
const statOf = (p) => STATS[p.id] || null;

/* Stands in for JukeEngine.replacementGap, and it has to model BOTH of
   that function's null cases or the fixture flatters the code: it answers
   null for a kicker or a defense (UNRANKED_POSITIONS, a measured refusal)
   AND for a player with no projection at all. The first version returned
   `null - 80 = -80` for the second case, which is a real-looking number
   for a player the app cannot price — exactly the shape of wrongness this
   module exists to prevent, sitting in the thing testing it. */
const REPLACEMENT = { RB: 120, WR: 110, TE: 80 };
const rankBy = (p) => {
  if (p.projPts === null || p.projPts === undefined) return null;
  if (p.pos === "K" || p.pos === "DST") return null;
  return p.projPts - REPLACEMENT[p.pos];
};

check("a rookie is somebody in their first NFL season", () => {
  const ids = rookies(BOARD, statOf, rankBy).map((r) => r.player.id);
  assert.equal(ids.includes("r1"), true);
  assert.equal(ids.includes("v1"), false, "four years of experience is not a prospect");
});

check("a player the crosswalk never placed is NOT a rookie by default", () => {
  const ids = rookies(BOARD, statOf, rankBy).map((r) => r.player.id);
  assert.equal(
    ids.includes("u1"), false,
    "absence of evidence is not evidence of youth — defaulting exp to 0 fills the board with veterans"
  );
});

check("they come back best first, by Juke's own view and not the market's", () => {
  const rows = rookies(BOARD, statOf, rankBy);
  const vals = rows.filter((r) => r.value !== null).map((r) => r.value);
  assert.deepEqual(vals, vals.slice().sort((a, b) => b - a));
  assert.equal(rows[0].player.id, "r1");
});

check("a rookie the app will not rank sorts LAST, never first", () => {
  const rows = rookies(BOARD, statOf, rankBy);
  const kicker = rows.findIndex((r) => r.player.id === "k1");
  const worstRanked = rows.findIndex((r) => r.player.id === "d1");
  assert.ok(kicker >= 0, "he is still a rookie and still on the board");
  assert.ok(
    worstRanked < kicker,
    "an untreated null sorts to the top, heading a list about who to take with the one player nobody can price"
  );
});

check("nothing throws on an empty board or a missing lookup", () => {
  assert.deepEqual(rookies([], statOf, rankBy), []);
  assert.deepEqual(rookies(null, statOf, rankBy), []);
  assert.deepEqual(rookies(BOARD, null, rankBy), []);
});

/* ---- what the room says it does not know ---- */

check("every rookie reports what is missing, and it is never empty", () => {
  for (const row of rookies(BOARD, statOf, rankBy)) {
    const { missing } = knownAbout(row);
    assert.ok(
      missing.length >= 3,
      "college production, combine testing and draft position are absent for EVERY rookie in this repository"
    );
  }
});

check("the three permanent gaps are named, not implied", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const { missing } = knownAbout(row);
  for (const gap of ["College production", "Combine testing", "NFL draft position"]) {
    assert.ok(missing.includes(gap), gap + " must be named");
  }
});

check("a rookie with no depth-chart slot says so as well", () => {
  const withSlot = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const without = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r2");
  assert.equal(knownAbout(withSlot).missing.includes("Depth chart role"), false);
  assert.equal(knownAbout(without).missing.includes("Depth chart role"), true);
});

check("a deep-bench rookie says no real draft has ever taken him", () => {
  const deep = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "d1");
  assert.ok(knownAbout(deep).missing.includes("Any real draft position"));
});

check("what IS known is only what a feed actually sent", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const { known } = knownAbout(row);
  const labels = known.map((k) => k.label);
  assert.deepEqual(labels, ["College", "Age", "Size", "Depth chart", "Team"]);
  assert.equal(known.find((k) => k.label === "College").value, "Notre Dame");
  assert.equal(known.find((k) => k.label === "Size").value, "5'10\" · 205 lb", "70 inches");
});

check("a rookie with almost nothing on file shows almost nothing", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "k1");
  const { known } = knownAbout(row);
  assert.deepEqual(
    known.map((k) => k.label), ["College", "Team"],
    "no age, no size, no depth slot — and the screen must not invent them"
  );
});

check("a rookie with no projection at all says THAT, rather than showing a rank", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "p0");
  assert.ok(row, "he is still a first-year player and still belongs on the board");
  assert.equal(row.value, null);
  assert.ok(
    knownAbout(row).missing.includes("A 2026 projection"),
    "the reason he is unranked is a fact about him, and the screen may not leave it to be inferred from his position in the list"
  );
});

check("a rookie WITH a projection is not told one is missing", () => {
  /* The mirror, because a guard that fires on everybody is a guard that
     says nothing — the same reason the Strategy and Trade fixtures each
     had to carry a case that would fail. */
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  assert.equal(knownAbout(row).missing.includes("A 2026 projection"), false);
});

check("the refusal to RANK a kicker is not counted as a thing nobody knows", () => {
  /* jukeReadout().unrankedNote carries that sentence and the room renders
     it separately. Folding it into `missing` would count a measured
     decision as an information gap, which is a different and weaker
     claim — and would inflate every kicker's denominator. */
  const kicker = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "k1");
  const gaps = knownAbout(kicker).missing.join(" | ").toLowerCase();
  assert.equal(gaps.includes("rank"), false);
  assert.equal(gaps.includes("rating"), false);
});

check("evidence is a count, never a confidence percentage", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const e = evidence(row);
  /* The handoff caps confidence at 71% until April. A number chosen to
     look uncertain is still a number, and a reader compares it against
     another one. "5 of 8 things known" cannot be compared that way. */
  assert.equal(typeof e.known, "number");
  assert.equal(typeof e.total, "number");
  assert.ok(e.total > e.known, "there is always more unknown than known about a rookie here");
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the prospect board");
process.exit(failures ? 1 : 0);
