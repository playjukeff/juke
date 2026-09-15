/* The /me routes with somebody actually signed in.

   test-auth.mjs drives these against a running wrangler dev and covers every
   way of being signed OUT, because until now a token that verifies needed
   Clerk to have signed it. test-verified-user.mjs closes that at the level
   of auth.js; this closes it one layer up, at the routes that read it.

   What was unreachable, and is what this file is for:

     - `GET /me` answering `signedIn: true` at all. Only the false branch had
       ever been exercised, on a route whose whole job is telling the two
       apart.
     - `requireUser()` letting somebody THROUGH. Its 401 is well covered; a
       guard that refused everybody would have passed every check this
       project had, which is exactly what happened for eleven days.
     - **`POST /me/history` answering 409.** That branch shipped unverified:
       scripts/test_history_ownership.py proves the SQL refuses a
       cross-account write, and nothing proved the refusal becomes a status.

   ---- Two layers, and each one tests what it owns ----

   The SQL is not re-tested here. `changes: 0` is produced by a stub, on
   purpose: whether the DO UPDATE really refuses another account's row is a
   question about SQL and is answered against real sqlite3 in
   test_history_ownership.py. Whether a refusal becomes `409 id-taken` is a
   question about the route, and a stub answers it honestly. Asking one file
   to do both would make the slow half of it a worse version of a test that
   already exists — the same split test-store.mjs already draws when it
   asserts what store.js ASKS for rather than what D1 does with it.

   No wrangler and no ports: draft-room.js's default export is an ordinary
   fetch handler and imports cleanly into Node, so the real router, the real
   requireUser(), the real verifiedUser() and the real store.js all run in
   process. The only things stubbed are the two the runtime owns — D1, and a
   ctx with waitUntil.

       npm ci --prefix worker
       node worker/test-me-routes.mjs

   No network. Needs Node 22 or newer. */

import { generateKeyPairSync, createSign, createPublicKey } from "node:crypto";
import { createServer } from "node:http";
import worker from "./draft-room.js";

