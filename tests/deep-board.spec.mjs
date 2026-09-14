/* Below real ADP there is no more market signal to rank by, and the app
   owes the reader the same honesty UNRANKED_POSITIONS already gets for a
   kicker or a defense: a claim with no draft behind it is not the same
   claim as one FFC's real drafts priced. See CLAUDE.md's "Take the board
   past 228 players" and extend_deep_bench() in scripts/build_players.py.

   Being deep is never on its own a reason to withhold the score — there is
   no three-season finding that the ranking is wrong, only the fact that no
   real draft has ever taken this player. So these tests check for a note and
   a marker rather than a null.

   "Unlike K/DST" is the wrong way to say that, though, and saying it that
   way is what left a standing red in this file. A player can be both. On the
   31 August 2026 board 25 of the 249 deep players are kickers or defenses,
   and FULL_POSITION_COVER pulls K and DST to the FRONT of the extension
   queue on purpose — so the FIRST deep player on a real board is one of
   them, and `board.find(p => p.deep && p.projPts !== null)` handed this
   file's first test Chris Boswell and then asserted the deep rule against a
   player the K/DST rule owns.

   The two rules are independent and both fire: jukeReadout() returns
   deep/deepNote alongside unranked/unrankedNote, and the stricter one wins
   the number. A test that means "deep" has to say so — see the filter in
   the first test, and the precedence pinned in the second rather than
   dodged.

   Gated on the board actually carrying a deep player: players.js only
   reaches past real ADP once the pipeline has run with real network
   access, and this checkout may be sitting between rebuilds. Same skip
   idiom news.spec.mjs already uses against a keyless worker — verify it in
   both directions, and treat a run where it never fires as informative
   too. */

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

async function hasDeepBench(page) {
  // A non-empty patch, even to the current default, so the bridge's own
  // setLeague() has actually run buildBoard() before board is read — the
  // guard's own poolSize()/setupProblem() read PLAYERS_SETS directly and
  // don't need this, but every per-player field here (deep, projPts, sd,
  // td) only exists once buildBoard() has copied it onto `board`.
  await page.evaluate((p) => window.JukeEngine.setLeague(p), { teams: 10 });
  return page.evaluate(() => typeof board !== "undefined" && board.some((p) => p.deep));
}

