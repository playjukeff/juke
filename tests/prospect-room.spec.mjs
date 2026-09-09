/* The Prospect Room, driven in a real browser.
 *
 * ---- Why this file can exist when the other three rooms' cannot ----
 *
 * Waiver, Trade and Strategy each read a roster, so every one of them sits
 * behind Clerk's <SignedIn> and a keyless test build renders the
 * signed-out fallback instead. CLAUDE.md records that as the widest gap in
 * this project's coverage, and it is the gap `verifyToken` lived in.
 *
 * Prospect reads the BOARD — players.js and stats.js, which every visitor
 * already has — so it renders signed out, with real data, in CI. It is the
 * first room with real content that a Playwright run can actually drive,
 * and that is worth as much as the room.
 *
 * ---- What is asserted, and what deliberately is not ----
 *
 * Not the copy. The banner and the footnote are sentences, and every label
 * in this app has moved at least once. What is asserted is the room's two
 * promises, which are properties: it ranks first-year players by a real
 * measure, and it names what it does not know about each of them — that
 * second one being the whole reason the room is defensible at all.
 *
 * Not a rookie's name or a count either. `players.js` is regenerated
 * nightly, so "77 rookies" is a figure that is wrong within a day — the
 * same rule this project applies to every measured number it writes down.
 * The assertions are about shape and about relationships.
 */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

const ROW = "[data-prospect-row]";

async function openProspect(context) {
  const page = await openApp(context, "#/rooms/prospect");
  // The board is deferred behind the cold-load reveal, so the room draws a
  // loading block first. Wait for the condition, never for a duration.
  await page.locator(ROW).first().waitFor({ timeout: 20000 });
  return page;
}

