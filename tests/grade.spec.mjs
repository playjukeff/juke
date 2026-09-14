/* The grading engine, checked from outside a browser's-eye read of the
   screen — the two guards CLAUDE.md's own "Grade" testing section already
   prescribes by hand, made permanent.

   A design review reported a team finishing 12 of 12 with a D− in every
   mock while that same team's own component readouts read as competitive
   — exactly the class of bug this file's own history has hit three times
   before (a constant component, an inverted subtraction, a superflex
   double-count). Reproduced across a 10-team and a 12-team fully
   CPU-driven draft and a deliberately lopsided 14-WR-only human draft: in
   every case the composite reconciled against its own weighted parts, no
   component came back constant across the room, and the Analysis screen's
   own rendered numbers matched analyseDraft()'s output for the same slot
   exactly. No live mismatch was found — this file is what's left standing
   after that search, so a real regression trips it instead of vanishing
   the way the reported one did. */

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

/* Drives every seat with the app's own advice, mySlot included —
   autoPickForMe(), not cpuChoice(), so the human seat plays a
   real, need-aware draft rather than a synthetic one, matching
   tests/solo.spec.mjs's own finishDraft(). */
async function finishWithAdvice(page) {
  await page.evaluate(() => {
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
  });
}

/* Every 14-round pick is the cheapest available WR, need and roster
   construction both ignored on purpose — the worst-constructed roster a
   human tester could plausibly hand-draft, and the nearest reproduction
   available of "components look fine, grade doesn't" if there is one:
   starters and value both come from real, highly-drafted receivers, so
   they should not read as obviously bad the way an empty QB slot does. */
async function finishAllWR(page) {
  await page.evaluate(() => {
    let guard = 0;
    while (!draftOver() && guard++ < 500) {
      const c = onTheClock();
      if (!c) break;
      let choice;
      if (c.slot === state.mySlot) {
        const avail = board.filter((p) => !p.drafted && p.pos === "WR").sort((a, b) => a.adp - b.adp);
        choice = avail[0] || board.filter((p) => !p.drafted).sort((a, b) => a.adp - b.adp)[0];
      } else {
        choice = cpuChoice(c.slot, c.round);
      }
      if (!choice) break;
      makePick(choice);
    }
    render();
  });
}

async function readGrade(page) {
  return page.evaluate(() => {
    const all = analyseDraft();
    const w = { starters: 0.5, value: 0.25, build: 0.15, byes: 0.1 };
    const reconciles = all.every(
      (t) =>
        Math.abs(
          t.startersScaled * w.starters +
            t.valueScaled * w.value +
            t.buildScaled * w.build +
            t.byePenaltyScaled * w.byes -
            t.total
        ) < 1e-9
    );
    const spreads = ["starters", "value", "build", "byePenalty"].map(
      (k) => new Set(all.map((t) => Math.round(t[k + "Scaled"]))).size
    );
    const mine = all.find((t) => t.slot === state.mySlot);
    return { teams: all.length, reconciles, spreads, mine };
  });
}

/* The one check a component-level reconciliation can't catch: a right
   number rendered in the wrong place. Analysis had exactly this bug once
   — the standings column showed starter strength under a header reading
   the weighted total. Read what the Analysis screen actually prints and
   compare it to what analyseDraft() computed for that same slot. */
