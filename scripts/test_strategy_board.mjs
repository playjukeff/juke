/* The Strategy Room's arithmetic, driven outside a browser.
 *
 * This module answers "start him, not him", which is the most
 * consequential sentence this product says to somebody in-season — and the
 * room that renders it sits inside Clerk's <SignedIn>, which a keyless
 * build never draws. strategyBoard.js imports nothing so this can run at
 * all, and it runs in CI with no npm install like every other step there.
 *
 * Run: node scripts/test_strategy_board.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const {
  lineupRows, benchRows, swaps, bestSwaps, projectedTotal, injurySeverity, injuryWatch, weekScorer,
  platformScorer, leagueWeekPts, projectionSource,
} = await import(pathToFileURL(path.resolve("web/src/components/rooms/strategyBoard.js")).href);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

const P = (id, pos, projPts, over) =>
  Object.assign({ id, pos, projPts, name: "P" + id, inj: "", bye: 0 }, over || {});

const BOARD = [
  P("s1", "QB", 20),
  P("s2", "RB", 12),
  P("s3", "WR", 15),
  P("b1", "RB", 18),                        // beats the starting RB
  P("b2", "WR", 9),                         // does not beat the starting WR
  P("b3", "RB", 14),                        // also beats the starting RB
  P("b4", "TE", 30),                        // huge, but no TE is starting
  P("b5", "QB", null),                      // no projection
  P("h1", "WR", 11, { inj: "Q" }),
  P("h2", "RB", 10, { inj: "IR" }),
  P("h3", "TE", 8, { bye: 6 }),
  P("s4", "TE", null),                      // a STARTER with no projection
  P("bye1", "RB", 40, { bye: 6 }),          // huge, and on bye in week 6
  P("out1", "RB", 40, { inj: "O" }),        // huge, and out
];
const byId = new Map(BOARD.map((p) => [p.id, p]));

/* The room passes JukeEngine.projPerGame — a WEEKLY number. The fixture's
   projPts are already weekly, so this is identity; what it exercises is
   that the module takes the function rather than reading a season total
   off the row, which is the bug that shipped for one build. */
const weekPts = (p) => (typeof p.projPts === 'number' ? p.projPts : null);

const TEAM = {
  rosterId: 1,
  starters: ["s1", "s2", "s3"],
  players: ["s1", "s2", "s3", "b1", "b2", "b3", "b4", "b5", "h1", "h2", "h3"],
};

check("a lineup is the starters, in the league's own slot order", () => {
  const rows = lineupRows(TEAM, byId, weekPts);
  assert.deepEqual(rows.map((r) => r.id), ["s1", "s2", "s3"]);
});

check("an unfilled slot is not a player", () => {
  /* Sleeper pads an empty slot with "0". A row for it would draw a
     nameless starter and count toward the total. */
  const rows = lineupRows({ starters: ["s1", "0", "s3"], players: [] }, byId, weekPts);
  assert.deepEqual(rows.map((r) => r.id), ["s1", "s3"]);
});

check("a starter the board has never heard of still gets a row", () => {
  const rows = lineupRows({ starters: ["s1", "ghost"], players: [] }, byId, weekPts);
  assert.equal(rows.length, 2, "dropping him would make an incomplete lineup look like a short one");
  assert.equal(rows[1].player, null);
  assert.equal(rows[1].projPts, null);
});

check("the bench is rostered and not starting", () => {
  const ids = benchRows(TEAM, byId, weekPts).map((r) => r.id);
  assert.equal(ids.includes("s1"), false);
  assert.equal(ids.includes("b1"), true);
});

check("a swap is same-position only", () => {
  const all = swaps(TEAM, byId, weekPts);
  for (const s of all) {
    assert.equal(
      s.start.pos, s.sit.pos,
      "a FLEX may allow more, but roster_positions is not in the snapshot — so this is the only swap that can be PROVEN legal"
    );
  }
  assert.equal(
    all.some((s) => s.start.id === "b4"), false,
    "a 30-point tight end is not a swap when no tight end is starting"
  );
});

