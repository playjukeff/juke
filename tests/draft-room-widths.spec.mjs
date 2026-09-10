/* The live DESKTOP draft room, at the width where its layout is tightest.
 *
 * ---- Why 1024 and not just "a phone width" ----
 *
 * phone.spec.mjs already sweeps #draftroom-root across all four phone tabs
 * and the profile overlay, and no-sideways-leak.spec.mjs walks the ten guest
 * ROUTES. Neither reaches this screen: a live draft is not a route, and the
 * desktop room is a different tree from the phone one.
 *
 * 1024 is the interesting width because it is where `lg:` turns ON, and this
 * room's chrome is gated on it — the 62px cockpit bar is `hidden lg:grid`
 * once a draft is live. So 1024 is simultaneously the narrowest width the bar
 * ever renders at AND the width where every roomy `lg:` variant switches on.
 * Whatever extra room lg buys, lg also spends.
 *
 * Both defects this file was written for lived only there. 1440 is clean,
 * 900/768/700 are clean (a different, simpler layout), and 1024 had seven
 * leaks. That is CLAUDE.md's own "a narrow BOX is not a narrow viewport",
 * with the box narrow at ONE viewport rather than at the small ones.
 *
 * 1440 runs as the control: without it, a fix that broke the wide case to
 * mend the narrow one would pass.
 */
import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

/* The condition, and it is not `scrollWidth > clientWidth` — that reports
   every correctly ellipsised label as a fault. A leak is an element wider
   than its box that can neither scroll nor ellipsise nor clip.

   Kept byte-identical to phone.spec.mjs's sweepOverflow(), including the dpr
   slack and the absolute-decoration exemption, so the two sweeps cannot
   disagree about what a leak IS. If one is corrected, correct both. */
function sweepOverflow() {
  const slack = window.devicePixelRatio > 1 ? 2 : 1;
  const leaks = [];
  document.querySelectorAll("#draftroom-root *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (el.scrollWidth <= el.clientWidth + slack) return;
    if (el.tagName === "INPUT") return;
    const c = getComputedStyle(el);
    if (/auto|scroll/.test(c.overflowX)) return;
    if (c.textOverflow === "ellipsis" && c.overflow !== "visible") return;
    if (c.overflow === "hidden" || c.overflowX === "hidden") return;
    const spill = [...el.children].filter(
      (k) => k.getBoundingClientRect().right > el.getBoundingClientRect().right + slack);
    if (spill.length > 0 && spill.every((k) => getComputedStyle(k).position === "absolute")) return;
    leaks.push(el.tagName + "." + String(el.className).slice(0, 60) + " over=" + (el.scrollWidth - el.clientWidth)
      + ' "' + (el.innerText || "").slice(0, 40).split("\n").join(" ") + '"');
  });
  return leaks;
}

for (const width of [1024, 1440]) {
  test(`the desktop draft room holds together at ${width}`, async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await openApp(context, "#/rooms/draft");
    await startSoloDraft(page);
    await page.waitForFunction(() => typeof state === "object" && state.started, null, { timeout: 30000 });

    /* stopSim() first, for board-card.spec.mjs's reason: startDraft() ends in
       runCPUs(), and a board still drafting between tabs is a sweep whose
       results are not comparable across them. The picks then run in this same
       synchronous turn. Thirty is enough to fill the pill, the ticker and a
       few rounds of the board. */
    await page.evaluate(() => {
      stopSim();
      for (let i = 0; i < 30; i++) { const c = onTheClock(); if (c) makePick(cpuChoice(c.slot, c.round)); }
      render();
    });
    await page.evaluate((fn) => { window.__sweep = new Function("return (" + fn + ")()"); },
      sweepOverflow.toString());

    const found = {};
    for (const label of ["Players", "Board", "Decide", "Analysis"]) {
      const clicked = await page.evaluate((l) => {
        const root = document.getElementById("draftroom-root");
        const btn = [...root.querySelectorAll("button")]
          .find((b) => b.textContent.trim() === l && b.getBoundingClientRect().height > 0);
        if (!btn) return false;
        btn.click();
        return true;
      }, label);
      expect(clicked, `the ${label} tab is reachable at ${width}`).toBe(true);
      await page.waitForTimeout(400);
      found[label] = await page.evaluate(() => window.__sweep());
    }
    for (const [label, leaks] of Object.entries(found)) {
      expect(leaks, `${label} at ${width}: overflows that can neither scroll nor ellipsise`).toEqual([]);
    }

    /* And the reader-visible half of it, asserted directly rather than left to
       the generic condition above.
     *
     * The cockpit bar is `1fr auto 1fr` with the pick pill dead-centre, so the
     * left cell is capped at (bar - pill)/2 however much the right cell leaves
     * unused. When the left block outgrows that cap nothing clips it — the tab
     * nav simply paints over the pill, which is the one thing on the bar that
     * says whose turn it is. Measured at 96px of overlap on Decide at 1024.
     *
     * Decide is the tab to ask on: hidePill empties the centre column on
     * Players and Board, so those two never showed it and a single-tab check
     * would have reported the bar clean. */
    await page.evaluate(() => {
      const root = document.getElementById("draftroom-root");
      [...root.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Decide" && b.getBoundingClientRect().height > 0).click();
    });
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => {
      const el = [...document.querySelectorAll("#draftroom-root header, #draftroom-root div")]
        .find((d) => /h-\[62px\]/.test(d.className) && d.getBoundingClientRect().height > 40);
      if (!el || el.children.length < 2) return null;
      const nav = el.children[0].querySelector("nav");
      const pill = el.children[1].getBoundingClientRect();
      return { navRight: nav ? Math.round(nav.getBoundingClientRect().right) : null,
               pillLeft: Math.round(pill.left) };
    });
    expect(bar, `the cockpit bar renders at ${width}`).not.toBeNull();
    expect(bar.navRight, "the bar draws its tab nav").not.toBeNull();
    expect(bar.navRight, `the tab nav does not paint over the pick pill at ${width}`)
      .toBeLessThanOrEqual(bar.pillLeft);

    await context.close();
  });
}
