/* ESPN, read-only, through the worker.

   The second provider. sleeper.js is the one to read first — everything
   about why a league is fetched here rather than from the page applies
   unchanged, and this file answers the same two questions in the same two
   shapes so nothing downstream has to know which platform a league came
   from.

   ---- What is genuinely different from Sleeper ----

   **There is no username, and no account.** ESPN's read API addresses a
   league by the numeric id in its own URL and offers nothing that maps a
   person to their leagues. So the connect flow cannot be "who are you,
   here are your leagues"; it is "which league, and which of these teams is
   yours". That is a different dialog, not a different-looking one, which
   is why ConnectLeagueModal branches on the platform rather than
   relabelling a field.

   **Only a public league can be read.** Measured against the live API on
   5 September 2026, rather than assumed:

     200  a public league
     401  a league that exists and is not public
     404  no such league (12345678, 999999 and 2000000000 all answer this)
     400  not a valid league id at all — "Invalid parameter for 'leagueId'"

   401 and 404 are different things to tell somebody — "make it viewable to
   the public" against "check the number" — so they are reported
   separately, the same way sleeperLookup tells `not-found` from `offline`.
   Collapsing them sends somebody to re-read a number that was right.

   400 is folded into not-found because the reader's fix is identical: it
   only happens for an id outside a 32-bit int, which this worker's own
   route already refuses before ESPN is asked.

   **The ids are ESPN's, so a roster has to be translated.** This is the
   load-bearing difference and the reason this file is longer than
   sleeper.js. See the crosswalk note below.

   ---- Nothing here can write ----

   Every request below is a GET against the read-only host ESPN publishes
   for this (`lm-api-reads`). There is no token, no cookie and no write
   endpoint in play, which is what keeps "Connecting is read-only. Juke
   never edits your league" a property of the integration rather than a
   promise somebody has to remember.

   ---- Failure is a value, never a throw ----

   Same contract as sleeper.js and store.js. */

import { normalise } from "./names.js";
import { rulesFromEspn } from "./scoring.js";
import { injuryCode } from "./status.js";
import { lineupFromEspn, slotRank } from "./lineup.js";
import { scheduleFromEspn } from "./matchups.js";
import { feedFromEspn, playersInFeed, FEED_LIMIT } from "./transactions.js";

export const ESPN_API = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

// Matches sleeper.js. A roster moves on waiver day, not on page load.
export const SNAPSHOT_TTL = 120;

const MAX_TEAMS = 32;

/* ESPN's position ids. Only the six a fantasy roster can hold — the API
   uses this scale for defensive players and coaches too, and a row this
   map does not name is one Juke has no board slot for anyway. */
const POSITIONS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };

/* ESPN's pro-team ids to real abbreviations.

   Written down rather than fetched, and that is the opposite of the choice
   made while measuring this. The derivation is one extra request against
   `?view=proTeamSchedules_wl` and it was used to PRODUCE this table, which
   is the right way round: the mapping is a fact about the NFL's 32 clubs,
   it has changed twice this century, and paying a round trip per snapshot
   to re-learn it would be spending a request on something that cannot move
   between two page loads.

   `0` is ESPN's free agent, which is a real value on a rostered player
   whose club has cut him. Left out on purpose: clean() answers "FA" for
   anything missing, and a defense with no club is a row to drop rather
   than one to guess at. */
const PRO_TEAMS = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS",
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

/* ESPN writes Washington as WSH and the pipeline writes WAS. One entry,
   applied at the point the table is built rather than at every read — the
   same job build_players.py's TEAM_ALIASES does, and deliberately not a
   second copy of that whole table: the other nine aliases in it are for
   feeds that send historical codes (OAK, SD, STL), and ESPN sends none of
   them. An alias table with entries nothing can produce is a table nobody
   can tell is wrong. */

/* The one copy lives in names.js, because store.js writes the key this
   reads — see that file for the measurement that makes the suffix rule
   load-bearing. Re-exported so a test can drive the join through this
   module alone. */
export { normalise } from "./names.js";

async function getJson(path, base, extra) {
  try {
    const res = await fetch((base || ESPN_API) + path, {
      // `extra` carries X-Fantasy-Filter, which is how ESPN takes a query
      // rather than a path -- see leagueTransactions().
      headers: Object.assign({ accept: "application/json" }, extra || null),
    });
    /* 401 is a private league and 404 is no league. Both are answers
       rather than faults, and the caller needs to tell them apart, so the
       status comes back instead of a bare null. */
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.json() };
  } catch (err) {
    console.error("espn fetch failed:", path, err && err.message);
    return { ok: false, status: 0, body: null };
  }
}

function leaguePath(leagueId, season, views) {
  const qs = views.map((v) => "view=" + v).join("&");
  return "/seasons/" + encodeURIComponent(season) +
         "/segments/0/leagues/" + encodeURIComponent(leagueId) + "?" + qs;
}

