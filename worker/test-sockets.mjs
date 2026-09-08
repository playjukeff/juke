/* Drive a running worker over real WebSockets.

   room.js and draft-engine.js are pure and covered by
   scripts/test_engine.py. This covers the half that is not: sockets, storage
   between messages, the alarm, and the object actually behaving as one
   referee when two people disagree.

   The assertion that matters most sends the same player twice on the same
   turn and checks that exactly one pick lands. That is the entire reason
   any of this exists.

       cd worker && wrangler dev --port 8787 --local
       node worker/test-sockets.mjs

   Needs Node 22 or newer for WebSocket and fetch as globals. */

const BASE = process.env.JUKE_WORKER || "ws://127.0.0.1:8787";
// The same host over plain HTTP, for the one route that is not a socket.
const HTTP = BASE.replace(/^ws/, "http");
const ROOM = "testroom" + Math.floor(Math.random() * 100000);

const LEAGUE = { teams: 4, rounds: 3 };

const fails = [];
const note = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${name}\n    got  ${g}\n    want ${w}`);
  else note.push("ok  " + name);
}

/* Assertions that were never attempted, said out loud.

   A section whose own wait timed out has nothing left to check against, and
   running its checks anyway produces a page of consequential failures that
   all restate the one thing that went wrong. Skipping them silently is
   worse: the run would end green-ish and shorter, and nobody counts. */
function blocked(what) {
  fails.push(what + "\n    not attempted — the wait above it timed out");
}

/* ---- The report has to survive a crash, because the crash IS the result ----

   Every result in this file is buffered into note/fails and printed at the
   very bottom, and `until()` reports its own timeout by pushing a failure and
   returning undefined. Several blocks below then read two fields deep off
   what it did not find — `pollState[pollState.length - 1].type` after a
   `|| []`, say — which throws, and a throw at top level skipped the report
   entirely.

   Measured, on the post-deploy gate: a run that had already passed 108
   assertions and timed out on ONE slow poll broadcast printed a bare
   TypeError and not a single `ok` line. That is the worst available output
   on the one check that runs against a just-promoted worker, because it
   reads as "everything is broken" when what happened is "one broadcast was
   slow" — and it is the same tell CLAUDE.md's testing section already
   records, a failure that names nothing being far more expensive than one
   that names a value.

   So the report is a function on `exit`: whatever happens, whatever ran gets
   printed. `uncaughtException` records the crash as a failure of its own and
   says the run stopped there, because a report that is merely SHORT is the
   other way to be misread — 108 ok lines and no mention that four sections
   never ran is a pass with a hole in it. */
let reported = false;
/* Sockets that went away without being asked to.

   ---- Why this is worth its own channel ----

   On 8 September 2026 the deploy gate went red with 83 assertions passing
   and 39 failing, and not one of the 39 said what had happened. Read in
   source order the first three were `bob joined` wanting seat 1 and getting
   0, `bob is not host` PASSING, and `bob sees two chairs taken` getting 1.
   That combination has exactly one meaning — the room still existed with
   alice as its host, and alice's chair was free, which is `leave()`,
   because a dropped socket frees the chair in the lobby.

   So the host's socket had been closed underneath her, which is what a
   Durable Object's WebSockets do when a new version of the worker takes
   over. Reproduced value for value against a local wrangler dev by closing
   the host's socket by hand between the two joins.

   Everything after that point is downstream of one event, and thirty-nine
   restatements of it are what this file's own `blocked()` comment already
   calls "a page of consequential failures that all restate the one thing
   that went wrong". The gate is a step nobody reads if it cries wolf; this
   is the line that makes a residual occurrence take five seconds to
   diagnose instead of forty minutes.

   `expected` is set when the suite closes a socket on purpose — the
   reconnect section does that deliberately — so only a close nobody asked
   for is recorded. */
const closures = [];
const startedAt = Date.now();
function watchForClose(ws, who) {
  ws.addEventListener("close", () => {
    if (ws.expected) return;
    closures.push(`${who} at ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  });
}

function report() {
  if (reported) return;
  reported = true;
  console.log(note.join("\n"));
  console.log("");
  /* Before the failures rather than after them, because it explains them.
     Printed even on a green run, where it should be empty and its absence
     is the claim being made. */
  if (closures.length) {
    console.log(
      "SOCKETS CLOSED WITHOUT BEING ASKED: " + closures.join(", ") + "\n" +
      "  A Durable Object's sockets are closed when a new worker version\n" +
      "  takes over, so this is very likely a deploy landing mid-run rather\n" +
      "  than a fault in the room. worker/wait-for-worker.mjs holds a socket\n" +
      "  open before this step for exactly that reason; if it passed and\n" +
      "  this still happened, the rollout window is longer than its hold.\n" +
      "  Re-run against the deployed worker before believing the failures\n" +
      "  below — every one of them is downstream of this.\n"
    );
  }
  if (fails.length) {
    console.log("FAIL " + fails.length);
    fails.forEach((f) => console.log("  x " + f));
    return;
  }
  console.log(`OK — ${note.length} assertions over real sockets`);
}

function crashed(err) {
  fails.push(
    "the run stopped here, so any section below this one never ran\n" +
    "    " + ((err && err.stack) || err)
  );
  process.exitCode = 1;
  report();
}
process.on("uncaughtException", crashed);
process.on("unhandledRejection", crashed);
process.on("exit", report);