async function readAnalysisScreen(page) {
  /* A finished draft opens the report on its own - DraftRoom.jsx redirects
     the moment draftOver() goes true, as a full-screen z-[70] overlay over
     the header the tab strip lives in - so the Analysis tab is still there
     underneath, still reports itself visible, and is permanently unclickable
     once that overlay is up: it intercepts every pointer event meant for
     whatever it's covering. Every caller of this helper drives the draft to
     completion first, so the click below is only for a caller that doesn't -
     harmless today, load-bearing the moment one exists. */
  const alreadyOpen = await page.locator('#draftroom-root [class*="z-[70]"]').count();
  if (!alreadyOpen) {
    /* :visible, because there are two of these now and both are mounted.
       MobileDraftTabBar.jsx carries its own Analysis button and is
       lg:hidden - which is CSS-hidden, not absent, exactly the thing
       CLAUDE.md's note on useMinWidth is about - so a bare text match
       resolves to two elements and Playwright refuses it under strict
       mode. At this viewport the bottom bar is the hidden one, so this
       picks the header tab a person at a desk would actually press. */
    const analysisTab = page.locator('#draftroom-root button:text-is("Analysis"):visible');
    await analysisTab.click();
  }
  const text = await page.locator("#draftroom-root").innerText();
  return text;
}

test("a fully CPU-driven draft grades every team consistently, at two league sizes", async ({ browser }) => {
  for (const teams of [10, 12]) {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");
    await page.evaluate((n) => window.JukeEngine.setLeague({ ...window.JukeEngine.league(), teams: n }), teams);
    await page.waitForTimeout(200);
    await startSoloDraft(page);

    await page.evaluate(() => {
      let guard = 0;
      while (!draftOver() && guard++ < 500) {
        const c = onTheClock();
        if (!c) break;
        const choice = cpuChoice(c.slot, c.round);
        if (!choice) break;
        makePick(choice);
      }
      render();
    });

    const { teams: n, reconciles, spreads } = await readGrade(page);
    expect(n, `${teams}-team room graded`).toBe(teams);
    expect(reconciles, "every team's weighted total matches its own four parts").toBe(true);
    spreads.forEach((distinct, i) => {
      const names = ["starters", "value", "build", "byePenalty"];
      expect(distinct, `${names[i]} is not a constant across the room`).toBeGreaterThan(1);
    });

    await context.close();
  }
});

/* Phase 0: the Analysis tab must never assert a room comparison it cannot
   make yet.

   Exactly one pick per team in — round 1 just finished, round 2 is on the
   clock — `build` and `byePenalty` are mathematically tied across every
   team: nobody has a bye-week collision with only one starter drafted, and
   every team is missing the identical number of starting slots (see
   AnalysisTab.jsx's own isMeasurable() comment for the full arithmetic).
   scaleAcross() maps that tie to a flat 50 for everyone, which used to
   print "+0 vs room median" on both of those bars — right beside a real,
   non-tied "Nth of 10" rank computed from full-precision totals. Two true
   facts, shown so they read as a contradiction.

   The premise (both spreads genuinely ~0) is asserted before the screen is
   trusted, the same discipline every other test in this file follows —
   confirmed a mathematical certainty for the default league at exactly
   `teams` picks: one player each, always a starter rather than bench, so
   both cover checks and the hole count land on the same number for every
   seat regardless of who they happen to have taken. */
