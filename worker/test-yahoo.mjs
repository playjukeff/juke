/* The Yahoo adapter and its routes, without Yahoo.
 *
 *   npm ci --prefix worker
 *   node worker/test-yahoo.mjs
 *
 * No network. Needs Node 22.13 or newer, for `node:sqlite`.
 *
 * ---- Two halves ----
 *
 * The ADAPTER half drives yahoo.js with a fake `call()` answering canned
 * payloads in Yahoo's published response format: resources as arrays of
 * single-key objects with empty arrays between them, collections as
 * numbered objects with a count. Every awkward case worth a line is in one
 * small league -- a roster listed out of lineup order, a flex, a superflex,
 * two interception categories that differ by one letter, a sack category
 * that is a quarterback being sacked, a manager Yahoo has hidden, a club
 * spelled `Jac`, one game listed twice from both sides.
 *
 * **What this deliberately does NOT establish is that Yahoo answers in
 * this shape.** Nothing offline can, and nothing here has been checked
 * against a real league yet -- see yahoo.js's header. That is why the
 * platform stays locked in leaguePlatforms.js until it has been.
 *
 * The ROUTE half is the part that can be proved completely offline, and
 * it is the half with the security in it: the consent `state` binding a
 * code to the account that asked for it, the token sealed before anything
 * is read with it, a refresh on a 401, and disconnecting the last Yahoo
 * league deleting the grant. It runs the real router, the real
 * requireUser(), the real credentials.js and the real store.js SQL --
 * against a real SQLite database built from worker/migrations, with D1's
 * foreign keys switched on, because the users-row foreign key is a failure
 * this project has already shipped once and a stub would have hidden it.
 * Only Yahoo itself is faked: an OAuth token endpoint that checks the
 * client's Basic auth and a Fantasy API that checks the bearer token.
 */

import { generateKeyPairSync, createSign, createPublicKey, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  flat, members, child, yahooLeagueKey, yahooKey, yahooInjury, draftInfoFromYahoo,
  waiverFromYahoo, tradeDeadlineFromYahoo, listLeagues, lookupLeague, leagueSnapshot,
  signState, stateIsFor, authorizeUrl, reasonFor,
} from "./yahoo.js";
import { rulesFromYahoo } from "./scoring.js";
import { lineupFromYahoo, yahooSeatRank } from "./lineup.js";
import { scheduleFromYahoo } from "./matchups.js";
import { openCredential } from "./credentials.js";
import { normalise } from "./names.js";
import worker from "./draft-room.js";

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

/* ==========================================================
   The fixture: one league, two teams
   ========================================================== */

const LEAGUE_KEY = "461.l.777";

/* A player resource exactly as Yahoo nests one: metadata as an array of
   single-key objects with empty arrays scattered through it, then the
   selected position as a second element. */
function P(id, full, pos, abbr, seat, extra = []) {
  const [first, ...rest] = full.split(" ");
  return {
    player: [
      [
        { player_key: "461.p." + id }, { player_id: String(id) },
        { name: { full, first, last: rest.join(" "), ascii_first: first, ascii_last: rest.join(" ") } },
        [], { editorial_team_abbr: abbr }, { bye_weeks: { week: "8" } },
        { display_position: pos }, [], { position_type: pos === "K" ? "K" : pos === "DEF" ? "DT" : "O" },
        { primary_position: pos.split(",")[0] }, { eligible_positions: [{ position: pos.split(",")[0] }] },
        ...extra,
      ],
      { selected_position: [{ coverage_type: "week" }, { week: "3" }, { position: seat }, { is_flex: 0 }] },
    ],
  };
}

/* Team 1, listed OUT of lineup order on purpose: the receiver comes back
   first and the quarterback second, and the starters must still read as a
   lineup. Every case worth a line is here:

     Puka Nacua         WR, starting
     Josh Allen         QB, starting
     Bijan Robinson     RB, starting, questionable
     Kenneth Walker III RB in the W/R/T flex -- a suffix the pool drops
     Bo Nix             QB in the Q/W/R/T superflex
     Detroit            the defence, joined on its club and never its name
     Brandon Aubrey     K, starting
     Bench Receiver     BN
     Hurt Guy           TE on IR, status IR
     Kenny Gainwell     a name the pool spells differently -- unresolvable */
const ROSTER_1 = [
  P(1, "Puka Nacua", "WR", "LAR", "WR"),
  P(2, "Josh Allen", "QB", "Buf", "QB"),
  P(3, "Bijan Robinson", "RB", "Atl", "RB", [{ status: "Q" }, { status_full: "Questionable" }]),
  P(4, "Kenneth Walker III", "RB", "Sea", "W/R/T"),
  P(5, "Bo Nix", "QB", "Den", "Q/W/R/T"),
  P(6, "Detroit", "DEF", "Det", "DEF"),
  P(7, "Brandon Aubrey", "K", "Dal", "K"),
  P(8, "Bench Receiver", "WR", "LAR", "BN"),
  P(9, "Hurt Guy", "TE", "KC", "IR", [{ status: "IR" }]),
  P(10, "Kenny Gainwell", "RB", "Phi", "BN"),
];

const ROSTER_2 = [
  P(11, "Jahmyr Gibbs", "RB", "Det", "RB"),
  P(12, "Jacksonville", "DEF", "Jac", "DEF"),
];

const POOL = {
  "Puka Nacua|WR": "9493", "Josh Allen|QB": "4984", "Bijan Robinson|RB": "9509",
  "Kenneth Walker|RB": "8151", "Bo Nix|QB": "11563", "Brandon Aubrey|K": "10937",
  "Bench Receiver|WR": "1111", "Hurt Guy|TE": "2222", "Jahmyr Gibbs|RB": "9221",
};
const POOL_KEYED = new Map(Object.entries(POOL).map(([k, v]) => {
  const [name, pos] = k.split("|");
  return [normalise(name) + "|" + pos, v];
}));
/* The resolver resolveSleeperIds() is: given names, a Map keyed
   normalise(name)|pos. The stub keys through the real normalise(), so a
   suffix Yahoo carries and the pool drops ("Kenneth Walker III") resolves
   exactly as it would against D1. */
