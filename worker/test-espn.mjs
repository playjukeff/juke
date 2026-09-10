/* The ESPN adapter, without ESPN.
 *
 *   node worker/test-espn.mjs
 *
 * No network, no wrangler, no account. espn.js takes its base URL and its
 * crosswalk as parameters for exactly this reason — the same seam
 * SLEEPER_BASE and TANK01_BASE already cut for their own feeds — so the
 * whole of the mapping can be driven against a canned payload with the
 * awkward rows in it on purpose.
 *
 * What this covers is the half that cannot be checked against the live API:
 * a private league, a league that is not there, a defense, a bench slot, a
 * player nobody can resolve, and a pool that has never synced. Every one of
 * those either cannot be produced on demand from a real league or would
 * mean breaking somebody's real one to see it.
 *
 * What it deliberately does NOT cover is whether ESPN's response looks like
 * the fixture below. Nothing offline can know that, which is why the shape
 * was read off a real public league first and is re-checked by hand against
 * one — see CLAUDE.md's ESPN section for the measurement.
 */

import { leagueSnapshot, lookupLeague, normalise, weekProjection } from "./espn.js";

let failures = 0;
function check(what, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log("ok  " + what);
  } else {
    failures++;
    console.log("x   " + what + "\n      expected " + b + "\n      received " + a);
  }
}

/* ---- A fixture with every case that matters in it ----

   Two teams. Between them: a suffixed name Sleeper stores unsuffixed, a
   defense, a player on a bench slot, a player on IR, a player who has
   changed club since the pool was built, and one nobody can resolve. */
const LEAGUE = {
  id: 777,
  seasonId: 2026,
  scoringPeriodId: 0,          // preseason — not a week
  settings: {
    name: "Fixture League",
    size: 2,
    acquisitionSettings: { acquisitionBudget: 100 },
    scheduleSettings: { playoffTeamCount: 4 },
  },
  members: [
    { id: "{AAA}", firstName: "Ada", lastName: "Lovelace" },
    { id: "{BBB}", firstName: "Alan", lastName: "Turing" },
  ],
  teams: [
    {
      id: 1, abbrev: "ADA", name: "Ada's Analytics", primaryOwner: "{AAA}", logo: null,
      record: { overall: { wins: 3, losses: 1, ties: 0, pointsFor: 412.5, pointsAgainst: 388.1 } },
      roster: { entries: [
        // Suffixed on ESPN, unsuffixed in the pool. The case an exact-name
        // query drops, and the reason name_key exists.
        { lineupSlotId: 2, playerPoolEntry: { player: { id: 1, fullName: "Marvin Harrison Jr.", defaultPositionId: 3, proTeamId: 22 } } },
        // A defense: resolves from the club alone, never from the name.
        { lineupSlotId: 16, playerPoolEntry: { player: { id: 2, fullName: "Texans D/ST", defaultPositionId: 16, proTeamId: 34 } } },
        // Bench.
        { lineupSlotId: 20, playerPoolEntry: { player: { id: 3, fullName: "Bench Guy", defaultPositionId: 2, proTeamId: 12 } } },
        // Injured reserve — also not a starter.
        { lineupSlotId: 21, playerPoolEntry: { player: { id: 4, fullName: "Hurt Guy", defaultPositionId: 4, proTeamId: 12 } } },
      ] },
    },
    {
      id: 2, abbrev: "ALN", name: "Turing Machines", primaryOwner: "{BBB}", logo: null,
      record: { overall: { wins: 1, losses: 3, ties: 0, pointsFor: 388.1, pointsAgainst: 412.5 } },
      roster: { entries: [
        // Club has moved since the pool was built: tier 2 has to catch him.
        { lineupSlotId: 0, playerPoolEntry: { player: { id: 5, fullName: "Traded Player", defaultPositionId: 1, proTeamId: 9 } } },
        // Nobody. Must be reported, never guessed at.
        { lineupSlotId: 4, playerPoolEntry: { player: { id: 6, fullName: "Nobody At All", defaultPositionId: 4, proTeamId: 3 } } },
      ] },
    },
  ],
};

/* Stands in for D1. Keyed the way resolveSleeperIds() keys its answer, and
   deliberately holding the pool's spelling rather than ESPN's. */
