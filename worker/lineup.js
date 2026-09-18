/* A connected league's starting lineup, in Juke's vocabulary.
 *
 * The sibling of scoring.js and it exists for the same reason: grading a
 * real league against the DRAFT ROOM's lineup is the bug #210 fixed in a
 * different field. A league that starts two quarterbacks and one this app
 * happens to be set to would produce a grade whose starter strength — half
 * the composite — is read off a lineup nobody fields.
 *
 * ---- ESPN's slot ids were derived, not looked up ----
 *
 * Same discipline as the stat ids: a wrong slot id does not throw, it
 * grades a lineup the league does not play. Each one below was confirmed
 * 9 September 2026 by asking what actually SITS in it across all ten
 * rosters of a real league after its draft:
 *
 *     slot  count  positions seen there
 *        0      1  QB
 *        2      2  RB
 *        4      2  WR
 *        6      1  TE
 *       16      1  DST
 *       17      1  K
 *       20      5  QB,RB,TE,WR      <- bench
 *       21      1  (empty)          <- IR
 *       23      1  RB,WR            <- flex
 *
 * ---- Two are carried on their published meaning, and say so ----
 *
 * 7 (OP, the superflex seat) and 3/5 (the narrower RB/WR and WR/TE flexes)
 * are not in that league, so nothing here has seen one. They are mapped on
 * ESPN's documented ids rather than left out, because dropping a superflex
 * seat silently grades a superflex league as a single-quarterback one --
 * exactly the drift CLAUDE.md records under "nothing about the league shape
 * may be written down twice". Anything else non-zero is reported.
 *
 * ---- IR is not a roster spot Juke drafts into ----
 *
 * Juke's `rounds` is starters + flex + superflex + bench, and the real
 * draft ran 14 rounds against 9 starters and 5 bench. Counting IR would
 * make it 15 and the last round would be a pick nobody made. */

import { flat, members } from "./yahoo-json.js";

const QB = 0, RB = 2, WR = 4, TE = 6, OP = 7, DST = 16, K = 17;
const BENCH = 20, IR = 21, FLEX = 23;
const RB_WR = 3, WR_TE = 5;

/* The flex-shaped slots, all folded into Juke's one `flex`.
 *
 * Juke has a single FLEX that takes RB/WR/TE, so a league running ESPN's
 * narrower 3 (RB/WR) or 5 (WR/TE) is modelled slightly loosely -- it would
 * let a tight end into a seat the league reserves for backs and receivers.
 * That is a smaller error than not counting the seat at all, which would
 * leave a starter out of the lineup entirely, and it is reported so nobody
 * has to guess which happened. */
const FLEXES = [FLEX, RB_WR, WR_TE];

const STARTERS = { [QB]: "QB", [RB]: "RB", [WR]: "WR", [TE]: "TE", [DST]: "DST", [K]: "K" };

export function lineupFromEspn(rosterSettings) {
  const counts = (rosterSettings || {}).lineupSlotCounts;
  if (!counts || typeof counts !== "object") return null;

  const starters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  let flex = 0, superflex = 0, bench = 0;
  const looseFlex = [];
  const unmapped = [];

  for (const [rawId, rawN] of Object.entries(counts)) {
    const id = Number(rawId);
    const n = Number(rawN) || 0;
    if (n <= 0) continue;

    if (STARTERS[id] !== undefined) { starters[STARTERS[id]] += n; continue; }
    if (id === OP) { superflex += n; continue; }
    if (FLEXES.indexOf(id) >= 0) {
      flex += n;
      if (id !== FLEX) looseFlex.push(id);
      continue;
    }
    if (id === BENCH) { bench += n; continue; }
    // IR is a real slot and deliberately not a round. See above.
    if (id === IR) continue;
    unmapped.push(id);
  }

  const starting = Object.values(starters).reduce((a, b) => a + b, 0) + flex + superflex;
  if (!starting) return null;

  return {
    starters,
    flex,
    superflex,
    bench,
    /* What Juke calls `rounds`, derived the same way rosterSize() does
       rather than restated -- a round count that disagrees with the roster
       is what setupProblem() refuses. */
    rounds: starting + bench,
    looseFlex: looseFlex.sort((a, b) => a - b),
    unmapped: unmapped.sort((a, b) => a - b),
  };
}

/* Sleeper states its lineup as a list of seats rather than counts.
 *
 * `roster_positions` is ["QB","RB","RB","WR",...,"BN","BN"], already in
 * words -- so this is a tally, not a translation, which is the same reason
 * scoring.js needs no id table for Sleeper. */
const SLEEPER_FLEX = ["FLEX", "REC_FLEX", "WRRB_FLEX", "WRRB_WRT"];

