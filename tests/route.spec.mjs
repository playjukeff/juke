import { test, expect } from "@playwright/test";
import { SITE } from "./helpers.mjs";

/* Every address the site has ever answered to, and where it lands now.
 *
 * This file used to hold two assertions about one retired route — #/draft,
 * which was the Draft Room for the life of the project and went on rendering
 * a complete, working, out-of-date one after it was replaced. Reported from
 * the outside as "my friend is still seeing the old draft room", which is the
 * worst way for a dead address to fail: not an error, a different product.
 *
 * The cutover retired nine more of them at once, so the file is the whole map
 * now. It exists because that map lives in two places that cannot import each
 * other: app.js's canonicalHash() implements it in a classic script, and
 * V3App.jsx's route-table comment is what a person reads. Neither can be the
 * other's source. This is what makes them agree.
 *
 * ---- Read as a table, on purpose ----
 *
 * One test per address would be thirty-three test names saying the same
 * sentence, and a failure would name one of them. One test with a table names
 * every row that is wrong in a single message, which is what you want at 3am
 * when a redirect has been dropped: "which ones" is the question, not
 * "whether".
 */

const MAP = [
  // ---- the production routes, each to the v3 place that took its job ----
  ["#/", "#/", "the homepage is Now"],
  ["#/rooms", "#/", "the lobby's question is what Now answers"],
  ["#/rooms/draft", "#/draft", "the Draft Room's own entry"],
  ["#/rooms/waiver", "#/calls/wire", "a room became the call it opens"],
  ["#/rooms/trade", "#/calls/trade", "same"],
  ["#/rooms/strategy", "#/calls/lineup", "same"],
  ["#/rooms/prospect", "#/players/rookies", "rookies are a view of the board"],
  ["#/rooms/league", "#/league", "same"],
  ["#/my-league", "#/league", "same"],
  ["#/you", "#/account", "same"],
  ["#/drafts", "#/record", "the archive"],
  ["#/history", "#/record", "and the ledger, which is one screen now"],
  ["#/draft-room", "#/draft", "the React room this replaced"],

  /* A room nobody shipped is not a reason to 404 somebody. The lobby listed
     six and only some of them ever had a page; an address for one of the
     others still has to mean something, and Now is what it means. */
  ["#/rooms/nothing-ever-shipped-here", "#/", "an unknown room is still a room"],

  /* ---- the invite, which is the one that must not be got wrong ----

     This is the bug the file was originally written for and it has survived
     one more retirement. route() strips the query to decide a path, so a
     redirect written the obvious way drops the room code and lands a guest on
     an empty setup screen instead of in the draft they were invited to.

     BOTH shapes are kept deliberately. #/draft?room= is what every invite
     sent before the React room existed looks like; #/draft-room?room= is what
     that room sent afterwards. Somebody's phone still holds each of them. */
  ["#/draft?room=ABC1", "#/draft/live?room=ABC1", "an invite from before the React room"],
  ["#/draft-room?room=ABC1", "#/draft/live?room=ABC1", "and one the React room sent"],

  /* The archive opened a frozen report by id, and v3 spells the parameter
     differently. Renaming one query key is the whole difference. */
  ["#/rooms/draft?report=xyz789", "#/draft/report?id=xyz789", "a saved report"],

  // ---- canonical, and therefore untouched ----
  ["#/draft", "#/draft", "the launcher is NOT the invite: no room code, no rewrite"],
  ["#/draft/live", "#/draft/live"],
  ["#/draft/report", "#/draft/report"],
  ["#/draft/insights", "#/draft/insights"],
  ["#/players", "#/players"],
  ["#/players/rookies", "#/players/rookies"],
  ["#/league", "#/league"],
  ["#/record", "#/record"],
  ["#/account", "#/account"],
  ["#/calls/wire", "#/calls/wire"],
  ["#/method/how-it-works", "#/method/how-it-works"],

  /* ---- the proposal's own prefix ----
     Every link shared while this was v3 points here, and those are real links
     in real conversations rather than a compatibility gesture. */
  ["#/v3", "#/"],
  ["#/v3/league", "#/league"],
  ["#/v3/draft", "#/draft"],
  ["#/v3/players/rookies", "#/players/rookies"],
  ["#/v3/draft/live?room=ABC1", "#/draft/live?room=ABC1", "a v3 invite keeps its code too"],
  ["#/v3/method/how-it-works?s=s06", "#/method/how-it-works?s=s06", "and its anchor"],

  /* v2 is the comparison record. It is the one prefix that is never
     rewritten, and a rewrite here would be the cutover quietly deleting the
     only thing that says what was proposed beside what shipped. */
  ["#/v2", "#/v2"],
  ["#/v2/league", "#/v2/league"],
];