test.describe("the prospect room", () => {
  test("renders real rookies with no account and no league", async ({ context }) => {
    const page = await openProspect(context);

    /* The point of the room. If this ever needs a sign-in the room has
       acquired a dependency it does not use, and the coverage this file
       buys goes with it. */
    const signedIn = await page.evaluate(
      () => !!(window.JukeAuth && window.JukeAuth.isSignedIn)
    );
    expect(signedIn, "the room must not require an account").toBe(false);

    const rows = await page.locator(ROW).count();
    expect(rows).toBeGreaterThan(0);

    /* Every row on screen is somebody in their first NFL season, checked
       against the engine rather than against the markup — a list that
       merely LOOKS like rookies is the failure, and it renders fine. */
    const allRookies = await page.evaluate(() => {
      const names = [...document.querySelectorAll("[data-prospect-row]")].map((el) =>
        el.querySelector("span.truncate").textContent.trim()
      );
      const e = window.JukeEngine;
      return names.every((n) => {
        const p = e.board().find((x) => x.name === n);
        const s = p && e.statOf(p);
        return !!s && s.exp === 0;
      });
    });
    expect(allRookies, "every row is a first-year player").toBe(true);
  });

  test("names what it does not know about a prospect", async ({ context }) => {
    const page = await openProspect(context);
    await page.locator(`${ROW} button`).first().click();

    const text = await page.locator(ROW).first().innerText();

    /* A profile that quietly showed five fields would read as complete, and
       the ranking above it would carry weight it has not earned. So what is
       asserted is that nothing is silently DROPPED — not that any particular
       fact is still missing.

       ---- This list used to be three literals and went red on its own ----

       It read "the three that are missing for EVERY player in this
       repository", and the nightly falsified it: 2026-09-09's board gave
       Jeremiyah Love "NFL draft — Round 1, pick 3 · 3 overall", so the panel
       correctly stopped naming it as a gap and this expectation failed
       against an app that had got BETTER. That is the same stale-claim
       failure ProspectRoomLive's own Banner was rewritten to avoid — its
       comment says the hardcoded version "was true the day it was written
       and false the moment the CFBD pipeline ran" — and the spec had not
       learned it.

       Two of the three were never at risk, and the difference is worth
       knowing before adding a fourth. `prospectBoard.js` pushes the SAME
       label for College production whether it is known or missing, so that
       string is on screen either way. The NFL draft fact is the one that
       changes name between its two states — 'NFL draft' with a value,
       'NFL draft position' as a gap — so a `toContain` on one spelling is a
       bet on the data. */
    for (const gap of ["College production", "Combine testing"]) {
      expect(text, `${gap} must be named`).toContain(gap);
    }

    /* Known or named, never absent. Whether this particular prospect was
       drafted is a fact about tonight's board and not about the screen; what
       the screen owes the reader is that the question is answered one way or
       the other.

       One substring covers both states because both labels start with it —
       'NFL draft' carrying a round and pick, 'NFL draft position' sitting in
       the NOT KNOWN list. Written as an either/or it would read as two cases
       and be one, since the shorter string matches the longer label too. */
    expect(text, "the NFL draft fact is either given or named as a gap, never dropped")
      .toContain("NFL draft");
    // And what it does have, so the panel is not merely a list of holes.
    expect(text).toContain("ON FILE");
  });

  test("a player the app refuses to rank sorts last and says why", async ({ context }) => {
    const page = await openProspect(context);

    /* Kickers and defenses are UNRANKED_POSITIONS: three seasons of
       backtesting found the projected order no better than chance. The
       room must not hand one the top of a list about who to take, and
       having buried him it must say why — withholding has to be complete,
       or the screen has told a reader to distrust a number and then
       shown them nothing to replace it. */
    const positions = page.locator("button[aria-pressed]");
    const labels = await positions.allInnerTexts();
    const unranked = labels.find((l) => l.trim() === "K" || l.trim() === "DST");
    test.skip(!unranked, "this class has no kicker or defense in it");

    // Whole board, so ordering is over every rookie rather than a page.
    await page.getByRole("button", { name: "Big Board", exact: true }).click();

    const order = await page.evaluate(() => {
      const e = window.JukeEngine;
      return [...document.querySelectorAll("[data-prospect-row]")].map((el) => {
        const name = el.querySelector("span.truncate").textContent.trim();
        const p = e.board().find((x) => x.name === name);
        return { name, ranked: p ? e.replacementGap(p) !== null : true };
      });
    });
    const lastRanked = order.map((r) => r.ranked).lastIndexOf(true);
    const firstUnranked = order.map((r) => r.ranked).indexOf(false);
    test.skip(firstUnranked === -1, "nobody on this board is unranked");
    expect(
      firstUnranked,
      "a player Juke rates badly still outranks one it will not rate at all"
    ).toBeGreaterThan(lastRanked);

    // Now open him, and check the refusal is explained rather than implied.
    const row = page.locator(ROW).nth(firstUnranked);
    await row.locator("button").first().click();
    expect(await row.innerText()).toMatch(/no better than chance/);
  });

  test("the position filter reaches players the ranking buries", async ({ context }) => {
    const page = await openProspect(context);

    /* Value over replacement is the app's one currency and this room keeps
       it, which buries quarterbacks by construction: QB replacement is the
       highest on the board, so the best rookie QB can sit below every
       tight end. The filter is what makes them reachable without a second
       ranking being invented, so it is the filter's job that is asserted —
       not that a chip exists. */
    const qb = page.getByRole("button", { name: "QB", exact: true });
    test.skip((await qb.count()) === 0, "this class has no quarterback in it");
    await qb.first().click();

    const allQb = await page.evaluate(() => {
      const e = window.JukeEngine;
      const names = [...document.querySelectorAll("[data-prospect-row]")].map((el) =>
        el.querySelector("span.truncate").textContent.trim()
      );
      return (
        names.length > 0 &&
        names.every((n) => {
          const p = e.board().find((x) => x.name === n);
          return p && p.pos === "QB";
        })
      );
    });
    expect(allQb, "the filter shows quarterbacks and only quarterbacks").toBe(true);
  });
});
