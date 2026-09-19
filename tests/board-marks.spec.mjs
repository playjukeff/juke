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
import { openApp, awaitBoard, openBoardView } from "./helpers.mjs";

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
    /* #/draft/live, not #/draft. The cutover made the bare address the
       LAUNCHER and put the cockpit behind /live, so this was navigating
       away from the draft it had just built — and the failure landed on
       the Board tab press a moment later, which reads as a missing tab
       rather than as a fixture that left the screen. */
    location.hash = "#/draft/live";
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
  /* openBoardView() rather than a label click inside #draftroom-root,
     which is empty on every address since the cutover — see its own note
     in helpers.mjs. board-card.spec.mjs opens the same view the same way,
     and the two files agreeing about what a cell IS is what lets their
     assertions be read against each other. */
  await openBoardView(page);
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
  /* The board's own scroller, which carries its ground, and the cells.

     Both used to be found by hunting for a div with display:grid and a
     --cols property, then for a class fragment of the cell's border. v3's
     board is a real table, so a cell is a td element - a structural fact
     than something a walker infers from styling, and one that cannot go
     stale the next time a border colour moves. */
  function boardEl() {
    return document.querySelector('[aria-label="Draft board"]');
  }
  function cells() {
    return [...boardEl().querySelectorAll("tbody td")];
  }
  function isFilled(td) {
    return !!td.querySelector("button[data-overall]");
  }
  /* Your own column, by the ground it is painted on rather than by a class.

     The legacy board marked it with a cyan hairline rail and this file
     measured that rail's box-shadow. v3 paints the whole cell instead, so
     there is no shadow to read — and matching the Tailwind class that does
     it would be asserting what the mark LOOKS LIKE this month, which is
     the thing CLAUDE.md says to anchor away from.

     So: the ordinary cell ground is whatever most cells in a row share,
     and yours is the one that differs. That is the property the mark
     exists to create, it needs no second copy of which seat is yours, and
     it survives the mark being restyled as long as it stays a mark. */
  function mineCells() {
    const rows = [...boardEl().querySelectorAll("tbody tr")];
    const out = [];
    rows.forEach(function (tr) {
      const tds = [...tr.querySelectorAll("td")];
      const bgs = tds.map(function (td) { return getComputedStyle(td).backgroundColor; });
      const tally = {};
      bgs.forEach(function (b) { tally[b] = (tally[b] || 0) + 1; });
      const common = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
      tds.forEach(function (td, i) { if (bgs[i] !== common) out.push(td); });
    });
    return out;
  }
