/* The two things a phone did that a desktop never showed.

   Both were reported by someone using the app rather than by anything in the
   project, and both are one measurement each — which is the argument for
   having them here. */

import { test, expect, devices } from "@playwright/test";
import { openApp, createRoom } from "./helpers.mjs";

/* The phone is emulated on Chromium rather than run on WebKit.

   Everything asserted here is CSS and geometry — a computed font size, the
   distance between two boxes — and those are the same wherever they are
   measured. What is *not* the same is the behaviour that makes the font size
   matter: only Safari zooms in on a small field. So this catches the cause
   and cannot catch the symptom, which is the honest trade for not asking
   everybody to download a second browser engine.

   `npx playwright install webkit` and adding it as a project is the upgrade
   if that day comes — an app store submission would be the moment. */
const PHONE = { ...devices["iPhone 13"], defaultBrowserType: undefined };

/* Scoped to #view-home on purpose. The legacy setup screen is still in
   the document, display:none, and its selects are 14.5px — hidden elements
   still report a computed font size, so an unscoped sweep fails on markup no
   thumb can reach. */
const FIELD_READER = `window.readSmallFields = function () {
  return [...document.querySelectorAll("#view-home input, #view-home select, #view-home textarea")]
    .filter(function (el) { return el.type !== "checkbox" && el.type !== "radio"; })
    .filter(function (el) { return parseFloat(getComputedStyle(el).fontSize) < 16; })
    .map(function (el) { return (el.id || String(el.className)).slice(0, 40); });
}`;

/* Start a draft the way six of the tests below need one, and wait for the
   ROOM rather than for a duration.

   Every one of them used to be `startDraft(...); render(); waitForTimeout(700)`,
   and that has two independent holes in it:

   1. **`startDraft()` refuses without a board, and returns `false` saying
      so.** `players.js` and `stats.js` are deferred behind the cold-load
      reveal — `setupProblem()` answers "the board is loading" until they
      land — and no caller here ever read that boolean. So on any run where
      the deferred data is slow, the draft simply never started and the test
      went on to measure the Lobby. It does not fail there; it asserts
      against the wrong screen, which is the silent direction. Measured in a
      sandbox where a render-blocking font request stalls the reveal:
      `state.started` false, seven tests reporting missing elements that
      were never going to be drawn.

   2. **The room is not on screen when `state.started` flips.** That is
      synchronous inside `startDraft()`, while `DraftRoomLoader` holds a
      full-viewport layer over the room for a floor of its own — 400ms, then
      2100, then 500, and 2400 today. A flat 700 raced every one of those
      moves and is behind the current floor by 1700ms, so what these tests
      read is the loader.

   Both are conditions, so both are waited on as conditions. The floor is
   deliberately not written down here: a number in a spec is a number
   somebody has to find again every time it moves, which is the rule
   `helpers.mjs` already states about `startSoloDraft()`'s own version of
   this wait. */
async function startPhoneDraft(page, opts = { mySlot: 3, clockLength: 90 }, inSameTurn) {
  await page.waitForFunction(
    () => typeof dataReady === "function" && dataReady(),
    null,
    { timeout: 30000 },
  );
  /* `inSameTurn` runs between the start and the render, in that one
     synchronous turn, for the caller that needs its picks landed before
     startDraft()'s own CPU timer can fire. Serialized with toString() and
     rebuilt in the page, which is the same idiom this file already uses to
     ship sweepOverflow() across — a function reads as a function at the call
     site, where a statement string would not.

     The return value is asserted rather than discarded, which is the whole
     point: a refused start names itself here instead of surfacing as a
     missing element several assertions later, on a screen the test was
     never going to reach. */
  const started = await page.evaluate(({ o, extra }) => {
    const ok = window.JukeEngine.startDraft(o);
    if (ok && extra) new Function("return (" + extra + ")()")();
    render();
    /* The cockpit is at #/draft/live since the cutover, and the bare
       address is the LAUNCHER. Pressing Start in the UI navigates there;
       calling startDraft() through the bridge does not, so every caller of
       this helper was left on the launcher with a draft running behind it
       — and the failures landed on whatever each test looked for next,
       which reads as a missing screen rather than as a fixture that never
       arrived at one. */
    if (ok) location.hash = "#/draft/live";
    return ok;
  }, { o: opts, extra: inSameTurn ? inSameTurn.toString() : null });
  expect(started, "the draft actually started (a false here is setupProblem() refusing)").toBe(true);

  /* Wait for the cockpit, rather than for the loader's ABSENCE.

     That wait was `!document.querySelector("[data-draft-loader]")`, and
     the loader it names belongs to the legacy DraftRoom — still imported
     through DeferredPortals, so still mountable, and never removed on a
     path nothing navigates to. Waiting for it to go can therefore hang on
     a screen that is perfectly ready.

     A positive condition cannot fail that way: the tablist IS the cockpit,
     so this waits for the thing every caller actually needs and says so
     when it does not arrive. Same reasoning the board helper's own note
     gives for waiting on the table rather than on a click having landed. */
  await page.waitForFunction(
    () => {
      const t = document.querySelector('[role="tablist"][aria-label="Draft views"]');
      return !!t && t.getBoundingClientRect().height > 0;
    },
    null,
    { timeout: 20000 },
  );
}

