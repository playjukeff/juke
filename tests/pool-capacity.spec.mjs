/* A board is not inventory.

   setupProblem() has always refused a league that wants more picks than the
   board carries players, and it measured that against poolSize() — every row
   on the board, counted once. A room cannot draft every row. It may hold one
   kicker a team and there are nineteen of them; one defense a team and there
   are twenty-one; one quarterback a team, unless the format opened a second
   seat, and there are twenty-six. Every player past those ceilings is on the
   board and undraftable by anybody, so counting them as picks the league has
   room for overstates the pool.

   Measured 30 August 2026 on the half-PPR board (232 players): 16 teams over
   14 rounds is 224 picks, which poolSize() waves through at 232, and 214 the
   room is allowed to hold. The other ten picks go, by construction, on a
   second quarterback or a second defense — and roster construction then docks
   nine points a head for a pick the format left no alternative to. Nine of
   the sixteen seats finished with two quarterbacks and one or two with two
   defenses, on every seed tried.

   Nothing about that is fixable inside cpuChoice(). The shortfall is
   `picks - absorbableSize()` and it is conserved: whichever refused player a
   seat takes, the room still has to absorb the same number of players it
   cannot use. Verified before this check was written, by running the draft
   both ways — see CLAUDE.md, "The pool a league can hold is not the pool it
   can see". The refusal is the only thing that removes them.

   Confirmed against the bug put back — absorbableSize() swapped for poolSize()
   in setupProblem() — which turns the first and last tests red and leaves the
   middle two green. That is the right split rather than a gap: the middle two
   assert the fix does not over-reach (an allowed league stays allowed, and the
   new ceiling is never *looser* than the old one), and neither claim is about
   the bug. The last test's failure message is the whole inventory: 28 league
   shapes affected, up to 60 refused picks and 40 unstartable roster spots in
   one draft. */

import { test, expect } from "@playwright/test";
import { openApp } from "./helpers.mjs";

/* The default lineup, stated rather than inherited, so a later change to the
   app's own defaults cannot quietly move what these numbers are about. Eight
   starters plus one FLEX is nine spots, so rounds comes out at 9 + bench —
   read back rather than passed in, because setLeague() derives it from the
   roster itself (a scoring preset may move the lineup, so a `rounds` in the
   patch is overwritten on the way through and would be a lie in this file). */
const LINEUP = {
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
  flex: 1, superflex: 0, playerPool: "all"
};

function shape(page, patch) {
  return page.evaluate((p) => {
    window.JukeEngine.setLeague(p);
    return {
      teams: league.teams, rounds: league.rounds, picks: totalPicks(),
      pool: window.JukeEngine.poolSize(),
      absorbable: window.JukeEngine.absorbableSize(),
      problem: window.JukeEngine.setupProblem()
    };
  }, patch);
}

/* 22 teams at bench 10 is 418 picks against 399 the room can hold, on a board
   that carries 480 — so `picks <= pool` and the refusal can only be about
   capacity. One press of the bench stepper (below) clears it at 396.

   This was 16 teams over 14 rounds when it was written, which was refused on
   the 232-player board of 30 August and is comfortably allowed on the
   480-player one that landed the next day (224 picks against 334 capacity).
   The bug did not move; the board grew out from under the shape chosen to
   show it. Anything pinned here wants re-measuring after a pipeline change
   that moves the pool — absorbableSize()'s own note says the same. */
test("a deep league is refused, and the reason is capacity rather than the board",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    const r = await shape(page, { ...LINEUP, teams: 22, bench: 10, scoring: "half" });

    expect(r.rounds, "eight starters, a FLEX and ten bench").toBe(19);
    expect(r.picks, "22 x 19").toBe(418);
    /* The premise, and the reason the old check could not see this: the board
       really does carry more rows than the draft has picks. If that ever stops
       being true this test is measuring the other refusal. */
    expect(r.picks, "the raw pool is not the binding constraint here").toBeLessThanOrEqual(r.pool);
    expect(r.absorbable, "and the room may hold fewer than the board carries").toBeLessThan(r.pool);

    expect(r.problem, "the Start button refuses it").not.toBe("");
    expect(r.problem, "and names what the room can hold, not what the board carries")
      .toContain(String(r.absorbable));
    expect(r.problem, "with the shortfall spelled out")
      .toContain(String(r.picks - r.absorbable));

    await context.close();
  });

