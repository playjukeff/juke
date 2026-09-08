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

const { rookies, knownAbout, evidence, productionLine } = await import(
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

/* ---- what the pipeline now knows, and the three states it keeps apart ----

   These arrive as row.prospect, which is JukeEngine.prospectFor()'s answer.
   The room attaches it; this module never re-reads stat.pr, because a second
   interpretation of the same shape is how "undrafted" and "we could not tell"
   end up meaning one thing on one screen and another somewhere else. */

const withProspect = (id, prospect) => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === id);
  return { ...row, prospect };
};

check("a drafted rookie's pick is KNOWN, not a gap", () => {
  const row = withProspect("r1", {
    drafted: { round: 1, pick: 3, overall: 3 }, undrafted: false, college: null,
  });
  const { known, missing } = knownAbout(row);
  assert.equal(known.find((k) => k.label === "NFL draft").value,
               "Round 1, pick 3 · 3 overall");
  assert.equal(missing.includes("NFL draft position"), false,
               "it is not missing once we know it");
});

check("UNDRAFTED is a fact and belongs with what is known", () => {
  /* 18 of the 77 first-year players on the 8 September 2026 board were never
     drafted. For them this is not missing information, it is information —
     and leaving it in `missing` would tell a reader nobody had looked. */
  const row = withProspect("r2", { drafted: null, undrafted: true, college: null });
  const { known, missing } = knownAbout(row);
  assert.equal(known.find((k) => k.label === "NFL draft").value, "Undrafted");
  assert.equal(missing.includes("NFL draft position"), false);
});

check("but 'we could not tell' is still missing, and is NOT undrafted", () => {
  /* The state that exists so the screen never claims one for the other. A
     rookie whose name is in the draft under a spelling the join could not
     match reaches this branch, and saying "Undrafted" about him would be a
     fact nobody has. */
  const row = withProspect("r3", { drafted: null, undrafted: false, college: null });
  const { known, missing } = knownAbout(row);
  assert.equal(known.some((k) => k.label === "NFL draft"), false);
  assert.equal(missing.includes("NFL draft position"), true);
});

check("no prospect block at all behaves exactly as before", () => {
  const row = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const { missing } = knownAbout(row);
  assert.equal(missing.includes("NFL draft position"), true);
  assert.equal(missing.includes("College production"), true);
});

check("a college line moves college production out of the gaps", () => {
  const row = withProspect("r1", {
    drafted: null, undrafted: true,
    college: { ry: 1372, rt: 18, rc: 27, cy: 280 },
  });
  const { known, missing } = knownAbout(row);
  assert.equal(missing.includes("College production"), false);
  // By exact label, not startsWith: 'College' (his school) sits right beside
  // 'College production', and a prefix match found Notre Dame.
  assert.match(known.find((k) => k.label === "College production").value,
               /1,372 rush yds/);
  assert.equal(known.find((k) => k.label === "College").value, "Notre Dame",
               "and his school is still its own row");
});

check("the combine is missing for everybody, however much else we learn", () => {
  /* CFBD publishes no combine endpoint and no other feed here carries one, so
     this gap does not close no matter what else arrives. Named rather than
     dropped, so the day it exists it fills a hole the screen already points
     at. */
  const row = withProspect("r1", {
    drafted: { round: 1, pick: 1, overall: 1 }, undrafted: false,
    college: { ry: 1372 },
  });
  assert.equal(knownAbout(row).missing.includes("Combine testing"), true);
});

check("evidence counts what was actually learned", () => {
  const bare = rookies(BOARD, statOf, rankBy).find((r) => r.player.id === "r1");
  const rich = withProspect("r1", {
    drafted: { round: 1, pick: 1, overall: 1 }, undrafted: false,
    college: { ry: 1372 },
  });
  assert.ok(evidence(rich).known > evidence(bare).known,
            "knowing his draft slot and his college line is more known, not the same");
  assert.ok(evidence(rich).total > evidence(rich).known,
            "and there is still more unknown than known — the combine, at least");
});

/* ---- the shared formatter ---- */

check("a position is formatted in the numbers it is judged on", () => {
  assert.deepEqual(productionLine("WR", { rc: 87, cy: 1243, ct: 12 }),
                   ["87 rec", "1,243 yds", "12 TD"]);
  assert.deepEqual(productionLine("RB", { ry: 1372, rt: 18 }),
                   ["1,372 rush yds", "18 TD"]);
  assert.equal(productionLine("QB", { py: 3535, pt: 41, pi: 6 })[0], "3,535 pass yds");
});

check("and nothing formats to nothing rather than throwing", () => {
  assert.deepEqual(productionLine("WR", null), []);
});

check("a kicker's college line is kicks, not an empty receiving line", () => {
  /* Without a K branch he fell through to the receiving one, every key came
     back undefined, and the row drew "College production" with nothing after
     it -- a label claiming a fact it does not have. Found on Trey Smack, on
     screen, not in a fixture. */
  assert.deepEqual(productionLine("K", { fgm: 18, fga: 22, xpm: 40 }),
                   ["18/22 FG", "40 XP"]);
});

check("a block this position cannot format is a GAP, not an empty label", () => {
  const row = { player: { id: "k1", pos: "K", name: "K" }, stat: STATS.k1,
                prospect: { drafted: null, undrafted: true, college: { rc: 0 } } };
  const { known, missing } = knownAbout(row);
  assert.equal(known.some((k) => k.label === "College production"), false);
  assert.equal(missing.includes("College production"), true);
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the prospect board");
process.exit(failures ? 1 : 0);
