/* Sleeper, read-only, through the worker.

   ---- Why the browser does not talk to Sleeper directly ----

   It could: the API is public, needs no key, and sends permissive CORS —
   verified from a real browser, not assumed. Three reasons it goes through
   here anyway.

   The connection has to live somewhere per-account, which is D1, which is
   this worker. Once the worker is in the path for the write, having the
   page fetch the reads from somewhere else is two paths to one feature.

   A league snapshot is four upstream calls (league, rosters, users, state)
   and the answers change slowly — a roster moves on waiver day, not on page
   load. Cached here, one reader costs Sleeper four calls a minute at worst
   instead of four per navigation.

   And it keeps `api.sleeper.app` out of the page's `connect-src`. The CSP
   is enforced (see CLAUDE.md's Security section) and every host in it is a
   run-time dependency the page cannot render without; ESPN's scoreboard is
   the only one today and it is documented as such. One is a considered
   exception. Two is a pattern.

   ---- Nothing here can write ----

   Every function below is a GET. Sleeper's public API has no write
   endpoints, so "read-only" is a property of the surface rather than a
   discipline this file has to keep — which is what makes the promise on
   every unlock card ("Juke never edits your league") cheap to honour.

   ---- Failure is a value, never a throw ----

   Same contract as store.js: an unreachable Sleeper, a changed response
   shape and a username that does not exist all answer null or an empty
   list. A caller then treats "could not connect" and "no such user"
   identically at the boundary and tells them apart by the shape it got
   back, rather than by catching. */

/* The real upstream, and the one knob that lets it be something else.

   `SLEEPER_BASE` in the worker's env overrides it, exactly as
   `TANK01_BASE` already does for the news route and for the same reason:
   this file's real work is parsing and joining four responses, and none
   of that can be exercised against a league that does not exist, a 500, a
   truncated body or a renamed field while the host is a constant.

   It is a parameter rather than a module-level `let` so a test can drive
   two bases in one process without the second one inheriting the first —
   and so nothing here holds state between requests, which a Worker is
   entitled to reuse across them.

   Leave it unset in production. */
import { rulesFromSleeper } from "./scoring.js";
import { lineupFromSleeper } from "./lineup.js";
import { injuryCode } from "./status.js";

export const SLEEPER_API = "https://api.sleeper.app/v1";

// Long enough that a page navigation is free, short enough that a waiver
// claim shows up while somebody is still looking at the screen. The news
// route's own TTL is 900s for a feed that changes far less often.
export const SNAPSHOT_TTL = 120;

// A league with more of these than a real league has is a malformed
// response or somebody else's problem, not something to render.
const MAX_ROSTERS = 32;

async function getJson(path, base) {
  try {
    const res = await fetch((base || SLEEPER_API) + path, {
      headers: { accept: "application/json" },
    });
    // Sleeper answers 404 with an empty body for an unknown user, and
    // `null` (valid JSON) for an unknown league — both are "no", and
    // neither is an error worth logging.
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("sleeper fetch failed:", path, err && err.message);
    return null;
  }
}

/* The current NFL week, which is what "Wk 3" in the header chip means.

   Not derived from a calendar here. Sleeper publishes its own idea of the
   week and every league on it is scored against that, so computing a
   second one from the date would put the chip and the league's own
   matchups one apart in exactly the weeks that are ambiguous — the ones
   either side of a Tuesday rollover. */
export function nflState(base) {
  return getJson("/state/nfl", base);
}

/* A username to the leagues behind it, in one call from the page's side.

   Sleeper needs two requests for this (username -> user_id -> leagues) and
   the connect screen has no use for the first on its own, so they are
   joined here rather than the client making two round trips and holding an
   id it does not otherwise want.

   Answers `{ user: null, leagues: [] }` for a username that does not
   exist, which is the same shape as a Sleeper outage on purpose: the
   screen says "we could not find that username" either way, and guessing
   which it was would be a worse message than the honest one. */
