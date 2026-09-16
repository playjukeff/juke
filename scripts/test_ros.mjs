/* The season in progress: app.js section 10a2, without a browser.
 *
 * Every function here is LIFTED out of app.js by brace walk and run as
 * shipped -- test_season_sim.mjs's discipline, for its reason: a copy in a
 * test agrees with itself while the product is wrong. What app.js reads
 * from the rest of the file (the board, statOf, pointsUnder, replacement
 * ranks) is handed in as a small world whose answers can be worked out by
 * hand.
 *
 * The things asserted are the ones that fail silently:
 *   - the clock: a contract another screen codes against, in every phase;
 *   - the shrinkage: one game moves the rate a little, never all the way;
 *   - games left: a bye and a known absence are not games;
 *   - replacement is re-derived on rest-of-season points, and a kicker or
 *     a defense is scored and never ranked;
 *   - "who moved" is built from stored weeks and has exactly its shape.
 *
 * Run: node scripts/test_ros.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve("app.js"), "utf8").replace(/\r\n/g, "\n");

function lift(signature) {
  const start = app.indexOf(signature);
  assert.ok(start !== -1, `app.js no longer contains ${signature}`);
  let depth = 0;
  for (let i = app.indexOf("{", start); i < app.length; i += 1) {
    if (app[i] === "{") depth += 1;
    else if (app[i] === "}") { depth -= 1; if (depth === 0) return app.slice(start, i + 1); }
  }
  throw new Error(`${signature} never closes`);
}
function liftConst(name) {
  const m = new RegExp(`\\nconst ${name} = [^;]*;`).exec(app);
  assert.ok(m, `app.js no longer declares ${name}`);
  return m[0];
}

const SRC = [
  "REGULAR_WEEKS", "ROS_LAST_WEEK", "ROS_K", "ROS_OUT_WEEKS", "NFL_PHASES", "MOVERS_POOL",
].map(liftConst).join("\n") + "\n" + [
  "function seasonClockFrom(state, meta, scored)",
  // The banding the preseason Juke score uses. Lifted rather than
  // restated: a second copy here would agree with itself while the
  // two scores on the player page drifted into different bands.
  "function label(score)",
  "function rosWeight(pos, games)",
  "function rosRate(prior, observed, games, pos)",
  "function rosGamesLeft(player, clock, log)",
  "function moversSince(clock)",
  "function seasonToDateUnder(player, rules, season, throughWeek)",
  "function seasonLog(player, season)",
  "function buildRosTable(rules, lg, clock, tw, key)",
  "function playerMovers(opts)",
].map(lift).join("\n");

/* ---- a world small enough to work out by hand ------------------------ */
const STAT = {};
function makeWorld({ board, stats, league }) {
  Object.keys(STAT).forEach((k) => delete STAT[k]);
  Object.assign(STAT, stats);
  const deps = {
    board,
    league,
    statOf: (p) => STAT[p.id] || null,
    // One rule table, points per unit of `x` -- the arithmetic the real
    // pointsUnder does, over one key.
    pointsUnder: (block, rules) => Math.round((block && block.x ? block.x * rules.x : 0) * 10) / 10,
    didPlay: (row) => !!row && Object.keys(row).some((k) => k !== "w" && k !== "gp" && row[k]),
    projGames: (pos, block) => (block && block.gp ? block.gp - 1 : 0),
    // replacementRank()'s shape: teams x starters + 1.
    replacementRank: (pos, lg) => lg.teams * ((lg.starters && lg.starters[pos]) || 0) + 1,
    POSITIONS: ["QB", "RB", "WR", "TE", "K", "DST"],
    UNRANKED_POSITIONS: ["K", "DST"],
    rosBoard: null,
  };
  const names = Object.keys(deps);
  const f = new Function(...names, SRC + "\nreturn { REGULAR_WEEKS, ROS_LAST_WEEK, ROS_K, ROS_OUT_WEEKS, MOVERS_POOL, label, seasonClockFrom, rosWeight, rosRate, rosGamesLeft, moversSince, seasonToDateUnder, buildRosTable, playerMovers, setBoard: (fn) => { rosBoard = fn } };");
  return f(...names.map((n) => deps[n]));
}

const fails = [];
const note = [];
const check = (name, fn) => {
  try { fn(); note.push("ok  " + name); } catch (e) { fails.push(name + "\n    " + e.message); }
};

const E = makeWorld({ board: [], stats: {}, league: { teams: 10, starters: {} } });

/* ---- the clock: the contract, in every phase ------------------------ */
// Sleeper's own answer on 11 September 2026, as the pipeline stores it.
const WEEK1 = { season: "2026", week: 1, seasonType: "regular", seasonStart: "2026-09-09", hasScores: true };