/* A team's display name.

   ESPN has carried this two ways. Older seasons split it into `location`
   and `nickname`; current ones put the whole thing in `name` and leave
   both halves null — measured on a real 2026 league, where every team had
   `name` set and `location`/`nickname` null. Both are read because a
   manager connecting a league from an older season is a case this cannot
   detect and should not fail on. */
function teamName(t) {
  const joined = [t.location, t.nickname].filter(Boolean).join(" ").trim();
  return String(t.name || joined || t.abbrev || "Team " + t.id).trim().slice(0, 80);
}

/* Who owns a team, as a name rather than a GUID.

   `members` is keyed by the same opaque id `primaryOwner` carries, and it
   is the only place a human name appears. A league whose members are
   hidden answers an empty array, which is why this degrades to null rather
   than to the GUID: an id nobody can read is worse on screen than no name
   at all. */
function ownerNames(league) {
  const by = new Map();
  (Array.isArray(league.members) ? league.members : []).forEach((m) => {
    if (!m || !m.id) return;
    const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim() ||
                 m.displayName || "";
    if (name) by.set(String(m.id), name.slice(0, 60));
  });
  return by;
}

/* When the draft is, and whether it has happened.

   `draftSettings.date` rides on the `mSettings` view both callers already
   ask for. `draftDetail` rides on the league root too — but only its two
   booleans do, so `mDraftDetail` is now asked for by name to get `picks`.
   That is one more view on the same request rather than a second request,
   and the section below is what buys it.

   ---- The status is derived, and it has to be ----

   ESPN has no "pre_draft"/"drafting"/"complete" field. It has two booleans,
   and they answer a different question from Sleeper's one string, so the
   mapping is written down here once rather than being re-derived by each
   screen that wants to know whether to draw a countdown.

   ---- `inProgress` does not mean picks are being made ----

   It means the draft ROOM is open, which ESPN opens well before the draft.
   Measured 8 September 2026 against a real public league drafting at 02:00
   UTC: at 01:26 UTC -- thirty-four minutes early -- `inProgress` was already
   true, `drafted` false, and not one of the 140 picks made. Reading it alone
   as "drafting" put DRAFTING NOW on that league and suppressed the countdown
   entirely, because draftPhase() answers on the status before it ever looks
   at the clock. The boolean is necessary and it is not sufficient; what
   makes it sufficient is a pick.

   ---- An unmade pick is `playerId: -1` ----

   The picks array is pre-populated with the whole grid -- 140 slots for a
   ten-team, fourteen-round league -- before anybody drafts, carrying the
   draft order and nothing else. So "has this started" is a count of picks
   with a real player behind them, and never `picks.length`.

   Keepers are excluded from that count: they are assigned before the draft
   rather than during it, so a keeper league would otherwise report itself
   as drafting from the moment its grid was built -- the same bug this
   fixes, arriving from the one direction the fix could reintroduce it.

   ---- And ESPN publishes those picks only when the draft ENDS ----

   Measured 8 September 2026 across a real ten-team draft, polled every ten
   seconds for ninety-nine minutes with no errors and no loss of access: the
   draft ran for forty-two minutes -- 78 of its 140 picks made by hand on a
   sixty-second clock -- and this endpoint reported `made=0/140` and
   `rostered=0` for the whole of it, then published all 140 in a single
   ten-second window as it completed. `mRoster` is blind the same way, so
   there is no cheaper route to the same fact.

   So a pick PROVES a draft has started and its absence proves nothing,
   which is why the scheduled instant is the second half of the test. Room
   open, plus the hour having come, is what a live ESPN draft looks like
   from out here. Without that clause the status falls to `pre_draft`
   against an instant in the past, which draftPhase() renders as DRAFT TIME
   PASSED -- over a draft that is running.

   Neither clause fires early on its own: before the scheduled hour there is
   no pick and nothing is due, which is the bug this pair replaced. And a
   draft nobody ever held keeps `late`, because the room is shut, so
   `inProgress` is false and no amount of elapsed time makes it drafting.

   ---- A date with `drafted: true` behind it still points at the past ----

   ESPN keeps the scheduled date after the draft has run, so a countdown
   built on the date alone counts to a draft that already happened. That is
   the same trap Sleeper's `start_time` has on a completed draft, which is
   why both providers report a status beside the instant and nothing draws
   one without the other. `drafted` is therefore read FIRST: a finished
   draft is finished whatever the other boolean says. */
/* An unmade pick, and why this is not simply `playerId > 0`.

   ESPN gives a TEAM DEFENCE a NEGATIVE player id -- measured -16034 for
   Houston, -16007 for Denver, -16023 for Pittsburgh, which is
   -(16000 + proTeamId). So `> 0` reads every drafted defence as an unmade
   pick. It dropped exactly ten of a ten-team draft's 140 picks, one per
   roster, and reported them as neither picks nor unnamed -- found by
   counting the result, because nothing failed.

   -1 is the only value meaning nobody has picked here yet. */