/* `room` last and defaulted, so every existing call site still reads as
   connect(member, name) and only the sections that need a room of their own
   have to say so. The host-only messages do: they are lobby-only, and this
   file's main room starts drafting a few lines below. */
function connect(member, name, extra, room = ROOM) {
  const q = new URLSearchParams({
    member, name,
    league: JSON.stringify(LEAGUE),
    clock: "60",
    data: "v1",
    ...(extra || {})
  });
  const ws = new WebSocket(`${BASE}/room/${room}?${q}`);
  ws.inbox = [];
  ws.addEventListener("message", (e) => ws.inbox.push(JSON.parse(e.data)));
  watchForClose(ws, member);
  return new Promise((res, rej) => {
    ws.addEventListener("open", () => res(ws));
    ws.addEventListener("error", rej);
    setTimeout(() => rej(new Error("open timed out for " + member)), 5000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wait for a thing to become true rather than for a number of milliseconds.

   The first version slept 400ms after each send, which is generous against
   localhost and not always enough against a worker at the other end of a real
   network — the suite failed once on production and passed on a retry, which
   is the worst kind of test. Polling a condition makes it as fast as the
   connection allows and as patient as it needs to be. */
async function until(label, test, ms = 8000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    let got;
    try { got = test(); } catch (err) { got = undefined; }
    if (got !== undefined && got !== false && got !== null) return got;
    await sleep(60);
  }
  fails.push(label + " timed out after " + ms + "ms");
  return undefined;
}

function lastState(ws) {
  for (let i = ws.inbox.length - 1; i >= 0; i--) {
    if (ws.inbox[i].type === "state") return ws.inbox[i].room;
  }
  return null;
}
// How many of a kind have arrived. Needed wherever "has one arrived?" is the
// wrong question because an earlier one is already sitting in the inbox.
function countOfType(ws, type) {
  return ws.inbox.filter((m) => m.type === type).length;
}

function lastOfType(ws, type) {
  for (let i = ws.inbox.length - 1; i >= 0; i--) {
    if (ws.inbox[i].type === type) return ws.inbox[i];
  }
  return null;
}

/* until(), not sleep(400) — and these two were the last of them.

   The comment on until() above says a fixed 400ms is "generous against
   localhost and not always enough against a worker at the other end of a
   real network", and the whole file adopted it except the opening moves,
   which is this project's own "when a fix is applied to every caller, count
   the callers". Nothing here waits on the value being asserted: it waits for
   the state to EXIST and then checks what is in it, so a wrong seat still
   fails rather than timing out into silence. */
const alice = await connect("alice", "Alice");
await until("alice's first state arrives", () => lastState(alice));

let s = lastState(alice);
check("alice gets a state on connect", !!s, true);
check("room created in lobby", s && s.status, "lobby");
check("four chairs", s && s.seats.length, 4);
check("alice is host", s && s.isHost, true);
check("alice took seat 0", s && s.yourSeat, 0);

const bob = await connect("bob", "Bob");
await until("bob's first state arrives", () => lastState(bob));

s = lastState(bob);
check("bob joined", s && s.yourSeat, 1);
check("bob is not host", s && s.isHost, false);
check("bob sees two chairs taken", s && s.seats.filter((x) => x.taken).length, 2);

/* alice's socket should have been told about bob without asking — and this
   one waits on the broadcast rather than on bob's own state, because the two
   are separate sends and alice's is the one under test. */
await until("alice hears about bob",
            () => (lastState(alice) || {}).seats?.filter((x) => x.taken).length === 2 || undefined);
s = lastState(alice);
check("alice was pushed the update", s && s.seats.filter((x) => x.taken).length, 2);
check("alice cannot see bob's member id",
      JSON.stringify(s).includes("bob") === false, true);

// non-host start is refused
bob.send(JSON.stringify({ type: "start" }));
await sleep(300);
check("non-host start refused", lastOfType(bob, "rejected")?.code, "not-your-seat");
check("still in lobby", lastState(alice)?.status, "lobby");

// host starts
alice.send(JSON.stringify({ type: "start" }));
await until("the room starts drafting", () => lastState(alice)?.status === "drafting" || undefined);
check("drafting after host start", lastState(alice)?.status, "drafting");
check("both sockets saw it", lastState(bob)?.status, "drafting");
check("a countdown arrived", typeof lastState(bob)?.msLeft, "number");

// wrong seat is refused; seat 0 is on the clock
bob.send(JSON.stringify({ type: "pick", key: "Gibbs" }));
await sleep(300);
check("bob cannot pick on alice's turn", lastOfType(bob, "rejected")?.code, "not-your-seat");

/* alice picks.

   Waited for rather than slept through. A fixed 400ms is comfortable against
   localhost and a coin toss against a worker at the other end of a real
   network — this crashed on production reading picks[0] of an empty list,
   which is the failure the until() helper was written for and which the note
   above it already warns about. Any fixed sleep before an assertion about a
   broadcast is the same bug waiting to happen. */
alice.send(JSON.stringify({ type: "pick", key: "Gibbs" }));
s = await until("alice's pick reaches bob", () => {
  const st = lastState(bob);
  return st && st.picks.length === 1 ? st : false;
}) || { picks: [] };
check("pick landed for everyone", s.picks.length, 1);
check("pick recorded to the right seat", s.picks[0]?.slot, 0);
check("pick key kept", s.picks[0]?.key, "Gibbs");

// THE race: both sockets send the same player on bob's turn, same tick
const before = lastState(bob).picks.length;
/* A *new* rejection, counted rather than looked up. bob already carries one
   from the wrong-seat check above, so waiting for "a rejection to exist"
   returned instantly and the assertion read the picks before either send had
   been decided. */
const rejectsBefore = countOfType(bob, "rejected");
bob.send(JSON.stringify({ type: "pick", key: "Bijan" }));
bob.send(JSON.stringify({ type: "pick", key: "Bijan" }));
// One of the two must be refused, so a second rejection means both have been
// decided — a pick count alone could catch the first one mid-flight.
await until("the duplicate is decided",
            () => countOfType(bob, "rejected") > rejectsBefore);
s = lastState(bob);
check("a duplicate submit adds exactly one pick", s.picks.length - before, 1);
check("second submit was rejected", lastOfType(bob, "rejected")?.code !== undefined, true);
check("no duplicate keys anywhere", new Set(s.picks.map((p) => p.key)).size, s.picks.length);

// chat lives in the room, not a relay, so it arrives in the state and a
// late joiner gets the history rather than silence
alice.send(JSON.stringify({ type: "chat", text: "hello room" }));
const chat = await until("chat arrives at bob", () => {
  const c = (lastState(bob) || {}).chat || [];
  return c.length && c[c.length - 1].text === "hello room" ? c : false;
}) || [];
check("chat reached bob", chat[chat.length - 1]?.text, "hello room");
check("chat carries a seat, never a member id",
      JSON.stringify(chat).includes("alice") === false, true);

// markup typed by a manager stays a string all the way through
alice.send(JSON.stringify({ type: "chat", text: "<img src=x onerror=alert(1)>" }));
const withMarkup = await until("markup message arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.text.startsWith("<img") ? last : false;
}) || {};
check("markup is stored verbatim, escaping is the client's job",
      withMarkup.text, "<img src=x onerror=alert(1)>");

// a GIF from GIPHY survives; anything else is dropped before it is stored
alice.send(JSON.stringify({ type: "chat", text: "look",
  gif: "https://media1.giphy.com/media/abc/giphy.gif" }));
const withGif = await until("gif message arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.text === "look" ? last : false;
}) || {};
check("giphy media kept", withGif.gif, "https://media1.giphy.com/media/abc/giphy.gif");

alice.send(JSON.stringify({ type: "chat", text: "sneaky",
  gif: "https://giphy.com.evil.example/x.gif" }));
const spoofed = await until("spoofed gif message arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.text === "sneaky" ? last : false;
}) || {};
check("lookalike host dropped, message kept", spoofed.gif, null);

