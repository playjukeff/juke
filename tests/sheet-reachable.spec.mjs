/* RETIRED WITH ITS SUBJECT, and kept as the line that says so.

   ---- What this asserted ----

   The sheet's drag handle had to be reachable on ANY phone, in every state
   the screen could get into — reported from an iPhone SE, where switching
   auto-pick on in the Queue tab left the handle under the auto-pick ribbon
   and there was no way to swipe the sheet back down. The bug was that
   BottomSheet honoured its maxHeight at mount and at a snap change but
   never when that ceiling MOVED, and turning auto-pick on moves it by
   growing the header.

   ---- Why it is skipped rather than re-aimed or deleted ----

   v3's phone draft room is one view at a time — Pool, Board, Team, Grade,
   chosen from the rail — and it has no bottom sheet, no snap points and no
   auto-pick ribbon. Nothing in web/src/components/v3 mentions BottomSheet
   or AUTOPICK_RIBBON_H, checked rather than assumed. So there is no sheet
   whose handle can be covered and no ribbon to cover it.

   Deleted, this file takes its reasoning with it. Re-aimed at v3, it would
   be the vacuity this project has shipped three times: a test asking for a
   mark the screen does not draw reports zero and PASSES, and 0 === 0 reads
   exactly like a feature that works.

   ---- The rule, which is what is actually being kept ----

   A control's own handle may not be covered by furniture that GROWS. The
   two halves that made it bite are both still possible: a fixed element
   whose ceiling is read once rather than watched, and a viewport shorter
   than the one the suite profiles — phone.spec.mjs still drives exactly
   one device (iPhone 13, 390x664), and this defect needed a short screen
   to reach. A single device profile is a sample, not a phone.

   So if v3's phone draft ever grows furniture that appears and disappears
   over a control — an autopick ribbon by another name, a connection
   banner, a pick-order strip — this is the line that says to measure the
   relationship again: the header's bottom edge must never fall below the
   top edge of whatever it sits over, at every viewport, in both states.
   The sizes below are real device states rather than numbers picked to
   fail, and they are worth reusing. */

import { test, expect, devices } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* Skipped at the file level rather than per test, so a reader sees one
   reason rather than four identical ones, and so adding a case here does
   not quietly start running against a screen that is not there. */
test.skip(true, "v3's phone draft has no bottom sheet - see the note above");

/* The sheet's drag handle has to be reachable on ANY phone, in every state
   the screen can get into — reported from an iPhone SE, where switching
   auto-pick on in the Queue tab left the handle under the auto-pick ribbon
   and there was no way to swipe the sheet back down.

   ---- Why this is not a case in phone.spec.mjs ----

   That file profiles exactly one device, iPhone 13 (390x664), and this
   defect cannot occur there: measured, a 664px viewport minus a 114px
   header-with-ribbon leaves 550 against a 470px sheet, which is 80px of
   slack. It needs a SHORT viewport to bite. So the sizes are the fixture
   here, and each one is a real device state rather than a number picked to
   fail: an SE 2/3 with Safari's chrome showing, an SE 1st gen, and — as
   the control that must stay clear — the profile the rest of the suite
   already uses.

   ---- What is actually asserted ----

   Not "the sheet is N tall". The relationship: the header's bottom edge
   must never be below the sheet's top edge, at any viewport, with the
   ribbon on or off. An absolute number here would have to be rewritten
   every time the header's own height moves, which is the rule CLAUDE.md
   already states about the padding that stands in for a fixed header. */

/* No launchOptions here, deliberately.
 *
 * This file shipped with a hardcoded
 *   executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
 * -- an absolute path to one numbered chromium build, which is a development
 * workaround that was never taken out. It pins the suite to a browser
 * revision that stops existing the next time Playwright is bumped, and on any
 * machine without that exact directory it fails as
 * "Failed to launch chromium because executable doesn't exist", which reads
 * as a broken runner rather than as a line in a spec.
 *
 * It cost the nightly four failures a night from 5 September. It did not
 * START that red streak -- that began on 28 August -- which is how a standing
 * red compounds: nobody reads a suite that is already failing, so the next
 * thing to break arrives unnoticed.
 *
 * Playwright resolves its own browser. Let it.
 */

const SIZES = [
  { name: "iPhone SE 2/3, Safari chrome showing", width: 375, height: 553 },
  { name: "iPhone SE, 1st gen", width: 320, height: 568 },
  { name: "iPhone 13 — the control", width: 390, height: 664 },
];

/* The header's bottom against the sheet's top, plus a hit-test of the
   handle's own centre. Both, because they answer different questions: the
   geometry says whether the sheet is inside the room left for it, and the
   hit-test says whether a thumb landing on the handle reaches the handle.
   A sheet can be 1px legal and still hand the touch to the ribbon. */
