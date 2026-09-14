/* The solo draft, driven through the button rather than around it.

   Calling the finish loop straight from the console drafts a full board
   whether or not a draft was ever started, so a harness that skips the Start
   button will happily pass a configuration the app refuses to run — which is
   how a league with one more round than roster spots went unnoticed. Every
   test here presses the real Start button and asserts `state.started` before
   it believes a single pick.

   Migrated off #/draft-legacy. Two things about that move are worth stating
   rather than discovering later:

   "Auto-draft the rest" is back. It was a button on the legacy bar wired to
   autoDraftRest(), and for a while the React room had only the per-turn
   Autopick toggle and nothing that jumps to the end — the migration is what
   found that. It is the same engine function rather than a second loop: solo
   it runs the board out, and in a room it is an autopilot on your own chair,
   which is why the control is offered off-room only. Both halves have a test
   below.

   And the roster-need chip is back. The React filter chips were plain labels,
   so the have/need count and the bug it guards had no equivalent; the counts
   come from engine.filterCounts() now, which makes the whole three-way
   decision in one place.
*/

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

/* The earliest round a kicker may sanely appear in, and it is a CONSTANT
   rather than a fraction of the draft. That distinction is the whole point of
   this value and it is what the three assertions below got wrong.

   All three used to read `> out.rounds / 2`. At ten teams and fourteen
   rounds that is `> 7`, and at twelve teams and twenty rounds it is `> 10` —
   the same expression, and it looked like the same rule. It is not, because
   the thing being bounded does not scale with the round count.

   Measured over 40 completed drafts of each shape, driving cpuChoice() and
   autoPickForMe() exactly as the tests do:

     10 teams x 14 rounds   earliest K round 11-13   (11:4  12:34  13:2)
     12 teams x 20 rounds   earliest K round 10-12   (10:1  11:37  12:2)

   The floor barely moves — round 10 or 11 either way — while `rounds / 2`
   moves from 7 to 10 underneath it. So the fourteen-round assertion carried
   four rounds of margin and the twenty-round one carried NONE, and 1 draft in
   40 landed exactly on the bound and failed. That is what it did: once, in a
   full-suite run, on a change that touched no draft logic at all.

   Why roughly constant rather than proportional: a seat's K appetite comes
   from KD_ARCHETYPES and from what it still owes against the picks it has
   left, both of which are counted in ROSTER terms. More rounds give a
   "reaches" seat slightly more spare picks and it fires a little earlier —
   which is why twenty rounds is if anything EARLIER than fourteen, the
   opposite of what a fraction of the draft predicts.

   6 preserves the four rounds of margin the healthy assertion already had,
   against a measured floor of 10. It is deliberately loose: this is a sanity
   check that the last-resort fallback did not grab a kicker to keep the loop
   moving, and a fallback misfire puts one in the opening rounds, not in round
   nine. The real distribution is tests/kd-timing.spec.mjs's to own, and it
   does — every bound in that file is a loose tolerance for the same reason.

   Re-measure before moving this. The board is regenerated nightly and the
   figures above are true of the board they were taken on. */
const EARLIEST_SANE_KICKER_ROUND = 6;

/* Set the league through the bridge, which is what the React settings screen
   does — the legacy version wrote a dozen <select> values and dispatched
   change events at a screen that is display:none now. */
async function configure(page, patch) {
  if (Object.keys(patch).length) {
    await page.evaluate((p) => window.JukeEngine.setLeague(p), patch);
    await page.waitForTimeout(300);
  }
}

/* Run it out. autoDraftRest() is unreachable from this UI (see the header),
   so this drives the same two decisions it makes: autoPickForMe() for my
   seat, cpuChoice() for everybody else. Deliberately *not* a call into
   autoDraftRest itself — the thing worth testing is that my seat's pick
   ignores whatever the panel is filtered to, and that is autoPickForMe. */
