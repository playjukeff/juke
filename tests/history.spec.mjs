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
import { openApp, SITE, LOCAL_SITE } from "./helpers.mjs";

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
  const { show } = opts || {};
  await stubLedger(context, opts);
  /* `?show=calls` reaches the LEDGER, which is where the filters live.
     #/record opens in `peek` mode - a preview of the first few calls under
     a "See all N calls, with filters" button - so a test that asks for a
     Room pill on the bare address is asking a screen that deliberately
     does not draw one yet. SHOWS in V3Record makes this a real address
     rather than a back door: it is what that button navigates to. */
  const page = await openApp(context, show ? `#/record?show=${show}` : "#/record");
  /* The Calls sheet itself, which every state renders.
     This waited for "Juke said", and that string is a per-ROW label: it
     lives in STEPS (a `hidden lg:grid` header row, so not in innerText at
     this width anyway) and in CallRow's own first cell. Neither exists
     unless the ledger has rows to draw - so the wait held for the happy
     path and timed out for all four of the states this file is actually
     about: unreachable, signed out, empty, and filtered-to-nothing.
     Waiting on a row is waiting for the one outcome the file does not
     need to test. The sheet is what says the screen arrived. */
  await page.waitForSelector('[aria-label="Calls"]', { timeout: 20000 });
  return page;
}

/* A stub can only stand in for Clerk where Clerk is ABSENT.
 *
 * signIn() below writes window.JukeAuth, which useDecisions() reads directly
 * -- deliberately, because useAuth() throws without a provider and a keyless
 * build has none. So in a keyless build the stub is the whole truth and every
 * signed-in surface renders.
 *
 * Against production it is not: that build carries a real pk_live_ key, so
 * <SignedIn> is governed by Clerk, Clerk says signed out, and the ledger
 * renders its signed-out half. The assertions then read the page and get
 * "Log in / Sign up", which looks like the ledger having broken.
 *
 * Five of these stood red on the nightly for that reason. Same treatment and
 * same reasoning as league-connect.spec.mjs, and the same instruction with
 * it: VERIFY A SKIP IN BOTH DIRECTIONS or it is a deletion. Locally all seven
 * run; against production two run and five skip.
 *
 * The two that survive are the ones that need no account -- the signed-out
 * visitor, and the rail pointing at the ledger -- and they are what keeps
 * this file meaningful against the deployed site rather than merely quiet.
 */
const CLERK_GATED = "signed-in rendering is Clerk's, and a keyed build ignores the stub";

