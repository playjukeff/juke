/* ==========================================================
   Juke — the cache database, and now one real table

   D1, bound as `DB`. Sleeper's player pool and Tank01 headlines live here,
   refreshed on a cron and as a side-effect of serving them respectively —
   and, since real accounts, one row per signed-in person (see "Accounts"
   below).

   Two rules hold everywhere in this file.

   **A missing binding is a normal condition, not a fault.** `wrangler dev`
   with no database_id, a keyless local run, the tests that drive the news
   path against a stub — none of those have a database and all of them must
   keep working exactly as they did. Every function here answers "no" to an
   absent `env.DB` rather than throwing, so nothing above it needs to know
   whether the database exists.

   **Nothing here ever throws.** The news route's contract is that it fails by
   disappearing — the same contract the score strip has. A rejected promise on
   this path is an unhandled rejection on a page that is otherwise fine, so
   every call is wrapped and the failure is a return value.

   **A third rule — "this is a cache and never a source of truth" — used to
   hold everywhere in this file and no longer does.** It is still exactly
   true of the player pool (players.js/stats.js are the board, generated
   nightly, and a room pins the version it started on) and of the headline
   cache. It was never true of `signups`, a real list with nothing upstream
   to be a cache of, and `users` (below) is the same shape: Clerk is the
   source of truth for identity, but the row itself — that this person has
   an account at all, in this database — belongs to Juke and nowhere else.
   ========================================================== */

/* SQLite has no date type, so every timestamp in this database is epoch
   seconds. Milliseconds would be the JavaScript-shaped choice and buys
   precision nothing here needs — these are cache clocks measured in hours. */
export function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/* ----------------------------------------------------------
   The player pool
   ---------------------------------------------------------- */

import { normalise } from "./names.js";

const SLEEPER_POOL = "https://api.sleeper.app/v1/players/nfl";

/* The same escape hatch TANK01_BASE already is, for the same reason.

   The real endpoint is about five megabytes of live data, so a test that used
   it would be slow, would need the network, and could never assert a count —
   the pool moves every day. `SLEEPER_BASE` lets test-store.mjs serve a small
   canned pool with the awkward rows in it on purpose: a team defense, which
   has no full_name and whose id is the club code, and a fullback who qualifies
   on fantasy_positions rather than on position.

   It is read per call rather than closed over, because `env` is per request. */
function poolUrl(env) {
  return (env && env.SLEEPER_BASE) || SLEEPER_POOL;
}

/* The positions this app drafts, and nothing else.

   Sleeper's pool is every player it has ever heard of — around eleven
   thousand rows, most of them long-snappers and practice-squad linemen that
   no fantasy league starts. Filtering here rather than storing it all is the
   difference between four thousand rows a night and eleven thousand, and the
   rows we would be keeping cannot appear on any board this app builds.

   It is a literal rather than derived from POSITIONS in app.js because that
   file is the *page*, and the worker does not load it. Whichever way round
   that dependency ran would be the worse of the two. */
const POOL_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/* D1 allows 100 bound parameters per statement. Five columns a row puts the
   ceiling at exactly twenty, which is the wrong number to pick: a sixth column
   added later would silently start truncating a batch. Sixteen leaves room. */
const ROWS_PER_STATEMENT = 16;
const STATEMENTS_PER_BATCH = 40;

/* Refresh the pool. Returns a count, or null when there is no database.

   **Upsert, never replace.** A DELETE-then-INSERT is the obvious shape and
   loses the whole table if the fetch half-succeeds. It is also unnecessary: a
   player who has left the league is not a row that needs removing, he is a row
   whose `last_updated` stopped moving, which is a fact worth being able to
   read. Nothing here reads a stale row and the pool is bounded at a few
   thousand, so there is no growth to prune.

   **CPU is the thing to watch, and it has not been measured yet.** The
   response is about five megabytes and `res.json()` parses all of it before a
   single row is written, which is real CPU rather than the I/O the plan limits
   are generous about. If this is what trips, the answer is not to micro-tune
   the parse — there is no streaming JSON parser available without adding a
   dependency, which this project does not do. It is to move the sync into
   scripts/build_players.py, which already fetches this exact endpoint every
   morning where CPU costs nothing, and have it write through D1's HTTP API.
   Read the CPU time on a real run before deciding. */
export async function syncPlayerPool(env) {
  if (!env.DB) return null;

  try {
    const res = await fetch(poolUrl(env), {
      headers: { "accept": "application/json" }
    });
    if (!res.ok) throw new Error("sleeper " + res.status);

    const pool = await res.json();
    const rows = poolRows(pool, nowSeconds());
    if (!rows.length) throw new Error("sleeper returned no usable rows");

    let written = 0;
    for (const batch of chunk(chunk(rows, ROWS_PER_STATEMENT), STATEMENTS_PER_BATCH)) {
      await env.DB.batch(batch.map((group) => upsertPlayers(env, group)));
      written += batch.reduce((n, group) => n + group.length, 0);
    }
    return written;
  } catch (err) {
    /* Logged, not thrown. A cron that throws is a red mark in the dashboard
       and a cache that is one day staler, and only one of those two is worth
       anything — but the log line is how you find out which morning it
       stopped, so it is not swallowed silently either. */
    console.error("player pool sync failed:", err && err.message);
    return null;
  }
}

/* Sleeper's payload is an object keyed by id, so this walks values.

   A team defense is the row to be careful with: its id is the club code
   ("PIT"), and it carries no `full_name`, so a naive read stores a nameless
   row. It is eleven people rather than a person — the same reason bioLine()
   gives a defense its own line instead of a strip of dashes. */
