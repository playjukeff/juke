/* Nothing throws, and nothing shouts into a console nobody is reading.
 *
 * ---- Why this exists ----
 *
 * CLAUDE.md ranks "the browser half has no error tracking" as an open ceiling,
 * and records what that gap produced: React's #418 and #423 were on EVERY LOAD
 * of the site for the whole life of accounts, and were found by somebody
 * opening a console. Not an outage - a permanent silent tax nobody was told
 * about.
 *
 * Before this file, no spec in the suite listened. Forty-one spec files, zero
 * `pageerror` handlers, zero console listeners. So a hydration error, a
 * ReferenceError behind a branch, or a bridge guard that started returning
 * null could ship exactly as those two did, and the next person to notice
 * would be the next person to open dev tools.
 *
 * ---- What is filtered, and why each one cannot hide a defect of ours ----
 *
 * A check that reports third-party weather is a check nobody reads by the end
 * of the week, so two things are dropped and nothing else:
 *
 *   1. Anything downstream of a request to a host we do not serve. Every one
 *      of those integrations is designed to fail silently and is documented
 *      that way - the score strip "fails by disappearing", Latest News draws
 *      nothing without a key. A test that goes red when ESPN has a bad
 *      afternoon is asserting somebody else's uptime.
 *
 *   2. The inline-script CSP refusal, which is Cloudflare's bot-detection
 *      script being blocked ON PURPOSE. CLAUDE.md: "it is blocked, on purpose,
 *      and the only cost is console noise wherever a browser reports it."
 *
 * The second filter would be dangerous on its own, because it would equally
 * swallow an inline script of OUR own being refused - so the assertion below
 * it pins the premise that makes it safe: this app ships no inline scripts at
 * all. Measured on the served page rather than asserted from the rule:
 * production carries exactly one, and it is Cloudflare's.
 *
 * `pageerror` is never filtered. An uncaught exception is ours by definition;
 * the blocked third-party script never runs, so it cannot raise one.
 */
import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft, SITE, LOCAL_SITE } from "./helpers.mjs";

const ROUTES = ["#/", "#/rooms", "#/rooms/draft", "#/drafts", "#/you", "#/my-league",
  "#/rooms/waiver", "#/rooms/trade", "#/rooms/strategy", "#/rooms/prospect"];

/* Runtime dependencies on somebody else's server, each documented as failing
   by disappearing. A host earns its place here by being one we cannot deploy,
   never by being noisy. */
const EXTERNAL = [
  "site.api.espn.com",      // the score strip and the kickoff pill
  "sleepercdn.com",         // player headshots
  "fonts.googleapis.com",   // the display face
  "fonts.gstatic.com",
  "cloudflareinsights.com", // the analytics beacon
  "giphy.com",
  "clerk.accounts.dev",     // absent in a keyless build by design
];

function watch(page, tag) {
  const out = [];
  const failedHosts = new Set();
  page.on("requestfailed", (r) => {
    try { failedHosts.add(new URL(r.url()).host); } catch { /* not a URL we can read */ }
  });
  page.on("pageerror", (e) => out.push(`${tag()} [pageerror] ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (EXTERNAL.some((h) => text.includes(h))) return;
    // "Failed to load resource" names no host in its text, so it is matched
    // against what actually failed rather than by guessing from the string.
    if (/Failed to load resource/i.test(text) &&
        [...failedHosts].some((h) => EXTERNAL.some((e) => h.includes(e)))) return;
    if (/inline script/i.test(text) && /Content Security Policy/i.test(text)) return;
    out.push(`${tag()} [console] ${text.slice(0, 200)}`);
  });
  return out;
}

for (const width of [1440, 375]) {
  test(`no route throws or logs an error at ${width}`, async ({ browser }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let route = "(boot)";
    const seen = watch(page, () => route);

    for (const r of ROUTES) {
      route = r;
      await page.goto(SITE + "/" + r);
      /* A condition, never a duration: a route read mid-skeleton has not run
         the code that would throw yet. */
      await page.waitForFunction(
        () => window.JukeEngine && window.JukeEngine.dataReady && window.JukeEngine.dataReady(),
        null, { timeout: 30000 });
      await page.waitForTimeout(500);
    }

    expect(seen, "console errors and uncaught exceptions").toEqual([]);
    await context.close();
  });
}

test("a live draft throws nothing across its four tabs", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const seen = watch(page, () => "#/rooms/draft");
  const p = await openApp(context, "#/rooms/draft", { page });
  await startSoloDraft(p);
  await p.waitForFunction(() => typeof state === "object" && state.started, null, { timeout: 30000 });
  await p.evaluate(() => {
    stopSim();
    for (let i = 0; i < 30; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
    render();
  });
  for (const label of ["Players", "Board", "Decide", "Analysis"]) {
    await p.evaluate((l) => {
      const root = document.getElementById("draftroom-root");
      const b = [...root.querySelectorAll("button")]
        .find((x) => x.textContent.trim() === l && x.getBoundingClientRect().height > 0);
      if (b) b.click();
    }, label);
    await p.waitForTimeout(400);
  }
  expect(seen, "console errors and uncaught exceptions during a draft").toEqual([]);
  await context.close();
});

/* The premise the CSP filter rests on, checked rather than trusted.
 *
 * Local only, and that is not a dodge: production's single inline script is
 * Cloudflare's injection, which we neither ship nor can remove, so asking the
 * question there measures their page rather than ours. The built artifact is
 * the thing this repository is responsible for. Skipped in the other
 * direction rather than deleted - see CLAUDE.md on verifying a skip both
 * ways. */
test("the app ships no inline script for the CSP to refuse", async ({ browser }) => {
  test.skip(!LOCAL_SITE, "production carries Cloudflare's injected inline script, which is not ours");
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.goto(SITE + "/?cb=" + Date.now());
  const html = await res.text();
  // Comments stripped first: this page quotes `<script>` in its own prose, and
  // smoke-pages.mjs already reported a `.woff2` as a 404 for exactly that.
  const bare = html.replace(/<!--[\s\S]*?-->/g, "");
  const inline = (bare.match(/<script\b[^>]*>/g) || []).filter((t) => !/\ssrc=/.test(t));
  expect(inline, "inline <script> tags in the built page").toEqual([]);
  await context.close();
});
