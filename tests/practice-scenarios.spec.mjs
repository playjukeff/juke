/* "Practice a scenario" — the Mock Drafts lobby's 2x2 grid.

   design_handoff_practice_scenarios is unusually direct about what this
   module is for, under a heading called "Critical behavior": the draft room
   must launch using the settings of the card the user selected. Everything
   else about it is layout. So that is what most of this file asserts, and it
   asserts it against the engine rather than against the screen — a card that
   renders "Seat 12 · 12 teams" and starts a ten-team draft from seat 1 looks
   perfect in a screenshot.

   The last two tests are not about scenarios at all. They cover the two
   things the launcher exposed in code that was already there: a refused
   config has to leave the league untouched, and editing a league after a
   finished draft must not record that draft a second time. Both were
   confirmed red against the code as it stood.
*/

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* Unscoped. #draftroom-root is empty on every v3 address - the container
   stays in index.html but nothing portals into it - so every selector under
   it matched nothing and all six tests in this file spent 20s discovering
   the same thing at the same shared line.

   The marker itself survived the cutover untouched: V3DraftHome draws the
   same four cards and carries the same data-practice-scenario. An attribute
   says what a control IS, which is exactly why this file needed one line
   changed rather than a rewrite. */
const CARD = (id) => `[data-practice-scenario="${id}"]`;

// The lobby draws its cards from engine reads that are deferred (the board,
// draft-engine.js), so the grid is what says the screen is ready — not a
// duration, and not the route having changed.
async function openLobby(context) {
  const page = await openApp(context, "#/draft");
  await page.waitForSelector(CARD("guest.standard12"), { timeout: 20000 });
  return page;
}

async function leagueNow(page) {
  return page.evaluate(() => {
    const L = JukeEngine.league();
    return {
      teams: L.teams,
      rounds: L.rounds,
      scoring: L.scoring,
      bench: L.bench,
      superflex: L.superflex,
      seat: JukeEngine.mySlot() + 1,
      clock: JukeEngine.clockLength(),
      started: !!JukeEngine.headerInfo().started,
    };
  });
}

