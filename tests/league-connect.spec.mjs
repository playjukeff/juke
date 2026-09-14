/* What the site says about a connected league, before and after there is one.

   Reported: "I clicked Connect from the homepage and it asked for my Sleeper
   username. There's a disconnect between what we're saying we can connect to
   and what our pop-up is asking for... Even after entering my Sleeper
   username and getting a confirmation that it connected successfully, the
   Connect messaging is still there throughout the website."

   Three defects in one report, and this file covers the two a keyless build
   can reach.

   ---- What is NOT covered here, and why ----

   The connect dialog itself is only reachable from a ConnectLeagueCta, and
   every one of those sits inside Clerk's <SignedIn>. A test build has no
   publishable key (web/.env.example keeps a pk_test_ one for `vite dev`, and
   CI has none), so useAccountUiReady() answers false, no provider mounts, and
   those four surfaces render their signed-out fallbacks. Driving the dialog
   would mean signing in to a real Clerk instance.

   So the platform step — four platforms listed, three locked, no username
   asked for until Sleeper is chosen — was verified by hand against the built
   site, and what is asserted here is everything downstream of a connection
   that a guest build CAN observe. The surfaces below are the ones that read
   useLeague() directly rather than through a Clerk gate.

   ---- The stub ----

   `window.Live` is live.js's own object and `window.JukeAuth` is what
   AuthBridge writes; both are read at call time by design (see useLeague's
   own note on why it does not hold Clerk's hooks). Replacing the two methods
   this path uses is therefore the whole fixture — no network, no account, and
   the real components underneath. */

import { test, expect } from "@playwright/test";
import { openApp, SITE, LOCAL_SITE } from "./helpers.mjs";

/* ownerId, because v3's connected homepage has to know WHICH roster is
   yours: NowConnected matches league.ownerId against the snapshot's
   teams[].ownerId, and without it the page renders "Which team is yours?
   ... reconnect the league" - a real state, but not the connected one
   these tests are about. */
const LEAGUE = { leagueId: "lg1", name: "Dynasty Degens", season: "2026", totalTeams: 12, ownerId: "me" };

/* Signed in, with or without a league. Installed before any page script so
   the first render already sees it — a stub applied afterwards would let the
   page settle on "signed out" first and then test the repaint rather than the
   state. */
function stubAccount(page, leagues) {
  return page.addInitScript((rows) => {
    window.JukeAuth = { isSignedIn: true, userId: "u1", getToken: () => Promise.resolve("t") };
    const install = () => {
      const L = window.Live || (window.Live = {});
      L.listLeagues = () => Promise.resolve({ ok: true, leagues: rows.slice() });
      /* The snapshot too, because v3's connected homepage is NowConnected
         and it reads one. With only listLeagues stubbed the page renders
         "We could not read your league" - an error screen with no <h1> -
         and every test here timed out waiting for one. */
      L.leagueSnapshot = (leagueId) => Promise.resolve({
        ok: true,
        snapshot: {
          leagueId,
          name: (rows[0] && rows[0].name) || "Dynasty Degens",
          provider: "sleeper",
          season: "2026",
          week: 3,
          totalTeams: (rows[0] && rows[0].totalTeams) || 12,
          teams: [
            { ownerId: "me", name: "Your Team", wins: 2, losses: 1, ties: 0, pointsFor: 300, pointsAgainst: 280, players: [], starters: [] },
            { ownerId: "them", name: "Gridiron Gang", wins: 1, losses: 2, ties: 0, pointsFor: 280, pointsAgainst: 300, players: [], starters: [] },
          ],
          status: "in_season",
          rules: {},
          draftAt: null,
          draftStatus: "complete",
          schedule: null,
          tradeDeadline: { at: null, week: null, disabled: false },
          waiver: { type: "faab", budget: 100, minimumBid: 0, resetsOrder: false, hours: 24 },
          waiverBudget: 100,
        },
      });
    };
    install();
    // live.js defines its own window.Live when it lands and would replace the
    // object above, so this reinstalls once the real one exists.
    window.addEventListener("juke:data-loaded", install);
    document.addEventListener("DOMContentLoaded", install);
  }, leagues);
}

