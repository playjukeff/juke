/* Drive a running worker's /me route over plain HTTP.

   auth.js and store.js's touchUser() are the two halves; this covers the
   route that joins them, the same way test-sockets.mjs covers DraftRoom
   rather than re-testing room.js's own pure rules. Every case here is a way
   of being signed out, and the one thing they all have to prove is that
   none of them ever throws or returns anything but signedIn: false.

   This header used to say the signed-in path could not be covered at all —
   "that needs a real Clerk-signed token, which nothing offline can produce"
   — and that was true of this file and false of the claim it made. It is
   corrected rather than left standing: `verifyToken` takes `apiUrl`, so a
   locally generated key pair served as JWKS at a local endpoint verifies
   through the real library with nothing stubbed inside it.

   test-verified-user.mjs does that for auth.js and test-me-routes.mjs does
   it for the routes, both offline, both in the deploy workflow, and both
   confirmed red against the bug that lived in the gap. What is still only
   coverable HERE is this file's own subject: those two run the handler in
   process, and this runs it inside a real workerd behind a real HTTP
   server.

       cd worker && wrangler dev --port 8787 --local
       node worker/test-auth.mjs

   Needs Node 22 or newer for fetch as a global. */

const BASE = process.env.JUKE_WORKER_HTTP || "http://127.0.0.1:8787";
const LOCAL_ORIGIN = "http://localhost:5173";