function poolRows(pool, stamp) {
  const rows = [];
  for (const id of Object.keys(pool || {})) {
    const p = pool[id] || {};
    const pos = String(p.position || "").toUpperCase();
    const fantasy = Array.isArray(p.fantasy_positions) ? p.fantasy_positions : [];

    const drafted = POOL_POSITIONS.indexOf(pos) >= 0 ||
                    fantasy.some((f) => POOL_POSITIONS.indexOf(String(f).toUpperCase()) >= 0);
    if (!drafted) continue;

    const name = String(
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      id
    ).trim().slice(0, 80);
    if (!name) continue;

    rows.push([
      String(id).slice(0, 24),
      name,
      pos || null,
      p.team ? String(p.team).toUpperCase().slice(0, 8) : null,
      stamp,
      // 0007's join key. Derived here rather than at read time because
      // SQLite cannot call normalise() — see that migration for why an
      // exact name will not do the job.
      normalise(name) || null
    ]);
  }
  return rows;
}

function upsertPlayers(env, group) {
  const values = group.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  return env.DB.prepare(
    "INSERT INTO players (player_id, name, position, team, last_updated, name_key) VALUES " +
    values +
    " ON CONFLICT(player_id) DO UPDATE SET" +
    "   name = excluded.name," +
    "   position = excluded.position," +
    "   team = excluded.team," +
    "   last_updated = excluded.last_updated," +
    // Without this a pool that synced before 0007 keeps its NULL key for
    // ever: every row conflicts on player_id from the second sync onward,
    // so the column would only ever fill for players who are new to the
    // league. The crosswalk would work, on rookies.
    "   name_key = excluded.name_key"
  ).bind(...group.flat());
}

/* ----------------------------------------------------------
   Headlines
   ---------------------------------------------------------- */

/* Whether a headline is one we may show at all.

   Three conditions, and each is a rule from elsewhere in the project rather
   than a preference:

   - **A title**, or there is nothing to draw.
   - **A source**, because we link and attribute rather than republish, and an
     unattributed headline is the version of this feature that is not allowed.
   - **An http(s) link**, because a `javascript:` href is an outside party
     running script in the page, and because a card the page will refuse to
     build is a card that should never have been sent to it.

   It lives here, next to the CHECK constraints that encode the same three
   rules, and `fetchUpstreamNews()` imports it rather than writing a second
   copy. That is not tidiness: the two paths have to agree exactly or a cache
   hit renders a different set of cards from a cache miss, which is a
   difference only the readers who happen to hit the cache ever see. The first
   version of this filtered on the way *into* the database and not on the way
   out of the provider, and a cold ask returned five cards where a warm one
   returned four.

   safeNewsUrl() in the page still checks the link before building an anchor.
   Both ends of the rule are cheap, and the page cannot assume the worker is
   the only thing that ever talks to it. */
export function showableNews(item) {
  if (!item || !item.title || !item.source) return false;
  return /^https?:\/\//i.test(String(item.url || ""));
}

/* The list, exactly as it will be served — from either tier.

   This is the whole answer to "a cache hit must be indistinguishable from a
   cache miss", and it took three goes to get there because the divergences
   hide in different places:

   - **the filter**, which dropped an unlinkable card on the way into the
     database and not on the way out of the provider;
   - **the duplicate**, because the primary key is (player, url) and the feed
     really does return one story twice under two headlines — so the database
     kept three where the response carried four;
   - **the order**, because the response was in the provider's order and
     `cachedNews()` reads back newest-first. Nobody would call either wrong,
     and they are not the same list.

   Every one of those is invisible to whoever is testing, because a developer
   with a warm cache and a developer with a cold one see different things and
   both look right. So the normalisation happens once, here, and both paths
   call it.

   Sorted newest-first with the link as the tiebreaker, which is what the
   ORDER BY in cachedNews() sorts by, so two headlines stamped the same day
   cannot come back in one order from the provider and the other from D1. */
export function usableNews(list) {
  const seen = new Set();
  const out = [];

  for (const item of Array.isArray(list) ? list : []) {
    if (!showableNews(item)) continue;
    const url = String(item.url).slice(0, 400);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(item);
  }

  return out.sort(function (a, b) {
    const at = publishedSeconds(a.at);
    const bt = publishedSeconds(b.at);
    if (at !== bt) return bt - at;
    return String(a.url) < String(b.url) ? -1 : 1;
  });
}

/* Twelve hours, and the number comes from the allowance rather than from
   taste.

   Tank01's free tier is a thousand calls a month. The edge cache in front of
   this is fifteen minutes, which is the freshness tier and is per-colocation
   and evictable — so on its own the worst case is one upstream call per
   player per quarter hour per data centre, and a board sweep of 201 players
   is a fifth of the month in one sitting. This tier is the quota tier: it is
   global, it survives eviction, and a floor of twelve hours caps the spend at
   two calls per player per day.

   Which is the arithmetic to redo before changing it. 1000 / 30 days / 2 calls
   is about **sixteen distinct players a day**, which is a drafting session or
   two and not a board sweep. Halving this to six hours halves that to eight.
   Headlines matter most on a game day and change hourly at most, so the
   freshness being traded away is small and the allowance being protected is
   the whole feature. */
const NEWS_DB_TTL = 43200;

/* What we have on file, or null.

   Null means "ask upstream" and covers three different situations on purpose:
   no database, nothing stored, and stored-but-stale. The caller does the same
   thing in all three, so distinguishing them here would be a distinction with
   nowhere to go.

   An empty `items` array is *not* null, and that is the point of the lookups
   table. "He has no news today" is an answer, and re-asking for it would spend
   the allowance on exactly the players who have nothing to say. */