check("week 1 under way: started, nothing complete, exactly the contract's keys", () => {
  assert.deepEqual(E.seasonClockFrom(WEEK1, null, false),
    { season: "2026", week: 1, phase: "regular", started: true, weeksComplete: 0 });
});
check("the regular season before its first score has not started", () => {
  assert.equal(E.seasonClockFrom({ ...WEEK1, hasScores: false }, null, false).started, false);
});
check("week 5 has four weeks complete and has started whatever hasScores says", () => {
  const c = E.seasonClockFrom({ ...WEEK1, week: 5, hasScores: false }, null, false);
  assert.equal(c.weeksComplete, 4);
  assert.equal(c.started, true);
});
check("preseason and offseason are named and have not started", () => {
  assert.deepEqual(E.seasonClockFrom({ ...WEEK1, seasonType: "pre", week: 0, hasScores: false }, null, false),
    { season: "2026", week: 0, phase: "preseason", started: false, weeksComplete: 0 });
  assert.equal(E.seasonClockFrom({ ...WEEK1, seasonType: "off" }, null, false).phase, "offseason");
  assert.equal(E.seasonClockFrom({ ...WEEK1, seasonType: "off" }, null, false).started, false);
});
check("the postseason has started and every regular week is complete", () => {
  const c = E.seasonClockFrom({ ...WEEK1, seasonType: "post", week: 2 }, null, false);
  assert.equal(c.phase, "postseason");
  assert.equal(c.started, true);
  assert.equal(c.weeksComplete, E.REGULAR_WEEKS);
});
check("a season type the clock does not know is null, not a guess", () => {
  assert.equal(E.seasonClockFrom({ ...WEEK1, seasonType: "mid" }, null, false), null);
});
check("no state falls back to WEEK_PROJ_META, which only exists in a regular season", () => {
  assert.deepEqual(E.seasonClockFrom(null, { season: 2026, week: 3 }, false),
    { season: "2026", week: 3, phase: "regular", started: true, weeksComplete: 2 });
  assert.equal(E.seasonClockFrom(null, { season: 2026, week: 1 }, false).started, false, "week 1, nothing stored");
  assert.equal(E.seasonClockFrom(null, { season: 2026, week: 1 }, true).started, true, "week 1, a game stored");
});
check("and with neither it answers null", () => {
  assert.equal(E.seasonClockFrom(null, null, false), null);
  assert.equal(E.seasonClockFrom(undefined, undefined, true), null);
});

/* ---- the shrinkage --------------------------------------------------- */
check("k is fitted: 10 for the skill positions, 3 for a kicker, 21 for a defense", () => {
  assert.deepEqual(E.ROS_K, { QB: 10, RB: 10, WR: 10, TE: 10, K: 3, DST: 21 });
});
check("no games: the rate IS the preseason rate", () => {
  assert.equal(E.rosRate(18, null, 0, "RB"), 18);
});
check("one game is a tenth of a vote -- a 40-point week moves a 20-point back about 1.8", () => {
  assert.equal(E.rosWeight("RB", 1), 1 / 11);
  assert.ok(Math.abs(E.rosRate(20, 40, 1, "RB") - (20 + 20 / 11)) < 1e-9);
});
check("three games in is 23% on this season, four 29%, eight 44%", () => {
  assert.equal(Math.round(E.rosWeight("WR", 3) * 100), 23);
  assert.equal(Math.round(E.rosWeight("WR", 4) * 100), 29);
  assert.equal(Math.round(E.rosWeight("WR", 8) * 100), 44);
});
check("a kicker's season counts for more, sooner -- his prior has no short kicks in it", () => {
  assert.equal(E.rosWeight("K", 3), 0.5);
});
check("no prior means no rate, not the season so far relabelled", () => {
  assert.equal(E.rosRate(null, 30, 4, "WR"), null);
});

/* ---- games left ------------------------------------------------------ */
const clock4 = { season: "2026", week: 4, phase: "regular", started: true, weeksComplete: 3 };
check("weeks 4..17 is fourteen games, less a bye still to come", () => {
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "" }, clock4, []), 13);
  assert.equal(E.rosGamesLeft({ bye: 2, inj: "" }, clock4, []), 14, "a bye already gone costs nothing");
});
check("a game already played this week is not still to come", () => {
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "" }, clock4, [{ w: 4, x: 3 }]), 12);
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "" }, clock4, [{ w: 4 }]), 12, "an inactive row: his game is over too");
});
check("OUT costs this week, IR the NFL's four-game minimum", () => {
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "O" }, clock4, []), 12);
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "IR" }, clock4, []), 9);
  assert.equal(E.rosGamesLeft({ bye: 5, inj: "IR" }, clock4, []), 10, "a bye inside the IR weeks is not taken twice");
  assert.equal(E.rosGamesLeft({ bye: 9, inj: "Q" }, clock4, []), 13, "questionable is 'we do not know' and costs nothing");
});
check("the season ends at week 17", () => {
  assert.equal(E.ROS_LAST_WEEK, 17);
  assert.equal(E.rosGamesLeft({ bye: 0, inj: "" }, { ...clock4, week: 17 }, []), 1);
  assert.equal(E.rosGamesLeft({ bye: 0, inj: "" }, { ...clock4, week: 18 }, []), 0);
});

