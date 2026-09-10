/* Sleeper's parse and join, against a stub — no network, no wrangler.

   `node worker/test-sleeper.mjs`

   ---- Why this is not a Playwright spec ----

   Everything sleeper.js does is take four upstream responses and turn them
   into one object. That work is pure once `fetch` has answered, so driving
   it through a browser, a page and a worker to reach it would be three
   layers of harness around a function call — and none of those layers can
   produce the inputs that matter here anyway. A real league cannot be
   asked to return a 500, a truncated body, a renamed field or forty-one
   rosters.

   The whole thing exists because verifying league connect against the
   owner's own real league proved the happy path and nothing else. That
   verification was worth doing and is not repeatable: the league is
   pre-draft today, will not be next month, and cannot be made to fail on
   demand.

   ---- The contract being tested ----

   Failure is a value, never a throw. An unreachable Sleeper, a changed
   response shape and a username that does not exist all answer null or an
   empty list, and a caller tells them apart by the shape it got back. Any
   assertion below that ends in a thrown error is that contract breaking,
   which is why every case is awaited rather than caught. */

import { createServer } from "node:http";
import {
  lookupUser, leagueSnapshot, nflState, SLEEPER_API, sleeperLinePoints, projectionPath,
} from "./sleeper.js";

let pass = 0;
const failures = [];

function ok(what, cond, detail) {
  if (cond) {
    pass += 1;
  } else {
    failures.push(what + (detail === undefined ? "" : " — " + JSON.stringify(detail)));
  }
}

function eq(what, got, want) {
  ok(what, JSON.stringify(got) === JSON.stringify(want), { got, want });
}

/* One stub, driven by a routing table the test swaps per case.

   Routes are exact paths to whole responses: `{ status, body }`, where a
   string body is sent verbatim (so a case can send something that is not
   JSON) and anything else is stringified. A path with no entry 404s, which
   is what Sleeper does for an unknown user. */
let ROUTES = {};
// Every path the stub is asked for, so a case can assert what was
// REQUESTED rather than only what came back.
let ASKED = [];