const resolve = async (wanted) => {
  const out = new Map();
  for (const w of wanted) {
    const k = normalise(w.name) + "|" + w.pos;
    if (POOL_KEYED.has(k)) out.set(k, POOL_KEYED.get(k));
  }
  return out;
};

function team(id, name, extra = [], subs = []) {
  return {
    team: [
      [
        { team_key: LEAGUE_KEY + ".t." + id }, { team_id: String(id) }, { name }, [],
        { team_logos: [{ team_logo: { size: "large", url: "https://logo.test/" + id + ".png" } }] },
        [], { waiver_priority: id }, { faab_balance: String(100 - id * 10) },
        { managers: [{ manager: { manager_id: String(id), nickname: id === 2 ? "--hidden--" : "Chase", guid: "G" + id } }] },
        ...extra,
      ],
      ...subs,
    ],
  };
}

const META = {
  league_key: LEAGUE_KEY, league_id: "777", name: "Dynasty Degens", num_teams: 2,
  draft_status: "postdraft", current_week: 3, start_week: "1", end_week: "17", season: "2026",
};

const standings = {
  fantasy_content: {
    "xml:lang": "en-US",
    league: [
      META,
      { standings: [{ teams: {
        "0": team(1, "Chase's Team", [{ is_owned_by_current_login: 1 }], [
          { team_points: { coverage_type: "season", total: "301.20" } },
          { team_standings: { rank: 1, outcome_totals: { wins: 2, losses: 0, ties: "0", percentage: "1.000" }, points_for: "301.20", points_against: 250.5 } },
        ]),
        "1": team(2, "Rival", [], [
          { team_standings: { rank: 2, outcome_totals: { wins: "0", losses: "2", ties: 0 }, points_for: "250.50", points_against: "301.2" } },
        ]),
        count: 2,
      } }] },
    ],
  },
};

const stat = (stat_id, name, position_type, extra = {}) => ({ stat: Object.assign({ stat_id, enabled: "1", name, display_name: name, position_type }, extra) });
const mod = (stat_id, value, extra = {}) => ({ stat: Object.assign({ stat_id, value: String(value) }, extra) });

const SETTINGS = {
  draft_type: "live", uses_faab: "1", waiver_type: "R", waiver_time: 2,
  draft_time: "1756000000", trade_end_date: "2026-11-21", num_playoff_teams: "6",
  roster_positions: [
    { roster_position: { position: "QB", position_type: "O", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "WR", position_type: "O", count: "2", is_starting_position: 1 } },
    { roster_position: { position: "RB", position_type: "O", count: 2, is_starting_position: 1 } },
    { roster_position: { position: "TE", position_type: "O", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "W/R/T", position_type: "O", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "Q/W/R/T", position_type: "O", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "K", position_type: "K", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "DEF", position_type: "DT", count: 1, is_starting_position: 1 } },
    { roster_position: { position: "BN", count: 6, is_starting_position: 0 } },
    { roster_position: { position: "IR", count: 1, is_starting_position: 0 } },
  ],
  stat_categories: { stats: [
    stat(1, "Passing Attempts", "O"),
    stat(4, "Passing Yards", "O"), stat(5, "Passing Touchdowns", "O"),
    stat(6, "Interceptions", "O"), stat(7, "Sacks", "O"),
    stat(9, "Rushing Yards", "O"), stat(10, "Rushing Touchdowns", "O"),
    stat(11, "Receptions", "O"), stat(12, "Receiving Yards", "O"), stat(13, "Receiving Touchdowns", "O"),
    stat(15, "Return Touchdowns", "O"), stat(16, "2-Point Conversions", "O"),
    stat(18, "Fumbles Lost", "O"), stat(57, "Offensive Fumble Return TD", "O"),
    stat(19, "Field Goals 0-19 Yards", "K"), stat(20, "Field Goals 20-29 Yards", "K"),
    stat(21, "Field Goals 30-39 Yards", "K"), stat(22, "Field Goals 40-49 Yards", "K"),
    stat(23, "Field Goals 50+ Yards", "K"),
    stat(24, "Field Goals Missed 0-19 Yards", "K"), stat(25, "Field Goals Missed 20-29 Yards", "K"),
    stat(26, "Field Goals Missed 30-39 Yards", "K"), stat(27, "Field Goals Missed 40-49 Yards", "K"),
    stat(28, "Field Goals Missed 50+ Yards", "K"),
    stat(29, "Point After Attempt Made", "K"), stat(30, "Point After Attempt Missed", "K"),
    stat(32, "Sack", "DT"), stat(33, "Interception", "DT"), stat(34, "Fumble Recovery", "DT"),
    stat(35, "Touchdown", "DT"), stat(36, "Safety", "DT"), stat(37, "Block Kick", "DT"),
    stat(49, "Kickoff and Punt Return Touchdowns", "DT"),
    stat(50, "Points Allowed 0 points", "DT"), stat(51, "Points Allowed 1-6 points", "DT"),
    stat(52, "Points Allowed 7-13 points", "DT"), stat(53, "Points Allowed 14-20 points", "DT"),
    stat(54, "Points Allowed 21-27 points", "DT"), stat(55, "Points Allowed 28-34 points", "DT"),
    stat(56, "Points Allowed 35+ points", "DT"),
  ] },
  stat_modifiers: { stats: [
    mod(4, 0.04, { bonuses: [{ bonus: { target: "300", points: "3" } }] }), mod(5, 4), mod(6, -1),
    mod(7, -0.5), mod(9, 0.1), mod(10, 6), mod(11, 1), mod(12, 0.1), mod(13, 6),
    mod(15, 6), mod(16, 2), mod(18, -2), mod(57, 6),
    mod(19, 3), mod(20, 3), mod(21, 3), mod(22, 4), mod(23, 5),
    mod(24, -1), mod(25, -1), mod(26, -1), mod(27, -1), mod(28, 0),
    mod(29, 1), mod(30, -1),
    mod(32, 1), mod(33, 2), mod(34, 2), mod(35, 6), mod(36, 2), mod(37, 2), mod(49, 6),
    mod(50, 10), mod(51, 7), mod(52, 4), mod(53, 1), mod(54, 0), mod(55, -1), mod(56, -4),
  ] },
};