test("the Analysis tab does not assert a room comparison before the room has one", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const teams = await page.evaluate(() => league.teams);

  // Round 1 only, every seat included (mySlot too) — the same
  // fully-CPU-driven shape as the test above, stopped one round early.
  await page.evaluate((n) => {
    let guard = 0;
    while (state.picks.length < n && guard++ < 500) {
      const c = onTheClock();
      if (!c) break;
      const choice = cpuChoice(c.slot, c.round);
      if (!choice) break;
      makePick(choice);
    }
    render();
  }, teams);

  const early = await page.evaluate(() => {
    const all = analyseDraft();
    const spread = (key) => Math.max(...all.map((t) => t[key])) - Math.min(...all.map((t) => t[key]));
    return {
      picks: state.picks.length,
      buildSpread: spread("build"),
      byeSpread: spread("byePenalty"),
      mine: all.find((t) => t.slot === state.mySlot),
    };
  });

  expect(early.picks, "exactly one pick per team, round 1 done").toBe(teams);
  expect(early.buildSpread, "roster construction genuinely tied across the room at this point").toBeLessThan(0.5);
  expect(early.byeSpread, "and so is bye week safety").toBeLessThan(0.5);

  const screen = (await readAnalysisScreen(page)).replace(/\s+/g, " ");

  // The rank is real and printed, off the same full-precision totals the
  // two tied components above cannot see.
  const rankWord = early.mine.rank === 1 ? "st" : early.mine.rank === 2 ? "nd" : early.mine.rank === 3 ? "rd" : "th";
  expect(screen, "a real, non-blank rank").toContain(`${early.mine.rank}${rankWord} of ${teams}`);

  // The two components confirmed tied above must not claim a room
  // comparison — anchored on the label so this can't accidentally match
  // the unrelated "How the grade is built" row for the same component,
  // which never says "vs room median" at all.
  expect(screen, "roster construction prints no room-comparison delta")
    .not.toMatch(/Roster construction[\s\S]{0,40}[-+]?\d+ vs room median/);
  expect(screen, "bye week safety prints no room-comparison delta")
    .not.toMatch(/Bye week safety[\s\S]{0,40}[-+]?\d+ vs room median/);

  // And the dash placeholder is what actually renders in their place — not
  // just "the misleading number is gone", but "the honest one is there".
  expect(screen, "roster construction shows the not-yet-measurable dash")
    .toMatch(/Roster construction[\s\S]{0,40}— vs room median/);
  expect(screen, "bye week safety shows the not-yet-measurable dash")
    .toMatch(/Bye week safety[\s\S]{0,40}— vs room median/);

  await context.close();
});

/* The other half of the same fix: the dash is not a one-way door. Once the
   room has genuinely differed on a component, real numbers have to come
   back on their own — nothing in AnalysisTab.jsx may count picks or rounds
   to decide this, only the room's own current spread. Driven to a finished
   draft rather than a fixed round count, so the premise below is measured
   rather than assumed: by the end of a real draft, fourteen rounds of
   different positions, different roster shapes and different bye weeks
   have had every chance to separate the room on both components the first
   test above found tied. */
test("a component that was tied starts showing real numbers again once the room differs", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  await page.evaluate(() => {
    let guard = 0;
    while (!draftOver() && guard++ < 500) {
      const c = onTheClock();
      if (!c) break;
      const choice = cpuChoice(c.slot, c.round);
      if (!choice) break;
      makePick(choice);
    }
    render();
  });

  const later = await page.evaluate(() => {
    const all = analyseDraft();
    const spread = (key) => Math.max(...all.map((t) => t[key])) - Math.min(...all.map((t) => t[key]));
    return { buildSpread: spread("build"), byeSpread: spread("byePenalty") };
  });

  // The premise: a finished draft has to have actually differentiated
  // roster construction across the room, the same fact the "fully
  // CPU-driven draft" test above already relies on ("build is not a
  // constant across the room").
  expect(later.buildSpread, "roster construction has genuinely differentiated by the end of the draft").toBeGreaterThan(1);

  const screen = (await readAnalysisScreen(page)).replace(/\s+/g, " ");

  expect(screen, "roster construction shows a real delta now, not the tied placeholder")
    .toMatch(/Roster construction[\s\S]{0,40}[-+]?\d+ vs room median/);
  expect(screen, "and the dash is gone for that component")
    .not.toMatch(/Roster construction[\s\S]{0,40}— vs room median/);

  await context.close();
});

