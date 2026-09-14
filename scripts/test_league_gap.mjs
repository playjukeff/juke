/* Which league a connected room prices players under.
 *
 * leagueGapOf() hands the Waiver and Trade rooms (and v3's wire, trade and
 * league pages) their `gapOf`. It used to be JukeEngine.replacementGap --
 * the Draft Room's scoring and team count -- so a 12-team full-PPR league
 * was priced as a 10-team half-PPR mock (the audit of 10 September 2026).
 * The engine half, replacementGapUnder(), is checked in a real browser
 * against replacementGap() (identical on all 415 priced players under the
 * Draft Room's own shape); this is the routing, which imports nothing.
 *
 * Run: node scripts/test_league_gap.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { leagueGapOf } = await import(pathToFileURL(path.resolve("web/src/lib/leagueGap.js")).href);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

const calls = [];
const engine = {
  replacementGap: (p) => ["draft", p.id],
  replacementGapUnder: (p, rules, lineup, teams) => { calls.push({ rules, lineup, teams }); return ["league", p.id]; },
};
const lineup = { starters: { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 }, flex: 1, superflex: 0, bench: 6 };
const snap = { rules: { rec: 1 }, lineup, teams: new Array(12).fill({}) };

check("a snapshot with a lineup is priced under that league", () => {
  const gapOf = leagueGapOf(engine, snap);
  assert.deepEqual(gapOf({ id: "x" }), ["league", "x"]);
  const last = calls[calls.length - 1];
  assert.equal(last.teams, 12, "its own team count, not the Draft Room's");
  assert.deepEqual(last.rules, { rec: 1 }, "its own scoring");
  assert.equal(last.lineup, lineup, "and its own roster shape");
});

check("a snapshot with no lineup falls back to the Draft Room, as every caller did before", () => {
  const gapOf = leagueGapOf(engine, { rules: { rec: 1 }, teams: [{}, {}] });
  assert.deepEqual(gapOf({ id: "y" }), ["draft", "y"]);
});

check("so does one with no teams", () => {
  assert.deepEqual(leagueGapOf(engine, { lineup, teams: [] })({ id: "z" }), ["draft", "z"]);
});

check("no snapshot at all is the Draft Room's function", () => {
  assert.equal(leagueGapOf(engine, null), engine.replacementGap);
});

check("an engine from before the bridge entry existed still prices", () => {
  const old = { replacementGap: engine.replacementGap };
  assert.deepEqual(leagueGapOf(old, snap)({ id: "w" }), ["draft", "w"]);
});

check("no engine is null, not a function that throws", () => {
  assert.equal(leagueGapOf(null, snap), null);
});

check("a league without scoring rules is still priced under its own shape", () => {
  const gapOf = leagueGapOf(engine, { lineup, teams: [{}, {}, {}] });
  assert.deepEqual(gapOf({ id: "v" }), ["league", "v"]);
  assert.equal(calls[calls.length - 1].rules, null);
});

/* ---- in season: the rest of the season, under the same league ---- */
let live = false;
const rosCalls = [];
const seasonEngine = {
  ...engine,
  rosLive: () => live,
  rosGapUnder: (p, rules, lineup, teams) => { rosCalls.push({ rules, lineup, teams }); return ["ros", p.id]; },
};

check("out of season the season-aware engine prices exactly as before", () => {
  live = false;
  const gapOf = leagueGapOf(seasonEngine, snap);
  assert.deepEqual(gapOf({ id: "a" }), ["league", "a"]);
  assert.equal(rosCalls.length, 0, "and never asks for a rest-of-season figure");
});

check("in season a claim is priced on the rest of the season, under the league's own shape", () => {
  live = true;
  const gapOf = leagueGapOf(seasonEngine, snap);
  assert.deepEqual(gapOf({ id: "b" }), ["ros", "b"]);
  const last = rosCalls[rosCalls.length - 1];
  assert.equal(last.teams, 12);
  assert.deepEqual(last.rules, { rec: 1 });
  assert.equal(last.lineup, lineup);
});

check("the season is asked when the function is CALLED, so a page held open across the nightly moves with it", () => {
  live = false;
  const gapOf = leagueGapOf(seasonEngine, snap);
  assert.deepEqual(gapOf({ id: "c" }), ["league", "c"]);
  live = true;
  assert.deepEqual(gapOf({ id: "c" }), ["ros", "c"]);
});

check("in season with no lineup it is the Draft Room's shape, on the rest of the season", () => {
  live = true;
  const gapOf = leagueGapOf(seasonEngine, { rules: { rec: 1 }, teams: [] });
  assert.deepEqual(gapOf({ id: "d" }), ["ros", "d"]);
  const last = rosCalls[rosCalls.length - 1];
  assert.equal(last.lineup, undefined, "no invented lineup");
  assert.deepEqual(last.rules, { rec: 1 });
});

check("no snapshot in season is still the rest of the season, never the preseason", () => {
  live = true;
  assert.deepEqual(leagueGapOf(seasonEngine, null)({ id: "e" }), ["ros", "e"]);
});

console.log();
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("OK");