/* A stub can only stand in for Clerk where Clerk is ABSENT.
 *
 * stubAccount() writes window.JukeAuth, which useSignedIn() reads -- and that
 * hook deliberately does not touch Clerk, because useAuth() throws without a
 * provider and a keyless build has none. So in a keyless build the stub is the
 * whole truth and every signed-in surface renders.
 *
 * Against production it is not: that build carries a real pk_live_ key, so
 * <SignedIn> is governed by Clerk, Clerk says signed out, and every surface
 * that NAMES a league renders nothing. The tests then read the page and get
 * "JUKE" -- the header -- which looks like the league chip having broken.
 *
 * These five stood red on the nightly for eleven consecutive nights for that
 * reason, which is the standing-red trap this project already records: a
 * suite carrying permanent failures stops being read, and the two genuinely
 * stale specs beside them were invisible inside the noise.
 *
 * Same shape as news.spec.mjs's keyless test, and the same instruction with
 * it: VERIFY A SKIP IN BOTH DIRECTIONS or it is a deletion. Locally all nine
 * run and pass; against production three run and six skip.
 *
 * What survives is what does not assert signed-in RENDERING: the platform
 * claim and the guest state, which stub no account at all, plus the PATCH
 * transport, which stubs one and then watches live.js's own fetch -- and
 * that runs whether or not Clerk has drawn anything. So reaching for
 * stubAccount() is NOT the test for which of these stand down.
 *
 * This line read "eight ... five" for a while, having been written before
 * #202 added a ninth test with a skip on it. A tally in a comment goes
 * stale the same silent way every other number in this repository does,
 * and this one would have told the next reader to expect 11 skips in the
 * nightly rather than the 12 it reports.
 */
const CLERK_GATED = "signed-in rendering is Clerk's, and a keyed build ignores the stub";

const text = (page) => page.locator("#view-home").innerText();

