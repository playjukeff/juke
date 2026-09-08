/* The signed-in half of auth.js, offline.

   test-auth.mjs says in its own header that it cannot cover this: every
   case there is a way of being signed OUT, because a token that verifies
   needs Clerk to have signed it. That is a real constraint and it had a
   real cost — the `verifyToken` return-shape bug rejected every valid login
   from the day accounts shipped until 1 September 2026, and nothing in this
   repository could see it, because from the outside a worker that refuses
   every token and a worker nobody is signed in to are the same worker.

   ---- What makes it testable, and what is deliberately NOT stubbed ----

   verifyToken() fetches Clerk's public keys from `apiUrl` and checks the
   signature against them. `apiUrl` is Clerk's own option (it defaults to
   https://api.clerk.com), so a local endpoint serving a JWKS built from a
   key pair generated here is enough to make an ordinary verification run to
   completion with nothing faked inside it.

   Nothing here mocks @clerk/backend, verifyToken, or verifiedUser. The real
   library does the real work: fetch the keys, match the `kid` off the token
   header, check an RS256 signature, check exp/nbf, and hand back whatever
   shape it hands back. **That last one is the entire point.** The bug was
   never in the cryptography — it was that the package root exports
   `withLegacyReturn(verifyToken)`, which resolves to the payload directly
   and throws on failure, while this file was destructuring `{ data, errors }`
   off it. Only a real call with a real signature that really verifies can
   catch that, and this is one.

   The rest of the suite would have been happy either way, which is worth
   stating plainly: a green run of every OTHER check in this project is
   exactly what the world looked like while every login was being refused.

   ---- Why it lives in the deploy workflow rather than tests.yml ----

   It needs `@clerk/backend`, and tests.yml deliberately installs nothing —
   every step in it is stdlib Python or dependency-free Node, which is a
   property worth keeping. deploy-worker.yml already runs `npm ci --prefix
   worker`, already runs only when the worker changes, and runs this BEFORE
   the deploy: a verifiedUser() that has stopped verifying should stop a
   deploy rather than be discovered by it.

       npm ci --prefix worker
       node worker/test-verified-user.mjs

   No network, no wrangler, no account. Needs Node 22 or newer. */

import { generateKeyPairSync, createSign, createPublicKey } from "node:crypto";
import { createServer } from "node:http";
import { verifiedUser } from "./auth.js";

const fails = [];
const note = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n    got  ${g}\n    want ${w}`);
  else note.push("ok  " + name);
}

/* The report survives a crash, for the reason test-sockets.mjs's does: the
   results are collected and printed at the end, and a throw at top level
   would take them with it. That file learned this the expensive way on the
   post-deploy gate; this one starts with it. */
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
  console.log(`OK — ${note.length} assertions against a real verification`);
}
process.on("uncaughtException", (err) => {
  fails.push("the run stopped here\n    " + ((err && err.stack) || err));
  process.exitCode = 1;
  report();
});
process.on("exit", report);

// ---- a key pair, and the JWKS endpoint that publishes it -------------------

const KID = "ins_test_key_1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

// A second pair nobody publishes, for the forged-token case below. A token
// signed with this is well-formed, correctly structured, and carries a kid
// the server does know — everything except the one thing that matters.
const other = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

const jwk = createPublicKey(publicKey).export({ format: "jwk" });
let jwksRequests = 0;
const server = createServer((req, res) => {
  if (req.url && req.url.endsWith("/jwks")) {
    jwksRequests += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end("{}");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const API_URL = `http://127.0.0.1:${server.address().port}`;

// A second endpoint that is up and publishes nothing, for the case below.
const empty = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ keys: [] }));
});
await new Promise((resolve) => empty.listen(0, "127.0.0.1", resolve));
const EMPTY_URL = `http://127.0.0.1:${empty.address().port}`;

