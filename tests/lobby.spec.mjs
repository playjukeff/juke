import { test, expect } from "@playwright/test";
import { openApp, createRoom } from "./helpers.mjs";

/* Two managers in the room's own lobby.

   room.spec.mjs answers "did ten chairs get filled by the right two clients"
   and reads the room through Live to do it. This file is the other half:
   what the two managers SEE while the room is still filling up — a chair
   that somebody else is in, a chair you can take, and an order only the host
   may set. Solo covers the claim gesture; nothing covered the part where
   somebody else is sitting in the chair.

   A manager is a browser context, not a tab — contexts have their own
   localStorage and therefore their own juke.member, which is what makes
   these two different people rather than one person with two sockets.

   ---- what the cutover changed ----

   The screen. `#draftroom-root` is empty on every route now, so every
   locator scoped to it matched nothing and every poll in here would have
   timed out reporting a missing chair on a lobby that was drawing ten. The
   lobby is RoomLobby.jsx at #/draft/live?room=<code>, inside #root.

   And the chips went with it. There is no "Claim"/"You"/"Taken" label any
   more: a seat is a row carrying its number, who is in it, and a host badge.
   What identifies one is its ACCESSIBLE NAME, which RoomLobby writes
   deliberately and which is the same string a screen reader is given —
   "Take seat 5" for a free chair, "Seat 2, You", "Seat 1, Blake". That is a
   fact about what the element IS rather than about how it currently reads,
   which is the rule this project already applies to [data-start-draft].

   The other half of that rule is structural and worth stating once: a chair
   that cannot be acted on is a <span> rather than a disabled <button>. So
   "the host's chair cannot be clicked" is asserted as "it is not a button",
   which is a stronger claim than `disabled` and the one RoomLobby actually
   makes. */

/* Every chair on the lobby, as { label, pressable }, in seat order.

   Read off the <ol> the seats live in rather than off every button on the
   page: the Invite and Save controls are buttons too, and a lobby with a
   blocker on it grows more. */
async function seats(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("ol > li")]
      .map((li) => li.firstElementChild)
      .filter((el) => el && /^(Take seat \d+|Seat \d+,)/.test(el.getAttribute("aria-label") || ""));
    return rows.map((el) => ({
      label: el.getAttribute("aria-label"),
      pressable: el.tagName === "BUTTON",
      text: (el.textContent || "").trim(),
    }));
  });
}

async function twoInALobby(browser) {
  const hostCtx = await browser.newContext();
  const host = await openApp(hostCtx, "#/draft");

  /* Straight to createRoom(), with no "Start mock draft" in front of it.

     That button starts a draft outright, so clicking it would put a live
     solo draft where a lobby is expected — and then createRoom() would wipe
     it a line later (adoptRoom() "wipes state.picks and un-drafts the whole
     board"). The seat board is a room screen: the chairs appear on the
     room's own lobby, and the room is what makes them claimable at all. So
     the room comes first and the chairs are waited for after it — the same
     order a person invites somebody in.

     Through the shared helper rather than a hand-rolled poll. createRoom()
     opens with `if (setupProblem()) return null`, so it refuses outright
     while the deferred board is still loading, and a local copy of the poll
     is a copy that never learned to wait for it. It also sets the hash
     itself — to the classic invite shape, which canonicalHash() redirects
     to #/draft/live?room=<code> — so the host lands on the lobby without
     this file naming an address for it. */
  const code = await createRoom(host);
  expect(code, "the host's room has an invite code").toBeTruthy();
  await expect.poll(() => seats(host).then((s) => s.length), { timeout: 30000 })
    .toBeGreaterThan(0);

  const guestCtx = await browser.newContext();
  const guest = await openApp(guestCtx, `#/draft/live?room=${code}`);
  await guest.waitForFunction(() => window.Live && Live.room() && Live.room().yourSeat >= 0,
    null, { timeout: 60000 });
  await expect.poll(() => seats(guest).then((s) => s.length), { timeout: 30000 })
    .toBeGreaterThan(0);

  return { hostCtx, host, guestCtx, guest, code };
}