export async function cachedNews(env, playerId) {
  if (!env.DB) return null;

  try {
    const key = playerId || "none";
    const floor = nowSeconds() - NEWS_DB_TTL;

    const lookup = await env.DB
      .prepare("SELECT fetched_at FROM news_lookups WHERE player_id = ? AND fetched_at > ?")
      .bind(key, floor)
      .first();
    if (!lookup) return null;

    /* Ordered by the article's own date, newest first, with the rows that
       carried no date last rather than first. A missing timestamp is 0, and 0
       sorted as a number is the oldest thing in the table — which is the
       correct end for it, because a headline with no date is the one we can
       say least about. This is the same rule sortedPlayers() follows: a
       missing number is not a small number. */
    const rows = await env.DB.prepare(
      "SELECT news_id, headline, content, source, published_text" +
      " FROM player_news WHERE player_id = ?" +
      " ORDER BY timestamp DESC LIMIT 20"
    ).bind(key).all();

    /* The shape fetchUpstreamNews() returns, field for field. A cache hit and a
       cache miss have to be indistinguishable to the page — `at` is the
       provider's own string out of published_text rather than the sortable
       integer reformatted, because the integer is for the ORDER BY above and
       has no business on a card. */
    /* Back through the same normalisation the upstream path uses, and that is
       not belt-and-braces — without it a cache hit and a cache miss really do
       hand the page different orders.

       `ORDER BY timestamp DESC` has no tie-break, and `publishedSeconds()`
       maps a missing date to 0, so every undated headline ties at zero and
       comes back in whatever order the rows happen to sit in. usableNews()
       breaks that tie on the url. Tank01 sends no date on plenty of items —
       that is why `at` had to stop falling back to the player id — so the tie
       is the common case rather than a corner of one, and the difference is
       visible only to the readers who happen to hit the cache, which is the
       hardest kind of difference to ever notice.

       The filter and the dedup it also applies are already guaranteed here by
       the CHECK constraints and the composite primary key. The ordering is the
       one that was actually diverging. */
    return usableNews((rows.results || []).map((r) => ({
      title: r.headline,
      summary: r.content || "",
      source: r.source,
      at: r.published_text || "",
      url: r.news_id
    })));
  } catch (err) {
    /* A cache miss, as far as the caller is concerned. A database that is down
       must cost a sheet its cached headlines and nothing else. */
    console.error("news cache read failed:", err && err.message);
    return null;
  }
}

/* Keep what we just fetched. Returns whether it was kept.

   Called through ctx.waitUntil(), so it runs after the response has gone. The
   reader is not waiting on a write to a cache that exists to make *later*
   readers faster, and a write that fails must not turn a served answer into an
   error.

   The player's rows are replaced rather than merged, in one batch so it is one
   transaction. A story that has dropped off the feed has dropped off the feed;
   merging would accumulate every headline a player ever had and quietly serve
   last month's alongside this morning's. */
export async function storeNews(env, playerId, items) {
  if (!env.DB) return false;

  const key = playerId || "none";
  const stamp = nowSeconds();
  const list = Array.isArray(items) ? items : [];

  try {
    /* The same normalisation the response went through.

       Which looks redundant and is not, twice over. This table's CHECK
       constraints refuse an unshowable row, and a batch is one transaction, so
       a single bad row does not fail itself — it throws away every good row
       beside it. And the primary key is (player_id, url), so one repeated
       article inside a batch is the same all-or-nothing failure. */
    const kept = usableNews(list);

    /* `item_count` counts what survived, not what arrived. A count that
       disagrees with the rows beside it is how you stop believing the cache,
       which is the same reason link_source_ids() tallies the join after the
       fact rather than as it goes. */
    const statements = [
      env.DB.prepare("DELETE FROM player_news WHERE player_id = ?").bind(key),
      env.DB.prepare(
        "INSERT INTO news_lookups (player_id, fetched_at, item_count) VALUES (?, ?, ?)" +
        " ON CONFLICT(player_id) DO UPDATE SET" +
        "   fetched_at = excluded.fetched_at," +
        "   item_count = excluded.item_count"
      ).bind(key, stamp, kept.length)
    ];

    for (const item of kept) {
      const url = String(item.url).slice(0, 400);

      statements.push(env.DB.prepare(
        "INSERT INTO player_news" +
        " (news_id, player_id, headline, content, source, url," +
        "  timestamp, published_text, fetched_at)" +
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        url,
        key,
        String(item.title).slice(0, 200),
        String(item.summary || "").slice(0, 400),
        String(item.source).slice(0, 60),
        url,
        publishedSeconds(item.at),
        String(item.at || "").slice(0, 40),
        stamp
      ));
    }

    await env.DB.batch(statements);
    return true;
  } catch (err) {
    console.error("news cache write failed:", err && err.message);
    return false;
  }
}

/* The provider's date as epoch seconds, or 0.

   `Date.parse` on a string the provider did not promise is a date returns NaN,
   and NaN bound to an INTEGER column is not an error anybody sees — it is a
   row that sorts unpredictably for ever. A field with no usable value is 0,
   which the ORDER BY above puts last on purpose. */
