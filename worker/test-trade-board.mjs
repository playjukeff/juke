/* The Trade Room's two lists, and the difference between them.
 *
 *   node worker/test-trade-board.mjs
 *
 * tradeBoard.js is a plain module with no React in it, so a node suite can
 * drive it — the same arrangement countdown.js and standings.js have.
 *
 * What this pins is a distinction that is easy to collapse: a ROSTER is
 * read in the order the league fields it, and a BOARD of everything
 * tradeable is read best first. The same file answers both, and it sorted
 * the roster like the board until somebody looked at a real team.
 */

import { rosterValues, rosterTotal, valueBoard, valueOf } from "../web/src/components/rooms/tradeBoard.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

/* A real team's shape after espn.js's slot sort: starters as the league
   fields them, then the bench. Deliberately NOT in value order. */
const TEAM = {
  teamName: "Season Over Already",
  players: ["qb", "rb1", "rb2", "wr1", "wr2", "te", "flex", "dst", "k", "bn1", "bn2"],
};
const P = {
  qb:   { id: "qb",   name: "Josh Allen",       pos: "QB" },
  rb1:  { id: "rb1",  name: "Cam Skattebo",     pos: "RB" },
  rb2:  { id: "rb2",  name: "David Montgomery", pos: "RB" },
  wr1:  { id: "wr1",  name: "Puka Nacua",       pos: "WR" },
  wr2:  { id: "wr2",  name: "Drake London",     pos: "WR" },
  te:   { id: "te",   name: "Dallas Goedert",   pos: "TE" },
  flex: { id: "flex", name: "Ladd McConkey",    pos: "WR" },
  dst:  { id: "dst",  name: "Rams D/ST",        pos: "DST" },
  k:    { id: "k",    name: "Cam Little",       pos: "K" },
  bn1:  { id: "bn1",  name: "Rico Dowdle",      pos: "RB" },
  bn2:  { id: "bn2",  name: "Matthew Golden",   pos: "WR" },
};
const byId = new Map(Object.entries(P));
// Values chosen so value order and lineup order disagree on every row.
const VALUES = { qb: 68, rb1: 26, rb2: 36, wr1: 85, wr2: 31, te: -21, flex: 14, dst: null, k: null, bn1: -12, bn2: -33 };
const gapOf = (p) => (VALUES[p.id] === null ? null : VALUES[p.id]);

console.log("--- a roster is read in lineup order ---");
{
  const rows = rosterValues(TEAM, byId, gapOf);
  check("every player is there", rows.length, 11);
  check("in the order the league fields them",
        rows.map((r) => r.player.pos),
        ["QB", "RB", "RB", "WR", "WR", "TE", "WR", "DST", "K", "RB", "WR"]);
  /* The bug: it sorted best-first, so a real team read +85, +68, +36 and a
     reader looking for their quarterback found him second. */
  check("not best first", rows[0].player.pos !== "WR" || rows[0].value !== 85, true);
  check("the first row is the quarterback", rows[0].player.name, "Josh Allen");
}

/* An unpriceable player stays IN a roster — leaving him out tells a reader
   they do not own somebody they do own. He now falls where he sits rather
   than at the bottom, which is the same argument one step further. */
console.log("");
console.log("--- an unpriceable player keeps his place ---");
{
  const rows = rosterValues(TEAM, byId, gapOf);
  const dst = rows.findIndex((r) => r.player.pos === "DST");
  check("the defence is still on the roster", dst >= 0, true);
  check("with no value", rows[dst].value, null);
  check("and in his lineup slot, not swept to the end", dst, 7);
}

/* Unpriceable players contribute nothing and are counted, so a caller can
   say "of 11 players, 9 are priced". */
console.log("");
console.log("--- the total ---");
{
  const t = rosterTotal(TEAM, byId, gapOf);
  check("sums only what it can price", t.total, 68 + 26 + 36 + 85 + 31 - 21 + 14 - 12 - 33);
  // `priced` and `held`, not "unpriced" — so a caller says "9 of 11 priced"
  // rather than doing the subtraction itself.
  check("counts what it could price", t.priced, 9);
  check("against everything held", t.held, 11);
}

/* The invariant this change could have broken. The Value Board is not a
   roster: it is everything tradeable in the league, where best-first IS the
   point, and it must not follow the roster's order. */
console.log("");
console.log("--- the Value Board is still best first ---");
{
  const snapshot = { teams: [TEAM] };
  const rows = valueBoard(snapshot, byId, gapOf);
  check("descending by value", rows.map((r) => r.value), [85, 68, 36, 31, 26, 14, -12, -21, -33]);
  check("and an unpriceable player is absent, unlike on a roster",
        rows.some((r) => r.player.pos === "DST"), false);
  check("each row knows who owns him", rows[0].team.teamName, "Season Over Already");
}

console.log("");
console.log("--- the edges ---");
check("no team is an empty list", rosterValues(null, byId, gapOf), []);
check("no board is too", valueBoard(null, byId, gapOf), []);
check("a player the board does not carry is skipped, not null",
      rosterValues({ players: ["ghost", "qb"] }, byId, gapOf).map((r) => r.player.id), ["qb"]);
check("valueOf needs both halves", valueOf(P.qb, null), null);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — the trade board, offline");
process.exit(failures ? 1 : 0);
