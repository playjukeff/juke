/* CBS, read-only, through the worker.
 *
 * The third adapter, and it answers the same vocabulary the other two do:
 * Sleeper-id-keyed rosters and `pre_draft`/`drafting`/`complete`. A fourth
 * platform is a fourth file here, not a fourth vocabulary in the UI.
 *
 * Everything below was measured against a real league on 15 September 2026
 * rather than read off documentation, because there is none: CBS's own
 * Swagger document (`/api/docs?version=4.0`, the only resource with a v4)
 * answers with an empty `paths` object and names nothing.
 *
 * ---- The SUBDOMAIN is the league, and `league_id` is ignored ----
 *
 * This is the single most surprising thing about the API and the one a
 * reader of the routes below would otherwise get wrong. Every endpoint
 * REQUIRES a `league_id` parameter and then pays no attention to it:
 * `league_id=1` against `sanctuaryfootballleague.football.cbssports.com`
 * answers with Sanctuary Football League, twelve teams, its own divisions.
 *
 * So the slug in the host is the league's identity, `CBS_ANY_ID` is a
 * constant that exists only to satisfy a required parameter, and there is
 * no per-league id to look up or store beyond the slug itself.
 *
 * That also explains the shape of the refusals. Anonymously, a request
 * with no `league_id` answers "Missing league_id" and one WITH it answers
 * "User not signed in" -- presence is checked before auth, so the two
 * errors say nothing about each other.
 *
 * ---- One cookie, and it does not expire ----
 *
 * Auth is a single cookie: `pid`. Measured by elimination against the real
 * league -- 51 cookies in a signed-in browser, removed one at a time, and
 * exactly one turned out to be required. `auth_state`, `ppid`, `userId` and
 * `minUnifiedSessionToken10` all look like candidates and all are
 * droppable.
 *
 * **It is set with `expires` in 2037 on `.cbssports.com`.** ESPN's
 * `espn_s2` rotates, so that dialog can honestly promise a credential
 * expires on its own; this one does not, and disconnecting is the only
 * revocation Juke can offer. The card that asks for it has to say so --
 * copy that quietly inherits a sentence from the platform beside it is the
 * stale-claim failure CLAUDE.md already has a rule about.
 *
 * ---- Failure is a value, never a throw ----
 *
 * Same contract as sleeper.js and espn.js. An unreachable CBS, a changed
 * shape and a slug nobody owns all come back as a reason string, so a
 * caller tells them apart by what it got rather than by catching. */

import { normalise } from "./names.js";
import { rulesFromCbs } from "./scoring.js";
import { injuryCode } from "./status.js";
import { scheduleFromCbs } from "./matchups.js";

/* The required-and-ignored parameter. Named so nobody reading a call site
   mistakes it for an id anybody chose. */
const CBS_ANY_ID = "1";

const MAX_TEAMS = 32;

/* A slug becomes a HOSTNAME, which makes validating it the difference
   between an adapter and an open proxy. Letters, digits and hyphens only,
   no dots, bounded -- so nothing here can be steered at another host by
   way of `evil.com#`, a second label, or a userinfo `@`. Checked before the
   URL is built rather than after, because a URL that parses is not a URL
   that points where you meant. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function cbsHost(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!SLUG.test(s)) return null;
  return "https://" + s + ".football.cbssports.com";
}

/* A league URL is what a reader actually has, so this takes either. Returns
   the slug or null -- and it refuses anything that is not a CBS fantasy
   host rather than trusting the first label of whatever was pasted. */