function publishedSeconds(raw) {
  if (!raw) return 0;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/* ----------------------------------------------------------
   Email capture — phase 0
   ---------------------------------------------------------- */

/* Keep one signup. Returns whether it was kept.

   No account exists behind this and none is implied. It is a mailing list of
   one column plus provenance: an email, which dead end asked for it, and
   when. Same shape as storeNews() above and for the same reason — a form
   failing because the cache database hiccuped is worse than a write we
   quietly lost, so this never throws and the caller decides what "kept"
   means to the person who typed the address. */
export async function storeSignup(env, email, source) {
  if (!env.DB) return false;

  try {
    await env.DB.prepare(
      "INSERT INTO signups (email, source, created_at) VALUES (?, ?, ?)"
    ).bind(
      String(email || "").slice(0, 254),
      String(source || "").slice(0, 64),
      nowSeconds()
    ).run();
    return true;
  } catch (err) {
    console.error("signup write failed:", err && err.message);
    return false;
  }
}

/* ----------------------------------------------------------
   Accounts
   ---------------------------------------------------------- */

/* Record that a verified Clerk user was seen, and return whether the row
   is new. auth.js decides *who* this is (Clerk's own signature check);
   this function only ever runs after that has already succeeded, so
   `clerkId` here is trusted the same way a room's own `member` id is
   trusted once a socket has been accepted — verification is somebody
   else's job and already done by the time this is called.

   One statement, not a SELECT-then-INSERT: two round trips racing each
   other on somebody's first request is exactly the kind of thing this
   project's CLAUDE.md keeps finding as a bug once two clients (or two
   in-flight requests from one impatient tab) disagree about which one
   created the row. `ON CONFLICT DO UPDATE` makes it one statement and one
   answer regardless of how many requests get here first — `created_at` is
   `excluded.created_at` only when the row does not yet exist, because a
   real INSERT can't happen twice; every later call is only ever a
   `last_seen_at` bump. */
export async function touchUser(env, clerkId) {
  if (!env.DB) return false;

  try {
    const stamp = nowSeconds();
    await env.DB.prepare(
      "INSERT INTO users (clerk_id, created_at, last_seen_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(clerk_id) DO UPDATE SET last_seen_at = excluded.last_seen_at"
    ).bind(clerkId, stamp, stamp).run();
    return true;
  } catch (err) {
    console.error("user touch failed:", err && err.message);
    return false;
  }
}

/* How many leagues each tier may connect. 'free' is zero on purpose — a
   free account is a guest in every way that matters here, demo data only —
   so this is also the map meLeaguesRoute() refuses a connect against. */
export const LEAGUE_CAP = { free: 0, pro: 1, allaccess: 6 };

/* Which plan an account is on, or null if the question could not be
   answered.

   null is not 'free'. A missing row means an account 0003's own default
   already covers correctly — nobody has touched it, so 'free' is the true
   answer — but a thrown query means the column is not there yet (a worker
   deployed ahead of this migration) or D1 is unreachable, and neither of
   those is evidence that the account is on the free tier. Collapsing them
   would let an infra hiccup downgrade somebody who is paying; the caller
   decides what "unknown" is worth, the same way listLeagues() lets its
   caller decide what an empty read means. */
export async function getTier(env, clerkId) {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT tier FROM users WHERE clerk_id = ?"
    ).bind(clerkId).first();
    return (row && row.tier) || "free";
  } catch (err) {
    console.error("tier read failed:", err && err.message);
    return null;
  }
}

/* ----------------------------------------------------------
   Saved drafts and history

   app.js already owns two localStorage keys and a versioned shape for
   each — SAVE_KEY (one in-progress draft) and HISTORY_KEY (an array of
   finished ones). Every function below stores or returns that exact JSON
   whole, in a `data` column, rather than decomposing it into columns of
   our own — see migrations/0004_drafts.sql's own comment for why. This
   file's job stops at "whose row is this and when did it change"; what
   the JSON inside means is entirely app.js's business, on both ends.
   ---------------------------------------------------------- */

/* The one in-progress draft a signed-in person has, already parsed, or
   null. Deliberately not `{ data, updatedAt }`: saveDraft() already writes
   its own `savedAt` (ms, Date.now()) inside the blob, so a second,
   server-timestamped `updatedAt` alongside it would be the same fact
   twice, in two different units, under two different names — exactly the
   trap this project's CLAUDE.md keeps finding bugs from. Whatever
   compares "is the server's copy newer than mine" reads `data.savedAt`
   on both sides. `updated_at` still exists as a real column, for D1's own
   bookkeeping — it is just never handed back out. */
export async function getSavedDraft(env, clerkId) {
  if (!env.DB) return null;

  try {
    const row = await env.DB.prepare(
      "SELECT data FROM saved_drafts WHERE clerk_id = ?"
    ).bind(clerkId).first();
    return row ? JSON.parse(row.data) : null;
  } catch (err) {
    console.error("saved-draft read failed:", err && err.message);
    return null;
  }
}

/* The `users` row every write below depends on, created on the way past.

   `saved_drafts.clerk_id` and `draft_history.clerk_id` both carry
   `REFERENCES users(clerk_id)`, and D1 enforces foreign keys — verified,
   not assumed: an insert against a clerk_id with no users row fails with
   `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY`.

   That row was only ever created by touchUser(), and touchUser() is only
   called from `GET /me` — which nothing on the client has ever called.
   So every save and every history entry, for every account, failed the
   moment it reached D1: reads answered 200 (an empty account and a
   missing row look identical), writes came back `{ok:false}`, and because
   every layer here answers a failure with a falsy value the page could
   only say "could not reach your account". Reported from a real signed-in
   locker showing eight mocks it could not upload.

   Batched with the write rather than run before it: one round trip, and
   the two either both land or neither does, which is what the foreign key
   is asking for. ON CONFLICT DO UPDATE keeps it a touch rather than an
   error on the ordinary case where the row is already there — the same
   statement touchUser() runs, deliberately identical so the two cannot
   drift about what a user row is. */
function upsertUser(env, clerkId, stamp) {
  return env.DB.prepare(
    "INSERT INTO users (clerk_id, created_at, last_seen_at) VALUES (?, ?, ?)" +
    " ON CONFLICT(clerk_id) DO UPDATE SET last_seen_at = excluded.last_seen_at"
  ).bind(clerkId, stamp, stamp);
}

/* Replace the one saved draft, whole — the same "there is only ever one"
   contract saveDraft() already enforces client-side by writing to a
   single localStorage key rather than appending to a list. `dataText` is
   the already-serialised JSON string the route handler validated, not
   re-serialised here, so this function never has an opinion about what is
   inside it. */