// an empty message is refused rather than filling the log with blanks
const beforeBlank = lastState(bob).chat.length;
alice.send(JSON.stringify({ type: "chat", text: "   " }));
await sleep(300);
check("blank message ignored", lastState(bob).chat.length, beforeBlank);

/* ---- names ----

   The name is what everything else in the chat hangs off. It arrives on the
   query string at connect and can be changed at any point after. */
check("the name from the query string reached the chair",
      lastState(bob).seats[0].name, "Alice");

alice.send(JSON.stringify({ type: "rename", name: "  Coach   Al  " }));
const renamed = await until("rename reaches bob", () => {
  const st = lastState(bob);
  return st && st.seats[0].name === "Coach Al" ? st : false;
}) || {};
check("a name is cleaned server-side", renamed.seats?.[0].name, "Coach Al");
check("renaming rewrites what was already said",
      (renamed.chat || []).filter((m) => !m.system && m.seat === 0)
        .every((m) => m.name === "Coach Al"), true);

/* ---- reactions ----

   Stored against a message id and reported as a count plus whether it was
   you. The count is the point; who reacted is nobody's business, because
   telling anyone would mean handing out member ids. */
/* Waited for, not read off whatever happened to have arrived.

   This was a snapshot taken at whatever moment the previous assertion
   finished. Locally the message is always there by then; from a GitHub
   runner, further from the Durable Object, it sometimes is not. The check
   below used `target?.id` and so degraded politely to a recorded failure —
   and the next line dereferenced `target.id` unguarded and took the whole
   suite down with a TypeError, losing a hundred passing assertions to one
   slow message.

   That is this project's own "a null-returning read needs a caller that
   reads null" rule, in the harness rather than the app. It surfaced only
   once the deploy workflow began running this against production from a
   machine that is not mine. Every other wait in this file already goes
   through until(); this was the one that did not.

   The fallback id is what keeps a timeout reporting rather than crashing:
   the reaction assertions below then fail on their own terms, in a run
   that still gets to the end and says what else was fine.

   That last sentence was false for as long as it stood, and the deploy
   that merged the fix for the poll blocks failed on THIS block within the
   hour. `|| { id: -1 }` stops `target.id` throwing and does nothing about
   `chat.find((m) => m.id === target.id).reacts` two checks below, where a
   find against an id no message carries returns undefined. So the guard
   covered the dereference it was written for and not the next one.

   Which is the rule this comment already cites, applied to itself: a
   null-returning read needs a caller that reads null, and there were two
   callers. `?.` rather than a `blocked()` guard, deliberately, because
   what this block wants is exactly what the paragraph above says it
   wants -- the assertions failing on their own terms -- and there are
   only two dependent waits below it, so nothing cascades far.

   The general form, for the next one of these: grep this file for a `.`
   immediately after a `.find(` or a `[...]`, not for the fallbacks. A
   fallback is evidence somebody already knew, not evidence they finished. */