test("no field is under 16px, or iOS zooms in and stays there", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  await page.evaluate(FIELD_READER);

  // A coarse pointer is what the rule keys on, so a test on a fine one proves
  // nothing about the phone it was written for.
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  /* Every field the app can put in front of somebody on a phone: the lobby,
     then the settings modal (which is where the scoring editor's forty-four
     number inputs live), then the live draft's player search. */
  await page.evaluate(() => {
    const root = document.getElementById("view-home");
    /* Matched on the button's TEXT as well as its aria-label: v3's
       launcher draws "Draft settings" as a visible label rather than
       hanging it off an attribute, so an aria-label-only match found
       nothing and the click threw on undefined — which reads as a missing
       screen rather than as a control that says the same thing a
       different way. */
    const openIt = [...root.querySelectorAll("button")].find((b) =>
      /draft settings/i.test(b.getAttribute("aria-label") || "") ||
      /draft settings/i.test(b.textContent || ""));
    if (!openIt) throw new Error("no Draft settings control on the launcher");
    openIt.click();
  });
  await page.waitForTimeout(400);

  /* The scoring rules are still folded away behind a row, and opening it
     is still the point: the inputs it holds are the whole reason this test
     visits the settings screen, and a version that stopped opening them
     would keep passing while checking nothing.

     What moved is only the label — "Scoring rules" is the SECTION heading
     now and the control under it reads "Edit all 49 scoring rules", which
     carries a count that changes with the rule table. So it is matched on
     aria-controls instead: the attribute names what the button opens, and
     it cannot go stale when a rule is added. */
  await page.evaluate(() => {
    const row = document.querySelector('button[aria-controls="v3-rule-editor"]');
    if (!row) throw new Error("no scoring-rules row on the settings screen");
    if (row.getAttribute("aria-expanded") !== "true") row.click();
  });
  await page.waitForTimeout(400);

  const fieldCount = await page.evaluate(() => {
    const m = document.querySelector('[role="dialog"]')
      || [...document.querySelectorAll("div")]
        .find((d) => (d.className || "").toString().includes("z-[80]"));
    if (!m) throw new Error("the settings drawer did not open");
    return m.querySelectorAll("input").length;
  });
  // The guard on the guard: the sweep below is only meaningful if the fields
  // are actually on screen, and "the section did not open" looks exactly like
  // "every field passed" to it.
  expect(fieldCount, "the scoring editor's own fields are rendered").toBeGreaterThan(20);

  const inModal = await page.evaluate(() => readSmallFields());
  expect(inModal, "every settings field clears the floor").toEqual([]);

  await page.evaluate(() => {
    const m = document.querySelector('[role="dialog"]')
      || [...document.querySelectorAll("div")]
        .find((d) => (d.className || "").toString().includes("z-[80]"));
    [...m.querySelectorAll("button")]
      .find((b) => /close draft settings/i.test(b.getAttribute("aria-label") || "")).click();
  });
  await startPhoneDraft(page);

  const inDraft = await page.evaluate(() => readSmallFields());
  expect(inDraft, "and so does every field in the draft itself").toEqual([]);

  /* The player-search field on the new phone Players tab is genuinely new
     markup (PlayersTabPhone.jsx) and is hidden behind a search toggle button
     until tapped, so the sweep above never actually rendered it — it would
     pass identically whether this field cleared the floor or not. Opened
     explicitly here so the redesign's own field is the one under test, not
     just the settings modal it happens to share a document with.

     The chat tab has an input too (ChatTabPhone.jsx), and it is not checked
     here: that panel only renders one once you are actually in a room
     ("Nobody to talk to here" otherwise, with no field at all), and standing
     up a room only to read one font-size would duplicate what room.spec.mjs
     and the two checks above already establish about this same blanket
     rule — `@media (pointer: coarse) { input, select, textarea { ... !important } }`
     in style.css applies to every field in the document by tag, Tailwind
     class or not, which is what makes the search field's 14px source
     (`text-sm`) beside it. */
  /* The search field is on the Pool directly now, and the toggle that used
     to hide it is gone.

     What this block did was open a search TOGGLE on the phone's Players
     panel, because the field lived behind it — and the reason it existed
     at all is the half worth keeping: the sweep above cannot see a field
     that has not rendered, so it "passed" identically whether that field
     cleared the floor or not. v3's Pool draws the field itself, so there
     is nothing to open; the guard that the field is genuinely on screen
     before the sweep is trusted is kept below, and is the whole reason
     this is a wait rather than a one-shot read.

     A one-shot `evaluate(...).find(...)` is the wrong shape here anyway:
     "not there yet" and "not there at all" come back identically, which
     is how the old version failed a full run and passed 12/12 on a rerun
     of the same file. */
  await page.waitForSelector('#view-home input[placeholder="Search players"]',
    { timeout: 20000 });

  await page.waitForTimeout(300);
  const searchFieldSize = await page.evaluate(() => {
    const input = document.querySelector('#view-home input[placeholder="Search players"]');
    return input ? parseFloat(getComputedStyle(input).fontSize) : null;
  });
  expect(searchFieldSize, "the Players tab's search field clears the floor too").toBeGreaterThanOrEqual(16);
  await context.close();
});

/* This was "the lobby chat does not sit on top of the Start button", and the
   thing it guarded no longer exists: the docked chat's `top: 8px` survived
   into the lobby's `position: relative` as an 8px shove downwards with the
   layout box left behind, so the dock hung over the button beneath it. There
   is no chat dock in the React lobby.

   The *intent* survives and is worth more than the mechanism, so it is kept
   rather than deleted: the one control this screen exists to get you to press
   must actually be pressable. Anything landing on top of it — a dock, a
   sticky bar, a modal that forgot to close — fails this the same way.

   Unaffected by the phone board-peek redesign: this is the pre-`started`
   Locker/lobby screen, and DraftRoom.jsx's `isPhone` branch is only taken
   once a draft is `started` (see that file's own `if (!started)` early
   return, well before it). A phone in the lobby sees exactly what this test
   already checks. */
test("nothing is sitting on top of the Start button", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  await page.waitForTimeout(600);

  /* Scrolled to with Playwright rather than inside the page, and that is
     not a style preference: v3's launcher puts the button below the fold
     on a phone (top 732 in a 664px viewport, under the resume card and the
     recent drafts), and an in-page `scrollIntoView()` moved it by exactly
     nothing — the shell scrolls an inner container, not the document, so
     the element's own scrollIntoView had no scroller to act on. Playwright
     walks the ancestors and scrolls whichever one actually scrolls.

     Being below the fold is a layout decision rather than the defect here.
     The defect is something PAINTING OVER the button — a chat dock whose
     `top: 8px` survived into a relative position, in the original report —
     and a thing on top of it is on top of it wherever the page sits. So
     the hit-test carries the assertion and the viewport check only says
     the scroll worked. */
  await page.locator("#view-home [data-start-draft]").first().scrollIntoViewIfNeeded();

  const r = await page.evaluate(() => {
    const root = document.getElementById("view-home");
    /* [data-start-draft], and the attribute exists because of this test.

       This used to be a regex of every name the button has ever had —
       "Enter Draft Room", "Start draft", "Start mock draft" — and it grew
       one alternative per rename until the phone's own Mock Drafts screen
       called it "Start a mock draft" and the regex missed by one word.
       The property under test (the one CTA this screen exists to get you
       to press has to be pressable) never had anything to do with the
       label. Both the lobby's button and the phone screen's carry the
       attribute, and exactly one of them is on screen at a time. */
    const btn = [...root.querySelectorAll("[data-start-draft]")]
      .find((b) => b.getBoundingClientRect().height > 0);
    if (!btn) return { found: false };
    const b = btn.getBoundingClientRect();
    // Whatever the browser says is actually under the pointer at the button's
    // own centre. Geometry rather than a screenshot, because the answer is
    // "would this click land", not "does it look right".
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    /* Its CENTRE on screen, not its whole box. The box test was
       `b.top >= 0 && b.bottom <= innerHeight`, which asks a second question
       — does this control fit entirely above the fold — that v3's launcher
       answers differently and that has nothing to do with the defect here.
       What the hit-test below needs is that the point it probes is a point
       the viewport actually contains; anything stricter reports a page
       that scrolls as a page that is broken. */
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    return { found: true, onTop: !!(hit && (hit === btn || btn.contains(hit))),
             hit: hit ? hit.tagName + "." + String(hit.className).slice(0, 30) : null,
             inViewport: cy >= 0 && cy <= innerHeight && cx >= 0 && cx <= innerWidth };
  });

  expect(r.found, "the lobby offers a Start button").toBe(true);
  expect(r.inViewport, "and it is on the screen").toBe(true);
  expect(r.onTop, `a click at its centre lands on it, not on ${r.hit}`).toBe(true);
  await context.close();
});

/* An element wider than its box is not a fault on its own — a truncated
   team name is behaving exactly as intended. The question is whether it can
   either scroll or ellipsise. Anything that can do neither is the leak. */