test.describe("Practice a scenario", () => {
  test("a guest gets four cards and each one says what it will run", async ({ context }) => {
    const page = await openLobby(context);

    const cards = await page.$$eval("[data-practice-scenario]", (els) =>
      els.map((el) => ({ id: el.dataset.practiceScenario, text: el.innerText })));

    expect(cards.map((c) => c.id)).toEqual([
      "guest.standard12", "guest.guided", "guest.turn", "guest.speed",
    ]);

    /* The handoff's own final copy, and it is asserted because the sublines
       are BUILT from each config rather than typed beside it — so this is
       really a check that the sentence and the settings still agree. Change
       guest.turn to eleven teams and this line is what says the card stopped
       describing itself. */
    const turn = cards.find((c) => c.id === "guest.turn").text;
    expect(turn).toContain("Draft from the turn");
    expect(turn).toContain("Seat 12 · 12 teams · Half PPR");

    /* No card may ever print an absent fact. The New format card carries no
       round count on purpose (a superflex roster is one slot deeper than the
       one it starts from, so setLeague() derives it), and the first version
       of sublineFrom() interpolated it unguarded and shipped "undefined
       rounds" onto a live card. Asserted across every card rather than that
       one, because the next config with an optional field will not be it. */
    cards.forEach((c) => expect(c.text).not.toContain("undefined"));

    await page.close();
  });

  test("pressing a card starts a draft with that card's settings", async ({ context }) => {
    const page = await openLobby(context);

    // guest.turn is the card that disagrees with the default league on every
    // axis a scenario can move: teams (12 v 10), rounds (15 v 14) and a fixed
    // seat (12) rather than a random one. A scenario that silently ignored
    // its config would land on 10 / 14 / seat 1 and fail on all three.
    const before = await leagueNow(page);
    expect(before.started).toBe(false);

    await page.click(CARD("guest.turn"));
    await page.waitForFunction(() => !!JukeEngine.headerInfo().started, null, { timeout: 20000 });

    expect(await leagueNow(page)).toMatchObject({
      teams: 12,
      rounds: 15,
      scoring: "half",
      seat: 12,
      started: true,
    });

    // And it is a real draft on the real route, not a settings change.
    expect(page.url()).toContain("#/draft");
    await page.close();
  });

  test("a scoring preset's own roster wins over a carried-over round count", async ({ context }) => {
    const page = await openLobby(context);

    /* The New format card's config deliberately omits `rounds`, because
       `superflex` adds a starting slot and therefore a round. This drives
       the same path directly rather than through that card, which only
       appears for a signed-in manager with three graded mocks.

       Default roster is 8 starters + 1 FLEX + 5 bench = 14 rounds; the
       preset adds the SFLEX, so the honest answer is 15. A launcher that
       took a rounds number on faith would run 14 and setupProblem() would
       have refused it. */
    const result = await page.evaluate(() =>
      JukeEngine.startScenario({
        id: "test.superflex",
        config: { teams: 10, scoring: "superflex", seat: "random" },
      }));

    expect(result.ok).toBe(true);
    expect(await leagueNow(page)).toMatchObject({
      teams: 10, scoring: "superflex", superflex: 1, rounds: 15, started: true,
    });
    await page.close();
  });

  test("the scenario is recorded on the draft it started", async ({ context }) => {
    const page = await openLobby(context);

    await page.click(CARD("guest.speed"));
    await page.waitForFunction(() => !!JukeEngine.headerInfo().started, null, { timeout: 20000 });

    // The clock is the one setting on this card that nothing else on the
    // lobby can reach, so it is worth its own line.
    expect((await leagueNow(page)).clock).toBe(30);

    await page.evaluate(() => JukeEngine.autoDraftRest());
    await page.waitForFunction(() => JukeEngine.historyList().length > 0, null, { timeout: 30000 });

    /* Requirement 4 of the handoff: the scenario id is logged on the created
       draft so it reaches "Your mock drafts" and can drive the signed-in
       card set later. Without it, "you have never tried this" is a question
       nothing in the app can answer. */
    const top = await page.evaluate(() => JukeEngine.historyList()[0]);
    expect(top.scenario).toBe("guest.speed");

    // And the tag does not survive into the next draft. A plain Start after
    // a scenario is not a scenario, and an id left behind would label it one.
    await page.evaluate(() => JukeEngine.startDraft({ mySlot: 0, clockLength: 60 }));
    await page.evaluate(() => JukeEngine.autoDraftRest());
    await page.waitForFunction(() => JukeEngine.historyList().length > 1, null, { timeout: 30000 });
    expect(await page.evaluate(() => JukeEngine.historyList()[0].scenario)).toBe(null);

    await page.close();
  });

  test("a refused scenario changes nothing at all", async ({ context }) => {
    const page = await openLobby(context);
    const before = await leagueNow(page);

    /* 24 teams over 20 rounds is 480 picks against a board that cannot
       absorb them — see absorbableSize(). startDraft() would refuse it too,
       but only AFTER the league had been rewritten, which would leave a
       manager on the lobby with settings they did not choose and a Start
       button that will not press. So the launcher asks first and puts every
       value back when the answer is no.

       Confirmed red without the restore: teams stayed at 24. */
    const result = await page.evaluate(() =>
      JukeEngine.startScenario({
        id: "test.impossible",
        config: { teams: 24, scoring: "ppr", rounds: 20, seat: "random", clockSeconds: 30 },
      }));

    expect(result.ok).toBe(false);
    expect(result.problem).toBeTruthy();
    expect(await leagueNow(page)).toEqual(before);
    await page.close();
  });

  test("editing the league after a finished draft does not record it twice", async ({ context }) => {
    const page = await openLobby(context);

    await page.evaluate(() => JukeEngine.startDraft({ mySlot: 0, clockLength: 60 }));
    await page.evaluate(() => JukeEngine.autoDraftRest());
    await page.waitForFunction(() => JukeEngine.historyList().length > 0, null, { timeout: 30000 });
    const afterFinish = await page.evaluate(() => JukeEngine.historyList().length);

    /* draftOver() is `picks.length >= teams * rounds`, so editing the league
       moves the finish line under a draft that is already over: stepping the
       team count up makes it false, stepping it back makes it true, and
       checkDraftFinished() reads that rising edge as "the draft just ended".

       The second entry is worse than a duplicate — recordHistory() stamps
       `teams: league.teams`, so the copy claims a team count the draft never
       ran at, and the Locker shows a twelve-team mock nobody drafted.

       Reachable from the Draft Settings screen since that screen could
       change a team count, and found by the scenario launcher only because
       its refusal path calls setLeague() twice by design. Confirmed red
       without noteDraftPhase() in setLeague(): 1 entry became 2. */
    await page.evaluate(() => JukeEngine.setLeague({ teams: 12 }));
    await page.evaluate(() => JukeEngine.setLeague({ teams: 10 }));

    expect(await page.evaluate(() => JukeEngine.historyList().length)).toBe(afterFinish);
    await page.close();
  });
});
