/* The decision-ledger state machine, driven outside a browser.
 *
 * Same harness and the same reasoning as test_league_state.mjs, one store
 * along: every surface that renders this one sits inside Clerk's
 * <SignedIn>, a test build has no publishable key, so the page renders the
 * signed-out fallback and the ledger never mounts. Driving it through the
 * page is not available, which is why decisionStore.js imports nothing.
 *
 * What this pins that the SQL suite cannot:
 *
 *   * a failed read is "error" and never "loading" — the state every
 *     caller draws as nothing, and the bug leagueStore paid for;
 *   * a failed read with rows already in hand KEEPS them rather than
 *     blanking a ledger that is on screen;
 *   * "asked, there are none" stays distinct from "could not ask", which
 *     on this screen is the difference between an honest empty record and
 *     a false claim that somebody has no history;
 *   * recording is not optimistic — a refused write must leave no row;
 *   * a re-record of the same id replaces rather than duplicates, which is
 *     how "the manager acted on it" is stored.
 *
 * Run: node scripts/test_decision_state.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

/* ---- stand in for the browser ------------------------------------- */

let reads = 0;
let writes = 0;
let readAnswer = { ok: false, reason: "offline" };
let writeAnswer = { ok: true, reason: null };
const timers = [];

globalThis.window = {
  JukeAuth: { isSignedIn: true, userId: "u_test", getToken: () => Promise.resolve("tok") },
  Live: {
    loadDecisions() {
      reads += 1;
      return Promise.resolve(readAnswer);
    },
    saveDecision() {
      writes += 1;
      return Promise.resolve(writeAnswer);
    },
    deleteDecision() {
      return Promise.resolve(writeAnswer);
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
  pathToFileURL(path.resolve("web/src/lib/decisionStore.js")).href
);
const {
  refreshDecisions, retryDecisions, recordDecision, forgetDecision,
  decisionState, decisionsFor, decisionsForWeek, weekMark, __resetDecisions,
} = mod;

const ROW = (over) => Object.assign({
  id: "d1", provider: "sleeper", leagueId: "L1", season: "2026",
  week: 4, room: "waiver", decidedAt: 1000, said: "Add X",
}, over || {});

/* ---- the tests ----------------------------------------------------- */

let failures = 0;
const ok = (name) => console.log("ok  " + name);
const check = async (name, fn) => {
  try { await fn(); ok(name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

await check("a failed read with nothing cached is 'error', never 'loading'", async () => {
  readAnswer = { ok: false, reason: "offline" };
  refreshDecisions();
  await settleQueue();
  const s = decisionState();
  assert.equal(s.status, "error", "'loading' is the state every caller draws as nothing");
  assert.equal(s.reason, "offline");
});

await check("it retries on its own, bounded, and stops", async () => {
  const before = reads;
  await drain();
  await drain();
  await drain();
  const tried = reads - before;
  assert.ok(tried >= 1, "a blip should heal without anybody pressing anything");
  const after = reads;
  await drain();
  assert.equal(reads, after, "and an unreachable worker must not be polled for ever");
});

await check("an honest empty answer is 'none', not 'error'", async () => {
  readAnswer = { ok: true, decisions: [] };
  retryDecisions();
  await settleQueue();
  const s = decisionState();
  assert.equal(s.status, "none", "'you have decided nothing' must stay distinct from 'we could not find out'");
  assert.equal(s.reason, null);
});

await check("rows arrive as 'ready'", async () => {
  readAnswer = { ok: true, decisions: [ROW(), ROW({ id: "d2", week: 5 })] };
  retryDecisions();
  await settleQueue();
  const s = decisionState();
  assert.equal(s.status, "ready");
  assert.equal(s.decisions.length, 2);
});

await check("a later failure keeps the ledger rather than blanking it", async () => {
  readAnswer = { ok: false, reason: "offline" };
  retryDecisions();
  await settleQueue();
  const s = decisionState();
  assert.equal(s.status, "ready", "a ledger on screen must not vanish because a refresh failed");
  assert.equal(s.decisions.length, 2);
  assert.equal(s.reason, "offline", "and the reason has to survive, or nothing can say so");
});

await check("signed out is 'none' and asks nobody", async () => {
  __resetDecisions();
  const before = reads;
  window.JukeAuth = { isSignedIn: false };
  retryDecisions();
  await settleQueue();
  assert.equal(decisionState().status, "none");
  assert.equal(decisionState().reason, "signed-out");
  assert.equal(reads, before, "a signed-out read must not hit the worker");
});

await check("recording is not optimistic: a refused write leaves no row", async () => {
  __resetDecisions();
  window.JukeAuth = { isSignedIn: true, getToken: () => Promise.resolve("tok") };
  writeAnswer = { ok: false, reason: "not-connected" };
  const res = await recordDecision(ROW());
  await settleQueue();
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not-connected", "the room has to be able to say WHY, not just that it failed");
  assert.equal(decisionState().decisions.length, 0, "a row that appears and vanishes is worse than one that never appeared");
});

await check("a stored write lands at the head without a re-read", async () => {
  const before = reads;
  writeAnswer = { ok: true, reason: null };
  const res = await recordDecision(ROW({ id: "d9", decidedAt: 9000 }));
  await settleQueue();
  assert.equal(res.ok, true);
  const s = decisionState();
  assert.equal(s.status, "ready");
  assert.equal(s.decisions[0].id, "d9", "newest first, and the newest thing is what just happened");
  assert.equal(reads, before, "asking the worker back for what it was just told is a wasted round trip");
});

await check("re-recording the same id replaces it rather than duplicating", async () => {
  await recordDecision(ROW({ id: "d9", decidedAt: 9000, did: "Added" }));
  await settleQueue();
  const rows = decisionState().decisions.filter((d) => d.id === "d9");
  assert.equal(rows.length, 1, "acting on a recommendation is the same row, not a second one");
  assert.equal(rows[0].did, "Added");
});

await check("forgetting the last row goes back to 'none', not 'ready' with an empty list", async () => {
  writeAnswer = { ok: true, reason: null };
  const res = await forgetDecision("d9");
  await settleQueue();
  assert.equal(res.ok, true);
  const s = decisionState();
  assert.equal(s.decisions.length, 0);
  assert.equal(s.status, "none", "'ready' over an empty list is a state no caller is written for");
});

await check("decisionsFor() narrows by league, and decisionsForWeek() by week", async () => {
  const rows = [
    ROW({ id: "a", leagueId: "L1", week: 4 }),
    ROW({ id: "b", leagueId: "L1", week: 5 }),
    ROW({ id: "c", leagueId: "L2", week: 4 }),
  ];
  assert.equal(decisionsFor("L1", rows).length, 2);
  assert.equal(decisionsFor(null, rows).length, 3, "no league means the whole ledger, which is what History asks for");
  assert.equal(decisionsForWeek("L1", 4, rows).length, 1);
});

await check("a week written as a string still matches a numeric strip", async () => {
  const rows = [ROW({ id: "a", leagueId: "L1", week: "4" })];
  assert.equal(
    decisionsForWeek("L1", 4, rows).length, 1,
    "this fails by drawing an empty week rather than by throwing, which is why it is pinned"
  );
});

await check("a week with nothing graded carries no mark", async () => {
  const rows = [ROW({ id: "a", week: 6 }), ROW({ id: "b", week: 6, verdict: "pending" })];
  assert.equal(
    weekMark("L1", 6, rows), null,
    "a green tick over pending calls claims an outcome nobody knows yet"
  );
});

await check("one graded good call marks the week good", async () => {
  const rows = [ROW({ id: "a", week: 5, verdict: "good" }), ROW({ id: "b", week: 5 })];
  assert.equal(weekMark("L1", 5, rows), "good");
});

await check("one bad call marks the week bad, whatever else went right", async () => {
  const rows = [
    ROW({ id: "a", week: 4, verdict: "good" }),
    ROW({ id: "b", week: 4, verdict: "bad" }),
    ROW({ id: "c", week: 4, verdict: "good" }),
  ];
  assert.equal(weekMark("L1", 4, rows), "bad", "a week is a warning if it holds a mistake");
});

await check("a week belonging to another league is not marked", async () => {
  const rows = [ROW({ id: "a", leagueId: "L2", week: 3, verdict: "bad" })];
  assert.equal(weekMark("L1", 3, rows), null);
});

console.log(failures ? `\n${failures} FAILED` : "\nOK");
process.exit(failures ? 1 : 0);