function sweepOverflow() {
  const out = [];

  /* The tolerance is tied to the device pixel ratio, and that is not a
     fudge factor - it is the measurement's own resolution.

     clientWidth rounds and scrollWidth ceils, so a box whose real width is
     fractional reports the two integers disagreeing by a pixel or two with
     nothing wrong at all. On a device at dpr 3 - which is what an iPhone 13
     is - every nested flex row in a 112px board cell lands on thirds, and
     the whole board reported `over=2` on three elements per card.

     That cost a wrong fix before it was measured: eleven "leaks" were
     chased into the board card and none of them existed. The same page at
     dpr 1 reports zero. So the check keeps its edge where it can see one
     and stops inventing them where it cannot. */
  const slack = devicePixelRatio > 1 ? 2 : 1;

  document.querySelectorAll("#view-home *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (el.scrollWidth <= el.clientWidth + slack) return;
    if (el.tagName === "INPUT") return;            // an input scrolls its own value
    const c = getComputedStyle(el);
    const scrolls = /auto|scroll/.test(c.overflowX);
    const ellipsises = c.textOverflow === "ellipsis" && c.overflow !== "visible";
    if (scrolls || ellipsises) return;

    /* Visually-hidden text is not a leak, and cannot be one.

       An `sr-only` span is 1px square with its content clipped away — the
       standard screen-reader-only recipe — so it "overflows its box" by
       construction, by however long the sentence is: this sweep reported
       `SPAN.sr-only over=109` and `P.sr-only over=373` on a cockpit where
       nothing was wrong. No sighted reader can reach that text because no
       sighted reader can see it, which is the opposite of the question
       being asked here.

       Exempted by the property that hides it rather than by the class
       name: anything clipped to nothing is invisible whatever it is
       called, and a class allow-list would miss the next helper that does
       the same thing under another name. */
    const clipped = c.clipPath === "inset(50%)" || /rect\(0px,\s*0px,\s*0px,\s*0px\)/.test(c.clip);
    if (clipped && b.width <= 2 && b.height <= 2) return;

    /* A decoration hung deliberately outside its box is not a leak.
       The position badge on an avatar sits at -bottom-1 -right-1, so its
       wrapper measures ~4px of overflow on every one of them — 190 of the
       193 this sweep first reported. Nothing is unreachable there: the
       question this test asks is whether *content* has been put somewhere
       a thumb cannot get to, and an absolutely-positioned child placed
       past the edge on purpose is the opposite of that.

       Checked by asking what actually sticks out rather than by
       allow-listing a class or waving a pixel threshold at it — a
       threshold would hide a genuinely clipped short label. */
    const overflowingKids = [...el.children].filter((k) => {
      const kb = k.getBoundingClientRect(), eb = el.getBoundingClientRect();
      return kb.right > eb.right + 1 || kb.left < eb.left - 1;
    });
    const allDecoration = overflowingKids.length > 0 &&
      overflowingKids.every((k) => getComputedStyle(k).position === "absolute");
    if (allDecoration) return;

    out.push(el.tagName + "." + String(el.className).slice(0, 30) + " over=" + (el.scrollWidth - el.clientWidth));
  });
  return out;
}

test("nothing overflows sideways that cannot scroll or ellipsise", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  /* The picks run in the same synchronous turn as the start, which is what
     the third argument is for. Same reason board-card.spec.mjs and
     board-marks.spec.mjs both call stopSim(): startDraft() ends in
     runCPUs(), and this loop drives every pick itself without cancelling
     that timer. Thirty picks in leaves seat 9 on the clock, so it would go
     on drafting six more at 350ms each — straight through the wait and into
     the four-tab sweep below, which reads every element's box on each tab in
     turn. A board mutating between tabs is a sweep whose results are not
     comparable. */
  await startPhoneDraft(page, { mySlot: 3, clockLength: 90 }, () => {
    stopSim();
    for (let i = 0; i < 30; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
  });
  await page.evaluate((fn) => { window.__sweep = new Function("return (" + fn + ")()"); }, sweepOverflow.toString());

  /* Swept once per VIEW, not just on whatever the draft opens on. The
     reason is unchanged and is why this is a loop: the original
     single-view sweep is exactly what let the rank column's overflow ship
     — three-digit ranks in a cell built for two, colliding with the Draft
     button beside them on well over half the board, `scrollWidth 20`
     against `clientWidth 16`, fixed by widening the cell rather than by
     loosening this sweep.

     The views were the bottom sheet's tabs (Players / Queue / Team /
     Chat). v3's phone draft has no sheet: it is one view at a time off the
     rail, and they are Pool / Board / Team / Grade. Read off the tablist
     rather than named here, so a fifth view is swept the day it ships and
     a renamed one does not read as a missing control — which is how this
     loop failed, on a cockpit that was rendering perfectly. */
  const byTab = {};
  const views = await page.getByRole("tab").all();
  expect(views.length, "the cockpit draws its views").toBeGreaterThan(2);
  for (const view of views) {
    const label = (await view.textContent()).trim();
    await view.click();
    await page.waitForTimeout(350);
    byTab[label] = await page.evaluate(() => window.__sweep());
  }
  for (const [label, leaks] of Object.entries(byTab)) {
    expect(leaks, `the ${label} tab`).toEqual([]);
  }

  // And the player profile overlay, opened from the Players tab — its own
  // full-screen surface (PlayerProfilePhone.jsx) with a four-way tab strip
  // of its own, swept the same way.
  await page.getByRole("tab", { name: /^Pool/ }).click();
  await page.waitForTimeout(350);
  /* The row's own name button, which is what opens the drawer.

     It used to be found by `p.truncate` — the legacy row's name element —
     and v3 draws spans, so that matched nothing and threw "no player row
     to open a profile from" on a pool full of rows.

     A locator rather than an evaluate, for the reason this file states
     twice already: a one-shot `evaluate(...).find(...)` cannot tell "not
     there yet" from "not there at all", and this runs immediately after a
     view change. The row's name button is the one control in the row that
     carries a headshot beside its text. */
  /* `li`, not `tr`. Pool.jsx renders two different row shapes and the
     phone gets the LIST one — the table is the desk-width path — so a
     `tbody tr` locator waits its whole timeout on a pool of eighty-one
     list items. The headshot is what separates a player row from the
     dividers and the show-more control in the same list. */
  const firstPlayer = page.locator("#view-home li button").filter({ has: page.locator("img") }).first();
  await firstPlayer.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(350);
  const profileLeaks = await page.evaluate(() => window.__sweep());
  expect(profileLeaks, "the player profile overlay").toEqual([]);

  expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBe(false);
  await context.close();
});

/* ---------------------------------------------------------------------------
   The mobile handoff's own artboards, checked against what actually renders.
   Three separate failures, all found by measuring the built page against
   `Juke Mobile.dc.html` rather than by reading the components.
   ------------------------------------------------------------------------- */

/* Artboard 1a puts the hero's eyebrow 36px under a 56px header. It was at
   206px, because <main> carried a flat pt-[108px] — the header's real height
   at lg+, where the nav is h-16 and the ticker is on. Below lg the ticker is
   `hidden lg:block` and the nav is h-14, so 51px of that padding sat over
   nothing, on top of Hero's own pt-[92px].

   The assertion is the gap between the header's bottom edge and the first
   thing under it, not an absolute offset — an absolute number would have to
   move every time the header's own height did, and the defect is the
   relationship between the two, not either one. */
