/* Latest news, on the React player sheet.

   This is the third thing on the page written by somebody outside the
   project, after chat and the ESPN strip, and it is the one that arrives
   from furthest away. So the load-bearing tests here are the same two chat
   has: the markup arrives as text and stays text, and a link that is not
   http(s) never becomes an href a browser will follow.

   Migrated off #/draft-legacy. One difference from the legacy sheet is
   deliberate and is not a regression, so it is written down rather than
   quietly asserted around: there, the news *tab* was hidden until headlines
   arrived, because an empty bordered box nobody asked for is worse than no
   box. The React drawer always offers the tab and says "No recent headlines
   for this player" inside it, which is a sentence rather than an empty
   frame. What the legacy hiding actually protected against - a tab left
   showing from the last player opening onto *his* headlines under this
   player's name - cannot happen here for a different reason, and that reason
   is tested below: the tab's contents reset on every player.
*/

import { test, expect } from "@playwright/test";
import { openApp, awaitBoard } from "./helpers.mjs";
import { WORKER_HTTP, LOCAL_WORKER } from "./helpers.mjs";

const HOSTILE = [
  { title: "A normal headline", summary: "A normal summary.",
    source: "Wire Service", at: "2026-08-16", url: "https://example.com/ok" },
  { title: '<img src=x onerror="window.__pwned=1">headline',
    summary: "<script>window.__pwned2=1</script>body",
    source: "<b>Source</b>", at: "2026-08-15", url: "https://example.com/escaped" },
  { title: "Script in a link", summary: "",
    source: "Sketchy", at: "", url: "javascript:window.__pwned3=1" },
  { title: "Data URI link", summary: "",
    source: "Sketchy", at: "", url: "data:text/html,<script>window.__pwned4=1</script>" },
];

async function start(page) {
  // The board first -- this presses #startBtn through evaluate(), which a
  // disabled attribute cannot refuse, so without it startDraft() returns
  // false and state.started never flips. See awaitBoard() in helpers.mjs.
  await awaitBoard(page);
  await page.evaluate(() => {
    /* Seat 0, and no picks. Every player this file names by hand is near the
       top of the board, and a drafted player leaves the available list - so
       looking for Gibbs after even one round means looking for somebody who
       is no longer there, and the sheet never opens.

       Seat 0 is what actually stops that: startDraft() ends by calling
       runCPUs(), so from any other seat the computer teams start drafting
       immediately and the top of the board is gone within a second. On the
       first seat it is my turn, runCPUs() returns without scheduling, and
       the board stays as it was. The legacy version called openSheet()
       directly and never had to care. */
    window.JukeEngine.startDraft({ mySlot: 0, clockLength: 90 });
    render();
    location.hash = "#/draft-room";
  });
  expect(await page.evaluate(() => state.started), "draft started").toBe(true);

  /* Decide, not Board, is the tab a draft lands on since the Cockpit rebuild
     - three recommendation cards and a roster rail, no search field and no
     player row carrying a name in text a naive click can find. The player
     list openSheet() below needs, search input included, lives on Board.
     Every test in this file opens a sheet by name straight after start(), so
     landing there once here is simpler than repeating the click in each one.

     :visible, not just the text filter: MobileDraftTabBar.jsx (mobile shell)
     carries its own "Board" button, lg:hidden rather than absent, so at this
     suite's desktop viewport there are two real "Board" buttons in the DOM
     at once and an unqualified filter is a strict-mode violation - Playwright
     refusing to guess which one a bare click meant. */
  await page.locator("#draftroom-root button:visible").filter({ hasText: /^Board$/ }).click();
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return root && root.querySelector("input");
  }, null, { timeout: 20000 });
}

/* The React tab calls window.Live.news directly, so the stub goes there.
   newsCache is the legacy panel's own and is cleared when it exists, because
   a stub that is never consulted proves nothing. */
async function stubNews(page, items) {
  await page.evaluate((rows) => {
    if (typeof newsCache !== "undefined") newsCache.clear();
    Live.news = () => Promise.resolve({ configured: true, items: rows });
  }, items);
}