check("who moved is measured from the start of the last complete week", () => {
  assert.equal(E.moversSince({ weeksComplete: 0 }), 0, "week 1: since the preseason");
  assert.equal(E.moversSince({ weeksComplete: 1 }), 0, "week 2: week 1 and anything since");
  assert.equal(E.moversSince({ weeksComplete: 3 }), 2, "week 4: week 3 and anything since");
});

/* ---- the table: replacement on ROS points, K/DST scored and unranked ---- */
// A 2-team league starting one RB and one WR, so replacement is the third.
const rules = { x: 1 };
const league = { teams: 2, starters: { RB: 1, WR: 1, K: 1 } };
const board = [
  { id: "r1", pos: "RB", bye: 10, inj: "" }, // the preseason #1: 18/g, a 4-point week 1
  { id: "r2", pos: "RB", bye: 10, inj: "" }, // 16/g, a 38-point week 1
  { id: "r3", pos: "RB", bye: 10, inj: "" }, // 10/g, did not play -- replacement
  { id: "r4", pos: "RB", bye: 10, inj: "" }, // 5/g, below replacement: the floor
  { id: "w1", pos: "WR", bye: 10, inj: "" },
  { id: "w2", pos: "WR", bye: 10, inj: "" },
  { id: "w3", pos: "WR", bye: 10, inj: "" },
  { id: "k1", pos: "K", bye: 10, inj: "" },
  { id: "k2", pos: "K", bye: 10, inj: "" },
];
const season = (ppg) => ({ x: ppg * 17, gp: 18 });
const stats = {
  r1: { p: season(18), w: { 2026: [{ w: 1, x: 4 }] } },
  r2: { p: season(16), w: { 2026: [{ w: 1, x: 38 }] } },
  r3: { p: season(10), w: { 2026: [{ w: 1 }] } },
  r4: { p: season(5), w: { 2026: [{ w: 1 }] } },
  w1: { p: season(15), w: { 2026: [{ w: 1, x: 15 }] } },
  w2: { p: season(12), w: { 2026: [{ w: 1, x: 12 }] } },
  w3: { p: season(8) },
  k1: { p: season(8), w: { 2026: [{ w: 1, x: 14 }] } },
  k2: { p: season(7), w: { 2026: [{ w: 1, x: 7 }] } },
};
const W = makeWorld({ board, stats, league });
const clock1 = { season: "2026", week: 1, phase: "regular", started: true, weeksComplete: 0 };
const now = W.buildRosTable(rules, league, clock1, "all", "k");
const pre = W.buildRosTable(rules, league, clock1, 0, "k0");