test("two managers, one board: a claimed chair shows as taken to everybody",
  async ({ browser }) => {
    const { hostCtx, host, guestCtx, guest } = await twoInALobby(browser);

    // The lobby is the pre-draft screen, so no draft is started anywhere here.
    expect(await host.evaluate(() => state.started), "still pre-draft").toBe(false);

    /* A chair that is free, and not the one the guest was seated in on
       arrival - so a pass cannot be the lobby simply drawing the seat the
       room already gave them.

       Written as "seat 0 unless that is where I started" first, and seat 0
       is the host's: the room refused, the chair was correctly not pressable,
       and the click was a no-op. The app was right and the test was wrong,
       which is worth keeping as the assertion below. */
    const startingSeat = await guest.evaluate(() => Live.room().yourSeat);
    const target = startingSeat === 4 ? 5 : 4;

    /* Asked entirely of the guest's own screen.

       Written first as "read the host's seat from the host page, then check
       that index on the guest page", and it timed out every time while a
       hand-run dump of the same moment showed the chair reading as somebody
       else's. Two pages are two clocks, and an index carried across them is
       a fact from one moment being used in another. The guest's board
       already says which chair is somebody else's - that is the thing under
       test - so the seat index comes from there. */
    await expect
      .poll(() => guest.evaluate(() => {
        const rows = [...document.querySelectorAll("ol > li")]
          .map((li) => li.firstElementChild)
          .filter((el) => el && /^Seat \d+,/.test(el.getAttribute("aria-label") || ""));
        return rows.filter((el) => !/, You$/.test(el.getAttribute("aria-label"))).length;
      }), { timeout: 30000 })
      .toBe(1);

    const onGuest = await seats(guest);
    const hostChair = onGuest.findIndex((s) => /^Seat \d+,/.test(s.label) && !/, You$/.test(s.label));
    expect(hostChair, "the host's chair is on the guest's board").toBeGreaterThanOrEqual(0);
    /* Not "disabled": RoomLobby draws a chair nobody may act on as a <span>,
       so there is no button to disable. A test asserting `disabled` on this
       would pass against an element that is not a control at all. */
    expect(onGuest[hostChair].pressable, "and it is not something a guest can press").toBe(false);
    expect(onGuest[target].label, "while a free chair invites being taken")
      .toMatch(new RegExp(`^Take seat ${target + 1}$`));
    expect(onGuest[target].pressable).toBe(true);

    await guest.evaluate((seat) => {
      const rows = [...document.querySelectorAll("ol > li")]
        .map((li) => li.firstElementChild)
        .filter((el) => el && /^(Take seat \d+|Seat \d+,)/.test(el.getAttribute("aria-label") || ""));
      rows[seat].click();
    }, target);

    await expect
      .poll(() => guest.evaluate(() => Live.room().yourSeat), { timeout: 30000 })
      .toBe(target);

    /* And the host is told, without ever being told who the guest is by id.

       The host's own labels differ from the guest's, deliberately and not by
       accident: the host may reorder, so every chair is a button and its
       name carries the instruction ("Seat 5, Manager. Tap to move."). What
       is asserted is the part that is about the guest — the chair now names
       somebody, and it is not the host's own. */
    await expect
      .poll(() => seats(host).then((s) => s[target].label), { timeout: 30000 })
      .not.toMatch(/, CPU\./);

    const onHost = await seats(host);
    expect(onHost.filter((s) => /, You\./.test(s.label)).length,
      "the host still has exactly one chair of their own").toBe(1);
    expect(onHost[target].label, "and it is not the one the guest took").not.toMatch(/, You\./);

    /* A name, not an id. The guest never typed one, so the room's own
       fallback word is what a reader sees — what matters is that a member id
       never reaches a screen, which is the rule viewFor() exists for. */
    expect(onHost[target].text, "the taken chair carries a name").toBeTruthy();
    expect(/m[a-z0-9]{8,}/.test(onHost[target].text),
      "and it is not a raw member id").toBe(false);

    await hostCtx.close();
    await guestCtx.close();
  });