async function finishDraft(page) {
  return page.evaluate(() => {
    let guard = 0;
    while (!draftOver() && guard++ < 500) {
      const c = onTheClock();
      if (!c) break;
      const choice = c.slot === state.mySlot ? autoPickForMe() : cpuChoice(c.slot, c.round);
      if (!choice) break;
      makePick(choice);
      pruneQueue();
    }
    render();
    const perSeat = {}, qbs = {};
    state.picks.forEach(function (p) {
      perSeat[p.slot] = (perSeat[p.slot] || 0) + 1;
      if (p.player.pos === "QB") qbs[p.slot] = (qbs[p.slot] || 0) + 1;
    });
    return {
      picks: state.picks.length,
      distinct: new Set(state.picks.map((p) => p.player.name)).size,
      seats: Object.keys(perSeat).length,
      sizes: Object.values(perSeat),
      qbEach: Object.keys(perSeat).map((s) => qbs[s] || 0),
      kickerRounds: state.picks.filter((p) => p.player.pos === "K").map((p) => p.round),
      kdPerSeat: (function () {
        const per = {};
        state.picks.forEach(function (p) {
          per[p.slot] = per[p.slot] || { K: 0, DST: 0 };
          if (p.player.pos === "K" || p.player.pos === "DST") per[p.slot][p.player.pos]++;
        });
        return Object.values(per);
      })(),
      startsK: league.starters.K,
      startsDST: league.starters.DST,
      rounds: league.rounds,
      over: draftOver()
    };
  });
}

test("the default league drafts to the end", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");

  await configure(page, {});
  await startSoloDraft(page);
  const out = await finishDraft(page);

  expect(out.picks, "140 picks").toBe(140);
  expect(out.distinct, "and no player twice").toBe(140);
  expect(out.seats).toBe(10);
  expect(out.sizes.every((n) => n === 14), "fourteen each").toBe(true);
  expect(out.over).toBe(true);
  /* This asserted the first kicker landed no earlier than round 13, which was
     the round gate rather than anything about a finished draft. The gate is
     gone — a seat picks its own moment now, and tests/kd-timing.spec.mjs owns
     the distribution that replaced it. What a completed draft still has to be
     true of is the roster: everybody ends up with exactly the kicker and
     defense the format starts, which is the promise the gate was really
     protecting and the one thing a full-draft test here should check. */
  expect(out.kdPerSeat.filter((r) => r.K !== out.startsK || r.DST !== out.startsDST),
    "every seat finished with exactly the kicker and defense it starts").toEqual([]);

  await context.close();
});

test("twelve teams, fifteen rounds, full PPR, bench six", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");

  /* The bench is the part this instruction used to leave out. Eight starters
     plus a FLEX plus five bench is fourteen spots, so fifteen rounds would
     draft a fifteenth player with nowhere to put him — setupProblem() refuses
     it, correctly, and for several sessions the routine quietly described a
     league the app will not run. */
  await configure(page, { teams: 12, rounds: 15, scoring: "ppr", bench: 6 });
  await startSoloDraft(page);
  const out = await finishDraft(page);

  expect(out.picks, "180 picks").toBe(180);
  expect(out.distinct).toBe(180);
  expect(out.seats).toBe(12);
  expect(out.sizes.every((n) => n === 15), "fifteen each").toBe(true);
  expect(out.qbEach.every((n) => n >= 1), "everybody has a quarterback").toBe(true);
  expect(out.kdPerSeat.filter((r) => r.K !== out.startsK || r.DST !== out.startsDST),
    "every seat finished with exactly the kicker and defense it starts").toEqual([]);

  await context.close();
});

/* A filter is a lens, never a decision.

   suggestions() is filtered by the position chip, and autoPickForMe() used to
   read that list — so a manager looking at tight ends who already held three
   got an empty list, and the auto-draft read empty as "there is nothing left
   to draft" and abandoned the remaining rounds without a word. Reported from
   a real draft: eleventh of twelve, stopped in the ninth round of fourteen.

   Every filter is tried because the bug is not about tight ends, it is about
   the panel's filter reaching a decision it was never part of. */
