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

/* Scoped to #draftroom-root on purpose. The legacy setup screen is still in
   the document, display:none, and its selects are 14.5px — hidden elements
   still report a computed font size, so an unscoped sweep fails on markup no
   thumb can reach. */
const FIELD_READER = `window.readSmallFields = function () {
  return [...document.querySelectorAll("#draftroom-root input, #draftroom-root select, #draftroom-root textarea")]
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
    return ok;
  }, { o: opts, extra: inSameTurn ? inSameTurn.toString() : null });
  expect(started, "the draft actually started (a false here is setupProblem() refusing)").toBe(true);

  await page.waitForFunction(
    () => !document.querySelector("[data-draft-loader]"),
    null,
    { timeout: 20000 },
  );
}

test("no field is under 16px, or iOS zooms in and stays there", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");
  await page.evaluate(FIELD_READER);

  // A coarse pointer is what the rule keys on, so a test on a fine one proves
  // nothing about the phone it was written for.
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  /* Every field the app can put in front of somebody on a phone: the lobby,
     then the settings modal (which is where the scoring editor's forty-four
     number inputs live), then the live draft's player search. */
  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    [...root.querySelectorAll("button")]
      .find((b) => /draft settings/i.test(b.getAttribute("aria-label") || ""))
      .click();
  });
  await page.waitForTimeout(400);

  /* The scoring rules are a collapsible section now, not a "Scoring" tab —
     the settings modal became the whole Draft Settings screen (draft name,
     type, third-round reversal, scoring, teams, player pool, clock, CPU
     autopick, roster, draft order) and forty-nine numeric inputs are a
     screen rather than a section, so they are folded away behind a row.

     That row is what has to be opened, and opening it is the point: the
     inputs it holds are the whole reason this test visits the settings
     screen at all, and a version that stopped opening them would keep
     passing while checking nothing. Matched on "scoring rules" rather than
     on a tab label, because the section header is what the row says. */
  await page.evaluate(() => {
    const m = [...document.querySelectorAll("div")]
      .find((d) => (d.className || "").toString().includes("z-[70]"));
    const row = [...m.querySelectorAll("button")]
      .find((b) => /scoring rules/i.test(b.textContent || ""));
    if (!row) throw new Error("no scoring-rules row on the settings screen");
    row.click();
  });
  await page.waitForTimeout(400);

  const fieldCount = await page.evaluate(() => {
    const m = [...document.querySelectorAll("div")]
      .find((d) => (d.className || "").toString().includes("z-[70]"));
    return m.querySelectorAll("input").length;
  });
  // The guard on the guard: the sweep below is only meaningful if the fields
  // are actually on screen, and "the section did not open" looks exactly like
  // "every field passed" to it.
  expect(fieldCount, "the scoring editor's own fields are rendered").toBeGreaterThan(20);

  const inModal = await page.evaluate(() => readSmallFields());
  expect(inModal, "every settings field clears the floor").toEqual([]);

  await page.evaluate(() => {
    const m = [...document.querySelectorAll("div")]
      .find((d) => (d.className || "").toString().includes("z-[70]"));
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
  /* Wait for the toggle before reaching for it.

     The evaluate below is a single synchronous read, so it asks once and
     throws "no icon-only search toggle on the Players panel" if the phone
     draft room has not finished rendering its Players panel yet. That is
     not a missing control, it is a race — and it read as one, failing a
     full run and then passing 12/12 on a re-run of the same file.

     Same defect as the two the config and helpers already grew waits for,
     and the same rule this repo states about it: a one-shot
     `page.evaluate(...).find(...)` is the wrong shape for anything that
     renders asynchronously, because "not there yet" and "not there at all"
     come back identically. Bounded, and NOT swallowed: if the toggle
     genuinely never appears that is this test's subject and the timeout
     should say so. */
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = root && [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const panel = sheet && sheet.lastElementChild;
    return !!(panel && [...panel.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "" && b.querySelector("svg")));
  }, null, { timeout: 20000 });

  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const panel = sheet && sheet.lastElementChild;
    const searchBtn = panel && [...panel.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "" && b.querySelector("svg"));
    if (!searchBtn) throw new Error("no icon-only search toggle on the Players panel");
    searchBtn.click();
  });
  await page.waitForTimeout(300);
  const searchFieldSize = await page.evaluate(() => {
    const input = document.querySelector('#draftroom-root input[placeholder="Search players"]');
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
  const page = await openApp(context, "#/draft-room");
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
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
    return { found: true, onTop: !!(hit && (hit === btn || btn.contains(hit))),
             hit: hit ? hit.tagName + "." + String(hit.className).slice(0, 30) : null,
             inViewport: b.top >= 0 && b.bottom <= innerHeight };
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

  document.querySelectorAll("#draftroom-root *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (el.scrollWidth <= el.clientWidth + slack) return;
    if (el.tagName === "INPUT") return;            // an input scrolls its own value
    const c = getComputedStyle(el);
    const scrolls = /auto|scroll/.test(c.overflowX);
    const ellipsises = c.textOverflow === "ellipsis" && c.overflow !== "visible";
    if (scrolls || ellipsises) return;

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
  const page = await openApp(context, "#/draft-room");
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

  /* Swept once per tab of the new bottom sheet, not just on whatever the
     draft opens on. Each tab is a distinct component (PlayersTabPhone,
     QueueTabPhone, TeamTabPhone, ChatTabPhone) with its own markup, and the
     original single-tab sweep is exactly what let the rank-number column's
     overflow past its own box ship: three-digit ranks (100+) sat in a
     16px-wide cell built for two, colliding with the Draft button beside it
     on well over half the board. Confirmed by measurement before the fix —
     `scrollWidth 20` against `clientWidth 16` — and by screenshot, then
     fixed by widening the cell rather than by loosening this sweep. */
  const byTab = {};
  for (const label of ["Players", "Queue", "Team", "Chat"]) {
    await page.evaluate((l) => {
      const root = document.getElementById("draftroom-root");
      const btn = [...root.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === l && b.getBoundingClientRect().height > 0);
      if (!btn) throw new Error("no visible tab button reading " + l);
      btn.click();
    }, label);
    await page.waitForTimeout(350);
    byTab[label] = await page.evaluate(() => window.__sweep());
  }
  for (const [label, leaks] of Object.entries(byTab)) {
    expect(leaks, `the ${label} tab`).toEqual([]);
  }

  // And the player profile overlay, opened from the Players tab — its own
  // full-screen surface (PlayerProfilePhone.jsx) with a four-way tab strip
  // of its own, swept the same way.
  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const btn = [...root.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Players" && b.getBoundingClientRect().height > 0);
    btn.click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const nameBtn = [...root.querySelectorAll("button")].find((b) => b.querySelector("p.truncate"));
    if (!nameBtn) throw new Error("no player row to open a profile from");
    nameBtn.click();
  });
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
    return {
      found: true,
      headerBottom: header.getBoundingClientRect().bottom,
      eyebrowTop: eyebrow.getBoundingClientRect().top,
    };
  });

  expect(r.found, "the phone hero draws its own eyebrow").toBe(true);
  // 36px in the artboard. 60 is slack for the line box the span sits in; the
  // bug this catches was 149px of gap, not five.
  expect(r.eyebrowTop - r.headerBottom,
    "the gap between the fixed header and the first thing under it").toBeLessThan(60);
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
  const page = await openApp(context, "#/draft-room");
  // Seat 0, so pick 1.01 is mine and the Draft button on the top row is
  // enabled rather than greyed out for not being my turn.
  await startPhoneDraft(page, { mySlot: 0, clockLength: 90 });

  const r = await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const sheet = [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const tabLabels = sheet
      ? [...sheet.querySelectorAll("button")]
        .filter((b) => seen(b) && ["Players", "Queue", "Team", "Chat", "Decide"].includes(b.textContent.trim()))
        .map((b) => b.textContent.trim())
      : [];
    const activeTab = [...root.querySelectorAll("button")]
      .find((b) => seen(b) && /text-teal-300/.test(b.className) && tabLabels.includes(b.textContent.trim()));
    const draftBtn = [...root.querySelectorAll("button")]
      .find((b) => seen(b) && b.textContent.trim() === "Draft" && !b.disabled);
    return {
      tabLabels,
      activeTab: activeTab ? activeTab.textContent.trim() : null,
      draftBtnTop: draftBtn ? draftBtn.getBoundingClientRect().top : null,
      viewport: innerHeight,
    };
  });

  // The bottom sheet's own four tabs, and nothing named Decide among them —
  // the concept this test used to guard is gone from the phone build, not
  // hiding under a new label.
  expect(r.tabLabels.sort(), "the sheet offers exactly Players/Queue/Team/Chat")
    .toEqual(["Chat", "Players", "Queue", "Team"]);
  expect(r.activeTab, "and it opens on Players, not a middle step").toBe("Players");
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
const BAR_READER = `window.visibleNavs = function () {
  var root = document.getElementById("draftroom-root");
  return [].slice.call(root.querySelectorAll("nav")).filter(function (n) {
    var b = n.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    var labels = [].slice.call(n.querySelectorAll("button")).map(function (x) {
      return x.textContent.trim();
    });
    return labels.indexOf("Decide") >= 0 && labels.indexOf("Players") >= 0;
  });
};
window.barState = function () {
  var navs = window.visibleNavs();
  return {
    count: navs.length,
    /* Two navs, two idioms for "selected": the bottom bar underlines with
       border-teal-400, the header simply colours the label text-teal-300.
       Matching only the first is why the 1280px case reported no selected
       tab at all on a nav that was plainly marking one. Either teal is the
       mark; neither nav uses it for anything else. */
    active: navs.length !== 1 ? [] : [].slice.call(navs[0].querySelectorAll("button"))
      .filter(function (x) { return /teal-(300|400)/.test(x.className) })
      .map(function (x) { return x.textContent.trim() }),
    /* PlayerHub, the panel the Players tab mounts. The original bug left
       this on screen while the nav had moved on, so it is still the right
       thing to watch — only its name in the bar changed. Same container
       class the Players test below already anchors on. */
    hubMounted: [].slice.call(document.querySelectorAll("div"))
      .some(function (d) { return String(d.className).indexOf("flex-col overflow-hidden bg-slate-bar/40") >= 0 })
  };
};
window.tapNav = function (name) {
  var navs = window.visibleNavs();
  [].slice.call(navs[0].querySelectorAll("button"))
    .filter(function (x) { return x.textContent.trim() === name })[0].click();
}`;

for (const width of [900, 1280]) {
  test(`the draft tab bar never marks a tab whose panel is not mounted (${width}px)`,
    async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await openApp(context, "#/draft-room");
      await startPhoneDraft(page);
      await page.evaluate(BAR_READER);

      // The guarantee that retired the bug: one nav, never two, at any width.
      expect(await page.evaluate(() => barState().count),
        "exactly one draft nav is on screen, which is what makes the two "
        + "disagreeing impossible").toBe(1);

      /* Players, not Roster. Roster was its own slot in this bar when the
         test was written and is a pane inside Players now (MobileDraftTabBar's
         own comment says so), so tapping it by name found nothing and threw
         on undefined — a dead control name reported as a type error. */
      await page.evaluate(() => tapNav("Players"));
      await page.waitForTimeout(350);
      const opened = await page.evaluate(() => barState());
      expect(opened.active, "Players is selected").toEqual(["Players"]);
      expect(opened.hubMounted, "and its panel is really there").toBe(true);

      await page.evaluate(() => tapNav("Decide"));
      await page.waitForTimeout(350);
      const after = await page.evaluate(() => barState());
      expect(after.hubMounted, "Decide unmounts it").toBe(false);
      expect(after.active,
        "and the nav moved with it rather than still pointing at Players")
        .toEqual(["Decide"]);
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
test("the entry screen stacks on a phone instead of painting over itself", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");

  const code = await createRoom(page);
  expect(code, "a room was created, which is the only way to the entry screen")
    .toBeTruthy();
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return [...root.querySelectorAll("div")].some((d) => typeof d.className === "string"
      && d.className.includes("lg:grid-cols-[300px_minmax(0,1fr)_330px]"));
  }, null, { timeout: 15000 });

  const r = await page.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find(
      (d) => typeof d.className === "string" &&
        d.className.includes("lg:grid-cols-[300px_minmax(0,1fr)_330px]"));
    if (!grid) return { missing: true };
    const wrap = grid.parentElement;
    return {
      // How far each stacked section's content escapes its own box. A row
      // that cannot scroll and overflows is a row painting on its neighbour.
      spills: [...grid.children].map((c) => c.scrollHeight - c.clientHeight),
      rows: getComputedStyle(grid).gridTemplateRows,
      wrapOverflowY: getComputedStyle(wrap).overflowY,
      wrapClipsContent: wrap.scrollHeight > wrap.clientHeight,
    };
  });

  expect(r.missing, "the entry screen is the one under test").toBeFalsy();
  expect(r.spills, `no section overflows its own row (rows were ${r.rows})`)
    .toEqual([0, 0, 0]);
  // It is taller than the phone by design — three stacked sections — so the
  // requirement is not that it fits, only that all of it can be reached.
  if (r.wrapClipsContent) {
    expect(r.wrapOverflowY,
      "content taller than the viewport has to be scrollable, not clipped")
      .not.toBe("hidden");
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

   The tab is opened through #draftroom-root deliberately, and by clicking
   through the real Lobby ("Start mock draft") rather than the
   `window.JukeEngine.startDraft()` bridge the other tests in this file use —
   the same reasoning `startSoloDraft()` in helpers.mjs already gives for
   driving a real journey rather than the shortcut: it is the path a person
   actually takes, and it is the one that would have caught the "second Start
   button that no longer exists" class of bug on its own. Players is already
   the sheet's default tab, so the click on it below is a real tap on an
   already-selected control — kept rather than skipped, in case the default
   ever changes and stops being a no-op. */
test("every player on the Players tab is reachable on a phone", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");

  const clickIn = (name) => page.evaluate((label) => {
    const root = document.getElementById("draftroom-root");
    const b = [...root.querySelectorAll("button")]
      .filter((x) => x.getBoundingClientRect().height > 0)
      .find((x) => x.textContent.trim() === label);
    if (!b) throw new Error("no button in #draftroom-root reading " + label);
    b.click();
  }, name);

  // The start button by attribute rather than by label — see "nothing is
  // sitting on top of the Start button" above for why the label is not a
  // thing to match on.
  const clickStart = () => page.evaluate(() => {
    const b = [...document.querySelectorAll("#draftroom-root [data-start-draft]")]
      .find((x) => x.getBoundingClientRect().height > 0);
    if (!b) throw new Error("no [data-start-draft] on screen in #draftroom-root");
    b.click();
  });

  /* One step, not two. "Start mock draft" used to open the entry screen and
     leave a second "Start draft" to press; handleStartNew() now calls
     beginDraft() straight from the lobby for a solo draft, deliberately —
     "making somebody confirm a choice they just made is the unnecessary
     second step this was built to remove". A test that still pressed the
     second button failed with "no button reading Start draft", which is a
     true sentence about a button nobody wants back.

     And the wait is on the transition rather than on the clock. Pressing
     Start raises DraftRoom's `starting` loader, whose floor has now been
     400ms, then 2100 (SonarLoader's RING_MS, so its sweep could complete),
     and now 500 (DraftRoomLoader has no sweep to complete — see its own
     comment). A fixed wait raced it every time and would have gone red on
     each of those moves. Waiting for the nav to exist cannot, which is the
     whole point and is now demonstrated three times over. */
  /* The board first, and only then the button. This one presses the real
     control rather than the bridge, so it meets the same refusal from the
     other side: `setupProblem()` answers "the board is loading" until the
     deferred data lands, and the Start button is disabled for exactly that
     long. Clicking it then does nothing at all, and the wait below reports
     a missing "Players" tab fifteen seconds later — a true sentence about a
     screen that was never going to be reached, and nothing in it names the
     cause. `startSoloDraft()` in helpers.mjs waits on the button's own
     disabled state for this reason; here the condition is the same fact one
     step upstream. */
  await page.waitForFunction(
    () => typeof dataReady === "function" && dataReady(),
    null,
    { timeout: 30000 },
  );
  await clickStart();
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return [...root.querySelectorAll("button")]
      .some((b) => b.getBoundingClientRect().height > 0 && b.textContent.trim() === "Players");
  }, null, { timeout: 15000 });
  await clickIn("Players");
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    /* The sheet, found by its own fixed/z-30 signature rather than by a
       class that names the tab underneath it — BottomSheet.jsx's outer div
       carries this on every tab, so it is the stable anchor. Its own last
       child is whichever tab body is mounted (BottomSheet's own JSX: the
       drag/handle row, then `<div className="min-h-0 flex-1">{children}</div>`),
       which is PlayersTabPhone's root here since Players is selected. */
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const panel = sheet && sheet.lastElementChild;
    if (!panel) return { missing: true };
    /* The panel's own scroller, found by being one rather than by its class
       list, and by actually holding a row's own horizontal scroller —
       DraftBoardPeekPhone sits in the same document with an identically-
       classed `min-h-0 flex-1` wrapper around the board grid, so matching
       the class alone resolves to whichever of the two comes first in the
       DOM and silently measures the wrong list. */
    const list = [...panel.querySelectorAll("div")]
      .find((d) => /auto|scroll/.test(getComputedStyle(d).overflowY)
        && d.querySelector("[class*='overflow-x-auto']"));
    if (!list) return { missing: true };
    const pb = panel.getBoundingClientRect(), lb = list.getBoundingClientRect();
    list.scrollTop = 999999;
    const maxScroll = Math.round(list.scrollTop);
    list.scrollTop = 0;
    /* Rows counted by the player names in them, not by a "Draft" button per
       row — the row itself carries one, but so does every other row on the
       phone, and matching text is what a name-list actually is. A name from
       the live board cannot be mistaken for a header or a control. */
    const names = new Set((typeof board === "object" ? board : []).map((p) => p.name));
    return {
      missing: false,
      rows: [...list.querySelectorAll("p")].filter((e) => names.has(e.textContent.trim())).length,
      // the panel must fit its own container rather than inflating past it
      panelOverflow: panel.scrollHeight - panel.clientHeight,
      // how much of the list is actually on screen, inside the panel
      visibleListPx: Math.round(Math.min(lb.bottom, pb.bottom, innerHeight) - lb.top),
      listCanScroll: list.scrollHeight > list.clientHeight + 1,
      maxScroll,
    };
  });

  expect(r.missing, "the Players panel and its scroller are both mounted").toBeFalsy();
  expect(r.rows, "the tab really switched — the board's names are on screen")
    .toBeGreaterThan(50);
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
test("the bottom sheet cycles through its three snap heights on a tap", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");
  await startPhoneDraft(page);

  const readHeight = () => page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")].find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    return sheet ? Math.round(sheet.getBoundingClientRect().height) : null;
  });
  // The drag surface, found by what it actually does (cursor: grab) rather
  // than by its class list — the one thing a `<div>` with no text and no
  // role has to identify it by.
  const getHandlePoint = () => page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")].find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const drag = [...sheet.children].find((c) => getComputedStyle(c).cursor === "grab");
    const b = drag.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(Math.max(4, b.top + 8)) };
  });
  async function tapHandle() {
    const p = await getHandlePoint();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y - 3, { steps: 3 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(650); // the spring settles well inside this
  }

  /* 58 / 470 / 700 are SHEET_SNAPS as authored, but the tallest of the
     three is capped on this device: at a 664px-tall viewport (this file's
     own PHONE profile — see the "Decide"-replacement test's own note on
     it) minus whatever CockpitHeaderPhone actually measures, only that
     much is free.
     That cap is the fix for a real bug this test is what caught: with the
     sheet honestly at 700px it rendered 36px taller than the viewport, and
     the header — `z-40`, above the sheet's own `z-30` — physically covered
     the drag handle and the whole tab row for as long as the sheet stayed
     that tall. No error, nothing in the console: the handle was simply
     under something else, un-tappable and un-draggable, with no way back
     down to a shorter snap. Confirmed by tapping the one sliver of the drag
     surface still on-screen at 700px and finding it did nothing either,
     because the header sat on top of that sliver too. BottomSheet.jsx now
     takes a `maxHeight` prop for exactly this, and DraftRoomPhone.jsx
     supplies `window.innerHeight - HEADER_H`. */
  /* The cap is derived from the header, not written down as a number.

     It was 558 — the 664px viewport minus a CockpitHeaderPhone that was
     hardcoded at 106px. That constant was only ever right on a device with
     a notch: `pt-[env(safe-area-inset-top)]` is 0 everywhere else, so the
     real header measured about 65 and the board started 41px below where
     the header ended. The header measures and reports its own height now,
     which makes the honest cap 588 here — and this assertion would have
     gone red for the fix as loudly as for a regression, because it was
     pinned to the wrong number's arithmetic rather than to the rule.

     CLAUDE.md already states the rule this now follows, about the padding
     that stood in for a fixed header's height: assert the relationship,
     never an absolute offset, or the test has to be rewritten every time
     the header's own height moves. */
  const headerH = await page.evaluate(() => {
    const h = document.querySelector("#draftroom-root header");
    return Math.round(h.getBoundingClientRect().height);
  });
  const cap = Math.min(700, 664 - headerH);

  const start = await readHeight();
  expect(start, "the sheet opens at its middle snap").toBe(470);

  await tapHandle();
  const afterOne = await readHeight();
  expect(afterOne, "one tap grows it to the tallest snap the header leaves room for").toBe(cap);

  await tapHandle();
  const afterTwo = await readHeight();
  /* 58, not 188. The shortest snap used to leave a tab row and two list
     rows showing, which is a shorter sheet still covering the last four
     rounds of the board — and the board is what somebody swiping the sheet
     down is trying to see. It is the drag handle and the tab row and
     nothing else now. */
  expect(afterTwo, "a second tap wraps to the shortest snap").toBe(58);

  await tapHandle();
  const afterThree = await readHeight();
  expect(afterThree, "a third tap returns to the middle snap it started at").toBe(470);

  // And the handle is reachable at every one of those heights — not just
  // on-screen by pixel count, but not covered by the header either. A tap
  // that lands within the viewport but under CockpitHeaderPhone (z-40) would
  // pass a naive "is it visible" check and still do nothing, which is the
  // exact shape the bug above took.
  for (const expected of [cap, 58, 470]) {
    const p = await getHandlePoint();
    const underCursor = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const sheet = [...document.querySelectorAll("div")].find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
      return !!(el && sheet && sheet.contains(el));
    }, p);
    expect(underCursor, `the handle at height ${expected} is what a tap there actually lands on`).toBe(true);
    await tapHandle();
  }

  // A real drag, not a tap: past TAP_SLOP, so this is `handleDrag`'s live-
  // clamp path rather than the discrete cycle above. Dragged well past the
  // capped ceiling to confirm the clamp holds under a real gesture too, not
  // only in the three authored snap values.
  const p = await getHandlePoint();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y - 400, { steps: 15 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const dragged = await readHeight();
  expect(dragged, "a drag past the cap settles at the cap, not above it").toBeLessThanOrEqual(cap);
  expect(dragged, "and it did grow — this is the drag path, not a stuck tap").toBeGreaterThan(470);

  await context.close();
});

/* Four tabs, one sheet body — and switching between them has to actually
   replace what is on screen, not layer a new panel over the last one
   (BottomSheet's `{children}` slot holds exactly one tab component at a
   time, by construction, but "by construction" is exactly the kind of claim
   this file's own testing culture says to measure rather than trust).

   And a player profile opened from a row in the Players tab has to be a
   real overlay over all of it — its own full-screen surface
   (PlayerProfilePhone.jsx, `fixed inset-0 z-[70]`) with a tab strip of its
   own, not a fifth pane inside the sheet — and closing it has to return
   cleanly to the list underneath rather than leaving a phantom overlay
   behind. Both are checked in one pass because opening the profile is only
   reachable from the Players tab, so the two are already one journey. */
test("the four tabs each show their own content, and a player profile opens and closes over them", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");
  await startPhoneDraft(page);

  // Text pulled from the sheet's own content slot, scoped past the same
  // class collision the test above documents (DraftBoardPeekPhone's board
  // wrapper shares BottomSheet's own `min-h-0 flex-1` class verbatim).
  const readTabBody = () => page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")].find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    return sheet && sheet.lastElementChild ? sheet.lastElementChild.innerText : "";
  });
  const tapTab = (label) => page.evaluate((l) => {
    const root = document.getElementById("draftroom-root");
    const btn = [...root.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === l && b.getBoundingClientRect().height > 0);
    if (!btn) throw new Error("no visible tab reading " + l);
    btn.click();
  }, label);

  await tapTab("Team");
  await page.waitForTimeout(350);
  const team = await readTabBody();
  expect(team, "Team shows the seated lineup, not another tab's content").toContain("Your Team");

  await tapTab("Queue");
  await page.waitForTimeout(350);
  const queue = await readTabBody();
  expect(queue, "Queue shows the empty-queue state").toContain("Draft queue is empty");
  expect(queue, "not what Team was just showing").not.toContain("Your Team");

  await tapTab("Chat");
  await page.waitForTimeout(350);
  const chat = await readTabBody();
  // A solo draft has no room, so ChatTabPhone's own EmptyNoRoom branch is
  // what should be on screen — genuinely different content again, and the
  // honest "there is nobody here" rather than a chat box with no room behind
  // it (see CLAUDE.md's own rule on a control that cannot act having to say
  // so, applied here to a whole panel rather than one field).
  expect(chat, "Chat shows the no-room state in a solo draft").toContain("Nobody to talk to here");

  await tapTab("Players");
  await page.waitForTimeout(350);
  const players = await readTabBody();
  expect(players, "and Players is back to the board, not stuck on Chat").toContain("AVAILABLE");

  // Open a profile from the first player row.
  const opened = await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const nameBtn = [...root.querySelectorAll("button")].find((b) => b.querySelector("p.truncate"));
    const name = nameBtn ? nameBtn.querySelector("p").textContent.trim() : null;
    if (nameBtn) nameBtn.click();
    return name;
  });
  expect(opened, "a player row was actually found to open").toBeTruthy();
  await page.waitForTimeout(400);

  const profile = await page.evaluate((expectedName) => {
    const root = document.getElementById("draftroom-root");
    const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const overlay = [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-0/.test(d.className) && /z-\[70\]/.test(d.className));
    const closeBtn = [...root.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") || "") === "Close player profile" && seen(b));
    const tabs = overlay
      ? [...overlay.querySelectorAll("button")]
        .filter((b) => ["SUMMARY", "GAME LOG", "TEAM", "HISTORY"].includes(b.textContent.trim()))
        .map((b) => b.textContent.trim())
      : [];
    // The surname is what the profile's own headline renders in caps
    // (PlayerProfilePhone.jsx splits the full name and uppercases the last
    // word) — checked against the row's own full name rather than hard-
    // coding a player, since the board is real, live data.
    const surname = expectedName.split(" ").slice(-1)[0].toUpperCase();
    return {
      overlayFound: !!overlay,
      overlayHasName: overlay ? overlay.innerText.toUpperCase().includes(surname) : false,
      tabs,
      closeBtnFound: !!closeBtn,
    };
  }, opened);

  expect(profile.overlayFound, "the profile overlay is on screen").toBe(true);
  expect(profile.overlayHasName, "showing the player that was tapped").toBe(true);
  expect(profile.tabs, "with its own Summary/Game Log/Team/History strip")
    .toEqual(["SUMMARY", "GAME LOG", "TEAM", "HISTORY"]);
  expect(profile.closeBtnFound, "and a way to close it").toBe(true);

  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const closeBtn = [...root.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") || "") === "Close player profile");
    closeBtn.click();
  });
  await page.waitForTimeout(400);
  const afterClose = await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const overlay = [...root.querySelectorAll("div")]
      .find((d) => /fixed inset-0/.test(d.className) && /z-\[70\]/.test(d.className));
    return !!overlay;
  });
  expect(afterClose, "closing it leaves no phantom overlay behind").toBe(false);

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
test("each row's name stays fixed while its own strip scrolls, independently of every other row", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft-room");
  // Seat 0, so pick 1 is mine and nobody's autopick can have claimed the
  // first couple of board slots out from under this test in the interval
  // before it reads the DOM — a real risk at another seat, since a CPU's
  // own turn can fire well inside the wait below.
  await startPhoneDraft(page, { mySlot: 0, clockLength: 90 });

  const r = await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    const sheet = [...root.querySelectorAll("div")].find((d) => /fixed inset-x-0 bottom-0 z-30/.test(d.className));
    const panel = sheet.lastElementChild;
    const list = [...panel.querySelectorAll("div")]
      .find((d) => /auto|scroll/.test(getComputedStyle(d).overflowY)
        && d.querySelector("[class*='overflow-x-auto']"));
    const rowDivs = [...list.children].filter((d) => d.querySelector("[class*='overflow-x-auto']"));
    if (rowDivs.length < 2) return { skip: true };

    const readRow = (row) => {
      const nameEl = row.querySelector("p");
      const scroller = row.querySelector("[class*='overflow-x-auto']");
      const draftBtn = [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Draft");
      return { nameEl, scroller, draftBtn };
    };

    // The first two rows that are actually still undrafted, not just the
    // first two in board order — an already-drafted row has no Draft
    // button at all (a "drafted by" label instead), which this test needs.
    const undrafted = rowDivs.map(readRow).filter((r) => r.draftBtn);
    if (undrafted.length < 2) return { skip: true };
    const [rowA, rowB] = undrafted;
    const nameLeftBefore = rowA.nameEl.getBoundingClientRect().left;
    const draftVisibleBefore = rowA.draftBtn.getBoundingClientRect().width > 0
      && rowA.draftBtn.getBoundingClientRect().left < innerWidth;
    const rowBScrollBefore = rowB.scroller.scrollLeft;

    const maxScrollLeft = rowA.scroller.scrollWidth - rowA.scroller.clientWidth;
    if (maxScrollLeft <= 0) return { skip: true };
    rowA.scroller.scrollLeft = maxScrollLeft;

    const nameLeftAfter = rowA.nameEl.getBoundingClientRect().left;
    const draftRectAfter = rowA.draftBtn.getBoundingClientRect();
    // Scrolled off to the left of the panel entirely, not just re-laid-out.
    const draftGoneAfter = draftRectAfter.right <= 0;
    const rowBScrollAfter = rowB.scroller.scrollLeft;

    rowA.scroller.scrollLeft = 0;
    const draftRectRestored = rowA.draftBtn.getBoundingClientRect();
    const draftBackAtStart = draftRectRestored.left >= 0 && draftRectRestored.width > 0;

    return {
      skip: false,
      nameLeftBefore, nameLeftAfter,
      draftVisibleBefore, draftGoneAfter, draftBackAtStart,
      rowBUnaffected: rowBScrollBefore === 0 && rowBScrollAfter === 0,
    };
  });

  expect(r.skip, "at least two rows exist and the first is wide enough to scroll").toBe(false);
  expect(r.draftVisibleBefore, "the Draft button starts out reachable, at scroll position 0").toBe(true);
  expect(r.nameLeftAfter, "the name never moves, at any scroll position of its own row's strip")
    .toBe(r.nameLeftBefore);
  expect(r.draftGoneAfter, "scrolling the strip does carry the Draft button off screen — the traded-away half of matching the reference layout").toBe(true);
  expect(r.draftBackAtStart, "and scrolling back to the start of that row recovers it").toBe(true);
  expect(r.rowBUnaffected, "a second row's own scroll position is untouched by the first row's scroll").toBe(true);
  await context.close();
});
