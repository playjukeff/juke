/* What replaced the K/DST round gate.

   `needFromCount()` used to refuse a kicker before `rounds - 1` and a defense
   before `rounds - 2`. A calendar rule has no variance in it, and that is the
   measured consequence: over 60 drafts with the gate in place, against the real
   480-player board, the first defense came off between overall picks **111 and
   112** and the first kicker between **121 and 123**. A one-pick spread across
   sixty drafts is not a draft, it is a schedule — and the market says the first
   defense goes around pick 81. Without the gate, over 120 drafts, the first
   defense lands between **72 and 89**.

   So the gate is gone and each seat draws its own appetite (KD_ARCHETYPES in
   app.js), which is a distribution rather than a rule — and a distribution is
   what has to be asserted. Every bound below is loose against what was actually
   measured, because CLAUDE.md's own warning applies with particular force to a
   statistical test: one that fails on an ordinary night becomes a standing red,
   and a standing red stops being read.

     property              with the gate   without   asserted here
     first D/ST              111-112       72-89     after 55, before rounds-3
     spread of first D/ST          1          17     more than 5
     D/ST distinct rounds        2-3         4-7     at least 3
     K distinct rounds             2         2-4     at least 2
     final-round K+D        8-10 of 20  8-10 of 20   at least 1
     seats short a K/DST      0 of 600   0 of 1200   0, and this one is exact

   **Read the first two columns before adding an assertion here.** Three of
   these six no longer separate the gate from what replaced it, because the
   board grew: on the 232-player board of 30 August the gate put every defense
   in round 12, every kicker in round 13 and nothing in the final round, and the
   round-count and final-round rows caught it easily. The deep bench landed the
   next day, the pool went 232 to 480, and a gated draft started spilling into
   rounds 13 and 14 on its own. The rows that still discriminate are the two
   about **where the first defense lands and how much that moves**, which is the
   property the change is actually about. The rest are kept as shape checks.

   The last row is the only assertion here that is not a tolerance, and it is
   the one thing the gate was really protecting: a draft may spread these two
   positions however it likes, and may never leave a roster without them. */

import { test, expect } from "@playwright/test";
import { openApp, startSoloDraft } from "./helpers.mjs";

/* Several drafts, in one page, because the browser is the expensive part.

   `startDraft()` does not clear `state.picks` and never has — CLAUDE.md
   records what a loop that forgets produces: the second run finds a full board,
   draftOver() is true immediately, and every "new" draft is byte-identical to
   the first because it *is* the first. The tell is a variance of exactly zero,
   which is also what this spec would be measuring. So both are reset by hand
   before each run, and the drafts are compared against each other afterwards to
   prove they really are different drafts. */
async function runDrafts(page, seeds) {
  return page.evaluate((seeds) => {
    const rows = [];
    const orders = [];
    seeds.forEach(function (seed) {
      state.picks.length = 0;
      board.forEach(function (p) { p.drafted = false; });
      state.seed = seed;
      applyJitter();

      let guard = 0;
      while (!draftOver() && guard++ < 2000) {
        const c = onTheClock();
        if (!c) break;
        const pick = cpuChoice(c.slot, c.round);
        if (!pick) break;
        if (makePick(pick)) break;
      }

      const ks = state.picks.filter(function (p) { return p.player.pos === "K"; });
      const ds = state.picks.filter(function (p) { return p.player.pos === "DST"; });
      const per = {};
      state.picks.forEach(function (p) {
        per[p.slot] = per[p.slot] || { K: 0, DST: 0 };
        if (p.player.pos === "K" || p.player.pos === "DST") per[p.slot][p.player.pos]++;
      });

      rows.push({
        seed: seed,
        picks: state.picks.length,
        firstK: ks.length ? Math.min.apply(null, ks.map(function (p) { return p.overall; })) : null,
        firstD: ds.length ? Math.min.apply(null, ds.map(function (p) { return p.overall; })) : null,
        kRounds: new Set(ks.map(function (p) { return p.round; })).size,
        dRounds: new Set(ds.map(function (p) { return p.round; })).size,
        finalRoundKD: state.picks.filter(function (p) {
          return p.round === league.rounds && (p.player.pos === "K" || p.player.pos === "DST");
        }).length,
        short: Object.values(per).filter(function (r) {
          return r.K !== league.starters.K || r.DST !== league.starters.DST;
        }).length
      });
      orders.push(state.picks.map(function (p) { return p.player.name; }));
    });

    // Leave the page as we found it rather than on somebody's finished draft.
    state.picks.length = 0;
    board.forEach(function (p) { p.drafted = false; });

    let differing = 0;
    for (let i = 1; i < orders.length; i++) {
      differing = Math.max(differing, orders[0].filter(function (n, k) {
        return n !== orders[i][k];
      }).length);
    }

    return { rows: rows, differing: differing,
             teams: league.teams, rounds: league.rounds };
  }, seeds);
}