const POOL = new Map([
  ["marvinharrison|WR", "11628"],
  ["tradedplayer|QB", "4881"],
  ["benchguy|RB", "5555"],
  ["hurtguy|TE", "6666"],
]);
const resolve = async (wanted) => {
  const out = new Map();
  wanted.forEach((w) => {
    const k = normalise(w.name) + "|" + w.pos;
    if (POOL.has(k)) out.set(k, POOL.get(k));
  });
  return out;
};

// Serves the fixture at whatever path espn.js asks for.
function stub(status, body) {
  return {
    base: "https://stub.invalid",
    fetch: async () => ({ ok: status === 200, status, json: async () => body }),
  };
}
const realFetch = globalThis.fetch;
function withFetch(status, body, fn) {
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => body });
  return fn().finally(() => { globalThis.fetch = realFetch; });
}

console.log("--- the crosswalk ---");
await withFetch(200, LEAGUE, async () => {
  const { snapshot, reason } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);

  check("a readable league has no reason", reason, null);
  check("the crosswalk was available", snapshot.crosswalkReady, true);

  const ada = snapshot.teams[0];
  check("a suffixed ESPN name resolves to the unsuffixed pool id",
        ada.players.includes("11628"), true);
  check("a defense resolves to its club abbreviation, which IS its Sleeper id",
        ada.players.includes("HOU"), true);
  check("bench and IR are on the roster", ada.players.length, 4);
  check("and neither is a starter", ada.starters.sort(), ["11628", "HOU"]);

  const alan = snapshot.teams[1];
  check("a player whose club has changed still resolves on name and position",
        alan.players, ["4881"]);
  check("an unresolvable player is dropped from the roster", alan.players.includes("6666"), false);
  check("and reported by name", snapshot.unmatched, ["Nobody At All (TE CHI)"]);
  check("with a count beside it", snapshot.unmatchedCount, 1);

  check("scoringPeriodId 0 is not week 0", snapshot.week, null);
  check("the league's own settings come through",
        [snapshot.name, snapshot.totalTeams, snapshot.waiverBudget, snapshot.playoffTeams],
        /* null, not 100: the fixture carries acquisitionBudget without
           isUsingAcquisitionBudget, which is exactly the shape of a real
           league that has never bid a dollar. See the waiver section. */
        ["Fixture League", 2, null, 4]);
  check("a manager's name is read from members, not left as a GUID",
        snapshot.teams.map((t) => t.manager), ["Ada Lovelace", "Alan Turing"]);
  check("the record comes through", [ada.wins, ada.losses, ada.pointsFor], [3, 1, 412.5]);
});

console.log("\n--- a pool that has never synced ---");
await withFetch(200, LEAGUE, async () => {
  /* null from resolve() is "there is no crosswalk", which is a different
     fact from "nobody matched" — and the only one with a fix. A snapshot
     that could not tell them apart would report an empty league. */
  const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", async () => null);
  check("says so rather than reporting an empty league", snapshot.crosswalkReady, false);
  check("and the defense still resolves, because it needs no pool",
        snapshot.teams[0].players, ["HOU"]);
});

console.log("\n--- the failures are told apart ---");
for (const [status, want] of [[401, "private"], [403, "private"], [404, "not-found"], [400, "not-found"], [500, "offline"]]) {
  await withFetch(status, null, async () => {
    const snap = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    const look = await lookupLeague("777", "2026", "https://stub.invalid");
    check(`HTTP ${status} on a snapshot reads as ${want}`, snap.reason, want);
    check(`HTTP ${status} on a lookup reads as ${want}`, look.reason, want);
  });
}

console.log("\n--- the lookup's own answer ---");
await withFetch(200, LEAGUE, async () => {
  const { league } = await lookupLeague("777", "2026", "https://stub.invalid");
  check("names the league", [league.name, league.season, league.totalTeams], ["Fixture League", "2026", 2]);
  check("and lists its teams, which is the question Sleeper never has to ask",
        league.teams.map((t) => [t.teamId, t.name, t.manager]),
        [["1", "Ada's Analytics", "Ada Lovelace"], ["2", "Turing Machines", "Alan Turing"]]);
});


/* ---- The draft status, which is not the boolean it looks like ----

   `inProgress` goes true when ESPN opens the draft ROOM, which is well
   before anybody picks -- measured thirty-four minutes early on a real
   league. Reading it alone printed DRAFTING NOW over a draft that had not
   started, and suppressed the countdown entirely. So every case below is
   about what separates "the room is open" from "picks are being made", and
   what separates them is a pick with a real player behind it. */