check("only swaps that gain anything are offered", () => {
  const all = swaps(TEAM, byId, weekPts);
  assert.ok(all.every((s) => s.gain > 0));
  assert.equal(all.some((s) => s.start.id === "b2"), false, "WR 9 does not replace WR 15");
});

check("they come back by gain, biggest first", () => {
  const gains = swaps(TEAM, byId, weekPts).map((s) => s.gain);
  assert.deepEqual(gains, gains.slice().sort((a, b) => b - a));
  assert.equal(gains[0], 6, "RB 18 for RB 12");
});

check("a player with no projection is never on either side", () => {
  const all = swaps(TEAM, byId, weekPts);
  assert.equal(all.some((s) => s.start.id === "b5"), false, "not as the player coming in");

  /* The SIT side is the dangerous one, and this test missed it at first:
     a bench player scored 0 never beats a real starter, so guarding only
     the bench passes while the bug is still live. A STARTER read as 0
     makes every bench player at his position look like a huge upgrade —
     which is the room telling somebody to bench a player it simply has no
     projection for. */
  const withUnprojectedStarter = {
    starters: ["s4"],
    players: ["s4", "b4", "h3"],
  };
  const risky = swaps(withUnprojectedStarter, byId, weekPts);
  assert.deepEqual(
    risky, [],
    "a starter with no projection must not read as zero and invite a 30-point 'upgrade'"
  );
});

check("a player on bye is never the one to start", () => {
  /* Found by driving the room: it offered Ja'Marr Chase over Jordan
     Addison in week 6, and Chase was on bye. A start/sit call for a player
     who will not be on the field is worse than no call, because the reader
     acts on it and the slot scores nothing. */
  const team = { starters: ["s2"], players: ["s2", "bye1"] };
  assert.equal(
    swaps(team, byId, weekPts, 6).length, 0,
    "a 40-point back on bye is not an upgrade on anybody"
  );
  assert.equal(
    swaps(team, byId, weekPts, 7).length, 1,
    "and in a week he plays, he is"
  );
});

check("a player who is OUT is never the one to start", () => {
  const team = { starters: ["s2"], players: ["s2", "out1"] };
  assert.equal(swaps(team, byId, weekPts, 7).length, 0);
});

check("but a starter on bye is exactly who to swap OUT", () => {
  /* The sit side is deliberately not filtered: hiding those rows would
     remove the most useful recommendations on the screen. */
  const team = { starters: ["bye1"], players: ["bye1", "s2"] };
  const found = swaps(team, byId, weekPts, 6);
  assert.equal(found.length, 1);
  assert.equal(found[0].sit.id, "bye1");
});

check("bestSwaps gives one line per decision, not one per pair", () => {
  const best = bestSwaps(TEAM, byId, weekPts);
  const sat = best.map((s) => s.sit.id);
  assert.deepEqual(
    sat, [...new Set(sat)],
    "b1 and b3 both beat s2; a reader wants the decision once"
  );
  assert.equal(best[0].start.id, "b1", "and the better of the two");
});

check("the projected total is the starters' projections", () => {
  assert.equal(projectedTotal(TEAM, byId, weekPts), 47);
});

check("a lineup with an unprojected starter has no total at all", () => {
  const t = { starters: ["s1", "b5"], players: [] };
  assert.equal(
    projectedTotal(t, byId, weekPts), null,
    "a partial sum reads as a lineup worth less than it is, and this number exists to be compared"
  );
});

check("an empty lineup is null, not zero", () => {
  assert.equal(
    projectedTotal({ starters: [], players: [] }, byId, weekPts), null,
    "nothing set is a different fact from set and worth nothing"
  );
});

check("injury codes split into out and questionable, and nothing else", () => {
  for (const code of ["O", "IR", "PUP", "SUS", "DNR"]) {
    assert.equal(injurySeverity(code), "out", code);
  }
  assert.equal(injurySeverity("Q"), "questionable");
  assert.equal(injurySeverity(""), null);
  assert.equal(injurySeverity(undefined), null);
});