const target = (await until("a stored message reaches bob",
                            () => lastState(bob)?.chat?.filter((m) => !m.system)[0])) || { id: -1 };
check("a stored message carries an id", typeof target?.id, "number");

bob.send(JSON.stringify({ type: "react", id: target.id, emoji: "\u{1F525}" }));
const reacted = await until("reaction reaches alice", () => {
  const line = (lastState(alice) || {}).chat?.find((m) => m.id === target.id);
  return line && line.reacts ? line : false;
}) || {};
check("alice sees the count and that it was not her",
      reacted.reacts, [{ emoji: "\u{1F525}", count: 1, you: false }]);
/* Bob's own copy needs its own wait, and this is the line the deploy
   workflow actually died on -- twice, on 7 and 8 September 2026, both
   times AFTER `wrangler deploy` had already succeeded.

   The until() above waits for ALICE to see the reaction. Bob's state is a
   separate broadcast to a separate socket, so against production it is
   sometimes a beat behind: .find() returns undefined and .reacts throws.

   The poll section's own rewrite guarded every block of this shape and
   until() now swallows a throwing PREDICATE -- but this is an assertion,
   outside any predicate, so neither reaches it. It is the one instance the
   sweep did not cover, which is worth saying plainly: the fix landed on
   the section that had never crashed and left the line that had. */
const mine = (await until("bob sees his own reaction", () => {
  const line = (lastState(bob) || {}).chat?.find((m) => m.id === target.id);
  return line && line.reacts ? line : false;
})) || {};
check("bob sees that it was him",
      mine.reacts,
      [{ emoji: "\u{1F525}", count: 1, you: true }]);
check("a reaction leaks no member id",
      JSON.stringify(lastState(alice)).includes("bob") === false, true);

bob.send(JSON.stringify({ type: "react", id: target.id, emoji: "not-an-emoji" }));
await sleep(300);
check("an unlisted reaction is refused", lastOfType(bob, "rejected")?.code, "bad-reaction");

bob.send(JSON.stringify({ type: "react", id: target.id, emoji: "\u{1F525}" }));
const unreacted = await until("reaction is taken back", () => {
  const line = (lastState(alice) || {}).chat?.find((m) => m.id === target.id);
  return line && !line.reacts ? line : false;
}) || {};
check("pressing the same reaction twice removes it", unreacted.reacts, null);

/* And bob needs his own wait for the un-react, for the same reason he
   needs one for the react twelve lines up. That sweep guarded the react
   and stopped one block short of this one.

   It is not only symmetry. The typing block below snapshots bob's inbox
   on its second line, and until() above returns the moment ALICE has the
   un-react -- so bob's copy of that same broadcast can still be in
   flight, land AFTER bobInboxBefore is taken, and read as "typing caused
   a state broadcast". A red assertion about typing, caused by a reaction,
   on a worker that is fine.

   That is exactly what failed the deploy gate on 8 September 2026: 1 of
   109, and the same suite passed 109/109 against that identical deployed
   worker minutes later. Not the deploy race wait-for-worker.mjs settles
   -- that one is ~40 failures, every one a wait for a broadcast. A single
   red assertion is a gap in the harness, and a gate that cries wolf is
   one nobody reads by the end of the week.

   Bob has already seen his own reaction by here (the `mine` wait proves
   `reacts` is set on his copy), so waiting for it to go away cannot pass
   on the state from BEFORE the react. */
await until("bob sees the reaction taken back too", () => {
  const line = (lastState(bob) || {}).chat?.find((m) => m.id === target.id);
  return line && !line.reacts ? line : false;
});

/* ---- typing ----

   The one message that never touches state. It is relayed to the other
   sockets and forgotten, because storing it would mean a Durable Object
   write per keystroke to record something true for two seconds. */
const chatLenBeforeTyping = lastState(bob).chat.length;
const bobInboxBefore = bob.inbox.length;

alice.send(JSON.stringify({ type: "typing", on: true }));
const typing = await until("typing reaches bob", () => lastOfType(bob, "typing")) || {};
check("typing carries the sender's seat", typing.seat, 0);
check("typing carries the name, so it can be drawn", typing.name, "Coach Al");
check("typing is not stored in the room", lastState(bob).chat.length, chatLenBeforeTyping);
check("typing did not cause a state broadcast",
      bob.inbox.slice(bobInboxBefore).some((m) => m.type === "state"), false);

// and it does not come back to the person doing it
const aliceInboxBefore = alice.inbox.length;
alice.send(JSON.stringify({ type: "typing", on: true }));
await sleep(300);
check("the typist is not told about themselves",
      alice.inbox.slice(aliceInboxBefore).some((m) => m.type === "typing"), false);

/* A client claiming somebody else is typing gets its own seat used anyway.
   The seat is looked up from the socket, never taken from the message. */
