/* What the tests need from a page, and nothing about what they assert.

   Two ideas carry most of this file:

   1. A *member* is a browser context, not a tab. Two tabs on one origin share
      localStorage, so they share `juke.member`, and the room correctly treats
      them as one manager with two sockets — which tests nothing about a
      second person. Playwright contexts have their own storage, so one
      context is one manager.

   2. Everything a client sends is recorded, and so is everything it is
      refused. A room can be rejecting half of what a client sends and look
      perfectly healthy from the outside, right up until it stops: that is
      exactly how a shared draft once deadlocked at pick 86. So `__sent` and
      `__rejects` are installed before the app loads and survive a reconnect,
      because the interesting failures happen around a socket being replaced.
*/

/* Local by default, and overridable so the same specs can be pointed at what
   is actually deployed.

   The socket suite has had JUKE_WORKER since it was written, and this file not
   having the equivalent meant the one thing nobody could run was the one thing
   worth running after a deploy: a full room draft against the real worker,
   over the real CSP, through Cloudflare. Local is where a bug is found; live
   is where it is confirmed gone.

     JUKE_SITE=https://jukeff.com \
     JUKE_WORKER_HTTP=https://juke-draft-room.jukeff.workers.dev \
     npx playwright test tests/room.spec.mjs

   Note that live.js picks its worker from the address bar — localhost means
   127.0.0.1:8787 and anything else means the deployed one — so these two move
   together or the page talks to a room the assertions are not watching. */
export const SITE = process.env.JUKE_SITE || "http://localhost:8765";
export const WORKER_HTTP = process.env.JUKE_WORKER_HTTP || "http://127.0.0.1:8787";

/* What "local" means, written once and asked twice.

   Two different questions need it and they are not the same question, which
   is why both are derived here rather than each caller answering for itself.
   The config asks about the *site*, because that is what decides whether
   there are servers to start. The news suite asks about the *worker*,
   because the provider key lives there: a `wrangler dev` this suite starts
   has none and the deployed one does, so the test for the keyless path can
   only pass against the local one.

   They move together in every sane run — see the note above — but they are
   two variables, and a run that points them apart should get the honest
   answer to each rather than one of them standing in for both. */
const isLocal = (url) => url.includes("localhost") || url.includes("127.0.0.1");
export const LOCAL_SITE = isLocal(SITE);
export const LOCAL_WORKER = isLocal(WORKER_HTTP);

/* Installed before any page script runs.

   WebSocket is wrapped rather than the socket being listened to after the
   fact, because `live.js` replaces the socket on every reconnect and a
   listener attached to the first one would stop seeing anything at the
   moment things get interesting. */
function instrumentation() {
  window.__sent = [];
  window.__rejects = [];

  const RealWS = window.WebSocket;
  function Wrapped(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    ws.addEventListener("message", function (e) {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "rejected") window.__rejects.push(m.code);
      } catch (err) {}
    });
    return ws;
  }
  Wrapped.prototype = RealWS.prototype;
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) { Wrapped[k] = RealWS[k]; });
  window.WebSocket = Wrapped;

  // Live is defined by live.js, which has not run yet, so the wrapping is a
  // function the test calls once the page is up.
  window.__watchSends = function () {
    if (window.__watching || typeof Live === "undefined") return false;
    const pick = Live.pick, auto = Live.autoPick;
    Live.pick = function (key) {
      window.__sent.push({ t: Date.now(), kind: "pick", key: key });
      return pick.apply(Live, arguments);
    };
    Live.autoPick = function (key) {
      window.__sent.push({ t: Date.now(), kind: "auto", key: key });
      return auto.apply(Live, arguments);
    };
    window.__watching = true;
    return true;
  };

  /* A stand-in manager: picks on their own turn and never on anybody else's.

     Driven by the socket rather than by a timer, deliberately. A page that is
     not the front tab has its timers throttled to about once a minute, and a
     draft that stalls because of that is the harness failing, not the app. */
  window.__playAsHuman = function () {
    const act = function () {
      const room = Live.room();
      if (!room || room.status !== "drafting") return;
      const c = DraftEngine.onTheClock(room.league, room.picks.length);
      if (!c || c.slot !== room.yourSeat) return;
      const best = suggestions()[0];
      if (best) Live.pick(best.name);
    };
    Live.state().socket.addEventListener("message", act);
    act();
  };
}

