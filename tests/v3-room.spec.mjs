/* Drafting with friends, in v3, run to the end.

   room.spec.mjs is this file's model and most of its reasoning belongs to it
   — everything here exists because something in a shared draft was once
   broken and nothing said so. What is different is only which screen the
   clicks land on: v3 draws the lobby, the room and the chat itself now
   (#/v3/draft/live?room=CODE) rather than handing a room to the classic
   Draft Room, and every one of those controls goes through the SAME
   live.js/room.js protocol. So this asserts the protocol is still the one
   being used, not that a second one works.

   ---- A member is a context, not a tab ----

   Two tabs on one origin share localStorage and therefore `juke.member`, and
   the room correctly treats them as one manager with two sockets — which
   tests nothing about a second person. A Playwright context has its own
   storage, which is the property the "use two origins" instruction is a
   proxy for, so it is asserted directly below rather than trusted.

   ---- What is read off the screen, and what is not ----

   Every control is pressed the way a person presses it. What each client
   SENT is read off the socket instrumentation rather than off the page,
   because the question this file is really about — did anybody draft for
   anybody else — is answered by what went down the wire and not by what
   either page happened to draw. */

import { test, expect } from "@playwright/test";
import { openApp, roomView, sent, waitForRoom, pickGaps, median, perSeat } from "./helpers.mjs";

const LAUNCHER = "#/v3/draft";
const ROOM = "#/v3/draft/live";

/* The launcher's own Create button, and then the two facts that make a room
   usable rather than merely existing.

   The code goes true the instant the worker answers, because createRoom()
   writes the hash at that moment. The host's own SEAT arrives later, on the
   broadcast after their join — and between those two moments the room is
   real, reachable by its link, and seat 0 is still empty, so a guest who got
   in during that window would take the host's chair. helpers.mjs's own
   createRoom() records that race; this is the same wait for the same reason,
   pressed through v3's button rather than through the bridge. */
async function createRoom(page) {
  await page.waitForFunction(() => typeof dataReady === "function" && dataReady(), null, { timeout: 30000 });
  await page.click("[data-create-room]");
  await page.waitForFunction(
    () => { const r = typeof Live !== "undefined" && Live.room(); return !!r && r.yourSeat >= 0 },
    null, { timeout: 30000 });
  const code = await page.evaluate(() => Live.codeInUrl());
  // The address is v3's own, not the classic room's. createRoom() sets the
  // classic hash as its last act and live/room.js corrects it inside the
  // same task — if that ever stopped working the tab would have navigated
  // out of v3 entirely, which is the failure this line catches.
  expect(page.url(), "the host stays in v3").toContain(`${ROOM}?room=${code}`);
  return code;
}

async function twoManagers(browser) {
  const hostCtx = await browser.newContext();
  const host = await openApp(hostCtx, LAUNCHER);
  const code = await createRoom(host);

  const guestCtx = await browser.newContext();
  const guest = await openApp(guestCtx, `${ROOM}?room=${code}`);
  await guest.waitForFunction(() => Live.room() && Live.room().yourSeat >= 0, null, { timeout: 30000 });

  // Two people, not one person twice — the whole reason these are contexts.
  const ids = await Promise.all([host, guest].map((p) => p.evaluate(() => Live.memberId())));
  expect(ids[0], "two managers, two member ids").not.toBe(ids[1]);

  return { hostCtx, host, guestCtx, guest, code };
}

async function startRoomDraft(host) {
  await host.click("[data-start-room]");
  await host.waitForFunction(() => Live.room() && Live.room().status === "drafting", null, { timeout: 20000 });
}

/* The autopick switch in the live header. In a room it is
   engine.toggleRoomAutopilot() — one pick per turn on your own chair, never
   the whole board — so the promise is asserted where the control now is. */
function autopickSwitch(page) {
  return page.locator('button[role="switch"]').filter({ hasText: /Autopick/i }).first();
}

async function toggleAutopick(page) {
  const before = await page.evaluate(() => !!JukeEngine.autoMe());
  await autopickSwitch(page).click();
  await page.waitForFunction((was) => !!JukeEngine.autoMe() !== was, before, { timeout: 10000 });
}

