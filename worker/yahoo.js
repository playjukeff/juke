/* Yahoo, read-only, through the worker.
 *
 * The fourth adapter, and it answers the same vocabulary the other three
 * do: Sleeper-id-keyed rosters and `pre_draft`/`drafting`/`complete`. A
 * fourth platform is a fourth file here, not a fourth vocabulary in the UI.
 *
 * ---- The one platform with real OAuth ----
 *
 * Measured 17 September 2026: every Fantasy API request made anonymously --
 * the game metadata, the stat categories, a league's settings -- answers
 * 401 "unable_to_determine_oauth_type". So Yahoo has no public half at all,
 * the same as CBS, and unlike CBS it does not need one: Yahoo publishes a
 * proper OAuth 2.0 authorization-code grant for third parties.
 *
 * That changes what Juke holds. ESPN's `espn_s2` and CBS's `pid` are whole-
 * account sessions a reader copies out of their own browser and that can
 * act as them. What Yahoo hands back is a token scoped by the app's own
 * registration to Fantasy Sports READ, revocable by the reader from their
 * Yahoo account at any time, obtained without Juke ever seeing a password
 * or a cookie. "Juke never edits your league" is a property of the grant
 * here rather than a promise the code keeps.
 *
 * ---- One token per ACCOUNT, not per league ----
 *
 * ESPN's and CBS's credentials are per league because they are pasted per
 * league. A Yahoo token is per person: one grant reads every league the
 * reader is in, and Yahoo may hand back a new refresh token when an old one
 * is spent. Copies per league would each go stale on their own schedule, so
 * there is one sealed row, `league_id = YAHOO_ACCOUNT`, and every Yahoo
 * league on the account reads through it. See the router for when it is
 * deleted.
 *
 * ---- What is measured and what is not ----
 *
 * The 401 above is measured. The crosswalk's need for a name join is
 * measured: Sleeper's own `yahoo_id` covers 115 of the 448 non-defence rows
 * on the 15 September board (25.7%), 62 of 209 real-ADP rows, and misses
 * Gibbs, Bijan Robinson, Chase and Nacua -- the same stopped-backfill shape
 * CLAUDE.md records for `espn_id`, so the same name join espn.js and cbs.js
 * already make.
 *
 * **Everything about a league payload is NOT measured yet.** The OAuth half
 * is: the app is registered and the owner has signed in through it. But the
 * owner's Yahoo account is in no league, so nothing below has read a real
 * one. It is written against Yahoo's published response format, and the
 * parsing is deliberately shape-tolerant for that reason: `flat()` and
 * `members()` accept both the array and the numbered-object forms Yahoo uses
 * interchangeably, so a guess about which one a given node takes cannot
 * silently drop it. Yahoo is `live` in leaguePlatforms.js anyway, on the
 * owner's call, because no account but theirs can connect a league yet; a
 * real league has to be read through this file before that changes. See the
 * note on LEAGUE_CAP in web/src/lib/tiers.js.
 *
 * ---- Failure is a value, never a throw ----
 *
 * Same contract as the other three. An unreachable Yahoo, an expired grant
 * and a league key nobody owns all come back as a reason string. */

import { normalise } from "./names.js";
import { rulesFromYahoo } from "./scoring.js";
import { lineupFromYahoo, yahooSeatRank } from "./lineup.js";
import { scheduleFromYahoo } from "./matchups.js";
import { injuryCode } from "./status.js";
import { etInstant } from "./cbs.js";
import { flat, members, child } from "./yahoo-json.js";

export const YAHOO_API = "https://fantasysports.yahooapis.com/fantasy/v2";
export const YAHOO_AUTH = "https://api.login.yahoo.com/oauth2";
/* Where Yahoo sends the reader back. Registered with the app, so it is a
   deployment fact rather than something a request may choose -- an OAuth
   redirect a caller could pick is how a code ends up somewhere else. */
export const YAHOO_REDIRECT = "https://jukeff.com/connect/yahoo";
/* The sealed row's league id. Not a league any platform could issue: Yahoo
   keys are `<game>.l.<id>`, so this can never collide with one. */
