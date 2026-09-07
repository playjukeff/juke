import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* Every route the app has renders its own screen, at both widths.

   It looks like a tautology and is not. Which screen a hash resolves to is
   decided in three places that do not know about each other — App's own
   useHashRoute, DraftRoom.jsx's useHashActive, and applyRoute()'s hideHome
   in app.js, which can hide #view-home out from under a screen that
   rendered perfectly well inside it. A route falling through to the
   homepage, or rendering into a hidden container, is a blank page with no
   console error and nothing failing anywhere: exactly what #/drafts did
   for one commit while this suite was otherwise green.

   Flow v3 moved two of those routes and added four, so the cheap thing
   that catches a whole class of that is asking each one whether the screen
   it names is on the page.

   The sideways-overflow check rides along because it is free at this point
   and it is the one thing this project already sweeps for by hand. It is
   the page's own scroller only — an element that overflows and can scroll
   or ellipsise is fine, which is what phone.spec.mjs measures properly. */
const CASES = [
  { hash: "#/", needs: "Know the move", tab: "Home" },
  { hash: "#/rooms", needs: "The Rooms", tab: "Rooms" },
  { hash: "#/rooms/waiver", needs: "Waiver Room", tab: "Rooms" },
  { hash: "#/rooms/trade", needs: "Trade Room", tab: "Rooms" },
  { hash: "#/rooms/strategy", needs: "Strategy Room", tab: "Rooms" },
  { hash: "#/my-league", needs: "Connect a real league", tab: "My League" },
  { hash: "#/rooms/draft", needs: "Mock Drafts", tab: "Rooms" },
  { hash: "#/drafts", needs: "Your Drafts", tab: "Drafts" },
  { hash: "#/you", needs: "You", tab: "You" },
];

/* 1440 rather than 1280 for the desktop pass, and the number is
   load-bearing rather than taste. Every container here is
   `max-w-[1280px] mx-auto`, so at a 1280 viewport — 1265 once the
   scrollbar is off it — the max-width never binds, nothing is centred, and
   every column runs edge to edge. The left-margin check below is then
   measuring a degenerate layout: the two container orders it exists to
   tell apart produce the identical edge there, and it passed against the
   real bug for exactly that reason. 1440 is the narrowest round width at
   which the centring is real. */
for (const size of [{ w: 390, h: 844, label: "phone" }, { w: 1440, h: 900, label: "desktop" }]) {
  for (const c of CASES) {
    test(`${c.hash} renders on ${size.label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: size.w, height: size.h } });
      const page = await openApp(context, c.hash);
      await page.waitForTimeout(900);

      /* Lower-cased AND whitespace-collapsed on both sides.

         Lower-cased because every one of these headings is title case in
         the source and uppercased in CSS, so innerText never spells it the
         way the source does — the trap that has broken a hero-eyebrow
         check, a "Randomize" check and a /nan/i sweep in this repo.

         Collapsed because a heading is free to break where it likes: the
         Rooms lobby's desktop H1 is two lines ("The" / "Rooms", the second
         in mint) exactly as 3bg draws it, and innerText puts a newline
         between them. That is a layout decision, not a change to what the
         screen says, and this test is about the latter. */
      const norm = (t) => t.toLowerCase().replace(/\s+/g, " ");
      const seen = norm(await page.evaluate(() => document.body.innerText));
      expect(seen, `${c.hash} draws its own screen`).toContain(norm(c.needs));

      // Nothing overflows the page sideways, at either width.
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, "no sideways page scroll").toBeLessThanOrEqual(0);

      /* The screen's own title starts on the same left margin as the
         header sitting above it.

         Measured 3 Sep 2026 at 1440, this held on one route of five: the
         homepage and the room pages started 40px LEFT of the wordmark
         (padding on the full-bleed wrapper instead of inside the
         max-width, so the column came out 1280 rather than 1200), and
         #/drafts and #/you started 42-53px right of it (the glyph sitting
         inline before the H1 rather than in an eyebrow above it). Nothing
         overflowed, nothing threw, and every screen was correct on its
         own -- the disagreement only exists between two of them.

         The RELATIONSHIP, never an offset: 113 and 120 are both right
         answers here depending on whether the page has a scrollbar, and a
         literal would be wrong the next time max-w-[1280px] moves. Same
         rule phone.spec.mjs already follows for the gap under the fixed
         header. */
      const edges = await page.evaluate(() => {
        const vis = (e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const header = [...document.querySelectorAll("div")].find(
          (e) =>
            vis(e) &&
            e.className.includes("max-w-[1280px]") &&
            e.className.includes("items-center") &&
            e.getBoundingClientRect().y < 90,
        );
        const h1 = [...document.querySelectorAll("#root h1")].filter(vis)[0];
        if (!header || !h1) return null;
        return {
          header: Math.round(
            header.getBoundingClientRect().x +
              parseFloat(getComputedStyle(header).paddingLeft),
          ),
          h1: Math.round(h1.getBoundingClientRect().x),
        };
      });

      /* Null on #/rooms/draft, which is DraftRoom's own Lobby rather than
         an AppShell screen and draws neither of these. Skipped rather than
         failed: this asserts a relationship between two things, and a
         screen that has only one of them is not in breach of it. */
      if (edges) {
        expect(
          edges.h1 - edges.header,
          `${c.hash}: the title starts on the header's own left margin`,
        ).toBe(0);
      }

      await context.close();
    });
  }
}
