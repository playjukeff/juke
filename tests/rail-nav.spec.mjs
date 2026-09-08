/* Juke Journey v3's rail-nav shell and My League screen, reviewed after
   Phase 1 landed already merged. Four real bugs were found by hand and
   fixed; this covers the ones a keyless build can reach without a real
   Clerk instance.

   ---- What is NOT covered here, and why ----

   ConnectLeagueModal's tier-limit branch (a Multi-League account at its
   6-league cap was offered a "downgrade" to Season Pass) sits behind
   ConnectLeagueCta/LeagueSwitcher, both inside Clerk's <SignedIn> — the
   same gap league-connect.spec.mjs's own header documents for the connect
   dialog generally. Verified by hand instead, with the technique that file
   already prescribes: a temporary render harness bypassing <SignedIn>
   entirely, reverted after.

   The stale #/rooms/league -> #/my-league link fixes (HomeAlive.jsx,
   YouScreen.jsx) render only for a signed-in reader with a connected
   league — the identical gap. Verified by fetching the live dev bundle
   and confirming the exact edited elements.

   ---- CSS-hidden is still mounted, and every selector below has to know it ----

   Every one of the four failed on its first run, and not one failure was
   the app: RailNav's own <aside> (hidden lg:flex) and MoreSheet's shared
   <a href> room links both render off-screen at phone width rather than
   not at all, and a locator that does not know that matches the invisible
   copy right alongside the one under test — `aside` resolved to RailNav's
   AND the legacy draft room's own #rail queue sidebar; `a[href="#/rooms/
   trade"]` resolved to RailNav's copy alongside the sheet's. Scoped below
   to `.z-\[70\]`, the sheet's own fixed backdrop, rather than to the page —
   the same rule CLAUDE.md already states for two phone-shaped copies of
   one table ("checked by counting <table> elements... exactly one"),
   arrived at by a failing run instead of by reading it first. */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const SHEET = ".z-\\[70\\]";

test.describe("the phone bottom nav and its More sheet", () => {
  /* Reported as a dead zone: FloatingNavPill's pill and sheets were
     sm:hidden (640px) while RailNav, its desktop counterpart, is lg:flex
     (1024px) — so a tablet in portrait, or any non-maximised desktop
     window, got neither nav at all. 768px sits squarely inside that gap. */
  test("the pill covers the width the rail does not reach yet", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await openApp(context, "#/rooms/waiver");

    await expect(page.getByRole("button", { name: "More" })).toBeVisible();
    // Excludes the legacy draft room's own #rail queue sidebar, an
    // unrelated element sharing the tag name — see the file header.
    await expect(page.locator("aside:not(#rail)")).toBeHidden();

    await context.close();
  });

  test("the rail covers desktop width and the pill stands down", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await openApp(context, "#/rooms/waiver");

    await expect(page.locator("aside:not(#rail)")).toBeVisible();
    await expect(page.getByRole("button", { name: "More" })).toBeHidden();

    await context.close();
  });

  test("My League is not duplicated inside the sheet", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openApp(context, "#/rooms/waiver");

    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByText("ALL ROOMS")).toBeVisible();

    /* My League already has its own dedicated tab in the pill, by design
       (FloatingNavPill.jsx: "it earns a tap of its own rather than living
       behind More"). Scoped to the sheet itself: RailNav's own hidden copy
       of the item list carries a My League row too, off-screen but
       mounted, so an unscoped count would pass at 2 whether or not the
       sheet's own row had really been filtered out.

       By href, not by text — confirmed the hard way. A first version of
       this read getByText("My League", { exact: true }), which is
       vacuously 0 whichever way the filter goes: the row's own text is
       the glyph and the label with no space between them ("🏟My League"),
       so the element's WHOLE text never equals "My League" exactly and
       the assertion cannot fail. Caught by running it against the pre-fix
       file, where it passed when it should have gone red. */
    await expect(page.locator(SHEET).locator('a[href="#/my-league"]')).toHaveCount(0);

    // The sheet still carries every room and History, unaffected by the
    // My League filter — this is what tells "filtered correctly" apart
    // from "rendered nothing".
    await expect(page.locator(SHEET).locator('a[href="#/rooms/waiver"]')).toBeVisible();
    await expect(page.locator(SHEET).locator('a[href="#/rooms/trade"]')).toBeVisible();
    await expect(page.locator(SHEET).locator('a[href="#/drafts"]')).toBeVisible();

    await context.close();
  });

  /* RoomPage.jsx deliberately does not unmount between two room slugs, to
     keep its own hook count stable across e.g. Waiver -> Trade — which is
     exactly why MoreSheet, mounted inside that same tree, survived the tap
     unchanged and stayed open over the new room. Asserting only "the sheet
     is gone" would also pass a version that closes the sheet without the
     navigation actually landing, so both are checked. */
  test("tapping another room inside the sheet closes it and lands there", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openApp(context, "#/rooms/waiver");

    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByText("ALL ROOMS")).toBeVisible();

    await page.locator(SHEET).locator('a[href="#/rooms/trade"]').click();

    await expect(page.getByText("ALL ROOMS")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Trade Room" })).toBeVisible();

    await context.close();
  });
});

test.describe("My League's demo screen", () => {
  /* Free and guest alike get the full interactive demo (confirmed product
     rule — Free cannot connect a real league at all), so this needs no
     account and no stub, only the board actually landing: buildDemoData()
     reads real players off it and the screen shows "Loading…" until it
     has. */
  async function openDemo(context) {
    const page = await openApp(context, "#/my-league");
    await page.waitForFunction(() => typeof dataReady === "function" && dataReady());
    await expect(page.getByText("Demo league")).toBeVisible();
    return page;
  }

  test("the primary move card is a real navigation, not a no-op", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openDemo(context);

    // ctaLabel and slug both come from demoData.js as fixed strings — see
    // its own comment on why the room a recommendation names is
    // deterministic regardless of which players land in the offsets it
    // reads. onOpen used to be a literal no-op (`() => {}`).
    await page.getByRole("button", { name: "Open Waiver Room" }).click();
    await expect(page.getByRole("heading", { name: "Waiver Room" })).toBeVisible();

    await context.close();
  });

  test("a secondary move is its own navigation, not a promote-to-primary swap", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openDemo(context);

    /* Confirmed against the source rather than assumed: each card is an
       independent <a href> into the room it names. These were plain divs
       with no click target at all.

       Disambiguated by its own copy ("Counter this week's offer...")
       rather than by href alone: RailNav's hidden desktop copy of the
       nav's own Trade link shares the identical href on this same page. */
    await page.locator('a[href="#/rooms/trade"]').filter({ hasText: "Counter" }).click();
    await expect(page.getByRole("heading", { name: "Trade Room" })).toBeVisible();

    await context.close();
  });
});