/* Draft order, which only means anything with more than one person in the
   room — so it cannot be checked solo, and the two things worth checking are
   that the host can and the guest cannot. The room already refuses a guest
   (test_engine.py proves Room.swapSeats does), but a refusal the UI never
   mentions is a control that looks live and does nothing.

   There is no settings modal to open first any more, and no "Seats" tab
   inside one. v3 puts the order on the lobby itself: tap a chair, tap the
   one to swap it with, and the same swapSeats(a, b) underneath — two
   indices, never a member id, because a client is never told anybody
   else's. So this file reads the chairs it already has rather than opening
   a drawer to find a second copy of them. */
test("the host sets the draft order and a guest cannot", async ({ browser }) => {
  const { hostCtx, host, guestCtx, guest } = await twoInALobby(browser);

  const guestSeatBefore = await guest.evaluate(() => Live.room().yourSeat);
  const hostSeat = await host.evaluate(() => Live.room().yourSeat);

  /* The guest is told, on screen, that this is not theirs to change — and
     every chair says the same thing in its own accessible name: a free one
     is "Take seat N" and nothing says "Tap to move". */
  await expect(guest.getByText(/The host sets the order/i).first()).toBeVisible({ timeout: 30000 });
  const guestSeats = await seats(guest);
  expect(guestSeats.some((s) => /Tap to move/.test(s.label)),
    "and no chair offers to be moved").toBe(false);

  /* And the shuffle is not offered either.

     "Randomize", not "Randomize order" — the label lost its second word, and
     it now lives in the settings drawer's own draft-order list rather than
     on this screen at all. Worth noticing rather than just updating: an old
     string matches NOTHING on a new screen, so a negative assertion like
     this one goes on passing for a guest who is being offered the shuffle.
     A negative is only worth its line if the positive is also checked, which
     is what the host's case below does.

     And case-INSENSITIVE, which is the second half of the same lesson: a
     button written title case and uppercased in CSS hands innerText back as
     "RANDOMIZE", the identical trap this project has now hit three times. */
  await expect(guest.getByRole("button", { name: /randomize/i }),
    "a guest is not offered the shuffle").toHaveCount(0);

  // The host is invited to reorder, in the same two places.
  await expect(host.getByText(/Tap a seat, then tap the one to swap it with/i).first())
    .toBeVisible({ timeout: 30000 });
  const hostSeats = await seats(host);
  expect(hostSeats.every((s) => s.pressable), "every chair is the host's to move").toBe(true);
  expect(hostSeats.filter((s) => /Tap to move/.test(s.label)).length,
    "and each says so").toBe(hostSeats.length);

  /* The swap itself: tap the host's chair, then the guest's. Two presses
     rather than a drag — HTML5 drag and drop does not exist on touch and the
     host is very often on a phone, which is the reason RoomLobby settled on
     it. */
  await host.evaluate(([a, b]) => {
    const rows = [...document.querySelectorAll("ol > li")]
      .map((li) => li.firstElementChild)
      .filter((el) => el && /^(Take seat \d+|Seat \d+,)/.test(el.getAttribute("aria-label") || ""));
    rows[a].click();
    rows[b].click();
  }, [hostSeat, guestSeatBefore]);

  // The guest is moved by the room, not by their own browser.
  await expect
    .poll(() => guest.evaluate(() => Live.room().yourSeat), { timeout: 30000 })
    .toBe(hostSeat);
  await expect
    .poll(() => host.evaluate(() => Live.room().yourSeat), { timeout: 30000 })
    .toBe(guestSeatBefore);

  await hostCtx.close();
  await guestCtx.close();
});