const settings = { fantasy_content: { league: [META, { settings: [SETTINGS] }] } };

const rosters = { fantasy_content: { league: [META, { teams: {
  "0": team(1, "Chase's Team", [], [{ roster: { coverage_type: "week", week: "3", "0": { players: Object.assign(
    Object.fromEntries(ROSTER_1.map((p, i) => [String(i), p])), { count: ROSTER_1.length }) } } }]),
  "1": team(2, "Rival", [], [{ roster: { coverage_type: "week", week: "3", "0": { players: Object.assign(
    Object.fromEntries(ROSTER_2.map((p, i) => [String(i), p])), { count: ROSTER_2.length }) } } }]),
  count: 2,
} }] } };

/* One game listed from BOTH sides, in opposite orders -- which is what the
   teams collection answers, and why the schedule has to deduplicate. */
function side(id, total) {
  return { team: [[{ team_key: LEAGUE_KEY + ".t." + id }, { team_id: String(id) }, { name: "T" + id }],
                  { team_points: { coverage_type: "week", total } }] };
}
function game(week, status, a, b, extra = {}) {
  return { matchup: Object.assign({
    week: String(week), status, is_playoffs: "0", is_consolation: "0", is_tied: 0,
    "0": { teams: { "0": a, "1": b, count: 2 } },
  }, extra) };
}
const matchups = { fantasy_content: { league: [META, { teams: {
  "0": team(1, "Chase's Team", [], [{ matchups: {
    "0": game(1, "postevent", side(1, "120.50"), side(2, "99.25"), { winner_team_key: LEAGUE_KEY + ".t.1" }),
    "1": game(2, "postevent", side(1, "100.00"), side(2, "100.00"), { is_tied: 1 }),
    "2": game(3, "preevent", side(1, "0.00"), side(2, "0.00")),
    "3": game(15, "preevent", side(1, "0.00"), side(2, "0.00"), { is_playoffs: "1" }),
    count: 4,
  } }]),
  "1": team(2, "Rival", [], [{ matchups: {
    "0": game(1, "postevent", side(2, "99.25"), side(1, "120.50"), { winner_team_key: LEAGUE_KEY + ".t.1" }),
    "1": game(2, "postevent", side(2, "100.00"), side(1, "100.00"), { is_tied: 1 }),
    "2": game(3, "preevent", side(2, "0.00"), side(1, "0.00")),
    "3": game(15, "preevent", side(2, "0.00"), side(1, "0.00"), { is_playoffs: "1" }),
    count: 4,
  } }]),
  count: 2,
} }] } };

const userLeagues = { fantasy_content: { users: { "0": { user: [
  { guid: "GUID1" },
  { games: { "0": { game: [
    { game_key: "461", code: "nfl", season: "2026" },
    { leagues: {
      "0": { league: [{ league_key: LEAGUE_KEY, league_id: "777", name: "Dynasty Degens", num_teams: 2, draft_status: "postdraft", season: "2026" }] },
      "1": { league: [{ league_key: "461.l.888", league_id: "888", name: "Work League", num_teams: 12, draft_status: "predraft", season: "2026" }] },
      count: 2,
    } },
  ] }, count: 1 } },
] }, count: 1 } } };

const userTeams = { fantasy_content: { users: { "0": { user: [
  { guid: "GUID1" },
  { games: { "0": { game: [
    { game_key: "461", code: "nfl", season: "2026" },
    { teams: {
      "0": { team: [[{ team_key: LEAGUE_KEY + ".t.1" }, { team_id: "1" }, { name: "Chase's Team" }]] },
      "1": { team: [[{ team_key: "461.l.888.t.5" }, { team_id: "5" }, { name: "Cubicle FC" }]] },
      count: 2,
    } },
  ] }, count: 1 } },
] }, count: 1 } } };

const PAYLOADS = {
  ["league/" + LEAGUE_KEY + "/standings"]: standings,
  ["league/" + LEAGUE_KEY + "/settings"]: settings,
  ["league/" + LEAGUE_KEY + "/teams/roster"]: rosters,
  ["league/" + LEAGUE_KEY + "/teams/matchups"]: matchups,
  "users;use_login=1/games;game_keys=nfl/leagues": userLeagues,
  "users;use_login=1/games;game_keys=nfl/teams": userTeams,
};

const asked = [];
const fakeCall = async (path) => {
  asked.push(path);
  const body = PAYLOADS[path];
  return body ? { ok: true, status: 200, body } : { ok: false, status: 404, body: null };
};

/* ==========================================================
   The readers
   ========================================================== */

check("flat() merges metadata and sub-resources, skipping empty arrays",
  flat([[{ a: 1 }, [], { b: 2 }], { c: 3 }]), { a: 1, b: 2, c: 3 });
check("members() reads a numbered collection in numeric order, not string order",
  members({ "10": { x: 11 }, "2": { x: 3 }, "0": { x: 1 }, count: 3 }, "x"), [1, 3, 11]);
check("and reads the same list when it arrives as a real array",
  members([{ x: 1 }, { x: 2 }], "x"), [1, 2]);