test("a full v3 room draft finishes, and nobody drafts for anybody else", async ({ browser, request }) => {
  const { hostCtx, host, guestCtx, guest, code } = await twoManagers(browser);

  // The lobby is a screen, not a redirect: the seats, the invite and the
  // host's Start are all here, and a guest is offered none of the last one.
  await expect(host.locator("[data-invite-link]")).toHaveValue(new RegExp(`${ROOM.replace(/[#/?]/g, "\\$&")}\\?room=${code}$`));
  await expect(host.locator("[data-start-room]")).toHaveCount(1);
  await expect(guest.locator("[data-start-room]"), "a guest is not offered Start").toHaveCount(0);

  expect((await roomView(host)).isHost).toBe(true);
  expect((await roomView(guest)).isHost).toBe(false);
  expect((await roomView(guest)).yourSeat, "the guest takes the next free chair").toBe(1);

  // The guest is a person who picks for themselves; the host asks for its own
  // chair to be played. Between them that is two seats, and the CPU has eight.
  await guest.evaluate(() => window.__playAsHuman());
  await startRoomDraft(host);

  // Everybody moves off the lobby on the BROADCAST, not on the button: the
  // guest never pressed anything and is on the board all the same.
  await guest.waitForFunction(() => Live.room().status === "drafting", null, { timeout: 20000 });
  await expect(guest.locator('[role="tablist"][aria-label="Draft views"]')).toHaveCount(1);

  expect(await host.evaluate(() => !!JukeEngine.autoMe()), "off to begin with").toBe(false);
  await toggleAutopick(host);
  expect(await host.evaluate(() => !!JukeEngine.autoMe()), "and on after one press").toBe(true);

  const final = await waitForRoom(request, code, (r) => r.status === "done");

  // ---- the board itself ----
  expect(final.picks.length).toBe(140);
  expect(new Set(final.picks.map((p) => p.key)).size, "no player twice").toBe(140);
  expect(Object.values(perSeat(final.picks)).every((n) => n === 14), "fourteen a team").toBe(true);
  expect(final.picks.slice(0, 20).map((p) => p.slot), "the snake, intact")
    .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

  const hostSent = await sent(host);
  const guestSent = await sent(guest);

  /* The assertion this whole file is for. Auto-drafting once filled in all
     ten teams locally, two of them people sitting there with the app open;
     counting what each client sent, and checking it adds up to the board, is
     what catches that without depending on noticing anything on a screen. */
  expect(guestSent.all.length, "the guest sent one pick per round, for itself").toBe(14);
  expect(guestSent.autos, "a guest never sends an auto pick").toBe(0);
  expect(hostSent.picks, "the host's own chair, on autopilot").toBe(14);
  expect(hostSent.autos, "the host covers the eight empty chairs").toBe(112);
  expect(hostSent.all.length + guestSent.all.length, "and together, the whole board").toBe(140);

  // A room can refuse half of what a client sends and look healthy until it
  // stops. `too-fast` is the host outrunning the worker's rate limit, which
  // is how a real draft deadlocked at pick 86.
  expect(hostSent.rejects, "the host was refused nothing").toEqual([]);
  expect(guestSent.rejects, "the guest was refused nothing").toEqual([]);

  // And it was paced. A median under 100ms is a client in a loop.
  expect(median(pickGaps(final.picks)), "picks are paced, not looping").toBeGreaterThan(100);

  await hostCtx.close();
  await guestCtx.close();
});