test.describe("a connected league", () => {
  test("nothing on the site claims four working platforms", async ({ context }) => {
    const page = await openApp(context, "#/");
    await page.waitForSelector("#view-home h1");

    /* The bug in one assertion. `Sleeper · ESPN · Yahoo · CBS` was written
       under every connect control on the site — four platforms, named as a
       list of equals, with one built. The replacement says which is which,
       and it is one shared constant so it cannot drift back into a claim in
       six places at once.

       Asserted as a property rather than as the caption's exact words,
       because those words move every time a platform ships: this went from
       "Sleeper now · ESPN, Yahoo, CBS soon" to "Sleeper and ESPN now ·
       Yahoo, CBS soon" the day ESPN landed, and a literal here would have
       gone red for the feature working. What must stay true is the split —
       something is named as available and something as not — and that the
       undifferentiated list never comes back. */
    const body = await text(page);
    expect(body).not.toContain("Sleeper · ESPN · Yahoo · CBS");
    expect(body).not.toContain("Sleeper, ESPN, Yahoo or CBS");
    expect(body, "says what is available now").toMatch(/\bnow\b/);
    expect(body, "and what is not yet").toMatch(/\bsoon\b/);
    /* Sleeper is on the live side of that split, and naming it here is what
       stops the caption degrading into "· soon" with nothing before it. */
    expect(body).toMatch(/Sleeper[^·]*\bnow\b/);

    await page.close();
  });

  test("a guest is still asked, and the rooms are still locked", async ({ context }) => {
    const page = await openApp(context, "#/");
    await page.waitForSelector("#view-home h1");
    const body = await text(page);

    // The control, and it matters: every assertion in the next test is about
    // something DISAPPEARING, and a bug that hid these from everybody would
    // pass all of them.
    expect(body).toContain("Connect your league");

    /* Two assertions retired with the screen they were about.

       This used to check "The rest unlock when you connect a league" and a
       "5 ROOMS · 2 OPEN" count, both of them RoomsLobby.jsx's - a grid of
       six rooms with padlocks on the ones a league opens. v3 has no rooms
       lobby and no padlocks: it has five PLACES, and the in-season tools
       are calls a reader opens rather than rooms they visit and find
       locked. Asserting an unlock count here would be asserting a model
       the product no longer has.

       What survives is the half the original report was actually about -
       the guest is asked - and it is the control for the next test, where
       every assertion is about that ask DISAPPEARING. A bug that hid the
       ask from everybody would pass that test and fail this one. */

    await page.close();
  });

  test("with a league connected, the site stops asking for one", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubAccount(page, [LEAGUE]);
    await page.goto(`${SITE}/index.html#/`);
    await page.waitForSelector("#view-home h1");
    /* Settle on the league's own NAME appearing, which is what says the
       connected homepage has resolved. This waited for "Your league is in",
       SubCopy()'s connected-state line in RoomsLobby.jsx - a retired,
       unreachable file - so it could never fire. Case-insensitively,
       because the chip is uppercased in CSS and innerText returns what is
       painted. */
    await page.waitForFunction(named("Dynasty Degens"), null, { timeout: 15000 });

    const body = await text(page);

    /* Every one of these was still on the screen after a successful connect,
       and each is a different component that had no way to hear about it.
       Confirmed red without the shared league state: all four fail. */
    /* THE ASSERTION THIS FILE EXISTS FOR, and the one the report named:
       "even after getting a confirmation that it connected successfully,
       the Connect messaging is still there throughout the website". */
    expect(body, "the ask is gone").not.toContain("Connect your league");
    /* And it names the league instead, which is the other half of the
       same fact. The old version asserted "Your league is in" here and
       explained that the lobby could not name the league because the
       header chip was inside <SignedIn> and absent from a keyless build.
       v3's connected homepage names it in the body - see the probe output
       in this change - so the stronger claim is available and is what is
       made.

       ---- Three assertions retired with RoomsLobby.jsx ----

       "sample week until they are built", "5 ROOMS · 5 OPEN", and "League
       Room is not one of the cards" were all about a grid of rooms with
       padlocks on it. v3 has five places and no padlocks, so an unlock
       count has nothing to count. They are named here rather than quietly
       dropped: the requirement they carried - connecting is worth
       something, visibly - is now carried by the pair of tests above,
       which say the ask is present for a guest and gone for a member. */
    expect(body.toLowerCase(), "and it names the league").toContain("dynasty degens");

    await page.close();
  });

  test("the homepage names the league instead of advertising a connect", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubAccount(page, [LEAGUE]);
    await page.goto(`${SITE}/index.html#/`);
    await page.waitForSelector("#view-home h1");
    await page.waitForFunction(
      () => document.getElementById("view-home").innerText.toLowerCase().includes("dynasty degens"),
      null,
      { timeout: 15000 },
    );

    const body = await text(page);
    /* v3's league chip: the name, then what Juke may do with it.

       This asserted "YOUR LEAGUE" and "Connected · read-only" - the
       production hero's second card, which read "BRING YOUR LEAGUE /
       Connect" with four platforms under it whether or not one was
       connected, and that card is gone. v3 states the same two facts in
       the chip above the call sheet: the league's own name, and
       "League · read-only".

       The read-only half is worth keeping on its own terms. It is the
       promise the connect integration was built under - Juke only ever
       READS a league - and CLAUDE.md records it being settled deliberately
       against a handoff that offered to write a lineup back. A screen that
       stopped saying it would be quietly widening what the product claims
       to do. */
    expect(body.toLowerCase(), "the league is named").toContain("dynasty degens");
    expect(body.toLowerCase(), "and the read-only promise is still made")
      .toContain("read-only");

    await page.close();
  });
});