const UNMADE = -1;

function draftInfo(league, now) {
  const settings = (league.settings || {}).draftSettings || {};
  const detail = league.draftDetail || {};
  const at = Number(settings.date) || null;

  const picks = Array.isArray(detail.picks) ? detail.picks : null;
  const picked = picks
    ? picks.some((p) => p && p.playerId !== null && p.playerId !== undefined && p.playerId !== UNMADE && !p.keeper && !p.reservedForKeeper)
    : false;
  // The hour having come, which is the only evidence a live ESPN draft
  // gives: see the measurement above.
  const due = at !== null && now >= at;

  const started = picks
    ? picked || due
    /* No picks in hand, so the view was refused or the shape moved. The old
       reading is wrong early and right once a draft is genuinely under way,
       and being early beats printing DRAFT TIME PASSED over a live draft. */
    : !!detail.inProgress;

  const status = detail.drafted ? "complete"
               : detail.inProgress && started ? "drafting"
               : "pre_draft";

  return { at, status };
}

/* The league itself, for the connect flow's "which league" step.

   ESPN resolves one league per id, so this answers one rather than a list —
   and the picker still asks the reader to confirm it, for the reason
   ConnectLeagueModal's own comment gives about Sleeper's single-league
   case: a wrong guess connects the wrong roster to every screen in the app,
   so the league is always chosen and never inferred.

   `teams` comes back with it because ESPN's connect flow needs a second
   question Sleeper's does not — which of these is yours — and asking it
   from an answer already in hand beats a second round trip. */
export async function lookupLeague(leagueId, season, base) {
  const res = await getJson(leaguePath(leagueId, season, ["mTeam", "mSettings", "mDraftDetail"]), base);

  if (!res.ok) {
    // 401 is ESPN's answer for a league that exists and is not public. It
    // is the one failure here with a fix the reader can carry out.
    if (res.status === 401 || res.status === 403) return { reason: "private", league: null };
    if (res.status === 404 || res.status === 400) return { reason: "not-found", league: null };
    return { reason: "offline", league: null };
  }

  const league = res.body;
  if (!league || !league.id) return { reason: "not-found", league: null };

  const settings = league.settings || {};
  const owners = ownerNames(league);
  const teams = (Array.isArray(league.teams) ? league.teams : []).slice(0, MAX_TEAMS);
  const draft = draftInfo(league, Date.now());

  return {
    reason: null,
    league: {
      provider: "espn",
      leagueId: String(league.id),
      name: String(settings.name || "Untitled league").slice(0, 80),
      season: String(league.seasonId || season),
      totalTeams: Number(settings.size) || teams.length,
      draftAt: draft.at,
      draftStatus: draft.status,
      // Which team is the reader's. There is no account here to infer it
      // from, so the dialog has to ask — see this file's header.
      teams: teams.map((t) => ({
        teamId: String(t.id),
        name: teamName(t),
        abbrev: t.abbrev ? String(t.abbrev).slice(0, 8) : null,
        manager: owners.get(String(t.primaryOwner)) || null,
      })),
    },
  };
}

/* ---------- The crosswalk ----------

   A snapshot's `players` and `starters` are SLEEPER ids in every provider,
   because that is what players.js and stats.js are keyed by and therefore
   the only thing the board, the projections and every room can use.
   sleeper.js gets that for free. This has to earn it.

   ---- Why not espn_id off Sleeper's own player master ----

   Because it is not there. Sleeper publishes an `espn_id` field and it
   covers **112 of the 452 non-DST players on Juke's board — 24.8%** —
   measured 5 September 2026. The misses are systematic rather than random:
   Ja'Marr Chase, Trevor Lawrence, DeVonta Smith, Jaylen Waddle, Travis
   Etienne and Kyle Pitts are all absent, because the backfill appears to
   have stopped around the 2021 draft class. Team defenses carry none at
   all. So the id join is worst exactly where a fantasy league's value is
   concentrated, and it would fail silently — a roster that quietly drops
   its best six players still renders.

   ---- So it is a name join, which this project already trusts ----

   The same shape link_nflverse() uses and measures at 240 of 241. Measured
   here against the ten real rosters of a live ESPN league (141 rostered
   players, 2025):

     defense, by club          13
     name + position + club   109
     name + position           14
     unmatched                  5

   136 of 141, and four of the five are players who are genuinely not on
   Juke's 2026 board at all — a 2025 roster measured against a 2026 board,
   which is the wrong pairing and the only one available before that league
   drafts. The fifth is Kenneth/Kenny Gainwell, a nickname the pipeline
   stores one way and ESPN the other.

   ---- A defense is a club, so it joins on the club ----

   ESPN says "Patriots D/ST" and the pipeline says "New England Defense".
   Neither normalises to the other and no fuzzy match should be asked to
   bridge them, because there is an exact answer sitting right there:
   **Sleeper's player_id for a defense IS the club abbreviation** ("SEA",
   "HOU"). So a defense resolves from `proTeamId` alone, with nothing to
   get wrong, and it is checked first for that reason.

   ---- An unmatched player is dropped and counted, never guessed ----

   `unmatched` rides on the snapshot. A crosswalk that misses quietly is
   worse than no crosswalk — the pipeline's own rule, and the reason
   unmatched.txt exists — and here the failure is invisible: a roster one
   player short looks exactly like a roster. */