for (const pos of ["ALL", "QB", "RB", "WR", "TE", "K", "DST"]) {
  test(`auto-draft finishes with the ${pos} filter showing`, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    await configure(page, { teams: 12 });
    /* The eleventh seat, which is where the real report came from, set
       through the engine exactly as configure() above sets the league.

       This has chased the control across two redesigns and should stop.
       It was a claim chip on a seat board one click past the Locker; that
       screen went when "Start mock draft" began starting the draft
       outright, so the chip filter matched nothing and the failure read as
       "Cannot read properties of undefined". It became the Lobby's own
       "Your seat" <select> in NewMockPanel — and design_handoff_v3_alive
       moved it again, because DraftRoomEntry is what #/draft's
       pre-draft branch renders at every width now and the dashboard
       carrying that select sits behind "Your insights". Same failure
       shape: a locator waiting 30s for a control on a screen that is no
       longer showing.

       So it goes through the bridge. This file is engine-driven for setup
       throughout — configure() is `setLeague`, finishDraft() drives
       autoPickForMe/cpuChoice — and the seat is setup, not the thing under
       test. journey.spec.mjs is the file that presses only what a person
       can press, and it walks the real Draft Settings screen for this.

       setMySlot is 0-based where the old <select> was 1-based: seat 11 is
       index 10. It refuses a seat outside the league, so a wrong league
       size fails here rather than silently drafting from seat 1. */
    await page.evaluate(() => window.JukeEngine.setMySlot(10));
    expect(await page.evaluate(() => state.mySlot), "the eleventh seat took")
      .toBe(10);
    await startSoloDraft(page);

    // Set the panel's filter through the chip a person would press.
    await page.evaluate((p) => {
      const root = document.getElementById("draftroom-root");
      const label = p === "ALL" ? "All" : p;
      const btn = [...root.querySelectorAll("button")]
        .find((b) => b.textContent.trim().replace(/\d+\/?\d*$/, "").trim() === label);
      if (btn) btn.click();
    }, pos);
    await page.waitForTimeout(300);

    // Part way in by hand, which is when a person reaches for the button.
    await page.evaluate(() => {
      let guard = 0;
      while (state.picks.length < 100 && guard++ < 300) {
        const c = onTheClock();
        if (!c) break;
        const choice = c.slot === state.mySlot ? autoPickForMe() : cpuChoice(c.slot, c.round);
        if (!choice) break;
        makePick(choice);
        pruneQueue();
      }
      render();
    });

    const out = await finishDraft(page);

    expect(out.picks, "the draft finishes or the board is empty").toBe(168);
    expect(out.distinct).toBe(168);
    expect(out.sizes.every((n) => n === 14)).toBe(true);
    /* The fallback must not reach for a kicker to keep the loop moving.

       This used to read `>= 13`, which was needFromCount()'s round gate rather
       than anything about the fallback — with the gate in place no path could
       produce a kicker earlier, so the assertion could not fail. A seat picks
       its own moment now: re-measured over 40 drafts of this exact shape, the
       first kicker off the board lands in round 11, 12 or 13 of 14.

       It then read `> out.rounds / 2`, which was right here and wrong at
       twenty rounds — see EARLIEST_SANE_KICKER_ROUND at the top of this file
       for the measurement and for why this bound is a constant. */
    expect(out.kickerRounds.length ? Math.min(...out.kickerRounds) : 99)
      .toBeGreaterThan(EARLIEST_SANE_KICKER_ROUND);

    await context.close();
  });
}

/* Nobody sits on a bench outranking the player in a slot they could fill.

   bestLineup() used to sort candidates by posRank, which is a rank inside a
   position, so filling a FLEX from TE19, RB25 and WR28 took the tight end —
   19 being a smaller number than 25 — even though that tight end was below
   replacement at his own position and the running back was five places above
   his. Half the grade is starter strength, and it was being computed off a
   lineup nobody would field.

   Asserted across every team in the room rather than the one being watched,
   because the component is scaled against the rest of the room: one team's
   lineup being wrong moves everybody's grade. */
