/* The whole thing, once, the way a person does it.

   Every other spec in this suite starts somewhere convenient — a hash that
   opens the draft room, an engine call that starts a draft, a board driven by
   a loop. That is the right trade for a test about one behaviour, and it
   leaves exactly one thing uncovered: whether the *joins* work. A visitor
   arrives at the homepage, finds the room, sits down, drafts, and reads their
   grade, and no single test has ever walked that line end to end.

   It is deliberately shallow at every step. The board's contrast, the snake
   arithmetic, the grade's components and the room's seat rules each have a
   file of their own that goes deeper than this ever should. What this asks is
   only: does each screen hand you to the next one, and is what arrives at the
   end the same draft you started.

   So it presses real controls throughout. Where a helper would be quicker,
   that is precisely the thing not to do here — a journey test that skips the
   navigation is testing the same engine every other file already tests.
*/

import { test, expect } from "@playwright/test";
import { SITE } from "./helpers.mjs";

test("homepage to a finished draft, pressing only what a person can press",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    /* ---- 1. arrive ---------------------------------------------------- */
    await page.goto(SITE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.JukeEngine, null, { timeout: 30000 });

    /* The homepage is real content, not a splash: the ticker and the hero
       both read off the live board rather than sample data.

       Polled, not read once. window.JukeEngine exists as soon as app.js has
       run, and app.js is a blocking classic script — but the board arrives
       with the deferred boot (draft-engine.js/players.js/stats.js, loaded on
       requestIdleCallback), so the bridge is there a good while before the
       data behind it is. Reading straight after the waitForFunction above
       caught that gap and reported 0 on a page that fills in correctly a
       moment later.

       That gap is the same one CLAUDE.md records under "a window.JukeEngine
       entry is only as safe as its own guard": the bridge existing never
       implied the deferred files had landed, and DraftLocker.jsx learned it
       the same way. Still before anything is clicked, which is the claim. */
    await expect
      .poll(() => page.evaluate(() => JukeEngine.board().length), { timeout: 30000 })
      .toBeGreaterThan(150);

    /* ---- 2. find the Draft Room --------------------------------------- */
    /* Through a link on the page, not by setting location.hash. ROOMS is
       written down once and rendered into both the header panel and the
       homepage's doors, and the one string in it is what sends every "start
       a draft" entry point somewhere — it pointed at the retired route for a
       while, and nothing in the suite would have noticed.

       That string is "#/drafts" now, not "#/draft-room", and the move was
       deliberate: ROOMS and Hero.jsx both carry the reasoning — the Lobby is
       the product's real front door, and a homepage link straight into the
       live Cockpit was the most direct way a manager landed back on a stale
       finished draft instead of a fresh choice. So this follows the Lobby,
       which is also what the rest of this test already walks through. */
    /* `a[href="#/drafts"]` alone matches several links at once — Hero.jsx's
       two CTA variants (one `lg:hidden`, one `hidden lg:flex`, exactly one
       ever visible) and Header.jsx's own sticky mobile bottom bar, which
       carries the same href but no `data-hero-cta` marker and sits earlier
       in the DOM than either Hero variant. At this test's default desktop
       viewport that bar is `lg:hidden` — permanently hidden, not merely slow
       to render — so `.first()` on the bare selector resolves to it and a
       click retries against an element that will never become visible,
       timing out. `data-hero-cta` exists for precisely this — Hero.jsx's own
       comment: "only one is ever rendered" of the two marked variants, so
       filtering to the marked ones and taking whichever is on screen is the
       one real door regardless of viewport, without needing to know which
       breakpoint is active.

       And the mobile pass added a fourth: there are two whole HOMEPAGES in
       this document now, not just two renderings of one control, and both
       mount — the phone one is `sm:hidden` at this width and first in
       document order. It carries the marker too (HomePhone.jsx's Mock Draft
       row), which is why the count below is the only thing the bare marker
       answers and the click on line 91 still asks for `:visible`. */
    const doors = page.locator('[data-hero-cta]');
    expect(await doors.count(), "the homepage offers a way in").toBeGreaterThan(0);
    await page.locator('[data-hero-cta]:visible').first().click();

    // The door lands on the Locker first, not the seat-picker directly —
    // seat-picking moved to its own screen one step further in. "Start
    // mock draft" (NewMockPanel.jsx) is the one thing that screen asks
    // for now — it replaced the older "Enter Draft Room" button as part
    // of today's own fix for a two-primaries bug, and helpers.mjs's
    // startSoloDraft() is the one place that history is written down for
    // every other spec; this file presses real controls throughout on
    // purpose (see the file's own header comment), so it repeats the
    // click here rather than delegating to that helper.
    /* [data-start-draft], not the label. This control has now had five
       names, and the one that broke this line is design_handoff_v3_alive
       making DraftRoomEntry the Draft Room's entry at EVERY width — its
       button reads "Start a mock draft", one word off DraftLocker's. The
       attribute says what the control IS; CLAUDE.md already records the
       rule and helpers.mjs now follows it too. */
    /* Unscoped, because #draftroom-root is empty on every v3 address -
       the container stays in index.html but nothing portals into it any
       more. The marker is the point and it is on v3's own launcher;
       helpers.mjs dropped the same scope for the same reason. */
    const enter = page.locator("[data-start-draft]:visible").first();
    await expect(enter, "the entry asks for one thing").toBeVisible({ timeout: 30000 });
    /* ---- 3. sit down, and change something, so the draft is actually mine

       Both on the Lobby, before starting, because that is where they live
       now. This used to be three screens: click through to a seat-picker
       ("YOUR ROSTER, EMPTY", DraftEntryScreen.jsx), claim the seventh chair
       by clicking its chip on the board, then open the Draft settings modal
       to set the scoring, then press a second "Start draft".

       "Start mock draft" starts the draft outright today, so none of those
       screens sit between here and the board — the seat and the scoring are
       two selects on the panel the button belongs to, and they have to be
       set before it is pressed rather than after. Same collapse the seat
       chips in solo.spec.mjs ran into.

       And they moved again, one screen deeper. The desktop Lobby used to be
       DraftLocker, whose New mock card carries those two as inline
       <select>s; the Draft Room's entry is DraftRoomEntry at every width
       now, and it does what a phone always did — the settings live behind
       its own "Draft settings" button, which opens the real Draft Settings
       screen. So this presses that, sets both there, and saves, which is
       the flow a person now actually walks. Same controls
       draft-settings.spec.mjs drives, reached the same way.

       Still pressing only what a person can press, which is this file's own
       rule. */
    await page.getByRole("button", { name: /draft settings/i }).first().click();
    /* The drawer itself, by role. v3's SettingsDrawer is a
       role=dialog/aria-modal labelled by #v3-settings-title, and the words
       it shows are "Draft settings" in a span rather than a heading - so a
       getByRole("heading", {name: "Draft Settings"}) missed on the role AND
       on the case, which is the uppercase trap this repo has now hit five
       times. The dialog is what "the settings opened" actually means. */
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });

    // The seventh chair. The list is 0-based and so is mySlot.
    const chairs = page.locator("ol li button");
    await chairs.nth(6).scrollIntoViewIfNeeded();
    await chairs.nth(6).click();

    /* getByRole("radio"), not "button". The scoring control on that screen
       is a <button role="radio"> per option, and an explicit role wins over
       the tag — so getByRole("button") matches none of them, and the
       failure reads as a missing control rather than as the wrong role.
       The legacy #scoring <select> carries the same four values and is
       display:none, so it is not a second candidate here. */
    await page.getByRole("radio", { name: /Full PPR/ }).click();

    /* Asserted here as well as after the start, so a control that silently
       stopped being wired up fails on the control rather than on the draft
       that follows it — the same reason the old inline selects were checked
       in place. */
    await expect.poll(() => page.evaluate(() => JukeEngine.league().scoring)).toBe("ppr");
    await expect.poll(() => page.evaluate(() => state.mySlot)).toBe(6);

    /* Closed rather than saved, because v3's drawer has no Save. Every
       control writes through to the one real `league` the moment it is
       pressed - which is what the two poll() assertions above have just
       confirmed, before this line runs - so the only thing left to do with
       the drawer is dismiss it. A "Save" here would be a control that
       commits something already committed. */
    await page.getByRole("button", { name: /close draft settings/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });

    /* ---- 4. start ------------------------------------------------------ */
    await enter.click();
    await page.waitForFunction(() => state.started, null, { timeout: 30000 });

    // The seat survived the start, and the scoring did too.
    expect(await page.evaluate(() => JukeEngine.mySlot()), "seated where I sat").toBe(6);
    expect(await page.evaluate(() => JukeEngine.league().scoring), "scored as I set it").toBe("ppr");

    /* ---- 6. draft ------------------------------------------------------ */
    // A few by hand first, through the row's own Draft button when it is my
    // turn — the only place in this file that proves a pick can be made at
    // all rather than computed.
    await page.waitForFunction(() => isMyTurn(), null, { timeout: 30000 });
    const before = await page.evaluate(() => state.picks.length);
    await page.locator("button:visible").filter({ hasText: /^Draft$/ }).first().click();
    await expect.poll(() => page.evaluate(() => state.picks.length),
      { timeout: 15000 }).toBeGreaterThan(before);
    // Index `before`, not the tail: the instant my pick lands the app's own
    // CPU cascade can append the next seat's pick before this next line
    // runs, so the tail is only mine at the moment the poll above resolved.
    // The pick this click made is always the one at `before` — nothing else
    // can land there ahead of it, however many follow.
    expect(await page.evaluate((i) => state.picks[i].slot, before),
      "and it was my own chair").toBe(6);

    /* Then the rest, through the control that exists for it — the Autopick
       toggle on the header.

       This used to open the kebab and press "Auto-draft the rest". That item
       is gone: a product review cut Pause, Undo and it together, and
       DraftMenuOverlay.jsx's own comment says what replaced it — "the single
       'Autopick' toggle every competitor mock drafter actually ships". The
       click hung against a menu that no longer offers it until the six-minute
       test timeout killed the run.

       Autopick rather than a call into engine.autoDraftRest(), which is what
       solo.spec.mjs does: this file's rule is that it presses only what a
       person can press, and this is what a person presses. It drives my seat
       while the CPUs keep taking theirs, so the board fills the same way —
       measured at 47s for a full 140-pick board, hence the headroom below.

       aria-pressed is the toggle's own state, so it doubles as the assertion
       that the press registered rather than landing on a dead control. */
    /* v3 puts Autopick back INSIDE the draft menu, which reverses what the
       note above describes: the production review that cut Pause and Undo
       promoted this to a header toggle, and v3's LiveMenu carries it again
       as a switch beside them. So the menu is opened first - which is still
       "only what a person can press", just one press more than before.

       role=switch with aria-checked, not a button with aria-pressed. The
       control is a real Switch (kit.jsx), and aria-checked doubles as the
       assertion that the press registered rather than landing on a dead
       control - the same job the old aria-pressed read did. */
    /* :visible, because LiveHeader renders the menu button twice - a phone
       row and a desktop row, exactly one of them on screen - and .first()
       picks whichever sits earlier in the DOM rather than the one a person
       can press. Same duplicate-control trap as the tablist, the filter
       groups and the insights bars. */
    await page.locator('button[aria-label="Draft menu"]:visible').first().click();
    const autopick = page.locator('[role="switch"][aria-label="Autopick"]:visible').first();
    await autopick.click();
    await expect(autopick, "the toggle went on").toHaveAttribute("aria-checked", "true");
    // Out of the menu, so the board is what the rest of this walks.
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => draftOver()), { timeout: 180000 }).toBe(true);

    /* ---- 7. read the result -------------------------------------------- */
    const out = await page.evaluate(() => {
      const all = analyseDraft();
      const w = WEIGHTS;
      const perSeat = {};
      state.picks.forEach((p) => { perSeat[p.slot] = (perSeat[p.slot] || 0) + 1; });
      return {
        picks: state.picks.length,
        distinct: new Set(state.picks.map((p) => p.player.name)).size,
        sizes: [...new Set(Object.values(perSeat))],
        rounds: league.rounds,
        teams: league.teams,
        /* This counted kickers taken before `rounds - 1` and asserted zero,
           which was the round gate needFromCount() used to enforce. The gate is
           gone, so the number is expected and non-zero, and what replaced it is
           the promise the gate was really there for: every seat finishes with
           exactly the kicker and defense the format starts. Counted per seat,
           because a room-wide total of ten hides one team holding two and
           another holding none. */
        kdShort: (function () {
          const per = {};
          state.picks.forEach((p) => {
            per[p.slot] = per[p.slot] || { K: 0, DST: 0 };
            if (p.player.pos === "K" || p.player.pos === "DST") per[p.slot][p.player.pos]++;
          });
          return Object.values(per).filter((r) =>
            r.K !== league.starters.K || r.DST !== league.starters.DST).length;
        })(),
        // A total has to equal its own weighted parts, and a component that
        // is the same for everybody is not in the grade.
        reconciles: all.every((t) => Math.abs(
          t.startersScaled * w.starters + t.valueScaled * w.value +
          t.buildScaled * w.build + t.byePenaltyScaled * w.byes - t.total) < 1e-9),
        spread: ["startersScaled", "valueScaled", "buildScaled", "byePenaltyScaled"]
          .map((k) => new Set(all.map((t) => Math.round(t[k]))).size),
        mine: all.find((t) => t.slot === 6),
      };
    });

    expect(out.picks, "every pick was made").toBe(out.teams * out.rounds);
    expect(out.distinct, "and no player twice").toBe(out.picks);
    expect(out.sizes, "a full roster each").toEqual([out.rounds]);
    expect(out.kdShort, "every seat finished with exactly the kicker and defense it starts").toBe(0);
    expect(out.reconciles, "each total equals its own parts").toBe(true);
    expect(Math.min(...out.spread), "no component is a constant across the room")
      .toBeGreaterThan(1);
    expect(out.mine.grade, "and my team has a grade").toBeTruthy();

    /* ---- 8. and it says so on screen ----------------------------------- */
    /* The last step, and the one a computed check cannot make: the grade the
       reader sees is the grade the engine worked out. A right value in the
       wrong column is the one class of bug every assertion above passes
       happily - the standings printed starter strength under a column of
       totals for months. */
    await expect.poll(() => page.evaluate(() => {
      const root = document.getElementById("view-home");
      return /Draft Grade|THE ONE THAT GOT AWAY|One That Got Away/i.test(root.innerText || "");
    }), { timeout: 30000 }).toBe(true);

    const result = await page.evaluate(() => {
      const root = document.getElementById("view-home");
      const all = analyseDraft();
      const rows = [...root.querySelectorAll("button")]
        .map((b) => (b.textContent || "").trim())
        /* "Your team" counts as a team name. v3's standings label your own
           row that way rather than with teamLabel(mySlot) - which is right,
           and meant this filter saw 9 rows in a 10-team room and reported
           the standings as short by one. The row is there and correct; the
           filter could not recognise it. */
        .filter((t) => /^\d+/.test(t)
          && (/your team/i.test(t) || all.some((x) => t.includes(JukeEngine.teamLabel(x.slot)))));
      const shown = rows.map((t) => {
        const rank = parseInt(t, 10);
        const m = t.match(/(\d+)([A-F][+-]?)$/);
        return { rank, total: m ? +m[1] : null, grade: m ? m[2] : null };
      });
      // Sorted the same way the standings table itself sorts (AnalysisTab.jsx:
      // `all.slice().sort((a,b) => a.rank - b.rank)`), so row order lines up.
      const expectedRanks = all.slice().sort((a, b) => a.rank - b.rank).map((t) => t.rank);
      return { shown, expectedRanks };
    });

    expect(result.shown.length, "the standings list the room").toBe(out.teams);
    // Not asserted as the bijection [1, 2, ..., teams]: two teams tied on
    // their rounded total now legitimately share a rank (see analyseDraft()),
    // so the real check is the one this step exists for — that the number on
    // screen is the number the engine computed, ties and all — not an assumed
    // shape that happens to hold only when nobody ties.
    expect(result.shown.map((r) => r.rank), "matches what the engine computed, in finishing order")
      .toEqual(result.expectedRanks);

    await context.close();
  });
