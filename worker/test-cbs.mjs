/* The CBS adapter, without CBS.
 *
 *   node worker/test-cbs.mjs
 *
 * No network, no wrangler, no session. `cbs.js` takes its base and its
 * credential as one parameter and its crosswalk as another, the same seam
 * espn.js already cuts, so the whole of the mapping runs against a canned
 * payload with the awkward rows in it on purpose.
 *
 * Every fixture below is shaped from the real payloads captured against
 * `sanctuaryfootballleague.football.cbssports.com` on 15 September 2026 --
 * the field names, the sparse team ids, the plain-text refusal, the
 * `roster_status` codes and the scoring categories are what that league
 * actually answered. What is invented is only how many teams and which
 * players, so that the cases that matter are all present in one small
 * league.
 *
 * What this deliberately does NOT cover is whether CBS still answers in
 * that shape. Nothing offline can know that; CLAUDE.md's CBS section
 * carries the measurement and names the date it was taken on.
 */

import {
  cbsHost, cbsSlug, cbsSource, lineupFromCbs, tradeDeadlineFromCbs,
  waiverFromCbs, draftInfoFromCbs, cbsKey, crosswalk, lookupLeague,
  leagueSnapshot,
} from "./cbs.js";
import { rulesFromCbs } from "./scoring.js";
import { normalise } from "./names.js";

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

/* ---- The fixture ----

   Two teams, ids 4 and 14, because a real twelve-team league answers
   4,14,8,6,15,2,3,5,10,12,11,1 -- sparse and unordered, so an id is never
   an index. Between them, every case worth a line:

     Josh Allen          starting, healthy, projected
     Puka Nacua          starting, locked (his game has kicked off)
     Bench Receiver      roster_pos "WR", roster_status "RS" -- the bug
     Jaguars             a defence, pro_team JAC, which is JAX here
     Kenneth Gainwell    a name the pool spells Kenny: unresolvable
     Hurt Guy            firstname/lastname only, on IR, not a starter     */

const ROSTER_4 = [
  { fullname: "Josh Allen", position: "QB", pro_team: "BUF",
    roster_status: "A", roster_pos: "QB", projected_points: 24.4, pro_status: "ACTIVE" },
  { fullname: "Puka Nacua", position: "WR", pro_team: "LAR",
    roster_status: "A", roster_pos: "WR", projected_points: 18.2, is_locked: "1" },
  { fullname: "Bench Receiver", position: "WR", pro_team: "LAR",
    roster_status: "RS", roster_pos: "WR" },
  { fullname: "Jaguars", position: "DST", pro_team: "JAC",
    roster_status: "A", roster_pos: "DST" },
  { fullname: "Kenneth Gainwell", position: "RB", pro_team: "PHI",
    roster_status: "RS", roster_pos: "RB" },
  { firstname: "Hurt", lastname: "Guy", position: "TE", pro_team: "KC",
    roster_status: "I", roster_pos: "TE", pro_status: "Injured Reserve" },
];

const ROSTER_14 = [
  { fullname: "Bijan Robinson", position: "RB", pro_team: "ATL",
    roster_status: "A", roster_pos: "RB" },
];

