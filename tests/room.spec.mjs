/* A shared draft, with two managers, run to the end.

   This is the test the project did not have. Solo drafts had been driven to
   completion since the beginning; a room never had, and the difference was a
   draft that deadlocked at pick 86 in front of two real people. Everything
   below exists because something in it was once broken and nothing said so.

   ---- and what the cutover changed in it ----

   Two things, and neither is a new idea.

   The ADDRESSES moved. A room is `#/draft/live?room=<code>` now, and the
   launcher a host starts from is `#/draft`. Every older shape still works —
   canonicalHash() in app.js redirects them — which is exactly why this file
   drives the canonical ones almost everywhere: a suite that exercises a
   redirect is testing the redirect rather than the room. The one deliberate
   exception is kept and labelled below.

   The SELECTORS moved with the screen. `#draftroom-root` is empty on every
   route now — v3 renders into `#root` — so a locator scoped to it matches
   nothing, `count()` is 0, and every optional step is skipped in silence.
   What replaced the old label matches is `[data-start-room]`, `[data-leave-room]`
   and the room's own accessible names: an attribute says what a control IS,
   a label says what it currently reads, and this pair of controls has now
   survived five renames on that rule.

   What has NOT changed is what the file is actually about: whether ten
   chairs got filled by the right two clients. That question is answered by
   what each socket sent, not by what either page happened to draw, so the
   room's own state is still read through Live.
*/

import { test, expect } from "@playwright/test";
import { openApp, createRoom, roomView, sent, waitForRoom, pickGaps, median, perSeat }
  from "./helpers.mjs";

/* Start the room, from the host's own lobby.

   RoomLobby.jsx's Start carries [data-start-room] and reads "Start for
   everyone"; it is the host's alone (startBlocker refuses everybody else),
   and the transition off that screen hangs off the room's broadcast rather
   than off the button — so the wait below is on the room's status and not on
   anything this page drew.

   There is no "Enter Draft Room" step in front of it any more. createRoom()
   (helpers.mjs) goes through the engine bridge, which sets the hash itself
   and lands on the room's own lobby through canonicalHash(); the host is
   already on the screen the button is on. */
async function startRoomDraft(page) {
  await page.locator("[data-start-room]:visible").first().click({ timeout: 30000 });
  await page.waitForFunction(() => Live.room() && Live.room().status === "drafting",
    null, { timeout: 20000 });
}

/* The autopick toggle. In a room this is engine.toggleRoomAutopilot(), which
   is one pick per turn on your own chair - never the whole board. The legacy
   button carried the promise in its label ("Auto-draft my picks", and "the
   rest" only when solo); v3's control is kit.jsx's Switch — role="switch"
   with "Autopick" as its accessible name — so the promise is asserted where
   it now lives.

   Asked by ROLE rather than by an attribute, because that is what this
   control genuinely is: a switch named Autopick is a fact about the element,
   and role+name is the one selector that survives the label being restyled,
   moved between the header and the menu, or drawn with its text hidden
   (LiveMenu renders it hideLabel, which is why the name has to come from the
   accessible name rather than from textContent). */
function autopickSwitch(page) {
  return page.getByRole("switch", { name: /autopick/i }).first();
}

async function toggleAutopick(page) {
  const before = await page.evaluate(() => !!JukeEngine.autoMe());
  await autopickSwitch(page).click();
  await page.waitForFunction((was) => !!JukeEngine.autoMe() !== was, before, { timeout: 10000 });
}

async function twoManagers(browser) {
  const hostCtx = await browser.newContext();
  // #/draft is v3's draft home — the launcher. createRoom() moves the host on
  // to #/draft/live?room=<code> itself.
  const host = await openApp(hostCtx, "#/draft");
  const code = await createRoom(host);

  const guestCtx = await browser.newContext();
  const guest = await openApp(guestCtx, `#/draft/live?room=${code}`);
  await guest.waitForFunction(() => Live.room() && Live.room().yourSeat >= 0);

  return { hostCtx, host, guestCtx, guest, code };
}

