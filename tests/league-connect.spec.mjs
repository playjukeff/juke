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

const LEAGUE = { leagueId: "lg1", name: "Dynasty Degens", season: "2026", totalTeams: 12 };

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
 * it: VERIFY A SKIP IN BOTH DIRECTIONS or it is a deletion. Locally these
 * eight run and pass; against production three run and five skip.
 */
const CLERK_GATED = "signed-in rendering is Clerk's, and a keyed build ignores the stub";

const text = (page) => page.locator("#view-home").innerText();

test.describe("a connected league", () => {
  test("nothing on the site claims four working platforms", async ({ context }) => {
    const page = await openApp(context, "#/rooms");
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
    const page = await openApp(context, "#/rooms");
    await page.waitForSelector("#view-home h1");
    const body = await text(page);

    // The control, and it matters: every assertion in the next test is about
    // something DISAPPEARING, and a bug that hid these from everybody would
    // pass all of them.
    expect(body).toContain("Connect your league");
    expect(body).toContain("The rest unlock when you connect a league");
    /* Two, not one. Draft has always been open to everybody; Prospect
       joined it, because its content is the board rather than a roster and
       there is nothing for a league to unlock. The rooms a LEAGUE opens is
       a narrower question than the rooms a reader can walk into, and this
       count is the second one — which is why roomIsOpen() replaced the
       exported slug list that could only answer the first. */
    expect(body).toMatch(/5 ROOMS · 2 OPEN/);

    await page.close();
  });

  test("with a league connected, the site stops asking for one", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubAccount(page, [LEAGUE]);
    await page.goto(`${SITE}/index.html#/rooms`);
    await page.waitForSelector("#view-home h1");
    // The lobby reads the league through useLeague(), which resolves a tick
    // after mount — wait for the answer rather than for a duration. "Your
    // league is in" is SubCopy()'s own connected-state text, so waiting on
    // it is waiting on the same settle every assertion below depends on.
    await page.waitForFunction(
      () => document.getElementById("view-home").innerText.includes("Your league is in"),
      null,
      { timeout: 15000 },
    );

    const body = await text(page);

    /* Every one of these was still on the screen after a successful connect,
       and each is a different component that had no way to hear about it.
       Confirmed red without the shared league state: all four fail. */
    expect(body, "the unlock bar is gone").not.toContain("Connect your league");
    expect(body, "and so is the promise it made").not.toContain(
      "The rest unlock when you connect a league",
    );
    /* The lobby does not NAME the league — the header chip that does is
       inside <SignedIn> and so absent from a keyless build (see this file's
       own note). What it says instead is that the league is in, which is
       the same fact in the copy this screen owns. */
    expect(body, "and the blurb says the league is in").toContain("Your league is in");
    /* And it does not still call those three a sample. This line was wrong
       on the deployed site for as long as the assertion above was red, and
       for the same reason — the copy promising "these three still show a
       sample week until they are built" outlived the three being built. */
    expect(body, "the connected copy does not call the live rooms samples").not.toContain(
      "sample week until they are built",
    );
    /* All five, and this assertion was STANDING RED before the Prospect
       Room went anywhere near it.

       It read `1 OPEN`, with a comment explaining that connecting a league
       opens nothing else in this grid — true while Waiver, Trade and
       Strategy were locked previews. They got real connected bodies in the
       phases that followed and nobody came back to this line, so it has
       been failing since. Prospect's own run is what surfaced it, the same
       way it surfaced rail-nav's stale #/drafts.

       Two of the five are open to everybody (Draft, Prospect) and three
       are what the league buys, which is the number this screen exists to
       move. The guest test above pins the other end at 2; the pair of them
       together is what says connecting is worth something. */
    expect(body, "a league opens the three rooms that read a roster").toMatch(
      /5 ROOMS · 5 OPEN/,
    );

    /* League itself no longer appears in this grid at all — not locked, not
       open, just gone (it is #/my-league now). The old "no longer previewed"
       check named League Room's own retired hook text; asserting its
       absence here would be checking something that structurally cannot
       happen any more, so the meaningful version of this guard is that the
       room name itself is gone from the grid. */
    expect(body, "and League Room is not one of the cards any more").not.toContain("League Room");

    await page.close();
  });

  test("the homepage names the league instead of advertising a connect", async ({ context }) => {
    test.skip(!LOCAL_SITE, CLERK_GATED);
    const page = await context.newPage();
    await stubAccount(page, [LEAGUE]);
    await page.goto(`${SITE}/index.html#/`);
    await page.waitForSelector("#view-home h1");
    await page.waitForFunction(
      () => document.getElementById("view-home").innerText.includes("Dynasty Degens"),
      null,
      { timeout: 15000 },
    );

    const body = await text(page);
    // The hero's second card. It read "BRING YOUR LEAGUE / Connect" with a
    // list of four platforms under it, whether or not one was connected.
    expect(body).toContain("YOUR LEAGUE");
    expect(body).toContain("Connected · read-only");

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
const named = (name) => () =>
  document.getElementById("view-home").innerText.includes(name);

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