/* ---- Switching between connected leagues ----

   `connected_leagues` has been keyed (clerk_id, provider, league_id) since
   0005 and listLeagues() has always returned every row; useLeague() took
   `[0]` and nothing could reach the rest. Reported by somebody wanting to
   beta-test a real ESPN league alongside a Sleeper test league.

   ---- What these can and cannot reach ----

   LeagueSwitcher (the header menu) and the You screen's list both sit
   inside Clerk's <SignedIn>, so a keyless build renders neither — the same
   gap this file's own header note describes for the connect dialog, and
   the reason those two were driven by hand.

   What IS reachable is the contract underneath both of them, which is
   where the bug actually lived: the active league is the HEAD of the list,
   and every surface reads it from one shared place. A menu that switched a
   league without that would move a highlight and change nothing. */

/* The stub above, with a `selectLeague` that behaves like the worker: PATCH
   answers the whole list back, reordered most-recently-selected first. Kept
   beside stubAccount rather than folded into it, so the tests that never
   switch keep the smaller fixture. */
function stubSwitchable(page, rows) {
  return page.addInitScript((seed) => {
    window.JukeAuth = { isSignedIn: true, userId: "u1", getToken: () => Promise.resolve("t") };
    let order = seed.slice();
    const install = () => {
      const L = window.Live || (window.Live = {});
      L.listLeagues = () => Promise.resolve({ ok: true, leagues: order.slice() });
      /* The snapshot, for stubAccount's reason: v3's connected homepage
         reads one, and without it the page is an error screen with no <h1>.
         Keyed off whichever league is currently at the head, so a switch
         changes what the page can draw as well as what it lists. */
      L.leagueSnapshot = (leagueId) => {
        const lg = order.find((l) => l.leagueId === leagueId) || order[0] || {};
        return Promise.resolve({
          ok: true,
          snapshot: {
            leagueId, name: lg.name, provider: lg.provider, season: "2026", week: 3,
            totalTeams: lg.totalTeams || 12, status: "in_season", rules: {},
            teams: [
              { ownerId: lg.ownerId || "me", name: "Your Team", wins: 2, losses: 1, ties: 0, pointsFor: 300, pointsAgainst: 280, players: [], starters: [] },
              { ownerId: "them", name: "Gridiron Gang", wins: 1, losses: 2, ties: 0, pointsFor: 280, pointsAgainst: 300, players: [], starters: [] },
            ],
            draftAt: null, draftStatus: "complete", schedule: null,
            tradeDeadline: { at: null, week: null, disabled: false },
            waiver: { type: "faab", budget: 100, minimumBid: 0, resetsOrder: false, hours: 24 },
            waiverBudget: 100,
          },
        });
      };
      L.selectLeague = (token, leagueId, provider) => {
        const hit = order.find((l) => l.leagueId === leagueId && l.provider === provider);
        if (!hit) return Promise.resolve({ ok: false, reason: "not-connected", leagues: [] });
        // What 0006's ORDER BY does, in one line.
        order = [hit].concat(order.filter((l) => l !== hit));
        return Promise.resolve({ ok: true, leagues: order.slice() });
      };
    };
    install();
    window.addEventListener("juke:data-loaded", install);
    document.addEventListener("DOMContentLoaded", install);
  }, rows);
}

const SLEEPER_LG = {
  provider: "sleeper", leagueId: "L1", name: "Sleeper Test", season: "2026", totalTeams: 10,
};
const ESPN_LG = {
  provider: "espn", leagueId: "L2", name: "Real ESPN League", season: "2026", totalTeams: 12,
};

const home = (page) => page.goto(SITE + "/index.html#/");
/* Case-insensitive, because every one of these names is title case in the
   source and UPPERCASED in CSS - innerText returns what is painted. That
   trap has now broken a hero-eyebrow check, a "Randomize" check, a /nan/i
   sweep, a "Win probability" probe and this file. */
const named = (name) => () =>
  document.getElementById("view-home").innerText.toLowerCase().includes(name.toLowerCase());