test("a full room draft finishes, and nobody drafts for anybody else", async ({ browser, request }) => {
  const { hostCtx, host, guestCtx, guest, code } = await twoManagers(browser);

  expect((await roomView(host)).isHost).toBe(true);
  expect((await roomView(guest)).isHost).toBe(false);
  expect((await roomView(guest)).yourSeat).toBe(1);

  // The guest is a person who picks for themselves; the host asks for its own
  // chair to be played. Between them that is two seats, and the CPU has eight.
  await guest.evaluate(() => window.__playAsHuman());
  await startRoomDraft(host);
  await host.waitForFunction(() => Live.room().status === "drafting");

  /* The promise the legacy label made in words, asserted where it lives now:
     off, then on, and what it turns on is one pick per turn on the host's own
     chair. The proof that it is not drafting the whole board is further down
     - hostSent.picks is 14, one per round, and every other seat arrives as an
     auto pick the host submits on the room's behalf. */
  expect(await host.evaluate(() => !!JukeEngine.autoMe()), "off to begin with").toBe(false);
  await toggleAutopick(host);
  expect(await host.evaluate(() => !!JukeEngine.autoMe()), "and on after one press").toBe(true);

  const final = await waitForRoom(request, code, (r) => r.status === "done");

  // ---- the board itself ----
  expect(final.picks.length).toBe(140);
  expect(new Set(final.picks.map((p) => p.key)).size, "no player twice").toBe(140);
  expect(Object.values(perSeat(final.picks)).every((n) => n === 14), "fourteen a team").toBe(true);
  expect(final.picks.slice(0, 20).map((p) => p.slot))
    .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

  const hostSent = await sent(host);
  const guestSent = await sent(guest);

  /* The assertion this whole file is for.

     Auto-drafting once filled in all ten teams, including two managers who
     were sitting there with the app open. Counting what each client sent —
     and checking it adds up to the board — is what catches that, and it does
     not depend on noticing anything on a screen. */
  expect(guestSent.all.length, "the guest sent one pick per round, for itself").toBe(14);
  expect(guestSent.autos, "a guest never sends an auto pick").toBe(0);
  expect(hostSent.picks, "the host's own chair, on autopilot").toBe(14);
  expect(hostSent.autos, "the host covers the eight empty chairs").toBe(112);
  expect(hostSent.all.length + guestSent.all.length, "and together, the whole board").toBe(140);

  /* Nothing was refused.

     A room can reject half of what a client sends and look perfectly healthy
     until it stops. `too-fast` here means the host has outrun the worker's
     rate limit, which is how the deadlock began. */
  expect(hostSent.rejects, "the host was refused nothing").toEqual([]);
  expect(guestSent.rejects, "the guest was refused nothing").toEqual([]);

  /* And it was paced. A median under 100ms is not a fast draft, it is a
     client in a loop, and it will find the rate limiter eventually. */
  const gaps = pickGaps(final.picks);
  expect(median(gaps), "picks are paced, not looping").toBeGreaterThan(100);

  await hostCtx.close();
  await guestCtx.close();
});