const fails = [];
const note = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n    got  ${g}\n    want ${w}`);
  else note.push("ok  " + name);
}

async function me(headers) {
  const res = await fetch(BASE + "/me", { headers });
  let body = null;
  try { body = await res.json(); } catch (err) { /* not every status has one */ }
  return { status: res.status, body };
}

// No Origin at all — curl, a script, anything that is not this site's own
// page — is refused before a token is ever looked at. Same check /giphy,
// /news and /media already run, exercised here for the route that added it.
check("no Origin is refused outright",
      (await me({})).status, 403);

// An origin nowhere on the list, allowed or preview-patterned, is refused
// the same way. Proves the check is a real allowlist and not "anything
// with an Origin header".
check("an unrecognised Origin is refused",
      (await me({ Origin: "https://evil.example" })).status, 403);

// A Cloudflare Pages preview build — <hash>.juke-1mw.pages.dev — is what
// every branch gets before it merges to main, and it is where this exact
// feature was actually tested from. If PREVIEW_ORIGIN_RE ever stops
// matching that shape, every preview deploy loses the ability to reach an
// authenticated route with no visible error beyond a 403 in a console
// nobody but a developer opens.
check("a Cloudflare Pages preview origin is allowed through",
      (await me({ Origin: "https://a1b2c3d4.juke-1mw.pages.dev" })).status, 200);

// From here on the origin is always valid, so every remaining case is
// purely about the Authorization header — or the lack of one.

check("a valid origin with no Authorization header reads as signed out",
      await me({ Origin: LOCAL_ORIGIN }), { status: 200, body: { signedIn: false } });

check("an empty Authorization header reads as signed out",
      await me({ Origin: LOCAL_ORIGIN, Authorization: "" }),
      { status: 200, body: { signedIn: false } });

// The header this project's own auth.js expects is "Bearer <token>" —
// anything else (Basic auth, a bare token with no scheme) is not that
// shape and has to fail the same quiet way, not throw.
check("a non-Bearer Authorization header reads as signed out",
      await me({ Origin: LOCAL_ORIGIN, Authorization: "Basic dXNlcjpwYXNz" }),
      { status: 200, body: { signedIn: false } });

// This is the one that matters most: a token that is present, shaped like
// a Bearer token, and is complete nonsense. verifyToken() has to reject it
// without throwing into the route handler — a 500 here would mean anyone
// could take the whole /me route down by sending garbage.
check("a garbage Bearer token reads as signed out, not a 500",
      await me({ Origin: LOCAL_ORIGIN, Authorization: "Bearer not-a-real-token" }),
      { status: 200, body: { signedIn: false } });

// A well-formed but entirely fake JWT — three base64url segments, none of
// them signed by anything Clerk would recognise — is the shape verifyToken()
// actually has to verify a signature against, rather than bailing out on
// "this doesn't even look like a token" the way the previous case might.
const fakeJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyX2Zha2UifQ.not-a-real-signature";
check("a well-formed but unsigned JWT reads as signed out, not a 500",
      await me({ Origin: LOCAL_ORIGIN, Authorization: "Bearer " + fakeJwt }),
      { status: 200, body: { signedIn: false } });

/* /me/draft and /me/history draw a harder line than /me does: a save or a
   read needs somebody signed in to mean anything, so these 401 rather
   than answering a friendly `{ signedIn: false }`. Same origin check
   first, same never-a-500 guarantee on a garbage token — verified here
   rather than assumed, since requireUser() is a second, separate call
   site for verifiedUser() and the point of testing it is to catch the
   two call sites disagreeing. */
async function authed(path, headers, opts) {
  const res = await fetch(BASE + path, Object.assign({ headers }, opts || {}));
  let body = null;
  try { body = await res.json(); } catch (err) { /* not every status has one */ }
  return { status: res.status, body };
}

/* /me/decisions joins this loop rather than getting its own block: it is
   the same requireUser() gate through the same door, and a route that is
   in the list is a route nobody has to remember to test. What it does NOT
   cover is the ledger's own extra refusal -- a decision against a league
   this account has not connected -- which needs a signed-in caller and so
   sits in the same gap every /me/* write in this project sits in. */
for (const path of ["/me/draft", "/me/history", "/me/decisions"]) {
  check(`${path} with no Origin is refused outright`,
        (await authed(path, {})).status, 403);

  check(`${path} with a valid origin but no token is unauthorized, not signed-out`,
        (await authed(path, { Origin: LOCAL_ORIGIN })).status, 401);

  check(`${path} with a garbage Bearer token is unauthorized, not a 500`,
        (await authed(path, { Origin: LOCAL_ORIGIN, Authorization: "Bearer not-a-real-token" })).status, 401);
}

/* ---- /me/leagues, including the verb that switches ----

   This route was never in the loop above, and PATCH is a new way into an
   authenticated route — a new verb is a new door, and it has to be behind
   the same origin check and the same requireUser() as the three that were
   already there. A method that falls past both is not a smaller bug than a
   missing token check; it IS a missing token check.

   PATCH specifically, because it is the one that can move somebody's
   active league. GET leaks a list, POST and DELETE were already covered by
   the shape of this file; PATCH is the one that did not exist when the
   loop was written. */
for (const method of ["GET", "PATCH"]) {
  const body = method === "PATCH"
    ? { method, body: JSON.stringify({ leagueId: "L1", provider: "sleeper" }) }
    : { method };

  check(`/me/leagues ${method} with no Origin is refused outright`,
        (await authed("/me/leagues", { "content-type": "application/json" }, body)).status, 403);

  check(`/me/leagues ${method} with a valid origin but no token is unauthorized`,
        (await authed("/me/leagues", { Origin: LOCAL_ORIGIN, "content-type": "application/json" }, body)).status, 401);

  check(`/me/leagues ${method} with a garbage Bearer token is unauthorized, not a 500`,
        (await authed("/me/leagues", {
          Origin: LOCAL_ORIGIN,
          "content-type": "application/json",
          Authorization: "Bearer not-a-real-token",
        }, body)).status, 401);
}

/* PATCH is not a CORS-simple method, so a browser always preflights it —
   and a preflight that does not name it means the switch never leaves the
   page at all. That failure is invisible from the worker's side: no
   request arrives, nothing is logged, and the menu simply does nothing.
   Asserted here because it cannot be asserted from a test that only ever
   speaks to the worker directly, the way this file otherwise does. */
const leaguePreflight = await fetch(BASE + "/me/leagues", {
  method: "OPTIONS",
  headers: { Origin: LOCAL_ORIGIN, "access-control-request-method": "PATCH" },
});
check("OPTIONS on /me/leagues names PATCH among the allowed methods",
      (leaguePreflight.headers.get("access-control-allow-methods") || "").includes("PATCH"), true);

/* A new ROUTE is a new preflight, for the reason /me/leagues' PATCH already
   records: POST and DELETE with a JSON content-type are not CORS-simple, so
   a browser preflights them, and a preflight that does not name them means
   the request never leaves the page -- no log line, no error at the worker,
   and a room that records nothing. */
const decisionsPreflight = await fetch(BASE + "/me/decisions", {
  method: "OPTIONS",
  headers: { Origin: LOCAL_ORIGIN, "access-control-request-method": "POST" },
});
for (const verb of ["GET", "POST", "DELETE"]) {
  check(`OPTIONS on /me/decisions names ${verb} among the allowed methods`,
        (decisionsPreflight.headers.get("access-control-allow-methods") || "").includes(verb), true);
}

// OPTIONS preflight has to answer before verifiedUser() ever runs — a
// browser sends it with no Authorization header at all, so gating it
// behind the same auth check this route uses for GET/POST/DELETE would
// 401 every real request's own preflight.
/* ---- The account-deletion webhook ----

   Every way of NOT being Clerk. The accept path needs a request signed
   with the worker's own CLERK_WEBHOOK_SECRET, which this cannot know — the
   same gap the signed-in path has, and for the same reason. It is verified
   by hand against `wrangler dev` with a secret in worker/.dev.vars; see
   worker/README.md.

   What is covered here is the half that matters most anyway: an endpoint
   that deletes an account's data must refuse everything it cannot prove
   came from Clerk. A false accept is somebody else's drafts gone. */
const deleteEvent = JSON.stringify({ type: "user.deleted", data: { id: "user_probe" } });

const noSig = await fetch(BASE + "/webhooks/clerk", {
  method: "POST", headers: { "content-type": "application/json" }, body: deleteEvent
});
check("an unsigned delete is refused", noSig.status < 300, false);

const badSig = await fetch(BASE + "/webhooks/clerk", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": "msg_test",
    "svix-timestamp": String(Math.floor(Date.now() / 1000)),
    "svix-signature": "v1,ZGVmaW5pdGVseS1ub3QtYS1zaWduYXR1cmU="
  },
  body: deleteEvent
});
check("a forged signature is refused", badSig.status < 300, false);

/* And it is not a route that can be poked by hand: GET is not a delivery,
   and a webhook endpoint that answered one would be an invitation. */
const getIt = await fetch(BASE + "/webhooks/clerk");
check("GET is not a delivery", getIt.status < 300, false);

const preflight = await fetch(BASE + "/me/draft", {
  method: "OPTIONS",
  headers: { Origin: LOCAL_ORIGIN }
});
check("OPTIONS on /me/draft answers without needing a token",
      preflight.status, 200);
check("OPTIONS on /me/draft names DELETE among the allowed methods",
      (preflight.headers.get("access-control-allow-methods") || "").includes("DELETE"), true);

console.log(note.join("\n"));
console.log("");
if (fails.length) {
  console.log("FAIL " + fails.length);
  fails.forEach((f) => console.log("  x " + f));
  process.exit(1);
}
console.log(`OK — ${note.length} assertions over /me`);
