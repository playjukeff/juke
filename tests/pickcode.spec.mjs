/* What a pick is called, on the screens that call it something.

   `pickCode()` was reading the seat rather than the pick within the round, so
   every even round came out mirrored: in a ten-team league the first pick of
   round two was labelled "2.10" and the last was labelled "2.01". Odd rounds
   were correct, which is the whole reason it survived — half the board agreed
   with it at any moment.

   The engine suite asserts the arithmetic and is faster at it. What it cannot
   do is read the screen, and this bug was visible there in a way it was not in
   a unit test: the header prints the code and the overall number side by side,
   so a mirrored label puts two numbers next to each other that cannot both be
   true. That is the check worth having in a browser, and it is the same shape
   as the standings printing starter strength under a total — the arithmetic
   was never the thing that gave it away.
*/

import { test, expect } from "@playwright/test";
import { openApp, awaitBoard } from "./helpers.mjs";

async function startAt(page, teams) {
  // The board first -- this presses #startBtn through evaluate(), which a
  // disabled attribute cannot refuse, so without it startDraft() returns
  // false and state.started never flips. See awaitBoard() in helpers.mjs.
  await awaitBoard(page);
  await page.evaluate((t) => {
    document.querySelectorAll("details.setupbox").forEach((d) => (d.open = true));
    if (t !== 10) {
      const el = document.getElementById("teamCount");
      el.value = String(t);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.getElementById("startBtn").click();
  }, teams);
  expect(await page.evaluate(() => state.started), "draft started").toBe(true);
}

test.describe("a pick is named by its place in the round", () => {
  test("the header's two numbers agree with each other", async ({ context }) => {
    const page = await openApp(context);
    await startAt(page, 10);

    /* Step through a whole round and a half by hand, so the even round — the
       only place the bug lived — is actually reached. */
    const seen = [];
    for (let i = 0; i < 16; i++) {
      const row = await page.evaluate(() => {
        const label = document.getElementById("pickLabel").textContent;
        const m = label.match(/Pick (\d+)\.(\d+) \((\d+) Overall\)/);
        return m && { round: +m[1], inRound: +m[2], overall: +m[3], teams: league.teams };
      });
      if (!row) break;
      seen.push(row);
      await page.evaluate(() => { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); render(); });
    }

    expect(seen.length, "the header was read through a round and a half")
      .toBeGreaterThan(12);

    // The overall number fixes the round and the pick within it completely.
    // Any label disagreeing with its own bracket is the bug.
    const wrong = seen.filter((r) =>
      r.round !== Math.ceil(r.overall / r.teams) ||
      r.inRound !== r.overall - (Math.ceil(r.overall / r.teams) - 1) * r.teams);
    expect(wrong, "every header label matches its own overall number").toEqual([]);

    // And the second round has to have been reached, or this proved nothing:
    // odd rounds are correct either way.
    expect(seen.some((r) => r.round === 2), "an even round was reached").toBe(true);
  });

  test("the board's empty cells count up through every round", async ({ context }) => {
    const page = await openApp(context);
    await startAt(page, 10);

    /* Read off the rendered grid rather than computed. Round two reading
       2.10 … 2.01 left to right is exactly right — the pick order runs
       backwards through it — and it is the row a seat-based label gets wrong
       in precisely the opposite direction.

       The cell on the clock is skipped, because it is the clock: it renders a
       countdown instead of its label, deliberately, so that nobody has to look
       away from where the pick lands to see how long is left. At pick one that
       is the first cell of round one. */
    const rows = await page.evaluate(() => {
      const cells = [...document.querySelectorAll(".board .cell")];
      const out = [];
      for (let r = 0; r < league.rounds; r++) {
        out.push(cells.slice(r * league.teams, (r + 1) * league.teams)
          /* .cell-pick, not the cell's whole text. An empty cell also carries
             the direction the order is travelling and the overall number of
             the pick, so reading textContent here answers "2→1.02" — which is
             three correct facts and not the one this test is about. It read
             the whole cell only because the cell used to hold one thing. */
          .map((c) => {
            if (c.classList.contains("now")) return null;
            const code = c.querySelector(".cell-pick");
            return code && code.textContent.trim();
          }));
      }
      return { out, teams: league.teams };
    });

    expect(rows.out[0], "round one runs left to right, bar the live cell")
      .toEqual([null, "1.02", "1.03", "1.04", "1.05",
                "1.06", "1.07", "1.08", "1.09", "1.10"]);
    expect(rows.out[1], "round two runs the other way")
      .toEqual(["2.10", "2.09", "2.08", "2.07", "2.06",
                "2.05", "2.04", "2.03", "2.02", "2.01"]);

    // Every round holds each pick number exactly once, whichever way it runs.
    rows.out.forEach((round, i) => {
      const nums = round.filter(Boolean).map((t) => +t.split(".")[1]).sort((a, b) => a - b);
      const want = [...Array(rows.teams)].map((_, n) => n + 1).filter((n) => !(i === 0 && n === 1));
      expect(nums, `round ${i + 1} holds 1..${rows.teams}`).toEqual(want);
    });
  });

  test("a different league size is not a special case", async ({ context }) => {
    const page = await openApp(context);
    await startAt(page, 12);

    /* Twelve rather than ten, because everything above is asserted against a
       ten-team board and a mirror written as `teams - slot` is exactly the
       kind of thing that can be quietly correct for one league size only.

       Odd sizes are left to the engine suite: TEAM_COUNTS is every even
       number from 4 to 24, so thirteen teams is not a league this app can be
       put into, and a browser test claiming to cover one would be testing a
       screen nobody can reach. */
    const r = await page.evaluate(() => {
      const codes = [];
      for (let n = 1; n <= league.teams * 3; n++) codes.push(pickCode(n));
      return { codes, teams: league.teams };
    });

    expect(r.teams).toBe(12);
    expect(r.codes[0]).toBe("1.01");
    expect(r.codes[11]).toBe("1.12");
    expect(r.codes[12], "the first pick of round two, whoever holds the seat")
      .toBe("2.01");
    expect(r.codes[23], "and the last").toBe("2.12");
    expect(r.codes[24]).toBe("3.01");
  });

  test("the ticker says the same thing the header did", async ({ context }) => {
    const page = await openApp(context);
    await startAt(page, 10);

    /* Two renderers, one fact. They read the same function now, and the point
       of asserting it here is that they did not have to — the ticker could
       have grown its own label at any time and nothing would have complained. */
    const r = await page.evaluate(() => {
      for (let i = 0; i < 12; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
      /* makePick() does not set this — every caller does it afterwards, and
         the ticker stays hidden without it. Stepping the clock by hand means
         doing what the callers do, or this asserts against a hidden element
         and skips itself, which is not a test. */
      state.lastPick = state.picks[state.picks.length - 1];
      render();
      const tick = document.querySelector(".tick-pick");
      return { overall: state.lastPick.overall, teams: league.teams,
               ticker: tick && tick.textContent.trim() };
    });

    expect(r.ticker, "the ticker is on screen").toBeTruthy();
    // Twelve picks in, so the pick being announced is in the even round.
    expect(Math.ceil(r.overall / r.teams), "and announcing an even round").toBe(2);
    const round = Math.ceil(r.overall / r.teams);
    const inRound = r.overall - (round - 1) * r.teams;
    expect(r.ticker).toBe(round + "." + String(inRound).padStart(2, "0"));
  });
});