export function cbsSlug(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (!raw.includes("/") && !raw.includes(".")) return SLUG.test(raw.toLowerCase()) ? raw.toLowerCase() : null;
  let u;
  try { u = new URL(raw.includes("://") ? raw : "https://" + raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!host.endsWith(".football.cbssports.com")) return null;
  const slug = host.slice(0, -".football.cbssports.com".length);
  return SLUG.test(slug) ? slug : null;
}

/* `base` is a string or `{ base, cookie }`, exactly as espn.js takes it and
   for the same reason: the credential travels with the thing it is a
   credential FOR, rather than as a trailing argument that would sit at a
   different index in every exported function. */
function sourceOf(base, slug) {
  if (base && typeof base === "object") {
    return { url: base.base || cbsHost(slug), cookie: base.cookie || null };
  }
  return { url: base || cbsHost(slug), cookie: null };
}

export function cbsSource(base, cred) {
  const pid = cred && cred.pid;
  if (!pid) return base || null;
  return { base: base || null, cookie: "pid=" + pid };
}

async function getJson(slug, path, base) {
  const src = sourceOf(base, slug);
  if (!src.url) return { ok: false, status: 0, body: null, signedOut: false };
  const url = src.url + "/api/" + path +
    (path.includes("?") ? "&" : "?") +
    "version=3.0&response_format=json&league_id=" + CBS_ANY_ID;
  try {
    const res = await fetch(url, {
      headers: Object.assign({ accept: "application/json" },
                             src.cookie ? { cookie: src.cookie } : null),
    });
    const text = await res.text();
    /* CBS answers 200 with a PLAIN-TEXT body for both of its refusals --
       "User not signed in" and "Missing league_id" -- so the status line is
       not the answer and a caller that read it would treat a refusal as a
       league. Read the body, which is the same rule this project already
       states about /me/history. */
    if (/^\s*User not signed in/i.test(text)) {
      return { ok: false, status: res.status, body: null, signedOut: true };
    }
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!res.ok || !body) return { ok: false, status: res.status, body: null, signedOut: false };
    return { ok: true, status: res.status, body, signedOut: false };
  } catch (err) {
    console.error("cbs fetch failed:", path, err && err.message);
    return { ok: false, status: 0, body: null, signedOut: false };
  }
}

const bodyOf = (res, key) => (res.ok && res.body && res.body.body && res.body.body[key]) || null;

/* ----------------------------------------------------------
   The pieces
   ---------------------------------------------------------- */

/* CBS spells Jacksonville JAC and the pipeline spells it JAX. One alias,
   and every other club code agrees exactly -- verified across all 32
   defences in CBS's own player list. Found by a defence reconciling to
   nothing, which is the third time a club alias has surfaced here that
   way: TEAM_ALIASES already carries nflverse calling the Rams `LA`. */
const CLUB = { JAC: "JAX" };
const club = (t) => CLUB[String(t || "").toUpperCase()] || String(t || "").toUpperCase() || null;

/* CBS carries the whole NFL, IDP included, so a position outside these six
   is a player no fantasy roster in this product can hold. `D`/`ST` are the
   two other spellings its player list uses for a team defence. */
const FANTASY = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);
const posOf = (p) => {
  const raw = String((p && p.position) || "").toUpperCase();
  return raw === "D" || raw === "ST" ? "DST" : raw;
};

/* The starting lineup, from the league's own roster rules.
 *
 * CBS states it as positions with `min_active`, and its FLEX is spelled as
 * the eligible set joined by hyphens -- "RB-WR-TE". Read rather than
 * guessed: a league that flexes a quarterback says so in that string. */
export function lineupFromCbs(rules) {
  const positions = rules && rules.roster && Array.isArray(rules.roster.positions)
    ? rules.roster.positions : null;
  if (!positions) return null;

  const starters = {};
  let flex = 0, superflex = 0;
  for (const p of positions) {
    const abbr = String((p && p.abbr) || "").toUpperCase();
    const n = Number(p && p.min_active);
    if (!abbr || !Number.isFinite(n) || n <= 0) continue;
    if (abbr.includes("-")) {
      // A flex that can hold a quarterback is a superflex, not a flex.
      if (abbr.split("-").includes("QB")) superflex += n; else flex += n;
      continue;
    }
    if (FANTASY.has(abbr)) starters[abbr] = (starters[abbr] || 0) + n;
  }
  if (!Object.keys(starters).length && !flex && !superflex) return null;
  return { starters, flex, superflex };
}