/* The legacy setup screen — readSetup(), setupProblem(), #startBtn's own
   click handler — is unchanged and still what most of these tests exercise;
   it is only hidden now, in favour of the React lobby and settings modal
   (see CLAUDE.md's "setup screen" section). Playwright's real click() and
   selectOption() wait on visibility, which a deliberately display:none
   element never satisfies — a test that needs this exact mechanism (rounds,
   bench, starters: settings the new page does not expose) drives it via
   evaluate() instead, same as it always read/wrote these ids, just without
   the actionability wait. */
export function setLegacyField(page, id, value) {
  return page.evaluate(([id, value]) => {
    const el = document.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, value]);
}

export function clickLegacyStart(page) {
  return page.evaluate(() => document.getElementById("startBtn").click());
}

// Same reasoning, generalised: any id inside the hidden .setup or
// .appbar-inner subtrees (#homeBtn, #soundBtn, #themeBtn, ...) needs this
// rather than page.click(), which waits on visibility that is never coming.
export function clickHidden(page, id) {
  return page.evaluate((id) => document.getElementById(id).click(), id);
}

export async function openApp(context, path = "#/draft-room", opts = {}) {
  const page = await context.newPage();
  await page.addInitScript(instrumentation);
  await page.goto(`${SITE}/index.html${path}`);
  /* `state` is a top-level `const` in app.js, and `const` does not become a
     property of `window` — only `var` and an explicit assignment do. So it is
     checked unqualified, which resolves through the global scope the same way
     the app's own code does. Written as `window.state` this waits forever on
     a page that is working perfectly. */
  await page.waitForFunction(
    () => typeof state === "object" && typeof Live === "object" && typeof suggestions === "function");

  /* Then wait for the cold-load overlay to leave, because a person has to.

     #boot-sonar is fixed at z-index 9999 over the whole page and it takes
     input: `elementFromPoint` at the Start button's centre returns the
     overlay's own artwork, and `page.mouse.down()` on the bottom sheet's drag
     handle is swallowed outright. Handled here rather than per-test because it
     is not one test's problem — it is a property of every page load, and
     waiting for it is what makes a test's timing match a user's.

     **The predicate this replaces had stopped waiting for anything, and the
     reason is a reversal in the product rather than a mistake in the test.**
     It read `!document.documentElement.hasAttribute("data-standalone") ||
     !document.getElementById("boot-sonar")`, which was exactly right while the
     overlay was scoped to the installed app's cold launch: index.html hid it
     outright everywhere else, theme.js stamped `data-standalone` only under
     `matchMedia('(display-mode: standalone)')`, and a plain
     `browser.newContext()` never reports standalone — so the left side was
     true on the first tick and there was genuinely nothing to wait for.

     The owner then reversed that scoping (see index.html's own note: "an
     overlay restricted to installed users is an overlay almost nobody sees at
     all"). Breach plays on every cold load now, theme.js no longer stamps the
     attribute, and main.jsx's teardown runs unconditionally. Which left the
     left-hand side of that `||` permanently true against an overlay that had
     just stopped being inert: the predicate resolved on the first raf tick and
     openApp() handed back a page with five seconds of animation still over it.

     It surfaced as two phone.spec.mjs failures that read like app bugs —
     "nothing is sitting on top of the Start button" reporting the overlay's
     own artwork as the thing covering the button, and the bottom sheet
     refusing to grow on a tap — and both were the page being handed over too
     early. Measured on the Breach build: the button hit-tested as covered at
     600ms through 5000ms and was clickable from 6000ms.

     Deepwater moved that window forward by more than half. The overlay holds
     3100ms and is gone by ~3380 (3100 + a 260ms fade + the 280ms removal
     beat), which is the 3000-4200ms window sonar.spec.mjs asserts. It held
     2500 when it shipped; the extra 600ms is a beat on the finished mark,
     added after the owner watched the deployed site — see main.jsx.
     That is worth roughly three seconds on each of the ninety-six openApp()
     calls in this suite — several minutes of wall clock, and the largest
     single saving in it. Nothing about this wait had to change to collect it,
     which is the argument for having written it as a wait on the overlay's
     actual absence rather than on a duration.

     The ceiling is 6000ms, real headroom over that documented window rather
     than a hopeful number. If the overlay outstays it the element is removed
     rather than the wait failing: an overlay that never leaves is one bug and
     it is sonar.spec.mjs's to report, and a hard wait here would turn it into
     ninety-six timeouts in every other file instead — the same tolerance the
     predicate this replaces was written with.

     Tolerant of the overlay not existing at all, and that is now the common
     case rather than an edge one: splash-boot.js gates the splash to one play
     per session, so the second and later navigations inside a single browser
     context find no overlay and this resolves on the first tick. A spec that
     needs to watch it play needs a fresh context, which is what
     loadWithProbe() in sonar.spec.mjs does.

     `keepBootOverlay` is for sonar.spec.mjs alone, which measures the
     overlay's whole life from an init script and needs it left exactly as the
     app plays it. Tolerant of the overlay not existing at all, too: 404.html
     and the docs pages have no loader. */
  if (!opts.keepBootOverlay) {
    await page
      .waitForFunction(() => !document.getElementById("boot-sonar"), null, { timeout: 6000 })
      .catch(() => page.evaluate(() => {
        const el = document.getElementById("boot-sonar");
        if (el) el.remove();
      }).catch(() => {}));
  }

  await page.evaluate(() => window.__watchSends());
  return page;
}

