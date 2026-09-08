/* The connected-league state machine, driven outside a browser.
 *
 * Reported 6 September 2026 from the deployed site: the hero's whole right
 * column flashes on load and then disappears, and the header's league chip
 * never draws. Both read useLeague(); both draw nothing while it says
 * "loading"; and every failure path settled BACK to "loading" — so a failed
 * read un-rendered a card that was already on screen, permanently, with
 * nothing retrying it.
 *
 * ---- Why this is a node script and not a spec ----
 *
 * Every surface that can show the bug is inside Clerk's <SignedIn>, and a
 * test build has no publishable key, so the page renders the signed-out
 * fallback and ConnectCard never mounts. That was confirmed rather than
 * assumed: a Playwright spec written against the real page found no
 * [data-league-card] at all. CLAUDE.md already records this as the widest
 * gap in the account surface's coverage.
 *
 * So the machine is tested where it actually is. It was split out of
 * useLeague.js into web/src/lib/leagueStore.js to make that possible, and
 * the reason is CI rather than tidiness: tests.yml installs no npm
 * dependencies at all — every other suite in it is stdlib Python or
 * dependency-free Node — so reaching this through the hook would have meant
 * a full web/node_modules install for one file. The store imports nothing,
 * which is the same property draft-engine.js has and for the same reason.
 *
 * Run: node scripts/test_league_state.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

/* ---- stand in for the browser ------------------------------------- */

let calls = 0;
let answer = { ok: false, reason: "offline" };
let manual = false;
let pending = [];
const timers = [];

globalThis.window = {
  JukeAuth: { isSignedIn: true, userId: "u_test", getToken: () => Promise.resolve("tok") },
  Live: {
    /* `manual` hands back a promise this file resolves by hand, which is the
       only way to have TWO attempts alive at once -- the state a deadline on
       the latch newly makes possible, and therefore the state worth
       testing. */
    listLeagues() {
      calls += 1;
      if (manual) return new Promise((resolve) => pending.push(resolve));
      return Promise.resolve(answer);
    }
  },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

// Captured rather than real, so the backoff is asserted by draining it
// instead of by sleeping for 23 seconds.
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; };

const drain = async () => {
  const due = timers.filter((t) => !t.cancelled && !t.done);
  for (const t of due) { t.done = true; await t.fn(); await settleQueue(); }
};
// Two turns is enough: the fetch chain is .then().then().catch().finally().
const settleQueue = () => new Promise((r) => process.nextTick(() => process.nextTick(r)));

const mod = await import(
  pathToFileURL(path.resolve("web/src/lib/leagueStore.js")).href
);
const { refreshLeagues, retryLeagues, leagueState } = mod;

/* ---- the tests ----------------------------------------------------- */

