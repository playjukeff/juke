/* The shared league-snapshot store, driven outside a browser.
 *
 * Screen 16 — a per-room stake on the rooms grid — was recorded in
 * CLAUDE.md as blocked on WHERE the snapshot is fetched rather than on any
 * missing data. It was: `useLeagueSnapshot()` held its answer in component
 * state, so the grid (which draws on `#/rooms` AND on the homepage) would
 * have paid for a snapshot the room page then paid for again.
 *
 * Sharing the answer is what unblocks it, and sharing introduces three
 * failures a per-component fetch could not have:
 *
 *   1. a caller asking about league A being handed league B's rosters,
 *      because the store settled B while A's request was in the air;
 *   2. a caller asking about NOTHING (RoomPage passes a null id for a room
 *      that is not live) wiping an answer a mounted sibling is drawing;
 *   3. every mount re-asking, which is the cost the sharing exists to
 *      remove.
 *
 * Each is silent. A roster under the wrong league's name renders perfectly,
 * and a request per navigation is invisible until somebody reads a log.
 *
 * ---- Why this is a node script and not a spec ----
 *
 * `leagueStore`'s own suite states it: tests.yml installs no npm
 * dependencies anywhere, so a test reaching this through the hook would
 * need web/node_modules for one file. The store imports nothing but
 * `singleFlight.js`, which is a dependency-free sibling loaded the same way.
 *
 * Run: node scripts/test_snapshot_state.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

/* ---- stand in for the browser -------------------------------------- */

let calls = [];
let answer = { ok: true, snapshot: { week: 3, teams: [] } };
let manual = false;
let pending = [];
const timers = [];

globalThis.window = {
  Live: {
    /* `manual` hands back a promise this file resolves by hand, which is
       the only way to have an answer still in the air while something else
       happens — the state a SHARED store newly makes interesting. */
    leagueSnapshot(leagueId, provider) {
      calls.push(provider + ":" + leagueId);
      if (manual) return new Promise((resolve) => pending.push(resolve));
      return Promise.resolve(answer);
    },
  },
  addEventListener() {},
  removeEventListener() {},
};

// Captured rather than real, so the latch's deadline is asserted by
// draining it instead of by sleeping fifteen seconds.
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; };

// The clock the freshness window reads. Stubbed rather than waited out for
// the same reason the timers are: two minutes is not a thing a suite may
// spend, and the window is the property under test.
let clock = 1_000_000;
const realNow = Date.now;
globalThis.Date.now = () => clock;

const settleQueue = () => new Promise((r) => process.nextTick(() => process.nextTick(r)));
const drain = async () => {
  const due = timers.filter((t) => !t.cancelled && !t.done);
  for (const t of due) { t.done = true; await t.fn(); await settleQueue(); }
};

const store = await import(
  pathToFileURL(path.resolve("web/src/lib/snapshotStore.js")).href
);

const fails = [];
const note = [];
const check = (name, fn) => {
  try { fn(); note.push("ok  " + name); }
  catch (err) { fails.push(name + "\n    " + err.message); }
};

function reset() {
  store.__resetSnapshots();
  calls = [];
  manual = false;
  pending = [];
  timers.length = 0;
  answer = { ok: true, snapshot: { week: 3, teams: [] } };
}

/* ---- the key ------------------------------------------------------- */

check("a league is its provider and its id, never the id alone", () => {
  // The same numeric id is a different league on a different platform,
  // which is why the hook this replaces carried `provider` in its deps.
  assert.notEqual(store.snapshotKey("1", "espn"), store.snapshotKey("1", "sleeper"));
});

check("a connection stored before the provider column is a Sleeper one", () => {
  // live.js defaults the same way and says so: every caller predates ESPN.
  assert.equal(store.snapshotKey("1", null), store.snapshotKey("1", "sleeper"));
});

check("no league is no key", () => {
  assert.equal(store.snapshotKey(null, "espn"), null);
});

/* ---- one request, however many callers ----------------------------- */

reset();
await (async () => {
  manual = true;
  store.requestSnapshot("77", "espn");
  store.requestSnapshot("77", "espn");
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("three callers mounting together ask once", () => {
    assert.equal(calls.length, 1);
  });
  check("and they are all told we are still asking", () => {
    assert.equal(store.snapshotState().status, "loading");
  });
  pending.forEach((r) => r({ ok: true, snapshot: { week: 3 } }));
  await settleQueue();
  check("the answer lands as ready", () => {
    const s = store.snapshotState();
    assert.equal(s.status, "ready");
    assert.equal(s.snapshot.week, 3);
    assert.equal(s.key, "espn:77");
  });
})();

/* ---- the freshness window is the worker's own number ---------------- */

