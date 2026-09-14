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
import { openApp, awaitBoard, openBoardView } from "./helpers.mjs";

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
    /* #/draft/live, not #/draft. The cutover made the bare address the
       LAUNCHER and put the cockpit behind /live, so this was navigating
       away from the draft it had just built — and the failure landed on
       the Board tab press a moment later, which reads as a missing tab
       rather than as a fixture that left the screen. */
    location.hash = "#/draft/live";
  }, { n: picks, t: teams });

  expect(await page.evaluate(() => state.started), "draft started").toBe(true);
  /* Board is not the default view, so every card test here needs the tab
     press before the table it waits for exists to be waited for.

     Both halves of that moved at the cutover and only one of them is the
     address. The click matched a label inside #draftroom-root, which is
     empty on every route now — so the locator resolved nothing, waited its
     full timeout and reported a click that timed out, which reads as a
     broken app rather than as a scope pointed at a screen nobody renders.

     openBoardView() is in helpers.mjs because board-marks.spec.mjs needs
     exactly the same two steps, and the two files agreeing about what a
     cell IS is what makes their assertions comparable. It also settles the
     two-controls-one-label problem the `:visible` filter above was for,
     by asking the accessibility tree instead of the DOM. */
  await openBoardView(page);
}

/* Every filled card on the board.

   This used to walk outward from each player name to the nearest rounded
   box, because the legacy cell carried nothing saying "I am a cell" —
   written the obvious way first, every card counted three or four times
   and 30 picks reported 138 cards.

   v3's filled cell is a button carrying data-overall, so the attribute IS
   the identity and there is nothing left to infer or to miscount. Empty
   cells deliberately do not carry it: they hold a pick code, a direction
   and an overall number rather than a player, and collapsing the two is
   how an assertion about a card passes on a dashed placeholder. */
const FILLED = `[...document.querySelectorAll('[aria-label="Draft board"] button[data-overall]')]`;

/* Every UNDRAFTED cell, which is where the direction arrow lives. Selected
   by the absence of that button rather than by a class: a td with no
   filled card inside it is undrafted by construction, whatever it happens
   to be styled like this month. */
const EMPTY = `[...document.querySelectorAll('[aria-label="Draft board"] tbody td')]
  .filter((td) => !td.querySelector("button[data-overall]"))`;