test("the Analysis screen's own numbers match what analyseDraft() computed for that seat", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);
  await finishWithAdvice(page);

  const { mine } = await readGrade(page);
  const screen = await readAnalysisScreen(page);

  /* Whitespace-collapsed before matching, because the rank is split across
     two elements - AnalysisTab.jsx renders it as
     `{ordinal(rank)} <span>of {teams}</span>` - so innerText puts a newline
     inside the phrase. Matching the joined phrase is the point: "2nd" and
     "of 10" each appear elsewhere on this screen, and asserting them
     separately would pass on a screen that never put them together. */
  const flat = screen.replace(/\s+/g, " ");

  expect(screen, "the printed grade letter").toContain(mine.grade);
  expect(flat, "the printed rank").toContain(`${mine.rank}${mine.rank === 1 ? "st" : mine.rank === 2 ? "nd" : mine.rank === 3 ? "rd" : "th"} of`);

  /* And the composite is NOT printed as a score out of a hundred.

     This assertion used to be its opposite - it required "60.3 / 100" on the
     screen - and it was guarding a real bug: the standings column once showed
     starter strength under a header reading the weighted total. That guard is
     kept by the two lines above, which still read what the screen prints and
     compare it to what analyseDraft() computed.

     What replaces it is the defect that removal fixed. The letter is finishing
     position and the composite is a room-relative min-max score, so an "A" one
     line above a "69 / 100" contradicts twelve years of schooling every time -
     measured across a room, the letter agreed with the school reading of the
     number beside it on 0 of 10 teams. Curving the letter off an absolute
     quantity was measured and rejected (a normal room came out 37 of 40 A+),
     so the number went.

     Scoped to the pairing rather than to the number. The total is still on
     this screen, in the component bars' own "Weighted sum = 55.9" line, where
     four bars visibly add up to it and nothing calls it a percentage - and
     "Roster construction 90 / 100" is a genuine component out of a hundred
     with no letter beside it. Asserting the total were absent would fail on
     the first and asserting "/ 100" were absent would fail on the second. */
  expect(flat, "the composite is not dressed as a percentage")
    .not.toContain(`${mine.total.toFixed(1)} / 100`);
  expect(flat, "nor as a rounded one")
    .not.toContain(`${Math.round(mine.total)} / 100 weighted`);

  await context.close();
});

/* Pins the room, which this comparison never did.

   startDraft() ends with `state.seed = Math.floor(Math.random() * 1000000)`
   followed immediately by applyJitter(), which stamps p.jitter onto every
   board player from that seed. So every draft was a different room, and the
   grade is *room-relative* — scaleAcross() ranks you against the other nine
   seats — which made this a comparison of two percentiles drawn from two
   different populations. It failed roughly one run in five and read as flake.

   It is not flake, and measuring it properly is what showed that. Pinned
   across ten seeds, with my seat drafting each way against an identical nine
   CPUs, the advised roster beats the 14-WR one in **8 of 10** rooms and loses
   two by 1 and 3 points. The all-WR roster is stable at 35 and rank 10 in
   every room; it is the advised roster that swings, from rank 3 to rank 9.

   Note the seed has to be pinned *and* applyJitter() re-run. Setting
   state.seed alone does nothing, because the jitter it feeds is already
   stamped on the board by then — an earlier version of this harness did
   exactly that and produced ten identical rows, which is what a pin that
   isn't pinning looks like. */
const PINNED_SEEDS = [1000, 8919, 16838, 24757, 32676, 40595, 48514, 56433, 64352, 72271];

async function gradeWithSeed(browser, seed, mode) {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);
  const grade = await page.evaluate(({ seed, mode }) => {
    state.seed = seed;
    applyJitter();
    let guard = 0;
    while (!draftOver() && guard++ < 500) {
      const c = onTheClock();
      if (!c) break;
      let choice;
      if (c.slot === state.mySlot) {
        if (mode === "advised") choice = autoPickForMe();
        else {
          const avail = board.filter((p) => !p.drafted && p.pos === "WR").sort((a, b) => a.adp - b.adp);
          choice = avail[0] || board.filter((p) => !p.drafted).sort((a, b) => a.adp - b.adp)[0];
        }
      } else {
        choice = cpuChoice(c.slot, c.round);
      }
      if (!choice) break;
      makePick(choice);
      pruneQueue();
    }
    const me = analyseDraft().find((t) => t.slot === state.mySlot);
    return { total: me.total, rank: me.rank, build: me.buildScaled };
  }, { seed, mode });
  await context.close();
  return grade;
}

