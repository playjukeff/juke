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

  const draft = pickDraft(drafts, league.season);
  const scoring = rulesFromSleeper(league.scoring_settings);
  const lineup = lineupFromSleeper(league.roster_positions);
  const waiver = waiverFromSleeper(league.settings);

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
    week: state && Number(state.week) ? Number(state.week) : null,
    seasonType: (state && state.season_type) || null,
    // The two settings a room actually branches on. Everything else in
    // league.settings stays at Sleeper until something needs it.
    waiverBudget: waiver.type === "faab" ? waiver.budget : null,
    waiver,
    /* The league's own scoring, in Juke's vocabulary -- which for Sleeper
       IS its own, because STAT_FIELDS took these key names from it. See
       scoring.js for why a room may not go on scoring a real league with
       the Draft Room's mock table. */
    lineup,
    rules: scoring.rules,
    scoringUnmapped: scoring.unmapped,
    playoffTeams: Number((league.settings || {}).playoff_teams) || null,
    teams,
  };
}