export async function putSavedDraft(env, clerkId, dataText) {
  if (!env.DB) return false;

  try {
    const stamp = nowSeconds();
    await env.DB.batch([
      upsertUser(env, clerkId, stamp),
      env.DB.prepare(
        "INSERT INTO saved_drafts (clerk_id, data, updated_at) VALUES (?, ?, ?)" +
        " ON CONFLICT(clerk_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      ).bind(clerkId, dataText, stamp)
    ]);
    return true;
  } catch (err) {
    console.error("saved-draft write failed:", err && err.message);
    return false;
  }
}

export async function deleteSavedDraft(env, clerkId) {
  if (!env.DB) return false;

  try {
    await env.DB.prepare("DELETE FROM saved_drafts WHERE clerk_id = ?").bind(clerkId).run();
    return true;
  } catch (err) {
    console.error("saved-draft delete failed:", err && err.message);
    return false;
  }
}

/* Every finished draft a signed-in person has, newest first — the same
   order readHistory() already returns, so the route handler can hand the
   array straight to the client with no re-sort. Each element is the
   parsed entry exactly as recordHistory() built it (id, completedAt and
   all), for the same reason getSavedDraft() stops at one blob rather than
   a `{ data, updatedAt }` wrapper — the id and timestamp the client wants
   are already inside it. */
export async function listDraftHistory(env, clerkId) {
  if (!env.DB) return [];

  try {
    const rows = await env.DB.prepare(
      "SELECT data FROM draft_history WHERE clerk_id = ? ORDER BY completed_at DESC"
    ).bind(clerkId).all();
    return (rows.results || []).map((row) => JSON.parse(row.data));
  } catch (err) {
    console.error("history read failed:", err && err.message);
    return [];
  }
}

/* One entry, added or replaced whole by its own id — recordHistory()
   mints that id client-side and it never changes, so this is always an
   insert in practice; ON CONFLICT DO UPDATE exists for the same reason
   touchUser()'s does, a retried request landing twice rather than a real
   edit. */
export async function putHistoryEntry(env, clerkId, id, dataText, completedAt) {
  if (!env.DB) return false;

  try {
    const stamp = nowSeconds();
    await env.DB.batch([
      upsertUser(env, clerkId, stamp),
      env.DB.prepare(
        "INSERT INTO draft_history (id, clerk_id, data, completed_at, updated_at)" +
        " VALUES (?, ?, ?, ?, ?)" +
        " ON CONFLICT(id) DO UPDATE SET data = excluded.data," +
        "   completed_at = excluded.completed_at, updated_at = excluded.updated_at"
      ).bind(id, clerkId, dataText, completedAt, stamp)
    ]);
    return true;
  } catch (err) {
    console.error("history write failed:", err && err.message);
    return false;
  }
}

/* Scoped to the caller's own id in the WHERE clause, not just the entry
   id — the same reason a room checks that a message came from a seat it
   actually seated, rather than trusting a client-supplied id alone. A
   DELETE that matched zero rows because the id belonged to someone else
   is indistinguishable here from one that matched zero because the entry
   never existed, which is the point: neither leaks whether the id was
   real. */
export async function deleteHistoryEntry(env, clerkId, id) {
  if (!env.DB) return false;

  try {
    await env.DB.prepare(
      "DELETE FROM draft_history WHERE clerk_id = ? AND id = ?"
    ).bind(clerkId, id).run();
    return true;
  } catch (err) {
    console.error("history delete failed:", err && err.message);
    return false;
  }
}

/* Everything Juke holds for one person, removed.

   Clerk owns the account and deletes it on its own; this is the half Juke
   owns, and until now there was no half. The privacy policy said so out
   loud rather than promising otherwise — "deleting a Clerk account does
   not currently delete the drafts Juke stored against it" — which was
   honest and is not a resting place: somebody exercising a deletion right
   should not have to also send an email.

   Children before the parent. `saved_drafts` and `draft_history` both
   carry `REFERENCES users(clerk_id)`, and D1 enforces it, so removing the
   users row first fails the constraint — the mirror image of the bug that
   made these writes fail in the first place, from the other end. One
   batch, so a half-deleted account is not a state that can exist.

   Idempotent by construction: DELETE of nothing is success, which matters
   because a webhook retries, and Clerk retries a delivery it did not hear
   back from. Deleting an account twice has to be as fine as deleting it
   once. */
export async function deleteUserData(env, clerkId) {
  if (!env.DB) return false;

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM draft_history WHERE clerk_id = ?").bind(clerkId),
      env.DB.prepare("DELETE FROM saved_drafts WHERE clerk_id = ?").bind(clerkId),
      // Added with 0005_leagues.sql, and adding it here is the whole point
      // of that table having a foreign key: a new child table that this
      // batch does not know about is an account deletion that silently
      // leaves something behind, and the thing left behind would be which
      // league somebody plays in. Anything keyed by clerk_id belongs in
      // this list the day its migration lands.
      env.DB.prepare("DELETE FROM connected_leagues WHERE clerk_id = ?").bind(clerkId),
      env.DB.prepare("DELETE FROM users WHERE clerk_id = ?").bind(clerkId)
    ]);
    return true;
  } catch (err) {
    console.error("account delete failed:", err && err.message);
    return false;
  }
}

/* ----------------------------------------------------------
   Small things
   ---------------------------------------------------------- */

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/* ---------- The cross-provider player crosswalk ----------

   ESPN (and Yahoo, and CBS, when they arrive) hand back rosters of THEIR
   player ids. Everything downstream of a snapshot — the board, the
   projections, every room — is keyed by Sleeper's. This is the join, and
   the pool cached above is what makes it possible: it is the first reader
   that table has ever had.

   ---- Three tiers, in order of how much they can be trusted ----

   Same shape as link_source_ids() and link_nflverse() in the pipeline, and
   for the same reason: a crosswalk that misses quietly is worse than no
   crosswalk, because a wrong match does not look wrong on the page.

     1. name key + position + club — all three agree.
     2. name key + position — he has changed club since one side last
        looked, which is the ordinary case in September.
     3. nothing — reported, never guessed.

   A defense never reaches here: Sleeper's player_id for one IS the club
   abbreviation, so espn.js resolves it from the club alone.

   ---- Ambiguity is dropped, not picked ----

   Two Sleeper players can share a name key at one position (a suffix
   stripped off a father and a son). Where club separates them, tier 1 does
   it. Where it does not, picking one is a coin flip that puts another
   man's projections on somebody's roster, so both are dropped and the name
   is reported — which is exactly what the pipeline does with a Tank01
   collision. */

