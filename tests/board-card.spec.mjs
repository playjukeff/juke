/* The draft board card, as the React board draws it.

   A cell used to be a surname and a position. It is four things now — who,
   what and where, which way the order is travelling, and which pick it was.
   It was five for one design pass: a face joined the list, then a design
   review read fifty small, low-resolution headshots on one screen as noise
   rather than information and asked for them gone (finding #17) — so the
   card lost the one thing on this list that was ever a picture rather than
   text, and everything below that used to test it went with it.

   This file used to drive the vanilla board through #/draft-legacy. It drives
   the real one now. One assertion changed shape with that move and it is not
   a weakening: the arrow is one glyph rotated rather than three characters,
   so direction is read off the transform.

   The load-bearing test is still the contrast one, and it is worth saying why
   it exists rather than being obvious. On the legacy board the sub-line
   carried `opacity: .85` for years, measuring 3.74 to 4.02 against the six
   position solids — every line, on every card, under the bar. It survived
   every contrast sweep this project ran, because a sweep reading `color` sees
   the colour and not the element's opacity. That is a third way to lie about
   contrast, after alpha and gradients, and it is the one this file watches.

   The cells are opaque chalk fills with dark ink on them since the palette
   handoff (option 2h), where they were translucent washes over a dark ground
   before it. The compositing step below survives that on purpose rather than
   being simplified away: over() is a no-op at alpha 1, and this cell has now
   been redrawn four times in two directions. A check that only works on the
   current fill is a check that has to be rewritten every time somebody
   changes it.

   What did change is the direction of the contrast. Every line on a card is
   dark type on a light ground now (#16202E and #2B3540 on six pastels), and
   the worst case measured across a real 60-pick board is 7.38:1 against the
   4.5 asserted — comfortably better than the translucent cells it replaced,
   which is worth knowing before anybody "improves" the sub colour. It was
   raised twice in design review and the handoff says explicitly not to
   lighten it.
*/

import { test, expect } from "@playwright/test";
import { openApp, awaitBoard } from "./helpers.mjs";

/* Through the bridge rather than through the setup screen's DOM. The legacy
   version had to open three <details>, write a <select> and click #startBtn;
   startDraft() is the same sequence with the DOM read removed, which is what
   the React settings screen calls too. */
