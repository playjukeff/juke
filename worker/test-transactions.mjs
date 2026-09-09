/* The league's adds, drops and trades, offline.
 *
 *   node worker/test-transactions.mjs
 *
 * ---- These fixtures are SYNTHETIC, and that is a real difference ----
 *
 * The stat ids and the lineup slots were derived from a real league's own
 * data, and this file cannot do that: the league those came from has run no
 * waivers, no free agent adds and no trades — every transaction on it is a
 * DRAFT. So ESPN's type strings for the rest are unobserved.
 *
 * Which is exactly why nothing here classifies by type string. Every item
 * carries fromTeamId and toTeamId, and THAT grammar is observed — a real
 * DRAFT item reads `fromTeamId: 0, toTeamId: 5`, an acquisition out of
 * nowhere. The cases below drive that grammar, which is the part real data
 * supports, and the raw type rides through untouched for a screen to print.
 *
 * Re-check against a real add the first week one happens.
 */

import { feedFromEspn, playersInFeed, FEED_LIMIT } from "./transactions.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log("ok  " + what);
  else { failures++; console.log("x   " + what + "\n      expected " + b + "\n      received " + a); }
}

const NAMES = {
  11: { name: "Added Player", pos: "RB", team: "DET", id: "1001" },
  22: { name: "Dropped Player", pos: "WR", team: "KC", id: "1002" },
  33: { name: "Traded Player", pos: "TE", team: "SF", id: "1003" },
};
const nameFor = (id) => NAMES[id] || null;

const tx = (type, items, extra = {}) => ({
  type, status: "EXECUTED", teamId: extra.teamId || 1,
  bidAmount: extra.bid === undefined ? 0 : extra.bid,
  scoringPeriodId: extra.week || 2,
  proposedDate: extra.at || 1000,
  items,
});
const item = (playerId, from, to, slots = {}) => ({
  playerId, fromTeamId: from, toTeamId: to,
  fromLineupSlotId: slots.from === undefined ? -1 : slots.from,
  toLineupSlotId: slots.to === undefined ? 20 : slots.to,
});

console.log("--- the grammar, which is what real data supports ---");
{
  const f = feedFromEspn([
    tx("WAIVER", [item(11, 0, 4)], { bid: 17 }),
    tx("ROSTER", [item(22, 4, 0)]),
    tx("TRADE_ACCEPT", [item(33, 2, 7)]),
  ], nameFor);

  check("three moves", f.moves.length, 3);
  check("out of nowhere is an ADD", f.moves.find((m) => m.playerId === 11).kind, "ADD");
  check("to nowhere is a DROP", f.moves.find((m) => m.playerId === 22).kind, "DROP");
  check("team to team is a TRADE", f.moves.find((m) => m.playerId === 33).kind, "TRADE");
}

/* `teamId` is the team a screen cares about for that move, so it never has
   to decide which end of from/to to read. */
console.log("");
console.log("--- teamId is the team the move is about ---");
{
  const f = feedFromEspn([
    tx("WAIVER", [item(11, 0, 4)]),
    tx("ROSTER", [item(22, 6, 0)]),
  ], nameFor);
  check("an ADD names the team that gained him",
        f.moves.find((m) => m.kind === "ADD").teamId, "4");
  check("a DROP names the team that let him go",
        f.moves.find((m) => m.kind === "DROP").teamId, "6");
}

/* Starting somebody is a move between two slots on ONE team. Both ids are
   the same team, so the from/to grammar alone reads it as a trade — which
   is why the slots are checked too. It is not a transaction anybody else
   needs to see. */
console.log("");
console.log("--- a lineup change is not a transaction ---");
check("same team both ends is dropped",
      feedFromEspn([tx("ROSTER", [item(11, 3, 3, { from: 20, to: 2 })])], nameFor), null);

/* DRAFT is already captured whole by draftBoard(), for free, off a request
   being made anyway — and 140 of them would crowd out the moves this exists
   for AND cost a megabyte to name at ~7 KB each. */
console.log("");
console.log("--- the draft is excluded, in both directions ---");
check("no draft picks in the feed",
      feedFromEspn([tx("DRAFT", [item(11, 0, 5)])], nameFor), null);
check("and none of its ids are looked up",
      playersInFeed([tx("DRAFT", [item(11, 0, 5)]), tx("WAIVER", [item(22, 0, 1)])]), [22]);

console.log("");
console.log("--- FAAB ---");
{
  const f = feedFromEspn([tx("WAIVER", [item(11, 0, 4)], { bid: 23 })], nameFor);
  check("a bid comes through", f.moves[0].bid, 23);
  /* 0 is a real bid in a league that bids, and also what a free agent add
     carries — told apart by `kind`, never by the number. */
  check("and a free add is 0 rather than absent",
        feedFromEspn([tx("FREEAGENT", [item(11, 0, 4)])], nameFor).moves[0].bid, 0);
}

console.log("");
console.log("--- naming ---");
{
  const f = feedFromEspn([tx("WAIVER", [item(11, 0, 4)]), tx("WAIVER", [item(99, 0, 4)])], nameFor);
  check("a player it can name carries his name", f.moves[0].name, "Added Player");
  check("and Juke's own id", f.moves[0].id, "1001");
  // A move nobody can name is still a move: dropping the row would leave a
  // week silently short.
  check("one it cannot is kept", f.moves.length, 2);
  check("with a null name", f.moves[1].name, null);
  check("and counted", f.unnamed, 1);
}

console.log("");
console.log("--- the window is what bounds the cost ---");
{
  const many = [];
  for (let i = 0; i < FEED_LIMIT + 10; i++) many.push(tx("WAIVER", [item(11, 0, 1)], { at: i }));
  const f = feedFromEspn(many, nameFor);
  check("it stops at the limit", f.window, FEED_LIMIT);
  check("and only that many ids are ever resolved", playersInFeed(many).length, 1);
}
{
  const f = feedFromEspn([
    tx("WAIVER", [item(11, 0, 1)], { at: 100 }),
    tx("WAIVER", [item(22, 0, 1)], { at: 900 }),
  ], nameFor, 1);
  check("newest first", f.moves[0].playerId, 22);
}

console.log("");
console.log("--- nothing to report is null, never an empty feed ---");
check("no transactions", feedFromEspn([], nameFor), null);
check("not an array", feedFromEspn(null, nameFor), null);
check("and no ids to look up either", playersInFeed(null), []);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — league transactions, offline");
process.exit(failures ? 1 : 0);