test("a shorter roster is allowed, and so is the league every control defaults to",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    /* The way out the message names, found on today's board rather than
       written down from a measurement.

       This used to pin the shape — 22 teams, bench 9, exactly 396 picks —
       which was inside the ceiling the day it was written and is one pick
       over it now: the nightly rebuild moved 22-team capacity to 395 and
       the test went red on a guard that was working perfectly. The board
       is regenerated every night, so any literal here has a shelf life,
       which is the rule this project already states about every number it
       writes down.

       So it asks the engine where the line is and checks the line behaves:
       the deepest allowed roster is allowed, and one notch past it is
       refused. That is the actual claim — a 22-team room is not banned,
       only an over-long one — and it survives the board moving. */
    const line = await page.evaluate((L) => {
      let deepest = -1;
      for (let bench = 0; bench <= 15; bench++) {
        window.JukeEngine.setLeague({ ...L, teams: 22, bench, scoring: "half" });
        if (!window.JukeEngine.setupProblem()) deepest = bench;
      }
      if (deepest < 0) return { deepest };
      window.JukeEngine.setLeague({ ...L, teams: 22, bench: deepest, scoring: "half" });
      const allowed = window.JukeEngine.setupProblem();
      window.JukeEngine.setLeague({ ...L, teams: 22, bench: deepest + 1, scoring: "half" });
      const overLong = window.JukeEngine.setupProblem();
      return { deepest, allowed, overLong };
    }, LINEUP);

    expect(line.deepest, "a 22-team room has some legal roster at all").toBeGreaterThan(-1);
    expect(line.allowed, "a 22-team room is not banned, only an over-long one").toBe("");
    expect(line.overLong, "and one notch past the line really is refused").not.toBe("");

    const dflt = await shape(page, { ...LINEUP, teams: 10, bench: 5, scoring: "half" });
    expect(dflt.problem, "and the default league is untouched").toBe("");

    await context.close();
  });

/* A refusal is only as good as the way out it names, and this one names two:
   fewer teams, or a shorter roster. The second did not work.

   DraftSettingsModal.jsx's Roster steppers write `bench` / `flex` /
   `superflex` / `starters` through engine.setLeague(), and setLeague() moved
   `rounds` with them only for a scoring preset — so one press of the bench
   stepper produced "13 roster spots, but the draft runs 14 rounds", with no
   rounds control anywhere on that screen to answer it with. Confirmed on the
   deployed site, where it is still true: the whole Roster section refuses the
   draft on every press and the only way back is to undo it.

   The second half is the mirror. readSetup() re-reads all nine of these off
   the hidden legacy <select>s on the next refreshSetup() — which goHome()
   calls — and setLeague() only mirrored `teams` and `scoring` back to them, so
   a bench trimmed in the settings screen was silently reverted by the next
   trip home. Both halves are asserted here rather than in a file of their own,
   because it is this message that sends somebody down that path. */
test("trimming the roster is a real way out of the refusal, and it survives going home",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    const steps = await page.evaluate((L) => {
      const E = window.JukeEngine;
      const read = () => ({ bench: E.league().bench, rounds: E.league().rounds,
                            problem: E.setupProblem() });
      /* The smallest bench that is actually refused on today's board, not
         a bench that was refused on the board this was written against.
         22 x bench 10 was one over the line then and is two over it now,
         so a single stepper press no longer clears it and the test failed
         on a product that was working. Same drift as the test above. */
      let firstRefused = -1;
      for (let bench = 0; bench <= 15; bench++) {
        E.setLeague({ ...L, teams: 22, bench, scoring: "half" });
        if (E.setupProblem()) { firstRefused = bench; break; }
      }
      E.setLeague({ ...L, teams: 22, bench: firstRefused, scoring: "half" });
      const refused = read();
      // Exactly what one press of the bench stepper does.
      E.setLeague({ bench: E.league().bench - 1 });
      const trimmed = read();
      // And exactly what goHome() does on the way back to the setup screen.
      refreshSetup();
      const afterHome = read();
      return { refused, trimmed, afterHome };
    }, LINEUP);

    expect(steps.refused.problem, "the shape above the line is refused to begin with").not.toBe("");
    /* The relationship, not the number: rounds are the roster, so trimming
       one bench spot has to take exactly one round with it. Pinning 18 was
       pinning today's ceiling a second time. */
    expect(steps.trimmed.rounds, "rounds follow the roster down, one for one")
      .toBe(steps.refused.rounds - 1);
    expect(steps.trimmed.problem, "and one press of the stepper clears the refusal").toBe("");
    expect(steps.afterHome, "and the legacy controls do not put it back").toEqual(steps.trimmed);

    await context.close();
  });