/* When trading closes.
 *
 * CBS publishes a THIRD unit after ESPN's epoch instant and Sleeper's week
 * number: a plain `20261113`, year-month-day as an integer, with the time
 * of day only in its own prose ("11:59 pm et 11/13/26").
 *
 * Unlike Sleeper's week, that IS convertible -- a date and a stated wall
 * time in a named zone is an instant -- so this fills `at` rather than
 * inventing a `week`. The zone is resolved with Intl rather than by
 * assuming -5: a deadline in October falls in EDT and one in November in
 * EST, and hardcoding either is right for half the season. */
export function tradeDeadlineFromCbs(transactions) {
  const t = transactions || {};
  const disabled = Number((t.add_drops_are_disabled || {}).value) === 1 ||
                   String((t.trade_policy || {}).value || "") === "none";
  const raw = String((t.trade_deadline || {}).value || "");
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return { at: null, week: null, disabled };

  const [, y, mo, d] = m;
  const at = etInstant(Number(y), Number(mo), Number(d), 23, 59);
  return { at, week: null, disabled };
}

/* 23:59 America/New_York on a given date, as epoch ms.
 *
 * Built by guessing UTC and correcting by the zone's own reported offset,
 * which is how you get a wall time in a named zone without a library. One
 * correction is enough here because the deadline is never within an hour of
 * a DST transition (those happen at 02:00 local). */
function etInstant(y, mo, d, hh, mm) {
  try {
    const guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
                           Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return guess + (guess - asUtc);
  } catch {
    return null;
  }
}

/* How the league moves players.
 *
 * CBS names the system in `add_drop_policy.value` -- "waivers" against
 * anything else -- and there is no FAAB budget anywhere in its rules for a
 * waiver-order league, which is the honest version of the trap ESPN sets
 * by carrying a default budget on a league that never bids. */
export function waiverFromCbs(transactions) {
  const t = transactions || {};
  const policy = String((t.add_drop_policy || {}).value || "").toLowerCase();
  const budget = Number((t.add_drop_waiver_budget || {}).value);
  const isFaab = policy.includes("budget") || policy.includes("faab") || Number.isFinite(budget) && budget > 0;
  return {
    type: isFaab ? "faab" : policy === "waivers" ? "order" : policy ? "other" : null,
    budget: isFaab && Number.isFinite(budget) ? budget : null,
    minimumBid: null,
    /* CBS states the reset rule in prose and not as a flag, so this is null
       rather than a guess -- the room says what it knows and no more. */
    resetsOrder: null,
    hours: Number((t.add_drop_waiver_period || {}).value) * 24 || null,
  };
}

/* pre_draft / drafting / complete, from CBS's own two fields.
 *
 * `draft_state` is the authority and `season_status` is the fallback, in
 * that order and for the reason espn.js already records: a finished draft
 * is finished whatever anything else says. */
export function draftInfoFromCbs(details) {
  const d = details || {};
  const state = String(d.draft_state || "").toLowerCase();
  if (state === "completed" || state === "complete") return { status: "complete", at: null };
  if (state === "inprogress" || state === "live" || state === "drafting") return { status: "drafting", at: null };
  if (String(d.season_status || "").toLowerCase() === "regularseason") {
    /* A league in its regular season whose draft never reported completing
       is a draft that HAPPENED -- rosters exist -- so reporting pre_draft
       here would count a played season down to a draft in the past, which
       is the exact failure the countdown section records for ESPN. */
    return { status: "complete", at: null };
  }
  return { status: "pre_draft", at: null };
}

/* ----------------------------------------------------------
   The crosswalk
   ---------------------------------------------------------- */

/* CBS ids are CBS's, and everything downstream of a snapshot is keyed by
 * Sleeper's. Same join espn.js makes and the same two tiers, measured on
 * the real league against the 15 September board:
 *
 *     every fantasy row   480 -> 470 joined
 *     REAL-ADP rows       230 -> 228 joined
 *
 * against 139 of 141 for ESPN. The two that miss are nickname mismatches --
 * CBS carries "Kenneth Gainwell" and "Andres Borregales" where the pipeline
 * carries Kenny and Andy -- and a surname+position+club tier recovers both,
 * measured. It is NOT built here: that tier needs a second index in the
 * player pool, and 60 of 2,046 surname|position|club keys in CBS's own pool
 * are ambiguous, so it has to demand a unique candidate or it will silently
 * mismatch about 3% of what it touches. Reported rather than guessed, which
 * is what `unmatched` is for. */