check("season to date is scored games only; a DNP row is not a zero game", () => {
  assert.deepEqual(W.seasonToDateUnder(board[2], rules, "2026", null), { games: 0, points: 0, ppg: null });
  assert.deepEqual(W.seasonToDateUnder(board[1], rules, "2026", null), { games: 1, points: 38, ppg: 38 });
  assert.deepEqual(W.seasonToDateUnder(board[1], rules, "2026", 0), { games: 0, points: 0, ppg: null }, "held back");
});
check("rest of season = shrunk rate x games left", () => {
  const r = now.rows.r2; // 16 + (38-16)/11 = 18, 15 games left (week 1 played, bye 10)
  assert.ok(Math.abs(r.rate - 18) < 1e-9, "rate " + r.rate);
  assert.equal(r.left, 15);
  assert.equal(r.pts, 270);
});
check("the owner's case: a poor week moves the #1 a little, a monster week moves a rival past him", () => {
  assert.equal(pre.rows.r1.rank, 1, "preseason #1");
  const r1 = now.rows.r1.rate; // 18 - 14/11 = 16.73
  assert.ok(r1 > 16.5 && r1 < 17, "one bad game costs him about 1.3 a game, not his standing: " + r1);
  assert.ok(now.rows.r2.pts > now.rows.r1.pts, "the 38-point back is ahead now");
});
check("replacement is re-derived on rest-of-season points, at replacementRank()'s own rank", () => {
  // RB rank 3 (2 teams x 1 + 1): r3, who missed week 1 and is priced on his prior.
  assert.equal(now.replacement.RB, now.rows.r3.pts);
  assert.equal(now.rows.r1.gap, now.rows.r1.pts - now.rows.r3.pts);
});
check("a kicker keeps his points and loses every rating", () => {
  assert.ok(now.rows.k1.pts > 0);
  assert.equal(now.rows.k1.gap, null);
  assert.equal(now.rows.k1.rank, null);
  assert.equal(now.rows.k1.score, null);
  assert.equal(now.rows.k1.posRank, null);
});
check("the rest-of-season Juke score is that gap as a share of the best one left", () => {
  const best = Math.max(...Object.values(now.rows).map((r) => r.gap || 0));
  assert.ok(best > 0, "a board where nobody is above replacement cannot test a share");
  // The leader is the 100 by construction; everybody else is measured off him.
  const top = Object.values(now.rows).find((r) => r.gap === best);
  assert.equal(top.score, 100);
  assert.equal(now.rows.r1.score, Math.round((now.rows.r1.gap / best) * 100));
  // Whole numbers, not a float's worth of decimals: this is a display figure
  // and this is the only place it is made.
  Object.values(now.rows).forEach((r) => {
    if (r.score !== null) assert.equal(r.score, Math.round(r.score), r.id + " is not whole");
  });
  // Banded by the same function the preseason score uses, so the two read
  // against each other rather than as two unrelated ratings.
  assert.equal(now.rows.r1.scoreLabel, W.label(now.rows.r1.score));
  assert.equal(now.rows.k1.scoreLabel, null, "a withheld score has no band");
});
check("a score below replacement floors at 0 rather than going negative", () => {
  const under = Object.values(now.rows).filter((r) => r.gap !== null && r.gap < 0);
  assert.ok(under.length > 0, "no player is below replacement, so the floor is untested");
  under.forEach((r) => {
    assert.equal(r.score, 0, r.id);
    assert.ok(r.gap < 0, r.id + " keeps the un-clamped gap that tells two zeros apart");
  });
});
check("ranks run across positions by value over replacement, K and DST excluded", () => {
  const ranked = Object.values(now.rows).filter((r) => r.rank !== null).sort((a, b) => a.rank - b.rank).map((r) => r.id);
  assert.deepEqual(ranked.slice(0, 2), ["r2", "r1"]);
  assert.equal(ranked.length, 7);
});
check("a player with no projection has no rest of season", () => {
  const V = makeWorld({ board: [{ id: "n", pos: "WR", bye: 9, inj: "" }], stats: { n: { w: { 2026: [{ w: 1, x: 30 }] } } }, league });
  assert.equal(V.buildRosTable(rules, league, clock1, "all", "z").rows.n.pts, null);
});

/* ---- who moved: exactly the contract's shape ------------------------ */
const boardRows = {};
for (const r of Object.values(now.rows)) {
  const before = pre.rows[r.id].rank;
  boardRows[r.id] = { ...r, rankBefore: before, ptsBefore: pre.rows[r.id].pts, delta: r.rank !== null && before !== null ? before - r.rank : null };
}
W.setBoard(() => ({ rows: boardRows }));
const movers = W.playerMovers({ limit: 5 });

check("playerMovers answers exactly { id, name, pos, team, rankNow, rankBefore, delta, seasonPts, ppg }", () => {
  assert.ok(movers.length > 0);
  for (const m of movers) {
    assert.deepEqual(Object.keys(m).sort(), ["delta", "id", "name", "pos", "ppg", "rankBefore", "rankNow", "seasonPts", "team"].sort());
  }
});
check("ordered by rest-of-season points moved, not by places", () => {
  // w3 (8/g, no games) slides a place as others move around him but his own
  // points never change -- he can only come after anybody whose did.
  const moved = (m) => Math.abs(boardRows[m.id].pts - boardRows[m.id].ptsBefore);
  for (let i = 1; i < movers.length; i++) assert.ok(moved(movers[i - 1]) >= moved(movers[i]), movers.map((m) => m.id + ":" + moved(m)).join(" "));
});
check("the biggest move first, up is positive, and nobody who did not move", () => {
  assert.equal(movers[0].id, "r2");
  assert.equal(movers[0].delta, movers[0].rankBefore - movers[0].rankNow);
  assert.ok(movers[0].delta > 0);
  assert.ok(movers.every((m) => m.delta !== 0));
  assert.ok(!movers.some((m) => m.pos === "K"), "a kicker is never a mover: he has no rank");
});
check("limit is honoured, and out of season it is []", () => {
  assert.equal(W.playerMovers({ limit: 1 }).length, 1);
  W.setBoard(() => null);
  assert.deepEqual(W.playerMovers({ limit: 5 }), []);
});

for (const n of note) console.log(n);
if (fails.length) {
  console.log(`\n${fails.length} FAILED`);
  for (const f of fails) console.log("FAIL " + f);
  process.exit(1);
}
console.log("\nOK — the season in progress");