test("the homepage hero starts under the header, not a screen below it", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/");
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const root = document.getElementById("view-home");
    // The VISIBLE header. There are two homepages in this document now and
    // each has one; the desktop tree's is CSS-hidden at this width and
    // reports a zero rect, which would make the gap below meaningless
    // rather than wrong — and it happens to be second in document order
    // today, so a bare querySelector passes for a reason that could change.
    const header = [...root.querySelectorAll("header")]
      .find((h) => h.getBoundingClientRect().height > 0);
    /* [data-hero-eyebrow], and the attribute is the fix for two rounds of
       this same failure.

       It first matched the slogan's own words and found nothing, because
       the text is uppercased in CSS and title case in the source — the
       DOM never spelled it the way this compared. That was repaired with
       a case-insensitive compare on leaf <span>/<div> nodes.

       Then the homepage became two homepages. The phone's own hero draws
       its eyebrow as a <p> with an icon inside it, so it is neither a
       leaf nor a span, and the desktop one is CSS-hidden at this width
       and reports zero height — nothing matched again. The property this
       test measures is the gap between the fixed header and the first
       thing under it, and it has never had anything to do with what that
       thing says or which element it is.

       Both eyebrows carry the attribute; the visible one is whichever
       homepage this width renders. */
    const eyebrow = [...root.querySelectorAll("[data-hero-eyebrow]")]
      .find((e) => e.getBoundingClientRect().height > 0);
    if (!header || !eyebrow) return { found: false };
    const hb = header.getBoundingClientRect().bottom;
    /* The first thing under the header, whatever it is — not the hero's
       own eyebrow specifically.

       That is a third round of the same lesson. The gap was measured to
       the eyebrow because the eyebrow WAS the first thing under the
       header; v3's Now puts a season band above the hero, so the eyebrow
       sits 143px down and the old measurement reported a screenful of
       empty page on a screen that has none.

       The defect this catches is dead space between the fixed header and
       the content — 149px of it, from a flat pt-[108px] written for the
       desktop header's height. Measuring to whichever element actually
       comes first says exactly that and stops being a claim about which
       component the page happens to lead with. */
    let firstTop = Infinity, firstWhat = null;
    root.querySelectorAll("*").forEach((el) => {
      if (el === header || header.contains(el)) return;
      const b = el.getBoundingClientRect();
      if (b.width < 8 || b.height < 8) return;
      if (b.top < hb - 1) return;              // above or behind the header
      if (b.top < firstTop) { firstTop = b.top; firstWhat = el.tagName + "." + String(el.className).slice(0, 30); }
    });
    return {
      found: true,
      headerBottom: hb,
      eyebrowTop: eyebrow.getBoundingClientRect().top,
      firstTop, firstWhat,
    };
  });

  expect(r.found, "the phone hero draws its own eyebrow").toBe(true);
  // 36px in the artboard. 60 is slack for the line box the span sits in; the
  // bug this catches was 149px of gap, not five.
  expect(r.firstTop - r.headerBottom,
    `the gap between the fixed header and the first thing under it (${r.firstWhat})`)
    .toBeLessThan(60);
  await context.close();
});

/* Was "Decide leads with the recommendations, not the roster rail" — a
   phone-specific recommendation screen (JukeValueAssistant / DraftDecideScreen)
   that has been retired outright by the board-peek redesign rather than
   replaced one-for-one. Below 640px `DraftRoom.jsx` now returns
   `<DraftRoomPhone>` in place of the whole desktop/tablet render tree (see
   its own `if (isPhone && view !== 'insights')`), and DraftRoomPhone has no
   "Decide" concept anywhere in it: neither `DraftDecideScreen` nor
   `JukeValueAssistant` is imported by anything under `web/src/components/
   phone/`. Rewriting this test to look for "What Juke would do" would be
   asserting a screen the phone build no longer has an opinion about, which
   is the "premise gone" case CLAUDE.md's own testing section describes
   rather than a stale selector.

   What survives is the underlying claim, restated for what actually replaced
   it: the phone draft room has to put you in a position to draft the moment
   it opens, not behind a screen of furniture you have to get past first —
   which the four-tab board-peek sheet does differently, by opening straight
   on the Players list with a live Draft button rather than on a recommend-
   first intermediate screen at all. */
test("the live draft opens ready to draft, not behind extra taps", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  // Seat 0, so pick 1.01 is mine and the Draft button on the top row is
  // enabled rather than greyed out for not being my turn.
  await startPhoneDraft(page, { mySlot: 0, clockLength: 90 });

  /* v3's phone cockpit is a tablist and a docked call bar, not a bottom
     sheet with four tabs in it.

     What this test is FOR survives that whole: a draft opened on a phone
     has to be ready to draft. The old shape asserted it through the sheet's
     own tab set, which was the only place those four labels existed; v3
     draws its views as real tabs — Pool, Board, Team, Grade — and puts the
     Draft button on a dock pinned above the safe area. So the tab set moves
     and the two things worth guarding do not: it opens on the PLAYER LIST
     rather than a middle step, and the Draft button is on screen with
     nothing to scroll past first.

     Read through roles rather than class strings, which is what stops this
     breaking again on the next restyle. */
  const r = await page.evaluate(() => {
    const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const tabs = [...document.querySelectorAll('[role="tab"]')].filter(seen);
    const active = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    const draftBtn = [...document.querySelectorAll("button")]
      .find((x) => seen(x) && /^draft$/i.test(x.textContent.trim()) && !x.disabled);
    return {
      tabLabels: tabs.map((t) => t.textContent.trim()),
      activeTab: active ? active.textContent.trim() : null,
      draftBtnTop: draftBtn ? draftBtn.getBoundingClientRect().top : null,
      viewport: innerHeight,
    };
  });

  /* Pool is the player list; Team holds the roster, the queue and the picks
     feed behind its own segments, which is where Queue went. Chat is a fifth
     view and only in a room, so a solo draft draws four. */
  expect(r.tabLabels.sort(), "the cockpit offers exactly Board/Grade/Pool/Team")
    .toEqual(["Board", "Grade", "Pool", "Team"]);
  expect(r.activeTab, "and it opens on the player list, not a middle step").toBe("Pool");
  expect(r.draftBtnTop, "with an enabled Draft button already on screen").not.toBeNull();
  expect(r.draftBtnTop, "above the fold, with nothing to scroll past first")
    .toBeLessThan(r.viewport);
  await context.close();
});

/* Not a phone width, deliberately.

   The original bug: DraftCockpitHeader's tab nav was `md:flex` and
   MobileDraftTabBar is `lg:hidden`, so between 768px and 1023px both were on
   screen — and the header's nav was handed the raw setView, which does not
   clear hubOpen the way openHub and selectMobileView both do. Tap Roster in
   the bottom bar, then Decide in the header, and PlayerHub unmounts (it only
   mounts in the view !== 'decide' branch) while the bottom bar goes on
   drawing Roster as the selected tab.

   A tab bar claiming a tab that is not on screen is the failure CLAUDE.md's
   goToTab() note names: the app is on a tab its own nav says it is not.

   **That overlap no longer exists, and this test is now what says so.**
   612375f made the header `hidden lg:grid` once a draft is under way, so
   below lg there is only the bottom bar and at lg and above only the header —
   the two navs are never on screen together, and the bug is prevented by
   construction rather than by the handler being fixed.

   So the assertion moved to the guarantee instead of the symptom. Written
   the old way it went red for the best possible reason (the setup it needed
   could not be built any more) and read like a regression, which is the worst
   possible way to be told. It also silently stopped discriminating: both navs
   carry all four labels now, so readBars()'s "the one with Players" and "the
   one with Analysis" resolved to the same element and `bothVisible` was
   comparing a nav with itself.

   Both widths are checked, because "never both" is only true if it holds on
   each side of the breakpoint, and the surviving nav still has to select a
   tab whose panel is really mounted.

   Untouched by the board-peek redesign: 900px and 1280px both sit above the
   phone gate (`usePhoneWidth()` is `!useMinWidth(640)`), so DraftRoom.jsx
   never takes the `isPhone` branch at either width and this test still
   exercises exactly the tablet/desktop nav it always did. */
