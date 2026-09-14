/* What the Draft Settings screen sets, and whether the draft that starts is
   actually the draft it describes.

   Reported off a phone: change the draft position in Draft Settings, press
   Start, and land in seat 1 anyway — "it seems to respect the other settings
   but this needs an end-to-end check". Both halves are here: the seat, which
   was genuinely broken, and every other setting on that screen, which was not
   and now has something saying so.

   The seat was the one thing about a draft written down twice. DraftOrder.jsx
   sets it through engine.setMySlot(), which writes state.mySlot; DraftRoom.jsx
   held its own `lobbySlot` React state, initialised to 0 and never told; and
   beginDraft() called startDraft({ mySlot: lobbySlot }), whose first act is
   `state.mySlot = opts.mySlot`. So the settings screen's choice was written,
   displayed correctly in that screen's own list — draftOrder() reads
   state.mySlot to decide which row says "You" — and then overwritten on the
   way in. Two right answers, one of them not being asked.

   Not phone-specific despite the report: it is specific to choosing the seat
   on THAT screen, which is simply the only route to it on a phone. The
   desktop lobby's own dropdown writes lobbySlot directly and never saw it.
*/

import { test, expect, devices } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const PHONE = { ...devices["iPhone 13"], defaultBrowserType: undefined };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

async function ready(page) {
  await page.waitForFunction(
    () => window.JukeEngine && window.JukeEngine.dataReady(), null, { timeout: 25000 });
}

/* [data-start-draft], and `:visible` matters: both homepages mount below and
   above sm, so the label matches twice and only one of them has a box. That
   is the breakpoint-split hazard this project already records for
   data-hero-cta, and the attribute is here for the same reason — the button
   has been called "Enter Draft Room", "Start draft", "Start mock draft" and
   "Start a mock draft". */
async function pressStart(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("[data-start-draft]")]
      .find((b) => b.getBoundingClientRect().height > 0);
    if (!btn) throw new Error("no visible [data-start-draft] on this screen");
    btn.click();
  });
  /* The lobby -> draft room loader holds a floor before the room renders, so
     wait for the draft rather than for a duration — the same reason
     phone.spec.mjs waits for the room's own nav to exist. A duration here is
     what made the first version of restart.spec.mjs pass against its bug. */
  await page.waitForFunction(
    () => typeof state === "object" && state.started, null, { timeout: 25000 });
}

for (const [label, opts] of [["a phone", PHONE], ["a desktop", DESKTOP]]) {
  test(`the seat chosen in Draft Settings is the seat drafted from, on ${label}`, async ({ browser }) => {
    const context = await browser.newContext(opts);
    const page = await openApp(context, "#/draft");
    await ready(page);

    /* engine.setMySlot() is the exact call DraftOrder.jsx's own row onClick
       makes. The tapped path is covered by the next test; this one is about
       what happens between that call and the board, which is where the bug
       lived. */
    await page.evaluate(() => window.JukeEngine.setMySlot(5));
    await pressStart(page);

    const got = await page.evaluate(() => ({
      mySlot: state.mySlot,
      /* Not merely in state: a right value in the wrong column is this
         project's own recurring bug, so the board is asked too. */
      firstPick: DraftEngine.overallOf(1, state.mySlot, window.JukeEngine.league()),
      picksAreMine: state.picks.filter((p) => p.slot === 5).length,
    }));
    expect(got.mySlot, "the draft starts from the seat that was chosen").toBe(5);
    // Seat index 5 is the sixth chair, so pick 6 overall in round one.
    expect(got.firstPick, "and the board agrees about when that seat picks").toBe(6);
    await context.close();
  });
}

test("the seat survives being tapped in the real screen and saved", async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await openApp(context, "#/draft");
  await ready(page);

  await page.getByRole("button", { name: /draft settings/i }).first().click();

  /* The screen became a drawer off the launcher at the cutover, and it is
     asked for by role and name rather than by a heading string: the old
     "Draft Settings" heading is the drawer's BAND label now, and the
     heading proper is the drawer's own subject ("The next mock's shape").
     A dialog is what this is, so that is what is asserted. */
  const drawer = page.getByRole("dialog", { name: /the next mock/i });
  await expect(drawer).toBeVisible();

  /* The chairs are one <button> per <li> in the Draft order list, found by
     position rather than by name: a CPU chair's name comes off cpuName() and
     moves with the data, and the position is the thing under test. Scoped to
     the drawer, because the launcher behind it draws lists of its own. */
  const chairs = drawer.locator("ol li button");
  await chairs.nth(7).scrollIntoViewIfNeeded();
  await chairs.nth(7).click();
  expect(await page.evaluate(() => state.mySlot),
    "tapping the eighth chair takes the eighth chair").toBe(7);

  /* There is no Save, and its absence is the product rather than a gap.
     The drawer says "Applies as you change it" on its own band, which is
     the same decision the modal it replaced had already made — CLAUDE.md's
     "Save is a dismiss, not a commit" — followed one step further by not
     offering the button at all.

     So what is asserted is what Save was really guarding: the seat survives
     the screen being DISMISSED. A control that cannot discard your choice
     is better than one that promises not to, and this is the assertion that
     would catch it starting to. */
  await drawer.getByRole("button", { name: "Close draft settings" }).click();
  await expect(drawer).toBeHidden();
  expect(await page.evaluate(() => state.mySlot),
    "and dismissing the drawer does not discard it").toBe(7);

  await pressStart(page);
  expect(await page.evaluate(() => state.mySlot), "and the draft starts there").toBe(7);
  await context.close();
});