export async function lookupUser(username, season, base) {
  const user = await getJson("/user/" + encodeURIComponent(username), base);
  if (!user || !user.user_id) return { user: null, leagues: [] };

  const raw = await getJson(
    "/user/" + encodeURIComponent(user.user_id) + "/leagues/nfl/" + encodeURIComponent(season),
    base
  );
  const leagues = Array.isArray(raw) ? raw : [];

  return {
    user: { userId: String(user.user_id), name: user.display_name || user.username || username },
    // Only the fields the picker draws. The full league object carries
    // scoring settings, roster positions, draft ids and more, and none of
    // that belongs in a list somebody is choosing a name from — it is
    // fetched again, whole, once they have chosen.
    leagues: leagues.slice(0, 50).map((l) => ({
      leagueId: String(l.league_id),
      name: String(l.name || "Untitled league"),
      season: String(l.season || season),
      totalTeams: Number(l.total_rosters) || null,
      avatar: l.avatar || null,
    })),
  };
}

/* Which of a league's drafts is THE draft.

   Almost always one. A dynasty league accumulates them — one per season —
   so the season is what picks, and the newest is the fallback for a league
   whose drafts do not carry one. Ordered by start time rather than by array
   position, because the endpoint does not promise an order.

   Answers nulls rather than throwing for a league with no draft scheduled,
   which is an ordinary state and not an error: a Sleeper league exists
   before anybody sets a time.

   `status` is Sleeper's own — "pre_draft", "drafting", "complete" — passed
   through rather than translated, so the two providers are mapped to one
   vocabulary in exactly one place (draftPhase(), below) instead of each
   inventing its own.

   **A time with no draft behind it is not a time.** `start_time` is present
   on a completed draft too, pointing at when it happened, so anything
   drawing a countdown has to read the status as well or it will count down
   to a draft that finished last month. */
function pickDraft(drafts, season) {
  const list = Array.isArray(drafts) ? drafts.filter(Boolean) : [];
  if (!list.length) return { at: null, status: null };

  const forSeason = list.filter((d) => String(d.season || "") === String(season || ""));
  const pool = forSeason.length ? forSeason : list;
  const best = pool.slice().sort((a, b) => Number(b.start_time || 0) - Number(a.start_time || 0))[0];

  return {
    at: Number(best.start_time) || null,
    status: best.status ? String(best.status) : null,
  };
}

/* Everything a connected league's screens need, in one object.

   Four upstream calls in parallel rather than in sequence: they do not
   depend on each other, and a snapshot that takes four round trips end to
   end is the difference between a screen that appears and one that
   assembles itself.

   Returns null if the league itself could not be read. A missing rosters
   or users array is survivable and comes back empty — the standings table
   then draws nothing rather than the page failing — but a league that does
   not answer at all is a league that is not there, and saying so is more
   useful than an empty table under its name. */
/* How a Sleeper league moves unowned players.
 *
 * `waiver_type` is Sleeper's own: 2 is FAAB, anything else is an order --
 * rolling, or reverse standings. Taken from Sleeper's documented values and
 * NOT derived from a real league, unlike ESPN's, which was read off a
 * settings page that says what it does. Stated here so the next person
 * knows which of the two adapters has evidence behind it.
 *
 * The budget is only reported for a FAAB league, for the reason espn.js
 * gives at length: a pool on a league that does not bid is not a smaller
 * truth, it is a different waiver system. */
function waiverFromSleeper(settings) {
  const s = settings || {};
  const faab = Number(s.waiver_type) === 2;
  const budget = Number(s.waiver_budget);
  const days = Number(s.waiver_clear_days);
  return {
    type: faab ? "faab" : "order",
    budget: faab && Number.isFinite(budget) && budget > 0 ? budget : null,
    minimumBid: null,
    // Sleeper does not publish an equivalent of "never reset", so this is
    // absent rather than guessed at.
    resetsOrder: null,
    hours: Number.isFinite(days) && days > 0 ? days * 24 : null,
  };
}

/* Sleeper's half of the trade deadline. See tradeDeadlineFromEspn() in
   espn.js for why both a week and an instant ride on the snapshot and why
   neither adapter fills the other's field.

   `trade_deadline` is a WEEK number (measured: 11 on a real league), and
   `disable_trades` is the flag beside it -- the same "a value that is
   present and does not apply" trap `acquisitionBudget` set for the waiver
   reading, so it is read rather than left to a screen to discover by
   counting down to a deadline in a league that never allows a trade.

   WHICH SIDE OF THE WEEK IS UNMEASURED, and the uncertainty is resolved in
   the direction that errs open: no Sleeper league past its own deadline was
   available to check, so the deadline week itself is treated as still open
   and only a LATER week reads as passed. Being wrong that way tells a reader
   the window is open for one week longer than it is; the other way tells
   them it is shut while they can still trade, which is worse. */