const server = createServer((req, res) => {
  const path = req.url;
  ASKED.push(path);
  const hit = ROUTES[path];
  if (!hit) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("");
    return;
  }
  res.writeHead(hit.status || 200, { "content-type": "application/json" });
  res.end(typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/v1";

const STATE = { week: 3, season: "2026", season_type: "regular" };

const LEAGUE = {
  league_id: "111222333444555666",
  name: "Juke Fantasy Football",
  season: "2026",
  total_rosters: 3,
  /* waiver_type 2 is Sleeper's FAAB. Without it a budget means nothing --
     Sleeper carries a default 100 on leagues that run an order, the same
     trap ESPN's acquisitionBudget sets. */
  /* `trade_deadline` is a WEEK number rather than an instant, which is the
     whole reason the snapshot carries both fields — ESPN publishes the other
     one. `disable_trades` is named explicitly for the same reason
     `waiver_type` is: a league that forbids trading still carries a
     deadline week, so reading the week alone counts a league down to a
     deadline it can never reach. */
  settings: {
    waiver_budget: 100, waiver_type: 2, waiver_clear_days: 2, playoff_teams: 6,
    trade_deadline: 11, disable_trades: 0,
  },
};

const USERS = [
  { user_id: "u1", display_name: "chase", metadata: { team_name: "Gibbs Ultimatum" }, avatar: "a1" },
  // No team_name: the account name is the documented fallback.
  { user_id: "u2", display_name: "sam", metadata: {} },
];

const ROSTERS = [
  {
    roster_id: 1,
    owner_id: "u1",
    settings: { wins: 2, losses: 1, ties: 0, fpts: 312, fpts_decimal: 45, fpts_against: 290, fpts_against_decimal: 8 },
    players: ["4046", "6794"],
    starters: ["4046"],
  },
  { roster_id: 2, owner_id: "u2", settings: { wins: 1, losses: 2 } },
  // Nobody has claimed this seat, which is the state every fresh league is
  // in and the one the owner's own league was in when this was verified.
  { roster_id: 3, owner_id: null, settings: {} },
];

const healthy = () => ({
  "/v1/state/nfl": { body: STATE },
  "/v1/league/111222333444555666": { body: LEAGUE },
  "/v1/league/111222333444555666/rosters": { body: ROSTERS },
  "/v1/league/111222333444555666/users": { body: USERS },
  "/v1/user/chase": { body: { user_id: "u1", username: "chase", display_name: "chase" } },
  "/v1/user/u1/leagues/nfl/2026": {
    body: [{ league_id: "111222333444555666", name: "Juke Fantasy Football", season: "2026", total_rosters: 3 }],
  },
});

/* ---------- the shape a healthy league produces ---------- */

ROUTES = healthy();
{
  const s = await leagueSnapshot("111222333444555666", BASE);
  ok("a healthy league answers", !!s);
  eq("league name", s.name, "Juke Fantasy Football");
  eq("team count comes from the league, not the roster array", s.totalTeams, 3);
  eq("week is read off state", s.week, 3);
  eq("waiver budget", s.waiverBudget, 100);
  eq("and it is a FAAB league", s.waiver.type, "faab");
  eq("with its waiver period in hours", s.waiver.hours, 48);
  eq("playoff teams", s.playoffTeams, 6);
  eq("the trade deadline is a week here", s.tradeDeadline.week, 11);
  /* Sleeper publishes no instant, and it is absent rather than derived: a
     week becomes a date only with the table saying when each week starts,
     which neither adapter has. */
  eq("and no instant, which Sleeper does not publish", s.tradeDeadline.at, null);
  eq("and trading is on", s.tradeDeadline.disabled, false);
  eq("every roster becomes a team", s.teams.length, 3);

  const [t1, t2, t3] = s.teams;
  eq("a typed team name wins", t1.teamName, "Gibbs Ultimatum");
  eq("the manager is kept beside it", t1.manager, "chase");
  eq("an untyped team falls back to the account name", t2.teamName, "sam");
  // The League Room only prints the manager when it differs from the team
  // name, so this pair is what stops it printing "sam" twice.
  eq("and then the two are equal on purpose", t2.manager, "sam");
  eq("an unclaimed seat says so", t3.teamName, "Unclaimed");
  eq("an unclaimed seat has no owner", t3.ownerId, null);
  eq("an unclaimed seat has no manager", t3.manager, null);

  // Sleeper splits points across two fields; 312 + 45/100.
  eq("points for join whole and decimal", t1.pointsFor, 312.45);
  eq("points against join too", t1.pointsAgainst, 290.08);
  eq("a roster with no points scores zero rather than NaN", t2.pointsFor, 0);
  eq("missing ties read zero", t2.ties, 0);

  eq("player ids survive as strings", t1.players, ["4046", "6794"]);
  eq("starters survive as strings", t1.starters, ["4046"]);
  eq("a roster with no players is an empty list, not undefined", t3.players, []);
}

/* ---------- the ways it is allowed to say no ---------- */

{
  ROUTES = healthy();
  const s = await leagueSnapshot("999999999999999999", BASE);
  eq("an unknown league is null, not an empty table", s, null);
}

{
  // Sleeper answers a valid `null` body for a league that does not exist,
  // which is a 200 and parses fine — so this is not the same case as above.
  ROUTES = { ...healthy(), "/v1/league/111222333444555666": { body: "null" } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("a league that answers literal null is null", s, null);
}

{
  ROUTES = { ...healthy(), "/v1/league/111222333444555666": { status: 500, body: "boom" } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("a 500 on the league is null rather than a throw", s, null);
}

{
  ROUTES = { ...healthy(), "/v1/league/111222333444555666": { body: '{"league_id": ' } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("a truncated body is null rather than a throw", s, null);
}

{
  // The docstring promises this one explicitly: a missing rosters array is
  // survivable and the table draws nothing, where a missing LEAGUE is not.
  ROUTES = { ...healthy(), "/v1/league/111222333444555666/rosters": { status: 500, body: "" } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  ok("a league with unreadable rosters still answers", !!s);
  eq("and has no teams rather than failing", s.teams.length, 0);
  eq("falling back to the roster count for totalTeams", s.totalTeams, 3);
}

{
  ROUTES = { ...healthy(), "/v1/league/111222333444555666/users": { body: "null" } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("with no users, every seat reads unclaimed", s.teams.map((t) => t.teamName), [
    "Unclaimed",
    "Unclaimed",
    "Unclaimed",
  ]);
}

{
  ROUTES = { ...healthy(), "/v1/state/nfl": { status: 503, body: "" } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  ok("an unreachable state does not take the league with it", !!s);
  eq("the week is withheld rather than guessed", s.week, null);
  eq("and so is the season type", s.seasonType, null);
}

{
  // MAX_ROSTERS. A league with more of these than a real league has is a
  // malformed response, and rendering 500 rows of it is worse than 32.
  const many = Array.from({ length: 41 }, (_, i) => ({ roster_id: i + 1, settings: {} }));
  ROUTES = { ...healthy(), "/v1/league/111222333444555666/rosters": { body: many } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("an absurd roster count is capped", s.teams.length, 32);
}

{
  ROUTES = { ...healthy(), "/v1/league/111222333444555666/rosters": { body: { not: "an array" } } };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("a rosters object rather than an array is no teams, not a throw", s.teams.length, 0);
}

/* ---------- a name is somebody else's text ---------- */

{
  /* sleeper.js does not render, so what it owes is that hostile text
     survives as TEXT — unchanged, still a string, and not able to break
     the parse on the way through. Escaping is the page's job and is
     already asserted where the page does it; what would be wrong here is
     this file silently dropping the field, or coercing it to something a
     component then treats as safe. */
  const nasty = '<img src=x onerror=alert(1)>';
  ROUTES = {
    ...healthy(),
    "/v1/league/111222333444555666/users": {
      body: [{ user_id: "u1", display_name: nasty, metadata: { team_name: nasty } }],
    },
  };
  const s = await leagueSnapshot("111222333444555666", BASE);
  eq("a hostile team name arrives intact and inert", s.teams[0].teamName, nasty);
  ok("and is still a string", typeof s.teams[0].teamName === "string");
}

{
  // Numbers where numbers are expected, whatever arrives. A string here
  // would reach `.toFixed()` in the standings table.
  ROUTES = {
    ...healthy(),
    "/v1/league/111222333444555666/rosters": {
      body: [{ roster_id: "1", owner_id: "u1", settings: { wins: "2", fpts: "312", fpts_decimal: "45" } }],
    },
  };
  const s = await leagueSnapshot("111222333444555666", BASE);
  ok("a stringified roster id becomes a number", typeof s.teams[0].rosterId === "number");
  ok("stringified wins become a number", typeof s.teams[0].wins === "number");
  ok("stringified points become a number", typeof s.teams[0].pointsFor === "number");
  eq("and the join still adds up", s.teams[0].pointsFor, 312.45);
}

/* ---------- the username lookup ---------- */

{
  ROUTES = healthy();
  const r = await lookupUser("chase", "2026", BASE);
  eq("a real username resolves", r.user, { userId: "u1", name: "chase" });
  eq("and carries its leagues", r.leagues.length, 1);
  eq("with only the fields the picker draws", Object.keys(r.leagues[0]).sort(), [
    "avatar",
    "leagueId",
    "name",
    "season",
    "totalTeams",
  ]);
}

{
  ROUTES = healthy();
  const r = await lookupUser("nobody", "2026", BASE);
  eq("an unknown username has no user", r.user, null);
  eq("and no leagues", r.leagues, []);
}

{
  ROUTES = { ...healthy(), "/v1/user/chase": { status: 500, body: "" } };
  const r = await lookupUser("chase", "2026", BASE);
  /* Deliberately the SAME shape as an unknown username. The screen says
     "we could not find that username" either way, and this file guessing
     which it was would produce a worse message than the honest one. */
  eq("an unreachable Sleeper looks like an unknown user, by design", r.user, null);
}

{
  ROUTES = { ...healthy(), "/v1/user/u1/leagues/nfl/2026": { body: "null" } };
  const r = await lookupUser("chase", "2026", BASE);
  ok("a real user with no leagues still resolves", !!r.user);
  eq("and answers an empty list rather than null", r.leagues, []);
}

{
  ROUTES = { ...healthy(), "/v1/user/u1/leagues/nfl/2026": { body: { not: "an array" } } };
  const r = await lookupUser("chase", "2026", BASE);
  eq("a non-array league list is empty rather than a throw", r.leagues, []);
}

{
  /* The username is interpolated into an upstream path, and
     encodeURIComponent is what makes that safe.

     Asserted on the path the stub was ASKED for, not on the answer. The
     first version of this checked that a path-shaped username resolves to
     no user, and that passed with the encoding removed — unencoded,
     `/user/a/../state/nfl` normalises to `/state/nfl`, whose body has no
     `user_id`, so the function answers null either way. A mutation that
     passes is not a test; this one is confirmed against `encodeURIComponent`
     taken out. */
  ROUTES = healthy();
  ASKED = [];
  await lookupUser("a/../state/nfl", "2026", BASE);
  ok(
    "a path-shaped username is encoded rather than followed",
    ASKED.includes("/v1/user/a%2F..%2Fstate%2Fnfl") && !ASKED.includes("/v1/state/nfl"),
    ASKED,
  );
}

{
  /* Same for the league id, which reaches several paths rather than one.

     Asserted as "no raw traversal reaches upstream" rather than as a count
     of encoded paths. The count version pinned this to however many calls
     leagueSnapshot() happened to make, and went red the day a fifth was
     added for the draft time — reporting an encoding failure when the
     encoding was perfect. The property is what matters and it does not
     move when a call is added: whatever this asks for, none of it may be
     the id spliced in raw. */
  ROUTES = healthy();
  ASKED = [];
  await leagueSnapshot("a/../state/nfl", BASE);
  ok(
    "a path-shaped league id never reaches upstream unencoded",
    /* Every /league/ path must CARRY the encoded id. Not "no path contains
       a/../", which was tried and is vacuous: the URL constructor resolves
       the traversal before the path is ever recorded, so a raw splice comes
       out as `/v1/league/state/nfl/drafts` — carrying neither the traversal
       nor the encoding, and passing any check that looks for the former.

       Stated over the whole /league/ family rather than as a count, so a
       sixth upstream call is covered the day it is added rather than
       breaking this the way the fifth one did. */
    ASKED.filter((p) => p.startsWith("/v1/league/")).length >= 4 &&
      ASKED.filter((p) => p.startsWith("/v1/league/"))
           .every((p) => p.includes("a%2F..%2Fstate%2Fnfl")),
    ASKED,
  );
}

/* ---------- the league's own projection, and the week's live status ----------

   Measured against a real league before any of this was written: Sleeper's
   matchup screen prints a starter's projection as his weekly projected line
   times the league's scoring_settings, key for key, and nine starters summed
   that way came to 125.47 -- the number on Sleeper's own screen. So the
   arithmetic is pinned here on hand-computable lines. */

{
  const SCORING = { rec: 1, rec_yd: 0.1, rec_td: 6, bonus_rec_wr: 0.5, pass_yd: 0.04 };
  eq("a line is its stats times the league's own rates",
    sleeperLinePoints({ rec: 5, rec_yd: 60, rec_td: 0.5 }, SCORING), 14);
  eq("including a rule Juke has no name for",
    sleeperLinePoints({ rec: 4, bonus_rec_wr: 4 }, SCORING), 6);
  eq("and ignoring what the league does not score",
    sleeperLinePoints({ rec: 1, pts_ppr: 20, adp_dd_ppr: 12 }, SCORING), 1);
  eq("a row with nothing scoreable in it is zero, the platform's own answer",
    sleeperLinePoints({ adp_dd_ppr: 1000 }, SCORING), 0);
  eq("no stats at all is not an answer", sleeperLinePoints(null, SCORING), null);
  eq("four decimals, not two",
    sleeperLinePoints({ pass_yd: 263.37 }, SCORING), 10.5348);
}

{
  const SCORING = { rec: 1, rec_yd: 0.1, pass_yd: 0.04, pass_td: 4 };
  const league = { ...LEAGUE, scoring_settings: SCORING };
  const FEED = [
    // Rostered, questionable, his club's game not yet started.
    { player_id: "4046", team: "KC", stats: { pass_yd: 250, pass_td: 2 },
      player: { injury_status: "Questionable", team: "KC" } },
    // Rostered, ruled out, and his club's game is already under way.
    { player_id: "6794", team: "MIN", stats: { adp_dd_ppr: 999 },
      player: { injury_status: "Out", team: "MIN" } },
    // Not on any roster in this league: must not ride on the snapshot.
    { player_id: "9999", team: "DET", stats: { rec: 9 },
      player: { injury_status: null, team: "DET" } },
  ];
  const SCHEDULE = [
    { week: 3, status: "pre_game", home: "KC", away: "LV" },
    { week: 3, status: "in_game", home: "MIN", away: "GB" },
    // A finished game in ANOTHER week locks nobody this week.
    { week: 2, status: "complete", home: "KC", away: "DEN" },
  ];
  const routes = () => ({
    ...healthy(),
    "/v1/league/111222333444555666": { body: league },
    [projectionPath("2026", 3)]: { body: FEED },
    "/schedule/nfl/regular/2026": { body: SCHEDULE },
  });

  ROUTES = routes();
  ASKED = [];
  const s = await leagueSnapshot("111222333444555666", BASE);
  ok("the projection file is asked for this week, regular season, off /v1",
    ASKED.some((p) => p.startsWith("/projections/nfl/2026/3?season_type=regular")), ASKED);
  eq("the league's own projection, stamped with its week",
    { week: s.projections.week, source: s.projections.source }, { week: 3, source: "sleeper" });
  eq("a rostered player scores his line under the league's table", s.projections.points["4046"], 18);
  eq("a ruled-out player's empty line is zero, not missing", s.projections.points["6794"], 0);
  ok("a player on nobody's roster does not ride along", !("9999" in s.projections.points));

  eq("status carries Sleeper's designation in the pipeline's codes",
    s.status.players["4046"], { locked: false, inj: "Q" });
  eq("and a game under way locks its players", s.status.players["6794"], { locked: true, inj: "O" });
  ok("status is stamped with when it was read", typeof s.status.at === "number" && s.status.week === 3);

  // A healthy player is "" -- a real answer -- and an unreadable word leaves
  // the board's value alone rather than pretending to know.
  ROUTES = { ...routes(), [projectionPath("2026", 3)]: { body: [
    { player_id: "4046", team: "KC", stats: { pass_yd: 250 }, player: { injury_status: null } },
    { player_id: "6794", team: "MIN", stats: { rec: 3 }, player: { injury_status: "NA" } },
  ] } };
  const h = await leagueSnapshot("111222333444555666", BASE);
  eq("no designation on a row Sleeper sent is healthy", h.status.players["4046"], { locked: false, inj: "" });
  eq("a designation the vocabulary cannot read is left out", h.status.players["6794"], { locked: true });

  // A file served before Sleeper has filled the week in: rows with nothing
  // scoreable, for everybody. Zero for the whole lineup is not an answer.
  ROUTES = { ...routes(), [projectionPath("2026", 3)]: { body: [
    { player_id: "4046", stats: { adp_dd_ppr: 1 }, player: {} },
  ] } };
  const empty = await leagueSnapshot("111222333444555666", BASE);
  eq("a week with no projected line at all publishes no projection", empty.projections, null);
  ok("but the status it did read still rides", !!empty.status);

  // Either feed failing is a value like everything else in this file.
  ROUTES = { ...routes(), [projectionPath("2026", 3)]: { status: 500, body: "" } };
  const down = await leagueSnapshot("111222333444555666", BASE);
  ok("an unreachable projection file still answers the league", !!down && down.name === "Juke Fantasy Football");
  eq("with no projection", down.projections, null);
  eq("and no status", down.status, null);

  ROUTES = { ...routes(), "/schedule/nfl/regular/2026": { status: 500, body: "" } };
  const noSched = await leagueSnapshot("111222333444555666", BASE);
  eq("no schedule locks nobody, and the designations still ride",
    noSched.status.players["6794"], { locked: false, inj: "O" });

  // Outside the regular season there is no regular-season week to project.
  ROUTES = { ...routes(), "/v1/state/nfl": { body: { ...STATE, season_type: "pre" } } };
  ASKED = [];
  const pre = await leagueSnapshot("111222333444555666", BASE);
  ok("a preseason week does not ask for a projection",
    !ASKED.some((p) => p.startsWith("/projections/")), ASKED);
  eq("and publishes none", pre.projections, null);
}

/* ---------- the seam itself ---------- */

{
  ROUTES = healthy();
  const s = await nflState(BASE);
  eq("nflState reads through the base it is given", s.week, 3);
  ok("and the default is the real API", SLEEPER_API === "https://api.sleeper.app/v1");
}

server.close();

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