const fails = [];
const note = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n    got  ${g}\n    want ${w}`);
  else note.push("ok  " + name);
}

let reported = false;
function report() {
  if (reported) return;
  reported = true;
  console.log(note.join("\n"));
  console.log("");
  if (fails.length) {
    console.log("FAIL " + fails.length);
    fails.forEach((f) => console.log("  x " + f));
    return;
  }
  console.log(`OK — ${note.length} assertions with somebody signed in`);
}
process.on("uncaughtException", (err) => {
  fails.push("the run stopped here\n    " + ((err && err.stack) || err));
  process.exitCode = 1;
  report();
});
process.on("exit", report);

// ---- a signable identity, exactly as test-verified-user.mjs builds one ----

const KID = "ins_test_key_1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
const jwk = createPublicKey(publicKey).export({ format: "jwk" });
const jwks = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }));
});
await new Promise((resolve) => jwks.listen(0, "127.0.0.1", resolve));
const API_URL = `http://127.0.0.1:${jwks.address().port}`;

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function token(sub = "user_2abcDEF") {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT", kid: KID });
  const body = b64({
    iss: "https://test.clerk.accounts.dev",
    sub, sid: "sess_2abcDEF", azp: "http://localhost:5173",
    nbf: now - 5, iat: now, exp: now + 600
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(privateKey).toString("base64url")}`;
}

/* Only what the runtime owns.

   `changes` is what putHistoryEntry() reads to tell an ordinary write from
   one the DO UPDATE refused, and it is the single value this whole file
   turns on — so it is a parameter rather than a constant, and the two
   values it can take are the two branches under test. Everything else
   answers the shape store.js expects and nothing more. */
function stubDb(changes = 1, rows = [], credRows = [], failSql = null) {
  const seen = [];
  const stmt = (sql) => ({
    sql,
    bind(...args) { seen.push({ sql, args }); return this; },
    /* `failSql` makes ONE statement report that it changed nothing, which
       is what a write against a table this database has not got looks
       like from here. It is how the credential write is failed without
       failing the league write in the same breath -- the two happen on
       one request and the whole point of the assertion below is what
       happens to the league when only the second one fails. */
    async run() {
      const changed = failSql && failSql.test(sql) ? 0 : changes;
      return { success: true, meta: { changes: changed } };
    },
    /* `rows` is what listLeagues() reads. It defaults to empty, which is
       what every test above this line wants and is also exactly what kept
       the leagues GET untested for as long as it was — see the block at the
       bottom of this file.

       It answers PER TABLE, because since 0011 the leagues GET makes two
       reads and they want different answers. A stub that handed the league
       rows to both reported every connected league as carrying a stored
       ESPN credential — which is the wrong answer in the direction nobody
       would check, since the field is new and a screen drawing a
       "private" badge on everything still renders. */
    async all() {
      if (/league_credentials/.test(sql)) return { results: credRows };
      return { results: rows };
    },
    async first() { return null; }
  });
  return {
    seen,
    DB: {
      prepare: stmt,
      async batch(list) { return list.map(() => ({ success: true, meta: { changes } })); }
    }
  };
}

/* Upstream, answering "no" to everything, so the deferred refresh a stale
   league kicks off resolves without leaving the machine.

   Not optional politeness: refreshActiveLeague() is invoked synchronously by
   after() — ctx.waitUntil only decides whether the runtime WAITS for it — so
   without a base URL to point at, asserting anything about a stale league
   would fire a real request at Sleeper on every run. getJson() turns a
   non-OK into null and leagueSnapshot() then returns null, which is the
   quiet no-op path this file wants. */
const upstream = createServer((req, res) => {
  res.writeHead(404, { "content-type": "application/json" });
  res.end("null");
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
/* unref() rather than a close() at the end: the deferred refresh outlives the
   assertion that triggered it, so closing this on the last line races it and
   prints five "sleeper fetch failed" lines for connections we refused
   ourselves. Unreferenced, it serves whatever is still in flight and stops
   holding the event loop open on its own. */
upstream.unref();
const UPSTREAM = `http://127.0.0.1:${upstream.address().port}`;

const ORIGIN = "http://localhost:5173";
const CTX = { waitUntil() {} };

async function callRaw(path, { method = "GET", auth, origin = ORIGIN, body, db, ctx = CTX, env: envMore } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (auth) headers.Authorization = "Bearer " + auth;
  if (body !== undefined) headers["content-type"] = "application/json";

  const env = {
    CLERK_SECRET_KEY: "sk_test_stub",
    CLERK_API_URL: API_URL,
    SLEEPER_BASE: UPSTREAM,
    ESPN_BASE: UPSTREAM
  };
  if (envMore) Object.assign(env, envMore);
  if (db) env.DB = db.DB;

  let res;
  try {
    res = await worker.fetch(
      new Request("https://jukeff.com" + path, { method, headers, body }),
      env, ctx
    );
  } catch (err) {
    /* A route that threw instead of answering. Reported as a value rather
       than taking the run down, because that is one of the failures this file
       exists to catch now — "got {threw: ...}" names it, where an unhandled
       rejection at top level would only say the process stopped. */
    return { status: "threw", body: { threw: (err && err.message) || String(err) }, cors: null };
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { /* not every status carries one */ }
  return {
    status: res.status,
    body: parsed,
    // The one response header a browser's behaviour actually turns on.
    cors: res.headers.get("access-control-allow-origin"),
    // And the two a preflight turns on, which decide whether a verb is
    // ever actually sent -- see the /espn/league block.
    methods: res.headers.get("access-control-allow-methods"),
    allowHeaders: res.headers.get("access-control-allow-headers")
  };
}

/* Status and body, which is what almost every assertion here is about.
   callRaw() is for the two that are about the header instead. */
async function call(path, opts) {
  const { status, body } = await callRaw(path, opts);
  return { status, body };
}

// ---- GET /me, both branches of the one question it exists to answer -------

check("signed out is a 200 saying so, not an error",
      await call("/me"), { status: 200, body: { signedIn: false } });

/* The branch that had never run. A route whose entire job is telling
   "signed in" from "signed out" had only ever been asked the second one. */
check("a signed-in caller is told so, with their own id",
      await call("/me", { auth: token() }),
      { status: 200, body: { signedIn: true, userId: "user_2abcDEF", tier: null } });

check("the id is the token's subject rather than anything the caller sent",
      (await call("/me", { auth: token("user_someone_else") })).body.userId,
      "user_someone_else");

// A missing D1 binding is a normal condition, so tier is null rather than a
// guess and the route still answers — the contract store.js keeps, checked
// at the level a reader actually meets it.
check("no database still answers the question",
      (await call("/me", { auth: token() })).body.signedIn, true);

// ---- requireUser(), letting somebody through --------------------------------

check("an authenticated route refuses a caller with no token",
      (await call("/me/history")).status, 401);

check("and refuses a token that does not verify",
      (await call("/me/history", { auth: token().slice(0, -6) + "AAAAAA" })).status, 401);

/* The guard admitting somebody, which nothing could reach before. A
   requireUser() that refused everybody passed every check this project had
   for eleven days, and this is the line that would have said so. */
check("and lets a verified caller through to the route",
      await call("/me/history", { auth: token(), db: stubDb() }),
      { status: 200, body: { entries: [] } });

// The origin check runs BEFORE the token is looked at, so a perfectly good
// token from the wrong place is still refused — and refused 403, not 401,
// because those are different facts about the caller.
check("a valid token from a disallowed origin is still refused",
      (await call("/me/history", { auth: token(), origin: "https://evil.example" })).status, 403);

check("and with no Origin at all",
      (await call("/me/history", { auth: token(), origin: null })).status, 403);

// ---- POST /me/history, and the 409 that shipped unverified ------------------

const entry = JSON.stringify({ id: "h1", completedAt: Date.now() });

check("a history write the database accepts is reported as written",
      await call("/me/history", { method: "POST", auth: token(), body: entry, db: stubDb(1) }),
      { status: 200, body: { ok: true } });

/* #175's branch. The SQL refuses a write whose id belongs to another
   account by leaving the row alone and reporting no changes; this is the
   half that turns that into something a client can act on, and it had never
   been run. */
check("a write the database refuses is a 409, not a cheerful ok",
      await call("/me/history", { method: "POST", auth: token(), body: entry, db: stubDb(0) }),
      { status: 409, body: { ok: false, error: "id-taken" } });

// The refusal is about ownership, so it must not be reachable without a
// token at all — otherwise the interesting status is just a new way to
// probe which ids exist.
check("and the 409 is behind the same guard as everything else",
      (await call("/me/history", { method: "POST", body: entry, db: stubDb(0) })).status, 401);

// ---- GET /me/leagues, for an account that actually has one ----------------

/* The branch nothing here could reach until stubDb() learned to return rows,
   and the gap that let a ReferenceError run in production for three days.
 *
 * meLeaguesRoute()'s GET only touches staleLeague() when `leagues[0]` exists,
 * so an empty result set skips it entirely. Every test in this project ran
 * against an empty one: the suite has no connected league, keyless preview
 * builds render the signed-out fallback, and `curl` sends no token and stops
 * at the 401. The route answered 200 for all of them and always would. The
 * only callers who could reach the throw were accounts with a league
 * connected — the real users, and nobody else.
 *
 * `refreshed_at: 1` is what makes this the interesting row rather than any
 * row: staleLeague() returns early for a drafted league, so a "complete"
 * status here would pass against the bug. */
const LEAGUE_ROW = {
  provider: "sleeper",
  league_id: "1401655775939567616",
  owner_id: "owner_1",
  name: "Juke Fantasy Football",
  season: "2026",
  total_teams: 10,
  connected_at: 1,
  refreshed_at: 1,
  draft_at: null,
  draft_status: null
};

/* The credential map rides alongside the list, and carries no credential
   in it: see 0011_league_credentials.sql for why a screen's answer is a
   second read rather than a column on the row above. */
check("a connected league is listed rather than throwing on the way out",
      await call("/me/leagues", { auth: token(), db: stubDb(1, [LEAGUE_ROW]) }),
      { status: 200, body: { leagues: [{
        provider: "sleeper",
        leagueId: "1401655775939567616",
        ownerId: "owner_1",
        name: "Juke Fantasy Football",
        season: "2026",
        totalTeams: 10,
        connectedAt: 1,
        refreshedAt: 1,
        draftAt: null,
        draftStatus: null
      }], credentialed: {} } });

/* A league with a stored credential says so, and says only that.

   The map is what a screen reads to draw "connected with your ESPN
   sign-in", so what it must never carry is the credential itself -- which
   is a property of the QUERY (0011 keeps it in its own table) rather than
   of anything this route filters, and is worth an assertion because a
   regression would be a secret in a response body that renders fine. */
{
  const res = await call("/me/leagues", {
    auth: token(),
    db: stubDb(1, [LEAGUE_ROW], [{ provider: "espn", league_id: "1075383", cred_at: 99 }])
  });
  check("a stored credential is reported as one",
        res.body.credentialed, { "espn|1075383": 99 });
  check("and the credential itself is nowhere in the answer",
        JSON.stringify(res.body).includes("cred\"") || JSON.stringify(res.body).includes("espn_s2"),
        false);
}

// ---- Connecting a PRIVATE ESPN league -------------------------------------

/* An ESPN that behaves like a private league: 401 to anybody, the real
   thing to a request carrying the right session cookie. That is the whole
   mechanism, and a stub is the only way to drive it -- a real private
   league cannot be read from a test, and the pair that would read one is a
   credential nobody should put in a repository.

   What is asserted here is the part with consequences: that the pair is
   VALIDATED before it is stored, that a deployment which cannot seal it
   refuses instead of keeping it in the clear, and that a league whose
   credential fails to store is rolled back rather than left connected and
   unreadable. */
const ESPN_LEAGUE = {
  id: 1075383,
  seasonId: 2026,
  settings: { name: "Work League", size: 10 },
  teams: [{ id: 1, name: "Alpha", owners: ["o1"] }, { id: 2, name: "Beta", owners: ["o2"] }],
  members: [{ id: "o1", firstName: "A", lastName: "One" }],
  draftDetail: { drafted: true, inProgress: false }
};

const GOOD_COOKIE = "espn_s2=s2value; SWID={SW-ID}";
let espnAsked = 0;
const privateEspn = createServer((req, res) => {
  espnAsked++;
  if ((req.headers.cookie || "") !== GOOD_COOKIE) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end("null");
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(ESPN_LEAGUE));
});
await new Promise((r) => privateEspn.listen(0, "127.0.0.1", r));
privateEspn.unref();
const PRIVATE = `http://127.0.0.1:${privateEspn.address().port}`;

/* 32 bytes, generated per run rather than written down: a key in a test
   file is a key somebody copies into a deployment. */
const KEY = (() => {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin);
})();

const connect = (body, opts = {}) => call("/me/leagues", {
  method: "POST",
  auth: token(),
  body: JSON.stringify(Object.assign({ provider: "espn", leagueId: "1075383", season: "2026" }, body)),
  db: opts.db || stubDb(1),
  env: Object.assign({ ESPN_BASE: PRIVATE, LEAGUE_CRED_KEY: KEY }, opts.env || {})
});

check("a private league with no credential is refused as private, as it was before",
      (await connect({})).status, 403);

{
  const db = stubDb(1);
  const res = await call("/me/leagues", {
    method: "POST", auth: token(), db,
    body: JSON.stringify({ provider: "espn", leagueId: "1075383", season: "2026",
                           espnS2: "s2value", swid: "{SW-ID}" }),
    env: { ESPN_BASE: PRIVATE, LEAGUE_CRED_KEY: KEY }
  });
  check("the pair reads the league and connects it", res.status, 200);
  check("and the league that comes back is the real one", res.body.league.name, "Work League");

  const wrote = db.seen.filter((q) => /INSERT INTO league_credentials/.test(q.sql));
  check("the credential is stored", wrote.length, 1);
  check("sealed, so the pair is not in the database",
        JSON.stringify(wrote[0].args).includes("s2value"), false);
  check("and it is scoped to the account that connected it", wrote[0].args[0], "user_2abcDEF");
}

/* Half a pair is not a credential: espn.js sends neither cookie, so this
   is the public read, so ESPN answers private. Worth asserting because the
   alternative -- sending one -- fails the same way while looking like it
   tried, which is how somebody ends up re-copying a value that was right. */
check("half a pair is no credential and reads as private",
      (await connect({ espnS2: "s2value" })).status, 403);
check("nor the other half",
      (await connect({ swid: "{SW-ID}" })).status, 403);

/* A deployment with no key must refuse BEFORE it asks ESPN anything. The
   one thing it may never do is connect the league and keep the pair in the
   clear, which is the failure that would look exactly like success. */
{
  const db = stubDb(1);
  espnAsked = 0;
  const res = await call("/me/leagues", {
    method: "POST", auth: token(), db,
    body: JSON.stringify({ provider: "espn", leagueId: "1075383", season: "2026",
                           espnS2: "s2value", swid: "{SW-ID}" }),
    env: { ESPN_BASE: PRIVATE, LEAGUE_CRED_KEY: undefined }
  });
  check("with no key configured the connect is refused", res.status, 503);
  /* And refused BEFORE ESPN is asked, which is the whole job of the guard
     at the top of the branch -- the seal failing further down catches the
     same case, so without this assertion that guard is covered by nothing
     and could be deleted with every test still green. What it buys is that
     a credential we have nowhere to put is never sent upstream at all. */
  check("and the pair was never sent to ESPN", espnAsked, 0);
  check("and says which kind of refusal it is", res.body.error, "private-unavailable");
  check("nothing about the league was written",
        db.seen.some((q) => /INSERT INTO connected_leagues/.test(q.sql)), false);
  check("and neither was the pair, in any form",
        JSON.stringify(db.seen).includes("s2value"), false);
}

/* The credential write failing after the league write is the one partial
   state this route can reach, and the likely cause is real: the worker
   ships separately from its migrations, so it will at some point run
   against a database without 0011. A league left connected there is a
   private league that can never be read -- it draws a name in the switcher
   and answers "private" on every screen behind it. */
{
  const db = stubDb(1, [], [], /league_credentials/);
  const res = await call("/me/leagues", {
    method: "POST", auth: token(), db,
    body: JSON.stringify({ provider: "espn", leagueId: "1075383", season: "2026",
                           espnS2: "s2value", swid: "{SW-ID}" }),
    env: { ESPN_BASE: PRIVATE, LEAGUE_CRED_KEY: KEY }
  });
  check("a credential that cannot be stored refuses the whole connect", res.status, 503);
  check("and the league is rolled back rather than left unreadable",
        db.seen.some((q) => /DELETE FROM connected_leagues/.test(q.sql)), true);
}

// ---- /espn/league, which grew a POST for the connect dialog ---------------

/* Not a /me route, and driven here anyway: this file already stands the
   whole router up in process with a stub upstream, and a second copy of
   that harness is the written-down-twice failure with a test around it.

   The POST exists because a PRIVATE league has to be resolved BEFORE
   anything is stored -- ESPN's connect asks which team is yours, and the
   teams only exist once the league has been read. What matters about it is
   that it needs an account: left open it is an oracle for testing stolen
   ESPN cookies against arbitrary leagues, from our origin and our IP. */

const espnGet = (opts = {}) => call("/espn/league?league=1075383&season=2026", Object.assign({
  env: { ESPN_BASE: PRIVATE }
}, opts));

const espnPost = (body, opts = {}) => call("/espn/league?league=1075383&season=2026", Object.assign({
  method: "POST",
  body: JSON.stringify(body),
  env: { ESPN_BASE: PRIVATE }
}, opts));

check("a GET is still the public lookup, signed out, exactly as before",
      (await espnGet()).body.reason, "private");

check("the POST refuses a caller with no token", (await espnPost({}, {})).status, 401);

{
  const res = await espnPost({ espnS2: "s2value", swid: "{SW-ID}" }, { auth: token() });
  check("with an account and the pair, the private league resolves", res.body.reason, null);
  check("and it carries the teams the connect step has to choose from",
        res.body.league.teams.length, 2);
}

check("a wrong pair is reported as private rather than as an error",
      (await espnPost({ espnS2: "nope", swid: "{NO}" }, { auth: token() })).body.reason, "private");

check("and half a pair is no credential here either",
      (await espnPost({ espnS2: "s2value" }, { auth: token() })).body.reason, "private");

/* The preflight has to name the verb or the browser never sends it -- no
   log line, no error at the worker, and a dialog that does nothing. The
   same lesson PATCH on /me/leagues already cost once. */
{
  const res = await callRaw("/espn/league", { method: "OPTIONS" });
  check("the preflight names POST", /POST/.test(res.methods || ""), true);
  check("and the authorization header the POST needs",
        /authorization/i.test(res.allowHeaders || ""), true);
}

/* Same request, asserted on the header instead, because the two failures are
   different and only one of them is visible from the browser. A 500 with no
   CORS is reported by Chrome as "blocked by CORS policy: No
   'Access-Control-Allow-Origin' header is present" — so the crash above
   presented to the owner as a misconfigured origin allow-list, which was the
   one thing that had never been wrong. */
check("and the answer carries the header the browser needs to read it",
      (await callRaw("/me/leagues", { auth: token(), db: stubDb(1, [LEAGUE_ROW]) })).cors,
      ORIGIN);

/* The wrapper around the router, which is what makes the NEXT defect in here
   legible instead of arriving as a CORS mystery.
 *
 * after() calls ctx.waitUntil synchronously, so a ctx whose waitUntil throws
 * is a real unhandled failure raised from inside a route that had already
 * done its work — the same shape as the missing import, without depending on
 * that particular bug being back. */
const THROWING_CTX = { waitUntil() { throw new Error("synthetic runtime failure"); } };

check("a route that throws still answers, with a status rather than a hang",
      (await call("/me/leagues", { auth: token(), db: stubDb(1, [LEAGUE_ROW]), ctx: THROWING_CTX })).status,
      500);

check("and a thrown route still carries CORS, or the page cannot see the 500",
      (await callRaw("/me/leagues", { auth: token(), db: stubDb(1, [LEAGUE_ROW]), ctx: THROWING_CTX })).cors,
      ORIGIN);

// The body says nothing about what threw: a message shaped by an exception is
// a way to read a route's internals back out of it. The stack goes to the log.
check("and it says nothing about what went wrong",
      (await call("/me/leagues", { auth: token(), db: stubDb(1, [LEAGUE_ROW]), ctx: THROWING_CTX })).body,
      { error: "server-error" });

// The catch-all must not have swallowed the guards, which return responses
// rather than throwing — a 500 in place of a 401 here would be a real loss.
check("the leagues route still refuses a caller with no token",
      (await call("/me/leagues", { db: stubDb(1, [LEAGUE_ROW]) })).status, 401);

check("and one from a disallowed origin",
      (await call("/me/leagues", { auth: token(), origin: "https://evil.example",
                                   db: stubDb(1, [LEAGUE_ROW]) })).status, 403);

jwks.close();

if (fails.length) process.exitCode = 1;
report();