function espnKey(player) {
  return {
    pos: POSITIONS[player.defaultPositionId] || null,
    team: PRO_TEAMS[player.proTeamId] || null,
    name: String(player.fullName || "").trim(),
  };
}

/* ESPN's own projected points for one player in one week, under THIS
   league's scoring -- the number the league's own screens print.

   ---- Why this is read rather than recomputed ----

   A connected league has to show the projection its platform shows. That
   is the owner's requirement, stated as non-negotiable on 10 September
   2026, and it reverses a decision this file used to record: that ESPN's
   projections were "somebody else's answer to a question Juke answers
   itself" and were dropped on the way through. They were, and the
   consequence was a Strategy Room reading 117.3 for a week ESPN's own
   matchup screen called 131.8. A reader looking at two numbers for one
   week does not conclude that two forecasters disagree; they conclude
   the product imported their league wrong.

   ---- It is exact, and that was measured before it was trusted ----

   `appliedTotal` is ESPN's projected stat line multiplied through the
   league's own `scoringItems`, D/ST overrides included. Reconstructed by
   hand from the raw `stats` and the league's 53 items on 10 September
   2026, it matched on all 60 players checked to four decimal places --
   so this is not an opinion ESPN attaches to a player, it is arithmetic
   over the league's own table, and it scores the 28 rules Juke cannot
   name (the long-play bonuses, every points- and yards-allowed tier) that
   no translation into Juke's vocabulary could.

   ---- It costs nothing ----

   `mRoster` is already on the snapshot's request, and every entry carries
   this line: 140 of 140 rostered players on a real league, on the exact
   views this file asks for. No second fetch, no second cache.

   ---- Four fields pick the one entry, and each excludes a real neighbour ----

   statSourceId 1 is a projection (0 is what actually happened -- present
   for players whose game has kicked off, and the wrong number to call a
   projection). statSplitTypeId 1 is one scoring period (0 is the season
   total, 330-odd points). scoringPeriodId is the week, and seasonId is
   checked because last season's rows ride along too. Anything else found
   answers null rather than a neighbour's number. */
export function weekProjection(player, season, week) {
  if (!player || !week) return null;
  const stats = Array.isArray(player.stats) ? player.stats : [];
  for (const s of stats) {
    if (!s || Number(s.statSourceId) !== 1 || Number(s.statSplitTypeId) !== 1) continue;
    if (Number(s.scoringPeriodId) !== Number(week)) continue;
    if (season && s.seasonId != null && Number(s.seasonId) !== Number(season)) continue;
    const pts = Number(s.appliedTotal);
    /* Four decimals, not two. A screen rounds to one, and rounding twice
       is not rounding once: a line of 13.046 is 13.0 to the league, and
       13.05 once stored, which prints as 13.1 -- a tenth off the league's
       own screen on a number whose whole job is to agree with it. At two
       decimals that happens to one line in twenty; at four, to one in two
       thousand, for 140 x two characters. */
    return Number.isFinite(pts) ? Math.round(pts * 10000) / 10000 : null;
  }
  return null;
}

/* Resolve one league's rostered players to Sleeper ids.

   `lookup` is injected rather than imported, so this file never touches D1
   and can be driven from a test with a plain Map. It takes the distinct
   (name, position, club) triples the rosters actually contain and answers
   a Map keyed the same way — one query for the whole league rather than
   one per player. */
export async function crosswalk(entries, lookup) {
  const wanted = new Map();
  entries.forEach((p) => {
    const k = espnKey(p);
    // A defense needs no lookup at all: see the note above.
    if (!k.pos || k.pos === "DST" || !k.name) return;
    wanted.set(normalise(k.name) + "|" + k.pos, { name: k.name, pos: k.pos, team: k.team });
  });
  return lookup([...wanted.values()]);
}

