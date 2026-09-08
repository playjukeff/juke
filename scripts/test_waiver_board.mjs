/* The Waiver Room's arithmetic, driven outside a browser.
 *
 * Same reasoning as test_league_state.mjs and test_decision_state.mjs:
 * every surface that renders this sits inside Clerk's <SignedIn>, a test
 * build has no publishable key, so the page draws the signed-out fallback
 * and the room never mounts. waiverBoard.js imports nothing, which is what
 * makes it reachable at all — and this is the module that decides what a
 * manager is told to claim, so "only checkable by looking at a screen
 * nobody can reach" was not an acceptable place for it to live.
 *
 * Run: node scripts/test_waiver_board.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const {
  rosteredIds, myTeam, freeAgents, rosterGaps, dropList, rivalNeeds, demandByPosition,
} = await import(
  pathToFileURL(path.resolve("web/src/components/rooms/waiverBoard.js")).href
);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

/* A board row is only ever read for `id`, `pos`, `name` and whatever the
   caller's gapOf() wants, so the fixture carries those and a projPts the
   stand-in gap function reads. */
const P = (id, pos, projPts, name) => ({ id, pos, projPts, name: name || ("P" + id) });

const BOARD = [
  P("1", "RB", 260, "Held Back"),
  P("2", "WR", 240, "Free Receiver"),
  P("3", "RB", 200, "Free Back"),
  P("4", "TE", 150, "Free End"),
  P("5", "K", 140, "A Kicker"),
  P("6", "DST", 130, "A Defense"),
  P("7", "WR", 90, "Weak Receiver"),
  P("8", "QB", null, "No Projection"),
];

// Stand-in for JukeEngine.replacementGap: points over a per-position
// replacement, and null for the two positions the app refuses to rank.
const REPLACEMENT = { QB: 250, RB: 120, WR: 110, TE: 80, K: 0, DST: 0 };
const gapOf = (p) => {
  if (p.projPts === null || p.projPts === undefined) return null;
  if (p.pos === "K" || p.pos === "DST") return null;
  return p.projPts - REPLACEMENT[p.pos];
};

const SNAPSHOT = {
  teams: [
    { rosterId: 1, ownerId: "me", teamName: "Mine", players: ["1"], starters: ["1"] },
    { rosterId: 2, ownerId: "them", teamName: "Theirs", players: ["9"], starters: [] },
  ],
};

check("every rostered id is held, benched or not", () => {
  const held = rosteredIds(SNAPSHOT);
  assert.equal(held.has("1"), true);
  assert.equal(held.has("9"), true, "another team's bench is still owned");
  assert.equal(held.has("2"), false);
});

check("a snapshot with no teams holds nobody rather than throwing", () => {
  assert.equal(rosteredIds({}).size, 0);
  assert.equal(rosteredIds(null).size, 0);
});

check("my team is found by the ownerId stored at connect time", () => {
  assert.equal(myTeam(SNAPSHOT, { ownerId: "me" }).teamName, "Mine");
});

check("and is null rather than a guess when it cannot be found", () => {
  assert.equal(myTeam(SNAPSHOT, { ownerId: "nobody" }), null);
  assert.equal(
    myTeam(SNAPSHOT, {}), null,
    "a league connected before ownerId was recorded must not price claims against a stranger's bench"
  );
});

check("free agents exclude everybody somebody owns", () => {
  const rows = freeAgents(BOARD, SNAPSHOT, gapOf);
  const ids = rows.map((r) => r.player.id);
  assert.equal(ids.includes("1"), false, "my own player is not a free agent");
  assert.equal(ids.includes("9"), false, "and neither is a rival's");
});

check("they come back best first, by points over replacement", () => {
  const rows = freeAgents(BOARD, SNAPSHOT, gapOf);
  const gaps = rows.map((r) => r.gap);
  assert.deepEqual(
    gaps, gaps.slice().sort((a, b) => b - a),
    "a targets board that is not sorted is a list"
  );
  assert.equal(rows[0].player.name, "Free Receiver", "WR 240 over a 110 replacement is the best add");
});

check("a kicker and a defense are dropped, not ranked last", () => {
  const rows = freeAgents(BOARD, SNAPSHOT, gapOf);
  const positions = rows.map((r) => r.player.pos);
  assert.equal(positions.includes("K"), false);
  assert.equal(
    positions.includes("DST"), false,
    "an unranked player at the bottom of a ranked list still reads as 'worse than the one above'"
  );
});

check("a player with no projection is dropped too", () => {
  const rows = freeAgents(BOARD, SNAPSHOT, gapOf);
  assert.equal(rows.map((r) => r.player.id).includes("8"), false);
});

check("an empty board is empty, not an exception", () => {
  assert.deepEqual(freeAgents([], SNAPSHOT, gapOf), []);
  assert.deepEqual(freeAgents(null, SNAPSHOT, gapOf), []);
  assert.deepEqual(freeAgents(BOARD, null, gapOf), []);
});