const RESOLVE_CHUNK = 90;

/* Answers a Map from `name_key|POS` to a Sleeper player id.

   **null, not an empty Map, when the pool has never synced.** Those are
   different facts and only one is worth telling somebody about: an empty
   Map means "none of these players exist", which would render as a league
   of empty rosters, and the pool being unfilled means "ask again in a
   minute". A caller that cannot tell them apart will draw the first when
   it should be saying the second — the same line `configured: false` draws
   for the news route. */
export async function resolveSleeperIds(env, wanted) {
  if (!env.DB) return null;
  if (!wanted || !wanted.length) return new Map();

  const keys = [...new Set(wanted.map((w) => normalise(w.name)).filter(Boolean))];
  if (!keys.length) return new Map();

  const rows = [];
  try {
    for (let i = 0; i < keys.length; i += RESOLVE_CHUNK) {
      const group = keys.slice(i, i + RESOLVE_CHUNK);
      const res = await env.DB.prepare(
        "SELECT player_id, position, team, name_key FROM players" +
        " WHERE name_key IN (" + group.map(() => "?").join(", ") + ")"
      ).bind(...group).all();
      rows.push(...(res.results || []));
    }
  } catch (err) {
    // A missing table or a missing 0007 column. Either way there is no
    // crosswalk to be had, and null says so rather than claiming the
    // players do not exist.
    console.error("crosswalk read failed:", err && err.message);
    return null;
  }

  /* An empty result is ambiguous in exactly the way this function refuses
     to be: nobody matched, or the pool has never been filled. One extra
     count settles it, and only on the path where it matters. */
  if (!rows.length) {
    try {
      const probe = await env.DB.prepare("SELECT COUNT(*) AS n FROM players").first();
      if (!probe || !probe.n) return null;
    } catch (err) {
      return null;
    }
  }

  /* Sleeper stores a defense's position as DEF and the rest of this
     project calls it DST. Translated here, at the one place the two
     vocabularies meet, rather than at every caller. */
  const posOf = (p) => (String(p || "").toUpperCase() === "DEF" ? "DST" : String(p || "").toUpperCase());

  const byKeyPosTeam = new Map();
  const byKeyPos = new Map();
  const seen = new Map();
  rows.forEach((r) => {
    const pos = posOf(r.position);
    const kp = r.name_key + "|" + pos;
    const kpt = kp + "|" + String(r.team || "").toUpperCase();
    if (!byKeyPosTeam.has(kpt)) byKeyPosTeam.set(kpt, r.player_id);
    // Count how many distinct players share the looser key, so an
    // ambiguous one can be refused rather than resolved by luck.
    seen.set(kp, (seen.get(kp) || 0) + 1);
    if (!byKeyPos.has(kp)) byKeyPos.set(kp, r.player_id);
  });

  const out = new Map();
  wanted.forEach((w) => {
    const key = normalise(w.name);
    if (!key || !w.pos) return;
    const kp = key + "|" + w.pos;
    const exact = byKeyPosTeam.get(kp + "|" + String(w.team || "").toUpperCase());
    if (exact) { out.set(kp, exact); return; }
    // Only when he is the sole candidate at that name and position.
    if (seen.get(kp) === 1) out.set(kp, byKeyPos.get(kp));
  });

  return out;
}

/* ---------- Connected leagues ----------

   A league connection is identity, not content: which league, which member
   of it this account is, and a small cache of the label so the header chip
   can draw without a Sleeper round trip. The league's actual state —
   rosters, records, points — is never stored. It is fetched and cached at
   the edge by the snapshot route, because it changes on its own and a copy
   here would be a second answer to "what is the score" that nothing
   refreshes.

   Same guards as every function above: a missing DB binding is a normal
   condition, and a failure is a value rather than a throw. */

/* An account's leagues, the active one first.

   "Active" is most-recently-selected (0006), which makes the head of this
   list the league every screen draws — the header chip, the League Room,
   the You screen's card. Selecting is one UPDATE and nothing has to be
   cleared; see the migration for why that beats a flag.

   ---- The fallback is not defensive tidiness ----

   The site deploys itself from git and the worker does not, so worker code
   carrying this query can be live against a database that has not had 0006
   applied. Without the retry that is not a degraded feature: the exception
   is caught below and reported as an account with no leagues at all, so a
   signed-in manager with two connected leagues is offered "Connect a
   league" on every screen. Falling back to the 0005 ordering costs one
   failed statement and keeps the product working exactly as it did.

   The order of the two matters: the new query is tried first, so an
   applied migration never pays for the old one. */
/* The read, as a ladder of progressively older schemas.

   ---- Why this is a ladder and not two attempts ----

   It was two: the 0006 ordering, falling back to 0005's. Adding 0008's
   draft columns to the shared SELECT broke it silently, because BOTH
   attempts then named `draft_at` — so against a database without 0008 they
   both threw and this answered `[]`, which reads as an account with no
   leagues at all. That is the exact failure the fallback was written to
   prevent, reintroduced by the change that trusted it.

   The lesson is the shape rather than the bug: **a fallback that shares a
   fragment with the thing it is falling back from is not a fallback.** Each
   rung here names its own columns, so a new one is a new entry and cannot
   quietly break the older ones.

   ---- Why any of this exists ----

   The site deploys itself from git and the worker does not, so worker code
   is at some point live against a database that has not had the latest
   migration applied. Every rung is one failed statement and a correct,
   slightly older answer; the alternative is a signed-in manager being told
   they have no leagues.

   Ordered newest first, so an up-to-date database never pays for the
   history. */