test("the room talks, and a pick lands in the same transcript", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest } = await twoManagers(browser);
  await startRoomDraft(host);
  await guest.waitForFunction(() => Live.room().status === "drafting", null, { timeout: 20000 });

  // Chat is a rail tab in a room and is not offered in a solo draft, so the
  // press is the same one a person makes.
  await guest.click('button[role="tab"]:has-text("Chat")');
  await guest.fill("#v3-room-chat", "morning all");
  await guest.press("#v3-room-chat", "Enter");

  // It arrives on the OTHER client, off the room's own broadcast — which is
  // the only thing that proves nothing was drawn locally and hoped.
  await host.click('button[role="tab"]:has-text("Chat")');
  await expect(host.locator("[data-room-chat]")).toContainText("morning all", { timeout: 20000 });

  /* The legacy dock carries the same aria-label and app.js un-hides it for
     any room on any route, so this is matched on the attribute rather than
     the name — and the duplicate itself is not merely worked around: V3Live
     makes the legacy dock inert while the v3 room is mounted, the same way
     it already quiets the legacy pick ticker. That is asserted below. */
  await expect(host.locator('#chatDock[inert]'), "the legacy dock is quiet under this one").toHaveCount(1);

  // And the interleave: picks are merged in from room.picks by time rather
  // than stored as messages, so the transcript carries both.
  await host.waitForFunction(() => Live.room().picks.length > 0, null, { timeout: 60000 });
  await expect(host.locator("[data-room-chat]")).toContainText(/#\d+/, { timeout: 20000 });

  await hostCtx.close();
  await guestCtx.close();
});

/* The room changes in ways a DRAFT does not, and the screen has to follow
   them. A seat claimed, a name typed, a message sent, a socket dropped: none
   of those moves a pick, and the shared draft-version hook this page reads
   is keyed on the draft. In a live draft that is invisible — picks land a
   second apart and drag a re-render along with them — so the lobby, where no
   pick ever lands, is where it has to be asserted. */
test("the lobby follows the room: a manager arriving is drawn without a reload", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const host = await openApp(hostCtx, LAUNCHER);
  const code = await createRoom(host);
  /* Scoped to v3's own root. app.js's renderInvite() writes the same
     sentence into the legacy #inviteStatus for any room on any route, so an
     unscoped match resolves to two — the collision this file already records
     for the legacy chat dock, arriving through a string instead of a name. */
  const v3 = (page) => page.locator("#root");
  await expect(v3(host).getByText(/You are the only one here/)).toHaveCount(1);
  const seat2 = (page) => v3(page).getByRole("button", { name: /^Seat 2/ });
  await expect(seat2(host)).toContainText("CPU");

  const guestCtx = await browser.newContext();
  const guest = await openApp(guestCtx, `${ROOM}?room=${code}`);
  await guest.waitForFunction(() => Live.room() && Live.room().yourSeat >= 0, null, { timeout: 30000 });

  // The host pressed nothing and reloaded nothing.
  await expect(v3(host).getByText(/2 of 10 seats taken/), "the host's lobby counted them in").toHaveCount(1, { timeout: 20000 });
  await expect(seat2(host)).not.toContainText("CPU");

  // And a name typed in one room reaches the other's seat list.
  await guest.fill("#v3-room-name", "Blake");
  await guest.press("#v3-room-name", "Enter");
  await expect(seat2(host), "and the name they typed").toContainText("Blake", { timeout: 20000 });

  await hostCtx.close();
  await guestCtx.close();
});

test("a guest cannot start, pause or reorder somebody else's room", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest } = await twoManagers(browser);

  // Not offered, which is the half that matters: a control that cannot act
  // must not merely fail.
  await expect(guest.locator("[data-start-room]")).toHaveCount(0);
  await expect(guest.getByText(/Only the host can start|starts it when the room is ready/i)).toHaveCount(1);

  /* And refused underneath, because "not drawn" is a claim about this build
     and the room is the authority for every build. These go through Live
     directly — a guest has no button for either — and the room answers
     `not-your-seat` to both without broadcasting anything, which is exactly
     why a client may not decide for itself that it worked. */
  const before = await roomView(guest);
  await guest.evaluate(() => { Live.start(); Live.pause(true); Live.swapSeats(0, 1) });
  await guest.waitForTimeout(1500);
  const after = await roomView(guest);
  expect(after.status, "the room did not start").toBe("lobby");
  expect(after.seats.map((s) => s.taken), "and no seat moved").toEqual(before.seats.map((s) => s.taken));
  expect(await guest.evaluate(() => !!Live.room().paused), "and it is not paused").toBe(false);

  // The host's own controls are there, and they work.
  await expect(host.locator("[data-start-room]")).toBeEnabled();
  await startRoomDraft(host);

  await hostCtx.close();
  await guestCtx.close();
});