test("a dropped socket comes back on its own, and the chair comes with it", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest } = await twoManagers(browser);

  await startRoomDraft(host);
  await host.waitForFunction(() => Live.room().status === "drafting");

  // What a phone does when the browser stops being the front app.
  await guest.evaluate(() => Live.state().socket.close());

  // While it is down, nothing pretends otherwise.
  /* What is asserted here is the fact every control on the screen is reading:
     the socket is down while the room is not. Both halves matter. "In a room"
     is Live.room() and "the socket is up right now" is Live.active(), and the
     start button once asked the wrong one - which is how a dropped socket
     started a *solo* draft on the host's phone while everybody else waited.

     v3 says so on screen now (sendBlocker() in live/room.js, drawn by
     LiveHeader as a status chip and by RoomLobby as a Problem), which is a
     rendering of exactly this pair — so the pair is what is asserted, and a
     screen check would be a second reading of one fact.

     Both facts are read in ONE round trip, at the instant the wait resolves,
     rather than as two separate expect(await guest.evaluate(...)) calls. That
     used to be two more trips across the Playwright/browser boundary after
     the wait already caught "down" - and live.js is built to reconnect as
     fast as it possibly can (immediate retry, plus visibilitychange/online/
     pageshow), so against the real worker the gap between "down" and "back
     up" is sometimes shorter than two extra round trips. The failure this
     produced was not a flake in the ordinary sense: Live.room() still read
     true and Live.active() had already flipped back to true by the second
     evaluate(), because the very thing being asserted absent had, correctly,
     already stopped being absent. Sampling a transient state across multiple
     hops to the browser is the bug; the fix is to sample it once. */
  const downState = await guest
    .waitForFunction(() => (Live.active() ? null : { inRoom: !!Live.room(), active: Live.active() }),
      null, { timeout: 10000 })
    .then((h) => h.jsonValue());
  expect(downState.inRoom, "still in the room").toBe(true);
  expect(downState.active, "but the socket is down").toBe(false);

  await guest.waitForFunction(() => Live.status() === "open", null, { timeout: 30000 });

  const view = await roomView(guest);
  expect(view.seats[view.yourSeat].taken, "the chair is still theirs").toBe(true);
  expect(view.seats[view.yourSeat].auto, "and the CPU has stopped picking for them").toBe(false);
  await guest.waitForFunction(() => Live.active(), null, { timeout: 20000 });
  expect(await guest.evaluate(() => Live.active()), "and it comes back on its own").toBe(true);

  // Coming back is not arriving, so it is not announced as one.
  const arrivals = await guest.evaluate(() =>
    Live.room().chat.filter((m) => m.system && /took seat/.test(m.text || "")).length);
  expect(arrivals, "one arrival line per manager, not one per reconnection").toBe(2);

  await hostCtx.close();
  await guestCtx.close();
});

test("the start button will not start a solo draft on top of a room", async ({ browser }) => {
  const { hostCtx, host, guestCtx } = await twoManagers(browser);

  await host.evaluate(() => { Live.state().wanted = false; Live.state().socket.close(); });
  await host.waitForFunction(() => Live.status() !== "open");

  /* The control the host is actually looking at, rather than the legacy
     #startBtn this used to read.

     The bug it guards is unchanged and is worth restating, because the
     screen it happened on is gone and the failure is not: with a dropped
     socket, inRoom() is false while hasRoom() is true, and a start button
     that asked the first fell through to the branch below it — which starts
     a SOLO draft, on the host's phone, against CPUs, while nine people sat
     on "Waiting for the host". So the refusal has to be visible AND nothing
     may begin locally even if a click gets through.

     RoomLobby's Start is disabled by startBlocker(), which returns
     sendBlocker()'s sentence while the socket is down. Asserting the button
     is disabled is the half a person sees; the evaluate() below is the half
     that would have caught the solo draft. */
  const start = host.locator("[data-start-room]:visible").first();
  await expect(start, "the room's own Start is on this screen").toHaveCount(1);
  await expect(start).toBeDisabled();
  await expect(host.getByText(/Reconnecting to the room/i).first(),
    "and says why, rather than being a grey nobody reads").toBeVisible();

  // Even if the click gets through, nothing local may begin.
  await host.evaluate(() => {
    const b = document.querySelector("[data-start-room]");
    if (b) b.click();
  });
  expect(await host.evaluate(() => state.started), "no draft started behind the room's back").toBe(false);

  await hostCtx.close();
  await guestCtx.close();
});

