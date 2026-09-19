/* Kickers and defenses carry no Juke score.

   Backtested against three seasons of archived forecasts, the projection ranks
   these two no better than chance — K at r 0.37, -0.09, 0.57 and DST at 0.32,
   0.06, 0.25, against 0.58 to 0.73 everywhere else. One of those kicker
   seasons came out backwards.

   So the number is withheld. What these tests guard is that withholding it is
   *complete*: a sheet that prints a dash in the strip and then argues from the
   same projection three lines below has not withheld anything, it has just
   made itself harder to read. That is the failure this file exists to catch,
   and it is invisible to any check that only looks at the score itself.
*/

import { test, expect } from "@playwright/test";
import { openApp, clickLegacyStart } from "./helpers.mjs";

async function start(page) {
  await clickLegacyStart(page);
  expect(await page.evaluate(() => state.started), "draft started").toBe(true);
}

test.describe("the positions we decline to rank", () => {
  test("every kicker and defense scores null, and nobody else does",
    async ({ context }) => {
      const page = await openApp(context);
      await start(page);

      const r = await page.evaluate(() => {
        const out = {};
        board.forEach((p) => {
          out[p.pos] = out[p.pos] || { n: 0, nulls: 0, gapNulls: 0 };
          out[p.pos].n++;
          if (overallScore(p) === null) out[p.pos].nulls++;
          if (replacementGap(p) === null) out[p.pos].gapNulls++;
        });
        return out;
      });

      for (const pos of ["K", "DST"]) {
        expect(r[pos].nulls, `every ${pos} is unrated`).toBe(r[pos].n);
        // replacementGap is the same figure before the clamp, so it refuses too.
        expect(r[pos].gapNulls, `and reports no gap either`).toBe(r[pos].n);
      }
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        expect(r[pos].nulls, `${pos} is untouched`).toBe(0);
      }
    });

  test("the sheet says so, and says it everywhere", async ({ context }) => {
    const page = await openApp(context);
    await start(page);

    for (const pos of ["K", "DST"]) {
      await page.evaluate((ps) => openSheet(board.find((p) => p.pos === ps)), pos);

      const r = await page.evaluate(() => ({
        strip: [...document.querySelectorAll(".rankcell")]
          .map((c) => c.textContent.trim()).filter((t) => /JUKE SCORE/i.test(t))[0],
        note: document.querySelector(".jukenote").textContent.replace(/\s+/g, " "),
        unrated: !!document.querySelector(".sig.unrated"),
        meterCount: document.querySelectorAll(".sig-seg").length,
        /* Collapsed, because these are template literals wrapped in the
           source: textContent keeps the newlines, so a phrase that reads as
           one line on screen is "carry no Juke\n      score" to a regex. */
        ourRead: document.querySelector(".ourread").textContent.replace(/\s+/g, " "),
        method: document.querySelector(".method").textContent.replace(/\s+/g, " ")
      }));

      // The strip prints a dash rather than a number.
      expect(r.strip, `${pos} strip`).toContain("—");
      expect(r.note, `${pos} note explains`).toMatch(/Not rated/);

      /* The meter is replaced rather than fed a null. Left alone it renders an
         empty bar labelled "Very Low", which is a verdict — and further from
         the truth than the number it replaced. */
      expect(r.unrated, `${pos} gets the unrated block`).toBe(true);
      expect(r.meterCount, `and only Room to grow and Bust risk keep their bars`).toBe(2);

      /* The rest of the sheet has to agree. "K1 on the projection" argues from
         exactly the ordering we have just told the reader is worthless. */
      expect(r.ourRead, `${pos} Our read does not argue from projected rank`)
        .not.toMatch(/on the projection/);
      expect(r.method, `${pos} method note explains the absence`)
        .toMatch(/no Juke score/);
    }
  });

  test("a rated position is completely unaffected", async ({ context }) => {
    const page = await openApp(context);
    await start(page);

    await page.evaluate(() => openSheet(board.find((p) => p.name === "Jahmyr Gibbs")));
    const r = await page.evaluate(() => ({
      score: overallScore(board.find((p) => p.name === "Jahmyr Gibbs")),
      unrated: !!document.querySelector(".sig.unrated"),
      meterCount: document.querySelectorAll(".sig-seg").length,
      note: document.querySelector(".jukenote").textContent.replace(/\s+/g, " "),
      method: document.querySelector(".method").textContent.replace(/\s+/g, " ")
    }));

    expect(r.score, "still scored").toBe(100);
    expect(r.unrated, "no unrated block").toBe(false);
    expect(r.meterCount, "all three meters keep their bars").toBe(3);
    expect(r.note, "and the ordinary explanation").toMatch(/projected points/);
    expect(r.method).toMatch(/The Juke score is projected points/);
  });

  test("the grade still counts a kicker, because he really did score",
    async ({ context }) => {
      const page = await openApp(context);
      await start(page);

      /* Deliberately not withheld here. The grade runs on aboveReplacement()
         and asks how a finished roster performed; the Juke score asks how well
         a forecast ranks. Those are different questions and only the second
         one failed the backtest. */
      const r = await page.evaluate(() => {
        autoDraftRest();
        const k = board.find((p) => p.pos === "K" && p.drafted);
        return { above: k ? aboveReplacement(k) : null,
                 score: k ? overallScore(k) : null,
                 starters: analyseTeam(0).starters };
      });

      expect(r.score, "no Juke score").toBeNull();
      expect(r.above, "but a real value over replacement").not.toBeNull();
      expect(Number.isFinite(r.starters), "and the grade still computes").toBe(true);
    });

  test("suggestions leave an unrated player exactly where the market put him",
    async ({ context }) => {
      const page = await openApp(context);
      await start(page);

      /* modelMultipliers() already treats a null score as "no opinion" and
         returns 1 — the same path a player with no projection takes. Asserted
         because the alternative, pushing him down for the want of a score,
         would quietly stop the app ever recommending a kicker at all. */
      const r = await page.evaluate(() => {
        const pool = board.filter((p) => !p.drafted);
        const mult = modelMultipliers(pool);
        const k = pool.find((p) => p.pos === "K");
        const d = pool.find((p) => p.pos === "DST");
        const rb = pool.find((p) => p.pos === "RB");
        return { k: mult(k), d: mult(d), rb: mult(rb),
                 suggestionCount: suggestions("ALL").length };
      });

      expect(r.k, "a kicker pays full market price").toBe(1);
      expect(r.d, "so does a defense").toBe(1);
      expect(r.rb, "a rated player still earns his discount").toBeLessThan(1);
      expect(r.suggestionCount, "and suggestions still work").toBeGreaterThan(0);
    });
});