const SCORING_RULES = {
  categories: [
    { name: "ReTD", points: 6 }, { name: "RuTD", points: 6 },
    { name: "PaTD", points: 4 }, { name: "PaInt", points: -2 },
    { name: "Recpt", points: 1 }, { name: "FL", points: -2 },
    { name: "XP", points: 1 }, { name: "MFG", points: -2 },
    { name: "SACK", points: 1 }, { name: "Int", points: 2 },
    { name: "DFR", points: 2 }, { name: "STY", points: 2 },
    { name: "DTD", points: 6 },
    // Per-unit: the rate is inside the range, and `points` is absent.
    { name: "ReYd", ranges: [{ points: 1, per: 10 }] },
    { name: "RuYd", ranges: [{ points: 1, per: 10 }] },
    { name: "PaYd", ranges: [{ points: 1, per: 25 }] },
    // A base rate plus distance steps.
    { name: "FG", points: 3, bonuses: [
      { from: 40, to: 49, points: 1 },
      { from: 50, to: 59, points: 2 },
      { from: 60, to: 69, points: 3 },
    ] },
    // Bands, two of which coincide with Juke's exactly and five of which
    // do not. CBS pays nothing at all for 18 to 27 allowed.
    { name: "DSTPA", ranges: [
      { from: 0, to: 1, points: 5 }, { from: 2, to: 6, points: 4 },
      { from: 7, to: 13, points: 3 }, { from: 14, to: 17, points: 1 },
      { from: 28, to: 34, points: -1 }, { from: 35, to: 45, points: -3 },
      { from: 46, to: 60, points: -5 },
    ] },
    // Categories Juke has no rule for at any band.
    { name: "YDS", ranges: [{ from: 0, to: 99, points: 5 }] },
    { name: "ST2PT", points: 2 },
  ],
};

const RULES = {
  roster: {
    positions: [
      { abbr: "QB", min_active: 1 },
      { abbr: "RB", min_active: 2 },
      { abbr: "WR", min_active: 2 },
      { abbr: "TE", min_active: 1 },
      { abbr: "RB-WR-TE", min_active: 1 },
      { abbr: "K", min_active: 1 },
      { abbr: "DST", min_active: 1 },
      { abbr: "LB", min_active: 0 },
    ],
  },
  transactions: {
    add_drop_policy: { value: "waivers" },
    add_drop_waiver_period: { value: 1 },
    trade_deadline: { value: "20261113" },
    trade_policy: { value: "commissioner" },
  },
};

const BODIES = {
  "league/details": { league_details: {
    name: "Sanctuary Football League", num_teams: 12, current_period: "2",
    draft_state: "completed", season_status: "regularseason",
  } },
  "league/teams": { teams: [
    { id: 4, name: "Team Four", owners: [{ name: "Chase" }] },
    { id: 14, name: "Team Fourteen", owners: [{ name: "Someone" }] },
  ] },
  "league/rosters": { rosters: { teams: [
    { id: 4, players: ROSTER_4 },
    { id: 14, players: ROSTER_14 },
  ] } },
  "league/standings/overall": { overall_standings: { divisions: [
    { teams: [{ id: 4, wins: 2, losses: 0, ties: 0, points_scored: 240.5, points_against: 180.25 }] },
    { teams: [{ id: 14, wins: 0, losses: 2, ties: 0, points_scored: 180.25, points_against: 240.5 }] },
  ] } },
  "league/schedules": { schedules: [] },
  "league/rules": { rules: RULES },
  "league/scoring/rules": { scoring_rules: SCORING_RULES },
};

/* The pool, as a name|pos lookup. Gainwell is deliberately absent: CBS
   spells him Kenneth and the pipeline spells him Kenny, which is one of the
   two real misses the crosswalk measurement records. */
const POOL = new Map([
  ["Josh Allen|QB", "4984"],
  ["Puka Nacua|WR", "9493"],
  ["Bench Receiver|WR", "1111"],
  ["Hurt Guy|TE", "2222"],
  ["Bijan Robinson|RB", "8138"],
]);

let asked = [];
const resolve = async (wanted) => {
  asked = wanted.slice();
  const m = new Map();
  for (const w of wanted) {
    const id = POOL.get(w.name + "|" + w.pos);
    if (id) m.set(normalise(w.name) + "|" + w.pos, id);
  }
  return m;
};

let urls = [];
function stubFetch(mode) {
  urls = [];
  globalThis.fetch = async (u) => {
    const url = String(u);
    urls.push(url);
    if (mode === "offline") throw new Error("getaddrinfo ENOTFOUND");
    if (mode === "signedOut") {
      // CBS answers 200 with a PLAIN-TEXT refusal. The status line is not
      // the answer and a caller reading it would treat this as a league.
      return { ok: true, status: 200, text: async () => "User not signed in" };
    }
    const key = Object.keys(BODIES).find((k) => url.includes("/api/" + k));
    const body = key ? BODIES[key] : {};
    return { ok: true, status: 200, text: async () => JSON.stringify({ body }) };
  };
}