export function cbsKey(p) {
  const pos = posOf(p);
  if (!FANTASY.has(pos)) return { name: null, pos: null, team: null };
  return {
    name: String((p && p.fullname) ||
                 [(p && p.firstname) || "", (p && p.lastname) || ""].join(" ")).trim(),
    pos,
    team: club(p && p.pro_team),
  };
}

export async function crosswalk(players, lookup) {
  const wanted = [];
  const seen = new Set();
  for (const p of players) {
    const k = cbsKey(p);
    if (!k.pos || k.pos === "DST" || !k.name) continue;
    const id = normalise(k.name) + "|" + k.pos;
    if (seen.has(id)) continue;
    seen.add(id);
    wanted.push({ name: k.name, pos: k.pos, team: k.team });
  }
  if (!wanted.length) return new Map();
  return await lookup(wanted);
}


/* ---- One week's per-player points ----
 *
 * `league/stats?period=N` is where CBS keeps them, and both halves of that
 * were measured on 16 September 2026 rather than assumed:
 *
 *   201 KB, 369 rows for a played week. Each row carries `FPTS` (CBS's
 *   own applied points), `name`, `position` and `TM`.
 *
 * **`player_status=rostered`, and without it this endpoint answers the
 * FREE-AGENT pool.** Measured after the first version shipped and found
 * nobody: the bare call returns 369 rows and all 369 are free agents, so
 * the intersection with any roster is empty BY CONSTRUCTION. With the
 * parameter it answers 519 rows and Joe Burrow is in them.
 *
 * That failure had no symptom of its own. A wrong population is not an
 * error -- every row parsed, the crosswalk ran, the join produced nothing,
 * and the route reported a week with no points, which is exactly what an
 * unplayed week looks like. The endpoint was mapped by asking whether the
 * PATH exists (400 vs 404) and nobody had asked what it returns by
 * default.
 *
 * `filter=all` is refused outright -- 400, "invalid_filter" -- so `filter`
 * is a real parameter with a vocabulary of its own that has not been
 * mapped. `player_status` is the one that answers this question.
 *
 * **It is its own route rather than a field on the snapshot, and that is
 * the whole reason this exists.** `actuals` on a snapshot is stamped with
 * ONE week -- espn.js's is the current one, deliberately, so week 1's
 * figure is never served as an answer about week 2. That is right for a
 * live Sunday and it cannot answer "what did my lineup do in week 1",
 * which is the question a matchup page asks every time somebody opens a
 * past week.
 *
 * **The roster endpoint takes `period` too and does NOT carry the week's
 * points**, which is worth writing down because it is the cheaper answer
 * and it was the first thing tried: its keys are `ytd_points`,
 * `avg_points` and `projected_points`, all season-level. So this is a
 * second request or it is nothing.
 *
 * **Presence of `FPTS` decides played, never its value.** A player who
 * turned out and scored 0.0 is a real result, and the row for a player who
 * did not play is absent entirely -- so a truthiness test drops exactly
 * the rows a reader is most likely to query. Same rule as the schedule's
 * `points`, one endpoint along.
 *
 * **The crosswalk is the snapshot's own**, adapted at the boundary rather
 * than reimplemented: a stats row spells the name `name` and the club
 * `TM`, where a roster row spells them `fullname` and `pro_team`. A second
 * join here would be a second thing to drift, and this one is measured at
 * 100% on real-ADP rows.
 */
