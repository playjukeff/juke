/* What the draft board says beyond the picks themselves: whose column it is,
   where the draft is, and how far away a pick is.

   The seat mark is a pair of cyan rails down the user's column now — the
   palette handoff's "seat bracket" — where it was a gold wash plus a gold
   border pair before it. That is a deliberate, scoped departure from
   CLAUDE.md's "Gold is identity" rule and the reason is the ground: the
   cells are matte pastel chalk since the same handoff, and #FFD166 at 7%
   over #FBD5A8 is not a wash anybody can see. Gold still means "yours"
   everywhere else in the room, and tailwind.config.js's shadow-seat and
   .seat-wash tokens still hold it.

   The bug half of this file's original subject is unchanged and is still
   the whole feature: `mine` only ever went on a *filled* cell, so the board
   marked where you had been and never where you were going — and where you
   are going next is the one question a snake board exists to answer.
   Nothing failed, nothing logged, and every check this project runs passed:
   the cells that were marked were marked correctly.

   The contrast test changed shape with the colour, and the change is worth
   stating rather than glossing.

   On the legacy board a ring is a *pair* — 2px of gold with 1px of keyline
   inside it — because no single colour survives what it lands on there: six
   position solids fixed across themes, and an empty cell that is near-black
   in dark and near-white in light. On the React board one colour was already
   enough because every surface was dark. It is now enough for a stronger
   reason: the bracket never lands on a *cell surface* at all. It is an inset
   shadow on the grid-cell wrapper, inside the 3px margin the card sits in, so
   what is under it is always the board's own ground — whatever colour the
   card two pixels to its right happens to be. The test below asserts that
   geometrically rather than taking it on trust, because it is the entire
   reason a light-chalk board can carry a single-value seat mark.

   Which also means the precondition is doing real work now: if the board's
   ground ever stops being dark, this mark needs re-deriving, and the last
   assertion is the line that will say so.
*/

import { test, expect } from "@playwright/test";
import { openApp, awaitBoard } from "./helpers.mjs";