test.describe("more than one connected league", () => {
  test("the app draws the head of the list", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubSwitchable(page, [ESPN_LG, SLEEPER_LG]);
    await home(page);
    await page.waitForSelector("#view-home h1");
    await page.waitForFunction(named("Real ESPN League"), null, { timeout: 15000 });

    const body = await page.locator("#view-home").innerText();
    /* Two leagues connected and exactly one named. WHICH one is the whole
       assertion: the head. A build reading the last entry — or the
       most-recently-CONNECTED rather than the most-recently-SELECTED —
       names the other one and fails here. */
    expect(body, "the active league is named").toContain("Real ESPN League");
    expect(body, "and the other one is not").not.toContain("Sleeper Test");

    await page.close();
  });

  test("switching moves the head, and the page follows", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubSwitchable(page, [ESPN_LG, SLEEPER_LG]);
    await home(page);
    await page.waitForSelector("#view-home h1");
    await page.waitForFunction(named("Real ESPN League"), null, { timeout: 15000 });

    /* Driving Live.selectLeague rather than the menu, because the menu is
       behind Clerk. What this proves is the half the menu depends on and
       cannot fake: the worker's new order becomes the shared state and
       every surface repaints from it.

       `juke:league` is the announcement useLeague() listens for — the
       channel anything outside the React tree uses to say the answer
       changed. */
    await page.evaluate(async () => {
      await window.Live.selectLeague("t", "L1", "sleeper");
      window.dispatchEvent(new Event("juke:league"));
    });
    await page.waitForFunction(named("Sleeper Test"), null, { timeout: 15000 });

    const body = await page.locator("#view-home").innerText();
    expect(body, "the switched-to league is named").toContain("Sleeper Test");
    expect(body, "and the one it replaced is not").not.toContain("Real ESPN League");

    await page.close();
  });

  test("a switch made on another device arrives here", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubSwitchable(page, [ESPN_LG, SLEEPER_LG]);
    await home(page);
    await page.waitForSelector("#view-home h1");
    await page.waitForFunction(named("Real ESPN League"), null, { timeout: 15000 });

    /* Why the active league is a column in D1 rather than a localStorage
       key: it has to follow somebody to their phone, which is the same
       argument useLeague() already makes about the connection itself. So a
       switch made elsewhere arrives on the next read, with nothing local
       overriding it.

       Simulated by reordering the server's answer without this page having
       touched anything. A device-local active league passes every other
       test in this block and fails this one. */
    await page.evaluate(() => {
      const listed = window.Live.listLeagues;
      window.Live.listLeagues = () =>
        listed("t").then((res) => ({ ok: true, leagues: res.leagues.slice().reverse() }));
      window.dispatchEvent(new Event("juke:league"));
    });
    await page.waitForFunction(named("Sleeper Test"), null, { timeout: 15000 });

    const body = await page.locator("#view-home").innerText();
    expect(body, "the other device's choice won").toContain("Sleeper Test");
    expect(body, "and this one let go of its own").not.toContain("Real ESPN League");

    await page.close();
  });

  test("Live.selectLeague sends a PATCH, and tells a refusal from an outage", async ({ context }) => {
    const page = await context.newPage();
    await stubAccount(page, [SLEEPER_LG]);
    await home(page);
    await page.waitForSelector("#view-home h1");
    // live.js is deferred. This waits for the REAL selectLeague — stubAccount
    // replaces only listLeagues, so what is exercised below is live.js's own.
    await page.waitForFunction(
      () => window.Live && window.Live.selectLeague,
      null,
      { timeout: 15000 },
    );

    const seen = [];
    await page.route("**/me/leagues", async (route) => {
      seen.push({ method: route.request().method(), body: route.request().postData() });
      // The worker's answer for "this account has not connected that
      // league": selectLeague()'s WHERE is scoped by clerk_id, so nothing
      // matched. 409 rather than 404 — the league may well exist.
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: false, error: "not-connected" }),
      });
    });

    const refused = await page.evaluate(() => window.Live.selectLeague("t", "L9", "espn"));

    expect(seen.length, "one request").toBe(1);
    expect(seen[0].method, "PATCH — switching connects nothing and fetches nothing").toBe("PATCH");
    expect(JSON.parse(seen[0].body)).toEqual({ leagueId: "L9", provider: "espn" });

    /* Told apart from an outage on purpose, the same way the connect flow
       tells not-found from offline: a refusal wants a re-read and an outage
       wants a retry, and collapsing them means telling somebody their
       league is gone because the worker blinked. */
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("not-connected");

    await page.close();
  });
});