/* News is asked for by the player's id at the *provider*, which the pipeline
   writes into stats.js as `x`. Nothing in the repo carries one until a build
   runs with a key, so a test that wants headlines has to put one there - and
   that is worth doing rather than working around, because the absence of an
   id is itself a behaviour with its own test below. */
async function crosswalk(page, name, theirId = "T-TEST-1") {
  await page.evaluate(([n, id]) => {
    const p = board.find((x) => x.name === n);
    PLAYER_STATS[p.id].x = { tank: id };
  }, [name, theirId]);
}

/* Open a player's sheet the way a reader does: find their row and click it.
   The drawer is one element reused for everybody, which is the reason half
   the assertions in this file exist. */
async function openSheet(page, name) {
  await page.evaluate((n) => {
    const root = document.getElementById("draftroom-root");
    const row = [...root.querySelectorAll('[class*="cursor-pointer"]')]
      .find((r) => (r.textContent || "").includes(n));
    if (row) row.click();
  }, name);
  await page.waitForFunction(() => {
    const root = document.getElementById("draftroom-root");
    return [...root.querySelectorAll("button")].some((b) => b.textContent.trim() === "Latest News");
  }, null, { timeout: 10000 });
}

async function openNewsTab(page) {
  await page.evaluate(() => {
    const root = document.getElementById("draftroom-root");
    [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Latest News").click();
  });
  await page.waitForTimeout(400);
}

/* Everything the news panel drew, read off the drawer. */
const PANEL = `(() => {
  const root = document.getElementById("draftroom-root");
  const panel = [...root.querySelectorAll(".overflow-y-auto")]
    .find((e) => e.querySelector("a[target=_blank]") || /headlines/i.test(e.innerText));
  return panel || null;
})()`;

test.describe("latest news", () => {
  test("with no provider key the sheet is complete and says so plainly",
    async ({ context }) => {
      /* The one test here that cannot be pointed at production. It asserts
         the *absence* of news, and the deployed worker has TANK01_KEY - so
         aimed there it fails by succeeding: headlines arrive and the run
         reports a regression that is really a configured provider. That is a
         worse outcome than not running, because a suite with a permanent
         known failure in it stops being read.

         Skipped rather than deleted or loosened. The keyless path is what a
         fresh checkout sees and would be the easiest thing in the world to
         ship broken, so it still has to run somewhere - and locally, where
         the suite starts its own keyless worker, it does. */
      test.skip(!LOCAL_WORKER,
        "asserts the keyless path; the deployed worker has a provider key");

      const page = await openApp(context, "#/draft-room");
      await start(page);
      await crosswalk(page, "Jahmyr Gibbs");
      await openSheet(page, "Gibbs");
      await openNewsTab(page);

      /* Read off the sheet itself rather than through PANEL, which is the one
         thing in this file that was actually broken.

         PANEL takes the first .overflow-y-auto holding a link, and since the
         drawer became a full-screen player sheet that *is* the sheet — the
         same drift CLAUDE.md already records for the hostile-payload test
         below, which was fixed by scoping its counts to the headline cards.
         Here it was the `.slice(0, 60)` that finished the job: sixty
         characters of the sheet is its header and tab strip, so this asserted
         against "jg · jahmyr gibbs · rb · det · our read · draft fit …" and
         reported a missing message that LatestNewsTab.jsx was rendering
         perfectly well a little further down.

         The scope is unchanged — PANEL resolved to this element anyway — so
         the link count means exactly what it did. What changes is that the
         message is looked for where the component puts it. */
      const r = await page.evaluate(() => {
        const root = document.getElementById("draftroom-root");
        return {
          links: root.querySelectorAll("a[target=_blank]").length,
          says: root.innerText,
          // The rest of the sheet is untouched: this is a section that fails
          // by having nothing to say, not by taking the page with it.
          ourReadStillThere: [...root.querySelectorAll("button")]
            .some((b) => b.textContent.trim() === "Our Read"),
        };
      });

      expect(r.links, "no headlines without a key").toBe(0);
      expect(r.says.toLowerCase(), "and it says so rather than showing an empty frame")
        .toContain("no recent headlines");
      expect(r.ourReadStillThere, "the sheet is otherwise complete").toBe(true);
    });

  test("the worker refuses an origin it does not serve, before reading the key",
    async ({ request }) => {
      /* CORS tells a browser whether to let a page read a response and does
         nothing about the request being made - curl with a made-up Origin
         drank the quota happily. This is the check that refuses, and it
         happens before the key is touched. No page, so nothing to migrate. */
      const evil = await request.get(`${WORKER_HTTP}/news?player=9221`,
        { headers: { Origin: "https://evil.example" } });
      expect(evil.status(), "a made-up origin").toBe(403);

      // Contains the string "jukeff.com" and is a different site entirely.
      const lookalike = await request.get(`${WORKER_HTTP}/news?player=9221`,
        { headers: { Origin: "https://jukeff.com.evil.example" } });
      expect(lookalike.status(), "a lookalike origin").toBe(403);

      const ours = await request.get(`${WORKER_HTTP}/news?player=9221`,
        { headers: { Origin: "http://localhost:8765" } });
      expect(ours.status(), "an origin we serve").toBe(200);
      const body = await ours.json();
      expect(body).toHaveProperty("configured");
      expect(Array.isArray(body.items), "items is always an array").toBe(true);
    });

  test("headlines render, and hostile ones stay text", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await start(page);
    await stubNews(page, HOSTILE);
    await crosswalk(page, "Jahmyr Gibbs");
    await openSheet(page, "Gibbs");
    await openNewsTab(page);

    const r = await page.evaluate((src) => {
      const panel = eval(src);
      const items = [...panel.querySelectorAll("a[target=_blank]")];
      return {
        count: items.length,
        hrefs: items.map((a) => a.getAttribute("href")),
        rels: [...new Set(items.map((a) => a.getAttribute("rel")))],
        targets: [...new Set(items.map((a) => a.getAttribute("target")))],
        // textContent, not innerText: the attribution line is styled
        // `uppercase`, and innerText returns the *rendered* text - so a
        // check for "Wire Service" fails against a perfectly correct
        // "WIRE SERVICE". Same trap as reading a colour off a transition.
        text: items.map((a) => a.textContent),
        /* Counted inside the headline cards, not across the whole panel.

           Every hostile field - the title, the summary, the source - renders
           inside its own item, so the items are where an element built from
           the payload would appear, and scoping there is what makes a count
           of 0 mean "nothing was constructed" rather than "nothing is on
           screen at all".

           Panel-wide was right when the panel was the news list. It is the
           full-screen player sheet now ("fixed inset-0 z-[70] overflow-y-auto",
           matched by PANEL's .overflow-y-auto), so it also contains the
           player's own headshot - two layers of one <img> off sleepercdn -
           and the check failed reporting img: 2 on a page where nothing had
           been injected at all. A security test that cries wolf is worse
           than most, because the next red is the one nobody reads.

           script stays panel-wide deliberately: a <script> anywhere in this
           sheet is worth failing on whoever built it. */
        injected: { img: items.reduce((n, a) => n + a.querySelectorAll("img").length, 0),
                    script: panel.querySelectorAll("script").length,
                    b: items.reduce((n, a) => n + a.querySelectorAll("b").length, 0) },
        pwned: [window.__pwned, window.__pwned2, window.__pwned3, window.__pwned4]
      };
    }, PANEL);

    // Both unsafe schemes gone; only the two http(s) items survive.
    expect(r.count, "javascript: and data: links are dropped").toBe(2);
    expect(r.hrefs.every((h) => h.startsWith("https://"))).toBe(true);

    /* The markup arrived as text and stayed text. Asserted against the DOM
       rather than the HTML string, because the question is whether the
       browser built an element - one manager putting a script tag in another
       manager's sheet is the exact failure chat is escaped to prevent, and a
       news feed is the same shape of input from further away.

       React escapes by construction, which is a better guarantee than
       escHtml() remembering to - but "better by construction" is exactly the
       claim that should be checked rather than assumed. */
    expect(r.injected, "nothing was constructed from the payload")
      .toEqual({ img: 0, script: 0, b: 0 });
    expect(r.pwned, "nothing ran").toEqual([undefined, undefined, undefined, undefined]);
    expect(r.text[1], "the tag is shown, not honoured").toContain("<img src=x");

    // Attribution is the part that may not be dropped: a headline with no
    // source is the version of this we are not allowed to show.
    expect(r.text[0]).toContain("Wire Service");

    /* And when the provider names nobody, it falls back to the link's
       hostname rather than blanking - not to the provider, who is the
       aggregator rather than the author. */
    const unnamed = await page.evaluate(() => window.JukeEngine.newsItemView({
      title: "No source given", summary: "", source: "", at: "",
      url: "https://www.espn.com/nfl/story/x"
    }));
    expect(unnamed.source, "an unattributed headline is still attributed").toBe("espn.com");
    expect(r.rels, "outbound links are safe to open").toEqual(["noopener noreferrer"]);
    expect(r.targets).toEqual(["_blank"]);
  });

  test("a slow answer cannot land in a different player's sheet",
    async ({ context }) => {
      const page = await openApp(context, "#/draft-room");
      await start(page);
      await crosswalk(page, "Jahmyr Gibbs");
      await crosswalk(page, "Puka Nacua", "T-TEST-2");

      /* The drawer is one element reused for everybody, so a slow answer for
         a player the reader has closed can render into whoever is open now.
         Nothing else in the app would catch it.

         Collect the pending resolvers and settle only the *first*: holding a
         single `release` variable is the obvious shape and is wrong, because
         the second open overwrites it, so resolving settles the second
         player's own request - which is not a race and passes against an app
         with no guard at all. This was written the wrong way first and the
         run that caught it looked like an app bug. */
      await page.evaluate(() => {
        window.__pending = [];
        Live.news = (id) => new Promise((resolve) => {
          window.__pending.push({ id, resolve });
        });
      });

      await openSheet(page, "Gibbs");
      await openNewsTab(page);
      await openSheet(page, "Nacua");
      await openNewsTab(page);

      // Answer Gibbs's request, long after his sheet was closed.
      await page.evaluate(() => {
        window.__pending[0].resolve({ configured: true, items: [
          { title: "GIBBS ONLY", summary: "", source: "Wire", at: "",
            url: "https://example.com/gibbs" }] });
      });
      await page.waitForTimeout(600);

      const r = await page.evaluate((src) => {
        const panel = eval(src);
        const root = document.getElementById("draftroom-root");
        return {
          asked: window.__pending.length,
          text: panel ? panel.innerText : "",
          openPlayer: (root.querySelector("h2, h3") || {}).textContent || root.innerText.slice(0, 40),
        };
      }, PANEL);

      /* At least two - one per player. Not exactly two: opening a sheet can
         re-run the fetch effect more than once for a single player, which is
         wasteful but is not what this test is about. The subject is whether a
         late answer for a closed player renders into an open one. */
      expect(r.asked, "both players were asked about").toBeGreaterThanOrEqual(2);
      expect(r.text, "the closed player's headlines are not in the open sheet")
        .not.toContain("GIBBS ONLY");
    });

  test("a player we could not link is never asked about", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await start(page);

    /* The pipeline reports these in unmatched.txt and the sheet shows nothing.
       What it must never do is fall back to a name, or to league-wide
       headlines dressed as his: somebody else's news under this player's name
       is the one outcome worse than an empty panel, and every number around it
       would still be right. */
    await page.evaluate(() => {
      if (typeof newsCache !== "undefined") newsCache.clear();
      window.__asked = 0;
      Live.news = () => { window.__asked++; return Promise.resolve({ configured: true, items: [{
        title: "SOMEBODY ELSE'S NEWS", summary: "", source: "Wire", at: "",
        url: "https://example.com/x" }] }); };
      const p = board.find((x) => x.pos !== "DST");
      delete PLAYER_STATS[p.id].x;              // not in the crosswalk
      window.__unlinked = p.name;
    });

    const name = await page.evaluate(() => window.__unlinked);
    await openSheet(page, name.split(" ").pop());
    await openNewsTab(page);

    const r = await page.evaluate((src) => {
      const panel = eval(src);
      return { asked: window.__asked, text: panel ? panel.innerText : "" };
    }, PANEL);

    expect(r.asked, "the provider is never asked without an id").toBe(0);
    expect(r.text, "and nobody else's news is shown").not.toContain("SOMEBODY ELSE");
  });

  test("the panel does not survive into the next player's sheet", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await start(page);
    await crosswalk(page, "Jahmyr Gibbs");

    /* What the legacy sheet's hidden tab was protecting against. There the
       tab itself was revealed and re-hidden per player; here the tab is
       always offered and it is the *contents* that must reset, or one
       player's headlines appear under another's name - which is worse than
       an empty panel, not better, because the reader has no way to know. */
    await page.evaluate(() => {
      Live.news = (id) => Promise.resolve({ configured: true, items:
        id === "T-TEST-1"
          ? [{ title: "GIBBS ONLY", summary: "", source: "Wire", at: "",
               url: "https://example.com/g" }]
          : [] });
    });

    await openSheet(page, "Gibbs");
    await openNewsTab(page);
    const withNews = await page.evaluate((src) => (eval(src) || {}).innerText || "", PANEL);
    expect(withNews, "the linked player has his headline").toContain("GIBBS ONLY");

    // Somebody with no crosswalk id at all.
    const other = await page.evaluate(() => {
      const p = board.find((x) => x.pos !== "DST" && x.name !== "Jahmyr Gibbs");
      delete PLAYER_STATS[p.id].x;
      return p.name;
    });
    await openSheet(page, other.split(" ").pop());
    await openNewsTab(page);

    const after = await page.evaluate((src) => (eval(src) || {}).innerText || "", PANEL);
    expect(after, "and the next player does not inherit it").not.toContain("GIBBS ONLY");
  });

  test("a failed fetch leaves no mark on the sheet", async ({ context }) => {
    const page = await openApp(context, "#/draft-room");
    await start(page);
    await crosswalk(page, "Puka Nacua");

    /* It fails by disappearing - the score strip's contract, and the second
       runtime dependency on somebody else's server. Never throws, never
       blocks a render, never leaves a gap. The catch is the contract rather
       than politeness: a rejected promise here surfaces as an unhandled
       rejection on a page that is otherwise fine. */
    await page.evaluate(() => {
      if (typeof newsCache !== "undefined") newsCache.clear();
      window.__unhandled = 0;
      window.addEventListener("unhandledrejection", () => { window.__unhandled++; });
      Live.news = () => Promise.reject(new Error("offline"));
    });

    await openSheet(page, "Nacua");
    await openNewsTab(page);

    const r = await page.evaluate((src) => {
      const panel = eval(src);
      const root = document.getElementById("draftroom-root");
      return {
        links: panel ? panel.querySelectorAll("a[target=_blank]").length : 0,
        unhandled: window.__unhandled,
        tabs: [...root.querySelectorAll("button")].map((b) => b.textContent.trim())
          .filter((t) => ["Our Read", "Projections", "Latest News"].includes(t)),
      };
    }, PANEL);

    expect(r.links, "no headlines").toBe(0);
    expect(r.unhandled, "and no unhandled rejection on an otherwise fine page").toBe(0);
    expect(r.tabs, "the sheet is unharmed and still complete")
      .toEqual(expect.arrayContaining(["Our Read", "Projections", "Latest News"]));
  });
});
