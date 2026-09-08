/* Your Insights — the four-view panel that replaced the analytics grid.

   Every one of these drives the real page against real history: the drafts
   are run through engine.startDraft()/autoDraftRest(), so `entry.picks` is a
   room the CPU actually drafted rather than a fixture, and the numbers the
   panel prints are the ones app.js's section 11d2 derives from it. A
   synthetic history would test the renderer and nothing about the audit,
   which is where every defect in this feature has been.

   The seeding is fourteen mocks and takes about four seconds — measured, and
   the reason it is done once per test rather than in a fixture is that a
   fixture would have to share a browser context, and the locker is
   localStorage. */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

// The same shape the seeded set has to have for view 03 and view 04 to say
// anything: more than one format, more than one seat, and at least one cell
// with three mocks in it so the coverage grid has all three of its states.
const PLAN = [
  { teams: 10, scoring: "half", seat: 9 },
  { teams: 10, scoring: "half", seat: 9 },
  { teams: 10, scoring: "half", seat: 9 },
  { teams: 10, scoring: "half", seat: 0 },
  { teams: 10, scoring: "half", seat: 0 },
  { teams: 10, scoring: "ppr", seat: 2 },
  { teams: 10, scoring: "ppr", seat: 2 },
  { teams: 10, scoring: "ppr", seat: 1 },
  { teams: 10, scoring: "ppr", seat: 3 },
  { teams: 10, scoring: "half", seat: 6 },
  { teams: 10, scoring: "half", seat: 7 },
  { teams: 10, scoring: "standard", seat: 8 },
  { teams: 10, scoring: "half", seat: 4 },
  { teams: 10, scoring: "half", seat: 5 },
];

async function seedHistory(page) {
  await page.waitForFunction(() => window.JukeEngine && window.JukeEngine.dataReady(), null, { timeout: 30000 });
  await page.evaluate((plan) => {
    const e = window.JukeEngine;
    for (const p of plan) {
      e.setLeague({ teams: p.teams, scoring: p.scoring });
      if (e.setupProblem()) throw new Error(e.setupProblem());
      e.startDraft({ mySlot: p.seat });
      e.autoDraftRest();
    }
  }, PLAN);
  // Back to a clean route: the last autoDraftRest() leaves state.started true
  // and the Draft Room showing its own report, which is not the screen under
  // test. A reload is what a person pressing "Back to the locker" and then
  // returning would produce, minus the clicks.
  await page.evaluate(() => { location.hash = "#/rooms/draft"; });
  await page.reload();
  await page.waitForFunction(() => typeof state === "object" && window.JukeEngine, null, { timeout: 30000 });
  await page.waitForFunction(() => window.JukeEngine.dataReady(), null, { timeout: 30000 });
}

async function openInsights(page) {
  const btn = page.locator('#draftroom-root button:text-is("Your insights")');
  await btn.waitFor({ timeout: 20000 });
  await btn.click();
  await page.locator("[data-ins-deal]").waitFor({ timeout: 20000 });
}

function view(page, key) {
  return page.locator(`[data-ins-view="${key}"]`);
}

test("the panel draws four views, and every one of them has content", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);
  await openInsights(page);

  const report = await page.evaluate(() => window.JukeEngine.insightsReport());
  expect(report.ready, "fourteen mocks is past the gate").toBe(true);
  expect(report.mocks).toBe(PLAN.length);

  for (const key of ["left", "leverage", "field", "trust"]) {
    await view(page, key).click();
    const head = page.locator("[data-ins-deal] section h3");
    await expect(head).toHaveText(report.views[key].title);
    // The content region, not the header: a view that renders its own title
    // and nothing under it is the empty-panel failure this page is least
    // allowed to have, since its whole subject is whether there is enough
    // to say.
    const body = await page.evaluate(() => {
      const el = document.querySelector("[data-ins-body]");
      return (el ? el.innerText : "").trim().length;
    });
    expect(body, `view ${key} has a body`).toBeGreaterThan(120);
  }
  await context.close();
});

test("selecting a mock re-derives the table, and a change of view forgets it", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);
  await openInsights(page);

  const sub = page.locator("[data-ins-deal] section h3 + p");
  const featured = await sub.textContent();

  // The third bar, which is a different mock at a different seat from the
  // featured one — the bars are aria-pressed buttons, and the pressed one is
  // the mock the table is about.
  await page.locator('[data-ins-deal] [role="button"][aria-pressed]').nth(2).click();
  const picked = await sub.textContent();
  expect(picked, "the sub-line names the mock that was clicked").not.toBe(featured);

  /* And it is cleared on the way out, which is the handoff's own rule and is
     the leak DraftRoom.jsx already records twice under its own name: this
     component does not unmount between views, so a mock left selected would
     have view 01 open weeks later on a draft nobody chose this visit. */
  await view(page, "trust").click();
  await view(page, "left").click();
  await expect(sub).toHaveText(featured);
  await context.close();
});