bob.send(JSON.stringify({ type: "typing", on: true, seat: 0 }));
const claimed = await until("bob's typing reaches alice",
  () => lastOfType(alice, "typing")) || {};
check("the seat comes from the socket, not the message", claimed.seat, 1);

// storage survives a reconnect: alice drops and comes back
alice.expected = true;  // the reconnect section drops her deliberately
alice.close();
await sleep(400);
const alice2 = await connect("alice", "Alice");
await until("alice's state after reconnecting", () => lastState(alice2));
s = lastState(alice2);
check("room survived a reconnect", s?.picks.length >= 2, true);
check("alice keeps her seat mid-draft", s?.yourSeat, 0);
check("still drafting", s?.status, "drafting");

/* And she is drafting for herself again.

   A drop hands the chair to the CPU so the room keeps moving without her,
   which is right; coming back has to hand it straight back, which it did not.
   The seat was still hers and still marked auto, so the host's browser went
   on picking for a manager who was sitting there watching it happen — a
   failure with no error anywhere, visible only as picks she never made.

   It went unnoticed because nothing used to reconnect on its own: you got
   here by reopening the link, which is rare enough that nobody did it twice.
   The page retries by itself now, so this is the common path, not the odd
   one. */
check("a returning manager stops being auto", s?.seats[0].auto, false);
check("and the chair is still hers", s?.seats[0].taken, true);

/* Coming back is not arriving. The lobby frees a dropped chair, so "had no
   seat a moment ago" is true of a reconnection too — and announcing on that
   put "took seat 1" in the log every time a phone went to the messages app
   and back, which is exactly what the person creating the room does. */
const arrivals = (lastState(alice2).chat || [])
  .filter((m) => m.system && /took seat/.test(m.text || ""));
check("a reconnect is not announced as an arrival",
      arrivals.filter((m) => /Alice|Coach Al/.test(m.text)).length, 1);

// somebody arriving late reads what the room already said
const lateChat = lastState(alice2).chat || [];
check("a late joiner gets the history", lateChat.length > 0, true);
check("history includes the arrival lines",
      lateChat.some((m) => m.system === true), true);

// a client on a different data build is turned away
const stale = await connect("carol", "Carol", { data: "v2-different" });
/* The ROOM closes this one, which is the whole point of the section — so it
   is marked before the refusal lands rather than at the tidy-up below, or the
   close watcher reports a healthy run as a worker replacing itself. A
   diagnostic that fires on a green run is the crying-wolf problem it exists
   to fix, wearing the fix's clothes. */
stale.expected = true;
await until("the stale build is refused", () => lastOfType(stale, "rejected"));
const rej = lastOfType(stale, "rejected");
check("stale build refused", rej?.code, "stale-data");
check("refusal names both versions",
      !!(rej?.detail?.roomVersion && rej?.detail?.yourVersion), true);

// the /state route works without a socket
const res = await fetch(`${HTTP}/room/${ROOM}/state`);
const view = await res.json();
check("state route responds", res.status, 200);
check("state route agrees on the pick count", view.picks.length, s.picks.length);

/* ---- the GIPHY proxy is not open ----

   CORS headers tell a browser whether to let a page read a response. They do
   nothing about the request being made, so withholding them stopped nobody:
   curl with a made-up Origin came back with a full result set and a little
   more of the key's quota spent. These check the refusal, not the header. */
const evil = await fetch(`${HTTP}/giphy?q=touchdown`,
                         { headers: { Origin: "https://evil.example" } });
check("a foreign origin is refused outright", evil.status, 403);
check("and is told nothing else", (await evil.json()).results, undefined);

const bare = await fetch(`${HTTP}/giphy?q=touchdown`);
check("so is a request with no origin at all", bare.status, 403);

/* A lookalike host has to fail too — the check is an exact match against the
   list, not a substring, for the same reason cleanGif() parses a URL rather
   than searching it for "giphy.com". */
const lookalike = await fetch(`${HTTP}/giphy?q=x`,
                              { headers: { Origin: "https://jukeff.com.evil.example" } });
check("a lookalike origin is refused", lookalike.status, 403);

const ours = await fetch(`${HTTP}/giphy?q=touchdown`,
                         { headers: { Origin: "https://jukeff.com" } });
check("our own origin is served", ours.status, 200);
check("and gets the CORS header back",
      ours.headers.get("access-control-allow-origin"), "https://jukeff.com");

/* ---- the news proxy is not open either ----

   Same route shape, same key-in-the-worker reason, so it gets the same
   refusals. Worth asserting separately rather than assuming the GIPHY checks
   above cover it: they are two functions, and the origin check is a call each
   of them has to remember to make. A route that forgot would look perfectly
   healthy from a browser on our own domain, which is the only place anybody
   would ever try it. */
const newsEvil = await fetch(`${HTTP}/news?player=9221`,
                             { headers: { Origin: "https://evil.example" } });
check("news refuses a foreign origin", newsEvil.status, 403);

const newsBare = await fetch(`${HTTP}/news?player=9221`);
check("news refuses a request with no origin", newsBare.status, 403);

const newsLookalike = await fetch(`${HTTP}/news?player=9221`,
                                  { headers: { Origin: "https://jukeff.com.evil.example" } });
check("news refuses a lookalike origin", newsLookalike.status, 403);

const newsOurs = await fetch(`${HTTP}/news?player=9221`,
                             { headers: { Origin: "https://jukeff.com" } });