/* The completed draft, as picks anybody can name.
 *
 * Free: `mDraftDetail` has been on this request since the draft countdown
 * needed it, and the rosters are already here for the crosswalk. So this
 * costs one more pass over data the snapshot had in hand and not a single
 * extra fetch -- which matters, because the obvious alternative is
 * `kona_player_info` and that is 3.9 MB.
 *
 * ---- Names come from the rosters, and that is why this is captured ----
 *
 * A pick carries a bare ESPN playerId and nothing else. The only free way
 * to turn that into a person is the roster the player is now on, which
 * works perfectly the day a draft ends -- measured 140 of 140 -- and decays
 * from the first drop of the season. There is no asking ESPN later what a
 * pick was without paying 3.9 MB for the whole player universe.
 *
 * So this is a capture, not a query, and it belongs to the same family as
 * data/season's append-only archives: the moment to record what happened is
 * while it can still be recorded. A caller that wants it durable stores
 * what comes back rather than re-reading it in November.
 *
 * ---- An unnamed pick is reported, never dropped ----
 *
 * A pick whose player has already been dropped resolves to no name, and it
 * stays in the list with `name: null` rather than vanishing. A draft
 * silently 138 picks long is a board with holes nobody can see -- the same
 * reason the roster crosswalk reports `unmatched` instead of quietly
 * shortening a roster.
 *
 * ---- The seat order is stated, not inferred ----
 *
 * Juke derives a seat from the overall pick number and the snake. That is
 * right for a snake and wrong for anything else, and ESPN runs linear and
 * auction drafts too -- so the round-one team order rides along explicitly,
 * and every pick carries its own teamId. A caller then never has to
 * re-derive the mirror, which is the rule pickInRound() already exists to
 * enforce on the board. */
/* How a league moves unowned players.
 *
 * Two systems, and they are not variations of each other: a FAAB league
 * bids money, and a traditional waiver league has an ORDER that a claim
 * moves you down. Juke showed the first to everybody because
 * `acquisitionBudget` is populated either way.
 *
 * Everything here is stated by ESPN rather than inferred:
 * `isUsingAcquisitionBudget` decides the system, `waiverOrderReset` is the
 * "Never Reset Order" line in the league's own settings page, and
 * `waiverHours` is its waiver period. Verified against a real league whose
 * settings screen reads "Waivers / 1 Day / Move to Last After Claim, Never
 * Reset Order": false, 24, false. */
function waiverFromEspn(acquisitionSettings) {
  const a = acquisitionSettings || {};
  const faab = a.isUsingAcquisitionBudget === true;
  const budget = Number(a.acquisitionBudget);
  const hours = Number(a.waiverHours);
  return {
    type: faab ? "faab" : "order",
    // Null rather than 0 off a FAAB league: there is no budget, not a
    // budget of nothing.
    budget: faab && Number.isFinite(budget) ? budget : null,
    minimumBid: faab && Number.isFinite(Number(a.minimumBid)) ? Number(a.minimumBid) : null,
    // Whether a claim sends you to the back for good. Only means anything
    // in an order league, so it is null in the other.
    resetsOrder: faab ? null : a.waiverOrderReset === true,
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
  };
}

/* When the league stops allowing trades.

   The two platforms publish this in different units and neither converts to
   the other for free, so BOTH ride on the snapshot and each is null where
   its platform does not say. ESPN gives an instant; Sleeper gives a week
   number. Turning ESPN's instant into a week would need the date each week
   starts, which no view here carries, and turning Sleeper's week into an
   instant needs the same table from the other end.

   That is the same shape as `waiver`: one vocabulary, fields absent rather
   than guessed. What matters is that "has it passed" is answerable from
   either -- against the clock, or against the snapshot's own week -- so a
   screen asks one question and never asks which platform it is on.

   Measured 9 September 2026 against a real league:
   ESPN  tradeSettings.deadlineDate  1796230800000  (2026-12-02T17:00Z)
   Sleeper  settings.trade_deadline  11             (a week number) */
function tradeDeadlineFromEspn(tradeSettings) {
  const t = tradeSettings || {};
  const at = Number(t.deadlineDate);
  return {
    // Epoch ms, as ESPN sends it. Guarded on being a real positive number
    // because a league with no deadline is unmeasured here -- one league was
    // available and it has one -- so an absent or zero value is read as "no
    // deadline" rather than as midnight in 1970.
    at: Number.isFinite(at) && at > 0 ? at : null,
    week: null,
    // ESPN publishes no "trades are off" flag on any settings group this
    // adapter reads, so this is unknown rather than false.
    disabled: null,
  };
}

