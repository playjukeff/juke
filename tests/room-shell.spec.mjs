/* RoomShell — the one header every room wears.
 *
 * The handoff's first constraint is "One RoomShell; rooms pass config,
 * never re-render their own header", and the failure mode is that five
 * headers each render perfectly well on their own. So what is asserted
 * here is the shape of the composition rather than any one room's copy:
 * one bar per room, the same bar on every room, the way out where the
 * handoff puts it, and the room's own name in the BODY rather than the
 * bar.
 *
 * Anchored on `data-room-shell` rather than on a tag or a heading. The
 * page already carries ShellHeader's own <header>, and every label in
 * this component is copy that has moved before — the Start button alone
 * has had five names. An attribute says what an element IS.
 *
 * ---- What is NOT here, and why ----
 *
 * Any room's own tab CONTENT. What a room's sections are is that room's
 * business and its own spec's; what this file pins is that the strip is
 * drawn when a room has sections and not otherwise, that exactly one tab
 * reads as open, and that gaining a strip does not change the identity row
 * every room shares.
 *
 * This section used to say "no room passes tabs yet" and assert zero
 * strips everywhere. That was true while all four in-season rooms were
 * locked previews with one body each. Prospect is the first room whose
 * content needs no connected league, so it draws real tabs in a keyless
 * build — and the assertion went red for the shell doing its job. The
 * other three will do the same the day this suite can sign in, which is
 * why what replaced it is a relationship rather than a newer count.
 *
 * Still verified by hand and not here: the two gate chips reading SEASON
 * PASS and MULTI-LEAGUE rather than the handoff's internal PRO /
 * ALL ACCESS. No room reachable without Clerk carries a gated tab.
 */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const ROOMS = [
  { slug: "waiver", name: "The Waiver Room" },
  { slug: "trade", name: "The Trade Room" },
  { slug: "strategy", name: "The Strategy Room" },
  { slug: "prospect", name: "The Prospect Room" },
];

