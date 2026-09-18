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
  document.querySelectorAll("#view-home *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (el.scrollWidth <= el.clientWidth + slack) return;
    if (el.tagName === "INPUT") return;
    const c = getComputedStyle(el);
    if (/auto|scroll/.test(c.overflowX)) return;
    if (c.textOverflow === "ellipsis" && c.overflow !== "visible") return;

    /* Visually-hidden text is not a leak, and cannot be one.

       An `sr-only` span is 1px square with its content clipped away — the
       standard screen-reader-only recipe — so it "overflows its box" by
       construction, by however long the sentence is: this sweep reported
       `SPAN.sr-only over=109` and `P.sr-only over=373` on a cockpit where
       nothing was wrong. No sighted reader can reach that text because no
       sighted reader can see it, which is the opposite of the question
       being asked here.

       Exempted by the property that hides it rather than by the class
       name: anything clipped to nothing is invisible whatever it is
       called, and a class allow-list would miss the next helper that does
       the same thing under another name. */
    const clipped = c.clipPath === "inset(50%)" || /rect\(0px,\s*0px,\s*0px,\s*0px\)/.test(c.clip);
    if (clipped && b.width <= 2 && b.height <= 2) return;
    if (/hidden|clip/.test(c.overflow) || /hidden|clip/.test(c.overflowX)) return;
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
    const page = await openApp(context, "#/draft");
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

    /* Pool / Board / Grade, which is what the cockpit's views are called
       since the cutover — they were Players / Board / Decide / Analysis.
       Found through the tablist rather than by matching a label, because
       each tab's accessible name carries its own keyboard shortcut ("Pool
       p"), so an exact-match on the word finds nothing while the cockpit
       sits there rendered. Same trap, and the same answer, as the shared
       openBoardView() helper. */
    const found = {};
    const tabs = await page.getByRole("tab").all();
    expect(tabs.length, `the cockpit draws its views at ${width}`).toBeGreaterThan(2);
    for (const tab of tabs) {
      const label = (await tab.textContent()).trim();
      await tab.click();
      await page.waitForTimeout(400);
      found[label] = await page.evaluate(() => window.__sweep());
    }
    for (const [label, leaks] of Object.entries(found)) {
      expect(leaks, `${label} at ${width}: overflows that can neither scroll nor ellipsise`).toEqual([]);
    }

    /* And the reader-visible half of it, asserted directly rather than
       left to the generic condition above.

       ---- What this measured, and why the subject is gone ----

       Production's cockpit bar was a `1fr auto 1fr` grid with the pick
       pill dead-centre, so the left cell could never exceed (bar - pill)/2
       however much the right cell left unused. When the left block outgrew
       that cap nothing clipped it — the tab nav simply painted over the
       pill, which is the one thing on the bar saying whose turn it is.
       Measured at 96px of overlap at 1024.

       v3's header is a flex ROW, and LiveHeader.jsx's own comment says it
       is a row BECAUSE of that bug. So the grid this test was written
       against is retired by design rather than by drift, and the tab nav
       is not in the header at all any more.

       What survives is the contract that replaced it, stated in the same
       comment: "the left block shrinks and truncates, the pick block never
       does". That is the same reader-visible property the old assertion
       protected — the thing that says whose turn it is stays whole — so it
       is what is asserted here, at both widths, against the two blocks
       themselves rather than against a nav that has moved. */
    const bar = await page.evaluate(() => {
      const row = [...document.querySelectorAll("#view-home div")]
        .find((d) => /h-\[68px\]/.test(String(d.className)) && d.getBoundingClientRect().height > 40);
      if (!row || row.children.length < 2) return null;
      const left = row.children[0].getBoundingClientRect();
      const pick = row.children[row.children.length - 1];
      const r = pick.getBoundingClientRect();
      return {
        leftRight: Math.round(left.right),
        pickLeft: Math.round(r.left),
        /* The pick block carries `shrink-0`, so "never truncates" is a
           claim about its own content fitting rather than about where it
           sits. Both are read, because a block can sit clear of its
           neighbour and still have its own text cut. */
        pickClipped: pick.scrollWidth > pick.clientWidth + 1,
        says: (pick.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)
      };
    });

    expect(bar, `the draft header renders at ${width}`).not.toBeNull();
    expect(bar.leftRight, `the league block does not run into the pick block at ${width}`)
      .toBeLessThanOrEqual(bar.pickLeft);
    expect(bar.pickClipped, `and the pick block is not truncated at ${width}`).toBe(false);
    expect(bar.says.length, "the pick block says something").toBeGreaterThan(0);

    await context.close();
  });
}