function draftBoard(league, rawTeams, resolveId) {
  const detail = league.draftDetail || {};
  const picks = Array.isArray(detail.picks) ? detail.picks : [];
  if (!picks.length) return null;

  const byEspnId = new Map();
  rawTeams.forEach((t) => {
    const entries = (t.roster && Array.isArray(t.roster.entries)) ? t.roster.entries : [];
    entries.forEach((e) => {
      const p = e && e.playerPoolEntry && e.playerPoolEntry.player;
      // Either shape: a roster entry carries `playerId` beside the nested
      // player, and a caller holding only the pool entry still resolves.
      const id = e.playerId !== undefined && e.playerId !== null ? e.playerId : p && p.id;
      if (p && id !== undefined && id !== null) byEspnId.set(Number(id), p);
    });
  });

  const made = picks
    .filter((p) => p && p.playerId !== null && p.playerId !== undefined && p.playerId !== UNMADE)
    .sort((a, b) => (a.overallPickNumber || 0) - (b.overallPickNumber || 0));
  if (!made.length) return null;

  let unnamed = 0;
  const out = made.map((p) => {
    const player = byEspnId.get(Number(p.playerId)) || null;
    const key = player ? espnKey(player) : null;
    if (!key || !key.name) unnamed++;
    return {
      overall: Number(p.overallPickNumber) || null,
      round: Number(p.roundId) || null,
      roundPick: Number(p.roundPickNumber) || null,
      teamId: String(p.teamId),
      // Juke's own id where the crosswalk could place him, so a caller can
      // reach the board without matching on a name a second time.
      id: player ? resolveId(player) : null,
      name: key && key.name ? key.name : null,
      pos: key ? key.pos || null : null,
      team: key ? key.team || null : null,
      // ESPN's own flag for a pick the clock made rather than a person.
      auto: !!p.autoDraftTypeId,
    };
  });

  const first = made.filter((p) => Number(p.roundId) === 1)
    .sort((a, b) => (a.roundPickNumber || 0) - (b.roundPickNumber || 0))
    .map((p) => String(p.teamId));

  const settings = (league.settings || {}).draftSettings || {};
  return {
    // "SNAKE", "LINEAR", "AUCTION" -- stated so a caller can refuse a shape
    // whose seat maths it does not model rather than grading it wrongly.
    type: String(settings.type || "").toUpperCase() || null,
    rounds: made.reduce((n, p) => Math.max(n, Number(p.roundId) || 0), 0),
    order: first,
    picks: out,
    unnamed,
  };
}

/* Everything a connected ESPN league's screens need, in the shape
   sleeper.js already answers.

   `resolve` is the crosswalk's second half: given the triples above it
   answers a Map from `normalise(name)|POS` to a Sleeper id. Passed in for
   the reason SLEEPER_BASE is a parameter — so a test can drive the whole
   mapping against a known table, and so nothing here holds state between
   requests. */