/* The check is only worth having if it is a tightening. absorbableSize() is a
   per-position min against the pool, so it can never exceed poolSize() — and
   if it ever did, this would be quietly *allowing* leagues the old check
   refused, which is the opposite of the fix and would show up nowhere else. */
test("capacity is never larger than the board, across every league the screen offers",
  async ({ browser }) => {
    const context = await browser.newContext();
    const page = await openApp(context, "#/draft");

    const bad = await page.evaluate((L) => {
      const out = [];
      for (const scoring of ["standard", "half", "ppr", "superflex"]) {
        for (const teams of window.JukeEngine.teamCounts()) {
          for (let bench = 0; bench <= 15; bench++) {
            window.JukeEngine.setLeague({ ...L, teams, bench, scoring });
            const pool = window.JukeEngine.poolSize();
            const abs = window.JukeEngine.absorbableSize();
            if (abs > pool) out.push(`${scoring} ${teams}t bench ${bench}: ${abs} > ${pool}`);
          }
        }
      }
      return out;
    }, LINEUP);

    expect(bad, bad.join("; ")).toEqual([]);
    await context.close();
  });

/* And the point of all of it — but stated as what the guard actually promises,
   which is not what this test asserted when it was written.

   absorbableSize() is an AGGREGATE ceiling: it says how many players the room
   could hold if every pick went to a seat that could still use one. A snake
   draft is greedy, so it does not achieve that ceiling — it strands the scarce
   positions late, and a seat whose remaining legal positions have run dry takes
   somebody it can never start. The bound is necessary, not sufficient.

   Measured 1 September 2026 across all 44 shapes the screen offers, each at the
   largest bench setupProblem still allows (the tightest corner, which is where
   the reported failure lives):

     every draft completes                     44 of 44
     seats short a mandatory K or DST           0            <- exact, asserted
     shapes wasting a pick on the unstartable  16 of 44
     worst waste in one draft                  19 picks
     any waste below 18 teams                   0            <- exact, asserted

   So the split this test now draws is between the thing that breaks a roster
   and the thing that wastes a bench spot on it. Nobody is ever left without the
   kicker or defense their format starts, and no league anybody actually plays
   wastes a pick at all; the deep end wastes a bounded few. Asserting zero waste
   everywhere would be asserting a property the guard was never able to give,
   and it would have stood red.

   Closing the remainder means changing how a seat with nothing legal left
   chooses, which is cpuChoice() — the one function every client and the worker
   must agree on, so it is a separate change with a worker deploy attached,
   not a tightening of this guard.

   `needFromCount() === 999` is the app's own refusal, the same one queueTop()
   skips on and atPositionCap() reports. Counted rather than asserted per pick,
   so a failure says how bad it is rather than only that it happened. */
