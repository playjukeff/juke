/* What each room has at stake, for the rail and the room grid.
 *
 * `web/src/components/shell/roomStakes.js` imports only the two room board
 * modules, which are themselves dependency-free — so this runs with no npm
 * install, like every other node step in tests.yml.
 *
 * ---- The assertion this file exists for ----
 *
 * The two stakes are in DIFFERENT UNITS. Strategy's is points **this week**
 * (`weekPts`, which is projPerGame under the league's rules); Waiver's is
 * projected points over replacement **for the season** (`gapOf`). A tile
 * that printed both as "pts/wk" would be the right-value-wrong-column
 * failure this project has already shipped once in a standings table.
 *
 * So `unit` is asserted on both, and `stakeLabel()` is asserted to say
 * something different for each. A test that only checked the numbers would
 * pass just as happily against a module that had quietly forgotten which
 * quantity it was carrying.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const { roomStakes, stakeLabel } = await import(
  pathToFileURL(path.resolve("web/src/components/shell/roomStakes.js")).href
);

const fails = [];
const note = [];
const check = (name, ok, detail) => {
  if (ok) note.push("ok  " + name);
  else fails.push(name + (detail ? "\n    " + detail : ""));
};
const is = (name, got, want) =>
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* The same fixture shape test_waiver_board.mjs uses, so the two suites
   cannot disagree about what a board row is. */
const P = (id, pos, projPts, name) => ({ id, pos, projPts, name: name || "P" + id });

/* A swap is only ever offered between two players at the SAME position —
   the snapshot does not carry slot eligibility, so that is the only swap
   strategyBoard can prove is legal. The first version of this fixture
   benched a back behind a receiver and produced no swap at all, which was
   the module being right and the fixture being wrong. */
const BOARD = [
  P("1", "RB", 260, "My Back"),        // held, starting
  P("2", "WR", 118, "Weak Starter"),   // held, starting, and barely startable
  P("6", "WR", 200, "Better Bench"),   // held, benched, and better THIS WEEK
  P("3", "WR", 240, "Free Receiver"),  // on the wire, better than anyone held
  P("4", "TE", 150, "Free End"),       // on the wire, nobody held at TE
  P("5", "K", 140, "A Kicker"),        // never ranked, in either direction
  P("9", "RB", 90, "Their Back"),      // somebody else's
  P("8", "TE", 200, "A Better End"),   // only ever held by the FULL roster
];

const REPLACEMENT = { QB: 250, RB: 120, WR: 110, TE: 80, K: 0, DST: 0 };
const gapOf = (p) => {
  if (p.projPts === null || p.projPts === undefined) return null;
  if (p.pos === "K" || p.pos === "DST") return null;
  return p.projPts - REPLACEMENT[p.pos];
};

/* Per-GAME points, which is the unit that makes Strategy's stake a weekly
   one. Deliberately not a scaled copy of projPts: if the two were
   proportional, a module that swapped them would still produce plausible
   numbers and this suite would not notice. */
const WEEK = { "1": 18, "2": 6, "6": 14, "3": 15, "4": 11, "5": 8, "9": 4 };
const weekPts = (p) => (WEEK[p.id] === undefined ? null : WEEK[p.id]);

const byId = new Map(BOARD.map((p) => [p.id, p]));

const SNAPSHOT = {
  teams: [
    // Starts the weak receiver and benches a better one, so there is a real
    // swap; holds nobody at TE, so there is a real wire gap.
    { rosterId: 1, ownerId: "me", teamName: "Mine", players: ["1", "2", "6"], starters: ["1", "2"] },
    { rosterId: 2, ownerId: "them", teamName: "Theirs", players: ["9"], starters: ["9"] },
  ],
};
const LEAGUE = { ownerId: "me" };
const ALL = { snapshot: SNAPSHOT, league: LEAGUE, byId, gapOf, weekPts, week: 3 };

// ---- the two rooms that can answer -----------------------------------------
{
  const s = roomStakes(ALL);
  check("the waiver room has a stake", !!s.waiver, JSON.stringify(s));
  check("and the strategy room has one", !!s.strategy, JSON.stringify(s));
}