console.log("");

/* ---- The completed draft ----

   Captured from the same response the rosters come from, because a pick
   carries a bare ESPN playerId and the roster is the only free way to turn
   that into a person. Every case below is one that silently shortens or
   mis-names a board. */
console.log("");
console.log("--- the draft ---");

/* A negative playerId is a TEAM DEFENCE, not an unmade pick. Measured on a
   real league: -16034 Houston, -16007 Denver, -(16000 + proTeamId). A
   `> 0` test drops exactly one pick per roster and reports them as neither
   picks nor unnamed -- ten of 140, found by counting rather than by
   anything failing. */
const DRAFTED = {
  ...LEAGUE,
  settings: { ...LEAGUE.settings, draftSettings: { type: "SNAKE", date: 1 } },
  draftDetail: {
    drafted: true,
    inProgress: false,
    picks: [
      { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 1, playerId: 1, autoDraftTypeId: 0 },
      { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, teamId: 2, playerId: 5, autoDraftTypeId: 3 },
      { overallPickNumber: 3, roundId: 2, roundPickNumber: 1, teamId: 2, playerId: -16034, autoDraftTypeId: 0 },
      { overallPickNumber: 4, roundId: 2, roundPickNumber: 2, teamId: 1, playerId: -1, autoDraftTypeId: 0 },
    ],
  },
};
// The defence has to be findable by the id the PICK names.
DRAFTED.teams = LEAGUE.teams.map((t) => ({
  ...t,
  roster: { entries: t.roster.entries.map((e) => (
    e.playerPoolEntry.player.id === 2
      ? { ...e, playerId: -16034, playerPoolEntry: e.playerPoolEntry }
      : { ...e, playerId: e.playerPoolEntry.player.id }
  )) },
}));

await withFetch(200, DRAFTED, async () => {
  const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
  const d = snapshot.draft;

  check("a completed draft comes through", !!d, true);
  check("the type is stated, never inferred", d.type, "SNAKE");
  check("an unmade pick is not a pick", d.picks.length, 3);
  check("and a DEFENCE's negative id still is",
        d.picks.map((p) => p.pos), ["WR", "QB", "DST"]);
  check("the defence is named from the roster the pick points at",
        d.picks[2].name, "Texans D/ST");
  check("and crosswalks by club, which needs no pool", d.picks[2].id, "HOU");
  check("a resolvable player carries Juke's own id", d.picks[0].id, "11628");
  check("nothing here went unnamed", d.unnamed, 0);
  check("the seat order is round one's, in order", d.order, ["1", "2"]);
  check("an auto pick says so", d.picks.map((p) => p.auto), [false, true, false]);
  check("rounds is the deepest round reached", d.rounds, 2);
});

/* A pick whose player has been dropped since is still a pick. Dropping it
   would leave a board silently short, which is the one failure a reader
   cannot see. */
await withFetch(200, {
  ...DRAFTED,
  draftDetail: { drafted: true, inProgress: false, picks: [
    { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 1, playerId: 9999 },
  ] },
}, async () => {
  const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
  check("a pick nobody rosters any more is kept", snapshot.draft.picks.length, 1);
  check("with no name rather than no row", snapshot.draft.picks[0].name, null);
  check("and it is counted", snapshot.draft.unnamed, 1);
});

/* Before the draft there is nothing to send, and ~8KB of picks rides on a
   payload every room fetches. */
await withFetch(200, LEAGUE, async () => {
  const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
  check("an undrafted league sends no draft at all", snapshot.draft, null);
});


console.log("--- the draft status ---");

const GRID = (made, extra = {}) =>
  Array.from({ length: 4 }, (_, n) => ({
    id: n + 1,
    overallPickNumber: n + 1,
    roundId: 1,
    roundPickNumber: n + 1,
    teamId: (n % 2) + 1,
    // -1 is ESPN's unmade pick: the grid is built before anybody drafts.
    playerId: n < made ? 1000 + n : -1,
    keeper: false,
    reservedForKeeper: false,
    ...(n < made ? extra : {}),
  }));

/* Far-past and far-future fixtures rather than an injected clock: `due` is
   the one thing in draftInfo() that reads a real one, and a league dated
   2020 or 2100 is deterministic against any Date.now() this will ever run
   under -- with no signature threaded through two public functions to get
   there. */
const LONG_AGO = 1600000000000;   // September 2020
const FAR_OFF = 4102444800000;    // January 2100

