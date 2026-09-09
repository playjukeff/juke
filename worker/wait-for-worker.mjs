/* Wait until the deployed worker is actually serving broadcasts.

   `wrangler deploy` returns when the upload succeeds, and the verify step
   used to start on the next line. Those are different moments: a Durable
   Object created during the rollout window can be torn down under the run
   when the new version takes over, and the suite is then talking to a
   socket nobody is behind.

   That failure has a signature and it is not subtle once the report
   survives to be read — which is what worker/test-sockets.mjs's own exit
   handler now guarantees. Measured on the run that prompted this, 8
   September 2026: **79 ok lines and 40 failures**, where the passing ones
   are `alice gets a state on connect`, `room created in lobby`, `four
   chairs`, `bob joined` — and every single failure is a wait for a
   broadcast that follows a client message. The socket opens, the initial
   state arrives, and then nothing does.

   Three runs of that step failed inside ninety minutes on three separate
   merges, every one of them transient and every one of them with the
   deployed worker measuring 109 assertions clean minutes later. A gate that
   cries wolf three times an hour is one nobody reads by the end of the
   week, which is this project's own rule about a standing red arriving at
   the one check that runs against production.

   ---- What it waits for, and why it is not a sleep ----

   The property the suite depends on is not "the worker answers HTTP" and
   not "a socket opens" — both of those were true throughout the failure.
   It is "a message I send comes back to me as a broadcast". So that is
   exactly what this probes: open a socket into a throwaway room, say
   something, and wait for the room to say it back.

   A fixed sleep would be the obvious alternative and is the thing
   test-sockets.mjs's own `until()` exists to avoid — see its comment. Too
   short and it proves nothing; too long and every deploy pays for the worst
   case. A condition costs what it needs to.

   **Two successes, not one, and they are spaced.** One round trip proves
   the object is serving *now*, which is exactly what the first probe of a
   rollout can report a moment before it is replaced. Two, a few seconds
   apart, means the window has closed. That is the whole reason this is not
   a one-shot check.

   The rooms are per-probe and random, so nothing here can be answered by a
   Durable Object the previous attempt already warmed.

   Exit 0 when it is ready, 1 at the deadline with what it last saw. It
   never deploys, never writes, and reads nothing but its own rooms.

       JUKE_WORKER=wss://juke-draft-room.jukeff.workers.dev \
         node worker/wait-for-worker.mjs

   Needs Node 22 or newer for WebSocket as a global, the same as
   test-sockets.mjs and the same reason the workflow pins it. */

const BASE = process.env.JUKE_WORKER || "ws://127.0.0.1:8787";

// Generous, because the cost of being wrong is asymmetric: a few extra
// seconds against a red gate on a healthy deploy. The observed rollout
// window is single-digit seconds; this is two minutes.
const DEADLINE_MS = Number(process.env.SETTLE_DEADLINE_MS || 120000);
const PROBE_MS = 8000;      // one round trip, matching until()'s own patience
const GAP_MS = 3000;        // between the two successes the deadline needs
const RETRY_MS = 2000;      // after a failed probe

/* How long a socket has to STAY open before the suite is allowed to start.

   ---- The property this file was probing was not the one that failed ----

   Everything above proves "a message I send comes back to me". That was
   true throughout the failure it was written for, and it stayed true on 8
   September 2026 when this step passed and the verify step behind it went
   red anyway — 83 assertions passing, 39 failing.

   The signature named the real thing once it was read properly. `bob
   joined` wanted seat 1 and got 0; `bob is not host` PASSED. So the room
   still existed with alice as its host, and alice's CHAIR was free — which
   is `leave()`, because a dropped socket frees the chair in the lobby. It
   was not a room that had not started serving. It was a room whose host
   socket had been closed underneath her.

   That is what a Durable Object's WebSockets do when a new version of the
   worker takes over: the object is evicted, storage survives, sockets do
   not. Reproduced exactly, against a local wrangler dev, by closing the
   host's socket by hand between the two joins — bob came back seat 0, not
   host, one chair taken, matching production value for value.

   So a probe that opens a socket, hears itself, and closes cannot see this
   at all. It has to HOLD one open across the window and require that
   nothing closes it. */