/* v3 draws its views as real tabs rather than as two navs, so the READER
   is roles now and the loop below asserts the same guarantee it always did.

   The original bug: the header's nav was `md:flex` and the bottom bar
   `lg:hidden`, so between 768 and 1023 both were on screen, and tapping one
   left the other marking a tab whose panel had unmounted. `aria-selected`
   is what says which tab a nav claims, and `aria-controls`/`role=tabpanel`
   is what says whether that tab's panel is really mounted — so the check
   needs no class string and no list of which component draws which bar. */
const BAR_READER = `window.tabState = function () {
  var seen = function (el) {
    var b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  /* The cockpit's VIEW tabs, not every tab on the screen. At 1280 the
     right-hand sheet carries its own tablist — Roster / Queue / Picks — and
     that is a second, independent set rather than a second copy of this
     one: the bug this test exists for is two navs claiming the same view.
     Named rather than matched on a container class, because the names are
     what the product is about and a wrapper is what gets restyled. */
  /* The cockpit's VIEW tabs, found through the tablist that names itself.

     Not every [role=tab] on the screen: at 1280 the right-hand sheet
     carries its own — Roster / Queue / Picks — and that is a second,
     independent set rather than a second copy of this one. The bug this
     test exists for is two navs claiming the same view, so the set under
     test is the one whose tablist says "Draft views", which is also what
     startPhoneDraft() already waits for.

     Matching by NAME would not have done it and was tried: the rail's own
     roster tab reads "Team0/14" and the cockpit's reads "Poolp" (a desktop
     tab's <kbd> shortcut sits inside it with no separator, so there is no
     whitespace to split on), which is a prefix collision in one direction
     and an exact-match failure in the other. */
  var strip = document.querySelector('[role="tablist"][aria-label="Draft views"]');
  var nameOf = function (el) {
    var kbd = el.querySelector("kbd");
    var t = el.textContent;
    if (kbd) t = t.slice(0, t.length - kbd.textContent.length);
    return t.trim();
  };
  var tabs = strip
    ? [].slice.call(strip.querySelectorAll('[role="tab"]')).filter(seen)
    : [];
  var names = tabs.map(nameOf);
  var panels = [].slice.call(document.querySelectorAll('[role="tabpanel"]'))
    .filter(function (p) {
      return seen(p) && names.indexOf((p.getAttribute("aria-label") || "").trim()) >= 0;
    });
  return {
    tabs: tabs.map(nameOf),
    active: tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true" })
      .map(nameOf),
    /* One panel, and it is labelled with the tab that is selected. Two
       panels, or a panel naming a tab nothing has selected, is the failure
       this test exists for. */
    panels: panels.map(function (p) {
      return (p.getAttribute("aria-label") || "").trim();
    })
  };
};
window.tapTab = function (name) {
  var strip = document.querySelector('[role="tablist"][aria-label="Draft views"]');
  /* Named the same way tabState() names them — kbd stripped, then trimmed —
     rather than by a prefix test. A tab's own icon can put whitespace in
     front of its label, so indexOf(name) === 0 matched nothing at 1280 and
     threw on undefined: a dead control name reported as a type error, which
     is how this test failed the last two times it was re-aimed. */
  var hit = [].slice.call(strip.querySelectorAll('[role="tab"]')).filter(function (x) {
    var kbd = x.querySelector("kbd");
    var t = x.textContent;
    if (kbd) t = t.slice(0, t.length - kbd.textContent.length);
    return t.trim() === name;
  })[0];
  if (!hit) throw new Error("no draft view tab named " + name);
  hit.click();
}`;

for (const width of [900, 1280]) {
  test(`the draft tab bar never marks a tab whose panel is not mounted (${width}px)`,
    async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await openApp(context, "#/draft");
      await startPhoneDraft(page);
      await page.evaluate(BAR_READER);

      /* The guarantee that retired the bug: one set of view tabs at any
         width, and exactly one of them selected. Both widths, because
         "never two" is only true if it holds either side of a breakpoint. */
      const open = await page.evaluate(() => tabState());
      expect(open.active.length,
        "exactly one view tab is marked, which is what makes two navs "
        + "disagreeing impossible").toBe(1);
      expect(open.panels.length, "and exactly one panel is mounted").toBe(1);
      expect(open.panels[0], "the mounted panel is the selected tab's")
        .toBe(open.active[0]);

      /* Then move, and check the pair moved together. Grade rather than the
         retired "Decide": v3's views are Pool / Board / Grade, and a tab
         name that no longer exists throws on undefined — a dead control
         reported as a type error, which is how this test last went red. */
      for (const name of ["Board", "Grade", "Pool"]) {
        await page.evaluate((n) => tapTab(n), name);
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => tabState());
        expect(after.active, `${name} is selected`).toEqual([name]);
        expect(after.panels, `and ${name}'s own panel is what is mounted`)
          .toEqual([name]);
      }
      await context.close();
    });
}

/* The draft entry screen stacks on a phone, and for one release it did not.

   `min-h-0` is right on the three columns at lg — it is what lets each one
   shrink so the board inside can scroll. Below lg the same three become
   *rows* dividing one flex-1 height, and there `min-h-0` strips the centre
   row's min-content floor: the grid handed it 40px against 374px of content,
   so the headline, the seat board and the first-pick banner painted straight
   over the board preview beneath them. Reported from a phone as overlapping
   text on top of the settings list.

   Nothing about it is visible to a box-intersection check, which is worth
   saying because that is the obvious test to write and it passes against the
   bug. The three row *boxes* tile perfectly — 301, 40, 472, laid end to end
   and never intersecting. What overlaps is the centre row's *content*
   escaping its own border box, so the measurement that sees it is the one
   CLAUDE.md already prescribes for a leak: scrollHeight against clientHeight
   on a box that can neither scroll nor ellipsise.

   The second assertion is the other half of the same bug and would survive
   the first being fixed alone: the wrapper was `overflow-hidden` at every
   width, so even uncrushed the screen was simply cut off at the fold with
   nothing able to scroll to the rest of it.

   It is reached through a room now, and that is not a workaround. The entry
   screen renders on `!started`, and solo no longer passes through it at all:
   handleStartNew() calls beginDraft() straight from the lobby, so the only
   remaining way in is enterDraftRoom(), which only the friends flow calls.
   Clicking "Start mock draft" and looking for the grid — what this test used
   to do — now measures the loader, finds nothing, and says "the entry screen
   is the one under test", which is true and reads like a layout regression.

   The screen itself is unchanged and still ships, so the guard is worth
   keeping rather than deleting; a phone in a room is exactly who sees it.
   Unaffected by the board-peek redesign for the same reason the Start-button
   test above is: this whole screen renders on `!started`, before
   DraftRoom.jsx's `isPhone` branch is ever reached. */