async function draftInto(page, picks) {
  // The board first -- this presses #startBtn through evaluate(), which a
  // disabled attribute cannot refuse, so without it startDraft() returns
  // false and state.started never flips. See awaitBoard() in helpers.mjs.
  await awaitBoard(page);
  await page.evaluate((n) => {
    window.JukeEngine.startDraft({ mySlot: 3, clockLength: 90 });
    // startDraft() calls runCPUs(), which arms a single cpuStep() timer to
    // auto-play whoever it left on the clock. The loop below drives every
    // pick itself instead, and nothing about that loop touches the timer —
    // left alone it fires mid-test, ~350ms later, and keeps rescheduling
    // itself: an extra, untracked pick landing while later assertions read
    // the board. Same failure app.js documents next to scheduleCpuStep()
    // under a different name (an orphaned chain); here the orphan is ours.
    stopSim();
    for (let i = 0; i < n; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
    render();
    location.hash = "#/draft-room";
  }, picks);
  expect(await page.evaluate(() => state.started), "draft started").toBe(true);

  // No "Enter Draft Room" click needed here, unlike journey.spec.mjs's real
  // navigation: DraftRoom.jsx's enteredRoom sync effect fires the moment it
  // sees state.started already true, which it already is by the time this
  // component ever mounts — draftAndAdvance() never went through the door,
  // startDraft() ran straight off the engine above. Landing on the Locker
  // only happens for a genuinely fresh, unstarted visit.
  //
  // The board itself is a click away from here now, not the default —
  // Decide is, since the Cockpit rebuild, because most of a draft is spent
  // waiting or choosing rather than reading the board. Every test in this
  // file is about the board specifically, so it presses "Board" itself
  // rather than each of the six tests below waiting on a grid that will
  // never mount on the tab they land on.
  //
  // :visible, not just the text filter: MobileDraftTabBar.jsx mounts its
  // own always-in-DOM "Board" button (lg:hidden, not unmounted) beside
  // DraftCockpitHeader's desktop tab nav (hidden md:flex) — same label,
  // two controls for two widths. Playwright's default viewport is well
  // above both breakpoints, so exactly one is actually visible; without
  // this the locator resolves two elements and .click() throws in strict
  // mode before a single one of this file's own assertions ever runs.
  await page.locator('#draftroom-root button:visible').filter({ hasText: /^Board$/ }).click();
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return root && [...root.querySelectorAll("div")].some(
      (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
  }, null, { timeout: 20000 });
}

/* Relative luminance and WCAG contrast, on the rgb()/rgba() strings the
   browser reports. Composites alpha over a stated ground, because every cell
   colour on this board is translucent. */
const CONTRAST = `
  function parse(s) { return (s.match(/[\\d.]+/g) || ["0","0","0"]).map(Number); }
  function over(c, under) {
    const a = c.length > 3 ? c[3] : 1;
    return [0,1,2].map(function (i) { return c[i] * a + under[i] * (1 - a); });
  }
  function lum(c) {
    const v = c.slice(0,3).map(function (n) {
      n /= 255; return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
  }
  function ratio(a, b) {
    const A = lum(a), B = lum(b);
    return (Math.max(A,B) + 0.05) / (Math.min(A,B) + 0.05);
  }
  function grid() {
    const root = document.getElementById("draftroom-root");
    return [...root.querySelectorAll("div")].find(function (d) {
      return getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols");
    });
  }
  /* The cells, which are grandchildren rather than children: each round is a
     display:contents wrapper, so grid().children is the header row plus
     fourteen wrappers - 25 elements, none of them a cell. Written that way
     first and every assertion in this file came back 0, which reads as the
     feature being missing rather than the selector being wrong. */
  function cells() {
    return [...grid().querySelectorAll('[class*="border-slate-rule/70"]')];
  }
`;

test.describe("what the board marks", () => {
  test("your column is marked all the way down, drafted or not", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await draftInto(page, 40);

    /* The whole feature. Marking only the filled cells says where you have
       been; the empty ones below are where you are going, which is the thing
       a snake board is read for. */
    const r = await page.evaluate((c) => {
      eval(c);
      const all = cells();
      const ringed = all.filter((e) => /0, 229, 255/.test(getComputedStyle(e).boxShadow));
      const filled = ringed.filter((e) => e.querySelector("p.truncate")).length;
      return { ringed: ringed.length, filled, empty: ringed.length - filled,
               rounds: league.rounds, mySlot: JukeEngine.mySlot(),
               allInOneColumn: new Set(ringed.map((e) => Math.round(e.getBoundingClientRect().left))).size };
    }, CONTRAST);

    expect(r.ringed, "one marked cell per round").toBe(r.rounds);
    expect(r.filled, "some of them drafted").toBeGreaterThan(0);
    expect(r.empty, "and some of them still to come").toBeGreaterThan(0);
    expect(r.allInOneColumn, "all in one column").toBe(1);
  });

  test("the live ring is on the pick that is on the clock, and moves with it",
    async ({ context }) => {
      const page = await openApp(context, "#/draft-room");
      await draftInto(page, 12);

      const read = () => page.evaluate((c) => {
        eval(c);
        const live = cells().map((e, i) => ({ e, i }))
          .filter(({ e }) => e.querySelector('[class*="border-teal-400"]'));
        return { count: live.length, index: live.length ? live[0].i : -1,
                 says: live.length ? live[0].e.textContent.replace(/\s+/g, " ").trim() : "" };
      }, CONTRAST);

      const before = await read();
      expect(before.count, "exactly one cell is on the clock").toBe(1);
      expect(before.says.toLowerCase()).toContain("on the clock");

      // One more pick, and the ring has to have moved with it.
      await page.evaluate(() => {
        const c = onTheClock(); makePick(cpuChoice(c.slot, c.round)); render();
      });
      await page.waitForTimeout(400);

      const after = await read();
      expect(after.count, "still exactly one").toBe(1);
      expect(after.index, "and it moved").not.toBe(before.index);
    });

  test("the seat bracket is drawn on the board's own ground, and clears its bar there",
    async ({ browser }) => {
      const context = await browser.newContext();
      const page = await openApp(context, "#/draft-room");
      await draftInto(page, 60);

      const r = await page.evaluate((c) => {
        eval(c);
        /* Transitions off before any colour is read: a pane that is not
           compositing produces no frames, so a transition never advances and
           getComputedStyle reports the starting value indefinitely. */
        const kill = document.createElement("style");
        kill.textContent = "* { transition: none !important }";
        document.head.appendChild(kill);

        const boardBg = parse(getComputedStyle(grid().parentElement).backgroundColor).slice(0, 3);
        const bracketed = cells().filter((e) => /0, 229, 255/.test(getComputedStyle(e).boxShadow));

        /* The load-bearing geometry. The shadow is 1px at lg+ and 2px below
           it, inset from the wrapper's own edges, and the card lives inside
           a 3px padding — so the rail and the card must not share a single
           pixel of x. Measured rather than assumed, because this is the
           whole reason one cyan value is enough on a board whose cells are
           now light: the moment the bracket moves onto a chalk fill it is
           #00E5FF on a pastel and the mark is gone.

           Reported as an overlap count, not a boolean, so a failure says how
           many cells were wrong rather than only that one was. */
        let overlaps = 0, gap = 99, measured = 0;
        bracketed.forEach((cell) => {
          const card = cell.querySelector('[class*="rounded-"]');
          if (!card) return;                       // an empty round, nothing to clear
          const cw = parseFloat(getComputedStyle(cell).boxShadow.match(/(-?[\d.]+)px 0px 0px 0px inset/)[1]);
          const railRight = cell.getBoundingClientRect().left + Math.abs(cw);
          const cardLeft = card.getBoundingClientRect().left;
          measured++;
          if (cardLeft < railRight) overlaps++;
          gap = Math.min(gap, cardLeft - railRight);
        });

        // And what it is actually drawn against, on both grounds it touches:
        // the board itself, and the sticky column header at the top of the
        // same column.
        const head = [...grid().querySelectorAll('[class*="sticky top-0"]')]
          .find((e) => /0, 229, 255/.test(getComputedStyle(e).boxShadow));
        const cyan = [0, 229, 255];
        const onBoard = ratio(cyan, boardBg);
        const onHead = head ? ratio(cyan, over(parse(getComputedStyle(head).backgroundColor), boardBg)) : null;

        return {
          bracketed: bracketed.length, measured, overlaps,
          gap: Math.round(gap * 100) / 100,
          headBracketed: !!head,
          onBoard: Math.round(onBoard * 100) / 100,
          onHead: onHead == null ? null : Math.round(onHead * 100) / 100,
        };
      }, CONTRAST);

      expect(r.measured, "there were filled cells in the column to measure").toBeGreaterThan(5);
      expect(r.overlaps, "the bracket never touches a card").toBe(0);
      expect(r.gap, "and it clears it by the card's own margin").toBeGreaterThan(0);

      /* The bracket starts at the header, not under it. A rail beginning at
         round 1 reads as a marked block of picks; one that includes the
         header reads as a marked column, which is the thing being marked. */
      expect(r.headBracketed, "the column header is bracketed too").toBe(true);

      // Marks, not type: 1.4.11's 3:1 is the right bar here, and the only
      // place in this project where the lower one applies.
      expect(r.onBoard, "cyan on the board's ground").toBeGreaterThanOrEqual(3);
      expect(r.onHead, "cyan on the column header").toBeGreaterThanOrEqual(3);

      /* The precondition the single value rests on. A light ground under the
         bracket would put cyan somewhere near the chalk fills it is supposed
         to be distinguishable from — so if this ever stops being true, the
         mark has to be re-derived and this is the line that says so. */
      const dark = await page.evaluate((c) => {
        eval(c);
        document.documentElement.setAttribute("data-theme", "light");
        const bg = parse(getComputedStyle(grid().parentElement).backgroundColor);
        return lum(bg);
      }, CONTRAST);
      expect(dark, "the board's ground is dark whatever the theme says").toBeLessThan(0.05);
    });

  /* Two tests used to live here: "the roster strip counts what each team
     holds" and "a count is white on its own solid". Both asserted on the
     header's own per-team position-count chips (span[title] matching
     "N POS"), and that row is gone — not broken, removed on purpose. A
     design review read it as an unlabelled row of coloured digits, and
     the Cockpit handoff this room was rebuilt from says the header should
     carry a name, "not a name crushed over four count chips," in the
     first place. DraftBoardGrid.jsx's header is a 30px avatar and a name
     now; what a team holds moved to the Roster panel, a different screen
     with a different shape, which is not what either of these two tests
     checked. Testing a screen that no longer exists is not a safety net,
     it is a permanently red light — deleted rather than left to fail
     forever, the same reasoning CLAUDE.md gives for deleting dead code
     instead of stubbing it out. */

  test("the number in the corner is the pick that cell really is", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await draftInto(page, 20);

    /* The property, not the arithmetic. A corner number is right when
       pickCode(overall, teams) equals the code that cell would carry —
       checking overallOf() against a second copy of overallOf() proves
       nothing, and the seat-versus-pick-number bug is what that misses. */
    const r = await page.evaluate((c) => {
      eval(c);
      const teams = league.teams;
      const empties = cells().filter((e) => !e.querySelector("p.truncate"));
      const bad = [];
      let checked = 0;
      empties.forEach((cell) => {
        const n = cell.textContent.trim().match(/^\d+/);
        if (!n) return;
        const overall = +n[0];
        checked++;
        // Where the engine says that overall number sits, independently.
        const onClock = DraftEngine.onTheClock(league, overall - 1);
        if (!onClock) return;
        const expected = DraftEngine.overallOf(onClock.round, onClock.slot, teams);
        if (expected !== overall) bad.push({ overall, expected });
      });
      return { checked, bad: bad.slice(0, 5), total: bad.length };
    }, CONTRAST);

    expect(r.checked, "there were empty cells carrying a number").toBeGreaterThan(20);
    expect(r.total ? r.bad : [], "each corner number is its own cell's pick").toEqual([]);
  });
});