check("child() finds a node one numbered level down",
  child({ coverage_type: "week", "0": { players: "here" } }, "players"), "here");

check("a league key is `<game>.l.<id>` and nothing else",
  [yahooLeagueKey("461.l.777"), yahooLeagueKey("461.l.777/../users"), yahooLeagueKey("777"), yahooLeagueKey("")],
  ["461.l.777", null, null, null]);

/* ==========================================================
   The pieces
   ========================================================== */

check("a defence is DST, on its club -- `Jac` is the pipeline's JAX",
  yahooKey(flat(ROSTER_2[1].player)), { name: "Jacksonville", pos: "DST", team: "JAX" });
check("a club is uppercased: Yahoo writes `Buf`",
  yahooKey(flat(ROSTER_1[1].player)).team, "BUF");
check("a dual-eligible player takes his PRIMARY position",
  yahooKey(flat(P(20, "Taysom Hill", "TE,QB", "NO", "BN").player)).pos, "TE");

check("an absent status is healthy -- Yahoo only sets one on a designation",
  yahooInjury(flat(ROSTER_1[0].player)), "");
check("Q is questionable, in the pipeline's own code", yahooInjury({ status: "Q" }), "Q");
check("IR and PUP-R read as the pipeline's IR and PUP",
  [yahooInjury({ status: "IR" }), yahooInjury({ status: "PUP-R" })], ["IR", "PUP"]);
check("NA says nothing about health and is left unreadable rather than guessed",
  yahooInjury({ status: "NA" }), null);

check("postdraft is complete, and the countdown instant is dropped",
  draftInfoFromYahoo({ draft_status: "postdraft" }, { draft_time: "1756000000" }), { status: "complete", at: null });
check("predraft counts down to draft_time, in milliseconds like every other adapter",
  draftInfoFromYahoo({ draft_status: "predraft" }, { draft_time: "1756000000" }), { status: "pre_draft", at: 1756000000000 });

check("uses_faab decides the waiver system before anything else",
  waiverFromYahoo(SETTINGS).type, "faab");
check("a league that does not bid runs an order, whatever else it carries",
  waiverFromYahoo({ uses_faab: "0", waiver_type: "R", waiver_time: "2" }),
  { type: "order", budget: null, minimumBid: null, resetsOrder: null, hours: 48 });

const deadline = tradeDeadlineFromYahoo(SETTINGS);
check("the trade deadline is 23:59 Eastern on the stated date",
  new Date(deadline.at).toISOString(), "2026-11-22T04:59:00.000Z");
check("no date is no deadline, not a deadline of zero",
  tradeDeadlineFromYahoo({}), { at: null, week: null, disabled: false });

check("reasonFor: 401 is the grant, 404 is the key, 999 is weather",
  [reasonFor({ status: 401 }), reasonFor({ status: 400 }), reasonFor({ status: 999 }), reasonFor({ status: 0 })],
  ["private", "not-found", "offline", "offline"]);

/* ==========================================================
   Scoring, by name
   ========================================================== */

const scoring = rulesFromYahoo(SETTINGS);
const r = scoring.rules;

check("the ordinary rates translate by the league's own names",
  [r.pass_yd, r.pass_td, r.rush_yd, r.rec, r.rec_yd, r.fum_lost], [0.04, 4, 0.1, 1, 0.1, -2]);

/* The two pairs that differ by one letter. Getting either backwards pays a
   defence for a quarterback's mistake. */
check("`Interceptions` is the passer's and `Interception` the defence's",
  [r.pass_int, r.int], [-1, 2]);
check("`Sack` is the defence's; `Sacks` (the quarterback taken down) is not",
  r.sack, 1);
check("and the quarterback's sacks, which Juke has no rule for, are reported",
  scoring.unmapped.includes("Sacks"), true);

check("one two-point rate is all three of Juke's roles",
  [r.pass_2pt, r.rush_2pt, r.rec_2pt], [2, 2, 2]);
check("and one return-touchdown rate is both kick and punt",
  [r.kr_td, r.pr_td], [6, 6]);

check("Yahoo's 50+ field goal is both of Juke's top bands",
  [r.fgm_0_19, r.fgm_40_49, r.fgm_50_59, r.fgm_60p], [3, 4, 5, 5]);

/* The miss arithmetic: Juke charges fgmiss on every miss and adds the
   band. Yahoo charges -1 inside fifty and 0 beyond, so a 55-yard miss must
   come out at 0 here: -1 base, +1 band. */
check("a missed field goal is fgmiss plus a band increment, exactly",
  [r.fgmiss, r.fgmiss_20_29, r.fgmiss_40_49, r.fgmiss_50_59, r.fgmiss_60p], [-1, 0, 0, 1, 1]);
check("so a 55-yard miss costs what the league charges for one",
  r.fgmiss + r.fgmiss_50_59, 0);

check("the points-allowed tiers line up with Juke's exactly",
  [r.pts_allow_0, r.pts_allow_1_6, r.pts_allow_7_13, r.pts_allow_14_20, r.pts_allow_21_27, r.pts_allow_28_34, r.pts_allow_35p],
  [10, 7, 4, 1, 0, -1, -4]);
check("defensive and return touchdowns are kept apart",
  [r.def_td, r.def_st_td], [6, 6]);

check("a category listed with no modifier is a real zero, not a report",
  [r.pass_att, scoring.unmapped.includes("Passing Attempts")], [0, false]);
check("a known rule the league does not list at all is set to zero",
  r.rec_40p, 0);
check("what the league scores that Juke cannot name is reported by name",
  scoring.unmapped, ["Offensive Fumble Return TD", "Passing Yards (bonus)", "Sacks"]);

/* The refusal that makes matching by name safe: with no names to read,
   nothing is matched on id alone. */