export async function weekActuals(slug, week, base, resolve) {
  const host = cbsHost(slug);
  if (!host) return { reason: "not-found", week: null };
  const n = Number(week);
  if (!Number.isInteger(n) || n < 1 || n > 30) return { reason: "bad-request", week: null };

  /* Two endpoints, in parallel, because POINTS alone cannot draw a played
     week. Who was STARTED that week is the other half, and today's roster
     is not that week's lineup -- a fact this project already states about
     ESPN and would be repeating here by accident. `period` on the roster
     endpoint is what answers it, and it is the same parameter that turned
     the schedule from one week into a season. */
  /* THREE stats calls, because CBS splits the positions across them.
     Measured after the first fix populated everything except kickers and
     defences: `player_status=rostered` answers QB, RB, WR and TE and
     nothing else -- 519 rows, and not one K or DST among them. Each of
     those two has to be asked for by name.

       player_status=rostered                     519 rows  QB/RB/WR/TE
       player_status=rostered&position=K           33 rows  K
       player_status=rostered&position=DST         32 rows  DST
       position=K            (no player_status)    20 rows  FREE AGENTS
       position=DST          (no player_status)    19 rows  FREE AGENTS
       position=all                                 0 rows  a real 200
                                                            answering nothing

     **`player_status=rostered` is needed on EVERY one of them**, and
     leaving it off the two position calls is how this shipped populating
     nothing for a kicker or a defence. It is the same defect as the bare
     stats call answering free agents, reintroduced in the two requests
     added to fix that one -- measured correctly, transcribed wrongly. A
     row from either call says `free_agent: 1` on its face.

     The two extra calls are 33 and 32 rows against the first one's 519,
     so this is a rounding error on a request that was already being made.

     `filter` is NOT the parameter for this and the question is closed:
     it is a stat-filter DSL, and CBS says so in its own refusal --
     "Invalid filter K. Example filter is QB::PaTD::GT::5". */
  const statsPath = (q) => "league/stats?period=" + n + "&" + q;
  const [skillRes, kRes, dstRes, rostersRes] = await Promise.all([
    getJson(slug, statsPath("player_status=rostered"), base),
    getJson(slug, statsPath("player_status=rostered&position=K"), base),
    getJson(slug, statsPath("player_status=rostered&position=DST"), base),
    getJson(slug, "league/rosters?team_id=all&period=" + n, base),
  ]);

  if (skillRes.signedOut || rostersRes.signedOut) return { reason: "private", week: null };
  const statsRes = skillRes;
  /* The skill call decides whether this week is readable at all; K and
     DST are additive. One of those two failing costs a kicker's points
     and must not cost the other eight starters theirs. */
  const rows = [
    ...(((bodyOf(skillRes, "league_stats") || {}).players) || []),
    ...(((bodyOf(kRes, "league_stats") || {}).players) || []),
    ...(((bodyOf(dstRes, "league_stats") || {}).players) || []),
  ];
  const skillRows = (bodyOf(skillRes, "league_stats") || {}).players;
  const rosterBody = bodyOf(rostersRes, "rosters") || {};
  const rosterTeams = Array.isArray(rosterBody.teams) ? rosterBody.teams : [];
  if (!Array.isArray(skillRows)) {
    return { reason: statsRes.status === 0 ? "offline" : "not-found", week: null };
  }

  /* A stats row wears different field names from a roster row for the same
     three facts. Translated here so cbsKey() and the four-tier crosswalk
     below are the ones the snapshot already uses -- a second join would be
     a second thing to drift from a measurement taken on the first.

     **And the SAME endpoint answers different names with and without
     `period`.** Measured against a real league:

       league/stats            carries `position`: "QB"
       league/stats?period=1   carries NO `position` key at all, and
                               `eligible_positions_display` instead

     The first version of this read `position` alone. Every row then came
     back with no position, cbsKey() refused all of them, and the route
     answered 200 with a null week -- which the page draws as "nobody has
     played this yet". A wrong field name does not throw here; it empties
     the answer and the emptiness is indistinguishable from an unplayed
     week.

     `eligible_positions_display` can name more than one slot for a
     multi-eligible player, so the first token is taken: what is wanted is
     a board position, and CBS's own roster rows carry exactly one. */
  const statPos = (r) => {
    const raw = String((r && (r.position || r.eligible_positions_display)) || "");
    return raw.split(/[^A-Za-z]/)[0] || "";
  };
  const asRoster = (r) => ({
    fullname: r && r.name,
    position: statPos(r),
    pro_team: (r && (r.TM || r.pro_team)) || null,
  });

  /* Presence decides played, never the value: a player who turned out and
     scored 0.0 is a result, and a player who did not play has no row at
     all. A truthiness test drops exactly the rows a reader queries. */
  const scored = rows.filter((r) => r && r.FPTS !== undefined && r.FPTS !== null && r.FPTS !== "");

  const everyPlayer = scored.map(asRoster);
  rosterTeams.forEach((t) => (t.players || []).forEach((pl) => everyPlayer.push(pl)));
  const resolved = everyPlayer.length && resolve ? await crosswalk(everyPlayer, resolve) : null;
  const byName = resolved || new Map();

  const idOf = (pl) => {
    const k = cbsKey(pl);
    if (!k.pos) return null;
    if (k.pos === "DST") return k.team || null;
    return byName.get(normalise(k.name) + "|" + k.pos) || null;
  };

  const players = {};
  scored.forEach((r) => {
    const id = idOf(asRoster(r));
    if (!id) return;
    const pts = Number(r.FPTS);
    if (Number.isFinite(pts)) players[id] = pts;
  });

  /* The week's lineups, keyed by CBS's own team id -- sparse and
     unordered, so it is never an index. `roster_status` is the assignment
     and `roster_pos` is the ELIGIBLE slot, which is the distinction that
     cost this adapter sixteen starters on a nine-man lineup. */
  const teams = {};
  let rosteredWithPoints = 0;
  rosterTeams.forEach((t) => {
    const starters = [];
    const bench = [];
    (t.players || []).forEach((pl) => {
      const id = idOf(pl);
      if (!id) return;
      const pts = players[id];
      const row = { id, points: pts === undefined ? null : pts };
      if (pts !== undefined) rosteredWithPoints++;
      if (String(pl.roster_status || "").toUpperCase() === "A") starters.push(row);
      else bench.push(row);
    });
    if (starters.length || bench.length) teams[String(t.id)] = { starters, bench };
  });

  /* Nothing to show is a normal answer about a week nobody has played, and
     it is told apart from a crosswalk that has not filled yet: only one of
     those is a fact about the league, and only one is worth retrying. */
  if (!rosteredWithPoints) {
    return { reason: resolved === null ? "crosswalk" : null, week: null };
  }

  return {
    reason: null,
    week: { week: n, source: "cbs", at: Date.now(), players, teams },
  };
}