test("the app's own advice beats a deliberately unbuilt roster in most rooms", async ({ browser }) => {
  test.slow();

  const results = [];
  for (const seed of PINNED_SEEDS) {
    const advised = await gradeWithSeed(browser, seed, "advised");
    const lopsided = await gradeWithSeed(browser, seed, "allwr");
    results.push({ seed, advised, lopsided });
  }

  // The unbuilt roster's own floor, asserted every time rather than once: 14
  // receivers and nothing else has no roster construction to speak of, and if
  // that ever stops being true the comparison below has lost its control.
  for (const r of results) {
    expect(r.lopsided.build, `seed ${r.seed}: 14 WRs have no construction`).toBeLessThan(30);
  }

  /* An aggregate, because the honest measurement is an aggregate. Asserting a
     win on every seed would be asserting something that is not true today —
     it loses two of ten — and picking the one seed where it wins would be
     choosing the answer. Eight of ten is the measured behaviour with a floor
     under it; a regression that puts the app's advice properly behind a
     nonsense roster drops below this and fails. */
  const wins = results.filter((r) => r.advised.total > r.lopsided.total).length;
  const detail = results
    .map((r) => `${r.seed}: ${Math.round(r.advised.total)} v ${Math.round(r.lopsided.total)}`)
    .join(", ");
  expect(wins, `advised beat all-WR in ${wins}/10 pinned rooms — ${detail}`).toBeGreaterThanOrEqual(7);

  /* And the thing actually worth watching. Measured over these ten rooms the
     advised seat finishes 9th of 10 in five of them, which is the app's own
     advice being out-drafted by the CPUs it is advising against — CLAUDE.md
     records that exact symptom once before, attributed to the model
     multiplier and supposedly closed by the scoringIsStock() gate. The
     default league is Half PPR, a stock format, so that gate should be
     holding. This bound is deliberately loose: it is not a target, it is a
     tripwire that says the advice has got materially worse than it is today. */
  const medianRank = results.map((r) => r.advised.rank).sort((a, b) => a - b)[Math.floor(results.length / 2)];
  expect(medianRank, `median finishing rank of the advised seat across ${results.length} rooms`).toBeLessThanOrEqual(9);
});

/* A room of near-identical rosters must not produce a near-total spread.

   scaleAcross() stretches whatever span exists across the full 0-100, so when
   ten rosters sit inside an 11-point band the lowest becomes 0 and the highest
   100 — an A+ against an F manufactured from a difference the projection
   cannot resolve. Measured with every seat running identical logic: raw
   starter strength 82 to 90, all nine slots filled on every team, and mean
   finishing ranks from 1.6 to 9.8, stable by seat across every room.

   MIN_SPAN floors the two components whose real spread is inside that error.
   This asserts the outcome rather than the constant: drive a room where every
   seat drafts the same way, and the composite spread has to stay well short of
   the full scale. Without the floor this room measures 100. */