export function lineupFromSleeper(rosterPositions) {
  if (!Array.isArray(rosterPositions) || !rosterPositions.length) return null;

  const starters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  let flex = 0, superflex = 0, bench = 0;
  const unmapped = [];

  for (const raw of rosterPositions) {
    const seat = String(raw || "").toUpperCase();
    // Sleeper says DEF where the pipeline says DST, and that is the only
    // word in this list that differs from Juke's own.
    if (seat === "DEF") { starters.DST += 1; continue; }
    if (starters[seat] !== undefined) { starters[seat] += 1; continue; }
    if (seat === "SUPER_FLEX") { superflex += 1; continue; }
    if (SLEEPER_FLEX.indexOf(seat) >= 0) { flex += 1; continue; }
    if (seat === "BN") { bench += 1; continue; }
    // IR and taxi are real seats and not rounds, the same as ESPN's IR.
    if (seat === "IR" || seat === "TAXI") continue;
    unmapped.push(seat);
  }

  const starting = Object.values(starters).reduce((a, b) => a + b, 0) + flex + superflex;
  if (!starting) return null;

  return { starters, flex, superflex, bench, rounds: starting + bench, looseFlex: [], unmapped };
}


/* Where a slot sits in a lineup, so a roster comes back in the order a
   manager reads it in.
 *
 * ESPN returns roster entries in no useful order at all -- measured on a
 * real team: WR, WR, QB, FLEX, RB, RB, bench, bench, bench, TE, ... -- and
 * espn.js was pushing `starters` in exactly that order. strategyBoard.js
 * documents the opposite contract in its own comment ("`starters` is
 * Sleeper's own array and its ORDER is the league's roster"), which Sleeper
 * honours and ESPN was quietly breaking, so "Your lineup, as set" listed a
 * lineup nobody sets.
 *
 * The order is app.js's SLOT_ORDER -- QB, RB, WR, TE, FLEX, SFLEX, DST, K --
 * because that is the order lineupSlots() already fields a lineup in, and a
 * second opinion about it here would be the league shape written down twice.
 * Bench and IR sort after everything, keeping their own relative order.
 *
 * Exported from here rather than espn.js because this file is already the
 * one place that knows what an ESPN slot id means. */
const SLOT_RANK = {
  [QB]: 0, [RB]: 1, [WR]: 2, [TE]: 3,
  [FLEX]: 4, [RB_WR]: 4, [WR_TE]: 4,
  [OP]: 5,
  [DST]: 6, [K]: 7,
  [BENCH]: 90, [IR]: 91,
};

export function slotRank(lineupSlotId) {
  const r = SLOT_RANK[Number(lineupSlotId)];
  // A slot nobody has named sorts with the bench rather than jumping the
  // lineup: an unknown seat is far likelier to be a bench variant than a
  // starter, and guessing it into the lineup would reorder a real one.
  return r === undefined ? 92 : r;
}


/* ----------------------------------------------------------
   Yahoo
   ---------------------------------------------------------- */

/* Yahoo states its lineup as positions with counts, in words, the way
 * Sleeper does -- `roster_positions` is a list of
 * `{ roster_position: { position: "W/R/T", count: 1, is_starting_position: 1 } }`
 * -- so this is a tally again rather than an id table.
 *
 * Its flex seats are spelled as the eligible positions joined by slashes,
 * the same idea as CBS's hyphens: W/R/T is Juke's FLEX, and a seat that
 * lists Q is a superflex. The narrower W/R, W/T and R/T fold into `flex`
 * and are reported in `looseFlex`, for lineupFromEspn()'s reason: a seat
 * modelled slightly loosely is a smaller error than a starter not counted.
 *
 * NOT MEASURED against a real league yet -- see yahoo.js. The positions
 * below are Yahoo's documented spellings; anything else is reported in
 * `unmapped` rather than guessed into a seat. */
const YAHOO_STARTERS = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "K", DEF: "DST" };

export function lineupFromYahoo(rosterPositions) {
  const seats = members(rosterPositions, "roster_position").map(flat);
  if (!seats.length) return null;

  const starters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  let flex = 0, superflex = 0, bench = 0;
  const looseFlex = [];
  const unmapped = [];

  for (const s of seats) {
    const seat = String(s.position || "").toUpperCase();
    const n = Number(s.count) || 0;
    if (!seat || n <= 0) continue;

    if (YAHOO_STARTERS[seat]) { starters[YAHOO_STARTERS[seat]] += n; continue; }
    if (seat.includes("/")) {
      if (seat.split("/").includes("Q")) { superflex += n; continue; }
      flex += n;
      if (seat !== "W/R/T") looseFlex.push(seat);
      continue;
    }
    if (seat === "BN") { bench += n; continue; }
    // IR and its variants are real seats and not rounds -- see above.
    if (seat === "IR" || seat === "IR+" || seat === "NA") continue;
    unmapped.push(seat);
  }

  const starting = Object.values(starters).reduce((a, b) => a + b, 0) + flex + superflex;
  if (!starting) return null;

  return {
    starters, flex, superflex, bench,
    rounds: starting + bench,
    looseFlex: looseFlex.sort(),
    unmapped: unmapped.sort(),
  };
}

/* Where a Yahoo seat sits in a lineup -- app.js's SLOT_ORDER again, with
   every flex spelling where FLEX goes and a Q-flex where SFLEX goes. A seat
   nobody has named sorts after the lineup, for slotRank()'s reason. */
export function yahooSeatRank(seat) {
  const s = String(seat || "").toUpperCase();
  if (s === "QB") return 0;
  if (s === "RB") return 1;
  if (s === "WR") return 2;
  if (s === "TE") return 3;
  if (s.includes("/")) return s.split("/").includes("Q") ? 5 : 4;
  if (s === "DEF") return 6;
  if (s === "K") return 7;
  return 92;
}
