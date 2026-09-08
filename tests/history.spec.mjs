/* The History screen (#/history) — Juke Journey v3's decision ledger.
 *
 * ---- Why this one IS drivable when most account surfaces are not ----
 *
 * league-connect.spec.mjs's own header records the gap: every
 * ConnectLeagueCta sits inside Clerk's <SignedIn>, a test build has no
 * publishable key, so those surfaces render their signed-out fallbacks and
 * cannot be reached. This screen is different by construction. Only the
 * "Create an account" button is Clerk's; the screen itself reads
 * useDecisions(), which reads `window.Live` and `window.JukeAuth` at call
 * time — both of which a fixture can supply. So all four states are real
 * here, including the two that matter most and have no other home.
 *
 * ---- What is asserted, and why each one ----
 *
 * The two that are about honesty rather than layout:
 *
 *   * an unreachable worker must NOT read as an empty record. This screen's
 *     whole claim is that it is a record you can check, so "no decisions
 *     yet" over a failed read is the worst sentence it could print — and it
 *     is the exact shape of the bug leagueStore paid for, one screen along.
 *   * a signed-out visitor gets an explanation and NO rows. A sample ledger
 *     would be indistinguishable from a real one once somebody signs in.
 *
 * Then the two that are about the controls doing something: the room pills
 * are derived from the data (a fixed list would offer five that filter to
 * nothing), and every filter actually narrows.
 *
 * ---- The stub ----
 *
 * `window.Live` is live.js's own object and `window.JukeAuth` is what
 * AuthBridge writes. Replacing the one method this screen calls is the whole
 * fixture — no network, no account, the real components underneath.
 */

import { test, expect } from "@playwright/test";
import { openApp, SITE } from "./helpers.mjs";

const ROW = (over) =>
  Object.assign(
    {
      id: "d1",
      provider: "sleeper",
      leagueId: "L1",
      season: "2026",
      week: 5,
      room: "waiver",
      decidedAt: 5000,
      said: "Add Jaylen Warren",
      did: "Added",
      reality: "+18.4 pts",
      confidence: 84,
      verdict: "good",
    },
    over || {}
  );

const ROWS = [
  ROW(),
  ROW({ id: "d2", room: "strategy", week: 4, said: "Start Chuba Hubbard", did: "Kept Warren", reality: "Hubbard 19.1", confidence: 68, verdict: "bad" }),
  ROW({ id: "d3", room: "trade", week: 6, said: "Counter with Odunze", did: null, reality: null, confidence: 55, verdict: null }),
];

/* Installed on the CONTEXT rather than a page, because openApp() makes its
   own page — it is the one thing in helpers.mjs that waits out the cold-load
   overlay, and a fixture that skipped it would be measuring a screen behind
   #boot-sonar. A context init script applies to every page opened after it,
   which is what makes the two compose.

   Re-installed on `juke:data-loaded` because live.js lands after this runs
   and would otherwise replace the whole object. */
function stubLedger(context, { signedIn = true, answer }) {
  return context.addInitScript(
    ({ signedIn, answer }) => {
      window.JukeAuth = signedIn
        ? { isSignedIn: true, userId: "u1", getToken: () => Promise.resolve("t") }
        : { isSignedIn: false };
      const install = () => {
        const L = window.Live || (window.Live = {});
        L.loadDecisions = () => Promise.resolve(answer);
        // The rail and header read this on every screen; an unstubbed one
        // would send a real request from a test build.
        L.listLeagues = () => Promise.resolve({ ok: true, leagues: [] });
      };
      install();
      window.addEventListener("juke:data-loaded", install);
      document.addEventListener("DOMContentLoaded", install);
    },
    { signedIn, answer }
  );
}

const screen = (page) => page.locator("#view-home");

async function openHistory(context, opts) {
  await stubLedger(context, opts);
  const page = await openApp(context, "#/history");
  await page.waitForFunction(
    () => /Juke said/.test(document.getElementById("view-home").innerText),
    null,
    { timeout: 20000 }
  );
  return page;
}