export const YAHOO_ACCOUNT = "*";

const MAX_TEAMS = 32;

/* `461.l.123456` -- the season's game key, then the league's own id.

   The KEY rather than the id is what is stored, because every read needs
   it and the game half changes every season: the same league renewed for
   2027 is a different key, which is the honest answer to "which season's
   league did you connect". Anchored and bounded, because this string ends
   up in an upstream path. */
const LEAGUE_KEY = /^\d{1,6}\.l\.\d{1,12}$/;
export function yahooLeagueKey(input) {
  const s = String(input || "").trim();
  return LEAGUE_KEY.test(s) ? s : null;
}

/* ----------------------------------------------------------
   Reading Yahoo's JSON
   ---------------------------------------------------------- */

/* The shape-tolerant readers live in yahoo-json.js, because scoring.js
   needs them too. See that file for the two habits they exist for. */
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
export { flat, members, child };

const content = (res) => (res && res.ok && res.body && res.body.fantasy_content) || null;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const yes = (v) => v === 1 || v === "1" || v === true;

/* ----------------------------------------------------------
   The request
   ---------------------------------------------------------- */

/* One authenticated GET. `format=json` because the API answers XML by
   default -- a caller that forgot it would be parsing a document it thinks
   is empty. */
export async function yahooGet(path, accessToken, base) {
  if (!accessToken) return { ok: false, status: 401, body: null };
  const url = (base || YAHOO_API) + "/" + path +
    (path.includes("?") ? "&" : "?") + "format=json";
  try {
    const res = await fetch(url, {
      headers: { authorization: "Bearer " + accessToken, accept: "application/json" },
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok && !!body, status: res.status, body };
  } catch (err) {
    console.error("yahoo fetch failed:", path, err && err.message);
    return { ok: false, status: 0, body: null };
  }
}

/* A failed read, as the one word every route and screen already speaks.

   401 and 403 are the grant: expired past refreshing, revoked from the
   reader's Yahoo account, or a league this person cannot see -- all fixed
   by signing in to Yahoo again, which is what `private` means on the
   screens behind it. 400 and 404 are a key Yahoo does not recognise. 999 is
   Yahoo's own spelling of "slow down" and is weather, not a verdict. */
export function reasonFor(res) {
  const s = res ? res.status : 0;
  if (s === 401 || s === 403) return "private";
  if (s === 400 || s === 404) return "not-found";
  return "offline";
}

/* ----------------------------------------------------------
   OAuth
   ---------------------------------------------------------- */

export function yahooConfigured(env) {
  return !!(env && env.YAHOO_CLIENT_ID && env.YAHOO_CLIENT_SECRET);
}

/* The consent page. No `scope`: Yahoo grants whatever the app was
   registered with, and naming one that differs from the registration is an
   `invalid_scope` refusal on Yahoo's page, after the reader has left ours. */
export function authorizeUrl(env, state) {
  const q = new URLSearchParams({
    client_id: env.YAHOO_CLIENT_ID,
    redirect_uri: env.YAHOO_REDIRECT_URI || YAHOO_REDIRECT,
    response_type: "code",
    state,
    language: "en-us",
  });
  return (env.YAHOO_AUTH_BASE || YAHOO_AUTH) + "/request_auth?" + q.toString();
}

function basicAuth(env) {
  return "Basic " + btoa(env.YAHOO_CLIENT_ID + ":" + env.YAHOO_CLIENT_SECRET);
}

/* Trade a code, or a refresh token, for an access token.

   Both grants take the redirect URI -- Yahoo checks it on the exchange as
   well as on the consent page. The answer is normalised to
   `{ accessToken, refreshToken, expiresAt, guid }`, or `{ error }` carrying
   Yahoo's own error word so a revoked grant (`invalid_grant`) can be told
   from an outage. */
async function tokenRequest(env, params) {
  try {
    const res = await fetch((env.YAHOO_AUTH_BASE || YAHOO_AUTH) + "/get_token", {
      method: "POST",
      headers: {
        authorization: basicAuth(env),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams(Object.assign({
        redirect_uri: env.YAHOO_REDIRECT_URI || YAHOO_REDIRECT,
      }, params)).toString(),
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok || !body || !body.access_token) {
      return { error: String((body && body.error) || (res.status ? "http-" + res.status : "offline")) };
    }
    const life = num(body.expires_in) || 3600;
    return {
      accessToken: String(body.access_token),
      refreshToken: body.refresh_token ? String(body.refresh_token) : null,
      expiresAt: Date.now() + life * 1000,
      guid: body.xoauth_yahoo_guid ? String(body.xoauth_yahoo_guid) : null,
    };
  } catch (err) {
    console.error("yahoo token request failed:", err && err.message);
    return { error: "offline" };
  }
}

export function exchangeCode(env, code) {
  return tokenRequest(env, { grant_type: "authorization_code", code: String(code || "") });
}

export function refreshAccess(env, refreshToken) {
  return tokenRequest(env, { grant_type: "refresh_token", refresh_token: String(refreshToken || "") });
}

/* ---- The `state`, which binds a consent to the Juke account that asked ----
 *
 * The attack it closes: somebody starts a connect on THEIR account, sends
 * the Yahoo consent link to a victim, and the victim approves it -- after
 * which, without this, the victim's Yahoo leagues are readable from the
 * attacker's Juke account. So `state` carries a hash of the account that
 * started the flow, an expiry and a nonce, signed, and the exchange route
 * refuses a code whose state names a different account from the one
 * presenting it.
 *
 * A hash of the account id rather than the id: the state travels through
 * Yahoo's URLs and back through ours, and nothing on that path needs to
 * learn who the reader is on Juke.
 *
 * Signed with the client secret, domain-separated, so no second key has to
 * be minted and kept -- and so rotating the secret invalidates any consent
 * in flight, which is the right answer for a secret that has been rotated.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accountHash(clerkId) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("juke-yahoo-account|" + clerkId));
  return b64url(d).slice(0, 22);
}

async function stateKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode("juke-yahoo-state|" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

/* `origin` is where the reader STARTED, and it rides in the state because
   Yahoo can only return them to the one address the app registered.
   `www.jukeff.com` serves the site as its own origin -- measured, it
   answers 200 rather than redirecting -- so somebody who began there would
   come back to the apex with none of what their dialog left in
   sessionStorage. The return page reads this and sends them home. It is
   signed like the rest, and the page checks it against a fixed list too,
   because it is read there BEFORE anything has verified the signature. */
export async function signState(clerkId, secret, now = Date.now(), origin = null) {
  const body = {
    h: await accountHash(clerkId),
    e: now + STATE_TTL_MS,
    n: b64url(crypto.getRandomValues(new Uint8Array(12))),
  };
  if (origin) body.o = String(origin);
  const payload = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await stateKey(secret), new TextEncoder().encode(payload));
  return payload + "." + b64url(sig);
}

/* True only for a state this deployment signed, for THIS account, that has
   not expired. Every other outcome is false and none of them is
   distinguished to the caller: a forged state, a stale one and one started
   on somebody else's account all mean "start again". */
export async function stateIsFor(state, clerkId, secret, now = Date.now()) {
  try {
    const parts = String(state || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const ok = await crypto.subtle.verify(
      "HMAC", await stateKey(secret), fromB64url(parts[1]), new TextEncoder().encode(parts[0])
    );
    if (!ok) return false;
    const body = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (!body || !(Number(body.e) > now)) return false;
    return body.h === await accountHash(clerkId);
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------
   The pieces
   ---------------------------------------------------------- */

/* Yahoo spells most clubs the way the pipeline does once uppercased --
   `Det`, `KC`, `LAR`. These are the spellings that have ever differed
   anywhere this worker reads a club, carried defensively: an unaliased
   club is a defence that resolves to nothing, which reads as an empty slot
   rather than as an error. */
const CLUB = { JAC: "JAX", WSH: "WAS", LA: "LAR" };
const club = (raw) => {
  const c = String(raw || "").toUpperCase();
  return c ? (CLUB[c] || c) : null;
};

const FANTASY = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);

/* A player's fantasy position. `primary_position` first, because
   `display_position` can be a list for a dual-eligible player ("WR,TE") and
   the crosswalk needs one. DEF is the pipeline's DST. */
function posOf(p) {
  const raw = String(p.primary_position || p.display_position || "").split(",")[0].trim().toUpperCase();
  return raw === "DEF" || raw === "D/ST" ? "DST" : raw;
}

function nameOf(p) {
  const n = p.name;
  if (isObj(n)) {
    return String(n.full || [n.first || "", n.last || ""].join(" ")).trim();
  }
  return String(n || "").trim();
}

export function yahooKey(p) {
  const pos = posOf(p);
  if (!FANTASY.has(pos)) return { name: null, pos: null, team: null };
  return { name: nameOf(p), pos, team: club(p.editorial_team_abbr) };
}

/* Yahoo's status abbreviations, as the words status.js already reads.

   An ABSENT status is healthy, and that is an answer: Yahoo sets `status`
   only on a player carrying a designation, so its absence on a player the
   roster did return is the platform saying he is fine -- the same thing
   ESPN's `NORMAL` says. `NA` is "not active" and says nothing about health;
   it is left unreadable rather than mapped to out. */
const YAHOO_STATUS = {
  Q: "questionable", D: "doubtful", O: "out", IR: "ir", "IR-R": "ir", "IR-NR": "ir",
  "PUP-P": "pup", "PUP-R": "pup", PUP: "pup", "NFI-R": "nfi", "NFI-A": "nfi", NFI: "nfi",
  SUSP: "sus", SUS: "sus", "COVID-19": "cov",
};
export function yahooInjury(p) {
  if (p.status === undefined || p.status === null || p.status === "") return "";
  const raw = String(p.status).toUpperCase();
  return YAHOO_STATUS[raw] !== undefined ? injuryCode(YAHOO_STATUS[raw]) : null;
}

/* pre_draft / drafting / complete, from Yahoo's `draft_status`, with the
   scheduled time from settings. Seconds on the wire, milliseconds here --
   every other adapter's `draftAt` is epoch ms. */
export function draftInfoFromYahoo(meta, settings) {
  const s = String((meta && meta.draft_status) || "").toLowerCase();
  const secs = num(settings && settings.draft_time);
  const at = secs && secs > 0 ? secs * 1000 : null;
  if (s === "postdraft") return { status: "complete", at: null };
  if (s === "draft" || s === "indraft" || s === "drafting") return { status: "drafting", at };
  if (s === "predraft") return { status: "pre_draft", at };
  return { status: null, at };
}

/* How the league moves players. `uses_faab` is the flag and it is read
   before anything else, for the reason espn.js records at length: a budget
   carried on a league that never bids is a different waiver system, not a
   smaller one. Yahoo does not state the starting budget in settings -- it
   states each team's REMAINING balance, which rides on the team instead. */
export function waiverFromYahoo(settings) {
  const s = settings || {};
  const faab = yes(s.uses_faab);
  const kind = String(s.waiver_type || "").toUpperCase();
  const days = num(s.waiver_time);
  return {
    type: faab ? "faab" : kind ? "order" : null,
    budget: null,
    minimumBid: null,
    resetsOrder: null,
    hours: days ? days * 24 : null,
  };
}

/* When trading closes. Yahoo states a DATE ("2026-11-21") and nothing
   else, so the instant is the end of that day in the league's own clock --
   23:59 America/New_York, the same reading cbs.js makes of its date. */
export function tradeDeadlineFromYahoo(settings) {
  const raw = String((settings && settings.trade_end_date) || "");
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { at: null, week: null, disabled: false };
  return { at: etInstant(Number(m[1]), Number(m[2]), Number(m[3]), 23, 59), week: null, disabled: false };
}

/* Which lineup seat a roster entry sits in. The ORDER starters come back in
   is lineup.js's yahooSeatRank() -- app.js's SLOT_ORDER -- so a roster is a
   lineup a manager would recognise whatever order Yahoo sends it in, which
   is the contract strategyBoard.js states. */
const NOT_STARTING = new Set(["BN", "IR", "IR+", "NA", "TAXI"]);

function seatOf(player) {
  const sel = player.selected_position;
  const merged = Array.isArray(sel) ? flat(sel) : isObj(sel) ? sel : {};
  return String(merged.position || "").toUpperCase();
}

/* ----------------------------------------------------------
   The crosswalk
   ---------------------------------------------------------- */

/* Yahoo ids are Yahoo's and everything downstream is keyed by Sleeper's.
   Same name join cbs.js makes, through the same resolver, for the reason in
   the header: Sleeper's `yahoo_id` misses the top of the board. A defence
   joins on its club and never on its name ("Detroit" is no player's name
   in the pool). */
async function crosswalk(players, lookup) {
  const wanted = [];
  const seen = new Set();
  for (const p of players) {
    const k = yahooKey(p);
    if (!k.pos || k.pos === "DST" || !k.name) continue;
    const id = normalise(k.name) + "|" + k.pos;
    if (seen.has(id)) continue;
    seen.add(id);
    wanted.push({ name: k.name, pos: k.pos, team: k.team });
  }
  if (!wanted.length) return new Map();
  return await lookup(wanted);
}

/* ----------------------------------------------------------
   Leagues, as the signed-in reader
   ---------------------------------------------------------- */

/* Every NFL league this Yahoo account is in, this season, with the
   reader's own team in each.

   Two reads because Yahoo keeps them apart: `leagues` says what the
   leagues are and `teams` says which team in each is the reader's. The
   team key embeds its league key (`461.l.123.t.4`), so the join is exact.

   Unlike ESPN and CBS there is no "which team is yours" step to ask: Yahoo
   knows, because the reader is signed in as the manager. */
export async function listLeagues(call) {
  const [lr, tr] = await Promise.all([
    call("users;use_login=1/games;game_keys=nfl/leagues"),
    call("users;use_login=1/games;game_keys=nfl/teams"),
  ]);
  const fc = content(lr);
  if (!fc) return { reason: reasonFor(lr), leagues: [] };

  const gamesOf = (fcx) => {
    const user = flat(members(child(fcx, "users"), "user")[0]);
    return members(user.games, "game").map(flat);
  };

  const mine = new Map();
  for (const game of (content(tr) ? gamesOf(content(tr)) : [])) {
    for (const t of members(game.teams, "team").map(flat)) {
      const key = String(t.team_key || "");
      const lk = key.replace(/\.t\.\d+$/, "");
      if (lk && lk !== key) mine.set(lk, { teamId: String(t.team_id || key.split(".t.")[1] || ""), name: String(t.name || "") });
    }
  }

  const leagues = [];
  for (const game of gamesOf(fc)) {
    for (const l of members(game.leagues, "league").map(flat)) {
      const leagueKey = yahooLeagueKey(l.league_key);
      if (!leagueKey) continue;
      const me = mine.get(leagueKey) || null;
      const draft = draftInfoFromYahoo(l, null);
      leagues.push({
        leagueId: leagueKey,
        name: String(l.name || "Untitled league").slice(0, 80),
        season: String(l.season || game.season || ""),
        totalTeams: num(l.num_teams) || null,
        draftStatus: draft.status,
        myTeamId: me ? me.teamId : null,
        myTeamName: me ? me.name.slice(0, 60) : null,
      });
    }
  }
  return { reason: null, leagues };
}

/* One league, enough to connect: its name, size, teams, and which is the
   reader's. Reading it at all is the validation -- a key this account
   cannot see answers `private`, one Yahoo does not know `not-found`. */
export async function lookupLeague(leagueKey, call) {
  const key = yahooLeagueKey(leagueKey);
  if (!key) return { reason: "not-found", league: null };

  const [settingsRes, standingsRes] = await Promise.all([
    call("league/" + key + "/settings"),
    call("league/" + key + "/standings"),
  ]);
  const fc = content(standingsRes);
  if (!fc) return { reason: reasonFor(standingsRes), league: null };

  const league = flat(child(fc, "league"));
  const settings = flat(child(content(settingsRes) || {}, "league")).settings;
  const standings = flat(league.standings);
  const teams = members(standings.teams, "team").map(flat);
  const draft = draftInfoFromYahoo(league, flat(settings));
  const mineTeam = teams.find((t) => yes(t.is_owned_by_current_login));

  return {
    reason: null,
    league: {
      provider: "yahoo",
      leagueId: key,
      name: String(league.name || "Untitled league").slice(0, 80),
      season: String(league.season || ""),
      totalTeams: num(league.num_teams) || teams.length,
      draftAt: draft.at,
      draftStatus: draft.status,
      myTeamId: mineTeam ? String(mineTeam.team_id) : null,
      teams: teams.slice(0, MAX_TEAMS).map((t) => ({
        teamId: String(t.team_id),
        name: String(t.name || "Team").slice(0, 60),
        manager: managerOf(t),
      })),
    },
  };
}

/* The first manager's nickname, except where Yahoo has hidden it -- a
   league that hides managers answers "--hidden--", which is a placeholder
   and not somebody's name. */
function managerOf(team) {
  const m = flat(members(team.managers, "manager")[0]);
  const nick = String(m.nickname || "").trim();
  return nick && nick !== "--hidden--" ? nick.slice(0, 40) : null;
}

/* ----------------------------------------------------------
   The snapshot
   ---------------------------------------------------------- */

/* Every team's matchups, flattened to plain rows for matchups.js. Each
   game appears once per side in this call; deduplication happens there. */
function matchupRows(teams) {
  const rows = [];
  for (const t of teams) {
    for (const raw of members(t.matchups, "matchup")) {
      const m = flat(raw);
      const sides = members(child(m, "teams"), "team").map(flat).map((s) => ({
        teamId: String(s.team_id || String(s.team_key || "").split(".t.")[1] || ""),
        teamKey: String(s.team_key || ""),
        points: flat(s.team_points).total,
      }));
      rows.push({
        week: num(m.week),
        status: String(m.status || ""),
        isPlayoffs: yes(m.is_playoffs),
        isConsolation: yes(m.is_consolation),
        isTied: yes(m.is_tied),
        winnerTeamKey: m.winner_team_key ? String(m.winner_team_key) : null,
        sides,
      });
    }
  }
  return rows;
}

export async function leagueSnapshot(leagueKey, call, resolve) {
  const key = yahooLeagueKey(leagueKey);
  if (!key) return { reason: "not-found", snapshot: null };

  const [settingsRes, standingsRes, rostersRes, matchupsRes] = await Promise.all([
    call("league/" + key + "/settings"),
    call("league/" + key + "/standings"),
    /* Every roster in one request: a sub-resource on the teams collection
       applies to every member, the same one-call shape cbs.js buys with
       `team_id=all`. The current week's roster by default. */
    call("league/" + key + "/teams/roster"),
    /* Every team's whole season of matchups, for the schedule. Optional:
       a failure here costs the opponent beside a week and nothing else,
       which is what a Sleeper league already lives with. */
    call("league/" + key + "/teams/matchups"),
  ]);

  const fc = content(standingsRes);
  if (!fc) return { reason: reasonFor(standingsRes), snapshot: null };
  if (!content(rostersRes)) return { reason: reasonFor(rostersRes), snapshot: null };

  const league = flat(child(fc, "league"));
  const settings = flat(flat(child(content(settingsRes) || {}, "league")).settings);
  const standingTeams = members(flat(league.standings).teams, "team").map(flat);
  const rosterTeams = members(flat(child(content(rostersRes), "league")).teams, "team").map(flat);

  const week = num(league.current_week);

  const everyPlayer = [];
  const rosterOf = new Map();
  for (const t of rosterTeams) {
    const players = members(child(t.roster, "players"), "player").map(flat);
    rosterOf.set(String(t.team_id), players);
    players.forEach((p) => everyPlayer.push(p));
  }

  const resolved = everyPlayer.length && resolve ? await crosswalk(everyPlayer, resolve) : new Map();
  const crosswalkReady = resolved !== null;
  const byName = resolved || new Map();

  const unmatched = [];
  const sleeperId = (p) => {
    const k = yahooKey(p);
    if (!k.pos) return null;
    if (k.pos === "DST") return k.team || null;
    const hit = byName.get(normalise(k.name) + "|" + k.pos);
    if (!hit) unmatched.push(k.name + " (" + k.pos + (k.team ? " " + k.team : "") + ")");
    return hit || null;
  };

  const live = {};
  const teams = standingTeams.slice(0, MAX_TEAMS).map((t) => {
    const id = String(t.team_id);
    const st = flat(t.team_standings);
    const totals = flat(st.outcome_totals);
    const players = [];
    const seated = [];

    for (const p of rosterOf.get(id) || []) {
      const sid = sleeperId(p);
      if (!sid) continue;
      players.push(sid);
      const seat = seatOf(p);
      if (seat && !NOT_STARTING.has(seat)) seated.push({ sid, seat });
      const inj = yahooInjury(p);
      if (inj !== null) live[sid] = { inj };
    }

    const logo = flat(members(t.team_logos, "team_logo")[0]).url || null;
    return {
      rosterId: num(t.team_id),
      ownerId: id,
      teamName: String(t.name || "Team").slice(0, 60),
      manager: managerOf(t),
      avatar: logo,
      wins: num(totals.wins) || 0,
      losses: num(totals.losses) || 0,
      ties: num(totals.ties) || 0,
      pointsFor: num(st.points_for) || 0,
      pointsAgainst: num(st.points_against) || 0,
      /* Each team's remaining FAAB, which Yahoo states and no other
         platform here does -- the "FAAB LEFT" the Waiver Room could never
         fill. Absent (null) on a league that does not bid. */
      faabBalance: yes(settings.uses_faab) ? num(t.faab_balance) : null,
      players,
      starters: seated
        .map((s, i) => ({ s, i }))
        .sort((a, b) => yahooSeatRank(a.s.seat) - yahooSeatRank(b.s.seat) || a.i - b.i)
        .map((x) => x.s.sid),
    };
  });

  const draft = draftInfoFromYahoo(league, settings);
  const scoring = rulesFromYahoo(settings);
  const waiver = waiverFromYahoo(settings);
  const matchupTeams = content(matchupsRes)
    ? members(flat(child(content(matchupsRes), "league")).teams, "team").map(flat)
    : [];

  return {
    reason: null,
    snapshot: {
      provider: "yahoo",
      leagueId: key,
      name: String(league.name || "Untitled league").slice(0, 80),
      season: String(league.season || ""),
      totalTeams: num(league.num_teams) || teams.length,
      draftAt: draft.at,
      draftStatus: draft.status,
      week,
      seasonType: null,
      /* Yahoo's public API does not publish a per-player projection, so
         there is no league number to read and the rooms fall back to
         Juke's own under the league's rules -- and say so, which is what
         `source` is for on the platforms that do publish one. */
      projections: null,
      actuals: null,
      status: Object.keys(live).length
        ? { week, source: "yahoo", at: Date.now(), players: live }
        : null,
      waiverBudget: null,
      waiver,
      tradeDeadline: tradeDeadlineFromYahoo(settings),
      rules: scoring.rules,
      scoringUnmapped: scoring.unmapped,
      lineup: lineupFromYahoo(settings.roster_positions),
      schedule: scheduleFromYahoo(matchupRows(matchupTeams)),
      playoffTeams: num(settings.num_playoff_teams) || null,
      draft: null,
      teams,
      crosswalkReady,
      unmatched: unmatched.slice(0, 40),
      unmatchedCount: unmatched.length,
    },
  };
}