const LEAGUE_READS = [
  // 0008: draft time. 0006: which league is active.
  "SELECT provider, league_id, owner_id, name, season, total_teams, connected_at," +
  " refreshed_at, draft_at, draft_status FROM connected_leagues WHERE clerk_id = ?" +
  " ORDER BY COALESCE(selected_at, connected_at) DESC, connected_at DESC",

  // 0006 without 0008.
  "SELECT provider, league_id, owner_id, name, season, total_teams, connected_at," +
  " refreshed_at FROM connected_leagues WHERE clerk_id = ?" +
  " ORDER BY COALESCE(selected_at, connected_at) DESC, connected_at DESC",

  // 0005 alone, which is where this started.
  "SELECT provider, league_id, owner_id, name, season, total_teams, connected_at" +
  " FROM connected_leagues WHERE clerk_id = ? ORDER BY connected_at DESC",
];

export async function listLeagues(env, clerkId) {
  if (!env.DB) return [];

  const shape = (res) => (res.results || []).map((r) => ({
    provider: r.provider,
    leagueId: r.league_id,
    ownerId: r.owner_id,
    name: r.name,
    season: r.season,
    totalTeams: r.total_teams,
    connectedAt: r.connected_at,
    // Epoch seconds, and the one field here nothing draws: it is what the
    // route reads to decide whether this cache is worth re-reading. Absent
    // on the oldest rung, where staleLeague() falls back to connectedAt.
    refreshedAt: r.refreshed_at,
    // Milliseconds, as both platforms send it and as a browser counts down
    // from. The one timestamp in this table that is not epoch seconds, and
    // it says so here because the column name cannot.
    draftAt: r.draft_at === undefined ? null : r.draft_at,
    draftStatus: r.draft_status === undefined ? null : r.draft_status,
  }));

  let last = null;
  for (let i = 0; i < LEAGUE_READS.length; i++) {
    try {
      return shape(await env.DB.prepare(LEAGUE_READS[i]).bind(clerkId).all());
    } catch (err) {
      last = err;
      /* A missing column means an unapplied migration and the next rung is
         the right answer. A missing TABLE means an account with no leagues,
         which every rung will conclude equally — so this costs two extra
         failed statements in that case and nothing else. */
    }
  }

  // Nothing worked: no table, or a database that is not this one.
  console.error("leagues read failed:", last && last.message);
  return [];
}

/* Connect, or refresh what is already connected.

   Batched with the users upsert for the reason upsertUser() explains at
   length: connected_leagues.clerk_id carries a foreign key, that row is
   only otherwise created by GET /me, and a write against a missing one
   fails with SQLITE_CONSTRAINT_FOREIGNKEY — which is what silently broke
   every saved draft for every account once already.

   ON CONFLICT updates rather than errors, so pressing connect twice on a
   league already connected refreshes its cached label instead of failing.
   That is also how the snapshot route keeps the label current. */
/* Connect, or refresh what is already connected.

   Batched with the users upsert for the reason upsertUser() explains at
   length: connected_leagues.clerk_id carries a foreign key, that row is
   only otherwise created by GET /me, and a write against a missing one
   fails with SQLITE_CONSTRAINT_FOREIGNKEY — which is what silently broke
   every saved draft for every account once already.

   ON CONFLICT updates rather than errors, so pressing connect twice on a
   league already connected refreshes its cached label instead of failing.

   ---- The write needs the same ladder the read has, and it did not ----

   listLeagues() degrades across schema versions because the worker ships
   separately from the site. This did not, and the consequence was measured
   in production rather than reasoned about: the worker carrying 0008's
   columns went live against a database that had not had 0008 applied, this
   INSERT threw, and **every connect failed** — Sleeper as well as ESPN,
   reported as "I couldn't successfully connect my ESPN league".

   The read ladder had been built and tested one commit earlier, with a note
   claiming a worker deployed ahead of its migration now "degrades to
   countdown-less rather than to no leagues". True of the read. False of the
   write, which nothing had looked at. **Half a system verified and the
   conclusion stated about the whole of it** — which is the failure this
   project keeps recording, arriving here as an outage.

   So writes ladder too, newest first. */
const LEAGUE_WRITES = [
  // 0008: the draft time.
  {
    sql:
      "INSERT INTO connected_leagues" +
      " (clerk_id, provider, league_id, owner_id, name, season, total_teams," +
      "  connected_at, refreshed_at, draft_at, draft_status)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" +
      " ON CONFLICT(clerk_id, provider, league_id) DO UPDATE SET" +
      "   owner_id = excluded.owner_id," +
      "   name = excluded.name," +
      "   season = excluded.season," +
      "   total_teams = excluded.total_teams," +
      "   refreshed_at = excluded.refreshed_at," +
      "   draft_at = excluded.draft_at," +
      "   draft_status = excluded.draft_status",
    args: (l, stamp) => [stamp, stamp, l.draftAt || null, l.draftStatus || null],
  },
  // 0005 alone. A connection without its draft time is a working connection.
  {
    sql:
      "INSERT INTO connected_leagues" +
      " (clerk_id, provider, league_id, owner_id, name, season, total_teams," +
      "  connected_at, refreshed_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)" +
      " ON CONFLICT(clerk_id, provider, league_id) DO UPDATE SET" +
      "   owner_id = excluded.owner_id," +
      "   name = excluded.name," +
      "   season = excluded.season," +
      "   total_teams = excluded.total_teams," +
      "   refreshed_at = excluded.refreshed_at",
    args: (l, stamp) => [stamp, stamp],
  },
];