test("every lineup fields the best eligible player", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");

  await configure(page, { teams: 12 });
  await startSoloDraft(page);
  await finishDraft(page);

  const out = await page.evaluate(() => {
    const all = analyseDraft();
    const violations = [];
    all.forEach((t) => {
      const bench = t.roster.filter((p) => !t.lineup.some((s) => s.player === p));
      t.lineup.forEach((s) => {
        if (!s.player) return;
        bench.forEach((b) => {
          if (fillsSlot(b, s.slot) && aboveReplacement(b) > aboveReplacement(s.player)) {
            violations.push(`team ${t.slot} ${s.slot}: ${s.player.name} ` +
              `(${aboveReplacement(s.player)}) benched behind ${b.name} (${aboveReplacement(b)})`);
          }
        });
      });
    });
    const w = WEIGHTS;
    return {
      violations,
      // The two checks CLAUDE.md asks for beside it: a component that is the
      // same for everybody is not in the grade, and a total has to equal its
      // own parts.
      distinct: ["startersScaled", "valueScaled", "buildScaled", "byePenaltyScaled"]
        .map((k) => new Set(all.map((t) => Math.round(t[k]))).size),
      reconciles: all.every((t) => Math.abs(
        t.startersScaled * w.starters + t.valueScaled * w.value +
        t.buildScaled * w.build + t.byePenaltyScaled * w.byes - t.total) < 1e-9)
    };
  });

  expect(out.violations).toEqual([]);
  expect(out.reconciles, "each total equals its own weighted parts").toBe(true);
  expect(Math.min(...out.distinct), "no component is a constant across the room").toBeGreaterThan(1);

  await context.close();
});

/* This replaces "solo still says 'Auto-draft the rest'".

   That test asserted a label on a control the React room does not have. The
   claim underneath it is still true and still worth guarding: off-room,
   autopick is drafting *your* seat and nothing else — the CPUs are the app's
   own business. In a room the same switch means only your picks, which is
   what the label was distinguishing. */
test("solo autopick drafts my seat and nobody else's", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await page.evaluate(() => {
    const mine = state.mySlot;
    const before = state.picks.length;
    // Reach my turn without autopick doing anything, then let it act once.
    let guard = 0;
    while (!isMyTurn() && guard++ < 40) { const c = onTheClock(); makePick(cpuChoice(c.slot, c.round)); }
    const atMyTurn = state.picks.length;
    const choice = autoPickForMe();
    makePick(choice);
    return {
      inRoom: JukeEngine.inRoom(),
      addedByAutopick: state.picks.length - atMyTurn,
      lastSeat: state.picks[state.picks.length - 1].slot,
      mine, before
    };
  });

  expect(out.inRoom, "this is a solo draft").toBe(false);
  expect(out.addedByAutopick, "one pick, not a run of them").toBe(1);
  expect(out.lastSeat, "and it is my own seat").toBe(out.mine);

  await context.close();
});

/* The roster-need chip, which said a thing the app never enforced.

   It printed `have/starters` in every state and turned green once the
   starting slot was filled, so one tight end painted a green "TE 1/1" — a
   success colour on a fraction that reads as a ceiling. Reported from a real
   draft as the app refusing a second tight end. It had refused nothing: the
   Draft button was never disabled, and there were nineteen on the board.

   So this asserts the two halves together — what the chip says, and what the
   board actually allows — because the bug was entirely the gap between them. */
test("a filled starting slot is not a cap, and does not claim to be", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await page.evaluate(() => {
    // Reach my turn, take a tight end, then reach my turn again so the row
    // buttons are live — a disabled button on somebody else's clock proves
    // nothing about tight ends.
    while (!isMyTurn()) { const c = onTheClock(); makePick(cpuChoice(c.slot, c.round)); }
    makePick(board.find((p) => p.pos === "TE" && !p.drafted));
    while (!isMyTurn() && !draftOver()) { const c = onTheClock(); makePick(cpuChoice(c.slot, c.round)); }

    /* Read before the roster is stuffed below, not after. Everything past
       this point pushes picks straight into state.picks to reach the cap,
       which moves whose turn it is — so a turn asked for at the end of this
       block is an answer about a board the test built, not the one it drove. */
    const onMyTurn = isMyTurn();
    const withOne = JukeEngine.filterCounts().TE;
    const shortRB = JukeEngine.filterCounts().RB;
    const teAvailable = board.filter((p) => p.pos === "TE" && !p.drafted).length;

    // And at the cap the chip is allowed to say so, because there it is true.
    while (countAt(state.mySlot, "TE") < maxAt("TE")) {
      const te = board.find((p) => p.pos === "TE" && !p.drafted);
      te.drafted = true;
      state.picks.push({ overall: state.picks.length + 1, round: 1,
                         slot: state.mySlot, player: te });
    }
    render();
    const atCap = JukeEngine.filterCounts().TE;

    return { onMyTurn, withOne, shortRB, teAvailable, atCap, cap: maxAt("TE") };
  });

  expect(out.onMyTurn, "the clock was mine when this was read").toBe(true);
  expect(out.teAvailable, "there were tight ends left to take").toBeGreaterThan(5);

  /* One held against one needed is a requirement discharged, not a ceiling.
     A fraction there invents a limit that does not exist. */
  expect(out.withOne.text, "a met requirement is a count, not a fraction").toBe("1");
  expect(out.withOne.short, "and it is not short").toBe(false);
  expect(out.withOne.full, "nor is it full — three is the cap").toBe(false);

  // A slot still owed keeps its denominator, because there it is a promise.
  expect(out.shortRB.text).toBe(`${out.shortRB.have}/${out.shortRB.need}`);
  expect(out.shortRB.short).toBe(true);

  // At the real cap it says so, because there it is true.
  expect(out.atCap.have).toBe(out.cap);
  expect(out.atCap.full, "the cap is a cap").toBe(true);

  await context.close();
});