test("a room of identical drafters does not produce a full-scale grade spread", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const room = await page.evaluate(() => {
    state.seed = 24757;
    applyJitter();
    let guard = 0;
    while (!draftOver() && guard++ < 900) {
      const c = onTheClock();
      if (!c) break;
      // Every seat, mine included, on the identical rule.
      const choice = cpuChoice(c.slot, c.round);
      if (!choice) break;
      makePick(choice);
      pruneQueue();
    }
    const all = analyseDraft();
    const totals = all.map((t) => t.total);
    return {
      spread: Math.max(...totals) - Math.min(...totals),
      rawStarterSpread: Math.max(...all.map((t) => t.starters)) - Math.min(...all.map((t) => t.starters)),
      ranks: all.map((t) => t.rank).sort((a, b) => a - b),
    };
  });
  await context.close();

  /* The premise, re-derived when aboveReplacement() stopped counting ADP rank
     places and started counting projected points.

     This line used to read `toBeLessThan(25)` and the comment beside it said
     identical drafters produce near-identical starter strength. That was true
     of the old unit and false about the rosters: rank places are capped by how
     deep a position is drafted, so the metric compressed every room into a
     10-to-12 point band whatever the seats actually held. In points the same
     identically-drafted room spans ~190 — seat 1 fields 362 and seat 5 fields
     171 — because snake position really is worth that much, and the old number
     was hiding it rather than measuring it absent.

     So the premise is no longer "nothing to spread". It is "the spread that
     exists is seat, not drafting", and the assertion below is what matters:
     the composite must stay well short of full scale even when one component
     underneath it is spread wide. Bounded generously — this is a guard against
     the metric blowing up, not a pin on today's board. */
  expect(room.rawStarterSpread, "a seat-driven starter spread, in points").toBeGreaterThan(25);
  expect(room.rawStarterSpread, "but not an unbounded one").toBeLessThan(320);

  /* Re-derived a second time, when par stopped applying the model multiplier.

     This read `toBeLessThan(60)` and the pinned seed now produces 67.6, so it
     had to move — but the number is measured, not nudged to fit. Across eight
     seeds a room of identical drafters spans **48 to 80** of the 100 available,
     against the 100 this same comment records for the unfloored original. 90
     leaves headroom over the worst observed room and still fails outright if
     the floors are ever removed.

     Read what this actually guards before tightening it. The metric saturates:
     measured over the same seeds, a room of identical drafters spreads a mean
     of **60**, and a room containing a deliberately unbuilt roster spreads
     **48** — *less*, because min-max scaling is capped either way and one bad
     team only moves the floor of the range. So composite spread cannot tell a
     room of equals from a room with a terrible drafter in it, and it is a
     backstop against full-scale confidence rather than a measure of anything.

     The assertions that carry real weight are elsewhere: the chair test below,
     and "the app's own advice beats a deliberately unbuilt roster" above. The
     bad drafter finishes last in 6 of 6 seeded rooms at every floor tried. */
  expect(room.spread, `composite spread across a room of identical drafters (was 100 unfloored)`).toBeLessThan(90);

  // The ordering survives — somebody still finishes first. Flooring the span
  // compresses the scores, it does not flatten the standings.
  expect(room.ranks[0], "somebody is still ranked first").toBe(1);
  expect(new Set(room.ranks).size, "and the room is still ranked, not tied flat").toBeGreaterThan(3);
});

/* Where a manager sits must not decide their grade.

   Starter strength counting projected points rather than ADP rank places made
   this measurable for the first time: in a room where every seat runs the
   identical CPU rule, so no seat out-drafts any other, raw starter strength
   spans ~190 points and correlates with the chair at about r -0.6. That is a
   true fact about snake position and an indefensible input to a grade meant to
   judge drafting.

   analyseDraft() scores `startersVsPar` — the seat's own par, simulated by
   seatParTable() — so the correlation between chair and finishing rank goes to
   roughly zero while the raw figure stays exactly as seat-dependent as it
   really is. Both are asserted, because only checking the composite would pass
   just as happily if par had quietly flattened the underlying number instead
   of re-centring it.

   Confirmed against the bug: scaling `starters` instead of `startersVsPar` in
   analyseDraft() makes finishing rank track raw starter strength, whose own
   chair correlation is 0.78 to 0.85 here — far past the bound below.

   **It averages over seeds, and it used to be one draft.** A single room is ten
   points, so a correlation off it carries a standard error near 0.38 — the
   estimator was noisier than the effect it was bounding, and it passed on seed
   24757 because that seed happened to land at -0.07. Sizing the wobble by each
   player's real ADP standard deviation rather than a flat +/-3 roughly doubled
   the average board offset, which is realistic and made every single-draft
   correlation noisier with it: measured across sixteen seeds, |seat vs rank|
   went over 0.35 on 3 of 16 after the change and 1 of 16 before, on a bound of
   0.35. Nothing about the seat bias itself got worse — averaged per chair over
   twenty seeds it *improved*, from 0.289 to 0.185.

   So the fix is not a looser number on the same one-sample estimate. It is to
   measure what the comment above always claimed to measure: **the mean by
   chair**, which is how CLAUDE.md's own par work was done ("mean
   `startersVsPar` by chair over ten mocks") and how it was implemented nowhere.
   Over four independent six-seed sets the averaged figure came out 0.057,
   0.195, 0.254 and 0.272, so 0.40 is a real bound with real margin rather than
   a threshold sitting inside its own noise. */
