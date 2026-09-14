/* One `?v=` stamp on the page, and the deferred data has to be on it.

   players.js and stats.js are regenerated from scratch every night and are
   addressed with a query string rather than a content hash, so the stamp is
   the only thing that makes new data reach a returning visitor. app.js used to
   carry its own literal copy of it, and the nightly's sed covers
   web/index.html, 404.html and the how-it-works page — not app.js. So the
   pipeline rewrote both files every morning behind an address that never
   moved. The two stamps had drifted a fortnight apart before anybody looked,
   and nothing about that failure is visible: the site serves, the board draws,
   the numbers are simply last week's.

   Adding app.js to that sed is not the fix and this file does not test for it.
   It would match nothing — there is no literal `?v=<stamp>` left in app.js —
   and if it were made to match it would rewrite the project's most-edited
   source file nightly, putting every open branch in daily conflict with the
   pipeline. The stamp is READ off app.js's own <script> tag instead, so there
   is one copy on the page and nothing left to drift.

   What is asserted here is therefore the relationship rather than any
   particular number: whatever index.html stamps app.js with is what the three
   deferred files are requested with. A literal would be wrong within a day —
   the nightly moves it — which is the same reason every other measured figure
   in this project carries a date. */

import { test, expect } from "@playwright/test";
import { openApp, SITE } from "./helpers.mjs";

/* Every stamp in the served HTML, by the file it addresses. Read off the
   markup rather than off performance entries: this is a question about what
   the page SAYS, and a resource entry would answer about what the browser
   happened to do with it. */
async function stampsInHtml(request) {
  const html = await (await request.get(SITE + "/")).text();
  const out = {};
  for (const m of html.matchAll(/\/([A-Za-z0-9._-]+\.js)\?v=([0-9A-Za-z._-]+)/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

test("the deferred data is stamped with the page's own version, not a second copy", async ({ context, request }) => {
  const stamps = await stampsInHtml(request);
  expect(stamps["app.js"], "index.html addresses app.js with a ?v= stamp").toBeTruthy();

  const page = await openApp(context, "#/draft");

  /* Wait for the real thing rather than reading the constant: what matters is
     the URL the browser is actually sent to, which is what a cache keys on.
     The deferred load is gated behind the cold-load reveal, so this can take a
     couple of seconds — see loadAfterTheReveal() in app.js. */
  await page.waitForFunction(
    () => window.JukeEngine && window.JukeEngine.dataReady(), null, { timeout: 25000 });

  const asked = await page.evaluate(() =>
    performance.getEntriesByType("resource")
      .map((r) => r.name)
      .filter((n) => /\/(players|stats|draft-engine)\.js/.test(n)));

  // Three files, and each is fetched once. A preload whose URL differs from
  // the script's by one character is not a warm cache, it is the same 636KB
  // downloaded twice — which is the failure mode of keeping two constants.
  for (const file of ["players.js", "stats.js", "draft-engine.js"]) {
    const hits = asked.filter((n) => n.includes("/" + file));
    expect(hits.length, `${file} is requested at exactly one address`).toBeGreaterThan(0);
    const distinct = new Set(hits.map((n) => new URL(n).search));
    expect(distinct.size, `${file} is not fetched under two different stamps`).toBe(1);
    expect(
      new URL(hits[0]).searchParams.get("v"),
      `${file} carries the same stamp index.html gives app.js`,
    ).toBe(stamps["app.js"]);
  }
});

/* The half of it a browser cannot see: that the nightly actually moves the
   stamp this test pins everything else to.

   The workflow rewrites `?v=` in three files by name. If web/index.html ever
   leaves that list, every assertion above still passes — they check that the
   files agree with each other, and they would go on agreeing on a stamp that
   had stopped moving. That is the same shape as the bug this file exists for,
   one level up, so it is worth its own line. */
test("the nightly still restamps the page the deferred data reads from", async () => {
  const fs = await import("node:fs/promises");
  const wf = await fs.readFile(".github/workflows/update-players.yml", "utf8");

  /* Lines rather than one regex over the whole file. The command is wrapped
     across two lines with a trailing backslash, and a pattern spanning that —
     through a shell-escaped sed expression full of its own backslashes — is
     the kind of assertion that fails for its own reasons rather than for the
     product's. Find the command, then read what it was given. */
  const lines = wf.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*sed -i -E .*\?v=/.test(l));
  expect(at, "the workflow still rewrites ?v= with a sed").toBeGreaterThan(-1);

  // Everything from the sed line until one that does not continue.
  let targets = "";
  for (let i = at; i < lines.length; i++) {
    targets += " " + lines[i].replace(/\\$/, "");
    if (!/\\$/.test(lines[i].trim())) break;
  }

  /* The list may be a shell variable rather than filenames inline — it became
     one when docs/privacy.html and docs/terms.html joined and the command
     outgrew a readable single line. Resolve the variable rather than asserting
     a shape: this test is about WHICH files get restamped, and it should not
     go red because the same list moved one line up. It did exactly that once,
     which is the tell — a stale test fails by not finding something, and what
     it could not find here was a filename still very much in the list. */
  const varRef = targets.match(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?\s*$/);
  if (varRef) {
    const assign = lines.find((l) => new RegExp("^\\s*" + varRef[1] + "=").test(l));
    expect(assign, `the sed's ${varRef[1]} is assigned in the same step`).toBeTruthy();
    targets = assign;
  }

  expect(targets, "and web/index.html is still one of the files it rewrites")
    .toContain("web/index.html");

  /* The two legal pages are in that list as of 4 September 2026 and had been
     missing from it since they were written — so style.css, theme.js and
     back-to-top.js sat frozen at an August stamp on both while the rest of
     the site moved. Asserted rather than trusted, because nothing a browser
     can check would notice them dropping out again: the pages render, they
     just render an old stylesheet. */
  expect(targets, "docs/privacy.html is restamped too").toContain("docs/privacy.html");
  expect(targets, "docs/terms.html is restamped too").toContain("docs/terms.html");

  /* And app.js deliberately is NOT — see this file's own header for why
     adding it is a no-op that would also conflict with every branch daily.

     The quote is in that character class because the list is now inside one:
     `STAMPED="app.js web/index.html ..."` puts a `"` immediately before the
     first filename, so a class of whitespace-or-slash alone stopped matching
     it. Checked by mutation rather than by reading — the first version of
     this line survived app.js being added to the list, which is a guard
     passing while the thing it guards is broken. */
  expect(targets, "app.js is deliberately not in that list").not.toMatch(/(^|[\s/"'])app\.js/);
});