/* Everything else on that screen, in one pass, because "it seems to respect
   the other settings" is a belief rather than a measurement — and the seat
   proved that a control here can look live, correctly update its own section,
   and still be thrown away by the thing it is configuring.

   Each value is written through the same engine.setLeague() the modal's own
   patch() calls, and then read back AFTER the draft has started. Reading it
   back off `league` before starting would only prove Object.assign works,
   which is not what failed. */
test("every Draft Settings control survives into the draft that starts", async ({ browser }) => {
  const context = await browser.newContext(DESKTOP);
  const page = await openApp(context, "#/draft");
  await ready(page);

  const report = await page.evaluate(() => {
    const E = window.JukeEngine;
    E.setLeague({
      name: "End To End",
      teams: 12,
      scoring: "ppr",
      draftType: "linear",
      playerPool: "all",
      cpuAutopick: false,
      bench: 6,
      flex: 2,
      starters: { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 },
    });
    E.setClockLength(45);
    E.setMySlot(9);
    E.startDraft({ mySlot: E.mySlot(), clockLength: E.clockLength() });
    const L = E.league();
    return {
      got: {
        name: L.name, teams: L.teams, scoring: L.scoring, draftType: L.draftType,
        playerPool: L.playerPool, cpuAutopick: L.cpuAutopick,
        bench: L.bench, flex: L.flex, rounds: L.rounds,
        clock: state.clockLength, mySlot: state.mySlot, rec: L.rules.rec,
      },
      started: state.started,
      /* Derived rather than restated: a linear draft must not reverse round
         two, and reversedRound() is the one place that decides it — the
         `round % 2 === 0` this replaced is right for a snake and confidently
         wrong for the other two types. */
      roundTwoReversed: DraftEngine.reversedRound(2, L),
      boardSize: E.board().length,
    };
  });

  expect(report.started, "the draft actually started").toBe(true);
  expect(report.got, "every setting reached the draft").toEqual({
    name: "End To End", teams: 12, scoring: "ppr", draftType: "linear",
    playerPool: "all", cpuAutopick: false, bench: 6, flex: 2,
    // 1 QB + 2 RB + 3 WR + 1 TE + 1 K + 1 DST + 2 FLEX + 6 bench = 17.
    rounds: 17,
    clock: 45, mySlot: 9,
    // Full PPR is a point a catch, and the scoring preset owns that rule.
    rec: 1,
  });
  expect(report.roundTwoReversed, "a linear draft never reverses a round").toBe(false);
  expect(report.boardSize, "and the PPR board was built").toBeGreaterThan(200);
  await context.close();
});

/* The bug the seat fix exposes rather than causes.

   A seat only exists inside a league, so shrinking the league has to move
   anybody sitting past the new edge. Nothing did. setMySlot() refuses an
   out-of-range seat on the way IN, which made this look covered — but it is
   `teams` that moves underneath a seat already chosen, and no writer of it
   had anything to say about the seat. state.mySlot stayed at 11 in an
   8-team league, where onTheClock() only ever returns 0..7, so isMyTurn()
   was never true and the draft ran to the end without ever offering a pick.
   It does not throw and nothing on screen says so: it looks like a draft
   that simply skips you. */
test("shrinking the league moves a seat that no longer exists", async ({ browser }) => {
  const context = await browser.newContext(DESKTOP);
  const page = await openApp(context, "#/draft");
  await ready(page);

  const got = await page.evaluate(() => {
    const E = window.JukeEngine;
    E.setLeague({ teams: 12 });
    E.setMySlot(11);
    const before = state.mySlot;
    E.setLeague({ teams: 8 });
    return { before, after: state.mySlot, teams: E.league().teams };
  });
  expect(got.before, "seat 12 of 12 is a legal seat").toBe(11);
  expect(got.after, "and becomes the last seat of 8, not one that can never pick").toBe(7);
  expect(got.after, "which is inside the league").toBeLessThan(got.teams);
  await context.close();
});