/* The claims a Clerk session token actually carries, taken from the shape
   verifyToken()'s own documentation prints back. `sub` is the only one this
   worker reads — see verifiedUser()'s return — but the others have to be
   present and sane or the library refuses before `sub` is ever reached, and
   a test that omitted them would be proving something about a token Clerk
   does not issue. */
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function mint(claims = {}, key = privateKey, kid = KID) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT", kid });
  const body = b64({
    iss: "https://test.clerk.accounts.dev",
    sub: "user_2abcDEF",
    sid: "sess_2abcDEF",
    azp: "http://localhost:5173",
    nbf: now - 5,
    iat: now,
    exp: now + 600,
    ...claims
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign(key).toString("base64url")}`;
}

const ENV = { CLERK_SECRET_KEY: "sk_test_stub", CLERK_API_URL: API_URL };
const ask = (token, env = ENV) =>
  verifiedUser(new Request("https://jukeff.com/me", {
    headers: token === null ? {} : { Authorization: "Bearer " + token }
  }), env);

// ---- the case nothing here could reach before ------------------------------

/* This is the assertion the whole file exists for. A token that genuinely
   verifies has to come back as a user, and for eleven days it came back as
   null instead — with every other check in this project green. */
check("a validly signed token is a signed-in user",
      await ask(mint()), { id: "user_2abcDEF" });

check("and the id is the token's own subject, not anything else",
      await ask(mint({ sub: "user_someone_else" })), { id: "user_someone_else" });

/* Guards the exact defect directly rather than only through the happy path
   above: `withLegacyReturn` resolves to the PAYLOAD, so `result.data` is
   undefined on success. Any future rewrite that goes back to reading a
   `.data` wrapper answers null here and fails this line by name. */
check("a verified token never reads as a refusal",
      (await ask(mint())) === null, false);

// ---- everything a token can be wrong about ---------------------------------

const now = Math.floor(Date.now() / 1000);
check("an expired token is refused",
      await ask(mint({ iat: now - 600, nbf: now - 600, exp: now - 60 })), null);

check("a token that is not valid yet is refused",
      await ask(mint({ nbf: now + 600, iat: now + 600, exp: now + 1200 })), null);

check("a token signed by the wrong key is refused",
      await ask(mint({}, other.privateKey)), null);

check("a token naming a key the server does not publish is refused",
      await ask(mint({}, privateKey, "ins_not_a_real_kid")), null);

check("a tampered signature is refused",
      await ask(mint().slice(0, -6) + "AAAAAA"), null);

check("a token with no subject is refused",
      await ask(mint({ sub: undefined })), null);

check("a token that is not a JWT at all is refused",
      await ask("not-a-token"), null);

check("an empty bearer value is refused", await ask(""), null);

// ---- and the ways of being signed out, which must not have moved -----------
// test-auth.mjs covers these against a running worker; they are re-asserted
// here because this file is what changed, and a change that fixed the
// signed-in path by loosening the signed-out one would be a much worse bug
// than the one being fixed.

check("no Authorization header is signed out", await ask(null), null);

check("a header that is not Bearer is signed out",
      await verifiedUser(new Request("https://jukeff.com/me", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" }
      }), ENV), null);

/* The missing-binding contract, and it is checked with a token that WOULD
   verify — the point is that no key configured refuses before it looks,
   rather than happening to refuse because the token was bad anyway. */
check("no CLERK_SECRET_KEY refuses even a good token",
      await ask(mint(), { CLERK_API_URL: API_URL }), null);

/* A key endpoint that answers but has no keys in it.

   Not the same case as a bad token: everything about the token is right and
   the thing that cannot be reached is the means of checking it. It has to
   refuse rather than throw, for the reason every refusal here does — a
   route that 500s on an unreachable dependency tells a signed-in person
   their draft is broken when they are merely unverifiable for a moment. */
check("a key endpoint with nothing in it refuses rather than throwing",
      await ask(mint(), { CLERK_SECRET_KEY: "sk_test_stub", CLERK_API_URL: EMPTY_URL }), null);

/* That the seam is honoured at all needs no assertion of its own, and this
   comment is here so nobody adds one: a locally-signed token could never
   verify against Clerk's real JWKS, so the first check in this file passing
   IS the proof that CLERK_API_URL was read. An explicit test would also
   have to reach api.clerk.com to be meaningful, which is a third-party
   request on every worker deploy to learn something already known. */
check("the JWKS endpoint was really being used", jwksRequests > 0, true);

server.close();
empty.close();
if (fails.length) process.exitCode = 1;
report();