check("the limit is applied after the sort, never before", () => {
  const rows = freeAgents(BOARD, SNAPSHOT, gapOf, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].player.name, "Free Receiver", "the best one, not the first one on the board");
});

/* ---- roster gaps ---- */

const byId = new Map(BOARD.map((p) => [p.id, p]));

check("a gap is where the best free agent beats the best player held", () => {
  const gaps = rosterGaps(SNAPSHOT.teams[0], byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf);
  const wr = gaps.find((g) => g.pos === "WR");
  assert.ok(wr, "holding no receiver at all is a gap");
  assert.equal(wr.held, null, "and `held` says so rather than subtracting against zero");
  assert.equal(wr.improvement, 130);
});

check("a position already held better than anything available is not a gap", () => {
  const gaps = rosterGaps(SNAPSHOT.teams[0], byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf);
  assert.equal(
    gaps.some((g) => g.pos === "RB"), false,
    "RB held at +140 against a best free +80 is not an upgrade, however many backs the roster has"
  );
});

check("gaps come back widest first", () => {
  const gaps = rosterGaps(SNAPSHOT.teams[0], byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf);
  const by = gaps.map((g) => g.improvement);
  assert.deepEqual(by, by.slice().sort((a, b) => b - a));
});

check("a roster holding players the board has never heard of does not throw", () => {
  const team = { players: ["1", "ghost"], starters: [] };
  const gaps = rosterGaps(team, byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf);
  assert.ok(Array.isArray(gaps));
});

/* ---- the drop list ---- */

/* A roster with a starter, a bench player, a kicker and a defense — which
   is every real roster, and the shape the exclusions below are about. */
const DROP_TEAM = {
  rosterId: 1,
  ownerId: "me",
  players: ["1", "3", "5", "6", "7"],
  starters: ["1"],
};

check("a drop list is worst first", () => {
  const rows = dropList(DROP_TEAM, byId, gapOf);
  const gaps = rows.map((r) => r.gap);
  assert.deepEqual(gaps, gaps.slice().sort((a, b) => a - b));
  assert.equal(rows[0].player.name, "Weak Receiver", "WR 90 against a 110 replacement is the cut");
});

check("a kicker and a defense are never on it", () => {
  const rows = dropList(DROP_TEAM, byId, gapOf).map((r) => r.player.pos);
  assert.equal(
    rows.includes("K"), false,
    "an ascending sort puts the positions Juke refuses to rank at the TOP of a list headed 'cut these'"
  );
  assert.equal(rows.includes("DST"), false);
});

check("a starter is not a drop candidate", () => {
  const rows = dropList(DROP_TEAM, byId, gapOf).map((r) => r.player.id);
  assert.equal(
    rows.includes("1"), false,
    "whatever the projection says, benching a starter is another room's question"
  );
});

check("an empty or unknown roster does not throw", () => {
  assert.deepEqual(dropList(null, byId, gapOf), []);
  assert.deepEqual(dropList({ players: ["ghost"], starters: [] }, byId, gapOf), []);
});

/* ---- league intel ---- */

const INTEL_SNAPSHOT = {
  teams: [
    { rosterId: 1, ownerId: "me", teamName: "Mine", players: ["1"], starters: [] },
    { rosterId: 2, ownerId: "a", teamName: "Rival A", players: ["1"], starters: [] },
    { rosterId: 3, ownerId: "b", teamName: "Rival B", players: ["3"], starters: [] },
  ],
};

check("league intel never includes your own team", () => {
  const mine = INTEL_SNAPSHOT.teams[0];
  const rows = rivalNeeds(
    INTEL_SNAPSHOT, mine, byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf
  );
  assert.equal(
    rows.some((r) => r.team.rosterId === 1), false,
    "excluded by id, because a league where your roster is not first is the normal case"
  );
  assert.equal(rows.length, 2);
});

check("rivals come back widest need first", () => {
  const rows = rivalNeeds(
    INTEL_SNAPSHOT, INTEL_SNAPSHOT.teams[0], byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf
  );
  const widest = rows.map((r) => r.gaps[0].improvement);
  assert.deepEqual(widest, widest.slice().sort((a, b) => b - a));
});

check("demand counts every gap a rival has, not only their widest", () => {
  const rows = rivalNeeds(
    INTEL_SNAPSHOT, INTEL_SNAPSHOT.teams[0], byId, freeAgents(BOARD, SNAPSHOT, gapOf), gapOf, 5
  );
  const demand = demandByPosition(rows);
  const total = demand.reduce((n, d) => n + d.count, 0);
  const gapsSeen = rows.reduce((n, r) => n + r.gaps.length, 0);
  assert.equal(
    total, gapsSeen,
    "a manager with a second-priority hole at TE still bids on one"
  );
  assert.deepEqual(
    demand.map((d) => d.count), demand.map((d) => d.count).slice().sort((a, b) => b - a),
    "most-wanted position first, which is the number a bid turns on"
  );
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the waiver board");
process.exit(failures ? 1 : 0);