let failures = 0;
const ok = (name) => console.log("ok  " + name);
const check = async (name, fn) => {
  try { await fn(); ok(name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

await check("a failed read with nothing cached is 'error', never 'loading'", async () => {
  answer = { ok: false, reason: "offline" };
  refreshLeagues();
  await settleQueue();
  const s = leagueState();
  assert.equal(s.status, "error", "this is the bug: 'loading' is what every caller draws as nothing");
  assert.equal(s.reason, "offline");
});

await check("it retries on its own, bounded, and stops", async () => {
  const before = calls;
  await drain();          // 2s
  await drain();          // 6s
  await drain();          // 15s
  await drain();          // nothing left to schedule
  const spent = calls - before;
  assert.ok(spent >= 1, "expected at least one automatic retry, got " + spent);
  assert.ok(spent <= 3, "the backoff must be bounded, got " + spent + " retries");
});

await check("a retry that succeeds settles to the real answer", async () => {
  answer = { ok: true, leagues: [{ provider: "sleeper", leagueId: "1", name: "Test League" }] };
  retryLeagues();
  await settleQueue();
  const s = leagueState();
  assert.equal(s.status, "connected");
  assert.equal(s.league.name, "Test League");
});

await check("a later failure keeps the league rather than blanking it", async () => {
  // The original reasoning, and it must survive the fix: an unreachable
  // worker is not a disconnection, so a held answer stays held.
  answer = { ok: false, reason: "offline" };
  retryLeagues();
  await settleQueue();
  const s = leagueState();
  assert.equal(s.status, "connected", "a cached league must outlive a failed refresh");
  assert.equal(s.league.name, "Test League");
});

await check("an honest empty answer is 'none', not 'error'", async () => {
  answer = { ok: true, leagues: [] };
  retryLeagues();
  await settleQueue();
  assert.equal(leagueState().status, "none", "'asked, there are none' must stay distinct from 'could not ask'");
});

await check("signed out is 'none' and asks nobody", async () => {
  const before = calls;
  window.JukeAuth = { isSignedIn: false };
  retryLeagues();
  await settleQueue();
  assert.equal(leagueState().status, "none");
  assert.equal(leagueState().reason, "signed-out");
  assert.equal(calls, before, "a signed-out read must not hit the worker");
});

/* ---- the latch, and the deadline it did not have ------------------- */

/* fetch() has no timeout in any browser, so a connection that is accepted
   and never answered hangs for the life of the tab. The latch was a bare
   `if (inFlight) return`, which is a complete answer for every way a request
   can END and no answer at all for one that does not: a single wedged
   attempt held it forever, and from then on every retry, every juke:auth and
   every tab focus did nothing.

   Suspected during the 8 September 2026 /me/leagues outage and found
   innocent of it -- the tail showed six requests in one sitting -- so it is
   fixed here on its own merits rather than on that theory. */

await check("a wedged request lets go of the latch on its deadline", async () => {
  window.JukeAuth = { isSignedIn: true, userId: "u_test", getToken: () => Promise.resolve("tok") };
  manual = true;
  pending = [];

  const before = calls;
  refreshLeagues();
  await settleQueue();
  refreshLeagues();
  await settleQueue();
  assert.equal(calls - before, 1, "the latch must hold while one is genuinely in flight");

  await drain();  // the deadline
  assert.equal(leagueState().reason, "timeout", "a request that never came back is not 'offline'");

  manual = false;
  answer = { ok: true, leagues: [{ provider: "sleeper", leagueId: "2", name: "After The Deadline" }] };
  refreshLeagues();
  await settleQueue();
  assert.equal(
    leagueState().league.name, "After The Deadline",
    "this is the bug: with no deadline the latch is never released and this never runs",
  );
});

await check("a superseded answer does not overwrite a fresher one", async () => {
  // Releasing the latch early is what makes two attempts possible at once,
  // so the fix creates this race and has to close it in the same breath.
  manual = true;
  pending = [];

  refreshLeagues();          // A -- hangs
  await settleQueue();
  await drain();             // A's deadline; the latch is free again
  refreshLeagues();          // B -- hangs
  await settleQueue();
  assert.equal(pending.length, 2, "two attempts should now be alive");

  pending[1]({ ok: true, leagues: [{ provider: "sleeper", leagueId: "3", name: "Fresh" }] });
  await settleQueue();
  assert.equal(leagueState().league.name, "Fresh");

  pending[0]({ ok: true, leagues: [{ provider: "sleeper", leagueId: "4", name: "Stale" }] });
  await settleQueue();
  assert.equal(leagueState().league.name, "Fresh", "the older attempt's answer must be dropped");
});

await check("but a slow answer that is still the newest IS applied", async () => {
  /* The deliberate other half: the deadline exists to stop the latch
     wedging, not to throw away a slow success. Firing it costs a briefly
     shown error state and never a lost answer. */
  manual = true;
  pending = [];

  refreshLeagues();
  await settleQueue();
  await drain();
  assert.equal(leagueState().reason, "timeout");

  pending[0]({ ok: true, leagues: [{ provider: "sleeper", leagueId: "5", name: "Late But Only" }] });
  await settleQueue();
  assert.equal(leagueState().status, "connected");
  assert.equal(leagueState().league.name, "Late But Only");
  manual = false;
});

console.log(failures ? `\n${failures} FAILED` : "\nOK");
process.exit(failures ? 1 : 0);
