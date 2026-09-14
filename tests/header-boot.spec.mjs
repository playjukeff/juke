/* The header has to survive a draft that exists before the engine does.

   `draft-engine.js` is deferred — loaded from a `requestIdleCallback`, not a
   blocking `<script>` — so there is a window on every cold load where `app.js`
   is running and `DraftEngine` is undefined. Every wrapper at the top of
   `app.js` is written for that window: `pickInfo()` returns null, `draftOver()`
   returns false, `onTheClock()` returns null.

   `headerInfo()` was not. Its "somebody else is up" branch dereferences
   `.slot` off `pickInfo()`, and nothing above catches the missing engine first:
   `draftOver()` says false and `isMyTurn()` says false, so both guarded
   branches decline and execution falls through to the one line that is not
   guarded.

   That needs `state.started` to be true inside the window, which `adoptRoom()`
   does: it runs from `onRoomChange()`, off the room's own "state" broadcast,
   and `live.js` connects at boot ahead of the idle callback that loads the
   engine. CLAUDE.md already records that exact path taking `applyJitter()` down
   the same way. `renderHeader()` is called from `render()`, so the TypeError
   took the whole render with it — no board, no clock, nothing — until a later
   broadcast happened to arrive after the engine had landed.

   Blocking the request outright is that window held open. It is the honest
   simulation rather than a heavier one: what the app sees is `DraftEngine`
   undefined at the moment it renders, and it cannot tell "not yet" from
   "never". Holding it open forever also covers the worse case of the two — a
   deferred script that fails on a bad connection and never arrives at all. */

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

test("a started draft renders a header before the engine has landed", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route("**/draft-engine.js*", (route) => route.abort());
  const page = await openApp(context, "#/draft");

  const out = await page.evaluate(() => {
    const res = { engine: typeof DraftEngine };

    // What adoptRoom() does off a room broadcast: from the room's point of
    // view a draft is running, and this client has not loaded the rules yet.
    state.started = true;

    try { res.info = headerInfo(); } catch (e) { res.infoThrew = e.message; }
    try { renderHeader(); res.renderHeader = "ok"; } catch (e) { res.renderHeaderThrew = e.message; }
    try { render(); res.render = "ok"; } catch (e) { res.renderThrew = e.message; }
    return res;
  });

  expect(out.engine, "the fixture really did keep the engine out").toBe("undefined");
  expect(out.infoThrew, `headerInfo() threw: ${out.infoThrew}`).toBeUndefined();

  /* The whole point. renderHeader() is called from render(), so this was never
     one wrong string in a header — it took every panel with it. */
  expect(out.renderHeaderThrew, `renderHeader() threw: ${out.renderHeaderThrew}`).toBeUndefined();
  expect(out.renderThrew, `render() threw: ${out.renderThrew}`).toBeUndefined();
  expect(out.render, "render() completed").toBe("ok");

  // Resting, because there is nothing truthful to say yet — not a header
  // describing a draft it cannot read.
  expect(out.info.started, "it reports the resting header for that one render").toBe(false);

  await context.close();
});

test("and the header describes the draft as soon as the engine is there", async ({ browser }) => {
  /* The half that stops the guard being a silent downgrade. A guard that
     returned the resting shape whether or not the engine had landed would pass
     the test above and leave every real draft with a blank header, which is a
     worse bug than the crash it replaced and would look like a styling
     problem. So: same call, same started draft, engine present. */
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await page.evaluate(() => {
    // Somebody else on the clock is the branch that used to throw, so it is
    // the one worth reaching: step off my own seat's turn first.
    let guard = 0;
    while (isMyTurn() && guard++ < 40) makePick(cpuChoice(onTheClock().slot, onTheClock().round));
    const info = headerInfo();
    return { engine: typeof DraftEngine, started: info.started, myTurn: info.myTurn,
             statusLine: info.statusLine, pickText: info.pickText };
  });

  expect(out.engine, "the engine is loaded in this one").toBe("object");
  expect(out.started, "a running draft reports as started").toBe(true);
  expect(out.myTurn, "and we stepped off my own turn, into the branch that threw").toBe(false);

  /* teamLabel(pickInfo(overall).slot) is the expression that used to throw, so
     its output is what proves the guard did not swallow the real answer. */
  expect(out.statusLine, "the status line names whoever is on the clock").toBeTruthy();
  expect(out.pickText, "and the pick line is a real pick").toMatch(/Pick \d+\.\d+ \(\d+ Overall\)/);

  await context.close();
});
