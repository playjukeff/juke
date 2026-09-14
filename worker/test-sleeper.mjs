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
  leagueMatchups, sleeperSeasonShape, sleeperCurrentWeek,
} from "./sleeper.js";

let pass = 0;
const failures = [];
let skipped = null;

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

/* ---------- one week's matchups (/sleeper/matchups) ----------

   Fixtures shaped from the real endpoint, read 11 September 2026 off two
   public twelve-team leagues: a finished 2025 one (every week played,
   playoff_week_start 15, six seeds) and an in-season 2026 one (week 1 in
   progress, week 2 onward paired at 0.0, week 15 paired before any seed
   exists). Trimmed to four rosters; every field name and every value shape
   is the endpoint's own. */

{
  const LG = "999999999999999999";
  const league = (over) => ({
    league_id: LG, name: "Matchup League", season: "2026", status: "in_season", total_rosters: 4,
    settings: { playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 0 },
    ...(over || {}),
  });
  const row = (rid, mid, pts, starters, sp, pp) => ({
    roster_id: rid, matchup_id: mid, points: pts, custom_points: null,
    starters, starters_points: sp, players_points: pp,
  });
  // A played week: two games, real points on every row.
  const PLAYED = [
    row(1, 1, 101.92, ["4046", "9221", "0"], [23.2, 11.3, 0], { "4046": 23.2, "9221": 11.3, "7564": 4.5 }),
    row(2, 2, 103.08, ["6794", "8183"], [30.1, 12.0], { "6794": 30.1, "8183": 12.0 }),
    row(3, 1, 89.92, ["5892", "6813"], [9.2, 11.6], { "5892": 9.2, "6813": 11.6, "4035": 2.1 }),
    row(4, 2, 129.58, ["6904", "4984"], [22.9, 18.0], { "6904": 22.9, "4984": 18.0 }),
  ];
  // Not yet played: already paired, every number 0.0 -- which is not a score.
  const UNPLAYED = PLAYED.map((r) => ({
    ...r, points: 0, starters_points: r.starters.map(() => 0),
    players_points: Object.fromEntries(Object.keys(r.players_points).map((k) => [k, 0])),
  }));
  const routes = (week, rows, state, lg) => ({
    "/v1/state/nfl": { body: state || { week: 5, season: "2026", season_type: "regular" } },
    ["/v1/league/" + LG]: { body: lg || league() },
    ["/v1/league/" + LG + "/matchups/" + week]: { body: rows },
  });

  eq("the season's shape is read off the league and derived for the playoffs",
    sleeperSeasonShape({ playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 0 }),
    { regularSeasonWeeks: 14, weeks: 17 });
  eq("a two-week final adds one week", sleeperSeasonShape({ playoff_week_start: 15, playoff_teams: 6, playoff_round_type: 1 }).weeks, 18);
  eq("two weeks a round doubles the rounds", sleeperSeasonShape({ playoff_week_start: 14, playoff_teams: 4, playoff_round_type: 2 }).weeks, 17);
  eq("no playoff start is no shape, rather than a guessed one",
    sleeperSeasonShape({}), { regularSeasonWeeks: null, weeks: null });

  eq("a finished league has no current week", sleeperCurrentWeek(league({ status: "complete" }), { week: 1, season: "2026" }), Infinity);
  eq("last season's league is over", sleeperCurrentWeek(league({ season: "2025" }), { week: 1, season: "2026", season_type: "regular" }), Infinity);
  eq("the preseason has not started", sleeperCurrentWeek(league(), { week: 0, season: "2026", season_type: "pre" }), 0);
  eq("in season it is Sleeper's own week", sleeperCurrentWeek(league(), { week: 5, season: "2026", season_type: "regular" }), 5);

  ROUTES = routes(3, PLAYED);
  ASKED = [];
  const past = await leagueMatchups(LG, 3, BASE);
  ok("a played week answers", past && past.view && !past.reason, past);
  const pv = past.view;
  eq("a week before the current one is final", pv.phase, "final");
  eq("two pairs make two games", pv.games.length, 2);
  eq("paired by matchup_id, each side keyed by roster",
    pv.games.map((g) => g.teams.map((t) => t.rosterId)), [[1, 3], [2, 4]]);
  eq("a side's points are Sleeper's own", pv.games[0].teams[0].points, 101.92);
  eq("starters keep their slot order and their own points",
    pv.games[0].teams[0].starters.slice(0, 2), [{ id: "4046", points: 23.2 }, { id: "9221", points: 11.3 }]);
  eq("an empty slot stays a row with no player", pv.games[0].teams[0].starters[2], { id: null, points: null });
  eq("the bench is everybody else who scored", pv.games[0].teams[0].bench, [{ id: "7564", points: 4.5 }]);
  eq("regular season", pv.playoff, false);
  eq("and the shape rides along", [pv.regularSeasonWeeks, pv.weeks], [14, 17]);
  ok("the week is asked for by its own path", ASKED.some((p) => p === "/v1/league/" + LG + "/matchups/3"), ASKED);

  ROUTES = routes(7, UNPLAYED);
  const next = (await leagueMatchups(LG, 7, BASE)).view;
  eq("a week after the current one is upcoming", next.phase, "upcoming");
  eq("and is still paired", next.games.length, 2);
  eq("but its 0.0 is not a score", next.games[0].teams[0].points, null);
  ok("on any starter either", next.games[0].teams[0].starters.every((s) => s.points === null), next.games[0].teams[0].starters);

  ROUTES = routes(5, PLAYED);
  const now = (await leagueMatchups(LG, 5, BASE)).view;
  eq("the current week is live, never final", now.phase, "live");
  eq("and its partial points are published as they stand", now.games[0].teams[0].points, 101.92);

  // Week 15 paired before any seed exists -- the in-season league does this.
  ROUTES = routes(15, UNPLAYED);
  const po = (await leagueMatchups(LG, 15, BASE)).view;
  eq("a playoff week is flagged", po.playoff, true);
  eq("an upcoming playoff week says the bracket is not set", po.bracketPending, true);
  eq("and offers no opponent Sleeper has not decided", po.games.length, 0);

  // A played playoff week: two rosters with matchup_id null (bye / out).
  const PLAYOFF = [PLAYED[0], PLAYED[2], { ...PLAYED[1], matchup_id: null }, { ...PLAYED[3], matchup_id: null }];
  ROUTES = routes(15, PLAYOFF, { week: 1, season: "2027", season_type: "regular" }, league({ status: "complete" }));
  const done = (await leagueMatchups(LG, 15, BASE)).view;
  eq("a played playoff week is final once the league is over", done.phase, "final");
  eq("its games are the paired rosters", done.games.map((g) => g.matchupId), [1]);
  eq("and the rest are named as having no game", done.noGame, [2, 4]);
  eq("a finished league reports no current week", [done.currentWeek, done.seasonOver], [null, true]);

  // A lone roster on a matchup_id is not a game (and not silently one side).
  ROUTES = routes(3, [PLAYED[0], PLAYED[1], PLAYED[3]]);
  const odd = (await leagueMatchups(LG, 3, BASE)).view;
  eq("a pair of one is not a game", odd.games.map((g) => g.matchupId), [2]);
  eq("its roster has no game", odd.noGame, [1]);

  ROUTES = routes(2, []);
  const empty = (await leagueMatchups(LG, 2, BASE)).view;
  eq("an empty week is an answer: no pairings yet", [empty.games.length, empty.noGame.length], [0, 0]);

  ROUTES = { ...routes(3, PLAYED), ["/v1/league/" + LG + "/matchups/3"]: { status: 500, body: "" } };
  eq("a week Sleeper failed to answer is upstream, not an empty week",
    await leagueMatchups(LG, 3, BASE), { view: null, reason: "upstream" });
  ROUTES = { "/v1/state/nfl": { body: STATE } };
  eq("an unknown league is not-found", (await leagueMatchups(LG, 3, BASE)).reason, "not-found");
  ASKED = [];
  eq("a week that cannot exist is refused", (await leagueMatchups(LG, 40, BASE)).reason, "bad-request");
  eq("before any fetch", ASKED.length, 0);

  /* ---- the route, through the real router ----

     draft-room.js imports into Node (test-me-routes.mjs relies on it), so
     the real handler runs here with `caches.default` stubbed as a Map. */
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => { const hit = store.get(req.url); return hit ? new Response(hit) : undefined; },
    put: async (req, res) => { store.set(req.url, await res.text()); },
  } };
  /* draft-room.js imports `standardwebhooks`, and tests.yml installs
     nothing on purpose -- every step in that workflow is dependency-free.
     So the router half runs where the dependency is: deploy-worker.yml
     runs this same file after `npm ci --prefix worker`. Here it says out
     loud that it did not run, rather than passing quietly on checks
     nobody made. */
  let worker = null;
  try { worker = (await import("./draft-room.js")).default; }
  catch (e) {
    if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
    skipped = "the route through the real router -- worker deps are not installed here; deploy-worker.yml runs it";
  }
  if (worker) {
  const call = (qs, origin = "https://jukeff.com", method = "GET") => worker.fetch(
    new Request("https://w.example/sleeper/matchups" + qs, { method, headers: origin ? { Origin: origin } : {} }),
    { SLEEPER_BASE: BASE }, { waitUntil() {} });

  ROUTES = routes(3, PLAYED);
  ASKED = [];
  const refused = await call("?league=" + LG + "&week=3", "https://evil.example");
  eq("a foreign origin is refused", refused.status, 403);
  eq("before anything is asked of Sleeper", ASKED.length, 0);
  eq("with no Origin at all too", (await call("?league=" + LG + "&week=3", null)).status, 403);
  eq("a malformed league id is a 400", (await call("?league=abc&week=3")).status, 400);
  eq("so is a missing week", (await call("?league=" + LG)).status, 400);

  const res = await call("?league=" + LG + "&week=3");
  eq("a played week answers 200", res.status, 200);
  eq("with the page's CORS", res.headers.get("access-control-allow-origin"), "https://jukeff.com");
  const body = await res.json();
  eq("and the week's view", [body.week, body.phase, body.games.length], [3, "final", 2]);
  ASKED = [];
  const again = await call("?league=" + LG + "&week=3");
  eq("a second ask inside the window is the cache", ASKED.length, 0);
  eq("and still carries CORS, put back per request", again.headers.get("access-control-allow-origin"), "https://jukeff.com");

  ROUTES = { ...routes(4, PLAYED), ["/v1/league/" + LG + "/matchups/4"]: { status: 500, body: "" } };
  eq("an upstream failure is a 503", (await call("?league=" + LG + "&week=4")).status, 503);
  ROUTES = routes(4, PLAYED);
  ASKED = [];
  eq("and was not cached: the next ask reaches Sleeper", (await call("?league=" + LG + "&week=4")).status, 200);
  ok("(it did)", ASKED.some((p) => p.endsWith("/matchups/4")), ASKED);

  ROUTES = { "/v1/state/nfl": { body: STATE } };
  eq("an unknown league is a 404 the page can read", (await call("?league=123456789012&week=3")).status, 404);

  const pre = await call("?league=" + LG + "&week=3", "https://jukeff.com", "OPTIONS");
  eq("the preflight names GET", pre.headers.get("access-control-allow-methods"), "GET");
  }
}

/* ---------- the seam itself ---------- */

{
  ROUTES = healthy();
  const s = await nflState(BASE);
  eq("nflState reads through the base it is given", s.week, 3);
  ok("and the default is the real API", SLEEPER_API === "https://api.sleeper.app/v1");
}

server.close();

if (skipped) console.log("\nSKIPPED: " + skipped);
console.log(`\n${pass} passed, ${failures.length} failed${skipped ? ", 1 section skipped" : ""}`);
if (failures.length) {
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