test.describe("the room shell", () => {
  for (const room of ROOMS) {
    test(`${room.slug} wears exactly one, and it names the room`, async ({ context }) => {
      const page = await openApp(context, `#/rooms/${room.slug}`);
      const shell = page.locator("[data-room-shell]");

      /* One. Two would be the constraint this component exists for,
         broken — and two headers stacked read as a layout bug rather than
         as an architecture one, which is why nobody would file it. */
      await expect(shell).toHaveCount(1);
      /* The DOM text, not the rendered text. `uppercase` here is CSS, so
         innerText/textContent still says "The Waiver Room" — asserting the
         painted casing is the trap this project has now recorded three
         times (a case-insensitive sweep matching the surname Monangai, and
         a hero eyebrow uppercased in CSS and title-case in source). */
      await expect(shell).toContainText(room.name);

      /* The tab strip is drawn when the room passes tabs and not
         otherwise, and what is asserted is that relationship rather than
         its answer for today's rooms.

         This used to read `toHaveCount(0)`, with a comment saying "no tab
         strip while no room has tabs" — true when written, because the
         four in-season rooms were locked previews with one body each.
         Prospect is the first room whose real content needs no league, so
         it renders its own tabs in a keyless build and that assertion went
         red for the shell working exactly as designed. The three that are
         still Clerk-gated will do the same the day this suite can sign in,
         so pinning today's answer would only defer the same failure. */
      const tabs = page.locator("[data-room-tabs]");
      const strips = await tabs.count();
      expect(strips, "at most one tab strip").toBeLessThanOrEqual(1);
      if (strips) {
        /* An empty 44px band under the bar reads as a tab row that failed
           to load, and exactly one tab is selected — two underlines, or
           none, is the same class of defect as a strip with nothing in
           it. */
        const items = tabs.locator("button, a");
        expect(await items.count(), "a strip that is drawn has tabs in it").toBeGreaterThan(0);
        expect(
          await tabs.locator('[aria-current="page"]').count(),
          "exactly one tab reads as the open one"
        ).toBe(1);
      }

      await page.close();
    });
  }

  test("the way out is in the bar, and it goes to the lobby", async ({ context }) => {
    const page = await openApp(context, "#/rooms/waiver");
    const back = page.locator('[data-room-shell] a[href="#/rooms"]');
    await expect(back).toHaveCount(1);

    /* 44px is the handoff's own minimum and this project's own rule for a
       touch target — a back control that is the only way out of a room
       must not be the one thing on the bar that is hard to hit. */
    const box = await back.boundingBox();
    expect(box.height, "the back control clears a 44px touch target").toBeGreaterThanOrEqual(44);

    await back.click();
    await page.waitForFunction(() => location.hash === "#/rooms");
    await page.close();
  });

  test("a guest is told which tier they are on", async ({ context }) => {
    const page = await openApp(context, "#/rooms/waiver");
    /* Signed out settles to 'free' immediately, so this is the no-flicker
       case. The badge must say the CUSTOMER-facing name: 'free' is the
       worker's enum value and printing it would show somebody an internal
       identifier.

       Asserted as "Free" because that is what the DOM holds; the bar
       paints it uppercase in CSS. The check that the WORD is the
       customer-facing one is the point — 'free' lowercase would pass this
       too, so the enum-value check is the separate assertion below. */
    const bar = page.locator("[data-room-shell]");
    await expect(bar).toContainText("Free", { timeout: 15000 });

    /* And never the worker's own word. tierLabel() is the one thing
       standing between a badge and 'pro'/'allaccess' reaching a reader, so
       this fails if anybody bypasses it — which the assertion above would
       not catch, because "Free" and "free" are the same string in both
       vocabularies and only the paid tiers actually diverge. */
    expect(await bar.innerText()).not.toMatch(/\b(pro|allaccess|all access)\b/i);

    await page.close();
  });

  test("the room's name is an H1 in the body, not in the bar", async ({ context }) => {
    const page = await openApp(context, "#/rooms/waiver");

    /* The bar is sticky and 52px. A title living in it would be the only
       heading on the page and would scroll with the chrome rather than
       with the content it names — which is why the handoff draws the H1
       below the bar and why this is worth pinning rather than assuming. */
    const h1 = page.locator("#view-home h1", { hasText: "Waiver Room" });
    await expect(h1).toHaveCount(1);

    const inBar = await page.evaluate(() => {
      const bar = document.querySelector("[data-room-shell]");
      return !!bar && !!bar.querySelector("h1");
    });
    expect(inBar, "no heading inside the sticky bar").toBe(false);

    await page.close();
  });

  test("every room's bar is the same bar", async ({ context }) => {
    /* The point of one component. If a room grew its own, the most likely
       tell is a different height or a different ground — both of which a
       reader notices as a jump when moving between rooms and neither of
       which fails anything.

       Measured on the IDENTITY ROW rather than on the whole shell. The tab
       band under it is per-room by design — a room declares its own
       sections and this component draws them — so measuring the shell
       reports a room GAINING tabs as the shell having diverged, which is
       the opposite of what this test is for. Prospect proved that by
       coming out 100px against the other three's 53, on a bar that was
       working perfectly. Stickiness and the ground still belong to the
       shell itself, so those two are read off it. */
    const seen = [];
    for (const room of ROOMS) {
      const page = await openApp(context, `#/rooms/${room.slug}`);
      const bar = page.locator("[data-room-shell]");
      await expect(bar).toHaveCount(1);
      seen.push(
        await bar.evaluate((el) => {
          const s = getComputedStyle(el);
          const id = el.querySelector("[data-room-identity]");
          return {
            h: id ? Math.round(id.getBoundingClientRect().height) : null,
            bg: s.backgroundColor,
            position: s.position,
          };
        })
      );
      await page.close();
    }
    expect(seen[0].h, "the identity row is measurable").toBeGreaterThan(0);
    const first = JSON.stringify(seen[0]);
    for (let i = 1; i < seen.length; i++) {
      expect(JSON.stringify(seen[i]), `${ROOMS[i].slug} matches ${ROOMS[0].slug}`).toBe(first);
    }
    expect(seen[0].position, "and it is sticky, per the handoff").toBe("sticky");
  });
});
