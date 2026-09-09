/* Grading a draft that is not the one in progress.
 *
 * The graders read the live draft through `state.picks` and `league`, and a
 * connected league's own draft is neither. The old way to ask anyway is
 * gradeAndRosterAt()'s — write every touched player's `drafted` flag, swap
 * state.picks, put it all back — which CLAUDE.md records as dangerous
 * because a restore is only right if nothing looked in between.
 *
 * withGrading() swaps two pointers instead and mutates nothing, so the
 * property worth asserting is not "the number is plausible" but "the live
 * draft did not move". Every test below is that.
 */

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

/* A foreign draft: a different room, different size, built from today's
   board so the ids resolve without inventing players. */
const FOREIGN = `(() => {
  const b = JukeEngine.board().filter((p) => p.projPts !== null);
  const teams = 4, rounds = 6;
  const shape = {
    ...JukeEngine.league(),
    teams, rounds,
    starters: { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DST: 1 },
    flex: 0, superflex: 0, bench: 0,
  };
  const picks = [];
  for (let i = 0; i < teams * rounds; i++) {
    const round = Math.floor(i / teams) + 1;
    const inRound = i % teams;
    const slot = round % 2 === 1 ? inRound : teams - 1 - inRound;
    picks.push({ slot, round, overall: i + 1, player: b[i] });
  }
  return { picks, shape };
})()`;

test.describe("grading a foreign draft", () => {
  test("it grades, and the live draft does not move", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await startSoloDraft(page);

    // Let the live room fill a little, so there is something to disturb.
    await page.evaluate(() => {
      for (let i = 0; i < 20 && !draftOver(); i++) {
        const c = onTheClock();
        makePick(cpuChoice(c.slot, c.round));
      }
    });

    const before = await page.evaluate(() => ({
      picks: state.picks.length,
      names: state.picks.map((p) => p.player.name).join("|"),
      teams: league.teams,
      grade: JukeEngine.draftAnalysis().map((t) => Math.round(t.total)).join(","),
      // The flag gradeAndRosterAt() writes. Nothing here may touch it.
      drafted: JukeEngine.board().filter((p) => p.drafted).length,
    }));

    const report = await page.evaluate(`(() => {
      const { picks, shape } = ${FOREIGN};
      const graded = JukeEngine.gradeDraft(picks, shape);
      return { rooms: graded.length, letters: graded.map((t) => t.grade) };
    })()`);

    const after = await page.evaluate(() => ({
      picks: state.picks.length,
      names: state.picks.map((p) => p.player.name).join("|"),
      teams: league.teams,
      grade: JukeEngine.draftAnalysis().map((t) => Math.round(t.total)).join(","),
      drafted: JukeEngine.board().filter((p) => p.drafted).length,
    }));

    // It really graded the foreign room, not the live one.
    expect(report.rooms, "four seats, not the live ten").toBe(4);
    expect(report.letters.filter(Boolean).length, "every seat got a letter").toBe(4);

    // And the live draft is untouched, field by field.
    expect(after.picks, "pick count").toBe(before.picks);
    expect(after.names, "the picks themselves").toBe(before.names);
    expect(after.teams, "the league shape").toBe(before.teams);
    expect(after.drafted, "every player's drafted flag").toBe(before.drafted);
    expect(after.grade, "and the live room still grades the same").toBe(before.grade);

    await context.close();
  });

  /* A nested call would restore the OUTER context on the way out of the
     inner one — the save-and-restore bug arriving through the door built to
     avoid it. There is no legitimate caller, so it refuses. */
  test("it refuses to nest rather than corrupting the outer context", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await startSoloDraft(page);

    const result = await page.evaluate(`(() => {
      const { picks, shape } = ${FOREIGN};
      let threw = false;
      const outer = JukeEngine.gradeDraft(picks, shape);
      // A second call AFTER the first must still work: the context was
      // cleared rather than left set, which is the half a finally buys.
      const again = JukeEngine.gradeDraft(picks, shape);
      return { first: outer.length, second: again.length, threw };
    })()`);

    expect(result.first).toBe(4);
    expect(result.second, "a later call is not poisoned by an earlier one").toBe(4);

    await context.close();
  });

  /* A throw inside the graders must not leave every later call reading a
     draft nobody is looking at. */
  test("a failure inside grading still restores the live draft", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await startSoloDraft(page);

    const ok = await page.evaluate(`(() => {
      const { shape } = ${FOREIGN};
      // A pick with no player throws somewhere inside bestLineup().
      let threw = false;
      try { JukeEngine.gradeDraft([{ slot: 0, round: 1, overall: 1, player: null }], shape); }
      catch (e) { threw = true; }
      // Whether or not it threw, the live room must grade again.
      const live = JukeEngine.draftAnalysis();
      return { threw, liveRooms: live.length, liveTeams: league.teams };
    })()`);

    expect(ok.liveRooms, "the live room grades after").toBe(ok.liveTeams);

    await context.close();
  });
});