test.describe("the draft board card", () => {
  test("every line clears 4.5:1 on its own cell, opacity composited",
    async ({ context }) => {
      const page = await openApp(context, "#/draft");
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

        /* The board's own ground. The cards are opaque chalk fills, so
           over() folds this away for every one of them — it is kept
           because a card that ever goes translucent again has to be
           composited against something real rather than against white.
           Read off the scroller that carries the board rather than matched
           by a hex class: an earlier version named #0B0E14, the app moved
           to slate, and it had been silently falling through to
           document.body ever since. */
        const scroller = document.querySelector('[aria-label="Draft board"]');
        const board = parse(getComputedStyle(scroller).backgroundColor).slice(0, 3);

        const fails = [];
        let checked = 0, worst = 99;
        eval(filledSrc).forEach((card) => {
          // A cell's background is rgba over the board, so composite first.
          const bg = over(parse(getComputedStyle(card).backgroundColor), board);
          card.querySelectorAll("span").forEach((el) => {
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
      const page = await openApp(context, "#/draft");
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
      /* The name is the card's FIRST line. It was `p.truncate`, which the
         legacy cell used; v3 draws spans, and the name is the one the
         position/club/code line sits under. Taken by position rather than
         by class for that reason — a class is what an element looks like
         and the order is what it IS. */
      const drawn = await page.evaluate((src) =>
        eval(src).map((c) => c.querySelector("span").textContent.trim()).slice(0, 12), FILLED);
      expect(drawn.every((n) => n.length > 0), "every card carries a name").toBe(true);
      expect(drawn.some((n) => /^[A-Z]\. /.test(n)), "and it is the initialled form").toBe(true);
    });

  test("the arrow points the way its round runs, on every cell still to play",
    async ({ context }) => {
    const page = await openApp(context, "#/draft");
    await draftInto(page, 40);

    /* The turn is the one thing the pick numbers do not tell you on sight,
       and it is why the ends of the room pick twice in a row.

       ---- What changed, and what did not ----

       This asserted "an arrow on every cell, drafted or not", and the rule
       behind that sentence was a fix: the legacy board drew the arrow on
       DRAFTED cells only, so the snake was legible over the half of the
       board that had already happened and not over the half still to be
       played. That is backwards — the turn matters BEFORE the picks land.

       v3 draws it on the undrafted cells and not on the cards, which is
       that same rule followed to its end rather than a regression from it:
       the arrow is now exactly where the question is asked and nowhere it
       has already been answered. A filled cell spends its room on the
       player instead, which is the "every true fact added to a cell with
       room in it costs some of that" call the hero shot already records.

       So the assertion moves to the cells that still have a turn to state,
       and the count is derived from how far the draft has got rather than
       from rounds x teams — which is what makes it a property rather than
       an arithmetic identity restated.

       ---- And it is three characters now, deliberately ----

       The legacy board drew ONE glyph rotated three ways, because a face
       draws a vertical arrow far heavier than a horizontal one — measured
       at 2.5x the ink — so "which way does this point" was a matrix rather
       than a string, and a test reading the character would have found one
       glyph everywhere. v3 draws the three real characters, so the
       assertion reads them; the old "one glyph, rotated" line is retired
       rather than translated, because it describes a workaround this board
       does not need. */
    const r = await page.evaluate((emptySrc) => {
      const cells = eval(emptySrc);
      const rows = [];
      cells.forEach((td) => {
        const code = td.querySelector("[data-pick-code]");
        const arrow = [...td.querySelectorAll('span[aria-hidden="true"]')]
          .map((x) => x.textContent.trim()).filter((t) => "\u2193\u2192\u2190".includes(t) && t)[0];
        if (!code) return;
        /* The second half of a pick code is the PICK IN ROUND, not the
           seat - "6.10" is the tenth pick of round six, whichever chair
           that is. Read as a seat it inverts the ends of every reversed
           round, which is the seat-versus-pick-number confusion pickCode()
           itself was written to end. */
        const [round, pickNo] = code.textContent.trim().split(".").map(Number);
        rows.push({ round, pickNo, arrow });
      });
      /* What each cell SHOULD say, from the engine rather than from a
         second copy of the mirror — the same discipline the pick-code test
         below already follows. reversedRound() is exported precisely so a
         caller never re-derives `round % 2 === 0`, which is right for a
         plain snake and wrong for the two other orders this league can
         run. */
      const want = (round, pickNo) =>
        pickNo === league.teams ? "\u2193"
          : DraftEngine.reversedRound(round, league) ? "\u2190" : "\u2192";
      const wrong = rows.filter((c) => c.arrow !== want(c.round, c.pickNo))
        .slice(0, 5)
        .map((c) => ({ code: c.round + "." + c.pickNo, drew: c.arrow, want: want(c.round, c.pickNo) }));
      return {
        total: rows.length,
        missing: rows.filter((c) => !c.arrow).length,
        down: rows.filter((c) => c.arrow === "\u2193").length,
        wrong,
        undrafted: league.teams * league.rounds - JukeEngine.picks().length,
        /* One per round whose LAST pick has not been made. The last pick of
           round r is overall r x teams, so this needs no second walk of the
           board and no reference to the snake at all. */
        downExpected: Array.from({ length: league.rounds }, (_, i) => i + 1)
          .filter((round) => round * league.teams > JukeEngine.picks().length).length,
        glyphs: [...new Set(rows.map((c) => c.arrow))].sort()
      };
    }, EMPTY);

    expect(r.total, "an arrow is checked on every cell still to play")
      .toBe(r.undrafted);
    expect(r.missing, "and not one of them is bare").toBe(0);
    expect(r.wrong, "each points the way its own round runs").toEqual([]);
    /* The down arrow is the one that carries information a reader cannot
       get anywhere else, so it is asserted on its own rather than left to
       the per-cell check: one per round that has a last pick still to make.
       With forty picks gone in a ten-team league that is the ten rounds
       after the fourth, and stating it that way rather than as `rounds`
       is what stops this passing on a board that drew no turn at all. */
    expect(r.down, "one turn per round still to be played")
      .toBe(r.downExpected);
  });

  test("the pick on the card is the pick the app computed", async ({ context }) => {
    const page = await openApp(context, "#/draft");
    await draftInto(page, 40);

    /* The property, not the arithmetic. A pick code has to be derivable from
       the overall number and the league size alone, with no reference to the
       snake — checking it against a second copy of the same mirror proves
       nothing, and the seat-versus-pick-number bug is exactly what this
       catches: reading the seat hands out every code in a round exactly once,
       so a uniqueness test passes a board that is mirrored. */
    const r = await page.evaluate(() => {
      /* Scoped to the FILLED cards, because v3 puts a code on an empty
         cell too — it is how a reader works out when they pick again, and
         board-marks.spec.mjs asserts that half. Counting both here would
         report 140 codes against 40 picks and read as a duplication bug.

         data-pick-code, not `span.font-plex`.

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
      const drawn = [...document.querySelectorAll(
        '[aria-label="Draft board"] button[data-overall] [data-pick-code]')]
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
    const page = await openApp(context, "#/draft");
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
      /* Every cell is a `td` now rather than a div found by hunting for a
         grid with a --cols property set, so "the row owns the height" is
         something the table states rather than something a walker infers.
         The rule it protects is unchanged: a height set only on filled
         cells leaves the board with two row heights and a row that grows
         the moment its first pick lands, shoving everything below it down
         once per round on a pane that is simultaneously trying to keep the
         live pick centred. */
      const cells = [...document.querySelectorAll('[aria-label="Draft board"] tbody td')];
      const h = (el) => Math.round(el.getBoundingClientRect().height);
      const isFilled = (c) => !!c.querySelector("button[data-overall]");
      const filled = cells.filter(isFilled).map(h);
      const empty = cells.filter((c) => !isFilled(c) && h(c) > 10).map(h);
      return { filled: [...new Set(filled)], empty: [...new Set(empty)] };
    });

    expect(r.filled.length, "every filled cell is one height").toBe(1);
    expect(r.empty, "and an empty one matches it").toContain(r.filled[0]);
  });
});