export async function leagueSnapshot(leagueId, season, base, resolve) {
  const res = await getJson(
    /* mMatchupScore rides along rather than taking its own request: ESPN
       stacks views on one call, and the measured cost is +30% upstream on a
       response cached for 120s against ~1.4 KB on the wire. See
       matchups.js. */
    leaguePath(leagueId, season,
      ["mTeam", "mRoster", "mSettings", "mDraftDetail", "mMatchupScore"]),
    base
  );
  if (!res.ok || !res.body || !res.body.id) {
    return { reason: res.status === 401 || res.status === 403 ? "private"
                   : (res.status === 404 || res.status === 400) ? "not-found"
                   : "offline", snapshot: null };
  }

  const league = res.body;
  const settings = league.settings || {};
  const owners = ownerNames(league);
  const rawTeams = (Array.isArray(league.teams) ? league.teams : []).slice(0, MAX_TEAMS);

  const everyPlayer = [];
  rawTeams.forEach((t) => {
    const entries = (t.roster && Array.isArray(t.roster.entries)) ? t.roster.entries : [];
    entries.forEach((e) => {
      const p = e && e.playerPoolEntry && e.playerPoolEntry.player;
      if (p) everyPlayer.push(p);
    });
  });

  /* null from resolve() means the pool has never synced — which is a
     different fact from "none of these players matched", and the only one
     with a fix. Kept apart here so the snapshot can say which, rather than
     rendering ten empty rosters as though that were the league. */
  const resolved = everyPlayer.length && resolve
    ? await crosswalk(everyPlayer, resolve)
    : new Map();
  const crosswalkReady = resolved !== null;
  const byName = resolved || new Map();

  const unmatched = [];
  const sleeperId = (p) => {
    const k = espnKey(p);
    if (!k.pos) return null;
    // Club first for a defense — exact, and the only tier that can be.
    if (k.pos === "DST") return k.team || null;
    const hit = byName.get(normalise(k.name) + "|" + k.pos);
    if (!hit) unmatched.push(k.name + " (" + k.pos + (k.team ? " " + k.team : "") + ")");
    return hit || null;
  };

  /* ESPN counts the week as `scoringPeriodId` and answers 0 before the
     season starts. 0 is not a week, and drawing "Wk 0" is worse than
     drawing nothing — the same rule the pipeline follows about a 0 from an
     API meaning missing. Read before the rosters, because each entry's
     projection is keyed on it. */
  const scoringPeriod = Number(league.scoringPeriodId) || null;
  const week = scoringPeriod && scoringPeriod > 0 ? scoringPeriod : null;
  const projSeason = Number(league.seasonId || season) || null;
  const projected = {};
  let projectedCount = 0;
  /* Each rostered player's status as ESPN reports it right now -- see
     status.js for why the rooms stopped reading the nightly board for this.
     `lineupLocked` is ESPN's own flag that a player's game has kicked off:
     his slot can no longer be changed, so he is neither a swap nor a
     "might not play" -- measured true on exactly the nine players from the
     one game already played in week 1. A missing `injuryStatus` on a
     player ESPN is carrying on a live roster is healthy, not unknown. */
  const live = {};

  const teams = rawTeams.map((t) => {
    const entries = (t.roster && Array.isArray(t.roster.entries)) ? t.roster.entries : [];
    const players = [];
    const starters = [];
    /* In the order a manager reads a lineup in, not the order ESPN happens
       to return entries -- measured as WR, WR, QB, FLEX, RB, RB on a real
       team. strategyBoard.js's own comment states the contract this was
       breaking; see slotRank(). Sorted on a copy, because `entries` is the
       response object and everything below reads it too. */
    entries.slice().sort((a, b) => slotRank(a.lineupSlotId) - slotRank(b.lineupSlotId))
      .forEach((e) => {
      const p = e && e.playerPoolEntry && e.playerPoolEntry.player;
      if (!p) return;
      const id = sleeperId(p);
      if (!id) return;
      players.push(id);
      const pts = weekProjection(p, projSeason, week);
      if (pts !== null) { projected[id] = pts; projectedCount += 1; }
      const pe = e.playerPoolEntry || {};
      const inj = injuryCode(p.injuryStatus != null ? p.injuryStatus : e.injuryStatus);
      live[id] = { inj: inj === null ? "" : inj, locked: pe.lineupLocked === true };
      /* 20 is ESPN's bench and 21 its IR. Anything else is a starting slot,
         which is how this stays right when a league adds a FLEX or a
         superflex — enumerating the slots that ARE starting would be a
         second copy of somebody else's roster settings, and wrong the first
         time they changed them. */
      const slot = e.lineupSlotId;
      if (slot !== 20 && slot !== 21) starters.push(id);
    });

    const overall = (t.record && t.record.overall) || {};
    return {
      rosterId: Number(t.id) || null,
      // ESPN's team id, which is what a connected reader's ownerId holds.
      ownerId: String(t.id),
      teamName: teamName(t),
      manager: owners.get(String(t.primaryOwner)) || null,
      avatar: t.logo || null,
      wins: Number(overall.wins) || 0,
      losses: Number(overall.losses) || 0,
      ties: Number(overall.ties) || 0,
      pointsFor: Number(overall.pointsFor) || 0,
      pointsAgainst: Number(overall.pointsAgainst) || 0,
      players,
      starters,
    };
  });

  const snapDraft = draftInfo(league, Date.now());
  const scoring = rulesFromEspn((settings.scoringSettings || {}).scoringItems);
  const lineup = lineupFromEspn(settings.rosterSettings);
  const waiver = waiverFromEspn(settings.acquisitionSettings);
  const tradeDeadline = tradeDeadlineFromEspn(settings.tradeSettings);
  const schedule = scheduleFromEspn(league.schedule);
  const draft = snapDraft.status === "complete"
    ? draftBoard(league, rawTeams, sleeperId)
    : null;

  return {
    reason: null,
    snapshot: {
      provider: "espn",
      leagueId: String(league.id),
      name: String(settings.name || "Untitled league").slice(0, 80),
      season: String(league.seasonId || season),
      totalTeams: Number(settings.size) || teams.length,
      draftAt: snapDraft.at,
      draftStatus: snapDraft.status,
      week,
      seasonType: null,
      /* The league's own projection for this week, per rostered player,
         keyed by the same Sleeper ids as `players`. See weekProjection()
         for why it is read and why it is exact. Stamped with its week so a
         room never serves week 1's number as an answer about week 2 --
         the rule weekProjectionUnder() already follows for Juke's own. Null
         when there is nothing to stamp: before the season, or a league
         whose rosters carry no projection yet. */
      projections: week && projectedCount
        ? { week, source: "espn", points: projected }
        : null,
      /* Live injury designation and lineup lock per rostered player, stamped
         with when it was read so a screen can say how fresh it is. See
         status.js. */
      status: Object.keys(live).length
        ? { week, source: "espn", at: Date.now(), players: live }
        : null,
      /* ESPN's acquisition budget is FAAB where the league uses it, and 0
         (not null) where it does not — so the same falsy check the rest of
         this project applies to a feed's zero. */
      /* FAAB only where the league actually bids.
         
         `acquisitionBudget` is 100 on a league that has never bid a dollar
         -- ESPN carries a default whether or not it applies -- and
         `isUsingAcquisitionBudget` is the flag beside it that says whether
         it means anything. Reading the number alone put "FAAB POOL $100" on
         a league running rolling waiver order, which is not a smaller
         version of the truth but a different waiver system.
         
         This is the "treat 0 from an API as missing" rule inverted: a value
         that is PRESENT and does not apply. The flag was always there. */
      waiverBudget: waiver.type === "faab" ? waiver.budget : null,
      /* How the league actually moves players, so a room can say the right
         thing rather than the only thing it knew how to say. */
      waiver,
      /* When trading closes. See tradeDeadlineFromEspn() for why this
         carries an instant AND a week and fills only the one its platform
         publishes. */
      tradeDeadline,
      /* The league's own scoring, in Juke's vocabulary -- see scoring.js.
         Without it every room scored a real league with whatever the Draft
         Room's mock table happened to say, which understated a measured
         full-PPR week by 13.3 points and skewed the advice with it. */
      /* The completed draft, when there is one. Gated on `complete` rather
         than sent always: it is ~8KB of picks that mean nothing until the
         draft has run, on a payload every room fetches. */
      draft,
      /* The starting lineup, so a room grades the league the reader plays
         rather than the one the Draft Room is set to — the same bug as
         scoring it with the mock table, in a different field. */
      lineup,
      /* Who plays whom, all fourteen weeks, published before the season
         starts. ESPN's team-level projection is not carried here because
         the `projections` field carries it per player -- see matchups.js. */
      schedule,
      rules: scoring.rules,
      /* What this league scores that Juke cannot name. Reported rather than
         dropped, the same discipline unmatched.txt applies to a stat the
         pipeline cannot store. */
      scoringUnmapped: scoring.unmapped,
      playoffTeams: Number((settings.scheduleSettings || {}).playoffTeamCount) || null,
      teams,
      /* Whether there was a crosswalk to consult at all. False means the
         cached Sleeper pool is empty — a fresh deployment before the first
         sync — and every roster above is empty for that reason rather than
         because the league is. A screen that cannot tell those apart will
         report an empty league, which is the one wrong thing to say. */
      crosswalkReady,
      /* What could not be resolved, so a screen can say so rather than a
         roster quietly coming up short. Bounded, because this is drawn and
         a league of unmatched names is a report rather than a message. */
      unmatched: unmatched.slice(0, 12),
      unmatchedCount: unmatched.length,
    },
  };
}