check("no category names is no table -- never a table of zeros",
  rulesFromYahoo({ stat_modifiers: SETTINGS.stat_modifiers }), { rules: null, unmapped: [] });

const renamed = JSON.parse(JSON.stringify(SETTINGS));
renamed.stat_categories.stats.find((s) => s.stat.stat_id === 11).stat.name = "Receptions (PPR)";
const renamedRules = rulesFromYahoo(renamed);
check("a category renamed out from under the table is reported, not guessed",
  renamedRules.unmapped.includes("Receptions (PPR)"), true);

/* ==========================================================
   Lineup
   ========================================================== */

const lineup = lineupFromYahoo(SETTINGS.roster_positions);
check("the lineup is a tally of the league's own seats",
  [lineup.starters, lineup.flex, lineup.superflex, lineup.bench, lineup.rounds],
  [{ QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 }, 1, 1, 6, 16]);
check("IR is a seat and not a round", lineup.rounds, 8 + 1 + 1 + 6);
check("a narrower flex is counted and reported",
  lineupFromYahoo([{ roster_position: { position: "W/R", count: 1 } }, { roster_position: { position: "QB", count: 1 } }]).looseFlex,
  ["W/R"]);
check("a seat nobody has named is reported, never guessed into the lineup",
  lineupFromYahoo([{ roster_position: { position: "QB", count: 1 } }, { roster_position: { position: "XYZ", count: 1 } }]).unmapped,
  ["XYZ"]);
check("no seats at all is null, never an empty lineup", lineupFromYahoo(null), null);
check("seats sort in app.js's SLOT_ORDER",
  ["K", "DEF", "Q/W/R/T", "W/R/T", "TE", "WR", "RB", "QB", "BN"].sort((a, b) => yahooSeatRank(a) - yahooSeatRank(b)),
  ["QB", "RB", "WR", "TE", "W/R/T", "Q/W/R/T", "DEF", "K", "BN"]);

/* ==========================================================
   The reader's leagues
   ========================================================== */

asked.length = 0;
const mine = await listLeagues(fakeCall);
check("every NFL league on the account, this season", mine.leagues.map((l) => l.leagueId), ["461.l.777", "461.l.888"]);
check("with the reader's own team in each, joined on the key it embeds",
  mine.leagues.map((l) => [l.myTeamId, l.myTeamName]), [["1", "Chase's Team"], ["5", "Cubicle FC"]]);
check("and each league's draft state",
  mine.leagues.map((l) => l.draftStatus), ["complete", "pre_draft"]);

/* ==========================================================
   One league, to connect
   ========================================================== */

const found = await lookupLeague(LEAGUE_KEY, fakeCall);
check("the lookup names the league and its size",
  [found.league.name, found.league.totalTeams, found.league.season], ["Dynasty Degens", 2, "2026"]);
check("Yahoo says which team is the reader's -- no step asks", found.league.myTeamId, "1");
check("a hidden manager is null, not the placeholder Yahoo prints",
  found.league.teams.map((t) => t.manager), ["Chase", null]);
check("a key this account cannot read is private",
  (await lookupLeague(LEAGUE_KEY, async () => ({ ok: false, status: 401, body: null }))).reason, "private");
asked.length = 0;
check("a malformed key is refused before any request",
  [(await lookupLeague("461.l.777/x", fakeCall)).reason, asked.length], ["not-found", 0]);

/* ==========================================================
   The snapshot
   ========================================================== */

asked.length = 0;
const snap = (await leagueSnapshot(LEAGUE_KEY, fakeCall, resolve)).snapshot;
const one = snap.teams.find((t) => t.ownerId === "1");
const two = snap.teams.find((t) => t.ownerId === "2");

check("every roster comes from ONE request on the teams collection",
  asked.filter((p) => p.includes("/teams/roster")).length, 1);

/* The contract strategyBoard.js states: the ORDER of `starters` is a
   lineup. Yahoo listed the receiver first. */
check("the starters read in lineup order, whatever order Yahoo sent",
  one.starters, ["4984", "9509", "9493", "8151", "11563", "DET", "10937"]);
check("the bench and IR are rostered but not starting",
  [one.players.includes("1111"), one.starters.includes("1111"), one.players.includes("2222"), one.starters.includes("2222")],
  [true, false, true, false]);
check("a defence resolves on its club with no pool lookup",
  [one.players.includes("DET"), two.players.includes("JAX")], [true, true]);
check("a suffix the pool drops still resolves", one.players.includes("8151"), true);

check("an unresolvable name is reported, by name, position and club",
  [snap.unmatchedCount, snap.unmatched], [1, ["Kenny Gainwell (RB PHI)"]]);

check("the record and the points come off the standings",
  [one.wins, one.losses, one.ties, one.pointsFor, one.pointsAgainst], [2, 0, 0, 301.2, 250.5]);
check("each team's remaining FAAB rides along -- the one platform that states it",
  [one.faabBalance, two.faabBalance], [90, 80]);
check("and the logo", one.avatar, "https://logo.test/1.png");

check("a designation is the pipeline's code, and a healthy player reads healthy",
  [snap.status.players["9509"].inj, snap.status.players["2222"].inj, snap.status.players["4984"].inj], ["Q", "IR", ""]);
check("Yahoo publishes no per-player projection, so there is none to carry",
  [snap.projections, snap.actuals], [null, null]);

check("the league's scoring is published as `rules`, the key every room reads",
  [snap.rules && snap.rules.rec, "scoring" in snap], [1, false]);
check("the lineup and the playoff field ride on the snapshot",
  [snap.lineup.superflex, snap.playoffTeams], [1, 6]);
check("the league's shape",
  [snap.provider, snap.leagueId, snap.totalTeams, snap.week, snap.draftStatus], ["yahoo", LEAGUE_KEY, 2, 3, "complete"]);

