/* A connected league's own completed draft, graded.
 *
 * The fixture is a REAL one: the snapshot the worker builds for a real
 * ten-team ESPN league, captured the morning after its draft, with its
 * scoring and lineup as read from ESPN and every pick already crosswalked.
 * A hand-written one would test the renderer and nothing about whether a
 * real league's shape survives the trip, which is where every defect in
 * this path has been.
 *
 * The panel that draws this sits behind Clerk's <SignedIn> and a keyless
 * build renders none of it — the gap league-connect.spec.mjs records — so
 * what is driven here is the engine path the panel calls.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openApp } from "./helpers.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/league-draft.json", import.meta.url)));

async function ready(page) {
  await page.waitForFunction(
    () => window.JukeEngine && JukeEngine.dataReady() && JukeEngine.board().length > 0,
    null, { timeout: 20000 }
  );
}

test.describe("the league draft report", () => {
  test("it grades every seat of a real league's draft", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await ready(page);

    const r = await page.evaluate((fx) => {
      const out = JukeEngine.leagueDraftReport(fx);
      return {
        seats: out.seats.length,
        graded: out.seats.filter((s) => s.grade).length,
        ranks: out.seats.map((s) => s.rank),
        names: out.seats.map((s) => s.name).filter(Boolean).length,
        counted: out.counted,
        unplaceable: out.unplaceable,
        scored: out.scored,
        mine: out.seats.filter((s) => s.mine).map((s) => s.name),
        rounds: out.shape.rounds,
        teams: out.shape.teams,
      };
    }, FIXTURE);

    expect(r.seats, "one seat per team").toBe(10);
    expect(r.graded, "every seat got a letter").toBe(10);
    /* Ranks tie on ROUNDED totals and skip the next number when they do
       (app.js's own rule, so four teams can share a 4 and nobody is 5th).
       So the property is every seat placed inside the room, and somebody
       first -- not a contiguous 1..10, which this room does not have. */
    expect(Math.min(...r.ranks), "somebody came first").toBe(1);
    expect(r.ranks.every((n) => n >= 1 && n <= 10), "all inside the room").toBe(true);
    expect(r.names, "every seat is named, not ten undefineds").toBe(10);
    expect(r.counted, "every pick was placed").toBe(140);
    expect(r.unplaceable).toBe(0);
    expect(r.teams).toBe(10);
    /* Read from ESPN's lineupSlotCounts, and it independently agrees with
       the round count the draft actually ran — two sources of one fact. */
    expect(r.rounds, "the lineup's own round count").toBe(14);
    expect(r.scored, "under the league's rules, not this session's").toBe("league");
    expect(r.mine, "exactly one seat is the reader's").toEqual(["Season Over Already"]);

    await context.close();
  });

  /* The whole reason the rules are threaded through. If grading with the
     league's table and grading without it produced the same answer, the
     scoring context would be doing nothing and nobody would know. */
  test("the league's scoring actually moves the grade", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await ready(page);

    const r = await page.evaluate((fx) => {
      const withRules = JukeEngine.leagueDraftReport(fx);
      const without = JukeEngine.leagueDraftReport({ ...fx, rules: null });
      return {
        scoredWith: withRules.scored,
        scoredWithout: without.scored,
        totalsWith: withRules.seats.map((s) => Math.round(s.total)).join(","),
        totalsWithout: without.seats.map((s) => Math.round(s.total)).join(","),
      };
    }, FIXTURE);

    expect(r.scoredWith).toBe("league");
    expect(r.scoredWithout, "and it says so when it falls back").toBe("default");
    expect(
      r.totalsWith,
      "a full-PPR league graded on half-PPR defaults is a different room"
    ).not.toBe(r.totalsWithout);

    await context.close();
  });

  /* Par is a snake's par, so a draft type Juke does not model is refused
     with something a screen can print rather than a number nobody should
     trust. */
  test("a draft type it does not model is refused, not graded", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await ready(page);

    const r = await page.evaluate((fx) => {
      const out = JukeEngine.leagueDraftReport({ ...fx, draft: { ...fx.draft, type: "AUCTION" } });
      return { unsupported: out.unsupported, hasSeats: !!out.seats };
    }, FIXTURE);

    expect(r.unsupported).toBe("AUCTION");
    expect(r.hasSeats, "and no grades to mistake for a verdict").toBeFalsy();

    await context.close();
  });

  test("reading it leaves a live draft alone", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/rooms/draft");
    await ready(page);

    const r = await page.evaluate((fx) => {
      const before = { teams: league.teams, rounds: league.rounds, picks: state.picks.length };
      JukeEngine.leagueDraftReport(fx);
      return {
        before,
        after: { teams: league.teams, rounds: league.rounds, picks: state.picks.length },
      };
    }, FIXTURE);

    expect(r.after).toEqual(r.before);

    await context.close();
  });
});