test("leaving the draft leaves the room, and the link brings you back", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest, code } = await twoManagers(browser);

  await guest.evaluate(() => window.__playAsHuman());
  await startRoomDraft(host);
  await host.waitForFunction(() => Live.room().status === "drafting");
  /* 90s, explicitly, because this wait is longer than any default and always
     was - it just never said so and inherited whatever the global happened
     to be.

     The host is seat 0 (the guest asserts seat 1 above), the guest is playing
     as a human, and this test never turns the host's autopick on. So nobody
     picks first: the opening pick of the room only lands when the host's own
     60s clock (clockLength, app.js) runs out and the room takes the seat. A
     30s wait cannot reach that, and 30s is Playwright's own default - so this
     was a coin flip on timing rather than a wait sized for what it waits for,
     and it failed twice in three runs once anything nudged it.

     The test does not care *which* pick exists, only that one does before
     goHome() - so waiting out the clock is the honest cost, not something to
     engineer around by giving the host autopick, which would quietly change
     the scenario being tested. */
  await host.waitForFunction(() => Live.room().picks.length > 0, null, { timeout: 90000 });

  await host.evaluate(() => goHome());

  expect(await host.evaluate(() => Live.status()), "the room was actually left").toBe("off");
  /* #/draft, which is where goHome() itself sends a tab carrying a room code
     (app.js: `if (location.hash.indexOf("room=") >= 0) location.hash = "#/draft"`)
     and is v3's draft home rather than a redirect to one.

     This asserted "#/draft-room" until the cutover, which was the retired
     React room's own address. Read off app.js rather than guessed: the point
     of the assertion is that the CODE is out of the address, so that a reload
     lands on the launcher instead of walking straight back into the room. */
  expect(await host.evaluate(() => location.hash), "and the code is out of the address").toBe("#/draft");

  // The bug was being dragged back by the next broadcast a moment later.
  await host.waitForTimeout(6000);
  expect(await host.evaluate(() => state.started), "still on the launcher").toBe(false);

  // The way back in is the link, and it arrives as a hash change on a tab
  // that is already on the site — which is the case that used to do nothing.
  await host.evaluate((c) => { location.hash = `#/draft/live?room=${c}`; }, code);
  await host.waitForFunction(() => Live.status() === "open", null, { timeout: 30000 });

  const back = await roomView(host);
  expect(back.isHost, "still the host").toBe(true);
  expect(back.seats[back.yourSeat].auto, "chair reclaimed from the CPU").toBe(false);
  expect(await host.evaluate(() => state.started), "and back in the draft").toBe(true);

  await hostCtx.close();
  await guestCtx.close();
});

/* Everything the room gained after a real draft went wrong, checked with two
   managers rather than one page and a stubbed room.

   Each of these was reported from that draft: the setup screen still showed
   the settings of a room you had made yourself, a guest could edit a league
   they had joined, the clock was invisible to nine people out of ten, and
   Pause, Undo and "Discard draft" were on screen for everybody. They were
   fixed against a fake room object; this is the first time two clients have
   disagreed about any of it. */
