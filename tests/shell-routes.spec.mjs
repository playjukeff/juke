import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* Every route the app has renders its own screen, at both widths.

   It looks like a tautology and is not. Which screen a hash resolves to is
   still decided in places that do not know about each other — app.js's
   canonicalHash() rewrites the address before React ever sees it,
   useHashRoute() reads what survives, and V3App's own route table picks
   the page — and applyRoute() can still hide #view-home out from under a
   screen that rendered perfectly well inside it. A route falling through
   to Now, or rendering into a hidden container, is a blank page with no
   console error and nothing failing anywhere: exactly what #/drafts did
   for one commit while this suite was otherwise green, and exactly what
   #/calls/wire did for three commits during the cutover itself, where one
   missing `cx` import unmounted the whole root and every tool in the chain
   reported success.

   The cutover moved every one of these routes, which is the cheapest
   possible argument for asking each one whether the screen it names is
   actually on the page.

   The sideways-overflow check rides along because it is free at this point
   and it is the one thing this project already sweeps for by hand. It is
   the page's own scroller only — an element that overflows and can scroll
   or ellipsise is fine, which is what phone.spec.mjs measures properly. */
/* ---- and what the cutover did to this list ----

   Every address here changed, because every screen did. The old table was
   the six rooms plus three account pages; this is v3's five places, the
   three calls a place opens, the two draft screens that are not the live
   cockpit, and the method doc.

   `needs` is the screen's own H1, read off the built site rather than
   copied out of a component — each of these was measured at both widths
   before it was written down, which is the only way this file's own
   uppercase trap (see `norm` below) stays caught rather than re-sprung.

   The retired `tab` field is gone with them. It named the primary-nav item
   each route lit up and NOTHING in this file ever read it, so it was a
   knob that turned nothing — and it could not survive the cutover anyway:
   v3's nav has five items, and `#/calls/*`, `#/draft/insights` and
   `#/method/*` light none of them. Which item is active is worth
   asserting; it is rail-nav.spec.mjs's job and it is done there against a
   nav that exists.

   The live cockpit (#/draft/live) is deliberately absent: it does not
   render until somebody starts a draft, so it is not reachable from a
   route list. no-console-errors.spec.mjs drives it properly. */
const CASES = [
  /* Now is the one screen whose copy is a fact about the DATE, so it is the
     one case that names more than one acceptable answer.

     Guest Now has two headlines and which one renders is decided by
     seasonClock(): Now.jsx says "Every call, with the math shown." out of
     season and NowSeason.jsx says "Week N is here. Bring your league."
     once a week has kicked off. There is no shared sentence to pin instead
     — they are different components with different bodies — and pinning
     either one alone writes today's date into an assertion, which is this
     project's own "a measurement is true of the board it was taken on"
     trap with a September board behind it. Both are Now; neither is any
     other screen; so either satisfies what this test is actually for.

     Worth knowing while reading the prerender note in CLAUDE.md: the
     server renders the FIRST of these (Node has no engine, so
     seasonClock() is null) and the client swaps to the second once
     stats.js lands. That is not a hydration mismatch — the swap happens in
     an effect after hydration, the same shape as useHashRoute() resolving
     one tick late — and it was confirmed clean: zero #418/#423. */
  { hash: "#/", needs: ["Every call, with the math shown.", "Bring your league."] },
  { hash: "#/draft", needs: "Draft against tonight's board." },
  { hash: "#/draft/insights", needs: "Your insights." },
  { hash: "#/players", needs: "Every player on the board, priced." },
  { hash: "#/players/rookies", needs: "The rookie class, and what we don't know yet." },
  { hash: "#/league", needs: "Your league, read and priced." },
  { hash: "#/record", needs: "Every draft and every call, graded." },
  { hash: "#/account", needs: "You're drafting as a guest." },
  /* The three calls are matched by the SHAPE of their headline, never by
     the players in it. These were literals - "Claim Drake London.", "Ask
     for Isaiah Likely.", "Start Dallas Goedert over Brock Bowers." - and a
     sample call is computed off tonight's board, which the pipeline
     regenerates every morning. All three went red reporting "claim jaxon
     smith-njigba." against an expected "claim drake london.": the product
     working exactly as designed, and the assertion describing one night in
     September. A measurement is true of the board it was taken on.

     The lineup call takes two shapes because the tool has two honest
     answers - a swap worth making, or a lineup already optimal - and
     demanding the first would go red on any night the sample lineup
     happens to be right. */
  { hash: "#/calls/lineup", needs: /start .+ over .+\.|your lineup is already the best one\./ },
  { hash: "#/calls/wire", needs: /claim .+\./ },
  { hash: "#/calls/trade", needs: /ask for .+\./ },
  { hash: "#/method/how-it-works", needs: "How the Draft Room works" },
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
      /* One string or several, and several means "any of these is this
         screen" rather than "all of these are on it" — see the Now case
         above for the only reason that distinction exists. */
      /* A RegExp is allowed as well as a string, for the three calls whose
         headline names a player off tonight's board - see their entries.
         Already lower-cased by norm(), so the patterns are written that
         way rather than carrying an `i` flag. */
      const wanted = [].concat(c.needs);
      expect(
        wanted.some((w) => (w instanceof RegExp ? w.test(seen) : seen.includes(norm(w)))),
        `${c.hash} draws its own screen (wanted one of ${JSON.stringify(wanted.map(String))})`,
      ).toBe(true);

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

      /* Null on any screen that draws only one of the two. Skipped rather
         than failed: this asserts a RELATIONSHIP, and a screen missing one
         side of it is not in breach of it. It used to be null on exactly
         one route (#/rooms/draft, which mounted its own shell); after the
         cutover every screen is inside one shell, so a null here is worth
         a second look rather than a shrug. */
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