function tradeDeadlineFromSleeper(settings) {
  const s = settings || {};
  const week = Number(s.trade_deadline);
  return {
    at: null,
    // Sleeper sends 0 for a league with no deadline, which is the falsy-feed
    // rule this project already applies everywhere else.
    week: Number.isFinite(week) && week > 0 ? week : null,
    disabled: Number(s.disable_trades) === 1,
  };
}

/* ---- The week's own projection and the week's own status ----

   Both live outside /v1, on the same host: the projection file Sleeper's
   app reads (`/projections/nfl/<season>/<week>`) and the season schedule
   (`/schedule/nfl/regular/<season>`). Neither takes a league, so they are
   derived from the base rather than given a second knob -- a stub serving
   `/v1/...` serves these beside it, and production strips `/v1` off the
   real host. */
function feedBase(base) {
  return String(base || SLEEPER_API).replace(/\/v1\/?$/, "");
}

const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

export function projectionPath(season, week) {
  return "/projections/nfl/" + encodeURIComponent(season) + "/" + encodeURIComponent(week) +
    "?season_type=regular&" + PROJECTION_POSITIONS.map((p) => "position[]=" + p).join("&");
}

/* What Sleeper's app prints as a player's projection: his projected stat
   line multiplied through the league's own `scoring_settings`, key for key.

   Measured on 10 September 2026 against a real league's week 1: the nine
   starters summed this way came to 125.47, which is the number Sleeper's
   own matchup screen showed for the same lineup to the hundredth. So it is
   not a model of Sleeper's projection but the arithmetic it is made of,
   the same finding espn.js records for ESPN's `appliedTotal`.

   Every key the league scores is read, not only the ones Juke has a rule
   for -- `bonus_rec_wr`, the points-allowed tiers, anything -- because the
   league's table is the authority here and a rule Juke's vocabulary cannot
   name is still a rule the league pays.

   A row with nothing the league scores is 0, and that is the platform's
   answer rather than a missing one: a player ruled out carries a row with
   no projected line in it (measured, TreVeyon Henderson, week 1: only an
   ADP field) and Sleeper shows him at zero. Absence -- no row at all -- is
   what answers null, and a caller falls back to Juke's own number. */
export function sleeperLinePoints(stats, scoring) {
  if (!stats || typeof stats !== "object" || !scoring || typeof scoring !== "object") return null;
  let total = 0;
  for (const key of Object.keys(scoring)) {
    const rate = Number(scoring[key]);
    const n = Number(stats[key]);
    if (!rate || !Number.isFinite(rate) || !n || !Number.isFinite(n)) continue;
    total += rate * n;
  }
  return Math.round(total * 10000) / 10000;
}

/* Which clubs' games have kicked off this week. A lineup cannot be changed
   for a player whose game is under way or over, so he is neither a swap nor
   a "might not play" -- he played, or he did not. `in_game` and `complete`
   are Sleeper's own words; `pre_game` is the only other one it uses. The
   schedule carries a date but no kickoff time, so the status is the whole
   of the evidence and nothing is guessed from a clock. */
function lockedClubs(schedule, week) {
  const out = new Set();
  (Array.isArray(schedule) ? schedule : []).forEach((g) => {
    if (!g || Number(g.week) !== Number(week)) return;
    const st = String(g.status || "");
    if (st !== "in_game" && st !== "complete") return;
    if (g.home) out.add(String(g.home));
    if (g.away) out.add(String(g.away));
  });
  return out;
}

/* Every player's already-scored points for one week, flattened out of
   sleeperWeek()'s per-side starters/bench arrays. A CANDIDATE only -- see
   the locked gate in leagueSnapshot() for why a candidate here is not yet
   an actual: sleeperWeek()'s own docstring says a "live" week reports a
   literal 0.0 for a player whose own game has not started, and 0 is not a
   score. */
function sleeperWeekPoints(view) {
  const out = new Map();
  if (!view || !Array.isArray(view.games)) return out;
  view.games.forEach((g) => {
    (g.teams || []).forEach((side) => {
      (side.starters || []).concat(side.bench || []).forEach((row) => {
        if (row && row.id && typeof row.points === "number" && Number.isFinite(row.points)) {
          out.set(row.id, row.points);
        }
      });
    });
  });
  return out;
}