async function statusOf(draftDetail, date = null) {
  const settings = date === null
    ? LEAGUE.settings
    : { ...LEAGUE.settings, draftSettings: { date } };
  const league = { ...LEAGUE, draftDetail, settings };
  return withFetch(200, league, async () => {
    const { league: out } = await lookupLeague("777", "2026", "https://stub.invalid");
    return out.draftStatus;
  });
}

check("the room being open is not the draft starting",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(0) }), "pre_draft");
check("one real pick is",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(1) }), "drafting");
check("a finished draft is complete whatever inProgress says",
      await statusOf({ inProgress: true, drafted: true, picks: GRID(4) }), "complete");
check("a league that has not opened its room is pre_draft",
      await statusOf({ inProgress: false, drafted: false, picks: GRID(0) }), "pre_draft");

/* A keeper is assigned before the draft rather than during it, so it is not
   evidence that one is under way -- and it is the one thing that would
   reintroduce this bug from the only direction the fix leaves open. */
check("a keeper on the grid is not a pick",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(2, { keeper: true }) }),
      "pre_draft");
check("nor is a slot merely reserved for one",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(2, { reservedForKeeper: true }) }),
      "pre_draft");

/* With the view refused there are no picks to reason from. The old reading
   is wrong early and right mid-draft, which beats printing DRAFT TIME
   PASSED over a draft that is actually running. */
/* ESPN reports no picks at all WHILE a draft is running -- measured across
   a whole real one -- so the scheduled hour is the other half of the test.
   These four are what separate "running" from the bug above without
   reintroducing it. */
check("the hour having come, with the room open, is drafting",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(0) }, LONG_AGO), "drafting");
check("and it does not fire before that hour arrives",
      await statusOf({ inProgress: true, drafted: false, picks: GRID(0) }, FAR_OFF), "pre_draft");
/* A draft nobody held keeps `late`, which is what that phase is for: the
   room is shut, so no amount of elapsed time makes it drafting. */
check("a passed hour with the room shut is not drafting",
      await statusOf({ inProgress: false, drafted: false, picks: GRID(0) }, LONG_AGO), "pre_draft");
check("and a finished draft stays complete past its own hour",
      await statusOf({ inProgress: false, drafted: true, picks: GRID(4) }, LONG_AGO), "complete");

check("with no picks in hand it falls back to the boolean",
      await statusOf({ inProgress: true, drafted: false }), "drafting");

/* The picks only arrive if they are asked for: draftDetail rides on the
   league root carrying its two booleans and nothing else. */
console.log("");
console.log("--- the request asks for the picks ---");
{
  const keep = globalThis.fetch;
  let lookupAsked = "", snapAsked = "";
  globalThis.fetch = async (url) => { lookupAsked = String(url);
    return { ok: true, status: 200, json: async () => LEAGUE }; };
  await lookupLeague("777", "2026", "https://stub.invalid");
  globalThis.fetch = async (url) => { snapAsked = String(url);
    return { ok: true, status: 200, json: async () => LEAGUE }; };
  await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
  globalThis.fetch = keep;
  check("the lookup asks for mDraftDetail", lookupAsked.includes("view=mDraftDetail"), true);
  check("and so does the snapshot", snapAsked.includes("view=mDraftDetail"), true);
}
/* The roster comes back in LINEUP order, not the order ESPN returned its
   entries in. Measured on a real team, ESPN gives WR, WR, QB, FLEX, RB, RB,
   ... and espn.js was passing that straight through, against the contract
   strategyBoard.js states in its own comment. */
console.log("");
/* ---- Which waiver system the league actually runs ----

   `acquisitionBudget` is 100 on a league that has never bid a dollar --
   ESPN carries a default whether or not it applies -- and
   `isUsingAcquisitionBudget` beside it says whether the number means
   anything. Reading the budget alone put "FAAB POOL $100" on a league
   running rolling waiver order, which is not a smaller version of the
   truth but a different system.

   The "treat 0 from an API as missing" rule inverted: a value that is
   PRESENT and does not apply. */