/* ==========================================================
   The schedule
   ========================================================== */

const sched = snap.schedule;
check("a game listed from both sides is ONE game", sched.matchups.length, 4);
check("home and away are ordered by team id, so both copies agree",
  sched.matchups.map((m) => [m.home.teamId, m.away.teamId]), [["1", "2"], ["1", "2"], ["1", "2"], ["1", "2"]]);
check("the winner is Yahoo's winner_team_key, never the points",
  sched.matchups.map((m) => m.winner), ["HOME", "TIE", "UNDECIDED", "UNDECIDED"]);
check("a played week carries its points; an unplayed one's 0.00 is not a score",
  sched.matchups.map((m) => [m.home.points, m.away.points]), [[120.5, 99.25], [100, 100], [null, null], [null, null]]);
check("the regular season ends before the first playoff week",
  [sched.weeks, sched.regularSeasonWeeks, sched.matchups[3].playoff], [15, 3, true]);
check("a final week that really scored 0.00 is a score",
  scheduleFromYahoo([{ week: 1, status: "postevent", sides: [{ teamId: "1", teamKey: "k1", points: "0.00" }, { teamId: "2", teamKey: "k2", points: "5" }], winnerTeamKey: "k2" }]).matchups[0].home.points,
  0);
check("nothing to read is null, never an empty season", scheduleFromYahoo([]), null);

check("a snapshot whose rosters cannot be read is a refusal, not an empty league",
  (await leagueSnapshot(LEAGUE_KEY, async (p) => (p.endsWith("/teams/roster") ? { ok: false, status: 401, body: null } : fakeCall(p)), resolve)).reason,
  "private");
check("a missing schedule costs the schedule and nothing else",
  (await leagueSnapshot(LEAGUE_KEY, async (p) => (p.endsWith("/teams/matchups") ? { ok: false, status: 500, body: null } : fakeCall(p)), resolve)).snapshot.schedule,
  null);

/* ==========================================================
   The consent state
   ========================================================== */

const SECRET = "client-secret-for-tests";
const st = await signState("user_A", SECRET);
check("a state is valid for the account that asked for it", await stateIsFor(st, "user_A", SECRET), true);
check("and for nobody else", await stateIsFor(st, "user_B", SECRET), false);
check("a state signed with another secret is refused", await stateIsFor(st, "user_A", "other-secret"), false);
check("a tampered state is refused",
  await stateIsFor(st.slice(0, 5) + (st[5] === "A" ? "B" : "A") + st.slice(6), "user_A", SECRET), false);
const old = await signState("user_A", SECRET, Date.now() - 20 * 60 * 1000);
check("a state older than fifteen minutes is refused", await stateIsFor(old, "user_A", SECRET), false);
check("the account id itself is not in the state -- only a hash of it",
  Buffer.from(st.split(".")[0], "base64url").toString().includes("user_A"), false);

const consent = new URL(authorizeUrl({ YAHOO_CLIENT_ID: "cid", YAHOO_CLIENT_SECRET: "s" }, "STATE"));
check("the consent URL carries the app, the registered return, a code grant and the state",
  [consent.origin + consent.pathname, consent.searchParams.get("client_id"), consent.searchParams.get("redirect_uri"),
   consent.searchParams.get("response_type"), consent.searchParams.get("state")],
  ["https://api.login.yahoo.com/oauth2/request_auth", "cid", "https://jukeff.com/connect/yahoo", "code", "STATE"]);
check("and asks for no scope of its own -- the app's registration decides",
  consent.searchParams.has("scope"), false);

/* ==========================================================
   The routes, through the real router, against real SQLite
   ========================================================== */

/* A signable identity, as test-me-routes.mjs builds one. */
const KID = "ins_test_key_1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const jwk = createPublicKey(publicKey).export({ format: "jwk" });
const jwks = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }));
});
await new Promise((ok) => jwks.listen(0, "127.0.0.1", ok));
jwks.unref();
const API_URL = `http://127.0.0.1:${jwks.address().port}`;

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function token(sub = "user_yahoo_A") {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT", kid: KID });
  const body = b64({ iss: "https://test.clerk.accounts.dev", sub, sid: "sess_1", azp: "http://localhost:5173",
                     nbf: now - 5, iat: now, exp: now + 600 });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

/* D1, as SQLite with every migration applied and foreign keys ON -- D1
   enforces them, and the users-row foreign key has failed every write in
   this project once already. */
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
const migrations = new URL("./migrations/", import.meta.url);
for (const f of readdirSync(migrations).filter((n) => n.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(new URL(f, migrations), "utf8"));
}
const norm = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
const DB = {
  prepare(sql) {
    let args = [];
    const s = {
      bind(...a) { args = a.map(norm); return s; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    };
    return s;
  },
  async batch(list) {
    sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of list) out.push(await s.run());
      sqlite.exec("COMMIT");
      return out;
    } catch (err) {
      sqlite.exec("ROLLBACK");
      throw err;
    }
  },
};
const credRows = (clerk) => sqlite.prepare(
  "SELECT provider, league_id, cred FROM league_credentials WHERE clerk_id = ?").all(clerk);

/* Yahoo, faked at the one place the worker reaches it: fetch(). The token
   endpoint checks the client's Basic auth and knows one good code; the
   API checks the bearer against whatever tokens are currently live. */