/* What autoDraftRest() must produce, and the button that no longer starts it.

   Solo it finishes the board: every remaining pick, mine from my queue
   first and everybody else's from the CPU's own choice. In a room the same
   engine function is an autopilot on one chair, because drafting nine other
   managers' teams locally is a bug this codebase has already had.

   This used to drive it through a menu item and assert the label, and that
   button is gone — a product review cut Pause, Undo and "Auto-draft the
   rest" together, on the reasoning written out at the head of
   DraftMenuOverlay.jsx. The engine function is explicitly untouched by that
   decision ("still how a finished-draft test harness fills a board"), which
   is exactly what this test is, so it calls it directly now.

   Both facts are still pinned, because losing either would be a silent gap:
   the menu really does not offer it any more, and the thing it used to
   start still lays down a legal board. The half that changed is only how
   the draft gets kicked off. */
test("auto-drafting the rest finishes the board, and the menu no longer offers it",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");
    await startSoloDraft(page);

    // Part way in by hand, which is when a person reaches for it.
    await page.evaluate(() => {
      let guard = 0;
      while (state.picks.length < 20 && guard++ < 60) {
        const c = onTheClock();
        if (!c) break;
        makePick(c.slot === state.mySlot ? autoPickForMe() : cpuChoice(c.slot, c.round));
      }
      render();
    });

    /* Open the menu and check the item is not in it, mid-draft, with a
       board still left to fill — which is the one moment it would have
       been offered, so it is the only moment its absence means anything.

       The control is "Draft menu" on v3's live header and it was "Draft
       options" on the Draft Room's cockpit bar. Both names are a label, and
       a label is what this project's own rule says not to anchor on — kept
       anyway, because the thing being asserted here IS a piece of copy ("no
       item reading Auto-draft the rest"), so there is no attribute that
       would make this check independent of what the menu says.

       :visible is still load-bearing: LiveHeader renders its control twice,
       once for the phone layout and once for the desktop one, and only ever
       shows the one its width calls for. Both are in the DOM, so matching on
       the label alone is a strict-mode violation rather than a missing
       button. Scoped to the page rather than to #draftroom-root, which is
       empty on every route since the cutover. */
    const menuBtn = page.locator('button[aria-label="Draft menu"]:visible');
    const finish = page.locator("button:visible").filter({ hasText: /^Auto-draft the rest/ });
    await menuBtn.click();
    /* The menu is actually open before its contents are asserted absent.
       Without this the check passes just as happily against a menu that
       never opened, which is the vacuity trap this project has now shipped
       three times — an absence means nothing unless the thing it is absent
       FROM is on screen. "End draft" is the item that does the same job
       honestly (it drafts the rest, records it and grades it), so it is
       both the proof the menu is up and the reason the other one is gone. */
    await expect(
      page.getByRole("button", { name: /^End draft/ }),
      "the menu is open, so the absence below means something",
    ).toBeVisible();
    await expect(finish, "the cut menu item stays cut").toHaveCount(0);
    await page.keyboard.press("Escape");

    /* Unqualified, like autoPickForMe() and cpuChoice() above it — app.js
       is a classic script, so its top-level functions are globals here.
       Asynchronous, as the button always was: it animates the remaining
       picks rather than laying them down in one turn, which is why this
       polls draftOver() instead of reading it once. */
    await page.evaluate(() => autoDraftRest());

    await expect.poll(() => page.evaluate(() => draftOver()), { timeout: 30000 }).toBe(true);

    const out = await page.evaluate(() => {
      const perSeat = {};
      state.picks.forEach((p) => { perSeat[p.slot] = (perSeat[p.slot] || 0) + 1; });
      return {
        picks: state.picks.length,
        distinct: new Set(state.picks.map((p) => p.player.name)).size,
        sizes: [...new Set(Object.values(perSeat))],
        kickerRounds: state.picks.filter((p) => p.player.pos === "K").map((p) => p.round),
        rounds: league.rounds,
      };
    });

    expect(out.picks, "it finishes the draft or the board is empty").toBe(140);
    expect(out.distinct, "and no player twice").toBe(140);
    expect(out.sizes, "fourteen a team").toEqual([14]);
    /* The fallback must not reach for a kicker to keep the loop moving.

       This used to read `>= 13`, which was needFromCount()'s round gate rather
       than anything about the fallback — with the gate in place no path could
       produce a kicker earlier, so the assertion could not fail. A seat picks
       its own moment now: re-measured over 40 drafts of this shape, the first
       kicker off the board lands in round 11, 12 or 13 of 14.

       It then read `> out.rounds / 2`, which was safe at this shape and not
       at twenty rounds — see EARLIEST_SANE_KICKER_ROUND at the top of this
       file. This is the third copy of that expression and the reason all
       three now name one constant: two of them were fine and the third was
       one draft in forty from red, and nothing distinguished them by eye. */
    expect(out.kickerRounds.length ? Math.min(...out.kickerRounds) : 99)
      .toBeGreaterThan(EARLIEST_SANE_KICKER_ROUND);

    /* Still absent with the board full, which is a weaker claim than the
       one above and kept anyway: draftOver() opens the same full-screen
       report grade.spec.mjs's readAnalysisScreen() had to learn to step
       around, over the whole header including this kebab - covering it
       rather than hiding it, so a click meant to reopen the menu would
       hang against that overlay forever rather than ever finding an empty
       one. finish re-queries the live DOM on every check rather than
       trusting a stale handle, so simply asking again is both correct and
       enough. */
    await expect(finish, "and it is still not there when the board is full").toHaveCount(0);

    await context.close();
  });