/* The league's recent moves, with the dropped players named.
 *
 * Its own call rather than a view on the snapshot, for the reasons
 * transactions.js gives: one room wants it, it grows all season, and naming
 * a DROP needs a second request the snapshot would otherwise make on every
 * room load for nothing.
 *
 * ---- Two requests, and the second is bounded by the first ----
 *
 * mTransactions2 is 58 KB and carries bare player ids. The names come from
 * `kona_player_info` filtered to exactly the ids in the window -- about
 * 7 KB each, measured -- so the cost is set by how much the league has
 * actually done, not by the size of the player universe. A quiet week costs
 * almost nothing; the 3.9 MB unfiltered fetch is never made.
 *
 * The filter goes in a header because that is where ESPN takes it. */
export async function leagueTransactions(leagueId, season, base, resolve, limit) {
  const res = await getJson(
    leaguePath(leagueId, season, ["mTransactions2"]), base
  );
  if (!res.ok || !res.body) {
    return { reason: res.status === 401 || res.status === 403 ? "private"
                   : (res.status === 404 || res.status === 400) ? "not-found"
                   : "offline", feed: null };
  }

  const all = res.body.transactions;
  const ids = playersInFeed(all, limit || FEED_LIMIT);
  if (!ids.length) return { reason: null, feed: null };

  const filtered = await getJson(
    leaguePath(leagueId, season, ["kona_player_info"]), base,
    { "x-fantasy-filter": JSON.stringify({ players: { filterIds: { value: ids } } }) }
  );

  const byId = new Map();
  const everyPlayer = [];
  ((filtered.ok && filtered.body && filtered.body.players) || []).forEach((e) => {
    const p = e && e.player;
    if (!p) return;
    byId.set(Number(e.id !== undefined ? e.id : p.id), p);
    everyPlayer.push(p);
  });

  /* The same crosswalk the rosters use, so a move reaches the board through
     one join rather than a second opinion about who a name is. */
  const resolved = everyPlayer.length && resolve ? await crosswalk(everyPlayer, resolve) : new Map();
  const byName = resolved || new Map();

  const nameFor = (playerId) => {
    const p = byId.get(Number(playerId));
    if (!p) return null;
    const k = espnKey(p);
    if (!k.name) return null;
    const id = k.pos === "DST" ? (k.team || null)
             : byName.get(normalise(k.name) + "|" + k.pos) || null;
    return { name: k.name, pos: k.pos, team: k.team, id };
  };

  return { reason: null, feed: feedFromEspn(all, nameFor, limit) };
}