const SEEDS = [4111, 90210, 271828, 662607, 31337, 858993];

test("kicker and defense timing is a distribution, not a schedule", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await runDrafts(page, SEEDS);

  expect(out.teams, "the fixture assumes the default ten-team league").toBe(10);
  expect(out.rounds, "…of fourteen rounds").toBe(14);
  expect(out.rows.every((r) => r.picks === out.teams * out.rounds),
    "every draft actually finished").toBe(true);

  /* A run of identical drafts would satisfy every assertion below and mean
     nothing — the "variance of exactly zero" tell. This guards the harness,
     not the wobble. */
  expect(out.differing, "the seeds really did produce different drafts")
    .toBeGreaterThan(20);

  const firstD = out.rows.map((r) => r.firstD);
  const firstK = out.rows.map((r) => r.firstK);

  expect(Math.min(...firstD), `first defense by draft: ${firstD.join(", ")}`)
    .toBeGreaterThan(55);

  /* The two that actually separate a priced defense from a scheduled one.
     Measured max 89 against a bound of 110; the gate produced 111-112, which is
     the first pick of round 12 and could not move. */
  expect(Math.max(...firstD), "and never held back into the closing rounds")
    .toBeLessThan(out.teams * (out.rounds - 3));
  expect(Math.max(...firstD) - Math.min(...firstD),
    `the first defense moves between drafts: ${firstD.join(", ")}`)
    .toBeGreaterThan(5);

  expect(firstK.every((n) => n !== null), "a kicker came off the board in every draft")
    .toBe(true);

  expect(Math.min(...out.rows.map((r) => r.dRounds)),
    `defenses spread over rounds: ${out.rows.map((r) => r.dRounds).join(", ")}`)
    .toBeGreaterThanOrEqual(3);
  expect(Math.min(...out.rows.map((r) => r.kRounds)),
    `kickers spread over rounds: ${out.rows.map((r) => r.kRounds).join(", ")}`)
    .toBeGreaterThanOrEqual(2);

  expect(Math.min(...out.rows.map((r) => r.finalRoundKD)),
    `final-round K/DST by draft: ${out.rows.map((r) => r.finalRoundKD).join(", ")}`)
    .toBeGreaterThanOrEqual(1);

  /* The exact one. Not a tolerance, and not to be made into one. */
  expect(out.rows.filter((r) => r.short > 0),
    "no seat in any draft finished short of its kicker or its defense").toEqual([]);

  await context.close();
});

/* Determinism, which is the thing a room cannot do without: every client and
   the worker have to reach the same CPU pick from the same seed. The appetite
   is drawn from `state.seed` through DraftEngine.seatRoll(), so it is exactly
   as re-runnable as the wobble already was — and this is the assertion that
   says so, because an appetite drawn from anything else would still pass every
   distribution check above. */
test("the same seed draws the same appetites and the same draft", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await openApp(context, "#/draft");
  await startSoloDraft(page);

  const out = await page.evaluate(() => {
    const run = function (seed) {
      state.picks.length = 0;
      board.forEach(function (p) { p.drafted = false; });
      state.seed = seed;
      applyJitter();
      let guard = 0;
      while (!draftOver() && guard++ < 2000) {
        const c = onTheClock();
        if (!c) break;
        const pick = cpuChoice(c.slot, c.round);
        if (!pick) break;
        if (makePick(pick)) break;
      }
      return state.picks.map(function (p) { return p.player.name; }).join("|");
    };

    const a = run(123456);
    const b = run(654321);
    const c = run(123456);

    const seats = [];
    for (let s = 0; s < league.teams; s++) {
      seats.push([kdAppetite(s, "DST", 123456), kdAppetite(s, "K", 123456)]);
    }

    state.picks.length = 0;
    board.forEach(function (p) { p.drafted = false; });
    return { same: a === c, different: a !== b, seats: seats };
  });

  expect(out.same, "the same seed replays the same draft").toBe(true);
  expect(out.different, "a different seed does not").toBe(true);

  /* A room in which every seat drew the same appetite is the wall this change
     exists to break up, so the spread across chairs is the property here, not
     the determinism alone. */
  expect(new Set(out.seats.map((s) => s[0])).size,
    `defense appetite by seat: ${out.seats.map((s) => s[0]).join(", ")}`)
    .toBeGreaterThan(1);
  expect(new Set(out.seats.map((s) => s[1])).size,
    `kicker appetite by seat: ${out.seats.map((s) => s[1]).join(", ")}`)
    .toBeGreaterThan(1);

  await context.close();
});