test("a room belongs to its host, and says so to everybody in it", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const host = await openApp(hostCtx, "#/draft");
  // A room is named after its host, so the host has to be called something.
  await host.evaluate(() => Live.setName("Blake"));
  const code = await createRoom(host);

  const guestCtx = await browser.newContext();
  /* THE ONE OLD INVITE SHAPE, ON PURPOSE — do not modernise this line.

     It used to be kept because #/draft-room?room= was what every invite ever
     sent looked like and the retired-route redirect had to carry the query.
     It is kept now for the same reason one layer along: this is the only
     thing in the suite that drives canonicalHash()'s invite branch end to
     end, from a cold page load, the way a phone holding a link from last
     week does. `#/draft-room?room=<code>` has to land on #/draft/live with
     the code intact — drop the query and a guest arrives at an empty draft
     home instead of in the draft they were invited to, and nothing on screen
     says why.

     Every other join in this file is canonical, deliberately: a suite that
     exercises a redirect everywhere is a suite that has stopped testing the
     room. One is the regression net; two is an accident. */
  const guest = await openApp(guestCtx, `#/draft-room?room=${code}`);
  await guest.waitForFunction(() => Live.room() && Live.room().yourSeat >= 0);
  expect(await guest.evaluate(() => location.hash), "the old invite shape is redirected, code and all")
    .toBe(`#/draft/live?room=${code}`);

  /* ---- the room is named, on both screens ----
     RoomLobby draws `${hostName}'s draft room` as its headline, off the
     room's own broadcast, so the guest learns the name from the room rather
     than from the host's browser. Polled on the guest because the name
     arrives with a broadcast rather than with the page. */
  await expect(guest.getByText(/Blake's draft room/i).first()).toBeVisible({ timeout: 30000 });
  await expect(host.getByText(/Blake's draft room/i).first()).toBeVisible();

  /* ---- the league is locked, and not only the five obvious controls ----
     Every one of these runs refreshSetup() -> buildBoard(), so an unlocked one
     is a guest quietly rebuilding their own board out from under the draft.

     Read off the legacy controls deliberately, and they are still the real
     mechanism: LOCKABLE and the #scoringFields sweep are what app.js
     disables when a room exists, and v3's own settings drawer refuses on
     top of them (SettingsDrawer's `locked`). These are hidden elements, not
     retired ones — app.js writes to them on every render — so this asserts
     the engine's own lock rather than one screen's drawing of it, which is
     the same split appbar.spec.mjs already relies on. */
  const locks = (page) => page.evaluate(() => ({
    teams: document.getElementById("teamCount").disabled,
    rounds: document.getElementById("roundCount").disabled,
    scoring: document.getElementById("scoring").disabled,
    lineup: document.getElementById("startTE").disabled,
    bench: document.getElementById("benchCount").disabled,
    /* The settings panel refuses as a whole rather than field by field, and
       it refuses from the moment a room exists rather than only once
       drafting has begun - a guest who reshapes the league in a lobby
       rebuilds their own board out from under the draft they are in, and
       nothing on screen would say so. */
    rule: !!(window.Live && Live.room()),
    reset: document.getElementById("resetScoring").disabled
  }));
  const allLocked = { teams: true, rounds: true, scoring: true, lineup: true,
                      bench: true, rule: true, reset: true };
  expect(await locks(guest), "a guest may not reshape the league").toEqual(allLocked);
  // The host too: the wobble reads board position and every client has to agree.
  expect(await locks(host), "nor may the host, once the room exists").toEqual(allLocked);

  // ---- draft order is the host's ----
  const seatNames = (page) =>
    page.evaluate(() => Live.room().seats.map((s) => s.name));
  expect(await seatNames(guest)).toEqual(["Blake", null, null, null, null,
                                          null, null, null, null, null]);

  await guest.evaluate(() => Live.swapSeats(0, 1));
  await guest.waitForTimeout(1200);
  expect(await guest.evaluate(() => Live.room().yourSeat),
    "a guest cannot move itself up the order").toBe(1);

  await host.evaluate(() => Live.swapSeats(0, 1));
  await expect.poll(() => host.evaluate(() => Live.room().yourSeat)).toBe(1);
  expect(await guest.evaluate(() => Live.room().yourSeat),
    "and the other client agrees about where it now sits").toBe(0);

  // ---- start, and check what a draft looks like from the guest's chair ----
  await startRoomDraft(host);
  await guest.waitForFunction(() => Live.room().status === "drafting");
  await guest.waitForFunction(() => state.started === true);

  // Seat 0 is the guest now, so make it somebody else's turn.
  await guest.evaluate(() => draftAndAdvance(suggestions("ALL")[0]));
  await guest.waitForFunction(() => !isMyTurn());

  const watching = await guest.evaluate(() => ({
    myTurn: isMyTurn(),
    showing: clockShowing(),
    // The display question and the authority question are different, and the
    // page used the second to answer the first.
    counting: clockRunnable()
  }));
  expect(watching.myTurn).toBe(false);
  expect(watching.showing, "a clock the whole room is waiting on is drawn").toBe(true);
  expect(watching.counting, "but this browser never counts it").toBe(false);

  /* And it really is drawn, on the screen the guest is looking at.

     LiveHeader's ClockReadout is a role="timer" whose accessible name is the
     countdown itself ("0:47 left"), which is the one place the number is
     stated rather than styled — the legacy #rightLabel/#rightValue pair this
     used to read is hidden markup now. A real countdown, not a dash, is the
     assertion: nine managers out of ten once watched a clock they could not
     see, and an empty timer is indistinguishable from that. */
  await expect(guest.getByRole("timer").first())
    .toHaveAttribute("aria-label", /^\d+:\d\d left/);

  // ---- what a guest is not offered ----
  /* Read out of the draft menu, which is where v3 puts the things you can do
     to a draft. Each of these is absent rather than disabled, which is this
     project's own rule: a control that cannot act must not merely fail.

     The menu is opened first and asserted OPEN before anything is asserted
     absent — an absence means nothing if the thing it is absent from never
     rendered, which is the vacuity trap this suite has now shipped three
     times. "Leave the room" is the item that is always there in a room, so
     it is both the proof the menu is up and one of the assertions. */
  const openMenu = async (page) => {
    await page.locator('button[aria-label="Draft menu"]:visible').first().click();
    await expect(page.getByRole("dialog", { name: /draft menu/i })).toBeVisible();
  };
  await openMenu(guest);
  const guestMenu = guest.getByRole("dialog", { name: /draft menu/i });
  await expect(guestMenu, "the label says what the button does").toContainText(/Leave the room/i);
  await expect(guestMenu, "pausing a shared clock is the host's").not.toContainText(/Pause the clock/i);
  await expect(guestMenu, "there is no shared undo").not.toContainText(/Take back my last pick/i);
  await expect(guestMenu, "and \"the rest\" in a room is nine other people's teams")
    .not.toContainText(/End draft/i);
  await guest.keyboard.press("Escape");

  await openMenu(host);
  await expect(host.getByRole("dialog", { name: /draft menu/i }), "the host keeps the pause")
    .toContainText(/Pause the clock/i);
  await host.keyboard.press("Escape");

  // ---- pausing is a message, not a local flag ----
  await host.evaluate(() => togglePause());
  await expect.poll(() => guest.evaluate(() => Live.room().paused),
    { message: "the room pauses for everyone" }).toBe(true);
  expect(await guest.evaluate(() => state.paused)).toBe(true);
  await host.evaluate(() => togglePause());
  await expect.poll(() => guest.evaluate(() => Live.room().paused)).toBe(false);

  await hostCtx.close();
  await guestCtx.close();
});

/* ---- and the one assertion that has no v3 equivalent ----

   It read: in a room, the Players table draws no Value/Reach chip, because
   the app reading the board for you before you commit is right in a solo
   mock and is scouting for nine other managers in a shared one. It was
   asserted by counting `#playerTable .chip.val, #playerTable .chip.reach`,
   which is the legacy board — unreachable on every route since the cutover.

   v3's pool (live/Pool.jsx) draws no such chip AT ALL, in a room or solo:
   its columns are points, VORP, the Juke score and survival, through
   playerColumns.js. So there is nothing to suppress and nothing to count,
   and a rewritten version of this check would pass against a screen that
   had never had the feature — a zero that means "not built" wearing the
   clothes of a zero that means "correctly withheld".

   Skipped rather than deleted, and skipped rather than quietly rewritten,
   because the RULE is still live: if a per-player read of the board ever
   lands on the pool, it may not be drawn to a room. This is the line that
   says so. */
test.skip("the board is not scouting for the room", () => {});