check("the injury watch carries byes without calling them injuries", () => {
  const rows = injuryWatch(TEAM, byId, 6);
  const bye = rows.find((r) => r.player.id === "h3");
  assert.ok(bye, "a bye is the same problem on the day: the slot is empty");
  assert.equal(bye.severity, null, "and he is not hurt");
  assert.equal(bye.onBye, true);
});

check("no week means no bye is claimed", () => {
  /* A snapshot taken before the season has `week: null`. Comparing every
     player against that would report the whole roster as on bye. */
  const rows = injuryWatch(TEAM, byId, null);
  assert.equal(rows.some((r) => r.onBye), false);
  assert.equal(rows.some((r) => r.player.id === "h2"), true, "injuries still report");
});

check("healthy, available players are not on the list", () => {
  const rows = injuryWatch(TEAM, byId, 6).map((r) => r.player.id);
  assert.equal(rows.includes("s1"), false);
  assert.equal(rows.includes("b1"), false);
});

check("starters come before the bench", () => {
  const team = { starters: ["h1"], players: ["h1", "h2"] };
  const rows = injuryWatch(team, byId, null);
  assert.equal(rows[0].player.id, "h1", "a questionable STARTER is the decision; a hurt bench player is not");
});

/* ---- the bye, which nothing on the screen was passing a week to ----
 *
 * Every figure in the room asks weekPts(player) and none of it passes a
 * week, so a starter on bye was contributing his season average to a total
 * captioned "Points this week". Confirmed red by having weekScorer() return
 * base(player) unconditionally: the bye checks fail and the rest stay green. */
const byeBase = (p) => (p && typeof p.projPts === "number" ? p.projPts : null);

check("a player on bye this week scores nothing", () => {
  assert.equal(weekScorer(byeBase, 7)({ bye: 7, projPts: 14 }), 0);
});

check("and everybody else is untouched", () => {
  assert.equal(weekScorer(byeBase, 7)({ bye: 11, projPts: 14 }), 14);
});

check("zero rather than null, because projectedTotal() blanks on null", () => {
  const score = weekScorer(byeBase, 7);
  const ids = new Map([["x", { id: "x", bye: 7, projPts: 14 }],
                       ["y", { id: "y", bye: 11, projPts: 10 }]]);
  assert.equal(projectedTotal({ starters: ["x", "y"], players: [] }, ids, score), 10,
    "a bye is a slot worth nothing, not a lineup that cannot be priced");
});

check("no week means nobody is on bye, rather than everybody", () => {
  assert.equal(weekScorer(byeBase, null)({ bye: 7, projPts: 14 }), 14,
    "same rule injuryWatch() follows");
});

check("a player with no bye recorded is never zeroed", () => {
  assert.equal(weekScorer(byeBase, 7)({ bye: 0, projPts: 14 }), 14);
  assert.equal(weekScorer(byeBase, 7)({ projPts: 14 }), 14);
});

check("a missing player is still null, not zero", () => {
  assert.equal(weekScorer(byeBase, 7)(null), null);
});

check("the bench is priced the same way", () => {
  const score = weekScorer(byeBase, 7);
  const ids = new Map([["s", { id: "s", bye: 11, projPts: 9 }],
                       ["b", { id: "b", bye: 7, projPts: 12 }]]);
  const rows = benchRows({ starters: ["s"], players: ["s", "b"] }, ids, score);
  assert.equal(rows[0].projPts, 0, "a bench player on bye is not a swap worth making");
});

/* ---- the league's own number, which is the one a reader checks us against ----
 *
 * The owner's requirement, 10 September 2026: the projection a connected
 * league shows has to match in Juke. The snapshot carries the platform's
 * own weekly number and these are the rules for when it is used. Confirmed
 * red three ways: platformScorer() returning `base` unconditionally fails
 * the first; dropping its week check fails the stale-week one; and making
 * a missing id answer null rather than fall back fails the per-player one. */