/* MODEL_CAP alone was a percentage of ADP, and a percentage of a growing
   number grows with it: 25% off pick 10 is 2.5 picks, invisible; 25% off
   pick 150 is 37.5, a real reach — which draft value (the grade's own
   value component) then penalised as exactly that. A real mock found the
   suggestion engine discount a pick to -23 and autopick another to -37,
   with Draft Insights naming the second the biggest reach of the draft —
   the recommendation and the grade disagreeing about the same pick.

   Tested at the source (modelMultipliers()) rather than by running a full
   draft and inspecting the resulting reach: the realised gap on a picked
   player is also shaped by needMultiplier and risk, so asserting an end-
   to-end "reach" number would be testing three mechanisms at once and
   could pass or fail for the wrong reason. This is the one property that
   actually changed — the model's own discount, converted to picks, never
   exceeds MODEL_CAP_PICKS — the same "test the property, not the
   arithmetic" rule this file already follows for pick codes. */
test("the suggestion model's discount is capped in absolute picks, not just percentage",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");
    await startSoloDraft(page);

    const out = await page.evaluate(() => {
      const pool = board.filter((p) => !p.drafted);
      const multiplier = modelMultipliers(pool);
      const violations = [];
      pool.forEach((p) => {
        if (!p.adp || p.adp <= 0) return;
        const cutPicks = p.adp * (1 - multiplier(p));
        if (cutPicks > MODEL_CAP_PICKS + 1e-6) {
          violations.push(`${p.name} at ADP ${p.adp}: model cut ${cutPicks.toFixed(1)} picks`);
        }
      });
      return { violations, checked: pool.length, cap: MODEL_CAP_PICKS };
    });

    expect(out.checked, "a real board was actually checked").toBeGreaterThan(100);
    expect(out.cap).toBe(20);
    expect(out.violations).toEqual([]);

    await context.close();
  });