test.describe("the address map", () => {
  test("every address the site has answered to lands where it means", async ({ context }) => {
    test.setTimeout(300000);
    const page = await context.newPage();
    const wrong = [];
    for (const [from, want, why] of MAP) {
      await page.goto(`${SITE}/index.html${from}`, { waitUntil: "domcontentloaded" });
      /* Unqualified, the way the app's own code reads it — `state` is a
         top-level const in app.js and const does not become a window
         property. This is also what proves the redirect happened at the
         router rather than in React: app.js is what defines these. */
      await page.waitForFunction(() => typeof state === "object", null, { timeout: 20000 });
      // One tick for location.replace()'s own hashchange to settle.
      await page.waitForTimeout(120);
      const got = await page.evaluate(() => location.hash);
      if (got !== want) wrong.push(`${from} -> ${got}   (expected ${want}${why ? " — " + why : ""})`);
    }
    expect(wrong, `\n${wrong.join("\n")}\n`).toEqual([]);
  });

  /* The half of canonicalHash() that is about NOT acting.
   *
   * "#rooms" and "#/rooms" are one character apart and mean different things,
   * and the boot-time applyRoute() call is deliberately unguarded — so
   * without the `#/` test at the top of canonicalHash(), a scroll anchor
   * navigates the whole site. It is cheap to get wrong and silent when it is:
   * the page simply goes somewhere. */
  test("a bare fragment is an anchor, never a route", async ({ context }) => {
    const page = await context.newPage();
    await page.goto(`${SITE}/index.html#rooms`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof state === "object", null, { timeout: 20000 });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => location.hash)).toBe("#rooms");
  });

  /* A redirect must not become a back-button trap.
   *
   * location.replace() rather than assignment, so pressing Back from a
   * rewritten address returns to wherever the reader came from rather than to
   * the address that immediately rewrites itself again. Generic navigation
   * guidance says the opposite — prefer pushState, do not replace — and it is
   * written for a page moving between its own screens, not for an address
   * that no longer exists. Here replace() is what keeps Back working at all.
   */
  test("a rewritten address leaves no back-button trap", async ({ context }) => {
    const page = await context.newPage();
    await page.goto(`${SITE}/index.html#/players`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof state === "object", null, { timeout: 20000 });
    await page.evaluate(() => { location.hash = "#/my-league"; });
    await page.waitForFunction(() => location.hash === "#/league", null, { timeout: 10000 });
    await page.goBack();
    await page.waitForTimeout(200);
    expect(
      await page.evaluate(() => location.hash),
      "back from a rewritten address returns to where you were, not to the rewrite",
    ).toBe("#/players");
  });

  /* And the retired view stays hidden however you arrive.
   *
   * #view-app is the vanilla draft room's markup. It is unreachable rather
   * than deleted — app.js writes into those ids on every render and removing
   * them throws — so the thing to assert is that nothing ever shows it. */
  test("the retired vanilla view stays hidden", async ({ context }) => {
    const page = await context.newPage();
    for (const hash of ["#/", "#/draft", "#/draft/live", "#/record"]) {
      await page.goto(`${SITE}/index.html${hash}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof state === "object", null, { timeout: 20000 });
      expect(
        await page.evaluate(() => document.getElementById("view-app").hidden),
        `#view-app on ${hash}`,
      ).toBe(true);
      expect(
        await page.evaluate(() => document.getElementById("view-home").hidden),
        `and #view-home is never hidden, because everything renders inside it (${hash})`,
      ).toBe(false);
    }
  });
});