test("a dropped socket comes back on its own, and the chair comes with it", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest } = await twoManagers(browser);
  await startRoomDraft(host);
  await guest.waitForFunction(() => Live.room().status === "drafting", null, { timeout: 20000 });

  // The host keeps the empty chairs moving whatever the guest's socket does.
  await toggleAutopick(host);
  const picksBefore = await host.evaluate(() => Live.room().picks.length);

  // What a phone does the moment the browser stops being the front app —
  // which is step three of this feature, because sending the invite means
  // leaving the browser.
  await guest.evaluate(() => Live.state().socket.close());

  /* Both facts sampled in ONE round trip, at the instant the wait resolves:
     live.js reconnects as fast as it possibly can, so the gap between "down"
     and "back up" is sometimes shorter than two extra hops to the browser.
     Sampling a transient state across several trips is the bug. */
  const downState = await guest
    .waitForFunction(() => (Live.active() ? null : { inRoom: !!Live.room(), active: Live.active() }), null, { timeout: 10000 })
    .then((h) => h.jsonValue());
  expect(downState.inRoom, "still in the room").toBe(true);
  expect(downState.active, "but the socket is down").toBe(false);

  // The draft does not wait for them: the room keeps the clock and the host's
  // browser keeps answering for the chairs nobody is in.
  await host.waitForFunction((n) => Live.room().picks.length > n, picksBefore, { timeout: 120000 });

  /* Every control that SENDS says why it cannot, rather than swallowing a
     message. "Nothing happens" is how the silent version of this was
     reported in the classic room. */
  await guest.click('button[role="tab"]:has-text("Chat")');
  await expect(guest.locator("#v3-room-chat"), "the composer is dead while the socket is").toBeDisabled({ timeout: 15000 });
  await expect(guest.locator("[data-room-chat]")).toContainText(/Reconnecting|Connecting/);

  await guest.waitForFunction(() => Live.status() === "open", null, { timeout: 30000 });
  await expect(guest.locator("#v3-room-chat"), "and live again when it is back").toBeEnabled({ timeout: 20000 });
  const view = await roomView(guest);
  expect(view.seats[view.yourSeat].taken, "the chair is still theirs").toBe(true);
  expect(view.seats[view.yourSeat].auto, "and the room has stopped picking for them").toBe(false);

  await hostCtx.close();
  await guestCtx.close();
});

test("leaving mid-draft holds the seat, and the invite link gives it back", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest, code } = await twoManagers(browser);
  await startRoomDraft(host);
  await guest.waitForFunction(() => Live.room().status === "drafting", null, { timeout: 20000 });
  const seat = (await roomView(guest)).yourSeat;

  // Leaving the screen leaves the room. The chair goes to the CPU so the
  // draft keeps moving without them — it is a real departure, not a local
  // reset the next broadcast undoes.
  await guest.click("[data-leave-room]");
  await guest.waitForFunction(() => !Live.room(), null, { timeout: 20000 });
  expect(guest.url(), "and it lands on v3's own launcher").toContain(LAUNCHER);

  await host.waitForFunction((s) => Live.room().seats[s].auto === true, seat, { timeout: 20000 });

  /* Back in by the link, in the same tab. Joining used to happen once, at
     startup, so a tab already on the site only changed its hash and nothing
     rejoined — and the link is exactly the way back in. */
  await guest.evaluate((href) => { location.hash = href }, `${ROOM}?room=${code}`);
  await guest.waitForFunction((s) => { const r = Live.room(); return !!r && r.yourSeat === s }, seat, { timeout: 30000 });

  const back = await roomView(guest);
  expect(back.yourSeat, "the same chair").toBe(seat);
  expect(back.seats[seat].auto, "and it is no longer on autopilot").toBe(false);
  expect((await sent(guest)).rejects, "nothing was refused on the way back").toEqual([]);

  await hostCtx.close();
  await guestCtx.close();
});