export async function leagueSnapshot(leagueId, base) {
  const id = encodeURIComponent(leagueId);
  const [league, rosters, users, state, drafts] = await Promise.all([
    getJson("/league/" + id, base),
    getJson("/league/" + id + "/rosters", base),
    getJson("/league/" + id + "/users", base),
    nflState(base),
    /* When the draft is, which is the one thing a connected league can say
       before it has any rosters to show.

       `/league/<id>/drafts` rather than `/draft/<draft_id>`, even though the
       league object carries `draft_id` and the single-draft call is the more
       obvious one: `draft_id` only arrives with the league response, so
       asking for the draft would have to wait for it. This depends on
       nothing, so it joins the batch above and costs no latency at all. */
    getJson("/league/" + id + "/drafts", base),
  ]);

  if (!league || !league.league_id) return null;

  const byOwner = new Map();
  (Array.isArray(users) ? users : []).forEach((u) => {
    if (u && u.user_id) byOwner.set(String(u.user_id), u);
  });

  const teams = (Array.isArray(rosters) ? rosters : []).slice(0, MAX_ROSTERS).map((r) => {
    const owner = byOwner.get(String(r.owner_id)) || {};
    const s = r.settings || {};
    // Sleeper splits points into whole and hundredths across two fields.
    // Joined here rather than in the component, so nothing downstream has
    // to know that fpts_decimal exists.
    const pts = (n, dec) => Number(n || 0) + Number(dec || 0) / 100;
    return {
      rosterId: Number(r.roster_id) || null,
      ownerId: r.owner_id ? String(r.owner_id) : null,
      // metadata.team_name is what a manager typed; display_name is their
      // account. The team name is the one on the standings sheet in every
      // fantasy app, so it leads and the account name is the fallback.
      teamName: (owner.metadata && owner.metadata.team_name) || owner.display_name || "Unclaimed",
      manager: owner.display_name || null,
      avatar: owner.avatar || null,
      wins: Number(s.wins) || 0,
      losses: Number(s.losses) || 0,
      ties: Number(s.ties) || 0,
      pointsFor: pts(s.fpts, s.fpts_decimal),
      pointsAgainst: pts(s.fpts_against, s.fpts_against_decimal),
      // The roster itself, as Sleeper player ids — which are the same ids
      // players.js and stats.js are keyed by, so these map straight onto
      // Juke's own projections with no crosswalk. That identity is the
      // whole reason a connected league is worth anything here.
      players: Array.isArray(r.players) ? r.players.map(String) : [],
      starters: Array.isArray(r.starters) ? r.starters.map(String) : [],
    };
  });

  /* The week's projection and status, fetched only once the league and the
     week are known -- neither feed is keyed on anything else, and a
     preseason or postseason week is not a regular-season projection.

     Two more upstream calls, and the projection file is the heavy one
     (about 2 MB for every player at every position). It is the same file
     for every league, so Sleeper's own edge answers it (s-maxage=600) and
     the route caches the whole snapshot for SNAPSHOT_TTL on top. A failure
     of either is a value like everything else here: no projection, no
     status, and the rooms read Juke's own numbers exactly as before. */
  const week = state && Number(state.week) ? Number(state.week) : null;
  const regular = !state || !state.season_type || String(state.season_type) === "regular";
  const season = String(league.season || (state && state.season) || "");
  let feed = null;
  let schedule = null;
  let matchupRows = null;
  if (week && regular && season) {
    const fb = feedBase(base);
    /* The matchups endpoint is under /v1, like every /league/ route -- base,
       never feedBase(). It rides on the same round trip as the projection
       and the schedule rather than a fourth call: nothing here depends on
       it, and it costs nothing if it fails (see the actuals gate below). */
    [feed, schedule, matchupRows] = await Promise.all([
      getJson(projectionPath(season, week), fb),
      getJson("/schedule/nfl/regular/" + encodeURIComponent(season), fb),
      getJson("/league/" + id + "/matchups/" + encodeURIComponent(String(week)), base),
    ]);
  }
  const rostered = new Set();
  teams.forEach((t) => t.players.forEach((id) => rostered.add(id)));
  const rows = new Map();
  (Array.isArray(feed) ? feed : []).forEach((r) => {
    const id = r && r.player_id != null ? String(r.player_id) : "";
    if (id && rostered.has(id) && !rows.has(id)) rows.set(id, r);
  });

  const points = {};
  let scored = 0;
  const live = {};
  const locked = lockedClubs(schedule, week);
  rows.forEach((r, id) => {
    const pts = sleeperLinePoints(r.stats, league.scoring_settings);
    if (pts !== null) {
      points[id] = pts;
      if (pts) scored += 1;
    }
    const pl = r.player || {};
    const club = String(r.team || pl.team || "");
    /* Sleeper's own designation, as its app shows it right now -- see
       status.js. `null` and "" on a row Sleeper sent are healthy; a word
       the vocabulary cannot read ("NA") leaves the board's value alone. */
    const raw = pl.injury_status;
    const inj = raw === null || raw === undefined ? "" : injuryCode(raw);
    const entry = { locked: !!club && locked.has(club) };
    if (inj !== null) entry.inj = inj;
    live[id] = entry;
  });

  /* What each rostered player has ALREADY scored this week -- Sleeper's own
     precomputed points off the matchups endpoint, never a Juke recomputation.
     Gated on the SAME `locked` flag `live` already carries, built from the
     same `lockedClubs(schedule, week)` set: sleeperWeek()'s own docstring
     states that a "live" week reports every rostered player a real number,
     with a player whose own game has not kicked off showing a literal 0.0
     -- not null, not omitted. Treating that 0.0 as an already-scored,
     zero-variance actual would be exactly the "treat 0 from a feed as
     missing" failure this project has a rule against, so a candidate here
     is included only once his own club is confirmed locked. A candidate
     with no entry in `live` at all -- a player the projections feed never
     carried a row for -- is left out rather than guessed at. */
  let actuals = null;
  if (Array.isArray(matchupRows)) {
    const view = sleeperWeek(league, state, matchupRows, week);
    if (view && (view.phase === "live" || view.phase === "final")) {
      const gated = {};
      let gatedCount = 0;
      sleeperWeekPoints(view).forEach((pts, pid) => {
        if (live[pid] && live[pid].locked === true) {
          gated[pid] = { points: pts };
          gatedCount += 1;
        }
      });
      if (gatedCount) actuals = { week, source: "sleeper", at: Date.now(), players: gated };
    }
  }

  const draft = pickDraft(drafts, league.season);
  const scoring = rulesFromSleeper(league.scoring_settings);
  const lineup = lineupFromSleeper(league.roster_positions);
  const waiver = waiverFromSleeper(league.settings);
  const tradeDeadline = tradeDeadlineFromSleeper(league.settings);

  return {
    leagueId: String(league.league_id),
    name: String(league.name || "Untitled league"),
    /* Epoch MILLISECONDS, which is what Sleeper sends and what a browser
       counts down from. Every D1 timestamp in this project is seconds and
       the route converts once on the way in, the same way meHistoryRoute()
       already does for completedAt rather than asking store.js to guess
       which unit a caller meant. */
    draftAt: draft.at,
    draftStatus: draft.status,
    season: String(league.season || ""),
    totalTeams: Number(league.total_rosters) || teams.length,
    week,
    seasonType: (state && state.season_type) || null,
    // The two settings a room actually branches on. Everything else in
    // league.settings stays at Sleeper until something needs it.
    waiverBudget: waiver.type === "faab" ? waiver.budget : null,
    waiver,
    /* When trading closes -- a week here, an instant on ESPN, and the
       snapshot carries both so a screen asks one question. */
    tradeDeadline,
    /* The league's own scoring, in Juke's vocabulary -- which for Sleeper
       IS its own, because STAT_FIELDS took these key names from it. See
       scoring.js for why a room may not go on scoring a real league with
       the Draft Room's mock table. */
    lineup,
    rules: scoring.rules,
    scoringUnmapped: scoring.unmapped,
    playoffTeams: Number((league.settings || {}).playoff_teams) || null,
    /* The league's own projection for this week, per rostered player, in
       the shape espn.js publishes -- see sleeperLinePoints(). Null unless
       at least one rostered player projects to something: a file served
       before Sleeper has filled a week in carries rows with nothing in
       them, and a lineup of zeros is not an answer about anybody. */
    projections: week && scored
      ? { week, source: "sleeper", points }
      : null,
    /* What each rostered player has ALREADY scored this week -- see the
       gate above. Null before any game this week has kicked off, and per
       player rather than per lineup: a starter whose game has not started
       carries no entry here, never a zero standing in for "not yet". */
    actuals,
    /* Live designation and game lock per rostered player -- see status.js. */
    status: week && rows.size
      ? { week, source: "sleeper", at: Date.now(), players: live }
      : null,
    teams,
  };
}

