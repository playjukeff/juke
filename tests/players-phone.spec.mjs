/* The Players place on a phone: the list first, and nothing lost to get it.

   ---- What this is for ----

   Reported 18 September 2026 against two recordings of ESPN Fantasy —
   "ours has a ton of text describing almost every element on each page and
   is very busy compared to theirs". Measured on the built site at 390x844,
   this page put its first player at y=1400 behind 767px of stacked filter
   form; the same screenful of ESPN's shows five.

   The answer was not to drop controls. Scoring, the three orders, sort,
   NFL team and tenure moved into a sheet off the band, search became a
   pinned icon that expands, and position became one scrolling chip row.
   So the two things worth asserting are in tension and both are here: the
   list has to start near the top, AND every control has to still be
   reachable. Either alone passes against a page that threw the other away.

   ---- Why this file rather than a case in phone.spec.mjs ----

   That file profiles exactly one device. Two of the assertions below need
   a SHORT viewport, and its own note says a single device profile is a
   sample rather than a phone.

   ---- Where the sizes come from ----

   sheet-reachable.spec.mjs, which is retired with the draft room's own
   bottom sheet and says in its header that its sizes are "real device
   states rather than numbers picked to fail, and they are worth reusing".
   They are reused rather than re-aiming that file: its geometry reads
   #draftroom-root, a cursor:grab drag handle and an autopick ribbon, none
   of which this sheet draws, and a spec asking for a mark the screen does
   not draw reports zero and PASSES — the vacuity that file exists to warn
   about. What travels is the RULE it was protecting: a panel's own handle
   and controls may not end up under furniture that grows, and a ceiling
   read once rather than watched is how that happens. */

import { test, expect, devices } from "@playwright/test";
import { openApp, SITE } from "./helpers.mjs";

const PHONE = { width: 390, height: 844 };

/* Real device states, from sheet-reachable.spec.mjs. The third is the
   control: it is the profile the rest of the suite already drives, and it
   has room to spare, so a failure on it means something other than height. */
const SIZES = [
  { name: "iPhone SE 2/3, Safari chrome showing", width: 375, height: 553 },
  { name: "iPhone SE, 1st gen", width: 320, height: 568 },
  { name: "iPhone 13 — the control", width: 390, height: 664 },
];

async function openPlayers(browser, size = PHONE) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    defaultBrowserType: undefined,
    viewport: { width: size.width, height: size.height },
    isMobile: true,
    hasTouch: true,
  });
  const page = await openApp(context, "#/players");
  await page.waitForFunction(
    () => !!document.querySelector('#v3-main ul[aria-label="Players"] li'),
    null,
    { timeout: 30000 },
  );
  return { context, page };
}