async function draftInto(page, picks, teams = 10) {
  // The board first -- this presses #startBtn through evaluate(), which a
  // disabled attribute cannot refuse, so without it startDraft() returns
  // false and state.started never flips. See awaitBoard() in helpers.mjs.
  await awaitBoard(page);
  await page.evaluate(({ n, t }) => {
    if (t !== 10) window.JukeEngine.setLeague({ teams: t });
    window.JukeEngine.startDraft({ mySlot: 3, clockLength: 90 });
    // startDraft() ends in runCPUs(), which arms a cpuStep() timer to play
    // whoever it left on the clock. The loop below drives every pick itself
    // and never touches that timer, so left alone it fires 350ms later and
    // keeps rescheduling itself until it reaches my seat: mySlot 3 four
    // picks into an even round is three extra, untracked picks landing
    // while the assertions below are reading the board. Seen once as
    // "Expected 43, Received 42" on a test that asked for 40 — the engine
    // three picks ahead of what was asked for, and the grid one behind the
    // engine. The number of picks on the board has to be the number this
    // fixture asked for, or every count in this file is a race.
    // board-marks.spec.mjs's own draftInto() carries the same call.
    stopSim();
    for (let i = 0; i < n; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
    render();
    location.hash = "#/draft-room";
  }, { n: picks, t: teams });

  expect(await page.evaluate(() => state.started), "draft started").toBe(true);
  // Board, not the default tab any more — Decide is, since the Cockpit
  // rebuild — so every card test in this file needs the click before the
  // grid it waits for next will ever exist to wait for.
  //
  // :visible, not just the text filter: MobileDraftTabBar.jsx mounts its
  // own always-in-DOM "Board" button (lg:hidden, not unmounted) beside
  // DraftCockpitHeader's desktop tab nav (hidden md:flex) — same label,
  // two controls for two widths. Playwright's default viewport is well
  // above both breakpoints, so exactly one is actually visible; without
  // this the locator resolves two elements and .click() throws in strict
  // mode before a single one of this file's own assertions ever runs.
  await page.locator('#draftroom-root button:visible').filter({ hasText: /^Board$/ }).click();
  // The grid is React's, so wait for it rather than for the engine.
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return root && [...root.querySelectorAll("div")].some(
      (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
  }, null, { timeout: 20000 });
}

/* Every filled card on the board.

   Taken from the names outward, not by filtering divs that contain one:
   written that way first and every card counted three or four times, because
   a cell wrapper contains the name too, and so does its parent. 30 picks
   reported 138 cards. Walking up from each name to the nearest rounded box
   lands on the card itself, once. */
const FILLED = `(() => {
  const root = document.getElementById("draftroom-root");
  const grid = [...root.querySelectorAll("div")].find(
    (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
  return [...grid.querySelectorAll("p.truncate")]
    .map((n) => n.closest('[class*="rounded-lg"]'))
    .filter(Boolean);
})()`;

test.describe("the draft board card", () => {
  test("every line clears 4.5:1 on its own cell, opacity composited",
    async ({ context }) => {
      const page = await openApp(context, "#/draft-room");
      await draftInto(page, 60);

      const r = await page.evaluate((filledSrc) => {
        /* Transitions off before any colour is read. A pane that is not
           compositing produces no frames, so a transition never advances and
           getComputedStyle reports the value it started from — which does not
           look like an artifact, it looks like a bug with a plausible cause. */
        const kill = document.createElement("style");
        kill.textContent = "* { transition: none !important; animation: none !important }";
        document.head.appendChild(kill);

        const lum = (c) => {
          const [r, g, b] = c.map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const parse = (s) => (s.match(/[\d.]+/g) || ["0", "0", "0"]).map(Number);
        const over = (c, under) => {
          const a = c.length > 3 ? c[3] : 1;
          return [0, 1, 2].map((i) => c[i] * a + under[i] * (1 - a));
        };

        /* The board's own ground. The cards are opaque chalk fills now, so
           over() folds this away for every one of them — it is kept
           because a card that ever goes translucent again has to be
           composited against something real rather than against white,
           and because the empty-cell measurements below share it. Read off
           the grid's own scroll parent rather than matched by a hex class:
           that selector named #0B0E14 and the app moved to slate long ago,
           so it had been silently falling through to document.body. */
        const grid = [...document.getElementById("draftroom-root").querySelectorAll("div")].find(
          (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
        const board = parse(getComputedStyle(grid.parentElement).backgroundColor).slice(0, 3);

        const fails = [];
        let checked = 0, worst = 99;
        eval(filledSrc).forEach((card) => {
          // A cell's background is rgba over the board, so composite first.
          const bg = over(parse(getComputedStyle(card).backgroundColor), board);
          card.querySelectorAll("span, p").forEach((el) => {
            if (!el.textContent.trim()) return;
            const cs = getComputedStyle(el);
            let fg = over(parse(cs.color), bg);
            const op = parseFloat(cs.opacity);
            // The whole point: fold the element's own opacity into the colour
            // before measuring, or this assertion cannot see the bug.
            if (op < 1) fg = fg.map((v, i) => v * op + bg[i] * (1 - op));
            const a = lum(fg), b = lum(bg);
            const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            checked++;
            if (cr < worst) worst = cr;
            if (cr < 4.5) fails.push({ text: el.textContent.trim().slice(0, 10), cr: +cr.toFixed(2) });
          });
        });
        return { checked, worst: +worst.toFixed(2), fails: fails.slice(0, 6), total: fails.length };
      }, FILLED);

      expect(r.checked, "there were cards to measure").toBeGreaterThan(100);
      expect(r.total ? r.fails : [], "every line on every card clears 4.5:1").toEqual([]);
      expect(r.worst).toBeGreaterThanOrEqual(4.5);
    });

  test("the name is an initial and a surname, and a defense keeps its club",
    async ({ context }) => {
      const page = await openApp(context, "#/draft-room");
      await draftInto(page, 20);

      const r = await page.evaluate(() => {
        const wr = board.find((p) => p.pos === "WR" && p.name.split(" ").length >= 2);
        const dst = board.find((p) => p.pos === "DST");
        const suffix = board.find((p) => /\b(Jr\.|Sr\.|II|III|IV)$/.test(p.name));
        return {
          wr: { name: wr.name, short: window.JukeEngine.shortName(wr) },
          dst: dst && { name: dst.name, short: window.JukeEngine.shortName(dst) },
          suffix: suffix && { name: suffix.name, short: window.JukeEngine.shortName(suffix) }
        };
      });

      expect(r.wr.short).toBe(r.wr.name.split(" ")[0][0] + ". " + r.wr.name.split(" ").pop());

      /* "Los Angeles Chargers Defense" initialised is "L. Chargers", which is
         nobody: the first word of a club name is not a first name. Same rule as
         deciding a player's type from `player.pos` rather than from the shape
         of the data underneath. */
      expect(r.dst, "a defense is on the board").toBeTruthy();
      expect(r.dst.short, "a defense is not initialised").not.toMatch(/^[A-Z]\. /);

      // A suffix is dropped from the surname, not treated as one.
      if (r.suffix) expect(r.suffix.short).not.toMatch(/(Jr\.|Sr\.|II|III|IV)$/);

      // And the board is drawing that short form, not the full name.
      const drawn = await page.evaluate((src) =>
        eval(src).map((c) => c.querySelector("p.truncate").textContent.trim()).slice(0, 12), FILLED);
      expect(drawn.every((n) => n.length > 0), "every card carries a name").toBe(true);
      expect(drawn.some((n) => /^[A-Z]\. /.test(n)), "and it is the initialled form").toBe(true);
    });

  test("the arrow turns down on the last pick of every round", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await draftInto(page, 40);

    /* The turn is the one thing the pick numbers do not tell you on sight, and
       it is why the ends of the room pick twice in a row. Down on the last
       pick of a round; along the way its round runs otherwise.

       Read off the transform rather than the character. The board draws one
       glyph rotated three ways, because a down arrow and a right arrow are
       different characters and a face draws the vertical one far heavier —
       measured at 2.5x the ink. So "which way does this point" is a matrix,
       not a string.

       Scoped to cells, not the whole root: the Cockpit header row draws a
       30px avatar carrying the team's own initial, also aria-hidden (the
       visible team name beside it already says the same thing, so the
       initial is decorative) and — for a club like "Bone-Thugs-N-Montgomery"
       — also exactly one character. An unscoped query counts that as a
       141st arrow pointing nowhere. border-slate-rule/70 is a real board
       cell's own border colour, one shade lighter than the header's plain
       border-slate-rule, so it reaches only the fourteen rounds and never the
       row above them. */
    const r = await page.evaluate(() => {
      const root = document.getElementById("draftroom-root");
      const grid = [...root.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
      const arrows = [...grid.querySelectorAll('[class*="border-slate-rule/70"] span[aria-hidden="true"]')]
        .filter((s) => s.textContent.trim().length === 1);
      const dirOf = (a) => {
        const t = getComputedStyle(a).transform;
        return /matrix\(0, 1, -1, 0/.test(t) ? "down"
          : /matrix\(-1, 0, 0, -1/.test(t) ? "left" : "right";
      };
      const counts = { down: 0, left: 0, right: 0 };
      arrows.forEach((a) => counts[dirOf(a)]++);
      return { total: arrows.length, counts, rounds: league.rounds, teams: league.teams,
               glyphs: [...new Set(arrows.map((a) => a.textContent.trim()))] };
    });

    expect(r.total, "an arrow on every cell, drafted or not").toBe(r.rounds * r.teams);
    // Exactly one turn per round, and it is the last pick of that round.
    expect(r.counts.down, "one down arrow per round").toBe(r.rounds);
    expect(r.glyphs, "one glyph, rotated — never three characters").toHaveLength(1);
    expect(r.counts.left + r.counts.right, "the rest run along their round")
      .toBe(r.rounds * r.teams - r.rounds);
  });

  test("the pick on the card is the pick the app computed", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await draftInto(page, 40);

    /* The property, not the arithmetic. A pick code has to be derivable from
       the overall number and the league size alone, with no reference to the
       snake — checking it against a second copy of the same mirror proves
       nothing, and the seat-versus-pick-number bug is exactly what this
       catches: reading the seat hands out every code in a round exactly once,
       so a uniqueness test passes a board that is mirrored. */
    const r = await page.evaluate(() => {
      const root = document.getElementById("draftroom-root");
      const grid = [...root.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
      /* data-pick-code, not `span.font-plex`.

         The old selector rested on font-plex "naming nothing else on a
         card", which was true and then quietly stopped being true: the
         chalk-cell redesign made the position line mono as well, so this
         found two spans per card and reported double the expected count.
         Nothing about pick codes was wrong; the test was describing markup
         rather than the property under test, which is the exact failure
         this suite's own stale-spec note warns about.

         Filtering `span.font-plex` by the shape of a pick code
         (round-dot-two-digits) fixes the same count and was the other
         repair on the table. The attribute is preferred for the reason
         CLAUDE.md states: an attribute says what an element IS, and a
         value filter would also quietly drop a code that came out
         MALFORMED — which is one of the things this test exists to catch,
         since the assertion below is that every drawn code matches
         DraftEngine.pickCode() exactly. */
      const drawn = [...grid.querySelectorAll("[data-pick-code]")]
        .map((s) => s.textContent.trim());
      const expected = JukeEngine.picks().map(
        (p) => DraftEngine.pickCode(p.overall, league.teams));
      return { drawn, expected, missing: expected.filter((c) => !drawn.includes(c)) };
    });

    expect(r.drawn.length, "a code on every filled card").toBe(r.expected.length);
    expect(r.missing, "and each is the code its own overall implies").toEqual([]);
  });

  /* "A face is drawn per card, and a failed one leaves no hole" used to live
     here: two full browser contexts, one with headshots stubbed to a real
     1x1 gif and one with every request aborted, checking that a card without
     a photo still closes up cleanly rather than leaving a hole. There is no
     photo on a card any more to close up around — the design review that
     asked for this pass read fifty small, low-resolution faces on one board
     as noise rather than signal (finding #17), and DraftBoardGrid.jsx has no
     <img> left in it to fail. A test asserting `drawn.faces === cardsInView`
     against a board that draws zero faces everywhere would either read as a
     permanently red light on a feature nobody is trying to ship, or — worse,
     since 0 === 0 — pass by accident while checking nothing at all. Deleted
     rather than left behind, the same call made for the two roster-strip
     tests in board-marks.spec.mjs the same day, for the same reason. */

  test("a filled row is the same height as an empty one", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await draftInto(page, 15);

    /* Setting the card's height only on filled cells leaves the board with two
       row heights, and a row that grows the moment its first pick lands —
       which shoves everything below it down, once per round, on a pane that is
       simultaneously trying to keep the live pick centred. The row owns the
       height, not the cell: grid-auto-rows states it once.

       grid.children are grandparents to a cell, not parents: each round is a
       display:contents wrapper, so the grid's own children are the header
       row plus fourteen wrappers, none of them a cell — the corner box is
       the one child that does carry "border-b" in its own class, so the
       naive query used to measure exactly one thing, and the wrong one.
       border-slate-rule/70 is the real cells' own border colour and reaches
       them directly, the same selector board-marks.spec.mjs already uses to
       find the same grandchildren. */
    const r = await page.evaluate(() => {
      const root = document.getElementById("draftroom-root");
      const grid = [...root.querySelectorAll("div")].find(
        (d) => getComputedStyle(d).display === "grid" && d.style.getPropertyValue("--cols"));
      const cells = [...grid.querySelectorAll('[class*="border-slate-rule/70"]')];
      const h = (el) => Math.round(el.getBoundingClientRect().height);
      const filled = cells.filter((c) => c.querySelector("p.truncate")).map(h);
      const empty = cells.filter((c) => !c.querySelector("p.truncate") && h(c) > 10).map(h);
      return { filled: [...new Set(filled)], empty: [...new Set(empty)] };
    });

    expect(r.filled.length, "every filled cell is one height").toBe(1);
    expect(r.empty, "and an empty one matches it").toContain(r.filled[0]);
  });
});