`;

test.describe("what the board marks", () => {
  test("your column is marked all the way down, drafted or not", async ({ context }) => {
    const page = await openApp(context, "#/draft");
    await draftInto(page, 40);

    /* The whole feature. Marking only the filled cells says where you have
       been; the empty ones below are where you are going, which is the thing
       a snake board is read for. */
    const r = await page.evaluate((c) => {
      eval(c);
      const ringed = mineCells();
      const filled = ringed.filter(isFilled).length;
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
      const page = await openApp(context, "#/draft");
      await draftInto(page, 12);

      const read = () => page.evaluate((c) => {
        eval(c);
        /* aria-current="step", which is what the live cell actually
           claims, rather than the teal border class it used to be found
           by. The attribute is the better anchor twice over: it is what a
           screen reader is told, and it cannot drift when the ring is
           restyled — v3 draws the ring as an inset shadow on a sibling
           span, so a class match would now find the wrong element or
           none. */
        const live = cells().map((e, i) => ({ e, i }))
          .filter(({ e }) => e.querySelector('[aria-current="step"]'));
        return { count: live.length, index: live.length ? live[0].i : -1,
                 says: live.length ? live[0].e.textContent.replace(/\s+/g, " ").trim() : "" };
      }, CONTRAST);

      const before = await read();
      expect(before.count, "exactly one cell is on the clock").toBe(1);
      /* Either word. The live cell has read `mine ? 'Your pick' : 'On the
         clock'` since Board.jsx was written, and this asserted only the
         second — while draftInto() pins mySlot: 3 and twelve picks in puts
         the live pick at overall 17, which in a reversed round 2 IS seat 3.
         So it named the reader's own cell every run and failed every run,
         on a board drawing exactly what it promises. A standing red is a
         suite nobody reads by the end of the week. */
      expect(before.says.toLowerCase()).toMatch(/on the clock|your pick/);

      // One more pick, and the ring has to have moved with it.
      await page.evaluate(() => {
        const c = onTheClock(); makePick(cpuChoice(c.slot, c.round)); render();
      });
      await page.waitForTimeout(400);

      const after = await read();
      expect(after.count, "still exactly one").toBe(1);
      expect(after.index, "and it moved").not.toBe(before.index);
    });

  test("your own column is legible as yours, on both grounds it touches",
    async ({ browser }) => {
      const context = await browser.newContext();
      const page = await openApp(context, "#/draft");
      await draftInto(page, 60);

      /* ---- What this replaced, and why it could not be translated ----

         This measured a cyan hairline rail: its box-shadow width, and that
         the rail and the card never shared a pixel of x. The reasoning was
         specific and good — the moment the bracket moved onto a chalk fill
         it would be #00E5FF on a pastel and the mark would be gone — and
         it is moot here, because v3 does not draw a rail. It paints your
         column's cells with their own ground and gives the column header
         the band.

         So the GEOMETRY assertion retires with the rail that needed it,
         and the LEGIBILITY one does not: a mark nobody can distinguish
         from an ordinary cell is the same failure the rail's own note was
         about, arriving through a different mark. That is what is asserted
         here, on both grounds the column touches.

         It is not a contrast ratio. These are two adjacent surfaces rather
         than text on a ground, so 4.5:1 is the wrong bar — the same call
         the board's own gold ring records, and the reason the header's
         white LABEL is measured separately below at the bar that does
         apply to it. */
      const r = await page.evaluate((c) => {
        eval(c);
        /* Transitions off before any colour is read: a pane that is not
           compositing produces no frames, so a transition never advances and
           getComputedStyle reports the starting value indefinitely. */
        const kill = document.createElement("style");
        kill.textContent = "* { transition: none !important }";
        document.head.appendChild(kill);

        const boardBg = parse(getComputedStyle(boardEl()).backgroundColor).slice(0, 3);
        const mine = mineCells();

        /* One row's worth of evidence: my cell against a neighbour in the
           same row, so the comparison is between two cells drawn at the
           same moment under the same theme rather than against a constant
           written down here. */
        const row = mine.length ? mine[0].parentElement : null;
        const neighbour = row
          ? [...row.querySelectorAll("td")].find((td) => !mine.includes(td))
          : null;
        const mineBg = mine.length ? over(parse(getComputedStyle(mine[0]).backgroundColor), boardBg) : null;
        const otherBg = neighbour ? over(parse(getComputedStyle(neighbour).backgroundColor), boardBg) : null;
        /* Distance in plain rgb rather than a ratio: two grounds a step
           apart can share a luminance and still read as different colours,
           and it is difference rather than contrast that a reader is using
           to find their column. */
        const apart = mineBg && otherBg
          ? Math.round(Math.sqrt([0, 1, 2].reduce((t, i) => t + Math.pow(mineBg[i] - otherBg[i], 2), 0)))
          : null;

        /* The header for the same column, which is the other ground the
           mark touches. It carries text, so the bar here IS 4.5:1 on it.

           Found by its GROUND rather than by what it says. The head used to
           read "You" over every other head's "Seat N", and the seat number
           is what it says now — which is the point: the column is marked by
           the band it is drawn in, and a match on the word would have gone
           looking for a label the design deliberately removed. */
        const heads = [...boardEl().querySelectorAll("thead th")];
        const mineLeft = mine.length ? Math.round(mine[0].getBoundingClientRect().left) : null;
        const myHead = heads.find((th) => Math.round(th.getBoundingClientRect().left) === mineLeft);
        let headText = null, headRatio = null;
        if (myHead) {
          headText = myHead.textContent.replace(/\s+/g, " ").trim();
          const hb = over(parse(getComputedStyle(myHead).backgroundColor), boardBg);
          const label = myHead.querySelector("span");
          headRatio = label ? Math.round(ratio(over(parse(getComputedStyle(label).color), hb), hb) * 100) / 100 : null;
        }

        return { mine: mine.length, rounds: league.rounds, apart, headText, headRatio, mySeat: state.mySlot,
                 oneColumn: new Set(mine.map((e) => Math.round(e.getBoundingClientRect().left))).size };
      }, CONTRAST);

      expect(r.mine, "a marked cell in every round").toBe(r.rounds);
      expect(r.oneColumn, "all of them in one column").toBe(1);
      /* 12 is the just-noticeable bar this project already uses for a mark
         that is not carrying text — the same figure the team accents are
         held to against the card. Below it the column is technically
         painted and practically invisible, which is the failure the rail's
         1.06-on-a-chalk-fill measurement was about. */
      expect(r.apart, "your ground is visibly not an ordinary cell's").toBeGreaterThanOrEqual(12);
      /* The head still names the column's own team, which in a solo mock is
         the only name that seat has. What it no longer does is say "You"
         where every other head says a seat number. */
      expect(r.headText, "and the column header names the team").toMatch(/your team/i);
      expect(r.headText, "without a bare \"You\" where the others say a seat")
        .toMatch(new RegExp(`^Seat ${r.mySeat + 1}(?!\\d)`));
      expect(r.headRatio, "legibly").toBeGreaterThanOrEqual(4.5);
    });

  test("the number in the corner is the pick that cell really is", async ({ context }) => {
    const page = await openApp(context, "#/draft");
    await draftInto(page, 20);

    /* The property, not the arithmetic. A corner number is right when
       pickCode(overall, teams) equals the code that cell would carry —
       checking overallOf() against a second copy of overallOf() proves
       nothing, and the seat-versus-pick-number bug is what that misses. */
    const r = await page.evaluate((c) => {
      eval(c);
      const teams = league.teams;
      const empties = cells().filter((td) => !isFilled(td));
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