test("the room lobby stacks on a phone instead of painting over itself", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");

  const code = await createRoom(page);
  expect(code, "a room was created, which is the only way to the room lobby")
    .toBeTruthy();

  /* v3's room lobby is the screen this now measures, and the shape of the
     original bug cannot occur in it.

     That bug was a fixed-height three-row flex whose centre row carried
     `min-h-0` — right at lg, where the three are COLUMNS and each has to be
     able to shrink so the board inside can scroll, and wrong below it,
     where the same rule strips the row's min-content floor and its content
     paints over its neighbour. RoomLobby.jsx is an ordinary
     document-flow grid: one column on a phone, `items-start`, no fixed
     height and no `min-h-0` anywhere, so no row can be handed less height
     than its own content needs.

     What survives is the REQUIREMENT rather than the arrangement, and it is
     the one CLAUDE.md prescribes for a leak in general: a section that
     overflows its own box and can neither scroll nor ellipsise is a section
     painting on whatever is under it. Asserted against every section of the
     lobby rather than against three named rows, so it keeps holding as the
     screen gains and loses panels. */
  await page.waitForFunction(() => {
    const root = document.getElementById("view-home");
    return [...root.querySelectorAll("div")].some((d) => typeof d.className === "string"
      && d.className.includes("lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"));
  }, null, { timeout: 15000 });

  const r = await page.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find(
      (d) => typeof d.className === "string" &&
        d.className.includes("lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"));
    if (!grid) return { missing: true };
    const spill = (c) => {
      const cs = getComputedStyle(c);
      // A box that scrolls is allowed to overflow; that is what it is for.
      if (/auto|scroll/.test(cs.overflowY)) return 0;
      return c.scrollHeight - c.clientHeight;
    };
    return {
      spills: [...grid.children].map(spill),
      cols: getComputedStyle(grid).gridTemplateColumns,
      /* The other half of the same bug and one that would survive the first
         being fixed alone: even uncrushed, a wrapper that clips at the fold
         leaves the rest of the screen unreachable. */
      docClips: document.documentElement.scrollHeight > innerHeight,
      docScrolls: /auto|scroll|visible/.test(getComputedStyle(document.body).overflowY),
    };
  });

  expect(r.missing, "the room lobby is the screen under test").toBeFalsy();
  expect(r.spills, `no section overflows its own box (columns were ${r.cols})`)
    .toEqual(r.spills.map(() => 0));
  // Taller than the phone by design, so the requirement is not that it fits
  // — only that all of it can be reached.
  if (r.docClips) {
    expect(r.docScrolls,
      "content taller than the viewport has to be scrollable, not clipped")
      .toBe(true);
  }
  await context.close();
});


/* Every player is reachable on the Players tab, on a phone.

   This used to be about `PlayerHub` — the desktop/tablet mobile-nav's own
   Players pane — and it isn't that component any more on a phone below
   640px: `DraftRoomPhone` mounts `PlayersTabPhone` instead, a fresh list
   built for the bottom sheet rather than a resized copy of the tablet one.
   The three things that had to be true are the same three things worth
   asking about *any* scrollable list in a fixed-height container, so the
   underlying check survives even though nothing about its old selectors
   does: the scroller has to have `min-h-0` (or it pins to its content and
   never scrolls at all), the panel around it has to fit its own container
   rather than inflating past it, and enough of it has to be visible at once
   to be a list rather than a sliver.

   `d.querySelector("table")` used to be what told this list apart from
   DraftBoardPeekPhone's own identically-classed `min-h-0 flex-1` wrapper —
   there is no `<table>` any more (see the row-layout rewrite below this
   test), so the marker is a descendant carrying `overflow-x-auto` instead:
   every player row owns one of those for its own independent horizontal
   scroll, and the board peek has nothing that scrolls sideways at all.

   The tab is opened through #view-home deliberately, and by clicking
   through the real Lobby ("Start mock draft") rather than the
   `window.JukeEngine.startDraft()` bridge the other tests in this file use —
   the same reasoning `startSoloDraft()` in helpers.mjs already gives for
   driving a real journey rather than the shortcut: it is the path a person
   actually takes, and it is the one that would have caught the "second Start
   button that no longer exists" class of bug on its own. Players is already
   the sheet's default tab, so the click on it below is a real tap on an
   already-selected control — kept rather than skipped, in case the default
   ever changes and stops being a no-op. */
test("every player on the Pool view is reachable on a phone", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");

  /* Driven through the real Start button rather than the bridge, which is
     the same reasoning startSoloDraft() gives: it is the path a person
     takes, and it is the one that catches a control that has quietly
     stopped existing.

     The board first, and only then the button. `setupProblem()` answers
     "the board is loading" until the deferred data lands and the Start
     button is disabled for exactly that long, so a click before it reports
     a missing screen fifteen seconds later with nothing naming the cause. */
  await page.waitForFunction(
    () => typeof dataReady === "function" && dataReady(),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("#view-home [data-start-draft]")]
      .find((x) => x.getBoundingClientRect().height > 0);
    if (!b) throw new Error("no [data-start-draft] on screen in #view-home");
    b.click();
  });
  // The cockpit's own tablist, which is what startPhoneDraft() waits for too.
  await page.waitForFunction(() => {
    const t = document.querySelector('[role="tablist"][aria-label="Draft views"]');
    return !!t && t.getBoundingClientRect().height > 0;
  }, null, { timeout: 20000 });

  const r = await page.evaluate(() => {
    /* Pool is the view a draft opens on, so there is nothing to press —
       the tap this test used to make was already a no-op on a selected
       tab. The panel is found by the role that says it IS the panel,
       rather than by a bottom sheet's fixed/z-30 signature: v3 has no
       sheet, and a class match against one resolves to whatever else on
       the screen happens to be fixed. */
    const panel = [...document.querySelectorAll('[role="tabpanel"]')]
      .find((e) => (e.getAttribute("aria-label") || "").trim() === "Pool");
    if (!panel) return { missing: true };
    /* Its scroller, found by BEING one and by holding the rows — v3 lays a
       player out as an <li> rather than a table row, and the Board view's
       own wrapper carries the same utility classes, so a class match
       silently measures the wrong list. */
    const list = [...panel.querySelectorAll("div")]
      .find((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.querySelector("li"));
    if (!list) return { missing: true };
    const pb = panel.getBoundingClientRect(), lb = list.getBoundingClientRect();
    list.scrollTop = 999999;
    const maxScroll = Math.round(list.scrollTop);
    list.scrollTop = 0;
    // Rows counted by the live board's own names, which cannot be mistaken
    // for a header or a control.
    const names = new Set((typeof board === "object" ? board : []).map((p) => p.name));
    const txt = (e) => e.textContent.trim();
    return {
      missing: false,
      rows: [...list.querySelectorAll("li")]
        .filter((li) => [...li.querySelectorAll("*")].some((e) => names.has(txt(e)))).length,
      panelOverflow: panel.scrollHeight - panel.clientHeight,
      visibleListPx: Math.round(Math.min(lb.bottom, pb.bottom, innerHeight) - lb.top),
      listCanScroll: list.scrollHeight > list.clientHeight + 1,
      maxScroll,
    };
  });

  expect(r.missing, "the Pool panel and its scroller are both mounted").toBeFalsy();
  expect(r.rows, "the board's own names are on screen").toBeGreaterThan(50);
  expect(r.panelOverflow, "the panel fits its container instead of inflating past it")
    .toBeLessThanOrEqual(4);
  expect(r.listCanScroll, "the list scrolls").toBe(true);
  expect(r.maxScroll, "and scrolling reaches the far end of it").toBeGreaterThan(1000);
  expect(r.visibleListPx, "with enough of it on screen to be a list").toBeGreaterThan(150);
  await context.close();
});


