/* The draft room header.

   It was the mark, a status line, a pick line, a counter and the theme
   toggle. What it did not say was the way out — a logo in the corner is the
   exit only to somebody who already knows that — or what draft this is, which
   was on the setup screen and the setup screen folds away the moment you
   start.

   The load-bearing test here is the last one. The sound button was given the
   class `theme-toggle` to inherit its look, and that class is not a style: it
   is what themeBtns() selects, what syncThemeButton() writes aria-pressed
   onto, and what the delegated click handler switches the theme on. So the
   new button loaded showing "on" it had never been given, and pressing it
   would have changed the theme. Exactly the collision this project already
   has a rule about — .home was taken, .avatar was taken, initials() was taken
   — except this one hid in behaviour rather than in appearance, so reading
   the stylesheet for the name would not have found it.
*/

import { test, expect } from "@playwright/test";
import { openApp, clickHidden } from "./helpers.mjs";

async function startDraft(page) {
  /* The board has to have LANDED before the button is pressed.
   *
   * setupProblem() refuses a draft while players.js and stats.js are still
   * in flight -- they are deferred behind the cold-load reveal -- and
   * startDraft() reads that refusal and returns without starting anything.
   * The click succeeds, nothing happens, and the assertion below fails as
   * "draft started: false", which names neither the board nor the reason.
   *
   * This is the third place in this suite to need the same wait: createRoom()
   * and startPhoneDraft() both learned it earlier, each after a red run that
   * read as a broken product. It goes stale as a flat sleep because the wait
   * is on a CONDITION -- how long the deferred files take is a property of
   * the connection, not a number.
   */
  await page.waitForFunction(
    () => typeof dataReady === "function" && dataReady(),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    document.querySelectorAll("details.setupbox").forEach((d) => (d.open = true));
    document.getElementById("startBtn").click();
  });
  /* Wait for the thing being asserted rather than for 300ms and hoping.
     startDraft() is synchronous once the board is there, so this settles
     immediately in the healthy case and reports honestly in the slow one. */
  await page.waitForFunction(() => state.started, null, { timeout: 15000 })
    .catch(() => {});
  expect(await page.evaluate(() => state.started), "draft started").toBe(true);
}