/* A read that FAILS is not an account with no league.
 *
 * Reported 8 September 2026 with a screenshot: two connected leagues, an
 * account on Multi-League, both rows in D1 throughout — and #/my-league
 * showing "Demo league · sample data" under a "Connect a real league"
 * button. The read was returning 500 (see staleLeague() in
 * worker/draft-room.js for the missing import behind it), leagueStore
 * settled "error", and MyLeagueScreen's `!connected` drew the guest
 * experience.
 *
 * So the worker bug is fixed where it lives, and this is the other half:
 * whatever makes the read fail next time, this screen must not answer it by
 * claiming the reader has no league. That is the rule leagueStore.js's own
 * header states — a state meaning "we could not find out" has to be
 * renderable — which HomeAlive and YouScreen already followed and this
 * screen did not.
 *
 * Clerk-gated for the same reason as the block above: a keyed build lets
 * AuthBridge overwrite window.JukeAuth with Clerk's own answer, so the stub
 * is only the whole truth where Clerk is absent. */
function stubFailingRead(page) {
  return page.addInitScript(() => {
    window.JukeAuth = { isSignedIn: true, userId: "u1", getToken: () => Promise.resolve("t") };
    const install = () => {
      const L = window.Live || (window.Live = {});
      // Exactly what live.js answers for a 500: no leagues, and a reason
      // that is not "there are none".
      L.listLeagues = () => Promise.resolve({ ok: false, reason: "offline", leagues: [] });
    };
    install();
    window.addEventListener("juke:data-loaded", install);
    document.addEventListener("DOMContentLoaded", install);
  });
}

test.describe("My League when the read fails", () => {
  test("says it could not find out, rather than showing the guest demo", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);

    const page = await context.newPage();
    await stubFailingRead(page);
    await page.goto(`${SITE}/index.html#/league`);
    await page.waitForSelector("#view-home h1");

    /* Settle first, and wait on EITHER outcome rather than on the right one.
       Waiting for the error copy alone makes the failure a bare
       "waitForFunction: Timeout 15000ms exceeded", which says nothing about
       what was on screen instead — confirmed by running it that way against
       the bug. Waiting for whichever screen the store lands on lets the
       assertions below be what fails, and they name it. */
    await page.waitForFunction(
      () => {
        const t = document.getElementById("view-home").innerText;
        return /League · sample/i.test(t) || /Could not load your leagues/i.test(t);
      },
      null,
      { timeout: 15000 },
    );

    const shown = await text(page);

    /* The assertion the screenshot is about. The demo is the correct screen
       for somebody with no league and a false statement to somebody with
       one, and nothing else on the page distinguishes the two. */
    /* v3 renamed both sides of this and kept both claims. Production's
       banner read "Demo league · sample data" and its error "Couldn't load
       your league"; V3League labels the demo "League · sample" and the
       failure "Could not load your leagues". The requirement is untouched
       and is the one the screenshot was about: the sample is the correct
       screen for somebody with NO league and a false statement to somebody
       who has one, and nothing else on the page tells those two apart. */
    expect(shown, "the sample must not stand in for a failed read")
      .not.toMatch(/League · sample/i);

    expect(shown, "it says what happened").toMatch(/Could not load your leagues/i);

    /* Retry rather than Connect, deliberately: offering Connect to somebody
       who already has a league has them reconnect one they never
       disconnected, which is why "error" exists rather than collapsing into
       "none" in the first place. */
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    await page.close();
  });
});