/* ---------------------------------------------------------------------------
   New coverage for the board-peek redesign itself, below. Nothing above this
   line existed to guard the bottom sheet, the four-tab nav or the player
   profile overlay before this pass — they are the phone build's own new
   surface, not a phone-shaped copy of something the tablet already had.
   ------------------------------------------------------------------------- */

/* BottomSheet.jsx's whole interaction: tap the handle to cycle through
   SHEET_SNAPS (188 / 470 / 700), or drag it to any height in between. Both
   paths are exercised here because they are genuinely different code paths
   in the component (`handleDragEnd`'s two branches), not one behaviour
   asserted twice.

   The tap has to move the pointer a few pixels, and that is not a shortcut
   around a true zero-movement click — it is the honest shape of a tap.
   Measured directly: a mouse down/up with literally no movement between them
   never fires framer-motion's drag callbacks at all (no onDragStart, no
   onDragEnd), so nothing happens — not a cycle, not a resize, nothing. A
   real finger on a real screen does not manage zero movement either; framer
   itself only starts recognising the gesture once the pointer has moved
   about 3px, which is what TAP_SLOP=4 in BottomSheet.jsx is already sized
   to sit just above. 3px of movement is what makes this a tap rather than a
   no-op in the harness, exactly as it would be in a hand. */
/* The call dock, which replaced the three-snap bottom sheet.

   ---- What this measured, and why the subject retired ----

   The phone draft room used to be a board with a draggable sheet over it,
   and that sheet's release rule was the whole feature: flicked, travelled
   past a threshold, or nearest - three questions in order, each there for a
   gesture the next one gets wrong. This test drove a 150px swipe and
   asserted the sheet reached its collapsed snap.

   v3 has no sheet to drag. The cockpit is a tablist with the views in it
   and a DOCK pinned above the safe area carrying the call and the Draft
   button, and the call's detail opens as an ordinary modal rather than as a
   taller snap of a thing already on screen. So the snap rule is gone with
   the sheet it belonged to, and asserting it would be asserting a gesture
   the product no longer has.

   What the snaps were FOR survives, and it is what is asserted here: the
   reader can get from the board to the call and back without losing either.
   The dock is always on screen, its Draft action is always reachable, and
   opening the call does not strand you in it. */
test("the call opens over the draft and closes back onto it", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  await startPhoneDraft(page, { mySlot: 0, clockLength: 90 });

  const seen = () => page.evaluate(() => {
    const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(vis);
    /* The DOCK's opener, named rather than taken first.

       The header's own "Draft menu" button is also an aria-haspopup=dialog
       and comes earlier in the DOM, so `.find()` picked the wrong control
       and reported a dock that does not offer the call on a screen where it
       plainly does. Two openers, two jobs; the label is what tells them
       apart, and the dock's says which player the call is about. */
    const opener = [...document.querySelectorAll('[aria-haspopup="dialog"]')]
      .filter(vis)
      .find((el) => /call|forecast/i.test(el.getAttribute("aria-label") || ""));
    const draftBtn = [...document.querySelectorAll("button")]
      .find((x) => vis(x) && /^draft$/i.test(x.textContent.trim()));
    const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(vis);
    return {
      dialog: dialog ? (dialog.getAttribute("aria-label") || "").trim() : null,
      openerLabel: opener ? (opener.getAttribute("aria-label") || "").trim() : null,
      draftTop: draftBtn ? Math.round(draftBtn.getBoundingClientRect().top) : null,
      panelVisible: !!panel,
      viewport: innerHeight,
    };
  });

  const before = await seen();
  expect(before.dialog, "nothing is open over the draft to begin with").toBeNull();
  expect(before.openerLabel, "the dock offers the call").toMatch(/call|forecast/i);
  expect(before.draftTop, "with the Draft action on screen").not.toBeNull();
  expect(before.draftTop, "above the fold").toBeLessThan(before.viewport);

  await page.evaluate(() => {
    const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    [...document.querySelectorAll('[aria-haspopup="dialog"]')]
      .filter(vis)
      .find((el) => /call|forecast/i.test(el.getAttribute("aria-label") || ""))
      .click();
  });
  await page.waitForTimeout(400);
  const open = await seen();
  expect(open.dialog, "pressing it opens the call").toBe("The call");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const closed = await seen();
  expect(closed.dialog, "and it closes again rather than stranding the reader in it")
    .toBeNull();
  expect(closed.panelVisible, "back onto the view that was underneath").toBe(true);
  expect(closed.draftTop, "with the dock's Draft action still reachable")
    .toBeLessThan(closed.viewport);
  await context.close();
});