/* Twelve teams, twenty rounds is 240 picks — past the roughly 210-270 that
   real ADP alone ever carried, and until extend_deep_bench() existed
   (scripts/build_players.py) setupProblem() simply refused it, correctly,
   for every league this deep. See CLAUDE.md's "Take the board past 228
   players" for the shape of the fix: below real ADP there is no more
   market signal, so the rest of each format's list is Sleeper's own player
   master, ranked by search_rank and marked `deep: true`.

   Gated on the board actually being deep enough, the same way
   news.spec.mjs skips against a keyless worker: players.js only reaches
   this depth after the pipeline has actually run with real network access,
   and this checkout may be sitting between rebuilds. Verify a skip in both
   directions — against a freshly regenerated players.js this should never
   skip, and if it does that is itself worth noticing. */
test.describe("a league deeper than real ADP alone can serve", () => {
  test("twelve teams, twenty rounds runs end to end once the board is deep enough", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    // Eight starters, a FLEX and five bench is fourteen roster spots for
    // fourteen rounds by default (the same arithmetic solo.spec.mjs's other
    // bench-aware test already explains) — twenty rounds needs eleven bench
    // spots instead of five to keep rosterSize() matching league.rounds, so
    // setupProblem()'s first check (roster vs. rounds) doesn't fire before
    // its second one (picks vs. pool) gets a chance to.
    await configure(page, { teams: 12, rounds: 20, bench: 11 });

    const deepEnough = await page.evaluate(() => poolSize() >= 240);
    test.skip(!deepEnough, "players.js is not deep enough yet for 240 picks — needs a data pipeline run");

    await startSoloDraft(page);
    const out = await finishDraft(page);

    expect(out.picks, "240 picks").toBe(240);
    expect(out.distinct).toBe(240);
    expect(out.seats).toBe(12);
    expect(out.sizes.every((n) => n === 20), "twenty each").toBe(true);
    expect(out.over).toBe(true);
    /* This read `>= 19`, which was needFromCount()'s round gate — no kicker
       before `rounds - 1` — restated back to itself, so it could not fail while
       the gate stood. A seat picks its own moment for both positions now (see
       tests/kd-timing.spec.mjs), and at twenty rounds it takes one earlier than
       at fourteen because there are more picks to spare. What a finished draft
       still has to be true of is the roster, which is what the gate was really
       protecting. */
    expect(out.kdPerSeat.filter((r) => r.K !== out.startsK || r.DST !== out.startsDST),
      "every seat finished with exactly the kicker and defense it starts").toEqual([]);
    expect(out.kickerRounds.length ? Math.min(...out.kickerRounds) : 99,
      "and the fallback still did not reach for one to keep the loop moving")
      .toBeGreaterThan(EARLIEST_SANE_KICKER_ROUND);

    await context.close();
  });

  /* The deepest configuration the setup screen actually offers — 24 teams,
     20 rounds — is 480 picks, exactly DEEP_TARGET in build_players.py. So
     it is a config the pipeline aims to make servable, not one guaranteed
     to fail — which makes it the wrong shape for "the guard still refuses
     something genuinely impossible." Twenty-four teams carrying eleven
     spare bench spots on top of that (rosterSize 9 + 15 bench = 24 rounds)
     is 576 picks, safely past the 480 ceiling regardless of how deep any
     future pipeline run reaches, so this one stays a real refusal forever
     rather than becoming a false failure the day the board finally hits
     480 exactly. */
  test("the guard still refuses a league too deep for any board", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    await configure(page, { teams: 24, rounds: 24, bench: 15 });

    const problem = await page.evaluate(() => setupProblem());
    expect(problem, "setupProblem() names the shortfall").toContain("576 picks");
    expect(problem).toMatch(/board only carries \d+ players/);

    const startMock = page.locator('#draftroom-root button:text-is("Start mock draft")');
    if (await startMock.count()) {
      expect(await startMock.isEnabled(), "the Start button stays disabled").toBe(false);
    }

    await context.close();
  });
});