const YAPI = "https://yahoo.test/api";
const YAUTH = "https://yahoo.test/auth";
const CLIENT_ID = "cid-test", CLIENT_SECRET = "csec-test";
const yahoo = { live: new Set(), tokenCalls: [], apiCalls: [], revoked: false, next: 1, leaked: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input && input.url ? input.url : input);
  if (url.startsWith(YAUTH + "/get_token")) {
    const form = new URLSearchParams(String(init.body || ""));
    const auth = (init.headers && (init.headers.authorization || init.headers.Authorization)) || "";
    yahoo.tokenCalls.push({ grant: form.get("grant_type"), code: form.get("code"), refresh: form.get("refresh_token"),
                            redirect: form.get("redirect_uri"), auth });
    const okAuth = auth === "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64");
    const good = okAuth && (
      (form.get("grant_type") === "authorization_code" && form.get("code") === "GOOD-CODE") ||
      (form.get("grant_type") === "refresh_token" && form.get("refresh_token") === "RT-1" && !yahoo.revoked));
    if (!good) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const at = "AT-" + yahoo.next++;
    yahoo.live.add(at);
    return new Response(JSON.stringify({ access_token: at, refresh_token: "RT-1", expires_in: 3600,
                                         token_type: "bearer", xoauth_yahoo_guid: "GUID1" }), { status: 200 });
  }
  if (url.startsWith(YAPI + "/")) {
    const bearer = String((init.headers && init.headers.authorization) || "").replace(/^Bearer /, "");
    const path = url.slice(YAPI.length + 1).replace(/[?&]format=json$/, "");
    yahoo.apiCalls.push({ path, bearer, json: /format=json/.test(url) });
    if (!yahoo.live.has(bearer)) return new Response(JSON.stringify({ error: { description: "token_expired" } }), { status: 401 });
    const body = PAYLOADS[path];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("{}", { status: 404 });
  }
  /* The local JWKS server is the only real request this file may make.
     Anything else -- the snapshot route's fill-the-pool-on-demand reaching
     for Sleeper's 5 MB player master, say -- is refused, because the first
     version of this passed everything through and an "offline" suite
     quietly downloaded the whole NFL on every run. */
  if (url.startsWith(API_URL)) return realFetch(input, init);
  yahoo.leaked.push(url);
  return new Response("{}", { status: 503 });
};

const ORIGIN = "http://localhost:5173";
const CTX = { waitUntil() {} };
const CRED_KEY = randomBytes(32).toString("base64");
const ENV = {
  CLERK_SECRET_KEY: "sk_test_stub", CLERK_API_URL: API_URL, DB,
  LEAGUE_CRED_KEY: CRED_KEY,
  YAHOO_CLIENT_ID: CLIENT_ID, YAHOO_CLIENT_SECRET: CLIENT_SECRET,
  YAHOO_API_BASE: YAPI, YAHOO_AUTH_BASE: YAUTH,
};

async function call(path, { method = "GET", auth, body, env = ENV, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (auth) headers.Authorization = "Bearer " + auth;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await worker.fetch(new Request("https://juke-draft-room.test" + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), env, CTX);
  } catch (err) {
    return { status: "threw", body: { threw: (err && err.message) || String(err) } };
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed, headers: res.headers };
}

const A = token("user_yahoo_A");
const B = token("user_yahoo_B");

check("authorize needs an account", (await call("/yahoo/authorize", { method: "POST" })).status, 401);
check("a deployment with no Yahoo app says so rather than sending anybody to Yahoo",
  (await call("/yahoo/authorize", { method: "POST", auth: A, env: Object.assign({}, ENV, { YAHOO_CLIENT_ID: "" }) })).body.error,
  "not-configured");
check("and one with nowhere to seal a token refuses before Yahoo is involved",
  (await call("/yahoo/authorize", { method: "POST", auth: A, env: Object.assign({}, ENV, { LEAGUE_CRED_KEY: "" }) })).body.error,
  "private-unavailable");

const auth = await call("/yahoo/authorize", { method: "POST", auth: A });
const authUrl = new URL(auth.body.url);
check("authorize answers Yahoo's consent URL with this account's state",
  [auth.status, authUrl.origin + authUrl.pathname, authUrl.searchParams.get("client_id"), authUrl.searchParams.get("state") === auth.body.state],
  [200, YAUTH + "/request_auth", CLIENT_ID, true]);

/* Yahoo returns every reader to the ONE registered address, and www
   serves the site as its own origin. So the state carries where the reader
   started -- only ever one of the site's own addresses. */
const stateOrigin = async (origin) => {
  const s = (await call("/yahoo/authorize", { method: "POST", auth: A, origin })).body.state;
  return JSON.parse(Buffer.from(s.split(".")[0], "base64url").toString()).o || null;
};
check("the state remembers a reader who started on www",
  await stateOrigin("https://www.jukeff.com"), "https://www.jukeff.com");
check("and names no origin for anywhere else", await stateOrigin(ORIGIN), null);

/* The attack the state exists for: B starts a connect and gets A to
   approve it. A's code arrives with B's state and must be refused -- and
   refused BEFORE the code is spent at Yahoo. */
const bState = (await call("/yahoo/authorize", { method: "POST", auth: B })).body.state;
yahoo.tokenCalls.length = 0;
const crossed = await call("/yahoo/token", { method: "POST", auth: A, body: { code: "GOOD-CODE", state: bState } });
check("a code arriving with ANOTHER account's state is refused",
  [crossed.status, crossed.body.error], [400, "bad-state"]);
check("before the code is ever sent to Yahoo", yahoo.tokenCalls.length, 0);
check("and nothing is stored", credRows("user_yahoo_A").length, 0);

check("a forged state is refused",
  (await call("/yahoo/token", { method: "POST", auth: A, body: { code: "GOOD-CODE", state: "e30.AAAA" } })).body.error, "bad-state");
check("a code Yahoo rejects is bad-code, not an outage",
  (await call("/yahoo/token", { method: "POST", auth: A, body: { code: "BAD", state: auth.body.state } })).body.error, "bad-code");

yahoo.tokenCalls.length = 0;
const traded = await call("/yahoo/token", { method: "POST", auth: A, body: { code: "GOOD-CODE", state: auth.body.state } });
check("the code is traded for a token and the reader's leagues come back",
  [traded.status, traded.body.ok, traded.body.leagues.map((l) => l.leagueId)], [200, true, ["461.l.777", "461.l.888"]]);