/* ----------------------------------------------------------
   The slug is a HOSTNAME, so validating it is the difference
   between an adapter and an open proxy
   ---------------------------------------------------------- */

check("a plain slug becomes a league host",
  cbsHost("sanctuaryfootballleague"),
  "https://sanctuaryfootballleague.football.cbssports.com");

for (const bad of ["evil.com#", "a.b", "foo/bar", "user@evil", "", "-lead",
                   "x", "UPPER.CASE", "a".repeat(64)]) {
  check("refused as a host: " + JSON.stringify(bad), cbsHost(bad), null);
}

check("a league URL gives up its slug",
  cbsSlug("https://sanctuaryfootballleague.football.cbssports.com/rules"),
  "sanctuaryfootballleague");
check("so does a bare host",
  cbsSlug("sanctuaryfootballleague.football.cbssports.com"),
  "sanctuaryfootballleague");
check("a URL on another host is refused, not trusted for its first label",
  cbsSlug("https://sanctuaryfootballleague.evil.com/rules"), null);
check("and so is a CBS page that is not a league subdomain",
  cbsSlug("https://www.cbssports.com/fantasy/football/"), null);

check("no credential leaves the base alone", cbsSource(null, null), null);
check("a pid becomes exactly one cookie",
  cbsSource(null, { pid: "abc123" }), { base: null, cookie: "pid=abc123" });

/* ----------------------------------------------------------
   The pieces
   ---------------------------------------------------------- */

check("the lineup is read out of the league's own roster rules",
  lineupFromCbs(RULES),
  { starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 }, flex: 1, superflex: 0 });

check("a flex that can hold a quarterback is a superflex",
  lineupFromCbs({ roster: { positions: [
    { abbr: "QB", min_active: 1 }, { abbr: "QB-RB-WR-TE", min_active: 1 },
  ] } }),
  { starters: { QB: 1 }, flex: 0, superflex: 1 });

check("no roster rules is null, never an empty lineup",
  lineupFromCbs({ roster: {} }), null);

/* A wall time in a named zone, resolved rather than assumed: November is
   EST and October is EDT, and hardcoding either is right for half a
   season. */
check("the November deadline lands at 23:59 EST",
  new Date(tradeDeadlineFromCbs(RULES.transactions).at).toISOString(),
  "2026-11-14T04:59:00.000Z");
check("an October one lands at 23:59 EDT",
  new Date(tradeDeadlineFromCbs({ trade_deadline: { value: "20261015" } }).at).toISOString(),
  "2026-10-16T03:59:00.000Z");
check("a league that forbids trading says so",
  tradeDeadlineFromCbs({ trade_policy: { value: "none" }, trade_deadline: { value: "20261113" } }).disabled,
  true);
check("no deadline is null in both units, never a guess",
  tradeDeadlineFromCbs({}), { at: null, week: null, disabled: false });

/* The trap ESPN sets -- a budget on a league that never bids -- told from
   the other side: CBS carries no budget at all for an order league, so the
   only way to report one would be to invent it. */
check("an order league reports no budget",
  waiverFromCbs(RULES.transactions),
  { type: "order", budget: null, minimumBid: null, resetsOrder: null, hours: 24 });
check("a FAAB league reports its pool",
  waiverFromCbs({ add_drop_policy: { value: "budget" }, add_drop_waiver_budget: { value: 100 } }),
  { type: "faab", budget: 100, minimumBid: null, resetsOrder: null, hours: null });

check("a completed draft is complete", draftInfoFromCbs({ draft_state: "completed" }).status, "complete");
check("a live draft is drafting", draftInfoFromCbs({ draft_state: "live" }).status, "drafting");
check("a league in its regular season has drafted, whatever draft_state says",
  draftInfoFromCbs({ season_status: "regularseason" }).status, "complete");