test.describe("Players on a phone", () => {
  /* The point of the whole change, as one number. Not "the control block is
     N tall" — what a reader cares about is whether a player is on the first
     screen, so that is what is asserted, against the viewport rather than
     against a constant. */
  test("a player is on the first screen", async ({ browser }) => {
    const { context, page } = await openPlayers(browser);
    const y = await page.evaluate(() => {
      const li = document.querySelector('#v3-main ul[aria-label="Players"] li');
      return Math.round(li.getBoundingClientRect().top + window.scrollY);
    });
    // 844 is the viewport; a row must start inside it with room to read it.
    expect(y, `first player row at y=${y}`).toBeLessThan(PHONE.height - 120);
    await context.close();
  });

  /* The other half. Five controls left the page, so five controls have to
     come back — by their own accessible names, which is what a screen
     reader and this test have in common. */
  test("every control that left the page is in the sheet", async ({ browser }) => {
    const { context, page } = await openPlayers(browser);

    // Shut, it renders nothing at all — not hidden, absent.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    await page.locator("[data-filters-open]").click();
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toHaveCount(1);

    for (const name of ["Scoring", "Ranked by", "Tenure"]) {
      await expect(
        sheet.locator(`[role="group"][aria-label="${name}"]`),
        `${name} is in the sheet`,
      ).toHaveCount(1);
    }
    await expect(sheet.locator("#v3-player-sort"), "sort is in the sheet").toHaveCount(1);
    await expect(sheet.locator("#v3-player-team"), "NFL team is in the sheet").toHaveCount(1);

    /* One instance of each, in the whole document. Two would mean two
       elements carrying `v3-player-team`, and <label for> binds to the
       first in the document — so a label would point at the wrong control.
       This is the assertion that says the desktop arrangement is not
       merely CSS-hidden beside this one. */
    await expect(page.locator("#v3-player-team")).toHaveCount(1);
    await expect(page.locator("#v3-player-sort")).toHaveCount(1);

    await context.close();
  });

  /* A dialog that traps nothing is a dialog a keyboard cannot leave, and
     one that does not give focus back drops the reader at the top of the
     page. Both directions. */
  test("the sheet takes focus and gives it back", async ({ browser }) => {
    const { context, page } = await openPlayers(browser);
    await page.locator("[data-filters-open]").click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(1);

    expect(
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return !!d && d.contains(document.activeElement);
      }),
      "focus moved into the panel",
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    await expect
      .poll(
        () => page.evaluate(() => !!document.activeElement?.hasAttribute("data-filters-open")),
        { message: "focus returned to the control that opened it" },
      )
      .toBe(true);

    await context.close();
  });

  /* The rule inherited from sheet-reachable.spec.mjs, at its sizes. The
     sheet is capped in dvh and only its body scrolls, so its header can
     never be pushed under the app's — but that is a property of the CSS,
     and this is the thing that says the CSS is still doing it. */
  for (const size of SIZES) {
    test(`the sheet fits, and its close is reachable — ${size.name}`, async ({ browser }) => {
      const { context, page } = await openPlayers(browser, size);
      await page.locator("[data-filters-open]").click();
      await expect(page.locator('[role="dialog"]')).toHaveCount(1);

      const g = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"]');
        const header = [...document.querySelectorAll("header")].find(
          (h) => h.getBoundingClientRect().height > 0,
        );
        const close = panel.querySelector("button[type=button]");
        const pb = panel.getBoundingClientRect();
        const cb = close.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(cb.left + cb.width / 2),
          Math.round(cb.top + cb.height / 2),
        );
        return {
          covered: Math.round(Math.max(0, (header ? header.getBoundingClientRect().bottom : 0) - pb.top)),
          withinViewport: pb.bottom <= window.innerHeight + 1 && pb.top >= -1,
          closeTakenByPanel: !!(hit && panel.contains(hit)),
        };
      });

      expect(g.covered, "the app header does not overlap the sheet").toBe(0);
      expect(g.withinViewport, "the sheet is inside the viewport").toBe(true);
      expect(g.closeTakenByPanel, "a tap on the close lands on the close").toBe(true);

      await context.close();
    });
  }

  /* Search is an icon until it is asked for, and it stays open while there
     is a term in it — a filtered list that hid the reason it was short
     would be worse than the row the icon saved. */
  test("search expands, filters, and stays open while it has a term", async ({ browser }) => {
    const { context, page } = await openPlayers(browser);

    await expect(page.locator("#v3-player-search")).toHaveCount(0);
    await page.locator("[data-players-search]").click();

    const field = page.locator("#v3-player-search");
    await expect(field).toHaveCount(1);

    const before = await page.locator('#v3-main ul[aria-label="Players"] li').count();
    await field.fill("mahomes");
    await expect
      .poll(() => page.locator('#v3-main ul[aria-label="Players"] li').count(), {
        message: "the list narrowed",
      })
      .toBeLessThan(before);

    // Still open with a term in it, even though nothing has focus.
    await page.locator("#v3-main").click({ position: { x: 5, y: 5 } });
    await expect(field, "the field stays while the term does").toHaveCount(1);

    await context.close();
  });

  /* The control. At a desk nothing moved: the inline controls are on the
     page and there is no way in to a sheet, because there is no sheet.
     Without this, "hide it from everybody" passes every test above. */
  test("at a desk the controls are inline and there is no sheet", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await openApp(context, "#/players");
    await page.waitForFunction(() => !!document.querySelector("#v3-main table"), null, {
      timeout: 30000,
    });

    await expect(page.locator("[data-filters-open]")).toHaveCount(0);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.locator('[role="group"][aria-label="Scoring"]')).toHaveCount(1);
    await expect(page.locator('[role="group"][aria-label="Position"]')).toHaveCount(1);
    await expect(page.locator("#v3-player-search")).toHaveCount(1);

    await context.close();
  });
});