console.log("");
console.log("--- the waiver system ---");
{
  // The reported league, field for field: Waivers, 1 Day, never resets.
  const ORDER = { ...LEAGUE, settings: { ...LEAGUE.settings, acquisitionSettings: {
    acquisitionBudget: 100, isUsingAcquisitionBudget: false,
    acquisitionType: "WAIVERS_TRADITIONAL", waiverOrderReset: false, waiverHours: 24,
  } } };
  await withFetch(200, ORDER, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    check("a budget without the flag is not a FAAB league", snapshot.waiver.type, "order");
    check("so there is no pool to show", snapshot.waiverBudget, null);
    check("and none on the waiver block either", snapshot.waiver.budget, null);
    check("the order's own rule comes through", snapshot.waiver.resetsOrder, false);
    check("and the waiver period", snapshot.waiver.hours, 24);
  });
}
{
  const FAAB = { ...LEAGUE, settings: { ...LEAGUE.settings, acquisitionSettings: {
    acquisitionBudget: 200, isUsingAcquisitionBudget: true, minimumBid: 1,
  } } };
  await withFetch(200, FAAB, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    check("a league that bids is a FAAB league", snapshot.waiver.type, "faab");
    check("with its pool", snapshot.waiverBudget, 200);
    check("and its floor", snapshot.waiver.minimumBid, 1);
    /* Order rules mean nothing here, so they are absent rather than false --
       a `resetsOrder: false` on a FAAB league is an answer to a question
       nobody asked. */
    check("and no order rule to misread", snapshot.waiver.resetsOrder, null);
  });
}


/* ---- when the league stops trading -------------------------------------
 *
 * `tradeSettings.deadlineDate` was on every snapshot request this adapter
 * has ever made and nothing read it, which is why CLAUDE.md listed the
 * decision guide's screen 14 under "the data cannot answer" until somebody
 * looked. The value below is the real one, measured 9 September 2026:
 * 1796230800000 is 2026-12-02T17:00:00Z.
 *
 * What is asserted here is the ADAPTER's half — that the field arrives on
 * the snapshot in the shape a screen expects. Whether a given instant has
 * passed is `web/src/lib/tradeDeadline.js`'s question and has its own suite,
 * because that one is pure and this one needs a stubbed fetch. */
console.log("");
console.log("--- the trade deadline ---");
{
  const DEADLINE = { ...LEAGUE, settings: { ...LEAGUE.settings, tradeSettings: {
    deadlineDate: 1796230800000, max: -1, revisionHours: 48, vetoVotesRequired: 6,
  } } };
  await withFetch(200, DEADLINE, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    check("the instant comes through", snapshot.tradeDeadline.at, 1796230800000);
    /* ESPN publishes no week and no trades-off flag, and both are absent
       rather than invented — the Sleeper adapter fills the week, and a
       screen reads whichever field its league actually has. */
    check("and no week, which ESPN does not publish", snapshot.tradeDeadline.week, null);
    check("and no opinion about trading being off", snapshot.tradeDeadline.disabled, null);
  });
}
{
  /* A league with no deadline at all. The 0 is the falsy-feed rule: read as
     a real instant it would put every such league permanently past its own
     deadline, in 1970. */
  const NONE = { ...LEAGUE, settings: { ...LEAGUE.settings, tradeSettings: { deadlineDate: 0 } } };
  await withFetch(200, NONE, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    check("a zero deadline is no deadline", snapshot.tradeDeadline.at, null);
  });
}
{
  /* And the settings group missing outright, which is what an older season
     or a changed payload looks like. It must not throw. */
  const BARE = { ...LEAGUE, settings: { ...LEAGUE.settings } };
  delete BARE.settings.tradeSettings;
  await withFetch(200, BARE, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    check("no tradeSettings at all still answers", snapshot.tradeDeadline.at, null);
  });
}


console.log("--- the roster's order ---");
{
  const OUT_OF_ORDER = {
    ...LEAGUE,
    teams: [{
      ...LEAGUE.teams[0],
      roster: { entries: [
        // Deliberately back to front: defence, bench, then the running back.
        { lineupSlotId: 16, playerPoolEntry: { player: { id: 2, fullName: "Texans D/ST", defaultPositionId: 16, proTeamId: 34 } } },
        { lineupSlotId: 20, playerPoolEntry: { player: { id: 3, fullName: "Bench Guy", defaultPositionId: 2, proTeamId: 12 } } },
        { lineupSlotId: 2, playerPoolEntry: { player: { id: 1, fullName: "Marvin Harrison Jr.", defaultPositionId: 3, proTeamId: 22 } } },
      ] },
    }],
  };
  await withFetch(200, OUT_OF_ORDER, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    const t = snapshot.teams[0];
    // Slot 2 sorts before slot 16, whatever order the entries arrived in.
    check("starters come out by slot, not by entry order", t.starters, ["11628", "HOU"]);
    // And the bench follows the starters rather than keeping its place.
    check("with the bench after them", t.players, ["11628", "HOU", "5555"]);
  });
}