check("and an off-season league with no draft state has not",
  draftInfoFromCbs({ season_status: "preseason" }).status, "pre_draft");

/* ----------------------------------------------------------
   Scoring
   ---------------------------------------------------------- */

const scoring = rulesFromCbs(SCORING_RULES);

check("the flat categories translate one to one",
  [scoring.rules.rec_td, scoring.rules.pass_td, scoring.rules.rec, scoring.rules.pass_int],
  [6, 4, 1, -2]);

/* ReYd/RuYd/PaYd carry NO flat `points`; the number is inside ranges[0] as
   points-per-`per`. Reading `points` would score every yardage rule at
   zero, silently, which is the whole reason this is its own table. */
check("a per-unit rule is the range's rate, not its absent flat points",
  [scoring.rules.rec_yd, scoring.rules.rush_yd, scoring.rules.pass_yd],
  [0.1, 0.1, 0.04]);

/* A made field goal is base plus a distance step, matched on the band's
   LOWER edge. CBS's top bonus is 60-69 and Juke's top band is 60+, so a
   predicate testing the band's upper edge for containment falls through to
   40-49 and quietly charges 4 for a sixty-yard kick. */
check("every field-goal band is base plus its own bonus",
  [scoring.rules.fgm_0_19, scoring.rules.fgm_20_29, scoring.rules.fgm_30_39,
   scoring.rules.fgm_40_49, scoring.rules.fgm_50_59, scoring.rules.fgm_60p],
  [3, 3, 3, 4, 5, 6]);

/* Only the bands that coincide EXACTLY. Mapping CBS's 14-17 onto Juke's
   14-20 would pay for three scorelines this league does not pay for. */
check("points allowed maps only where the bands coincide",
  [scoring.rules.pts_allow_7_13, scoring.rules.pts_allow_28_34],
  [3, -1]);
check("and the bands that do not are absent rather than approximated",
  [scoring.rules.pts_allow_0, scoring.rules.pts_allow_1_6,
   scoring.rules.pts_allow_14_20, scoring.rules.pts_allow_21_27,
   scoring.rules.pts_allow_35p].map((v) => v === undefined),
  [true, true, true, true, true]);

check("what could not be represented is reported by name",
  scoring.unmapped, ["DSTPA", "ST2PT", "YDS"]);

check("no scoring rules at all is null, not an empty table",
  rulesFromCbs(null), { rules: null, unmapped: [] });

/* ----------------------------------------------------------
   The crosswalk
   ---------------------------------------------------------- */

check("a defence's club is normalised -- CBS says JAC and the pipeline says JAX",
  cbsKey({ fullname: "Jaguars", position: "DST", pro_team: "JAC" }).team, "JAX");
check("D and ST are both a team defence",
  [cbsKey({ position: "D" }).pos, cbsKey({ position: "ST" }).pos], ["DST", "DST"]);
check("a linebacker is not a player any roster here can hold",
  cbsKey({ fullname: "Somebody", position: "LB" }).pos, null);
check("a name is assembled from the parts when there is no fullname",
  cbsKey({ firstname: "Hurt", lastname: "Guy", position: "TE" }).name, "Hurt Guy");

await crosswalk(ROSTER_4, resolve);
check("the pool is never asked about a defence -- the club IS the id",
  asked.some((w) => w.pos === "DST"), false);
check("nor about an IDP the league cannot roster",
  asked.map((w) => w.name).sort(),
  ["Bench Receiver", "Hurt Guy", "Josh Allen", "Kenneth Gainwell", "Puka Nacua"]);

/* ----------------------------------------------------------
   The two reads
   ---------------------------------------------------------- */

