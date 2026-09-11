/* v3's matchup page pairs two lineups slot by slot (alignLineups in
 * web/src/components/v3/league/matchupData.js). Pairing by row number put a
 * defense across from a kicker whenever one side had an empty slot, because
 * an empty slot is dropped before the rows are built.
 *
 * Run: node scripts/test_matchup_slots.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { alignLineups, slotTemplate } = await import(pathToFileURL(path.resolve("web/src/components/v3/league/matchupData.js")).href);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};
const row = (id, pos) => ({ id, player: { id, pos }, pts: 1 });
const lineup = { starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 }, flex: 1, superflex: 0 };
const full = [row("q", "QB"), row("r1", "RB"), row("r2", "RB"), row("w1", "WR"), row("w2", "WR"), row("t", "TE"), row("f", "RB"), row("d", "DST"), row("k", "K")];
const noKicker = full.filter((r) => r.id !== "k");
const posPair = (rows) => rows.map(([a, b]) => (a ? a.player.pos : "-") + "/" + (b ? b.player.pos : "-"));

check("the template follows the league's slots, flex before D/ST and K", () => {
  assert.deepEqual(slotTemplate(lineup, []), ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DST", "K"]);
});

check("an empty kicker slot leaves the defenses paired and the kicker row blank", () => {
  const rows = alignLineups(noKicker, full, lineup);
  assert.deepEqual(posPair(rows), ["QB/QB", "RB/RB", "RB/RB", "WR/WR", "WR/WR", "TE/TE", "RB/RB", "DST/DST", "-/K"]);
});

check("a third back is the flex, not a receiver's row", () => {
  const shuffled = [row("f", "RB"), ...full.filter((r) => r.id !== "f")];
  const rows = alignLineups(shuffled, full, lineup);
  assert.deepEqual(posPair(rows).slice(1, 3), ["RB/RB", "RB/RB"]);
  assert.equal(rows[6][0].id, "r2", "the last RB in order takes the flex");
});

check("with no lineup, a flex back pairs with the other side's flex receiver", () => {
  const flexWr = [row("q", "QB"), row("r1", "RB"), row("r2", "RB"), row("w1", "WR"), row("w2", "WR"), row("t", "TE"), row("w3", "WR"), row("d", "DST"), row("k", "K")];
  const rows = alignLineups(full, flexWr, null);
  assert.deepEqual(posPair(rows), ["QB/QB", "RB/RB", "RB/RB", "WR/WR", "WR/WR", "TE/TE", "RB/WR", "DST/DST", "K/K"]);
});

check("with no lineup on the snapshot, positions still pair", () => {
  const rows = alignLineups(noKicker, full, null);
  assert.equal(posPair(rows).at(-2), "DST/DST");
  assert.equal(posPair(rows).at(-1), "-/K");
});

check("a player not on the board takes the first open slot rather than vanishing", () => {
  const unknown = [...noKicker, { id: "x", player: null, pts: null }];
  const rows = alignLineups(unknown, full, lineup);
  assert.equal(rows.length, 9);
  assert.equal(rows[8][0].id, "x");
});

check("one side alone keeps its own slots", () => {
  const rows = alignLineups(noKicker, null, lineup);
  assert.ok(rows.every(([, b]) => b === null));
  assert.equal(rows.length, 8, "the empty kicker slot is not a row when nobody fills it");
});

console.log();
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
console.log("OK");
