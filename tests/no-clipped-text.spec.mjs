/* Text cut off with no way to read the rest of it.
 *
 * Reported from a phone, with a screenshot: the game page's hero drew
 * "Panthers" and "Falcons" either side of the kickoff line, and both club
 * names were cut off by it.
 *
 * ---- Why the two sweeps already here could not see it ----
 *
 * `no-sideways-leak.spec.mjs` and `phone.spec.mjs` both ask CLAUDE.md's own
 * question: does an element overflow AND can it neither scroll nor
 * ellipsise nor clip? `overflow: hidden` is an accepted OUTCOME in both —
 * "an element wider than its box is only a bug when it can neither scroll
 * nor ellipsise" — so a name cut mid-word under it passes them and always
 * would have.
 *
 * That exemption is right for what it was written about: a rotated glyph
 * hanging past its box, a badge at -bottom-1, the position solids' own
 * bleed. It is wrong for TEXT, because a clipped word is exactly as
 * unreachable as one that leaks off the side and rather more confusing --
 * a reader sees "Panther" and has no reason to think there is more.
 *
 * So this asks the narrower question: is there text that is cut, with no
 * ellipsis, no scroller, and nothing decorative to explain it?
 *
 * ---- What it exempts, and why each one is a real exemption ----
 *
 * - `sr-only`, found by its CLIP rather than by its class or its size:
 *   Tailwind's is a 1px square with `clip: rect(0,0,0,0)`, and the skip
 *   link adds padding on top, so it measures 25x33 and a 2px size test
 *   misses it. Its text is not on screen BY DESIGN.
 * - A box whose overflowing children are all absolutely positioned, which
 *   is phone.spec.mjs's own decoration rule, applied the same way: the
 *   game hero's club watermark is `-left-2` on purpose and `overflow-hidden`
 *   is what keeps it from spilling into the column beside it.
 */
import { test, expect } from "@playwright/test";
import { SITE, LOCAL_SITE, playerRoutes } from "./helpers.mjs";

const ROUTES = [
  "#/", "#/draft", "#/draft/insights", "#/players", "#/players/rookies",
  "#/league", "#/league/matchup", "#/record", "#/account",
  "#/calls/lineup", "#/calls/wire", "#/calls/trade", "#/method/how-it-works",
  "#/scores",
];

/* 320 as well as 375 and 1440: the reported bug is a phone bug, and the
   narrowest phone this project supports is where a fixed-width thing runs
   out of room first. sheet-reachable.spec.mjs already drives 320 for the
   same reason. 1440 is the control — two of the three defects this sweep
   found on its first run were at 1440 as well, so a phone-only sweep would
   have called the wide case clean. */
const WIDTHS = [1440, 390, 320];

const SWEEP = () => {
  const root = document.getElementById("view-home");
  const out = [];
  if (!root) return out;
  for (const el of root.querySelectorAll("*")) {
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.clipPath !== "none") continue;
    if (cs.clip !== "auto") continue;
    if (/auto|scroll/.test(cs.overflowX)) continue;
    if (cs.textOverflow === "ellipsis") continue;
    if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue;
    const eb = el.getBoundingClientRect();
    const kids = [...el.children].filter((k) => {
      const kb = k.getBoundingClientRect();
      return kb.right > eb.right + 1 || kb.left < eb.left - 1;
    });
    if (kids.length && kids.every((k) => getComputedStyle(k).position === "absolute")) continue;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push(`${el.tagName}.${String(el.className).slice(0, 34)} over=${over} "${text.slice(0, 40)}"`);
  }
  return [...new Set(out)];
};

test.skip(!LOCAL_SITE, "reads the built site");

for (const width of WIDTHS) {
  test(`no text is cut off with no way to read it at ${width}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${SITE}/index.html#/`);
    await page.waitForSelector("#view-home", { timeout: 20000 });
    await page.waitForFunction(() => !document.getElementById("boot-sonar"), null, { timeout: 15000 }).catch(() => {});

    /* Non-vacuous before anything is believed: a clean report is only
       evidence if a dirty one would have been reported, and this sweep is
       a walker over computed styles where one wrong predicate returns
       nothing at all. Planted, measured, removed. */
    const planted = await page.evaluate(() => {
      const el = document.createElement("div");
      el.style.cssText = "width:40px;overflow:hidden;white-space:nowrap;font-size:16px";
      el.textContent = "a name nobody can read the end of";
      document.getElementById("view-home").appendChild(el);
      return true;
    });
    expect(planted).toBe(true);
    expect((await page.evaluate(SWEEP)).length, "the sweep sees a planted clip").toBeGreaterThan(0);
    await page.evaluate(() => { document.getElementById("view-home").lastElementChild.remove(); });

    const routes = ROUTES.concat(await playerRoutes(page).catch(() => []));
    const found = [];
    for (const route of routes) {
      await page.evaluate((r) => { location.hash = r; }, route);
      await page.waitForTimeout(900);
      for (const hit of await page.evaluate(SWEEP)) found.push(`${route} ${hit}`);
    }
    await context.close();
    expect(found, "text clipped with no way to read it").toEqual([]);
  });
}