stubFetch("ok");
const look = await lookupLeague("sanctuaryfootballleague", "2026");
check("the lookup names the league", look.league.name, "Sanctuary Football League");
check("and answers the second question -- which of these teams is yours",
  look.league.teams.map((t) => [t.teamId, t.manager]),
  [["4", "Chase"], ["14", "Someone"]]);
check("team ids are CBS's own and sparse, never an index",
  look.league.teams.map((t) => t.teamId), ["4", "14"]);
check("the required-and-ignored league_id rides on every call",
  urls.every((u) => u.includes("league_id=1")), true);

stubFetch("ok");
const snap = (await leagueSnapshot("sanctuaryfootballleague", "2026", null, resolve)).snapshot;

/* Without `team_id=all` CBS answers only the signed-in reader's OWN team,
   which reads as a one-team league rather than as an error. */
check("the rosters call asks for every team",
  urls.some((u) => u.includes("/api/league/rosters?team_id=all")), true);

const four = snap.teams.find((t) => t.ownerId === "4");

/* The bug this file exists for. `roster_pos` carries a player's ELIGIBLE
   slot, so a benched receiver reads "WR" exactly as a starting one does --
   every player on a sixteen-man roster came back a starter, in a league
   that starts nine. `roster_status` is the assignment. */
check("a bench player is not a starter, though his roster_pos says WR",
  four.starters.includes("1111"), false);
check("nor is a player on injured reserve",
  four.starters.includes("2222"), false);
check("the starters are exactly the players CBS marks active",
  four.starters, ["4984", "9493", "JAX"]);
check("and they are fewer than the players on the roster",
  [four.starters.length, four.players.length], [3, 5]);

check("a defence resolves on its club, with no pool lookup at all",
  four.players.includes("JAX"), true);

/* A roster one player short looks exactly like a roster, so a name the
   pool cannot place is reported rather than dropped in silence. */
check("an unresolvable name is reported", snap.unmatchedCount, 1);
check("by name, position and club", snap.unmatched, ["Kenneth Gainwell (RB PHI)"]);

check("the record comes off the standings, keyed by the same sparse id",
  [four.wins, four.losses, four.pointsFor, four.pointsAgainst],
  [2, 0, 240.5, 180.25]);

/* The league's own number for this week, stamped with its week so week
   one's figure is never served as an answer about week two. */
check("CBS's own projection rides along, keyed by Sleeper id",
  snap.projections, { week: 2, source: "cbs", points: { 4984: 24.4, 9493: 18.2 } });

check("a player whose game has kicked off is locked",
  snap.status.players["9493"].locked, true);
check("and one on IR carries the pipeline's own code",
  snap.status.players["2222"].inj, "IR");
check("a healthy player reads healthy, which is an answer rather than a gap",
  snap.status.players["4984"].inj, "");

check("nothing here publishes an in-progress score, so actuals is null",
  snap.actuals, null);
check("the schedule is not built in this pass and says so rather than guessing",
  snap.schedule, null);

check("the crosswalk ran", snap.crosswalkReady, true);
check("the league's shape rides on the snapshot",
  [snap.totalTeams, snap.week, snap.draftStatus],
  [12, 2, "complete"]);

/* ----------------------------------------------------------
   Every refusal, because each one renders as a league otherwise
   ---------------------------------------------------------- */

stubFetch("signedOut");
check("a private league is private, read off the BODY and not the 200",
  (await leagueSnapshot("sanctuaryfootballleague", "2026", null, resolve)).reason, "private");
check("and the lookup says the same",
  (await lookupLeague("sanctuaryfootballleague", "2026")).reason, "private");

stubFetch("offline");
check("an unreachable CBS is offline, not a league that is not there",
  (await leagueSnapshot("sanctuaryfootballleague", "2026", null, resolve)).reason, "offline");

stubFetch("ok");
check("a slug that could never be a host is refused before any request",
  (await leagueSnapshot("evil.com#", "2026", null, resolve)).reason, "not-found");
check("and nothing was fetched for it", urls.length, 0);