test.describe("deep-bench players carry no real ADP, and say so", () => {
  test("jukeReadout() notes it without withholding the score", async ({ context }) => {
    const page = await openApp(context);
    test.skip(!(await hasDeepBench(page)),
      "no deep-bench players on this board yet -- needs a data pipeline run");

    const r = await page.evaluate(() => {
      /* UNRANKED_POSITIONS is asked for rather than "K"/"DST" written out
         again: app.js is the one place that decides which positions go
         unranked, and a second copy here drifts the day a third joins it.

         Applied to the real-ADP player too, so the pair is like for like.
         It changes nothing that is asserted today — deep and deepNote are
         position-independent — and it is what stops the obvious symmetric
         assertion (that a real player's score is NOT null) walking into the
         same trap from the other side. */
      const rankable = (p) => UNRANKED_POSITIONS.indexOf(p.pos) < 0;
      const deep = board.find((p) => p.deep && p.projPts !== null && rankable(p));
      const real = board.find((p) => !p.deep && p.projPts !== null && rankable(p));
      return {
        deepReadout: deep ? window.JukeEngine.jukeReadout(deep) : null,
        realReadout: real ? window.JukeEngine.jukeReadout(real) : null,
      };
    });

    expect(r.deepReadout, "there is a deep player with a real projection to test").not.toBeNull();
    expect(r.deepReadout.deep).toBe(true);
    expect(typeof r.deepReadout.deepNote).toBe("string");
    expect(r.deepReadout.deepNote.length).toBeGreaterThan(0);
    // Not withheld -- see this file's own header comment.
    expect(r.deepReadout.score, "the score is a real number, not null").not.toBeNull();

    expect(r.realReadout, "there is a real-ADP player with a projection to compare against").not.toBeNull();
    expect(r.realReadout.deep, "a real-ADP player carries no deep flag").toBe(false);
    expect(r.realReadout.deepNote).toBeNull();
  });

  /* The intersection, pinned rather than avoided. Withholding has to be
     complete or it is worse than not withholding: a sheet that prints
     "no real draft has ever taken this player" and a Juke score beside it
     has told the reader to distrust a number and then handed them one. */
  test("a deep player the K/DST rule also covers keeps the stricter refusal", async ({ context }) => {
    const page = await openApp(context);
    test.skip(!(await hasDeepBench(page)),
      "no deep-bench players on this board yet -- needs a data pipeline run");

    const r = await page.evaluate(() => {
      const p = board.find((x) => x.deep && UNRANKED_POSITIONS.indexOf(x.pos) >= 0);
      return p ? { pos: p.pos, readout: window.JukeEngine.jukeReadout(p) } : null;
    });
    test.skip(r === null, "no deep K/DST on this board -- needs a data pipeline run");

    /* Both facts are true of this player, and both are said. Whichever of
       the two positions turns up first is fine and the wording has to suit
       either: a defense is eleven people, which is why app.js's ourRead()
       says "this defense" rather than "him". */
    expect(r.readout.deep, `${r.pos} is still flagged deep`).toBe(true);
    expect(typeof r.readout.deepNote).toBe("string");
    expect(r.readout.deepNote.length).toBeGreaterThan(0);
    expect(r.readout.unranked, `${r.pos} is still unranked`).toBe(true);
    expect(typeof r.readout.unrankedNote).toBe("string");
    expect(r.readout.unrankedNote.length).toBeGreaterThan(0);
    // And the K/DST refusal is the one that decides the number.
    expect(r.readout.score, "the score stays withheld, deep or not").toBeNull();
    expect(r.readout.label, "so there is no verdict word beside it either").toBeNull();
  });

  test("survivalProbability() withholds rather than divide by a fabricated sample", async ({ context }) => {
    const page = await openApp(context);
    test.skip(!(await hasDeepBench(page)),
      "no deep-bench players on this board yet -- needs a data pipeline run");

    const r = await page.evaluate(() => {
      const deep = board.find((p) => p.deep);
      return { sd: deep.sd, td: deep.td, prob: survivalProbability(deep, deep.overall + 20) };
    });

    expect(r.sd, "no real ADP sample to measure a spread from").toBe(0);
    expect(r.td, "and no sample size either").toBe(0);
    expect(r.prob, "so no fabricated survival odds").toBeNull();
  });

  test("the Players table marks a deep-bench player, once a draft reaches one", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");
    test.skip(!(await hasDeepBench(page)),
      "no deep-bench players on this board yet -- needs a data pipeline run");

    // A deep league, so the visible list actually reaches past real ADP —
    // the default ten-team, fourteen-round league never gets there.
    await page.evaluate((p) => window.JukeEngine.setLeague(p), { teams: 12, rounds: 20, bench: 11 });
    await page.waitForTimeout(500);
    await startSoloDraft(page);
    await page.waitForTimeout(2000);

    /* textContent, not innerText and not a text-matching locator. Both of
       those approximate what a sighted user sees right now, which for a
       several-hundred-row table with no windowing (PlayerQueueSidebar.jsx
       explains why not) reported this badge and divider missing — for
       text provably in the DOM the whole time, confirmed by re-querying
       the identical page with textContent and finding player names run
       correctly from real ADP down through the deep tail. Chromium's
       innerText does not promise to include text outside a long scrolled
       container's current layout viewport the way textContent does, and a
       locator's own text matching hit the identical gap. Query the DOM
       directly instead of asking what's "visible". */
    const r = await page.evaluate(() => {
      const root = document.getElementById("draftroom-root");
      return {
        hasDivider: root.textContent.includes("Real ADP ends here"),
        badgeCount: [...root.querySelectorAll("span")].filter((s) => s.textContent === "Deep").length,
      };
    });

    expect(r.hasDivider, "the deep-board divider renders in board order").toBe(true);
    expect(r.badgeCount, "at least one per-row confidence badge renders").toBeGreaterThan(0);

    await context.close();
  });
});