/* The units, which are the point of the whole module. */
{
  const s = roomStakes(ALL);
  is("the waiver stake is a season figure", s.waiver.unit, "season");
  is("the strategy stake is a weekly one", s.strategy.unit, "week");
  check(
    "and they are genuinely different numbers",
    s.waiver.pts !== s.strategy.pts,
    `both ${s.waiver.pts}`
  );
}

/* Both read as a cost, following the Waiver Room's own stake card rather
   than inventing a second convention: the magnitude is what you could gain
   and the cost is that you have not. */
{
  const s = roomStakes(ALL);
  is("waiver is a cost", s.waiver.sign, "cost");
  is("strategy is a cost", s.strategy.sign, "cost");
}

// ---- the four rooms that cannot ---------------------------------------------
/* Absent, never zero. A tile carrying "0" claims the room was asked and had
   nothing to say; these were never askable. */
{
  const s = roomStakes(ALL);
  ["trade", "league", "prospect", "draft"].forEach((slug) => {
    is(`${slug} has no stake at all`, s[slug], undefined);
  });
}

// ---- the refusals -----------------------------------------------------------
is("no snapshot answers nothing", Object.keys(roomStakes({})).length, 0);
is("no league answers nothing", Object.keys(roomStakes({ ...ALL, league: null })).length, 0);
/* An empty crosswalk is the fresh-deployment case ESPN's own snapshot flags
   with `crosswalkReady: false`. Every roster looks empty then, and reporting
   a stake off one would be a number about a league nobody has read yet. */
is("an empty board answers nothing", Object.keys(roomStakes({ ...ALL, byId: new Map() })).length, 0);
/* A league whose ownerId matches no team: a snapshot that cannot say which
   roster is the reader's is not a roster with nothing at stake. */
is(
  "an unknown owner answers nothing",
  Object.keys(roomStakes({ ...ALL, league: { ownerId: "ghost" } })).length,
  0
);

/* Each half is independently optional, because the two callers do not always
   hold both functions — the engine's board can be ready before a league's
   own rules have landed. */
{
  const noWeek = roomStakes({ ...ALL, weekPts: null });
  check("without weekPts there is no weekly stake", !noWeek.strategy);
  check("but the wire still answers", !!noWeek.waiver);

  const noGap = roomStakes({ ...ALL, gapOf: null });
  check("without gapOf there is no wire stake", !noGap.waiver);
  check("but the week still answers", !!noGap.strategy);
}

/* The floor. A sub-point stake is inside the projection's own error — MAE
   6.8 points a player, which CLAUDE.md measures — so printing one would be a
   number a reader acts on that the model cannot support. */
{
  // A roster already holding the best of everything has nothing on the wire
  // and no swap worth making.
  const FULL = {
    teams: [
      {
        rosterId: 1, ownerId: "me", teamName: "Mine",
        // The best available at every position it holds, and nobody benched
        // — so there is neither a claim nor a swap to make.
        players: ["1", "3", "8"], starters: ["1", "3", "8"],
      },
    ],
  };
  const s = roomStakes({ ...ALL, snapshot: FULL });
  check("a roster with nothing to gain shows no wire stake", !s.waiver, JSON.stringify(s));
  check("and no swap worth making shows none either", !s.strategy, JSON.stringify(s));
}

// ---- stakeLabel(): the unit is in the words ---------------------------------
{
  const s = roomStakes(ALL);
  const w = stakeLabel(s.waiver);
  const g = stakeLabel(s.strategy);
  check("the weekly label says so", /this week$/.test(g), g);
  check("the wire label says so", /on the wire$/.test(w), w);
  check("so the two can never read as the same quantity", w !== g, `${w} / ${g}`);
}
is("no stake has no label", stakeLabel(null), null);

/* Big numbers lose the decimal and small ones keep it. A wire stake runs to
   three figures and "+142.7 on the wire" is false precision on a projection
   with a 6.8-point error; a weekly swap is single digits and rounding it
   whole throws away the half-point the decision turns on. */
is("a large stake rounds whole", stakeLabel({ pts: 142.7, unit: "season" }), "+143 on the wire");
is("a small one keeps a decimal", stakeLabel({ pts: 8.44, unit: "week" }), "+8.4 this week");

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the room stakes`);