check("news serves our own origin", newsOurs.status, 200);
const newsBody = await newsOurs.json();
/* With no key set this says so rather than answering with an empty list that
   looks like "no headlines today". The page draws nothing either way, but the
   two are different facts and only one of them is worth investigating. */
check("news answers with an items array", Array.isArray(newsBody.items), true);
check("news reports whether it is configured",
      typeof newsBody.configured, "boolean");
if (!newsBody.configured) {
  check("an unconfigured provider returns no items", newsBody.items.length, 0);
}

/* ---- news is cached, and failures are not ----

   The provider is a thousand calls a month and a draft is the same dozen
   players opened repeatedly, so the cache is the difference between the
   feature working and being rationed. Two things are asserted: that a repeat
   is served without going upstream, and that CORS is still decided per
   request -- a cache that answered with the first caller's origin header
   would turn a per-request decision into a shared one. */
const newsFirst = await fetch(`${HTTP}/news?player=CACHETEST1`,
                              { headers: { Origin: "https://jukeff.com" } });
check("news answers a first ask", newsFirst.status, 200);
const firstBody = await newsFirst.json();

const newsAgain = await fetch(`${HTTP}/news?player=CACHETEST1`,
                              { headers: { Origin: "https://jukeff.com" } });
check("and answers a repeat", newsAgain.status, 200);

/* Only meaningful with a key configured: without one the route returns before
   it ever reaches the cache, which is correct and is why this is conditional
   rather than an unconditional assertion that would fail on a fresh checkout.

   "not miss", not "hit", and the difference is the whole point of the test.
   There are two caches in front of the provider — the edge cache
   (x-juke-cache: hit) and D1 (db) — and only "miss" means the provider was
   actually called. What this exists to prove is that a player opened
   repeatedly costs one upstream call rather than fifty, and "db" proves
   that exactly as well as "hit" does.

   Asserting "hit" held locally and failed against the deployed worker,
   measured: miss -> db -> hit, three asks to reach the edge cache rather
   than two, because the edge write does not land in time for the request
   immediately behind it. That is a property of a real edge and not a
   fault, and it matters now in a way it did not before — the deploy
   workflow runs this suite against production after every deploy, so an
   assertion that only holds against miniflare would have made every
   automated deploy report red. */
if (firstBody.configured) {
  check("a repeated ask does not reach the provider again",
        newsAgain.headers.get("x-juke-cache") !== "miss", true);
}

const newsOther = await fetch(`${HTTP}/news?player=CACHETEST1`,
                              { headers: { Origin: "https://www.jukeff.com" } });
check("a cached answer still gets the asking origin's CORS header",
      newsOther.headers.get("access-control-allow-origin"), "https://www.jukeff.com");

const newsEvilCached = await fetch(`${HTTP}/news?player=CACHETEST1`,
                                   { headers: { Origin: "https://evil.example" } });
check("and a forbidden origin is still refused, cached or not",
      newsEvilCached.status, 403);

/* ---- the rate limit ----

   The number that matters is not that a flood is stopped — it is that a real
   draft never reaches it. So this checks both ends: a burst well past the
   limit is refused, and the socket still works immediately afterwards for
   somebody who was only ever going at human speed. */
const flooder = await connect("flood", "Flooder");
await sleep(300);
const floodRejects = () => flooder.inbox.filter(
  (m) => m.type === "rejected" && m.code === "too-fast").length;

check("a normal burst is not limited", floodRejects(), 0);

for (let i = 0; i < 80; i++) {
  flooder.send(JSON.stringify({ type: "chat", text: "flood " + i }));
}
await until("the flood is refused", () => floodRejects() > 0);
check("a flood is refused", floodRejects() > 0, true);

// and the connection survives it
check("the socket is not closed for flooding", flooder.readyState, 1);
flooder.expected = true;  // the rate-limit section is finished with it
flooder.close();

/* ---- reply threading, over a real socket ----

   room.js's own tests cover the pointer's own rules (a bogus id is stored
   anyway, garbage is dropped); this only needs to prove a replyTo sent on
   the wire survives the trip through the adapter and comes back on the
   broadcast the same way any other field on a chat line does. */
alice2.send(JSON.stringify({ type: "chat", text: "which RB?" }));
const parent = await until("the parent message arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.text === "which RB?" ? last : false;
}) || {};