/* ----------------------------------------------------------
   The two reads
   ---------------------------------------------------------- */

/* Enough to connect: the league's name, its size and its teams.
 *
 * CBS asks the same second question ESPN does -- which of these teams is
 * yours -- because nothing in a session says which team a reader owns. So
 * `teams` comes back with it, from an answer already in hand. */
export async function lookupLeague(slug, season, base) {
  const host = cbsHost(slug);
  if (!host) return { reason: "not-found", league: null };

  const [details, teams] = await Promise.all([
    getJson(slug, "league/details", base),
    getJson(slug, "league/teams", base),
  ]);

  if (details.signedOut || teams.signedOut) return { reason: "private", league: null };
  const d = bodyOf(details, "league_details");
  if (!d) return { reason: details.status === 0 ? "offline" : "not-found", league: null };

  const rows = bodyOf(teams, "teams") || [];
  const draft = draftInfoFromCbs(d);

  return {
    reason: null,
    league: {
      provider: "cbs",
      leagueId: String(slug),
      name: String(d.name || "Untitled league").slice(0, 80),
      season: String(season || ""),
      totalTeams: Number(d.num_teams) || rows.length,
      draftAt: draft.at,
      draftStatus: draft.status,
      /* Team ids are SPARSE and unordered -- a real twelve-team league
         answers 4,14,8,6,15,2,3,5,10,12,11,1. So an id is never an index
         and never derivable from position, which is the same class as
         ESPN's negative defence ids: a number that looks like a sequence
         and is not. */
      teams: rows.slice(0, MAX_TEAMS).map((t) => ({
        teamId: String(t.id),
        name: String(t.name || t.abbr || "Team").slice(0, 60),
        manager: ((t.owners || [])[0] || {}).name || null,
      })),
    },
  };
}

