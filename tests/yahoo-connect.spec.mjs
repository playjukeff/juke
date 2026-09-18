/* Connecting a Yahoo league, the one flow that leaves the page.

   The worker half -- the consent state, the sealed token, the refresh, the
   grant deleted with the last league -- is proved offline in
   worker/test-yahoo.mjs. This is the page half: the dialog's Yahoo step, the
   REAL return page at /connect/yahoo.html, YahooReturn reopening the dialog
   at the league list, and the connect. Nothing else drives the return page,
   and it is the one page on the site that reads a value out of a URL and
   navigates on it.

   ---- How it is driven ----

   Signed in and with the worker stubbed on EVERY load, because the round
   trip navigates twice and each load has to find the same stubs. "Yahoo"
   is a stub that approves at once and sends the reader straight back to the
   real return page. Every stub call is logged to sessionStorage so the log
   survives those navigations.

   **The stub signs in AFTER load**, the way Clerk actually resolves. A
   JukeAuth that says "signed in" before hydration makes the client's first
   render disagree with the prerendered guest page, and React reports #418 --
   the first version of this file did that, and the hydration errors it
   produced were the harness, measured by moving the sign-in after load and
   watching them go.

   The Yahoo platform is `beta`, so every test but one opts this browser in
   the way a beta tester would. */

import { test, expect } from "@playwright/test";
import { SITE } from "./helpers.mjs";

function install(page, { beta = true } = {}) {
  return page.addInitScript(({ beta }) => {
    if (beta) localStorage.setItem("juke.beta.yahoo", "1");
    const log = (name, args) => {
      const all = JSON.parse(sessionStorage.getItem("__ylog") || "[]");
      all.push({ name, args });
      sessionStorage.setItem("__ylog", JSON.stringify(all));
    };
    const auth = { isSignedIn: false, userId: "user_test", getToken: async () => "tok" };
    Object.defineProperty(window, "JukeAuth", { configurable: true, get: () => auth, set: () => {} });
    window.addEventListener("load", () => setTimeout(() => {
      auth.isSignedIn = true;
      window.dispatchEvent(new Event("juke:auth"));
    }, 300));
    const connected = () => JSON.parse(sessionStorage.getItem("__yconnected") || "[]");
    const stubs = {
      me: async () => ({ ok: true, reason: null, signedIn: true, tier: "allaccess" }),
      listLeagues: async () => ({ ok: true, reason: null, leagues: connected() }),
      yahooLeagues: async () => { log("yahooLeagues", []); return { ok: false, reason: "needs-auth", leagues: [] }; },
      yahooAuthorize: async () => {
        log("yahooAuthorize", []);
        return { ok: true, reason: null, state: "S1", url: location.origin + "/connect/yahoo.html?code=GOOD&state=S1" };
      },
      yahooExchange: async (t, code, state) => {
        log("yahooExchange", [code, state]);
        return { ok: true, reason: null, leagues: [
          { leagueId: "461.l.777", name: "Dynasty Degens", season: "2026", totalTeams: 10, draftStatus: "complete", myTeamId: "1", myTeamName: "Chase's Team" },
          { leagueId: "461.l.888", name: "Work League", season: "2026", totalTeams: 12, draftStatus: "pre_draft", myTeamId: "5", myTeamName: "Cubicle FC" },
        ] };
      },
      yahooForget: async () => { log("yahooForget", []); return { ok: true, reason: null }; },
      connectLeague: async (t, leagueId, ownerId, provider) => {
        log("connectLeague", [leagueId, ownerId, provider]);
        const league = { provider, leagueId, ownerId, name: "Dynasty Degens", season: "2026", totalTeams: 10 };
        sessionStorage.setItem("__yconnected", JSON.stringify([league]));
        return { ok: true, reason: null, league };
      },
      leagueSnapshot: async () => ({ ok: false, reason: "offline", snapshot: null }),
    };
    let real;
    Object.defineProperty(window, "Live", {
      configurable: true,
      get: () => real,
      set: (v) => { real = Object.assign(v, stubs); },
    });
  }, { beta });
}

const logOf = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("__ylog") || "[]"));

async function openDialog(page) {
  await page.goto(SITE + "/index.html#/account");
  await page.waitForFunction(() => window.JukeEngine, null, { timeout: 20000 });
  await page.getByRole("button", { name: /Connect a league/ }).first().click();
  return page.locator("dialog[open]");
}