reset();
await (async () => {
  store.requestSnapshot("77", "espn");
  await settleQueue();
  assert.equal(calls.length, 1);

  clock += store.SNAPSHOT_TTL_MS - 1;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("asking again inside the window costs nothing", () => {
    assert.equal(calls.length, 1);
  });

  clock += 2;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("and past it, it asks again", () => {
    assert.equal(calls.length, 2);
  });
  check("a lineup changes during a Sunday, so this is a window not a cache", () => {
    // Stated as an assertion rather than a comment because the alternative
    // -- fetch once per session -- passes every test above and is wrong.
    assert.ok(store.SNAPSHOT_TTL_MS > 0 && Number.isFinite(store.SNAPSHOT_TTL_MS));
  });
})();

/* ---- a failure is bounded the same way a success is ----------------- */

reset();
await (async () => {
  answer = { ok: false, reason: "private" };
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("a refusal is `error`, never `loading`", () => {
    // leagueStore's whole header is about this: "loading" is the state
    // every caller draws as nothing, so settling into it on failure makes
    // a screen that was already up disappear with no way back.
    const s = store.snapshotState();
    assert.equal(s.status, "error");
    assert.equal(s.reason, "private");
  });

  store.requestSnapshot("77", "espn");
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("an unreachable worker is not asked once per navigation", () => {
    assert.equal(calls.length, 1);
  });

  answer = { ok: true, snapshot: { week: 4 } };
  store.retrySnapshot("77", "espn");
  await settleQueue();
  check("but a deliberate retry clears the window rather than hoping", () => {
    assert.equal(calls.length, 2);
    assert.equal(store.snapshotState().status, "ready");
  });
})();

/* ---- the hazard sharing introduces --------------------------------- */

reset();
await (async () => {
  manual = true;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  const first = pending.shift();

  // The reader switches leagues while the first answer is still in the air.
  store.requestSnapshot("88", "espn");
  await settleQueue();
  check("switching leagues drops the previous answer rather than showing it", () => {
    const s = store.snapshotState();
    assert.equal(s.key, "espn:88");
    assert.equal(s.snapshot, null);
    assert.equal(s.status, "loading");
  });

  first({ ok: true, snapshot: { week: 3, league: "77" } });
  await settleQueue();
  check("and the OLD league's answer is refused when it lands", () => {
    // The failure this prevents renders perfectly: one league's rosters
    // under the other league's name. Same rule the player sheet follows
    // for news -- which request an answer belongs to is checked when it
    // LANDS, not when it was asked for.
    const s = store.snapshotState();
    assert.equal(s.key, "espn:88");
    assert.equal(s.snapshot, null);
  });
})();

reset();
await (async () => {
  store.requestSnapshot("77", "espn");
  await settleQueue();
  assert.equal(store.snapshotState().status, "ready");

  store.requestSnapshot(null, null);
  await settleQueue();
  check("a null id settles `none` and is answered by the hook, not here", () => {
    // RoomPage passes `live ? league.leagueId : null`, so a room that is
    // not live asks for nothing. useLeague.js answers that WITHOUT calling
    // this, which is why a held answer survives a sibling that is not
    // asking -- but the store still has to have a sane answer of its own.
    assert.equal(store.snapshotState().status, "none");
  });
})();

/* ---- the latch has a deadline, like every other one ----------------- */

reset();
await (async () => {
  manual = true;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  assert.equal(calls.length, 1);

  await drain();
  check("a request that never comes back is reported rather than held", () => {
    const s = store.snapshotState();
    assert.equal(s.status, "error");
    assert.equal(s.reason, "timeout");
  });
  /* `flight.run` schedules its work in a microtask, so the call is counted
     one turn later -- an assertion written straight after requestSnapshot()
     reads 1 and looks exactly like a latch that never let go. */
  clock += store.SNAPSHOT_TTL_MS + 1;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("and the latch is let go, so the next ask is not swallowed", () => {
    assert.equal(calls.length, 2);
  });
})();

/* ---- live.js not landing yet is not an answer ----------------------- */

reset();
await (async () => {
  const real = window.Live;
  window.Live = {};
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("no live.js means no claim either way", () => {
    // The one path that used to be TERMINAL in the hook this replaces:
    // it returned early and nothing re-ran when the deferred script
    // arrived, so a cold load straight onto a room sat in "loading" for
    // ever. useLeague.js listens for juke:data-loaded now.
    const s = store.snapshotState();
    assert.equal(s.status, "loading");
    assert.equal(calls.length, 0);
  });
  window.Live = real;
  store.requestSnapshot("77", "espn");
  await settleQueue();
  check("and the same request works once it has", () => {
    assert.equal(calls.length, 1);
    assert.equal(store.snapshotState().status, "ready");
  });
})();

globalThis.Date.now = realNow;

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.length} checks on the snapshot store`);
