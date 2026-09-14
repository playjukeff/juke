/* The cold-load overlay, on both shells.

   #boot-sonar is markup in web/index.html with an inline <style>, and its
   teardown is in web/src/main.jsx. That split is deliberate and documented —
   the overlay has to be styled before any bundle is readable — but it is also
   the whole risk surface, because a fixed element at z-index 9999 that outlives
   the load swallows every click on the page.

   So these are not "does the animation look nice" tests. They are: does it come
   down, does it come down everywhere, and what happens when the thing that
   takes it down never runs. */

import { test, expect, devices } from "@playwright/test";
import { openApp, SITE } from "./helpers.mjs";

const PHONE = { ...devices["iPhone 13"], defaultBrowserType: undefined };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

/* The overlay is markup in web/index.html, and at the time this file was
   written that markup was still an uncommitted work in progress. Rather than
   hold the tests back until it lands — or commit a spec that goes red on a
   build without it — the whole file skips when the served HTML has no
   #boot-sonar in it.

   CLAUDE.md's rule about skips applies and was followed: a skip that fires
   everywhere is indistinguishable in the output from one that fires correctly,
   so both directions were run. Against a build without the markup: 4 skipped,
   and the suite does not go red.

   Against a build carrying it, this file's own history is the cautionary
   tale rather than the reassurance: it recorded "4 passed" here for a while,
   and every one of those runs was actually failing for the same reason —
   the overlay was scoped to an installed-app cold launch only, and nothing
   in this suite ever made matchMedia('(display-mode: standalone)') true, so
   theme.js's data-standalone gate never fired and the whole overlay sat at
   display:none through every run, un-torn-down, un-everything. Not this
   test's premise, all four of them, identically, on a build carrying the
   exact overlay this comment claimed was passing. Confirmed by stashing
   every other change and re-running against untouched code — still 4 red.

   Fixed twice, in the wrong order. First with a matchMedia shim
   (standaloneContext(), briefly in helpers.mjs) to actually reach the
   installed-app code path under test — CDP's own
   Emulation.setEmulatedMedia with a display-mode feature is a silent no-op
   in this Chromium build, so a JS-level shim was the only thing that
   worked. That made the tests pass and was still fixing the wrong layer:
   the scoping itself turned out to be why nobody could see the overlay on
   an ordinary browser visit either, reported directly. The owner removed
   the installed-app restriction rather than the tests' inability to reach
   it, so the overlay now plays on every cold load and there is no
   standalone case left to shim — browser.newContext() reaches it directly,
   same as everything else in this suite. */
let hasOverlay = null;
test.beforeAll(async ({ request }) => {
  const res = await request.get(SITE + "/");
  hasOverlay = (await res.text()).includes('id="boot-sonar"');
});
test.beforeEach(() => {
  test.skip(!hasOverlay, "this build has no #boot-sonar in its HTML");
});

/* Records the overlay's whole life from before the document runs: whether it
   was ever painted at a visible opacity, and when it left the DOM. Installed
   with addInitScript so it is in place ahead of the inline <style>, which is
   the only way to catch a flash that resolves in 300ms. */
const PROBE = () => {
  window.__sonar = { seen: false, maxOpacity: 0, removedAt: null, existed: false, revealStart: null };
  /* performance.now() rather than a Date.now() delta, so removedAt is on the
     same clock as the start-pass stamp splash-boot.js writes and the two can
     be subtracted. */
  const tick = () => {
    const el = document.getElementById("boot-sonar");
    if (el) {
      window.__sonar.existed = true;
      const o = parseFloat(getComputedStyle(el).opacity) || 0;
      if (o > window.__sonar.maxOpacity) window.__sonar.maxOpacity = o;
      if (o > 0.02) window.__sonar.seen = true;
      /* When the composition actually began — read off the element, which is
         where splash-boot.js records it.

         This used to scan the animations and take the earliest start time,
         and got it wrong twice in two different ways: once by scanning a
         different set from the one main.jsx scanned (the mark's shadow root
         alone, against main.jsx's overlay-plus-shadow-root), and once by
         counting #boot-sonar's own dismissal failsafe as part of the picture.
         Both produced a plausible number that was not the one under test.

         There is nothing left to infer. Every finite layer now ships inert
         and splash-boot.js starts them in one pass, stamping the moment it
         does; that stamp IS the composition's zero, for this file and for
         main.jsx alike. */
      if (window.__sonar.revealStart == null) {
        const stamped = el.getAttribute("data-splash-started-at");
        if (stamped !== null) window.__sonar.revealStart = Number(stamped);
      }
    } else if (window.__sonar.existed && window.__sonar.removedAt == null) {
      window.__sonar.removedAt = performance.now();
    }
    if (performance.now() < 9000) setTimeout(tick, 16);
  };
  tick();
};