test("no kicker or defense is ever named as the value you left on the board", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);
  await openInsights(page);

  /* Withholding has to be complete or it is worse than not withholding.
     overallScore() answers null for K and DST because three seasons of
     backtesting put their projected order at r 0.37, -0.09 and 0.57, and a
     page that dashes a kicker's Juke score and then tells you to have taken
     one over a running back has told the reader to distrust a number and
     then argued from it.

     Asked of every mock rather than of the one on screen: the filter is in
     the audit, so a regression would be silent on any draft that happened
     not to leave a kicker at the top of the board. */
  const named = await page.evaluate(() => {
    const e = window.JukeEngine;
    const report = e.insightsReport();
    const out = [];
    report.bars.forEach((bar) => {
      e.insightsMock(bar.id).picks.forEach((p) => {
        if (p.best && (p.best.pos === "K" || p.best.pos === "DST")) out.push(bar.n + " " + p.code + " " + p.best.name);
      });
    });
    return out;
  });
  expect(named, "K and DST are valued, never recommended").toEqual([]);

  // The other half of the same rule: your own kicker still counts for what he
  // scored, so a K or DST pick is priced rather than skipped. If this ever
  // came back empty the audit would have started dropping picks instead of
  // refusing to recommend them, which is a different and much larger bug.
  const priced = await page.evaluate(() => {
    const e = window.JukeEngine;
    const report = e.insightsReport();
    return report.bars.some((bar) =>
      e.insightsMock(bar.id).picks.some((p) => p.you.pos === "K" || p.you.pos === "DST"));
  });
  expect(priced, "your own kicker is still on the table").toBe(true);
  await context.close();
});

test("the total reconciles against the rows under it", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);
  await openInsights(page);

  /* The one arithmetic check on this page, and it is the one CLAUDE.md's
     grade section asks for by name: reconcile a total against its own parts,
     because a headline that disagrees with the rows beneath it is the shape
     of bug no renderer test can see. Rounding is per-row and the total is
     rounded once, so the tolerance is the row count. */
  const bad = await page.evaluate(() => {
    const e = window.JukeEngine;
    const report = e.insightsReport();
    return report.bars
      .map((bar) => {
        const m = e.insightsMock(bar.id);
        const sum = m.picks.reduce((a, p) => a + p.delta, 0);
        return Math.abs(sum - m.total) > m.picks.length ? { n: m.n, sum, total: m.total } : null;
      })
      .filter(Boolean);
  });
  expect(bad).toEqual([]);
  await context.close();
});

test("a pick with no alternative shows a dash, not a number from another comparison", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);
  await openInsights(page);

  /* The win column answers exactly one question. The engine also carries a
     runner-up swing for the picks where you took the top of the board — that
     is a comparison against the next player at your OWN position, and it has
     its own card on view 02. Printed in this column it would be a second
     quantity under one heading, which is the right-value-wrong-column bug
     this project shipped once already in a standings table. */
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-pick-row]")].map((row) => ({
      best: row.querySelector("[data-pick-best]").dataset.pickBest,
      win: row.querySelector("[data-pick-win]").innerText.trim(),
    })));
  expect(rows.length, "the pick table rendered").toBeGreaterThan(5);
  const wrong = rows.filter((r) => r.best === "none" && r.win !== "—");
  expect(wrong, "no alternative means no swing").toEqual([]);
  await context.close();
});

test("nothing on the panel overflows in a way it can neither scroll nor ellipsise", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/rooms/draft");
  await seedHistory(page);

  /* Both widths, mounted fresh at each. The handoff is authored at a fixed
     1480px and says so; this page is reachable from the entry screen's "Your
     insights" at every width, so the phone layout is the half most likely to
     be wrong and the half nobody was going to look at.

     The rule is CLAUDE.md's own: an element wider than its box is only a bug
     when it can do neither of the two legal things about it. `overflow:
     hidden` counts as a third, for the sweep layer the design deliberately
     clips. */
  const sweep = () =>
    page.evaluate(() => {
      const root = document.querySelector("[data-ins-deal]");
      const out = [];
      root.querySelectorAll("*").forEach((el) => {
        const cs = getComputedStyle(el);
        const over = el.scrollWidth - el.clientWidth;
        if (over <= 2) return;
        if (["auto", "scroll", "hidden"].includes(cs.overflowX)) return;
        if (cs.textOverflow === "ellipsis" && cs.overflow !== "visible") return;
        out.push(String(el.className).slice(0, 60) + " :: " + over);
      });
      return { over: out, body: document.body.scrollWidth - document.body.clientWidth };
    });

  for (const size of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await page.reload();
    await page.waitForFunction(() => window.JukeEngine && window.JukeEngine.dataReady(), null, { timeout: 30000 });
    await openInsights(page);
    for (const key of ["left", "leverage", "field", "trust"]) {
      await view(page, key).click();
      const res = await sweep();
      expect(res.over, `${size.width}px, view ${key}`).toEqual([]);
      expect(res.body, `${size.width}px, the page itself`).toBeLessThanOrEqual(0);
    }
  }
  await context.close();
});