/* ----------------------------------------------------------
   The routes, through the real router
   ----------------------------------------------------------

   draft-room.js is an ordinary fetch handler and imports into Node, so its
   guards can be driven in process with no wrangler and no ports -- the same
   seam test-me-routes.mjs already uses.

   It imports standardwebhooks, which tests.yml installs nothing for, so
   this half SKIPS there and runs in deploy-worker.yml. It says so out loud
   rather than quietly reporting fewer assertions: a suite that has stopped
   checking is indistinguishable from one that passes. */

let worker = null;
try {
  worker = (await import("./draft-room.js")).default;
} catch (err) {
  console.log("--  the route half is SKIPPED: " + (err && err.message));
  console.log("    (it needs worker/node_modules; deploy-worker.yml installs them)");
}

if (worker) {
  const ORIGIN = "https://jukeff.com";
  const env = {};
  const ctx = { waitUntil() {} };
  const call = (path, init) => worker.fetch(
    new Request("https://w.dev" + path, Object.assign({ headers: { origin: ORIGIN } }, init)),
    env, ctx
  );

  let sawCookie = null;
  globalThis.fetch = async (u, init) => {
    const u2 = String(u);
    if (u2.includes("/state/nfl")) {
      return new Response(JSON.stringify({ season: "2026", week: 2 }), { status: 200 });
    }
    sawCookie = (init && init.headers && init.headers.cookie) || null;
    const key = Object.keys(BODIES).find((k) => u2.includes("/api/" + k));
    if (!key) return new Response(JSON.stringify({ body: {} }), { status: 200 });
    if (!sawCookie) return new Response("User not signed in", { status: 200 });
    return new Response(JSON.stringify({ body: BODIES[key] }), { status: 200 });
  };

  /* A verb a preflight does not name is a request that never leaves the
     page: no log line, no error at the worker, and a dialog that does
     nothing. The lesson PATCH on /me/leagues already cost once. */
  const pre = await call("/cbs/league", { method: "OPTIONS" });
  check("the lookup preflight names POST",
    pre.headers.get("access-control-allow-methods"), "GET, POST");
  check("and authorization with it, since that form needs an account",
    pre.headers.get("access-control-allow-headers"), "content-type, authorization");
  check("the snapshot preflight is GET only",
    (await call("/cbs/snapshot", { method: "OPTIONS" }))
      .headers.get("access-control-allow-methods"), "GET");

  /* The origin check runs before anything upstream is spent. CORS tells a
     browser whether it may READ a response and does nothing about the
     request being made. */
  const noOrigin = await worker.fetch(new Request("https://w.dev/cbs/snapshot?league=x"), env, ctx);
  check("a request with no Origin is refused", noOrigin.status, 403);
  const badOrigin = await worker.fetch(
    new Request("https://w.dev/cbs/snapshot?league=x", { headers: { origin: "https://evil.example" } }),
    env, ctx);
  check("and one from an origin that is not ours", badOrigin.status, 403);

  // The slug becomes a hostname, so it is refused before a URL is built.
  for (const bad of ["evil.com%23", "a.b", "", "x"]) {
    check("refused before any request is made: " + JSON.stringify(bad),
      (await call("/cbs/snapshot?league=" + bad)).status, 400);
  }

  check("a signed-out lookup answers private, which is the truth about CBS",
    (await (await call("/cbs/league?league=sanctuaryfootballleague")).json()).reason, "private");

  /* The POST carries a session somebody has just copied out of their own
     browser and answers whether it works. Left open, that is an oracle for
     testing stolen cookies on our origin and our IP. */
  sawCookie = null;
  const noAuth = await call("/cbs/league?league=sanctuaryfootballleague", {
    method: "POST", body: JSON.stringify({ pid: "abc" })
  });
  check("the POST refuses without an account", noAuth.status, 401);
  check("and nothing was sent to CBS for it", sawCookie, null);
}

console.log(failures ? "\n" + failures + " failed" : "\nall passed");
process.exit(failures ? 1 : 0);