check("the exchange authenticates as the app and names the registered return",
  [yahoo.tokenCalls[0].grant, yahoo.tokenCalls[0].redirect, yahoo.tokenCalls[0].auth.startsWith("Basic ")],
  ["authorization_code", "https://jukeff.com/connect/yahoo", true]);
check("every API read asks for JSON", yahoo.apiCalls.every((c) => c.json), true);

const rows = credRows("user_yahoo_A");
check("ONE sealed row for the account, not one per league",
  rows.map((x) => [x.provider, x.league_id]), [["yahoo", "*"]]);
check("and it is sealed: neither token is in the database in the clear",
  [rows[0].cred.includes("RT-1"), rows[0].cred.includes("AT-")], [false, false]);
check("the users row the foreign key needs was made on the way past",
  !!sqlite.prepare("SELECT 1 FROM users WHERE clerk_id = ?").get("user_yahoo_A"), true);

check("the leagues can be listed again from the stored token",
  (await call("/yahoo/leagues", { auth: A })).body.leagues.length, 2);
check("but not for an account that never granted one",
  (await call("/yahoo/leagues", { auth: B })).body.error, "needs-auth");

/* Connecting needs a plan that allows one; Free's cap is zero. */
sqlite.prepare("UPDATE users SET tier = 'allaccess' WHERE clerk_id = ?").run("user_yahoo_A");
const conn = await call("/me/leagues", { method: "POST", auth: A,
  body: { provider: "yahoo", leagueId: LEAGUE_KEY, ownerId: "2" } });
check("a Yahoo league connects through the account's token",
  [conn.status, conn.body.ok, conn.body.league && conn.body.league.provider], [200, true, "yahoo"]);
check("and the reader's team is the one YAHOO says they manage, not the one posted",
  conn.body.league.ownerId, "1");
check("a connect writes no second credential", credRows("user_yahoo_A").length, 1);

check("a malformed Yahoo key is refused before anything is asked",
  (await call("/me/leagues", { method: "POST", auth: A, body: { provider: "yahoo", leagueId: "461.l.777/../x" } })).status, 400);

check("switching to a Yahoo league is not refused for the dot in its key",
  (await call("/me/leagues", { method: "PATCH", auth: A, body: { provider: "yahoo", leagueId: LEAGUE_KEY } })).status, 200);

const snapRes = await call("/yahoo/snapshot?league=" + LEAGUE_KEY, { auth: A });
check("the snapshot reads as the account", [snapRes.status, snapRes.body.provider, snapRes.body.teams.length], [200, "yahoo", 2]);
check("signed out there is nothing to read with",
  (await call("/yahoo/snapshot?league=" + LEAGUE_KEY)).status, 403);
check("a bad key is a 400, not a request upstream",
  (await call("/yahoo/snapshot?league=nope", { auth: A })).status, 400);

/* The access token lives an hour. Yahoo answering 401 mid-session is the
   ordinary path, and it must cost one refresh and nothing else. */
yahoo.live.clear();
yahoo.tokenCalls.length = 0;
const again = await call("/yahoo/snapshot?league=" + LEAGUE_KEY, { auth: A });
check("a 401 from Yahoo is answered with ONE refresh, however many reads hit it",
  [again.status, yahoo.tokenCalls.filter((c) => c.grant === "refresh_token").length], [200, 1]);
const reopened = await openCredential(credRows("user_yahoo_A")[0].cred,
  { clerkId: "user_yahoo_A", provider: "yahoo", leagueId: "*" }, ENV);
check("and the refreshed token is resealed, so the next request starts warm",
  yahoo.live.has(reopened.accessToken), true);

/* A grant revoked from the reader's Yahoo account. */
yahoo.live.clear();
yahoo.revoked = true;
const revoked = await call("/yahoo/snapshot?league=" + LEAGUE_KEY, { auth: A });
check("a revoked grant is `private` -- sign in to Yahoo again -- not an outage",
  [revoked.status, revoked.body.error], [403, "private"]);
yahoo.revoked = false;

check("forgetting the grant keeps it while a Yahoo league still reads through it",
  [(await call("/yahoo/leagues", { method: "DELETE", auth: A })).body.kept, credRows("user_yahoo_A").length], [true, 1]);

const gone = await call("/me/leagues?provider=yahoo&league=" + LEAGUE_KEY, { method: "DELETE", auth: A });
check("disconnecting the LAST Yahoo league deletes the grant with it",
  [gone.body.ok, credRows("user_yahoo_A").length], [true, 0]);

/* Every preflight names the verbs and the header its route needs. A
   preflight that does not is a request that never leaves the page. */
for (const [path, methods] of [["/yahoo/authorize", "POST"], ["/yahoo/token", "POST"],
                               ["/yahoo/leagues", "GET, DELETE"], ["/yahoo/snapshot", "GET"]]) {
  const pre = await call(path, { method: "OPTIONS" });
  check("the preflight for " + path + " names " + methods + " and authorization",
    [pre.headers.get("access-control-allow-methods"), /authorization/.test(pre.headers.get("access-control-allow-headers") || "")],
    [methods, true]);
}

/* Anything the router tried to reach that is not Yahoo or the local key
   server. The pool fill is expected to TRY -- a snapshot against an empty
   pool asks for it off the response path -- and the point is that the
   refusal above answered it rather than the internet. */
check("nothing but Yahoo and the local key server was asked for anything, except the pool fill",
  yahoo.leaked.filter((u) => !u.includes("/players/nfl")), []);

globalThis.fetch = realFetch;
console.log(failures ? "\nFAIL " + failures : "\nOK — the Yahoo adapter and its routes, offline");
process.exitCode = failures ? 1 : 0;