export async function putLeague(env, clerkId, league) {
  if (!env.DB) return false;

  const stamp = nowSeconds();
  const head = [
    clerkId,
    league.provider,
    league.leagueId,
    league.ownerId || null,
    league.name,
    league.season,
    league.totalTeams || null,
  ];

  let last = null;
  for (let i = 0; i < LEAGUE_WRITES.length; i++) {
    const rung = LEAGUE_WRITES[i];
    try {
      await env.DB.batch([
        upsertUser(env, clerkId, stamp),
        env.DB.prepare(rung.sql).bind(...head, ...rung.args(league, stamp)),
      ]);
      return true;
    } catch (err) {
      last = err;
      /* A missing column is an unapplied migration and the next rung is the
         answer. Anything else — a foreign key, a missing table — will fail
         on every rung alike, so this costs one extra statement and then
         reports honestly. */
    }
  }

  console.error("league write failed:", last && last.message);
  return false;
}

/* Make one of this account's leagues the active one.

   The whole of switching. Everything reads the head of listLeagues(), so
   moving a row to the front of that ordering is the entire operation —
   there is no flag to clear on the others and no second write that has to
   land with this one.

   ---- It cannot select somebody else's league ----

   The WHERE is scoped by clerk_id, so a caller naming a league id they
   have not connected updates nothing, and `changes` says so. That is
   reported as a failure rather than shrugged off the way deleteLeague()
   shrugs off deleting nothing: disconnecting a league that is already gone
   is the state the caller asked for, but selecting a league that is not
   theirs is a request that did not happen, and answering "ok" would leave
   the app claiming a switch that never took.

   ---- False here is survivable, and that is deliberate ----

   putLeague() does not write this column, so a connect against an
   unmigrated database still stores the league and this call is what fails.
   The route treats that as a connect that worked, because it did: under
   the pre-0006 ordering the league just connected is already the head. */
export async function selectLeague(env, clerkId, provider, leagueId) {
  if (!env.DB) return false;

  try {
    const res = await env.DB.prepare(
      "UPDATE connected_leagues SET selected_at = ?" +
      " WHERE clerk_id = ? AND provider = ? AND league_id = ?"
    ).bind(nowSeconds(), clerkId, provider, leagueId).run();
    return Boolean(res.meta && res.meta.changes);
  } catch (err) {
    // An unmigrated 0006, or no such table. Both are "the switch did not
    // persist", and listLeagues() is what keeps the app coherent either way.
    console.error("league select failed:", err && err.message);
    return false;
  }
}

/* Refresh the cached label from a snapshot that has just been taken.

   ---- 0005 said this happened and it did not ----

   That migration's own comment reads "it is here so the header's league chip
   can draw without a round trip ... and it is refreshed whenever a snapshot
   is fetched". Nothing ever called putLeague() from a snapshot route, so
   `refreshed_at` only moved when somebody re-connected a league they were
   already connected to. A league renamed on Sleeper kept its old name in
   Juke's header for ever.

   It is true now, and the draft countdown is what forced it: a draft time
   that never refreshes is worse than a name that never refreshes, because a
   rescheduled draft counts down to the wrong instant with complete
   confidence.

   ---- Why this is not putLeague() ----

   putLeague() upserts, which is right for connecting and wrong here: a
   snapshot is fetched for the ACTIVE league, and an INSERT would silently
   re-create a row for a league the reader disconnected in another tab
   moments ago. This only ever updates a row that already exists, and
   touches no key.

   Never on the response path — the caller passes it to after(ctx, …) — and
   it answers false rather than throwing, because a stale label is not a
   reason to fail a snapshot the reader is waiting for. */
export async function refreshLeagueCache(env, clerkId, league) {
  if (!env.DB || !league) return false;

  try {
    const res = await env.DB.prepare(
      "UPDATE connected_leagues SET" +
      "   name = ?, season = ?, total_teams = ?," +
      "   draft_at = ?, draft_status = ?, refreshed_at = ?" +
      " WHERE clerk_id = ? AND provider = ? AND league_id = ?"
    ).bind(
      league.name,
      league.season,
      league.totalTeams || null,
      league.draftAt || null,
      league.draftStatus || null,
      nowSeconds(),
      clerkId,
      league.provider,
      league.leagueId
    ).run();
    return Boolean(res.meta && res.meta.changes);
  } catch (err) {
    /* The 0005 rung. Failing here is harmless in a way failing in
       putLeague() is not — a stale label is what this function exists to
       fix rather than something it breaks — but it ladders anyway, so that
       "every write to this table ladders" has no exception somebody has to
       remember when they add 0009. */
    try {
      const res = await env.DB.prepare(
        "UPDATE connected_leagues SET" +
        "   name = ?, season = ?, total_teams = ?, refreshed_at = ?" +
        " WHERE clerk_id = ? AND provider = ? AND league_id = ?"
      ).bind(
        league.name,
        league.season,
        league.totalTeams || null,
        nowSeconds(),
        clerkId,
        league.provider,
        league.leagueId
      ).run();
      return Boolean(res.meta && res.meta.changes);
    } catch (inner) {
      console.error("league cache refresh failed:", inner && inner.message);
      return false;
    }
  }
}

export async function deleteLeague(env, clerkId, provider, leagueId) {
  if (!env.DB) return false;

  try {
    await env.DB.prepare(
      "DELETE FROM connected_leagues WHERE clerk_id = ? AND provider = ? AND league_id = ?"
    ).bind(clerkId, provider, leagueId).run();
    // Deleting nothing is a success: disconnecting a league that is
    // already gone is the state the caller asked for, and Clerk's own
    // webhook retries depend on the same idempotence.
    return true;
  } catch (err) {
    console.error("league delete failed:", err && err.message);
    return false;
  }
}