console.log("\n--- the league's own weekly projection ---");
/* The shape is Jonathan Taylor's real row off a real league's mRoster,
   10 September 2026, with its neighbours left in on purpose: last season's
   total, this season's total, and the actual line a player carries once his
   game has kicked off. Each is the wrong number to call a projection and
   each is one field away from the right one. */
const STATS = [
  { seasonId: 2025, statSourceId: 0, statSplitTypeId: 0, scoringPeriodId: 0, appliedTotal: 378.3 },
  { seasonId: 2026, statSourceId: 1, statSplitTypeId: 0, scoringPeriodId: 0, appliedTotal: 329.86790072 },
  { seasonId: 2026, statSourceId: 0, statSplitTypeId: 1, scoringPeriodId: 1, appliedTotal: 31.2 },
  { seasonId: 2025, statSourceId: 1, statSplitTypeId: 1, scoringPeriodId: 1, appliedTotal: 12.0 },
  { seasonId: 2026, statSourceId: 1, statSplitTypeId: 1, scoringPeriodId: 1, appliedTotal: 18.49790141 },
];
check("the week's projection is the one row that is projected, weekly, this week, this season",
      weekProjection({ stats: STATS }, 2026, 1), 18.4979);
check("an actual line is never read as a projection",
      weekProjection({ stats: STATS.filter((s) => s.statSourceId === 0) }, 2026, 1), null);
check("the season total is never read as a week",
      weekProjection({ stats: [STATS[1]] }, 2026, 1), null);
check("last season's week 1 is not this season's",
      weekProjection({ stats: [STATS[3]] }, 2026, 1), null);
check("another week answers nothing rather than a neighbour",
      weekProjection({ stats: STATS }, 2026, 2), null);
check("no week, no projection", weekProjection({ stats: STATS }, 2026, null), null);
check("a projected zero is a zero, not a missing number",
      weekProjection({ stats: [{ seasonId: 2026, statSourceId: 1, statSplitTypeId: 1,
                                 scoringPeriodId: 1, appliedTotal: 0 }] }, 2026, 1), 0);

{
  const wk = (pts) => ({ stats: [{ seasonId: 2026, statSourceId: 1, statSplitTypeId: 1,
                                   scoringPeriodId: 1, appliedTotal: pts }] });
  const IN_SEASON = JSON.parse(JSON.stringify(LEAGUE));
  IN_SEASON.scoringPeriodId = 1;
  const pts = [21.9143, 8.5, 3.1, 0, 17.25, 6.4];
  IN_SEASON.teams.flatMap((t) => t.roster.entries).forEach((e, i) =>
    Object.assign(e.playerPoolEntry.player, wk(pts[i])));
  await withFetch(200, IN_SEASON, async () => {
    const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
    const p = snapshot.projections;
    check("the snapshot carries the projection, stamped with its week",
          [p && p.week, p && p.source], [1, "espn"]);
    check("keyed by the same Sleeper ids as the rosters, a defense by its club",
          [p.points["11628"], p.points.HOU, p.points["5555"], p.points["6666"], p.points["4881"]],
          [21.9143, 8.5, 3.1, 0, 17.25]);
    check("and nothing for a player the crosswalk could not name",
          Object.keys(p.points).length, 5);
  });
}
await withFetch(200, LEAGUE, async () => {
  const { snapshot } = await leagueSnapshot("777", "2026", "https://stub.invalid", resolve);
  check("before the season there is no week, so no projection to stamp",
        snapshot.projections, null);
});

console.log("\n--- normalise agrees with build_players.py ---");
[
  ["Marvin Harrison Jr.", "marvinharrison"],
  ["Kenneth Walker III", "kennethwalker"],
  ["Kyle Pitts Sr.", "kylepitts"],
  ["Amon-Ra St. Brown", "amonrastbrown"],
  ["Ja’Marr Chase", "jamarrchase"],
  ["D'Andre Swift", "dandreswift"],
].forEach(([raw, want]) => check(`normalise(${JSON.stringify(raw)})`, normalise(raw), want));

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — the ESPN adapter, offline");
process.exit(failures ? 1 : 0);