/* ---- One week's matchups ----

   Sleeper publishes no season schedule (matchups.js says so at length), and
   that is the one thing a matchup screen cannot do without. What it DOES
   publish is `/league/<id>/matchups/<week>`: every roster in the league for
   that week, paired by a shared `matchup_id`, with its points, its starters
   in slot order, the points each starter scored and the points every
   rostered player scored. One call per week, so this is its own route
   rather than a field on the snapshot -- fourteen or more calls a season is
   a different cost from a view on a request already being made.

   Measured 11 September 2026 against two real public leagues, a finished
   2025 one and an in-season 2026 one (twelve teams each):

     - A played week carries real points on every row and a pairing for
       every roster.
     - A week not yet played is already paired (the regular season is
       generated up front) and every points field is 0.0. **0 is not a
       result** -- the rule matchups.js applies to ESPN on the way in -- so
       an upcoming week publishes null points here.
     - The week in progress carries partial points: the Thursday game's
       players have theirs, everybody else 0.0. It is published as `live`,
       never as a score.
     - A playoff week that has been played pairs the bracket and the
       consolation games alike, and a roster with no game that week (a
       first-round bye, or eliminated) has `matchup_id: null`.
     - **A playoff week NOT yet played is paired too, and the pairing is not
       the bracket** -- the in-season league already pairs week 15 before a
       seed exists. So an upcoming playoff week publishes no games at all
       and says the bracket is not set, rather than an opponent Sleeper has
       not actually decided.

   Which weeks are regular season is read off the league
   (`playoff_week_start`), and how many playoff weeks there are is derived
   from `playoff_teams` and `playoff_round_type` -- one week a round, a
   two-week final, or two weeks a round. Derived, and checked: the finished
   league's six teams at one week a round come out at week 17, which is its
   own `last_scored_leg`. Nothing here is a guess at a calendar.

   Whether a week is final, live or upcoming is read off Sleeper's own
   /state/nfl against the league's season, never off a clock -- the same
   reason nflState() gives for the header's week. */