/* Through the bridge rather than through #createRoomBtn.

   That button is in the legacy invite panel, which the full-bleed lobby no
   longer renders inline - "Draft with friends" is the settings modal's Invite
   tab now. Clicking it would mean opening a modal and switching a tab to set
   up a fixture, which is three interactions of ceremony before the thing
   under test. engine.createRoom() is what that button calls.

   Polled rather than slept on: a room is created when the worker answers, and
   how long that takes is the network's business.

   It waits for the host to be *seated*, not just for the code to exist, and
   that second condition is the whole point of this comment.

   codeInUrl() goes true the moment the worker answers with a code, because
   createRoom() writes the hash itself at that instant. The host's own seat
   arrives later, on the broadcast that follows their join. Between those two
   moments the room is real, reachable by its link, and seat 0 is still empty
   - and join() hands a new member the first free chair (freeSeat(), room.js).
   So a guest who got in during that window took the host's seat, and
   room.spec.mjs's "the guest is seat 1" failed with 0.

   Intermittent, and it read as a flake in the room rather than as a fixture
   handing out the code before it was safe to use. In life the window is
   unreachable: a person has to copy the link and send it, which is seconds,
   and the host is seated long before anyone clicks. A test hands the code
   straight to a second browser, so it hits the one race a human cannot.

   Returning "a room you are in" rather than "a code that exists" is what the
   callers all assumed they were getting anyway. */