test.describe("the draft room header", () => {
  test("says what draft this is, from the one place that knows",
    async ({ context }) => {
      const page = await openApp(context);
      await startDraft(page);

      const r = await page.evaluate(() => ({
        shown: document.getElementById("leagueLabel").textContent.trim(),
        truth: leagueSummary(),
        pick: document.getElementById("pickText").textContent.trim(),
        // Before a draft there is no pick line at all, and the summary rides
        // on it — the setup screen is showing the controls themselves.
        hiddenAtSetup: (() => {
          const was = state.started;
          return was;
        })()
      }));

      expect(r.shown, "the summary is leagueSummary(), not a second copy").toBe(r.truth);
      expect(r.shown, "and it is the real league").toContain(String(10));
      expect(r.pick).toMatch(/^Pick \d+\.\d\d \(\d+ Overall\)$/);
    });

  test("the way out is a control that says so", async ({ context }) => {
    const page = await openApp(context);
    await startDraft(page);

    const r = await page.evaluate(() => {
      const home = document.getElementById("homeBtn");
      return {
        label: home.getAttribute("aria-label"),
        chevron: !!home.querySelector(".i-back"),
        // One control, not two ways out competing in a 390px header.
        buttons: document.querySelectorAll(".appbar .home").length
      };
    });
    expect(r.chevron, "there is a back chevron").toBe(true);
    expect(r.buttons).toBe(1);
    expect(r.label).toMatch(/leave|back/i);

    await clickHidden(page, "homeBtn");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => location.hash), "and it leaves").not.toContain("draft");
  });

  test("the sound toggle is its own control and does not touch the theme",
    async ({ context }) => {
      const page = await openApp(context);
      await startDraft(page);

      const before = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        sound: document.getElementById("soundBtn").getAttribute("aria-pressed"),
        themeBtn: document.getElementById("themeBtn").getAttribute("aria-pressed")
      }));

      /* Off until asked for. It loaded reading "on" when it shared a class
         with the theme toggle, because syncThemeButton() writes the *theme's*
         state onto everything it selects. */
      expect(before.sound, "sound is off until somebody asks for it").toBe("false");

      await clickHidden(page, "soundBtn");
      await page.waitForTimeout(150);

      const after = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        sound: document.getElementById("soundBtn").getAttribute("aria-pressed"),
        themeBtn: document.getElementById("themeBtn").getAttribute("aria-pressed"),
        stored: localStorage.getItem("draftroom.sound")
      }));

      expect(after.sound, "it turned on").toBe("true");
      expect(after.stored, "and it is remembered").toBe("on");
      expect(after.theme, "the theme did not move").toBe(before.theme);
      expect(after.themeBtn, "nor did the theme button").toBe(before.themeBtn);

      // And the theme toggle still works, which the shared class also risked.
      await clickHidden(page, "themeBtn");
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        sound: document.getElementById("soundBtn").getAttribute("aria-pressed")
      }));
      expect(t.theme, "the theme moved").not.toBe(before.theme);
      expect(t.sound, "and sound stayed where it was put").toBe("true");
    });

  test("nothing in the header is cut off at a phone's width", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openApp(context);
    await startDraft(page);

    /* The sound button is new and costs about 42px of a 390px header, which
       is enough to start slicing "You're on the clock!" — the most important
       sentence in the app — through a letter. The mark comes off below 560
       and the spacing tightens with it.

       scrollWidth > clientWidth is what correct truncation looks like too, so
       this asks about the elements that must never truncate rather than about
       every element on the bar. */
    const r = await page.evaluate(() => {
      const cut = (el) => el.scrollWidth > el.clientWidth + 1;
      return {
        status: cut(document.getElementById("statusLine")),
        pick: cut(document.getElementById("pickText")),
        /* getComputedStyle, not offsetParent. The mark is an <svg>, and an
           SVG element has no offsetParent at all — the property is undefined
           rather than null, so `!== null` is true for a shape that is not
           being drawn, and the check passes against a header that still has
           the mark in it. */
        markShown: getComputedStyle(document.querySelector(".appbar .mark")).display !== "none",
        // The league summary is reference rather than state, so it is the one
        // that stands down first.
        leagueShown: document.getElementById("leagueLabel").offsetParent !== null,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });

    expect(r.status, "the headline finishes its own sentence").toBe(false);
    expect(r.pick, "and so does the pick line").toBe(false);
    expect(r.markShown, "the mark stands down below 560").toBe(false);
    expect(r.leagueShown, "and so does the league summary").toBe(false);
    expect(r.overflow, "the header does not leak sideways").toBe(false);
    await context.close();
  });

  /* The score bug. Three properties, and each one was a real mistake in the
     prototype before it was a test. */

  test("the pick is the fact and the state is the label", async ({ context }) => {
    const page = await openApp(context);
    await startDraft(page);

    const r = await page.evaluate(() => {
      const h1 = document.querySelector(".appbar-text h1");
      const p  = document.querySelector(".appbar-text p");
      const px = (el) => parseFloat(getComputedStyle(el).fontSize);
      return {
        label: px(h1), fact: px(p),
        labelUpper: getComputedStyle(h1).textTransform,
        factTabular: getComputedStyle(p).fontVariantNumeric
      };
    });

    /* The inversion is the whole point: the header used to lead with "You're
       on the clock!" at 16px and bury the pick at 12px, which is the largest
       type on the bar saying what the colour already said. */
    expect(r.fact, "the pick number outsizes the state label").toBeGreaterThan(r.label);
    expect(r.labelUpper, "and the label is a label").toBe("uppercase");
    expect(r.factTabular, "a clock-adjacent number does not wobble").toContain("tabular-nums");
    await context.close();
  });

  test("the segment rule survives all three grounds", async ({ context }) => {
    const page = await openApp(context);
    await startDraft(page);

    const r = await page.evaluate(() => {
      /* A frozen transition reports the value a property is moving *from*,
         and .appbar transitions colour — so this measures nothing at all
         without killing them first. That is not hypothetical: it produced a
         2.93 and a 1.01 on a header that was perfectly legible. */
      const kill = document.createElement("style");
      kill.textContent = "*{transition:none !important}";
      document.head.appendChild(kill);

      const seg = () => getComputedStyle(document.querySelector(".appbar-text")).borderRightColor;
      const bar = document.getElementById("appbar");

      /* A draft opens on your own turn, so the bar is already .my-turn here
         and both "resting" readings come back as the coloured rule — which is
         how the first version of this test failed: it was measuring one
         ground three times and calling it three grounds. Strip the state
         before reading the resting ones. */
      bar.classList.remove("my-turn", "urgent");

      const dark = seg();
      document.documentElement.setAttribute("data-theme", "light");
      const light = seg();
      document.documentElement.removeAttribute("data-theme");

      bar.classList.add("my-turn");
      const turn = seg();
      bar.classList.remove("my-turn");

      kill.remove();
      return { dark, light, turn };
    });

    /* The first build used a flat rgba(255,255,255,.16): right on the two
       gradients, invisible on the resting card and invisible in light. The
       token has to actually differ per ground, so assert that it does. */
    expect(r.dark, "resting dark and resting light are not the same rule").not.toBe(r.light);
    expect(r.turn, "and the coloured state gets its own").not.toBe(r.dark);
    for (const v of [r.dark, r.light, r.turn]) {
      expect(v, "and none of them is fully transparent").not.toMatch(/,\s*0\)$/);
    }
    await context.close();
  });

  test("nothing in the bar is washed out with opacity", async ({ context }) => {
    const page = await openApp(context);
    await startDraft(page);

    const r = await page.evaluate(() => {
      const bar = document.getElementById("appbar");
      bar.classList.add("my-turn");
      const out = [...bar.querySelectorAll(".appbar-text h1, .appbar-text p, .count-label, .appbar-league")]
        .map((e) => ({ cls: e.className || e.tagName, op: getComputedStyle(e).opacity,
                       col: getComputedStyle(e).color }));
      bar.classList.remove("my-turn");
      return out;
    });

    /* The most saturated surface in the app. At 12px the lightest end of the
       blue gradient gives pure white 4.64, so the minimum workable alpha is
       0.98 — there is no opacity that reads as secondary and stays legible.
       The prototype used .72 on the label and would have shipped the exact
       bug the contrast sweep was written to catch. */
    for (const el of r) {
      expect(el.op, `${el.cls} is not translucent on a coloured bar`).toBe("1");
      expect(el.col, `${el.cls} is solid white there`).toBe("rgb(255, 255, 255)");
    }
    await context.close();
  });
});