async function loadWithProbe(browser, opts, path = "#/") {
  const context = await browser.newContext(opts);
  await context.addInitScript(PROBE);
  /* `keepBootOverlay` because this file is the one that measures the overlay
     itself: openApp() otherwise waits it out (and removes it if it outstays
     its window), which is right for every other spec and would erase exactly
     what PROBE is here to record. */
  const page = await openApp(context, path, { keepBootOverlay: true });
  return { context, page };
}

for (const [label, opts] of [["a phone", PHONE], ["a desktop", DESKTOP]]) {
  test(`the cold-load overlay comes down on ${label}, and leaves nothing over the page`, async ({ browser }) => {
    const { context, page } = await loadWithProbe(browser, opts);
    await page.waitForTimeout(4600);

    const sonar = await page.evaluate(() => window.__sonar);
    expect(sonar.existed, "the overlay is in the served markup").toBe(true);
    expect(
      await page.evaluate(() => !!document.getElementById("boot-sonar")),
      "and it is gone once the page has loaded",
    ).toBe(false);

    /* The assertion that actually matters. An overlay left behind reports as a
       working page in every other check — the content is all there underneath
       it — and only a hit test finds it. */
    const reachable = await page.evaluate(() => {
      /* [data-hero-cta], not a text match. Three anchors on this page used
         to read "Enter the Draft Room" — the hero's, the closing band's and
         Header's sticky bottom bar — and the sticky one was first in
         document order. None of the three is on the page any more (Hero and
         Header were replaced by HomeAlive/ShellHeader; ClosingCta was taken
         off it), so the collision is gone and the reasoning is not: the
         marker is what says which control is the page's primary action, and
         that has now moved twice.
         It is also translated off-screen by `translate-y-full` while the hero
         CTA is visible, and a translated element still reports a non-zero box,
         so a height check does not exclude it. Hit-testing its centre asks
         about a point outside the viewport and gets null back, which reads as
         "something is covering the button" when nothing is. */
      const cta = [...document.querySelectorAll("[data-hero-cta]")]
        .find((el) => el.getBoundingClientRect().height > 0);
      if (!cta) return { found: false };
      // Short device profiles (iPhone 13 is 664 CSS px tall here) put the hero
      // CTA below the fold, and elementFromPoint only answers about the
      // viewport. Bring it into view first — the question is whether the
      // overlay is in the way, not where the page happens to be scrolled.
      /* `behavior: "instant"`, because index.css sets `scroll-behavior:
         smooth` on the root. A smooth scroll is ANIMATED, so the rect read
         on the next line is the position before it started - the CTA sits
         below the fold on this page (measured: top 1239 in a 720px
         viewport), elementFromPoint is asked about a point outside the
         viewport, and it answers null.

         Which this test then reported as "a click lands on the CTA, not on
         null" - a covered button on a page where nothing covers anything.
         The comment above anticipated a null hit and blamed the sticky
         bottom bar; the real cause is that the scroll had not happened
         yet. "instant" overrides the stylesheet and is synchronous, so the
         rect and the hit-test agree. */
      cta.scrollIntoView({ block: "center", behavior: "instant" });
      const b = cta.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        found: true,
        onTop: !!(hit && (hit === cta || cta.contains(hit))),
        hit: hit ? hit.tagName + "." + String(hit.className).slice(0, 40) : null,
      };
    });
    expect(reachable.found, "the hero CTA rendered").toBe(true);
    expect(reachable.onTop, `a click lands on the CTA, not on ${reachable.hit}`).toBe(true);

    await context.close();
  });
}

/* The loader is shown on every load, including a fast one — which is the
   reverse of what this file asserted first, and the reversal is deliberate.

   It used to assert that a warm load never painted the overlay: the fade-in was
   delayed 300ms and main.jsx removed the element while it was still at opacity
   0, on the argument that a flash of logo reads as a glitch. Measured against
   production, a warm load tore it down at 340ms having never exceeded opacity
   0 — so the owner had never seen their own loading state, and only visitors on
   Fast 4G (first visible 947ms) or slower ever did.

   The owner overruled that deliberately. The delay is gone and main.jsx holds
   the overlay for MIN_VISIBLE_MS (3100) measured from the reveal's own first
   painted frame, so it is seen every time and always for long enough to
   finish its own animation — on a slow connection as well as a fast one,
   which the earlier "measured from navigation start" version could not
   promise. See main.jsx's revealStart.

   Two bounds, not one. A floor, because the whole point is that it is actually
   seen. And a ceiling, because this now costs every visit about a second before
   content — a real price, paid by repeat visitors on a warm cache too — and the
   thing to catch is that price quietly growing. */