export async function createRoom(page) {
  /* The board first, for the same reason startSoloDraft() waits on the
     Start button's own disabled state a few functions down.

     `JukeEngine.createRoom()` opens with `if (setupProblem()) return null`,
     and setupProblem() answers "the board is loading" until players.js and
     stats.js land — they are deferred behind the cold-load reveal, and
     stats.js alone is 769KB. So a caller that creates a room the instant
     openApp() resolves can be refused outright, and the refusal is a bare
     null: the poll below then spends its full 30 seconds waiting for a code
     that was never going to exist, and the caller reports "a room was
     created" as false. Nothing in that names the board.

     Measured in a sandbox where a render-blocking font request stalls the
     reveal, which is what made it reproducible: phone.spec.mjs's entry-screen
     test failed this way on every run, with the worker up and answering. */
  await page.waitForFunction(
    () => typeof dataReady === "function" && dataReady(),
    null,
    { timeout: 30000 },
  );
  return page.evaluate(async () => {
    window.JukeEngine.createRoom();
    for (let i = 0; i < 120 && !window.JukeEngine.codeInUrl(); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const seated = () => {
      const room = typeof Live !== "undefined" && Live.room();
      return !!room && room.yourSeat >= 0;
    };
    for (let i = 0; i < 120 && !seated(); i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    return window.JukeEngine.codeInUrl();
  });
}

/* The real path from a cold Locker to a running solo draft, through every
   screen a person actually passes through — this used to be a handful of
   near-identical copies, one per spec file, and today's own Locker
   consolidation (NewMockPanel.jsx replacing LobbyBar's old "Enter Draft
   Room" button with a single "Start mock draft" launcher, to fix a
   two-primaries bug) broke every one of them at once: each copy still
   only looked for "Enter Draft Room" — now dead text nothing renders —
   before jumping straight to "start draft"/"start for everyone", with no
   step in between for the button that actually launches a mock now.
   That's the same "second copy that drifted" failure this project's own
   code has a rule against; the fix is one helper, not seven patches.

   Playwright locators rather than a one-shot page.evaluate() query, on
   purpose: `.click()` on a text locator auto-waits for the button to
   exist and be actionable, where the old evaluate()-based check ran once,
   synchronously, and reported "no button" the instant it was a render
   frame early rather than actually wrong.

   Every step is optional except the last, checked by count() rather than
   assumed present — a page that starts already past the Locker (a room,
   or a test driving a second client) simply won't have "Start mock
   draft" to click, the same way it might not have "Enter Draft Room". */
export async function startSoloDraft(page) {
  const enter = page.locator('#draftroom-root button:text-is("Enter Draft Room")');
  if (await enter.count()) await enter.click();

  // Checked before clicking, not inferred from the click failing to start
  // a draft afterward — a disabled button and a missing one are different
  // facts, and only one of them is "this league configuration is invalid".
  // A thrown Error rather than an expect(): this file's own opening
  // comment is what the tests need from a page, not what they assert, and
  // waitForRoom() below already sets the precedent for surfacing "the
  // condition was never satisfied" this way instead.
  //
  // This check used to live on the Start button below, and had to move up
  // here with the behaviour: the Lobby's "Start mock draft" now starts the
  // draft outright, so it is the control that refuses an illegal league
  // (15 rounds against a 14-slot roster, say) and there is no second
  // button left to ask.
  /* [data-start-draft], not the label, and the rename that forced it is
     the fourth one this control has had. It was matched here as the exact
     string "Start mock draft", which is DraftLocker's own wording -- and
     design_handoff_v3_alive made DraftRoomEntry the Lobby at EVERY width,
     whose button reads "Start a mock draft". One word, five specs, and the
     failure surfaces at `waitForFunction(() => state.started)` fifteen
     seconds later rather than at the click, so nothing in the output names
     the button at all.

     Both real Start buttons carry the attribute (DraftRoomEntry and
     NewMockPanel), which is what CLAUDE.md's own rule already says to
     anchor on: an attribute says what a control IS, a label says what it
     currently reads. The `.first()` is because a room can have this
     screen's Start and NewMockPanel's on the page together. */
  const startMock = page.locator('#draftroom-root [data-start-draft]').first();
  if (await startMock.count()) {
    /* Wait for the board before asking whether the button is enabled.

       setupProblem() refuses a draft while the board is still loading, and
       it is right to: players.js and stats.js are deferred, stats.js alone
       is 769KB, and a draft genuinely cannot start without them. Locally
       they are there almost immediately. Against production they are a real
       download over a real network, so this raced them — and the throw
       below reported "the Start button refused this league", which reads as
       an illegal league configuration and is nothing of the kind.

       It surfaced as a different test failing on each run, because whichever
       one happened to lose the race is the one that reported: board-card and
       record on one production run, grade and juke-score on the next, none
       of them locally, ever. That is what made it look like flake instead of
       one shared cause.

       Waited on the button rather than on dataReady(), because the button is
       what this function is about to press and the engine landing is only
       one of the reasons it might be disabled. Bounded and then re-checked,
       so a genuinely illegal league still falls through to the throw with
       its own accurate message rather than being reported as a timeout. */
    await startMock.waitFor({ state: "attached" });
    await page
      .waitForFunction(
        () => {
          const b = document.querySelector("#draftroom-root [data-start-draft]");
          return !!b && !b.disabled;
        },
        null,
        { timeout: 20000 },
      )
      .catch(() => {});
    if (!(await startMock.isEnabled())) throw new Error("the Start button refused this league");
    await startMock.click();
  }

  // Optional, like every step above it, and it did not use to be. A room
  // still has a real second Start ("Start for everyone", host-only), so
  // this stays rather than being deleted — but a solo draft is already
  // started by the time it gets here, and the locator then matches
  // nothing.
  //
  // count() rather than isEnabled() is the whole fix. No actionTimeout is
  // set in playwright.config.mjs, so isEnabled() on a locator matching
  // nothing waits for ever instead of returning false, and every spec
  // that drives a draft — grade, journey, solo — sat here until the
  // 6-minute test timeout killed it. A hang, not an assertion: nothing in
  // the output named this line, and the app was fine throughout.
  const startBtn = page.locator('#draftroom-root >> text=/Start for everyone|Start draft/');
  if (await startBtn.count()) {
    if (!(await startBtn.isEnabled())) throw new Error("the Start button refused this league");
    await startBtn.click();
  }
  await page.waitForFunction(() => state.started, null, { timeout: 15000 });

  /* And then wait for the room to actually be on screen, which is a
     different fact from the draft having started.

     state.started flips synchronously inside engine.startDraft(), while
     DraftRoom.jsx holds a full-viewport DraftRoomLoader over the room for a
     floor of its own before rendering anything. So a caller that starts a
     draft and then reads #draftroom-root is reading the loader — "Entering
     draft roomSeating 12 teams" — not the room.

     deep-board.spec.mjs found this the moment that floor moved from 1600ms
     to 2400: it waited a flat 2000ms after starting and asked whether the
     Players table carried its "Real ADP ends here" divider. The divider was
     fine; the table simply had not been drawn yet, and the test reported it
     as missing. At 3500ms it was there.

     Waiting for the loader to leave rather than for a duration is the same
     rule phone.spec.mjs already follows — and the reason it belongs here
     rather than in that one spec is that the duration was never the thing
     any caller cared about. A number in a spec is a number that has to be
     found and changed every time this floor moves; this does not. */
  await page
    .waitForFunction(() => !document.querySelector("[data-draft-loader]"), null, { timeout: 20000 })
    .catch(() => {});
}

export function roomView(page) {
  return page.evaluate(() => {
    const room = Live.room();
    return room && {
      status: room.status,
      picks: room.picks.length,
      yourSeat: room.yourSeat,
      isHost: room.isHost,
      seats: room.seats
    };
  });
}

export function sent(page) {
  return page.evaluate(() => ({
    all: window.__sent,
    rejects: window.__rejects,
    picks: window.__sent.filter((s) => s.kind === "pick").length,
    autos: window.__sent.filter((s) => s.kind === "auto").length
  }));
}

// Polls the worker rather than a page, so it is not fooled by one client
// having a stale view of a room that has moved on without it.
export async function waitForRoom(request, code, predicate, timeoutMs = 5 * 60 * 1000) {
  const until = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < until) {
    const res = await request.get(`${WORKER_HTTP}/room/${code}/state`);
    if (res.ok()) {
      last = await res.json();
      if (predicate(last)) return last;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`room ${code} never satisfied the condition; last seen: ` +
                  JSON.stringify(last && { status: last.status, picks: last.picks.length }));
}

export function pickGaps(picks) {
  const ts = picks.map((p) => p.at);
  return ts.slice(1).map((t, i) => t - ts[i]);
}

export function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function perSeat(picks) {
  return picks.reduce(function (o, p) { o[p.slot] = (o[p.slot] || 0) + 1; return o; }, {});
}