test.describe("the decision ledger", () => {
  test("a worker it cannot reach is not an empty record", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await openHistory(context, { answer: { ok: false, reason: "offline" } });
    const body = await screen(page).innerText();

    /* The assertion this file most exists for. "No decisions recorded yet"
       here would be the screen telling somebody their season is unrecorded
       because a fetch failed — and they would have no way to know. */
    /* v3 renamed the noun: a recorded decision is a CALL, so "your history"
       is "your calls" and "No decisions recorded yet" is "No calls recorded
       yet". The requirement is untouched and is the one this file most
       exists for - an unreachable worker must never render as an empty
       record, because the reader has no way to tell those apart. */
    expect(body, "it says it could not read them").toContain("could not reach your calls");
    expect(body, "and never claims the record is empty").not.toContain("No calls recorded yet");
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

    expect(body).toContain("Your calls start when you connect a league");
    /* A sample ledger is the one thing this screen may not draw: once
       somebody signs in, a demonstration and their own history sit in the
       same layout with nothing to tell them apart. */
    /* Scoped to the calls LIST, not the whole screen.
       This matched the page text, and v3's summary strip carries KPI cards
       labelled "Good calls", "Bad calls" and "Pending" with an em-dash for
       a value - so it reported a verdict badge on a screen drawing none.
       The requirement is that a guest is shown no ROWS, which is what the
       count below actually asks. */
    /* `ul li`, because the sheet also carries an <ol aria-label="How a
       call reads"> - the four-step legend - whose items are list items
       too. Counting every li reported nine rows on a screen drawing none,
       which is the same shape as the KPI-label match this replaced: a
       selector wide enough to catch the furniture around the thing. */
    /* [data-call-rows], which is the list of CALLS and nothing else.
       Two wider selectors were wrong before it. The original matched
       /Good call|Bad call|Pending/ against the page text and hit the KPI
       cards ("GOOD CALLS —"); counting every li then hit Vocabulary's
       glossary, which DEFINES those three words, and the four-step "How a
       call reads" legend. Both reported a sample ledger on a screen
       drawing none.

       The rows list carries a name now rather than being identified by
       having no class - an attribute says what an element IS, which is the
       rule this suite already follows for the Start button and the hero
       eyebrow. */
    const rows = await page.locator("[data-call-rows] li").count();
    expect(rows, "no sample ledger is drawn for a guest").toBe(0);
    expect(body, "and it says why there is nothing here").toContain("a sample would defeat the point");

    await page.close();
  });

  test("an account with nothing recorded says so, distinctly", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await openHistory(context, { answer: { ok: true, decisions: [] } });
    const body = await screen(page).innerText();

    expect(body).toContain("No calls recorded yet");
    expect(body, "which is not the same sentence as a failed read").not.toContain(
      "could not reach your calls"
    );
    await page.close();
  });

  test("rows draw with their verdicts, and the counts are over the whole ledger", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
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
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await openHistory(context, { answer: { ok: true, decisions: ROWS }, show: "calls" });

    /* Three rooms are represented, so three pills plus All. Waiver, Trade
       and Strategy — and crucially NOT Prospect or Draft, which write
       nothing: a pill that filters to nothing is the dead-control failure,
       and the handoff's own hardcoded six would offer five of them. */
    /* Scoped to the Room group rather than the page. v3 draws each filter as
       a Seg - a role=group with an aria-label and real buttons inside - and
       all three groups carry their own "All", so an unscoped name match is
       three elements and a strict-mode violation. The reset option is "All"
       here rather than "All rooms"; the group's label is what says which
       All it is. Same lesson as the draft cockpit's tablist. */
    const roomFilter = page.getByRole("group", { name: "Room" });
    for (const name of ["All", "Waiver", "Trade", "Strategy"]) {
      await expect(roomFilter.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(roomFilter.getByRole("button", { name: "Prospect", exact: true })).toHaveCount(0);

    await page.close();
  });

  test("every filter group actually narrows the list", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await openHistory(context, { answer: { ok: true, decisions: ROWS }, show: "calls" });
    const rowsNow = () => screen(page).innerText();

    /* Each group addressed by its own aria-label, for the reason above: all
       three carry an "All", so `.first()` was picking whichever happened to
       render first rather than the one the step means. Naming the group
       says which filter is being reset and cannot drift if they reorder. */
    const group = (name) => page.getByRole("group", { name });

    await group("Room").getByRole("button", { name: "Waiver", exact: true }).click();
    let body = await rowsNow();
    expect(body, "room filter keeps its own room").toContain("Add Jaylen Warren");
    expect(body, "and drops the others").not.toContain("Start Chuba Hubbard");

    await group("Room").getByRole("button", { name: "All", exact: true }).click();
    await group("Outcome").getByRole("button", { name: "Bad call", exact: true }).click();
    body = await rowsNow();
    expect(body, "outcome filter keeps the bad call").toContain("Start Chuba Hubbard");
    expect(body, "and drops the good one").not.toContain("Add Jaylen Warren");

    await group("Outcome").getByRole("button", { name: "All", exact: true }).click();
    await group("Confidence").getByRole("button", { name: "High ≥75", exact: true }).click();
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
    await expect(page.locator('a[href="#/record"]').first()).toHaveCount(1);
    await page.close();
  });
});