bob.send(JSON.stringify({ type: "chat", text: "Gibbs, easy", replyTo: parent.id }));
const reply = await until("the reply arrives", () => {
  const c = (lastState(alice2) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.text === "Gibbs, easy" ? last : false;
}) || {};
check("a replyTo sent over the socket lands on the broadcast line",
      reply.replyTo, parent.id);

/* ---- polls, over a real socket ----

   Any member may open one — nothing here is host-only. What has to be
   proven over a live socket rather than only against the pure room is that
   the vote projection each client receives never carries the other one's
   member id, the same reason test-sockets.mjs checks reactions and not
   only test_engine.py. */
alice2.send(JSON.stringify({
  type: "poll-create", question: "Trade Bijan for two firsts?",
  choices: ["Yes", "No"], multi: false, anon: false
}));
const pollState = await until("the poll arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.type === "poll" ? c : false;
}) || [];
const pollLine = pollState[pollState.length - 1];
if (!pollLine) blocked("everything the poll section checks");
else {
  check("a poll carries its type over the wire", pollLine.type, "poll");
  check("choices arrive in order", pollLine.poll.options.map((o) => o.choice), ["Yes", "No"]);
  check("nobody has voted yet", pollLine.poll.options.map((o) => o.count), [0, 0]);

  bob.send(JSON.stringify({ type: "poll-vote", id: pollLine.id, choice: 0 }));
  const bobVoted = await until("bob's vote reaches alice", () => {
    const line = (lastState(alice2) || {}).chat.find((m) => m.id === pollLine.id);
    return line && line.poll.options[0].count === 1 ? line : false;
  });
  if (!bobVoted) blocked("what alice and bob each see of that vote");
  else {
    check("alice sees bob's vote counted", bobVoted.poll.options[0].count, 1);
    check("and that it was not her own", bobVoted.poll.options[0].you, false);
    check("bob sees it was him",
          lastState(bob).chat.find((m) => m.id === pollLine.id).poll.options[0].you, true);
    check("a poll vote leaks no member id",
          JSON.stringify(lastState(alice2)).includes('"bob"') === false, true);
  }

  alice2.send(JSON.stringify({ type: "poll-vote", id: pollLine.id, choice: 99 }));
  await until("the bad choice is rejected", () => lastOfType(alice2, "rejected")?.code === "no-such-choice");
  check("an out-of-range choice is refused",
        lastOfType(alice2, "rejected")?.code, "no-such-choice");
}

// ---- anon: counts are visible, who voted never is ----
alice2.send(JSON.stringify({
  type: "poll-create", question: "Anonymous gut check", choices: ["Great pick", "Reach"],
  anon: true
}));
const anonPollState = await until("the anon poll arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.poll && last.poll.question === "Anonymous gut check" ? c : false;
}) || [];
const anonPoll = anonPollState[anonPollState.length - 1];

if (!anonPoll) blocked("what an anonymous poll shows and withholds");
else {
  bob.send(JSON.stringify({ type: "poll-vote", id: anonPoll.id, choice: 1 }));
  const anonView = await until("the anon vote reaches alice", () => {
    const line = (lastState(alice2) || {}).chat.find((m) => m.id === anonPoll.id);
    return line && line.poll.options[1].count === 1 ? line : false;
  });
  if (!anonView) blocked("what an anonymous poll shows and withholds");
  else {
    check("an anonymous poll still shows a count", anonView.poll.options[1].count, 1);
    check("but names nobody", anonView.poll.options[1].voters, undefined);
  }
}

// ---- multi-choice: an index toggles rather than replacing ----
alice2.send(JSON.stringify({
  type: "poll-create", question: "Which needs help?", choices: ["RB", "WR", "TE"],
  multi: true
}));
const multiPollState = await until("the multi poll arrives", () => {
  const c = (lastState(bob) || {}).chat || [];
  const last = c[c.length - 1];
  return last && last.poll && last.poll.question === "Which needs help?" ? c : false;
}) || [];
const multiPoll = multiPollState[multiPollState.length - 1];

if (!multiPoll) blocked("the multi-choice toggle");
else {
  bob.send(JSON.stringify({ type: "poll-vote", id: multiPoll.id, choice: [0, 2] }));
  await until("bob's multi vote lands", () => {
    const line = (lastState(alice2) || {}).chat.find((m) => m.id === multiPoll.id);
    return line && line.poll.options[0].count === 1 && line.poll.options[2].count === 1 ? line : false;
  });
  bob.send(JSON.stringify({ type: "poll-vote", id: multiPoll.id, choice: [0] }));
  const toggled = await until("the toggle-off lands", () => {
    const line = (lastState(alice2) || {}).chat.find((m) => m.id === multiPoll.id);
    return line && line.poll.options[0].count === 0 ? line : false;
  });
  if (!toggled) blocked("the multi-choice toggle");
  else {
    check("a multi-choice vote toggles one option without touching the rest",
          toggled.poll.options.map((o) => o.count), [0, 0, 1]);
  }
}

/* ---- voice and photo, through the real /media route ----

   The full path: upload over plain HTTP, get a URL back, send it as a chat
   action over the socket, and the room refuses to store anything that did
   not come from this route. */
const mediaOk = await fetch(`${HTTP}/media?kind=voice&room=${ROOM}`, {
  method: "POST",
  headers: { Origin: "https://jukeff.com", "content-type": "audio/webm" },
  body: "not really audio, just bytes for the test"
});
check("an upload from our own origin is accepted", mediaOk.status, 200);
const mediaBody = await mediaOk.json();

