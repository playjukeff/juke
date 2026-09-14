/* The primary nav, and the guarantee it exists for: every screen has a way
   off itself, at every width.

   ---- What this file was, and what the cutover did to it ----

   It covered RailNav's desktop <aside>, FloatingNavPill's phone pill and
   its More sheet, and MyLeagueDemo's move cards. Not one of those four
   renders on any address any more: the rail and the sheet belonged to
   AppShell, which every route that mounted it now redirects away from, and
   MyLeagueScreen is in check_dead_components.mjs's unreachable set. So the
   old assertions could not be "fixed" — there is nothing left for them to
   be about, and a locator that matches nothing passes a `toHaveCount(0)`
   just as happily as a working one does.

   What survives is the REQUIREMENT rather than the markup. Three of the
   four bugs this file was written for were the same bug wearing different
   clothes — a width at which no nav rendered at all, a screen that mounted
   its own shell and forgot the rail, a nav item pointing at a retired
   address — and every one of them is still possible against v3's nav. So
   that is what is asserted here now, against the nav v3 actually draws.

   ---- The one fact every selector below has to know ----

   CSS-hidden is still mounted, which is the rule that made all four of the
   original failures look like app bugs. V3App renders its primary nav
   TWICE — once `hidden md:flex` in the header and once `fixed bottom-0
   md:hidden` above the safe area — so both are in the DOM at every width
   and exactly one is ever on screen. `nav[aria-label="Primary"]` on its own
   is a strict-mode violation rather than a missing nav; every locator here
   is `:visible`, and the count assertions below are what pin that it really
   is exactly one.

   ---- What is deliberately NOT covered ----

   There is no More sheet in v3 and no overflow list behind one: the nav is
   five places and they all fit at both widths, which is what the five was
   chosen for. The old "tapping a room inside the sheet closes it" and "My
   League is not duplicated inside the sheet" tests describe a control that
   does not exist, so they are gone rather than skipped — a skipped test for
   a deleted feature is a standing amber nobody reads. */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const NAV = 'nav[aria-label="Primary"]';

/* The five places, in the order V3App lists them, by the address each one
   points at rather than by its label. An attribute says what a control IS.
   These are also exactly the addresses canonicalHash() rewrites the old
   routes ONTO, so a stale item here would be a nav pointing at a redirect
   — which is one of the four bugs this file was originally written for. */
const PLACES = ["#/", "#/league", "#/players", "#/draft", "#/record"];

/* Every width the app is designed at, plus the one that used to fall
   between two breakpoints and get no nav at all. 768 is not decoration:
   the pill was sm:hidden (640) while the rail was lg:flex (1024), so a
   tablet in portrait and every non-maximised desktop window sat in a dead
   zone. v3's single md (768) boundary is what closes it, and this is the
   width that proves the two halves meet rather than overlap or gap. */
for (const width of [390, 768, 1024, 1440]) {
  test(`exactly one nav is on screen at ${width}px, and it is the five places`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await openApp(context, "#/league");

    const shown = page.locator(`${NAV}:visible`);
    await expect(shown, "one nav, never none and never both").toHaveCount(1);

    const hrefs = await shown.locator("a").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href")),
    );
    expect(hrefs, "the five places, in order").toEqual(PLACES);

    await context.close();
  });
}

/* The screen that mounted its own shell is the one that lost its rail, so
   it is the one worth naming. #/draft was #/rooms/draft, which was the
   single route applyRoute() hid #view-home for — DraftRoomEntry rendered
   into #draftroom-root and mounted two thirds of a shell, never RailNav,
   and the half that was missing was the half nobody develops in. Every
   screen renders inside one shell now, which is exactly the claim that
   wants a test rather than a comment. */
test("every screen carries the nav, including the draft launcher", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await openApp(context, "#/");

  for (const hash of ["#/", "#/draft", "#/draft/insights", "#/players", "#/league",
    "#/record", "#/account", "#/calls/wire", "#/method/how-it-works"]) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(400);
    await expect(page.locator(`${NAV}:visible`), `${hash} has a nav`).toHaveCount(1);
    /* And a way back to Now that is not the nav — the wordmark, which is
       the control a reader reaches for first and the one that used to be
       a logo doing two jobs and announcing neither. */
    await expect(
      page.locator('a[aria-label="Juke, Now"]:visible'),
      `${hash} has the wordmark home`,
    ).toHaveCount(1);
  }

  await context.close();
});

/* A nav that draws every item identically is a nav that has stopped saying
   where you are, which is the failure `aria-current` exists to prevent and
   the one no screenshot catches. Asserted as a RELATIONSHIP — exactly one
   item is current, and it is the one whose href matches the route — rather
   than against a class name, because the class is styling and the
   attribute is the claim. */
for (const [hash, current] of [["#/league", "#/league"], ["#/players", "#/players"],
  ["#/record", "#/record"]]) {
  test(`${hash} lights its own nav item and no other`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await openApp(context, hash);

    const marked = await page.locator(`${NAV}:visible a[aria-current]`).evaluateAll((as) =>
      as.map((a) => a.getAttribute("href")),
    );
    expect(marked, "exactly one item is current, and it is this route").toEqual([current]);

    await context.close();
  });
}