/* ---- Rookies, the other list in this same place ----

   Measured the same way on the same day and it was the worse of the two:
   the first rookie sat at y=894 on an 844px screen — nothing but chrome on
   the opening screenful — behind a 430px notice, two labelled control
   groups, and rows 130px tall because every one of them carried a
   full-width "7/8 known" button that reads 7/8 for very nearly the whole
   class.

   None of that could simply be deleted. The notice is the page saying out
   loud that it ranks players it cannot fully explain, which is the only
   thing that makes the ranking defensible; the count is what each row is
   promising. So both moved rather than going, and both halves are asserted
   here — a rookie near the top, AND every word still reachable. Either
   alone passes against a page that threw the other away. */
test.describe("Rookies on a phone", () => {
  async function openRookies(browser) {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      defaultBrowserType: undefined,
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
    });
    const page = await openApp(context, "#/players/rookies");
    await page.locator("[data-prospect-row]").first().waitFor({ timeout: 30000 });
    return { context, page };
  }

  test("a rookie is on the first screen", async ({ browser }) => {
    const { context, page } = await openRookies(browser);
    const y = await page.evaluate(() => {
      const li = document.querySelector("[data-prospect-row]");
      return Math.round(li.getBoundingClientRect().top + window.scrollY);
    });
    expect(y, `first rookie row at y=${y}`).toBeLessThan(PHONE.height - 120);
    await context.close();
  });

  /* The notice, both halves. Collapsed it must still carry the counts —
     they are the part that is a fact rather than a framing — and opening it
     must give back the sentences, unrewritten. A page that kept only the
     counts would be claiming a confidence it has not got. */
  test("the notice keeps its counts, and its words are one tap away", async ({ browser }) => {
    const { context, page } = await openRookies(browser);
    const primer = page.locator('section[aria-label="What is known, and what is not"]');
    await expect(primer).toHaveCount(1);

    // Collapsed: the counts are on screen and the prose is not.
    await expect(primer).toContainText(/drafted/);
    await expect(primer).not.toContainText("no feed in this product carries one yet");

    await primer.getByRole("button").click();
    await expect(primer).toContainText("no feed in this product carries one yet");
    await expect(primer).toContainText("keeps its confidence low");

    await context.close();
  });

  /* The count left the collapsed row, so the control that opens the row has
     to carry it — for a screen reader, which never saw the visible one
     either way — and the panel has to show it. */
  test("the evidence count survives leaving the row", async ({ browser }) => {
    const { context, page } = await openRookies(browser);
    const row = page.locator("[data-prospect-row]").first();
    const toggle = row.getByRole("button");

    await expect(toggle, "the control names the count").toHaveAccessibleName(
      /\d+ of \d+ known/,
    );
    await toggle.click();
    await expect(row).toContainText(/\d+ of \d+ known/);
    await expect(row, "and the panel it opens is the detail itself").toContainText("On file");

    await context.close();
  });

  /* The control. At a desk the count is a column with a header over it, so
     it stays where it was — this is what stops "drop it everywhere" passing
     the two tests above. */
  test("at a desk the count is still written on the row", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await openApp(context, "#/players/rookies");
    await page.locator("[data-prospect-row]").first().waitFor({ timeout: 30000 });

    const toggle = page.locator("[data-prospect-row]").first().getByRole("button");
    await expect(toggle).toContainText(/\d+\/\d+ known/);

    await context.close();
  });
});

/* SITE is imported so this file fails loudly if the helpers ever stop
   exporting it, rather than silently driving the default. */
test.beforeAll(() => {
  if (!SITE) throw new Error("no SITE");
});
