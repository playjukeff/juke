/* The Trade Room's arithmetic, driven outside a browser.
 *
 * The highest-stakes of the three room modules: a trade is irreversible
 * once accepted, so the arithmetic that says "this is a win" must be
 * checkable without a browser nobody can log into. tradeBoard.js imports
 * nothing, and this runs in CI with no npm install.
 *
 * Run: node scripts/test_trade_board.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { valueOf, rosterValues, rosterTotal, tradeSwing, valueBoard } = await import(
  pathToFileURL(path.resolve("web/src/components/rooms/tradeBoard.js")).href
);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

const P = (id, pos, projPts) => ({ id, pos, projPts, name: "P" + id });

const BOARD = [
  P("a", "RB", 300),
  P("b", "WR", 240),
  P("c", "RB", 180),
  P("d", "WR", 130),
  P("k", "K", 140),      // the app declines to rank these two
  P("z", "DST", 130),
  P("n", "TE", null),    // no projection at all
  P("w", "WR", 40),      // BELOW replacement: a real, negative value
];
const byId = new Map(BOARD.map((p) => [p.id, p]));

const REPLACEMENT = { QB: 250, RB: 120, WR: 110, TE: 80 };
const gapOf = (p) => {
  if (p.projPts === null || p.projPts === undefined) return null;
  if (p.pos === "K" || p.pos === "DST") return null;
  return p.projPts - REPLACEMENT[p.pos];
};

const MINE = { rosterId: 1, teamName: "Mine", players: ["a", "d", "k", "n", "w"] };
const THEIRS = { rosterId: 2, teamName: "Theirs", players: ["b", "c", "z"] };
const SNAPSHOT = { teams: [MINE, THEIRS] };

check("a player is worth his points over replacement", () => {
  assert.equal(valueOf(byId.get("a"), gapOf), 180);
  assert.equal(valueOf(byId.get("d"), gapOf), 20);
});

check("a kicker and a defense are not priced, here as everywhere else", () => {
  assert.equal(valueOf(byId.get("k"), gapOf), null);
  assert.equal(
    valueOf(byId.get("z"), gapOf), null,
    "withholding has to be complete: the app refuses to rank these two, so it will not price them in a trade either"
  );
});

check("a roster KEEPS its unpriceable players, unlike a targets board", () => {
  const rows = rosterValues(MINE, byId, gapOf);
  const ids = rows.map((r) => r.player.id);
  assert.equal(
    ids.includes("k"), true,
    "leaving him off would tell a reader they do not own a player they do own"
  );
  assert.equal(ids.includes("n"), true);
});

check("and sorts them below every priced player, including the bad ones", () => {
  const rows = rosterValues(MINE, byId, gapOf);
  assert.equal(rows[0].player.id, "a", "best first");

  /* This assertion was weak at first and passed against the naive sort.
     `b.value - a.value` coerces null to 0, so an unpriceable player lands
     last anyway WHEN EVERY REAL VALUE IS POSITIVE — which the fixture's
     did. The bug only shows against a player BELOW replacement: a -70
     receiver would sort under the two nobody can price, so the roster
     would rank a kicker Juke refuses to rate above a real player it rates
     badly. */
  const priced = rows.filter((r) => r.value !== null);
  const unpriced = rows.filter((r) => r.value === null);
  assert.equal(unpriced.length, 2);
  assert.ok(
    priced.some((r) => r.value < 0),
    "the fixture must contain a below-replacement player or this proves nothing"
  );
  const lastPriced = rows.findIndex((r) => r.player.id === "w");
  const firstUnpriced = rows.findIndex((r) => r.value === null);
  assert.ok(
    lastPriced < firstUnpriced,
    "a player Juke rates badly still outranks one it will not rate at all"
  );
});

check("a roster total counts what it could price, and says how many", () => {
  const t = rosterTotal(MINE, byId, gapOf);
  assert.equal(t.total, 130, "180 + 20 + (-70)");
  assert.equal(t.priced, 3);
  assert.equal(
    t.held, 5,
    "silently summing 2 of 4 and calling it the roster's value makes two rosters with different kicker counts incomparable"
  );
});

check("a swing is what you get minus what you give, and it is symmetric", () => {
  const s = tradeSwing([byId.get("a")], [byId.get("b")], gapOf);
  assert.equal(s.give, 180);
  assert.equal(s.get, 130);
  assert.equal(s.you, -50);
  assert.equal(s.them, 50, "a trade cannot be good for both sides on one number");
  assert.equal(s.priced, true);
});

check("an even trade is zero on both sides", () => {
  const s = tradeSwing([byId.get("d")], [byId.get("d")], gapOf);
  assert.equal(s.you, 0);
  assert.equal(s.them, 0);
});

check("an unpriceable player makes the WHOLE trade unpriceable", () => {
  /* Not "worth zero". A kicker is a real asset the app has declined to
     rank, so counting him at 0 reports a swing confidently wrong in a
     known direction — the side receiving him undervalued by exactly as
     much as the app refuses to say. */
  const s = tradeSwing([byId.get("a")], [byId.get("b"), byId.get("k")], gapOf);
  assert.equal(s.priced, false, "the room must say it cannot call this one");
});

check("an empty side is priceable and worth nothing", () => {
  const s = tradeSwing([], [byId.get("d")], gapOf);
  assert.equal(s.priced, true, "a free giveaway is a real trade, not an unpriceable one");
  assert.equal(s.you, 20);
});

check("the value board is every ROSTERED player, best first", () => {
  const rows = valueBoard(SNAPSHOT, byId, gapOf);
  const ids = rows.map((r) => r.player.id);
  assert.deepEqual(
    ids, ["a", "b", "c", "d", "w"],
    "best first, the below-replacement player last, and the unpriceable ones absent"
  );
  const values = rows.map((r) => r.value);
  assert.deepEqual(values, values.slice().sort((x, y) => y - x));
});

check("and it carries who owns each one", () => {
  const rows = valueBoard(SNAPSHOT, byId, gapOf);
  assert.equal(rows.find((r) => r.player.id === "a").team.teamName, "Mine");
  assert.equal(rows.find((r) => r.player.id === "b").team.teamName, "Theirs");
});

check("a free agent is not on the value board", () => {
  /* An unowned player cannot be traded FOR — he is a waiver claim, which
     is another room and one that already exists. */
  const lonely = { teams: [{ rosterId: 1, teamName: "Mine", players: ["a"] }] };
  const ids = valueBoard(lonely, byId, gapOf).map((r) => r.player.id);
  assert.deepEqual(ids, ["a"]);
});

check("nothing here throws on an empty or unknown league", () => {
  assert.deepEqual(valueBoard(null, byId, gapOf), []);
  assert.deepEqual(rosterValues(null, byId, gapOf), []);
  assert.deepEqual(rosterValues({ players: ["ghost"] }, byId, gapOf), []);
  assert.equal(rosterTotal({ players: [] }, byId, gapOf).held, 0);
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the trade board");
process.exit(failures ? 1 : 0);