if (mediaBody.configured === false) {
  /* The bucket has not been created in this environment (see
     worker/README.md's manual step) — real, and this run says so loudly
     rather than reporting a pass that never touched R2. */
  note.push("SKIP  media upload assertions (MEDIA bucket not bound — run `wrangler r2 bucket create juke-chat-media`)");
} else {
  check("an upload returns a URL", typeof mediaBody.url, "string");
  check("the URL is served from our own worker, not R2's public bucket URL",
        new URL(mediaBody.url).hostname, new URL(HTTP).hostname);

  const fetched = await fetch(mediaBody.url);
  check("the uploaded bytes are readable back", fetched.status, 200);
  check("with a long-lived cache header — the key never changes content",
        (fetched.headers.get("cache-control") || "").includes("immutable"), true);

  const evilUpload = await fetch(`${HTTP}/media?kind=voice&room=${ROOM}`, {
    method: "POST",
    headers: { Origin: "https://evil.example", "content-type": "audio/webm" },
    body: "x"
  });
  check("an upload from a foreign origin is refused", evilUpload.status, 403);

  const badType = await fetch(`${HTTP}/media?kind=voice&room=${ROOM}`, {
    method: "POST",
    headers: { Origin: "https://jukeff.com", "content-type": "text/plain" },
    body: "x"
  });
  check("an upload with the wrong content-type is refused", badType.status, 415);

  alice2.send(JSON.stringify({ type: "voice", url: mediaBody.url, seconds: 8 }));
  const voiceLine = await until("the voice message arrives", () => {
    const c = (lastState(bob) || {}).chat || [];
    const last = c[c.length - 1];
    return last && last.type === "voice" ? last : false;
  }) || {};
  check("a voice message carries the uploaded URL", voiceLine.url, mediaBody.url);
  check("and its length", voiceLine.seconds, 8);

  // A crafted message naming a URL that never went through /media is
  // refused, the same way a non-GIPHY gif already is.
  alice2.send(JSON.stringify({ type: "voice", url: "https://evil.example/x.webm", seconds: 5 }));
  await until("the foreign voice URL is rejected",
              () => lastOfType(alice2, "rejected")?.code === "bad-voice");
  check("a voice URL not on our own host is refused",
        lastOfType(alice2, "rejected")?.code, "bad-voice");
}

/* ---- what only the host may do, over a real socket ----

   room.js is checked directly by scripts/test_engine.py, which is where the
   rules belong. What that cannot see is whether the *adapter* passes the
   sender through — and it did not have to until now, because `pause` reached
   Room with no member argument at all and no client had ever sent it. A host
   check that the worker never gives a member to is not a check.

   Its own room, because both messages are lobby-only and the room above has
   been drafting since line 100. */
const ORDER_ROOM = ROOM + "order";
const host = await connect("alice", "Alice", null, ORDER_ROOM);
const guest = await connect("bob", "Bob", null, ORDER_ROOM);
await until("both seated", () => lastState(guest)?.seats.filter((s) => s.taken).length === 2);

const rejectsOn = (ws) => ws.inbox.filter((m) => m.type === "rejected").length;
const guestRejectsBefore = rejectsOn(guest);

// ---- pausing ----
guest.send(JSON.stringify({ type: "pause", on: true }));
await until("the guest's pause is refused", () => rejectsOn(guest) > guestRejectsBefore);
check("a guest cannot pause the room",
      lastOfType(guest, "rejected").code, "not-your-seat");
check("and the clock is untouched", lastState(guest).paused, false);

host.send(JSON.stringify({ type: "pause", on: true }));
await until("the room pauses", () => lastState(guest)?.paused === true);
check("the host can pause, and everybody is told", lastState(guest).paused, true);
host.send(JSON.stringify({ type: "pause", on: false }));
await until("the room resumes", () => lastState(guest)?.paused === false);

// ---- draft order ----
check("the room is named after its host", lastState(guest).hostName, "Alice");
check("naming it leaks no member id",
      JSON.stringify(lastState(guest)).includes('"alice"'), false);

const seatNames = (ws) => lastState(ws).seats.map((s) => s.name);
check("seats start in arrival order", seatNames(guest), ["Alice", "Bob", null, null]);

const beforeGuestSwap = rejectsOn(guest);
guest.send(JSON.stringify({ type: "swap-seats", a: 0, b: 1 }));
await until("the guest's swap is refused", () => rejectsOn(guest) > beforeGuestSwap);
check("a guest cannot set the draft order",
      lastOfType(guest, "rejected").code, "not-your-seat");
check("and nothing moved", seatNames(guest), ["Alice", "Bob", null, null]);

host.send(JSON.stringify({ type: "swap-seats", a: 0, b: 2 }));
await until("the chairs move", () => seatNames(guest)?.[2] === "Alice");
check("the host sets the draft order", seatNames(guest), [null, "Bob", "Alice", null]);

/* The chair moved; the socket has to have moved with it. yourSeat is read off
   the member record, so this is what catches a swap that changed the seat list
   and left everybody pointing at where they used to sit. */
check("the host's own socket knows where it sits now", lastState(host).yourSeat, 2);
check("and the guest still sits where it did", lastState(guest).yourSeat, 1);

// Once picks exist the snake order is what they mean, so it stops being movable.
host.send(JSON.stringify({ type: "start" }));
await until("the order room starts", () => lastState(host)?.status === "drafting");
const beforeLateSwap = rejectsOn(host);
host.send(JSON.stringify({ type: "swap-seats", a: 0, b: 1 }));
await until("the late swap is refused", () => rejectsOn(host) > beforeLateSwap);
check("the order cannot be changed once drafting",
      lastOfType(host, "rejected").code, "not-in-lobby");

host.expected = true; guest.expected = true;  // tidying up at the end
host.close(); guest.close();

bob.expected = true; alice2.expected = true; stale.expected = true;  // tidying up at the end
bob.close(); alice2.close(); try { stale.close(); } catch {}
await sleep(200);

if (fails.length) process.exitCode = 1;
report();