/* The whole league, in the one vocabulary every room reads. */
export async function leagueSnapshot(slug, season, base, resolve) {
  const host = cbsHost(slug);
  if (!host) return { reason: "not-found", snapshot: null };

  const [details, teamsRes, rostersRes, standingsRes, scheduleRes, rulesRes, scoringRes] =
    await Promise.all([
      getJson(slug, "league/details", base),
      getJson(slug, "league/teams", base),
      /* One call for every roster. `team_id=all` is the parameter that
         makes CBS a one-request snapshot like ESPN rather than one call a
         team -- measured: with no parameter it answers only the signed-in
         reader's OWN team, which reads as a one-team league. */
      getJson(slug, "league/rosters?team_id=all", base),
      getJson(slug, "league/standings/overall", base),
      /* `period=all`, and the bare call is NOT a smaller version of it:
         it answers the current period only. See scheduleFromCbs(). */
      getJson(slug, "league/schedules?period=all", base),
      getJson(slug, "league/rules", base),
      getJson(slug, "league/scoring/rules", base),
    ]);

  if ([details, teamsRes, rostersRes].some((r) => r.signedOut)) {
    return { reason: "private", snapshot: null };
  }
  const d = bodyOf(details, "league_details");
  if (!d) return { reason: details.status === 0 ? "offline" : "not-found", snapshot: null };

  const teamRows = bodyOf(teamsRes, "teams") || [];
  const rosterBody = bodyOf(rostersRes, "rosters") || {};
  const rosterTeams = Array.isArray(rosterBody.teams) ? rosterBody.teams : [];
  const rules = bodyOf(rulesRes, "rules");
  const scoring = rulesFromCbs(bodyOf(scoringRes, "scoring_rules"));

  /* CBS counts the week as `current_period` and a period is not a week once
     the playoffs start -- but for the regular season they are the same
     number, and a 0 or an absent value is not a week at all. */
  const week = Number(d.current_period) || null;

  const everyPlayer = [];
  rosterTeams.forEach((t) => (t.players || []).forEach((p) => everyPlayer.push(p)));

  const resolved = everyPlayer.length && resolve ? await crosswalk(everyPlayer, resolve) : new Map();
  const crosswalkReady = resolved !== null;
  const byName = resolved || new Map();

  const unmatched = [];
  const sleeperId = (p) => {
    const k = cbsKey(p);
    if (!k.pos) return null;
    // Club first for a defence -- exact, and the only tier that can be.
    if (k.pos === "DST") return k.team || null;
    const hit = byName.get(normalise(k.name) + "|" + k.pos);
    if (!hit) unmatched.push(k.name + " (" + k.pos + (k.team ? " " + k.team : "") + ")");
    return hit || null;
  };

  // Standings carry the record and the points; the team list carries the
  // name and the owner. Keyed by CBS's own team id, which is sparse.
  const record = new Map();
  for (const div of (bodyOf(standingsRes, "overall_standings") || {}).divisions || []) {
    for (const row of div.teams || []) record.set(String(row.id), row);
  }
  const rosterById = new Map(rosterTeams.map((t) => [String(t.id), t]));

  const projected = {};
  const live = {};
  let projectedCount = 0;

  const teams = teamRows.slice(0, MAX_TEAMS).map((t) => {
    const id = String(t.id);
    const r = record.get(id) || {};
    const roster = rosterById.get(id) || {};
    const players = [];
    const starters = [];

    for (const p of roster.players || []) {
      const sid = sleeperId(p);
      if (!sid) continue;
      players.push(sid);
      /* `roster_status`, and NOT `roster_pos`.
       
         The first version of this read `roster_pos`, which is the name that
         sounds like the answer and is not: it carries the player's ELIGIBLE
         slot, so a benched receiver reads "WR" exactly as a starting one
         does. Every one of sixteen players came back a starter, in a league
         that starts nine. Plausible, and wrong in the direction that makes
         a lineup look full.
       
         `roster_status` is the assignment -- measured on a real roster as
         A x9, RS x6, I x1, and the nine are exactly the nine slots
         lineupFromCbs() reads out of the league's own rules. */
      if (String(p.roster_status || "").toUpperCase() === "A") starters.push(sid);

      const proj = Number(p.projected_points);
      if (Number.isFinite(proj) && proj !== 0) { projected[sid] = proj; projectedCount++; }

      const inj = injuryCode(p.pro_status);
      const locked = String(p.is_locked || "0") === "1";
      if (inj !== null || locked) live[sid] = { inj: inj === null ? undefined : inj, locked };
    }

    return {
      rosterId: Number(t.id) || null,
      ownerId: id,
      teamName: String(t.name || t.abbr || "Team").slice(0, 60),
      manager: ((t.owners || [])[0] || {}).name || null,
      avatar: t.logo || null,
      wins: Number(r.wins) || 0,
      losses: Number(r.losses) || 0,
      ties: Number(r.ties) || 0,
      pointsFor: Number(r.points_scored) || 0,
      pointsAgainst: Number(r.points_against) || 0,
      players,
      /* CBS returns a roster in LINEUP order -- QB, RB, RB, WR, WR, TE,
         flex, K, DST, then the bench -- so this needs no sort of its own.
         espn.js had to add one because ESPN answers in entry order, and
         strategyBoard.js states the contract in its own comment: the ORDER
         of `starters` is the league's roster. Verified against a real team
         rather than assumed. */
      starters,
    };
  });

  const draft = draftInfoFromCbs(d);

  return {
    reason: null,
    snapshot: {
      provider: "cbs",
      leagueId: String(slug),
      name: String(d.name || "Untitled league").slice(0, 80),
      season: String(season || ""),
      totalTeams: Number(d.num_teams) || teams.length,
      draftAt: draft.at,
      draftStatus: draft.status,
      week,
      seasonType: String(d.season_status || "") || null,
      /* CBS's own per-player projection for this week, keyed by the same
         Sleeper ids as `players`, so a room reads the number the league's
         own screen shows -- the owner's non-negotiable, which espn.js and
         sleeper.js already answer. Stamped with its week so week 1's figure
         is never served as an answer about week 2. */
      projections: week && projectedCount
        ? { week, source: "cbs", points: projected }
        : null,
      /* CBS reports no in-progress per-player score on any endpoint read
         here, so there is nothing to stand in for one. Null rather than an
         empty object: "not published" and "nobody has scored" are different
         facts and only one of them is about the league. */
      actuals: null,
      status: Object.keys(live).length
        ? { week, source: "cbs", at: Date.now(), players: live }
        : null,
      waiverBudget: null,
      waiver: waiverFromCbs(rules && rules.transactions),
      tradeDeadline: tradeDeadlineFromCbs(rules && rules.transactions),
      /* `rules`, the name every reader uses -- ESPN's and Sleeper's
         snapshots have always published it under this key, and every room
         reads `snapshot.rules`. This shipped as `scoring:`, so no room ever
         saw a CBS league's scoring: every CBS league was scored with the
         default table while the screens honestly said "your league's
         scoring could not be read". Nothing threw, because a field nobody
         reads is a field nothing complains about; test-cbs.mjs only ever
         checked rulesFromCbs() directly, never what the snapshot called
         the answer. It asserts the key now. */
      rules: scoring.rules,
      scoringUnmapped: scoring.unmapped,
      lineup: lineupFromCbs(rules),
      /* Every week of it, from one request. Null when CBS does not answer,
         which is what a Sleeper league already returns -- so a failure here
         costs the opponent beside a week and nothing else on the page. */
      schedule: scheduleFromCbs(bodyOf(scheduleRes, "schedule")),
      draft: null,
      teams,
      crosswalkReady,
      unmatched: unmatched.slice(0, 40),
      unmatchedCount: unmatched.length,
    },
  };
}