const juke = (p) => (p && typeof p.projPts === "number" ? p.projPts : null);
const PROJ = { week: 1, source: "espn", points: { a: 24.4419, b: 8.5 } };

check("the league's number wins over Juke's for the same player", () => {
  assert.equal(platformScorer(juke, PROJ, 1)({ id: "a", projPts: 26.0 }), 24.4419);
});

check("but only for the week it was stamped with", () => {
  assert.equal(platformScorer(juke, PROJ, 2)({ id: "a", projPts: 26.0 }), 26.0,
    "week 1's projection is not an answer about week 2");
});

check("a player the league sent nothing for falls back to Juke, per player", () => {
  const score = platformScorer(juke, PROJ, 1);
  assert.equal(score({ id: "z", projPts: 11 }), 11);
  const ids = new Map([["a", { id: "a", projPts: 26 }], ["z", { id: "z", projPts: 11 }]]);
  const total = projectedTotal({ starters: ["a", "z"], players: [] }, ids, score);
  assert.ok(Math.abs(total - 35.4419) < 1e-9,
    "one missing row is filled, not a lineup that cannot be totalled: " + total);
});

check("a league zero is the league's answer, not a gap to fill", () => {
  const P0 = { week: 1, points: { a: 0 } };
  assert.equal(platformScorer(juke, P0, 1)({ id: "a", projPts: 14 }), 0);
});

check("no projections, or no week, leaves the scorer exactly as it was", () => {
  assert.equal(platformScorer(juke, null, 1), juke);
  assert.equal(platformScorer(juke, PROJ, null), juke);
});

check("ids are compared as strings, since a defense's id is its club", () => {
  const P1 = { week: 3, points: { LAR: 8.5, "4984": 20 } };
  assert.equal(platformScorer(juke, P1, 3)({ id: "LAR" }), 8.5);
  assert.equal(platformScorer(juke, P1, 3)({ id: 4984 }), 20);
});

/* The one builder every connected screen shares. A stub engine stands in
 * for window.JukeEngine, which is the reason strategyBoard.js takes it as a
 * parameter rather than reading it off window. */
const engine = {
  projPerGame: (p) => p.projPts,
  projPerGameUnder: (p) => p.projPts + 100,              // "the league's rules"
  weekProjectionUnder: (p, _r, w) => (p.wk && p.wk[w] != null ? p.wk[w] : null),
};

check("leagueWeekPts prefers the league, then Juke's week, then the average", () => {
  const snap = { week: 1, rules: { rec: 1 }, projections: { week: 1, points: { a: 24.44 } } };
  const score = leagueWeekPts(engine, snap);
  assert.equal(score({ id: "a", projPts: 1, wk: { 1: 5 } }), 24.44, "the league's own number");
  assert.equal(score({ id: "b", projPts: 1, wk: { 1: 5 } }), 5, "Juke's weekly block");
  assert.equal(score({ id: "c", projPts: 1 }), 101, "the average under the league's rules");
});

check("and a bye beneath the league's number, never above it", () => {
  const snap = { week: 7, rules: {}, projections: { week: 7, points: { a: 3 } } };
  const score = leagueWeekPts(engine, snap);
  assert.equal(score({ id: "a", projPts: 9, bye: 7 }), 3, "the league's answer for that week stands");
  assert.equal(score({ id: "b", projPts: 9, bye: 7 }), 0, "the fallback still zeroes a bye");
});

check("projectionSource says whose numbers a lineup carries", () => {
  const rows = [{ player: { id: "a" } }, { player: { id: "b" } }];
  assert.equal(projectionSource(rows, { week: 1, points: { a: 1, b: 2 } }, 1), "all");
  assert.equal(projectionSource(rows, { week: 1, points: { a: 1 } }, 1), "some");
  assert.equal(projectionSource(rows, { week: 2, points: { a: 1, b: 2 } }, 1), "none");
  assert.equal(projectionSource(rows, null, 1), "none");
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the strategy board");
process.exit(failures ? 1 : 0);