test("each view shows its own content, and a player profile opens and closes over them", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  await startPhoneDraft(page);

  /* The cockpit's views, not a bottom sheet's four tabs.

     Queue and Chat were views of their own on the phone sheet and are not
     any more: Queue is one of three segments inside Team, and Chat only
     exists in a room. So the SET changed and the property did not — each
     view has to show its own content rather than whatever the last one
     left behind, which is the stale-panel failure this was written for.

     Read off the tabpanel that names itself, so nothing here depends on a
     wrapper's class list. */
  /* The VIEW's own panel, named rather than taken first.

     A player drawer carries its own research tabpanel and the Team view
     carries a second strip inside itself, so "the first visible tabpanel"
     is not reliably the view under test - it reported Team's body while
     Pool was selected, which reads as a view showing another view's
     content: the exact failure this test exists to catch, manufactured by
     the reader rather than by the app. */
  const readView = (label) => page.evaluate((l) => {
    const panel = [...document.querySelectorAll('[role="tabpanel"]')]
      .find((e) => (e.getAttribute("aria-label") || "").trim() === l
        && e.getBoundingClientRect().height > 0);
    return panel ? panel.innerText : "";
  }, label);
  const tapView = (label) => page.evaluate((l) => {
    const strip = document.querySelector('[role="tablist"][aria-label="Draft views"]');
    const btn = [...strip.querySelectorAll('[role="tab"]')]
      .find((b) => b.textContent.trim() === l);
    if (!btn) throw new Error("no draft view tab reading " + l);
    btn.click();
  }, label);

  await tapView("Team");
  await page.waitForTimeout(350);
  const team = await readView("Team");
  expect(team, "Team shows its own roster/queue/picks segments")
    .toMatch(/roster/i);

  await tapView("Board");
  await page.waitForTimeout(350);
  const boardView = await readView("Board");
  expect(boardView, "Board shows the draft grid, not what Team was showing")
    .not.toMatch(/roster/i);

  await tapView("Grade");
  await page.waitForTimeout(350);
  const grade = await readView("Grade");
  expect(grade, "Grade shows the analysis rather than the board").toMatch(/grade|starter/i);

  await tapView("Pool");
  await page.waitForTimeout(350);
  const pool = await readView("Pool");
  /* Checked against the live board's own names rather than against a label
     on the screen. "AVAILABLE" was the phone sheet's own count header and
     v3 does not draw one, and a match on "ADP" is a match on a column that
     could be renamed — where a name off `board` is what a player list IS,
     and cannot be satisfied by any other view. */
  const poolHasPlayers = await page.evaluate((text) => {
    const names = (typeof board === "object" ? board : []).map((p) => p.name);
    return names.some((n) => n && text.includes(n));
  }, pool);
  expect(poolHasPlayers, "and Pool is back to the player list").toBe(true);

  // Open a profile from the first player row in the pool.
  const opened = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('[role="tabpanel"]')]
      .find((e) => (e.getAttribute("aria-label") || "").trim() === "Pool");
    const names = new Set((typeof board === "object" ? board : []).map((p) => p.name));
    const btn = [...panel.querySelectorAll("li button")]
      .find((b) => [...b.querySelectorAll("*")].some((e) => names.has(e.textContent.trim()))
        || names.has(b.textContent.trim()));
    if (!btn) return null;
    const name = [...btn.querySelectorAll("*")].map((e) => e.textContent.trim())
      .find((t) => names.has(t)) || btn.textContent.trim();
    btn.click();
    return name;
  });
  expect(opened, "a player row was actually found to open").toBeTruthy();
  await page.waitForTimeout(400);

  const profile = await page.evaluate((expectedName) => {
    const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    /* role=dialog, which is what the drawer IS. The old overlay was found
       by a fixed/z-[70] class pair, and a class is what gets restyled. */
    const drawer = [...document.querySelectorAll('[role="dialog"]')].find(seen);
    const closeBtn = [...document.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") || "") === "Close player" && seen(b));
    const strip = drawer && drawer.querySelector('[role="tablist"][aria-label="Research"]');
    const surname = expectedName.split(" ").slice(-1)[0].toUpperCase();
    return {
      drawerFound: !!drawer,
      drawerHasName: drawer ? drawer.innerText.toUpperCase().includes(surname) : false,
      // The set of research tabs is per player — a defence has no usage
      // reading and no draft fit — so the count is a floor rather than a
      // fixed list, which is what stops this pinning one player's shape.
      researchTabs: strip ? strip.querySelectorAll('[role="tab"]').length : 0,
      closeBtnFound: !!closeBtn,
    };
  }, opened);

  expect(profile.drawerFound, "the profile drawer is on screen").toBe(true);
  expect(profile.drawerHasName, "showing the player that was tapped").toBe(true);
  expect(profile.researchTabs, "with its own research strip").toBeGreaterThan(2);
  expect(profile.closeBtnFound, "and a way to close it").toBe(true);

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") || "") === "Close player").click();
  });
  await page.waitForTimeout(400);
  const afterClose = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')]
    .some((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }));
  expect(afterClose, "closing it leaves no phantom drawer behind").toBe(false);

  await context.close();
});


/* Reported from a real phone: scrolling the Players table sideways left the
   player name behind, scrolling off with the stat columns instead of
   staying pinned. First fixed by making the name column `position: sticky`
   within a shared table — a real fix (confirmed against real Sleeper
   screenshots the reporter sent, and against a synthetic before/after) —
   and then superseded by a request to match a reference app's own row shape
   exactly rather than approximate it with a pinned column. See this file's
   own "Fully match Sleeper's structure" note above `PlayersTabPhone.jsx`'s
   row rewrite: name and position/team/bye now live on their own line,
   never part of any horizontal scroll at all, with the Draft button, rank,
   queue toggle and every stat pair scrolling together beneath it — so the
   Draft button is reachable at scroll position 0 and nowhere else, which is
   a deliberate trade for matching the reference layout rather than an
   oversight.

   This asserts three things a per-row independent scroll strip needs to be
   true, not just "the name doesn't move" — which is close to true by
   construction once the name is a separate DOM sibling of the strip, and
   this file's own testing culture says a construction argument is exactly
   the kind of claim worth measuring rather than trusting: */
/* Every row's own action is reachable without scrolling sideways.

   ---- What this replaced ----

   The phone pool used to lay a player out as one wide strip per row: the
   name pinned, the stats and the Draft button scrolling under it, each row
   with its own independent scroll position. This test drove that strip to
   its far end and asserted three things - the name never moves, the Draft
   button really does leave the screen, and a second row's scroll is
   untouched. The middle one was written as "the traded-away half of
   matching the reference layout", which is the tell: the layout bought
   density by putting a row's own action somewhere a reader had to go and
   find.

   v3 does not make that trade. A row wraps instead - name and tags on the
   first line, a four-column stat grid under it, the Draft button in the
   flex row and never off it - so there is no strip, no per-row scroll
   position, and nothing to carry an action away.

   So the geometry retires with the strip and the REQUIREMENT it was really
   protecting is what is asserted here, stated the way the product now
   answers it: every row's action is on screen where it sits, and no row
   leaks sideways. It is the stronger claim of the two - the old one could
   only promise the button came back. */
test("every row's own action is reachable without scrolling the row sideways", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  // Seat 0, so pick 1 is mine and the Draft buttons are live rather than
  // disabled for it not being my turn.
  await startPhoneDraft(page, { mySlot: 0, clockLength: 90 });

  const r = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('[role="tabpanel"]')]
      .find((e) => (e.getAttribute("aria-label") || "").trim() === "Pool");
    const list = [...panel.querySelectorAll("div")]
      .find((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.querySelector("li"));
    const rows = [...list.querySelectorAll("li")]
      .filter((li) => li.getBoundingClientRect().height > 0);
    if (rows.length < 2) return { skip: true };

    const read = (li) => {
      const b = li.getBoundingClientRect();
      const act = [...li.querySelectorAll("button")]
        .find((x) => /^draft$/i.test(x.textContent.trim()));
      /* A row already drafted carries a "taken by" label instead of a
         button, which is a reachable answer too - what must never happen
         is neither. */
      const taken = !act && /\S/.test(li.innerText);
      const ab = act ? act.getBoundingClientRect() : null;
      return {
        // Sideways leak: a row wider than its own box that cannot scroll.
        over: Math.round(li.scrollWidth - li.clientWidth),
        canScroll: /auto|scroll/.test(getComputedStyle(li).overflowX),
        // The action's right edge inside the row's own right edge.
        actionInside: ab ? ab.right <= b.right + 1 && ab.left >= b.left - 1 : taken,
        hasAnswer: !!act || taken,
      };
    };
    return { skip: false, rows: rows.slice(0, 12).map(read) };
  });

  expect(r.skip, "at least two rows are on screen").toBe(false);
  for (const [i, row] of r.rows.entries()) {
    expect(row.hasAnswer, `row ${i} says what can be done with the player`).toBe(true);
    expect(row.actionInside, `row ${i}'s action sits inside the row, not off the end of it`)
      .toBe(true);
    if (row.over > 1) {
      expect(row.canScroll, `row ${i} overflows sideways and can at least scroll`).toBe(true);
    }
  }
  await context.close();
});

