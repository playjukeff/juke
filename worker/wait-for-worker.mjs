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
    console.log(`the worker is serving broadcasts after ${attempts} probes`);
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