const PLAYOFF_ROUND_WEEKS = { 0: [1, 0], 1: [1, 1], 2: [2, 0] };

export function sleeperSeasonShape(settings) {
  const s = settings || {};
  const start = Number(s.playoff_week_start);
  if (!Number.isFinite(start) || start < 2 || start > 19) return { regularSeasonWeeks: null, weeks: null };
  const regular = start - 1;
  const seeds = Number(s.playoff_teams);
  if (!Number.isFinite(seeds) || seeds < 2) return { regularSeasonWeeks: regular, weeks: null };
  const rounds = Math.ceil(Math.log2(seeds));
  const [perRound, extraFinal] = PLAYOFF_ROUND_WEEKS[Number(s.playoff_round_type) || 0] || PLAYOFF_ROUND_WEEKS[0];
  return { regularSeasonWeeks: regular, weeks: regular + rounds * perRound + extraFinal };
}

/* The week a league is in, from Sleeper's own state: 0 when nothing has
   been played, Infinity once the league's season is over. */
export function sleeperCurrentWeek(league, state) {
  if (!league) return 0;
  if (String(league.status || "") === "complete") return Infinity;
  const season = String(league.season || "");
  if (!state || !season) return 0;
  const stateSeason = String(state.season || "");
  if (stateSeason && Number(stateSeason) > Number(season)) return Infinity;
  if (stateSeason !== season) return 0;
  const type = String(state.season_type || "regular");
  if (type === "pre") return 0;
  if (type === "post" || type === "off") return Infinity;
  const week = Number(state.week);
  return Number.isFinite(week) && week > 0 ? week : 0;
}

