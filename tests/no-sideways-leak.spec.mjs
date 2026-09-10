/* No screen leaks sideways.
 *
 * The condition is this project's own, and it is NOT
 * `scrollWidth > clientWidth`: that reports every correctly ellipsised
 * label as a fault -- a 123px team name in a 74px cell with
 * `text-overflow: ellipsis` is behaving perfectly. What is a leak is an
 * element wider than its box that can neither **scroll** nor
 * **ellipsise** nor **clip**.
 *
 * ---- Why this exists rather than being left to a sweep somebody runs ----
 *
 * The class has shipped twice, both times as a few pixels of a transform
 * nobody had budgeted for, and both times nothing was visibly clipped:
 *
 *   - the board card's `Arrow`, a 1em square whose glyph laid out 12x19,
 *     so `rotate(90deg)` turned 19px of height into 19px of width inside
 *     a 14px box and 3px landed past the row's content edge;
 *   - `DraftRoomEntry`'s four position tiles, a 98px grid at
 *     `rotate(-6deg)` painting 107px, bleeding ~4.5px each side because a
 *     transform does not change layout and `shrink-0` never gives it back.
 *
 * Both were found by somebody sweeping by hand, months apart. A leak that
 * lands somewhere harmless today is still a leak -- the rule is stated
 * without reference to where the bleed happens to land -- and four pixels
 * is exactly the size nobody notices until the box moves.
 *
 * ---- Guest routes on purpose ----
 *
 * Every connected surface needs a stub and a keyless build renders the
 * signed-out fallback, which `league-connect.spec.mjs` already records.
 * These ten are what a visitor with no account sees, they need no fixture,
 * and they run against production unchanged.
 */
import { test, expect } from "@playwright/test";
import { SITE } from "./helpers.mjs";

const ROUTES = [
  "#/",
  "#/rooms",
  "#/rooms/draft",
  "#/drafts",
  "#/you",
  "#/my-league",
  "#/rooms/waiver",
  "#/rooms/trade",
  "#/rooms/strategy",
  "#/rooms/prospect",
];

/* The one route `applyRoute()` hides `#view-home` for is `#/rooms/draft`,
   which renders into `#draftroom-root` and mounts its own shell. A sweep
   that looks in `#view-home` there is reading a hidden container and
   reports nothing wrong -- which is exactly what the first version of this
   did, on the screen that turned out to carry the defect. */
const SWEEP = () => {
  const home = document.querySelector("#view-home");
  const shown = home && getComputedStyle(home).display !== "none";
  const root = shown ? home : document.querySelector("#draftroom-root");
  if (!root) return [{ tag: "NO ROOT", over: 0, text: "" }];
  const bad = [];
  for (const el of root.querySelectorAll("*")) {
    /* 2px of slack: `sweepOverflow()`'s own allowance for subpixel
       rounding at dpr > 1. The two real findings measured 3 and 4, and
       both were confirmed real by NOT moving with the device pixel ratio
       -- subpixel rounding changes with the subpixel grid and a genuine
       overflow does not. */
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 2) continue;
    const cs = getComputedStyle(el);
    if (/auto|scroll/.test(cs.overflowX)) continue;
    if (cs.textOverflow === "ellipsis" && cs.whiteSpace === "nowrap") continue;
    if (cs.overflow === "hidden" || cs.overflowX === "hidden") continue;
    bad.push({
      tag: el.tagName + "." + String(el.className).slice(0, 60),
      over,
      text: (el.innerText || "").slice(0, 40).split("\n").join(" "),
    });
  }
  return bad;
};

/* Both widths, and the second one is not the phone check.

   `<BarRow>` was clipped at 1440 as well as at 375, in a 360px rail -- so a
   guard written only at phone width would have gone green on the defect
   that had actually shipped. A narrow box is not the same thing as a narrow
   viewport. */
for (const width of [1440, 375]) {
  test(`no screen leaks sideways at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const found = [];
    for (const route of ROUTES) {
      await page.goto(SITE + "/" + route);
      /* A condition, never a duration. A flat wait reads a room
         mid-skeleton and finds nothing wrong on a screen that has not
         drawn yet. */
      await page.waitForFunction(
        () =>
          window.JukeEngine &&
          window.JukeEngine.dataReady &&
          window.JukeEngine.dataReady() &&
          document.querySelectorAll(".animate-pulse").length === 0,
        null,
        { timeout: 30000 }
      );
      await page.waitForTimeout(300);

      const leaks = await page.evaluate(SWEEP);
      for (const l of leaks) found.push(`${route} ${l.tag} over=${l.over} "${l.text}"`);

      /* And the page itself, which is the reader-visible half of the same
         question: a leak that reaches the document is a horizontal
         scrollbar on a screen that should not have one. */
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(sideways, `${route} scrolls sideways at ${width}`).toBe(false);
    }
    expect(found, `elements that overflow and can neither scroll nor ellipsise`).toEqual([]);
  });
}