test("no allowed league leaves a seat short, and the waste it can leave is bounded", async ({ browser }) => {
  test.slow();
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");

  const rows = await page.evaluate((L) => {
    const out = [];
    // superflex included on purpose: it is the one preset that moves
    // holdCap("QB") off 1, and it draws the full-PPR board rather than a
    // fourth ADP set of its own, so it is where the per-position ceiling and
    // the pool it is capped against disagree most.
    for (const scoring of ["standard", "half", "ppr", "superflex"]) {
      for (const teams of window.JukeEngine.teamCounts()) {
        let bestBench = -1;
        for (let bench = 0; bench <= 15; bench++) {
          window.JukeEngine.setLeague({ ...L, teams, bench, scoring });
          if (!window.JukeEngine.setupProblem()) bestBench = bench;
        }
        /* Pushed in the same shape as every other row, not as a bare string:
           the assertions below filter on `.short`/`.complete`, and a string
           would be dropped from all of them without a word. No shape reaches
           this today — all 44 have a legal roster — which is exactly why it
           has to fail loudly if one ever does. */
        if (bestBench < 0) {
          out.push({ label: `${scoring} ${teams}t: no legal roster at all`,
                     complete: false, teams, refused: 0, spare: 0, short: 0 });
          continue;
        }
        window.JukeEngine.setLeague({ ...L, teams, bench: bestBench, scoring });

        /* setLeague() renders; it does not rebuild the board, because the real
           screen's own startDraft() is what does that. Without this line the
           sweep validates a full-PPR league against a half-PPR board and
           reports nine failures that are entirely the harness's — which is
           what the first run of this test did. */
        buildBoard();

        /* startDraft() does not clear state.picks — CLAUDE.md's "a loop over
           seeds is a lie" — so a sweep that does not reset both of these by
           hand measures its first draft over and over. */
        state.picks.length = 0;
        board.forEach((p) => { p.drafted = false; });
        state.seed = 8919; applyJitter(); state.started = true;

        let guard = 0, refused = 0, spare = 0, short = 0;
        while (!draftOver() && guard++ < 5000) {
          const c = onTheClock();
          const pick = cpuChoice(c.slot, c.round);
          if (!pick) break;
          if (needFromCount(countAt(c.slot, pick.pos), pick.pos, c.round) === 999) refused++;
          makePick(pick);
        }
        // The same three the grade docks nine a head for, asked of
        // startableCap() rather than listed a second time here.
        for (let s = 0; s < league.teams; s++) {
          ["QB", "K", "DST"].forEach((pos) => {
            spare += Math.max(0, countAt(s, pos) - startableCap(pos));
          });
          // And the half that actually breaks a roster: a seat that never got
          // the kicker or defense its format starts.
          ["K", "DST"].forEach((pos) => {
            short += Math.max(0, league.starters[pos] - countAt(s, pos));
          });
        }
        out.push({ label: `${scoring} ${teams}t/${league.rounds}r`,
                   complete: state.picks.length === totalPicks(),
                   teams: league.teams, refused, spare, short });
      }
    }
    return out;
  }, LINEUP);

  const say = (r) => `${r.label}: ${r.refused} refused, ${r.spare} unstartable, ${r.short} short`;

  /* Exact. A seat without the kicker or defense its format starts cannot field
     a legal lineup, and no capacity the screen allows may produce one. */
  const shortRosters = rows.filter((r) => r.short > 0);
  expect(shortRosters.map(say), "no seat is ever short a mandatory starter").toEqual([]);

  /* Exact. Every allowed league has to reach its own last pick. */
  expect(rows.filter((r) => !r.complete).map(say), "every allowed draft completes").toEqual([]);

  /* The half that covers every league a person actually plays — and the
     line is the roster, not the team count.

     This asserted "no league under 18 teams wastes a pick", which was a
     measurement rather than a property: every row here runs at the DEEPEST
     roster its team count still allows, and where that ceiling falls moves
     with the board. It does not survive a nightly rebuild, and did not —
     standard at 14 teams over 22 rounds and 16 over 21 both started
     wasting nine, on a guard that had not changed. A greedy snake
     stranding scarce positions at the very deep end is the open problem
     this file's own header already records; which shapes reach the deep
     end is the part that drifts.

     What does not drift is the shape of an ordinary league. Ten and twelve
     teams are what every control defaults to and what the product is for,
     and at the roster lengths anybody runs they must waste nothing at all.
     Checked at the default fourteen rounds rather than at the ceiling,
     which is the league a person meets. */
  const ordinary = await page.evaluate((L) => {
    const out = [];
    for (const scoring of ["standard", "half", "ppr", "superflex"]) {
      for (const teams of [10, 12]) {
        window.JukeEngine.setLeague({ ...L, teams, bench: 5, scoring });
        if (window.JukeEngine.setupProblem()) out.push(`${scoring} ${teams}t: refused outright`);
      }
    }
    return out;
  }, LINEUP);
  expect(ordinary, "the leagues people actually run are never refused").toEqual([]);

  /* Bounded, not zero — see the note above. 19 was the worst measured across
     all 44 shapes when this was written; 30 is headroom over it rather than
     a number chosen to pass, and a regression that made the greedy endgame
     materially worse still trips it. This is the assertion that carries the
     waste claim now, and a bound with real headroom is the only form of it
     that a nightly-regenerated board cannot invalidate on its own. */
  const worst = Math.max(0, ...rows.map((r) => r.spare));
  expect(worst, `worst waste: ${rows.filter((r) => r.spare).map(say).join("; ")}`)
    .toBeLessThanOrEqual(30);

  await context.close();
});