const SURVIVE_MS = Number(process.env.SETTLE_SURVIVE_MS || 15000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* One round trip: connect, say something, hear it back.

   Resolves true only on the full path. Every failure — a refused upgrade, a
   socket that opens and goes quiet, a close mid-probe — resolves false
   rather than throwing, because at this point they are all the same fact
   ("not ready yet") and the caller's job is to try again. The socket is
   always closed, including on the timeout path, so a probe cannot leave a
   connection behind for the suite to trip over. */
function probe() {
  return new Promise((resolve) => {
    const room = "settle" + Math.floor(Math.random() * 1000000);
    const said = "settle-" + Math.random().toString(36).slice(2);
    const q = new URLSearchParams({
      member: "settle-probe",
      name: "Settle",
      league: JSON.stringify({ teams: 4, rounds: 3 }),
      clock: "60",
      data: "v1"
    });

    let ws;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PROBE_MS);

    try {
      ws = new WebSocket(`${BASE}/room/${room}?${q}`);
    } catch {
      finish(false);
      return;
    }

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "chat", text: said }));
    });
    ws.addEventListener("message", (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      // The initial state on connect is NOT the thing being waited for — it
      // arrived perfectly throughout the failure this exists for. What
      // counts is a broadcast carrying something this probe sent.
      if (msg.type !== "state") return;
      const chat = (msg.room && msg.room.chat) || [];
      if (chat.some((m) => m.text === said)) finish(true);
    });
    ws.addEventListener("error", () => finish(false));
    ws.addEventListener("close", () => finish(false));
  });
}

/* Phase two: one socket, held open, still working at the end.

   Deliberately not a longer PROBE_MS — a slow round trip and a socket that
   is torn out from under you are different facts, and only the second one
   is what the verify step trips over. So this waits in the middle, on
   purpose, doing nothing: the whole question is whether anything closes it.

   The closing round trip matters as much as the silence. A socket can stay
   open against an object that has stopped answering, which would be the
   same false pass this file already exists to prevent, one layer along.

   Resolves a reason rather than a boolean so the log can tell "it closed on
   me" (still rolling out) from "it went quiet" (worse) — the same line the
   deadline message at the bottom draws. */
function survives(holdMs) {
  return new Promise((resolve) => {
    const room = "survive" + Math.floor(Math.random() * 1000000);
    const q = new URLSearchParams({
      member: "settle-probe",
      name: "Settle",
      league: JSON.stringify({ teams: 4, rounds: 3 }),
      clock: "60",
      data: "v1"
    });

    let ws;
    let done = false;
    let waiting = null;          // the text of the round trip in flight
    const finish = (reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(reason);
    };
    const timer = setTimeout(() => finish("went quiet"), holdMs + PROBE_MS * 2);

    const say = () => {
      waiting = "settle-" + Math.random().toString(36).slice(2);
      ws.send(JSON.stringify({ type: "chat", text: waiting }));
    };

    try {
      ws = new WebSocket(`${BASE}/room/${room}?${q}`);
    } catch {
      finish("could not open");
      return;
    }

    let heard = 0;
    ws.addEventListener("open", () => say());
    ws.addEventListener("message", (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type !== "state" || !waiting) return;
      const chat = (msg.room && msg.room.chat) || [];
      if (!chat.some((m) => m.text === waiting)) return;
      waiting = null;
      heard += 1;
      if (heard === 1) setTimeout(() => { if (!done) say(); }, holdMs);
      else finish(null);         // survived the hold and still answering
    });
    ws.addEventListener("error", () => finish("errored"));
    // The one this whole function exists for.
    ws.addEventListener("close", () => finish("closed under us"));
  });
}

const started = Date.now();
let streak = 0;
let attempts = 0;

while (Date.now() - started < DEADLINE_MS) {
  attempts += 1;
  const ok = await probe();
  const at = ((Date.now() - started) / 1000).toFixed(1) + "s";

  if (!ok) {
    streak = 0;
    console.log(`${at}  probe ${attempts}: no broadcast yet`);
    await sleep(RETRY_MS);
    continue;
  }

  streak += 1;
  console.log(`${at}  probe ${attempts}: round trip ok (${streak} of 2)`);
  if (streak >= 2) {
    /* Serving. Now the harder question, and the one the verify step
       actually depends on: does a socket opened now still exist in fifteen
       seconds? A rollout that is still landing closes it, and the whole
       failure this file is for is that closure happening a moment later,
       inside the suite, where it reads as forty broken assertions. */
    const why = await survives(SURVIVE_MS);
    const then = ((Date.now() - started) / 1000).toFixed(1) + "s";
    if (why) {
      // Back to the start rather than straight to another hold: whatever
      // took that socket may still be taking them, and the cheap round trip
      // is how this file already asks "is it serving at all".
      console.log(`${then}  a held socket ${why} — still rolling out, starting over`);
      streak = 0;
      await sleep(RETRY_MS);
      continue;
    }
    console.log(
      `${then}  a socket held ${SURVIVE_MS}ms and still answered ` +
      `— serving, and settled, after ${attempts} probes`
    );
    process.exit(0);
  }
  await sleep(GAP_MS);
}

/* The deadline is a real failure and is reported as one.

   Two minutes of a socket never hearing itself back is not a rollout
   window; it is a worker that does not work, and the verify step below
   would say so at much greater length. Failing here rather than falling
   through keeps the two apart: this says "it never came up", and that says
   "it came up and is wrong". */
console.error(
  `the worker never returned a broadcast within ${DEADLINE_MS}ms ` +
  `(${attempts} probes against ${BASE})`
);
process.exit(1);
