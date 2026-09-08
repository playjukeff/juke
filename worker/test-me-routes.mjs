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
function stubDb(changes = 1) {
  const seen = [];
  const stmt = (sql) => ({
    sql,
    bind(...args) { seen.push({ sql, args }); return this; },
    async run() { return { success: true, meta: { changes } }; },
    async all() { return { results: [] }; },
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

const ORIGIN = "http://localhost:5173";
const CTX = { waitUntil() {} };

async function call(path, { method = "GET", auth, origin = ORIGIN, body, db } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (auth) headers.Authorization = "Bearer " + auth;
  if (body !== undefined) headers["content-type"] = "application/json";

  const env = { CLERK_SECRET_KEY: "sk_test_stub", CLERK_API_URL: API_URL };
  if (db) env.DB = db.DB;

  const res = await worker.fetch(
    new Request("https://jukeff.com" + path, { method, headers, body }),
    env, CTX
  );
  let parsed = null;
  try { parsed = await res.json(); } catch { /* not every status carries one */ }
  return { status: res.status, body: parsed };
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

check("a body with no id is a 400 before the database is asked",
      (await call("/me/history", { method: "POST", auth: token(),
                                   body: JSON.stringify({ completedAt: 1 }), db: stubDb(0) })).status, 400);

jwks.close();
if (fails.length) process.exitCode = 1;
report();