const CHAIR_SEEDS = [1103, 2207, 3301, 4409, 5501, 6607];

test("the chair a manager drafts from does not decide their grade", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await page.evaluate((seeds) => {
    const teams = league.teams;
    const rank = new Array(teams).fill(0);
    const raw = new Array(teams).fill(0);
    const vsPar = new Array(teams).fill(0);
    let everySeatHasPar = true;

    seeds.forEach(function (seed) {
      /* Par is cached on the board and keyed without the seed, so a sweep that
         does not clear it grades every seed against the first one's par. And
         startDraft() never clears state.picks — CLAUDE.md's "a loop over seeds
         is a lie" — so both are reset by hand or this measures one draft six
         times, at a variance of exactly zero. */
      PAR_CACHE.clear();
      state.picks.length = 0;
      board.forEach(function (p) { p.drafted = false; });
      state.seed = seed;
      applyJitter();

      let guard = 0;
      while (!draftOver() && guard++ < 900) {
        const c = onTheClock();
        if (!c) break;
        // Every seat on the identical rule, so any seat-shaped signal left in
        // the result is the metric rather than the drafting.
        const choice = cpuChoice(c.slot, c.round);
        if (!choice) break;
        makePick(choice);
      }

      analyseDraft().forEach(function (t) {
        rank[t.slot] += t.rank;
        raw[t.slot] += t.starters;
        vsPar[t.slot] += t.startersVsPar;
        if (!(t.par > 0)) everySeatHasPar = false;
      });
    });

    PAR_CACHE.clear();
    state.picks.length = 0;
    board.forEach(function (p) { p.drafted = false; });

    const n = seeds.length;
    const corr = (a, b) => {
      const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
      const ma = mean(a), mb = mean(b);
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
      }
      return num / Math.sqrt(da * db);
    };
    const chairs = [];
    for (let i = 0; i < teams; i++) chairs.push(i + 1);
    const meanVsPar = vsPar.map((v) => v / n);

    return {
      seatVsRank: corr(chairs, rank.map((v) => v / n)),
      seatVsRawStarters: corr(chairs, raw.map((v) => v / n)),
      parIsReal: everySeatHasPar,
      // par has to re-centre the number, not flatten it
      vsParSpread: Math.max(...meanVsPar) - Math.min(...meanVsPar),
      drafts: n
    };
  }, CHAIR_SEEDS);
  await context.close();

  expect(out.drafts, "the sweep really ran every seed").toBe(CHAIR_SEEDS.length);
  expect(Math.abs(out.seatVsRank), "the chair does not predict finishing rank").toBeLessThan(0.4);

  /* The premise. If identically-drafted seats ever stop differing this much in
     raw terms there is no seat bias left to correct and the assertion above is
     measuring nothing. Averaging makes this one sharper, not looser: the draft
     luck cancels and the structural seat effect is all that is left, so it runs
     0.78 to 0.85 where a single room gave about 0.5. */
  expect(Math.abs(out.seatVsRawStarters), "while the raw figure is still seat-driven").toBeGreaterThan(0.5);
  expect(out.parIsReal, "every seat got a par, so none was silently ungraded").toBe(true);
  expect(out.vsParSpread, "par re-centres the component rather than flattening it").toBeGreaterThan(20);
});