const geometry = () => {
  const root = document.getElementById("draftroom-root");
  const sheet = [...root.querySelectorAll("div")]
    .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
  const header = root.querySelector("header");
  if (!sheet || !header) return null;
  // The drag surface, found by what it does (cursor: grab) rather than by
  // its classes — the one thing a div with no text and no role has.
  const drag = [...sheet.children].find((c) => getComputedStyle(c).cursor === "grab");
  const hb = header.getBoundingClientRect();
  const sb = sheet.getBoundingClientRect();
  const db = drag.getBoundingClientRect();
  const px = Math.round(db.left + db.width / 2);
  const py = Math.round(db.top + 10); // the handle pip's own band
  const hit = document.elementFromPoint(px, py);
  return {
    covered: Math.round(Math.max(0, hb.bottom - sb.top)),
    handleTakenByHeader: !!(hit && header.contains(hit)),
    sheetH: Math.round(sb.height),
  };
};

async function openDraft(browser, size) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    defaultBrowserType: undefined,
    viewport: { width: size.width, height: size.height },
  });
  const page = await openApp(context, "#/draft");
  /* Wait for the board rather than for a duration. players.js/stats.js are
     deferred behind the cold-load reveal, so a flat wait reads the Lobby's
     own "Loading the player board..." refusal and startDraft() starts
     nothing at all — which is a silent pass, not a failure. */
  await page.waitForFunction(() => typeof dataReady === "function" && dataReady(),
    null, { timeout: 30000 });
  await page.evaluate(() => {
    window.JukeEngine.startDraft({ mySlot: 3, clockLength: 90 });
    render();
  });
  await page.waitForFunction(() => !document.querySelector("[data-draft-loader]"),
    null, { timeout: 20000 });
  await page.waitForTimeout(500);
  return { context, page };
}

// Through the Queue tab's own toggle, which is the route the report took.
async function turnAutopickOn(page) {
  await page.locator('#draftroom-root button:text-is("Queue")').first().click();
  await page.waitForTimeout(250);
  await page.locator('#draftroom-root button[aria-pressed]').first().click();
  await page.waitForTimeout(700);
}

for (const size of SIZES) {
  test(`the sheet's handle stays clear of the auto-pick ribbon — ${size.name}`,
    async ({ browser }) => {
      const { context, page } = await openDraft(browser, size);

      const before = await page.evaluate(geometry);
      expect(before, "the phone draft room rendered").not.toBeNull();
      expect(before.covered, "the header is clear of the sheet before auto-pick").toBe(0);

      await turnAutopickOn(page);

      const after = await page.evaluate(geometry);
      expect(after.covered,
        "the ribbon grows the header, so the sheet has to give the room back")
        .toBe(0);
      expect(after.handleTakenByHeader,
        "and a thumb on the handle reaches the handle, not the ribbon")
        .toBe(false);

      /* Reaching the handle is only half of it: the thing the tester could
         not do was SWIPE THE SHEET DOWN, so the gesture is the assertion.
         A real drag rather than a synthetic tap, because a drag is what was
         reported and because it exercises the one path that reads the
         ceiling on every frame. 150px is comfortably past DRAG_STEP (56),
         so it lands on the collapsed snap rather than springing back. */
      const p = await page.evaluate(() => {
        const root = document.getElementById("draftroom-root");
        const sheet = [...root.querySelectorAll("div")]
          .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
        const drag = [...sheet.children].find((c) => getComputedStyle(c).cursor === "grab");
        const b = drag.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + 10) };
      });
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x, p.y + 150, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(700);

      expect((await page.evaluate(geometry)).sheetH,
        "and a swipe down on it still collapses the sheet").toBeLessThan(80);

      await context.close();
    });
}

test("the sheet gives room back when the viewport shrinks under it", async ({ browser }) => {
  /* The other way the ceiling moves, and the one that turns a tight handle
     into a buried one: a phone browser's URL bar appearing mid-draft. The
     viewport height was read once at mount, so the sheet went on sizing
     itself against a screen that was 90px taller than the real one. */
  const { context, page } = await openDraft(browser, { width: 375, height: 667 });
  await turnAutopickOn(page);
  expect((await page.evaluate(geometry)).covered, "clear at full height").toBe(0);

  await page.setViewportSize({ width: 375, height: 553 });
  await page.waitForTimeout(700);

  const after = await page.evaluate(geometry);
  expect(after.covered, "and still clear once the URL bar takes 114px").toBe(0);
  expect(after.handleTakenByHeader, "with the handle still the thing under a thumb").toBe(false);

  await context.close();
});