test.describe("the decision ledger", () => {
  test("a worker it cannot reach is not an empty record", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: false, reason: "offline" } });
    const body = await screen(page).innerText();

    /* The assertion this file most exists for. "No decisions recorded yet"
       here would be the screen telling somebody their season is unrecorded
       because a fetch failed — and they would have no way to know. */
    expect(body, "it says it could not read them").toContain("could not reach your history");
    expect(body, "and never claims the record is empty").not.toContain("No decisions recorded yet");
    expect(body, "nothing was lost, and it says so").toContain("Nothing has been lost");

    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
    await page.close();
  });

  test("a signed-out visitor gets an explanation and no rows", async ({ context }) => {
    const page = await openHistory(context, {
      signedIn: false,
      answer: { ok: true, decisions: [] },
    });
    const body = await screen(page).innerText();

    expect(body).toContain("Your record starts when you connect a league");
    /* A sample ledger is the one thing this screen may not draw: once
       somebody signs in, a demonstration and their own history sit in the
       same layout with nothing to tell them apart. */
    expect(body, "no verdict badge is drawn for a guest").not.toMatch(/Good call|Bad call|Pending/);
    expect(body, "and it says why there is nothing here").toContain("a sample would defeat the point");

    await page.close();
  });

  test("an account with nothing recorded says so, distinctly", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: true, decisions: [] } });
    const body = await screen(page).innerText();

    expect(body).toContain("No decisions recorded yet");
    expect(body, "which is not the same sentence as a failed read").not.toContain(
      "could not reach your history"
    );
    await page.close();
  });

  test("rows draw with their verdicts, and the counts are over the whole ledger", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: true, decisions: ROWS } });
    const body = await screen(page).innerText();

    expect(body).toContain("3 RECORDED");
    expect(body).toContain("Add Jaylen Warren");
    expect(body).toContain("Good call");
    expect(body).toContain("Bad call");
    /* The third row has no verdict at all. It must read as Pending rather
       than as a blank badge — a decision is written when it is made and
       graded only after the week is over, so "not yet" is the norm. */
    expect(body, "an ungraded decision is Pending, not blank").toContain("Pending");

    await page.close();
  });

  test("the room pills are the rooms in the ledger, not a fixed list", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: true, decisions: ROWS } });

    /* Three rooms are represented, so three pills plus All. Waiver, Trade
       and Strategy — and crucially NOT Prospect or Draft, which write
       nothing: a pill that filters to nothing is the dead-control failure,
       and the handoff's own hardcoded six would offer five of them. */
    for (const name of ["All rooms", "Waiver", "Trade", "Strategy"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Prospect", exact: true })).toHaveCount(0);

    await page.close();
  });

  test("every filter group actually narrows the list", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: true, decisions: ROWS } });
    const rowsNow = () => screen(page).innerText();

    await page.getByRole("button", { name: "Waiver", exact: true }).click();
    let body = await rowsNow();
    expect(body, "room filter keeps its own room").toContain("Add Jaylen Warren");
    expect(body, "and drops the others").not.toContain("Start Chuba Hubbard");

    await page.getByRole("button", { name: "All rooms", exact: true }).click();
    await page.getByRole("button", { name: "Bad call", exact: true }).click();
    body = await rowsNow();
    expect(body, "outcome filter keeps the bad call").toContain("Start Chuba Hubbard");
    expect(body, "and drops the good one").not.toContain("Add Jaylen Warren");

    await page.getByRole("button", { name: "All", exact: true }).first().click();
    await page.getByRole("button", { name: "High ≥75", exact: true }).click();
    body = await rowsNow();
    expect(body, "confidence filter keeps 84%").toContain("Add Jaylen Warren");
    expect(body, "and drops 68%").not.toContain("Start Chuba Hubbard");

    await page.close();
  });

  test("the rail's History item points at the ledger, not the drafts archive", async ({ context }) => {
    const page = await openHistory(context, { answer: { ok: true, decisions: [] } });

    /* It pointed at #/drafts for as long as there was no ledger to point
       at. Both screens still exist and answer different questions, so this
       asserts the rail names the right one rather than that the other is
       gone. */
    await expect(page.locator('a[href="#/history"]').first()).toHaveCount(1);
    await page.close();
  });
});