function pts(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/* One roster's side of a week, in Sleeper's own words. `starters` keeps the
   slot order (a "0" pads an empty slot, and stays as a row with no player
   so the lineup is not silently shortened); the bench is every other player
   who scored, highest first. Points are the platform's own -- Sleeper's
   `starters_points` and `players_points`, never a Juke recomputation. */
function sleeperSide(row, scored) {
  const starters = Array.isArray(row.starters) ? row.starters.map(String) : [];
  const sp = Array.isArray(row.starters_points) ? row.starters_points : [];
  const pp = row.players_points && typeof row.players_points === "object" ? row.players_points : {};
  const starting = new Set(starters);
  const bench = Object.keys(pp)
    .filter((id) => !starting.has(String(id)))
    .map((id) => ({ id: String(id), points: scored ? pts(pp[id]) : null }))
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  return {
    rosterId: Number(row.roster_id) || null,
    points: scored ? pts(row.points) : null,
    starters: starters.map((id, i) => ({
      id: id === "0" ? null : id,
      points: scored && id !== "0" ? pts(sp[i] !== undefined ? sp[i] : pp[id]) : null,
    })),
    bench: bench.slice(0, 30),
  };
}

/* The pure half: Sleeper's three answers to one week's view. */
export function sleeperWeek(league, state, rows, week) {
  if (!league || !league.league_id) return null;
  const shape = sleeperSeasonShape(league.settings);
  const current = sleeperCurrentWeek(league, state);
  const phase = week < current ? "final" : week === current ? "live" : "upcoming";
  const playoff = !!(shape.regularSeasonWeeks && week > shape.regularSeasonWeeks);
  const scored = phase !== "upcoming";

  const groups = new Map();
  const unpaired = [];
  (Array.isArray(rows) ? rows : []).slice(0, MAX_ROSTERS).forEach((r) => {
    if (!r || r.roster_id === undefined || r.roster_id === null) return;
    const mid = r.matchup_id;
    if (mid === null || mid === undefined) { unpaired.push(Number(r.roster_id)); return; }
    if (!groups.has(mid)) groups.set(mid, []);
    groups.get(mid).push(r);
  });

  /* An upcoming playoff week's pairing is not the bracket -- see above. */
  const bracketPending = playoff && phase === "upcoming";
  const games = [];
  if (!bracketPending) {
    groups.forEach((pair, mid) => {
      if (pair.length !== 2) { pair.forEach((r) => unpaired.push(Number(r.roster_id))); return; }
      const sides = pair.map((r) => sleeperSide(r, scored)).sort((a, b) => a.rosterId - b.rosterId);
      games.push({ matchupId: Number(mid), teams: sides });
    });
    games.sort((a, b) => a.matchupId - b.matchupId);
  }

  return {
    leagueId: String(league.league_id),
    season: String(league.season || ""),
    week,
    phase,
    playoff,
    bracketPending,
    currentWeek: Number.isFinite(current) ? current : null,
    seasonOver: current === Infinity,
    regularSeasonWeeks: shape.regularSeasonWeeks,
    weeks: shape.weeks,
    games,
    /* Rosters with no game this week: a bye in an odd-sized league, a
       first-round playoff bye, or a team out of the playoffs. Stated rather
       than dropped, so a screen can say which team has no game. */
    noGame: bracketPending ? [] : unpaired.filter((n) => Number.isFinite(n)).sort((a, b) => a - b),
  };
}

/* `{ view, reason }`, the shape espn.js's reads answer in: a league that is
   not there is `not-found`, and a league that answered with a week that did
   not is `upstream` -- an empty list is Sleeper saying the week has no
   pairings yet, and a failed fetch is not that, so the two are kept apart
   rather than both drawing "no games". */
export async function leagueMatchups(leagueId, week, base) {
  const w = Number(week);
  if (!Number.isInteger(w) || w < 1 || w > 22) return { view: null, reason: "bad-request" };
  const id = encodeURIComponent(leagueId);
  const [league, rows, state] = await Promise.all([
    getJson("/league/" + id, base),
    getJson("/league/" + id + "/matchups/" + encodeURIComponent(String(w)), base),
    nflState(base),
  ]);
  if (!league || !league.league_id) return { view: null, reason: "not-found" };
  if (!Array.isArray(rows)) return { view: null, reason: "upstream" };
  return { view: sleeperWeek(league, state, rows, w), reason: null };
}