test("the whole round trip, through the real return page", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await install(page);
  const dialog = await openDialog(page);

  const yahooRow = dialog.getByRole("button", { name: /Yahoo/ });
  await expect(yahooRow).toBeEnabled();
  await expect(yahooRow).toContainText("BETA");
  /* Joined by the list file rather than by hand -- this read "Sleeper and
     ESPN and CBS" and "the others" about a single platform. */
  await expect(dialog).toContainText("Sleeper, ESPN and CBS are what Juke reads today. Yahoo is not connected yet.");

  await yahooRow.click();
  await expect(dialog.getByRole("heading", { name: "Sign in with Yahoo" })).toBeVisible();

  // Leaves for "Yahoo", comes back through /connect/yahoo.html, and the app
  // reopens the dialog at the league list without anybody pressing anything.
  await dialog.getByRole("button", { name: "Continue to Yahoo" }).click();
  await page.waitForURL(/#\/account$/, { timeout: 20000 });
  const back = page.locator("dialog[open]");
  await expect(back.getByRole("heading", { name: "Which league?" })).toBeVisible({ timeout: 20000 });
  await expect(back).toContainText("Signed in with Yahoo");
  // Yahoo knows which team is the reader's, and the row says which.
  await expect(back).toContainText("CHASE'S TEAM");

  await back.getByRole("radio", { name: /Dynasty Degens/ }).click();
  await back.getByRole("button", { name: "Connect league" }).click();
  await expect(back).toContainText("Connected Dynasty Degens");

  const log = await logOf(page);
  expect(log.map((e) => e.name)).toEqual(["yahooLeagues", "yahooAuthorize", "yahooExchange", "connectLeague"]);
  expect(log[2].args).toEqual(["GOOD", "S1"]);
  expect(log[3].args).toEqual(["461.l.777", "1", "yahoo"]);
  // Consumed exactly once: a reload has nothing to replay.
  expect(await page.evaluate(() => [sessionStorage.getItem("juke.yahoo.return"), sessionStorage.getItem("juke.yahoo.pending")]))
    .toEqual([null, null]);
  // Connected, so closing forgets nothing.
  await page.waitForTimeout(1200);
  expect((await logOf(page)).some((e) => e.name === "yahooForget")).toBe(false);
  expect(errors).toEqual([]);
});

test("a reader who says no on Yahoo is told so, and nothing is exchanged", async ({ page }) => {
  await install(page);
  await page.goto(SITE + "/connect/yahoo.html?error=access_denied&state=S1");
  await page.waitForURL(/#\/account$/);
  await expect(page.locator("dialog[open]")).toContainText("Yahoo did not approve it", { timeout: 20000 });
  expect((await logOf(page)).some((e) => e.name === "yahooExchange")).toBe(false);
});

/* The courtesy check. The binding that matters is the worker's signature
   (worker/test-yahoo.mjs); this is what stops a link somebody sent opening
   the dialog onto a sign-in that is not this session's. */
test("a return whose state is not the one this session sent is refused before exchange", async ({ page }) => {
  await install(page);
  await page.goto(SITE + "/index.html#/account");
  await page.evaluate(() => sessionStorage.setItem("juke.yahoo.pending", JSON.stringify({ state: "MINE", back: "#/account", at: Date.now() })));
  await page.goto(SITE + "/connect/yahoo.html?code=GOOD&state=SOMEBODY-ELSES");
  await expect(page.locator("dialog[open]")).toContainText("did not match this session", { timeout: 20000 });
  expect((await logOf(page)).some((e) => e.name === "yahooExchange")).toBe(false);
});

test("signing in to Yahoo and closing without connecting forgets the grant", async ({ page }) => {
  await install(page);
  await page.goto(SITE + "/connect/yahoo.html?code=GOOD&state=S1");
  const d = page.locator("dialog[open]");
  await expect(d.getByRole("heading", { name: "Which league?" })).toBeVisible({ timeout: 20000 });
  await d.getByRole("button", { name: "Close" }).click();
  await expect.poll(async () => (await logOf(page)).some((e) => e.name === "yahooForget")).toBe(true);
});

/* The return page reads the origin out of the state BEFORE anything has
   verified its signature, so it may only ever follow it to the site's own
   addresses. */
test("the return page will not redirect off the site", async ({ page }) => {
  await install(page);
  const evil = Buffer.from(JSON.stringify({ o: "https://evil.example" })).toString("base64url") + ".sig";
  await page.goto(SITE + "/connect/yahoo.html?code=X&state=" + evil);
  await page.waitForURL(/#\/account$/);
  expect(new URL(page.url()).origin).toBe(new URL(SITE).origin);
});

test("without the beta flag Yahoo is still locked", async ({ page }) => {
  await install(page, { beta: false });
  const row = (await openDialog(page)).getByRole("button", { name: /Yahoo/ });
  await expect(row).toBeDisabled();
  await expect(row).not.toContainText("BETA");
});

/* The dialog's box asked for 92vw inside a <dialog> the browser caps at
   `100% - 2em - 6px`, so on a phone every step could be pushed ten pixels
   sideways -- measured on the platform, ESPN and Yahoo steps alike. The
   dialog carries the width now; this holds it, and holds the desktop at
   the 30rem it always was. */
test("the dialog fits a phone on every step, and is still 30rem on a desk", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await install(page);
  const dialog = await openDialog(page);
  const over = () => page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    const edge = d.getBoundingClientRect().right;
    return {
      scroll: d.scrollWidth - d.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      past: [...d.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > edge + 0.5).length,
    };
  });
  expect(await over(), "platform step").toEqual({ scroll: 0, page: 0, past: 0 });
  await dialog.getByRole("button", { name: "ESPN" }).click();
  expect(await over(), "ESPN step").toEqual({ scroll: 0, page: 0, past: 0 });
  await dialog.getByRole("button", { name: /Not ESPN/ }).click();
  await dialog.getByRole("button", { name: /Yahoo/ }).click();
  await expect(dialog.getByRole("heading", { name: "Sign in with Yahoo" })).toBeVisible();
  expect(await over(), "Yahoo step").toEqual({ scroll: 0, page: 0, past: 0 });

  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => Math.round(document.querySelector("dialog[open]").getBoundingClientRect().width))).toBe(480);
});