test("the loader is shown on every load, and does not outstay its welcome", async ({ browser }) => {
  const { context, page } = await loadWithProbe(browser, DESKTOP);
  await page.waitForTimeout(4600);
  const sonar = await page.evaluate(() => window.__sonar);

  expect(sonar.existed, "the overlay is in the served markup").toBe(true);
  expect(
    sonar.maxOpacity,
    `it reached full opacity (got ${sonar.maxOpacity}) on a warm local load`,
  ).toBeGreaterThan(0.9);

  /* The bounds are the overlay's own choreography rather than chosen numbers,
     and they are measured FROM THE START PASS rather than from navigation
     start. Both halves of that matter.

     The composition is 2700ms — the design package's figure, and the last
     thing in it is the eye bloom settling at 2650 with a 50ms hold. main.jsx
     then fades over 260ms and removes the element 280ms after beginning the
     fade, so a healthy load has removedAt at startPass + 2980.

     The deciding elements are split across two files this repository does not
     re-time by eye: the drop sequence is in index.html, the mark's rise, teeth
     and eyes are inside <juke-mark>'s shadow root, and juke-mark.js ships
     unedited. So 2700 is a published figure this repo matches rather than one
     it can derive. If it ever looks wrong, check the design package first.

     Relative, not absolute, and that is a fix rather than a tidy-up. These
     used to be offsets from the init script's own t0 — a claim about how long
     the whole page takes to load and only incidentally about the overlay. A
     render-blocking cross-origin font request delays the first painted frame,
     and the composition now starts at that frame rather than before it, so an
     absolute bound would fail for the fix as loudly as for a regression and
     pass on a fast run while a slow one shipped truncated.

     2800 for the floor rather than 2980: removedAt is sampled on a 16ms tick
     and the start pass waits two frames past first paint, so this carries a
     few frames of slack in both directions and a bound sitting exactly on the
     figure would flake. The ceiling is the real assertion — 3600 leaves room
     for a slow CI frame without admitting a hold that has quietly grown.

     The absolute ceiling stays as a separate, much looser assertion, because
     "relative to the start pass" stops meaning anything if the pass never
     runs: 8000 is #boot-sonar's own splash-boot-failsafe delay, past which
     two dismissals are fighting each other. */
  expect(sonar.revealStart, "the start pass stamped when the composition began").not.toBeNull();
  const held = sonar.removedAt - sonar.revealStart;
  expect(held, "it stays until the whole composition has arrived").toBeGreaterThan(2800);
  expect(held, "and it is gone inside a reasonable window").toBeLessThan(3600);
  expect(sonar.removedAt, "and never past its own failsafe").toBeLessThan(8000);

  await context.close();
});

/* The failure case, and the reason this file exists.

   The teardown is the last statement in main.jsx, so it runs only if that
   module runs. CLAUDE.md documents the exact deploy shape where it does not:
   Vite content-hashes the bundle into its filename, so a browser holding the
   previous index.html asks for an `assets/index-<hash>.js` that no longer
   exists and gets a 404. That already happened once here and shipped as "a
   blank Draft Room" — visibly broken, which is how it got reported.

   With an overlay in front of it the same event renders a full-screen branded
   obsidian panel instead, and a page that looks like it is loading for ever is
   a worse failure than one that looks broken, because nobody reports it as a
   bug. Measured before the fix: opacity 1, and a click at page centre landed on
   the overlay.

   The failsafe is a second CSS animation on the same element, so it needs no
   JavaScript at all — which is the whole point, since the missing JavaScript is
   the fault being survived. */
test("if the bundle never arrives, the overlay takes itself away", async ({ browser }) => {
  const context = await browser.newContext(DESKTOP);
  // Every module script, which is how the real failure presents: the classic
  // legacy scripts still load, React never mounts, main.jsx never runs.
  await context.route(/\/(assets\/index-.*\.js|src\/main\.jsx).*/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(SITE + "/#/", { waitUntil: "domcontentloaded" });

  // Just before the failsafe fires: it should still be up, because a loader
  // that gives up in two seconds is not a loader.
  await page.waitForTimeout(2000);
  const early = await page.evaluate(() => {
    const el = document.getElementById("boot-sonar");
    return el ? parseFloat(getComputedStyle(el).opacity) : null;
  });
  expect(early, "at 2s it is still holding the screen").toBeGreaterThan(0.9);

  // 8s delay + 600ms fade, plus slack.
  await page.waitForTimeout(7500);

  const state = await page.evaluate(() => {
    const el = document.getElementById("boot-sonar");
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      present: true,
      opacity: parseFloat(cs.opacity),
      pointerEvents: cs.pointerEvents,
      swallowsClicks: !!(hit && (hit === el || el.contains(hit))),
    };
  });

  // Still in the DOM — nothing removed it, and nothing can. What matters is
  // that it is no longer in the way.
  expect(state.present, "no JS ran, so the element is still in the document").toBe(true);
  expect(state.opacity, "but it has faded itself out").toBeLessThan(0.05);
  expect(state.swallowsClicks, "and a click at page centre no longer hits it").toBe(false);

  await context.close();
});
