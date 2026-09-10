/* The season simulation behind screen 05's playoff and bye odds.
 *
 * This is the most confident thing this product says about a league — "you
 * make the playoffs 61% of the time" is a number a manager will trade on —
 * and it is produced by ten thousand samples, which is exactly the shape
 * that can be plausibly and silently wrong. Every assertion here is aimed
 * at a way of being wrong that still renders a believable percentage.
 *
 * ---- The invariant that matters most, and how it is checked ----
 *
 * The simulation may not become a SECOND model. Its per-matchup marginal
 * has to be the same normal difference `winRateAgainst()` computes, or the
 * Strategy Room's win probability and My League's playoff odds are two
 * answers to overlapping questions from two models that can drift.
 *
 * So this suite does not restate that formula. It **reads `normalCdf()` and
 * `winRateAgainst()` out of `app.js`** and runs the real ones — the same
 * discipline `test_history_ownership.py` uses on `store.js`'s upsert, and
 * for the same reason: a copy in a test passes while the shipped code is
 * broken. Both are pure and self-contained, which is what makes it possible.
 *
 * Run: node scripts/test_season_sim.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sim = await import(pathToFileURL(path.resolve("web/src/lib/seasonSim.js")).href);

/* ---- the real model, lifted out of app.js --------------------------- */

/* A brace walk rather than a regex, for check_css.py's reason: counting is
   not parsing, and a function containing an object literal defeats a lazy
   match. */
function lift(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start !== -1, `app.js no longer contains ${signature}`);
  let depth = 0;
  let i = source.indexOf("{", start);
  const open = i;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${signature} never closes`);
  return open;
}

const appjs = fs.readFileSync(path.resolve("app.js"), "utf8");
const model = new Function(
  lift(appjs, "function normalCdf(z)") +
    "\n" +
    lift(appjs, "function winRateAgainst(mine, others)") +
    "\nreturn { normalCdf, winRateAgainst };"
)();

const fails = [];
const note = [];
const check = (name, fn) => {
  try { fn(); note.push("ok  " + name); }
  catch (err) { fails.push(name + "\n    " + err.message); }
};

/* ---- fixtures ------------------------------------------------------- */

/* A ten-team league, one game a week, fourteen regular weeks and a
   three-week bracket — which is the shape of the real ESPN league every
   other measurement in this project was taken against. */
function league(opts = {}) {
  const n = opts.teams || 10;
  const weeks = opts.regularSeasonWeeks || 14;
  const playoffWeeks = opts.playoffWeeks === undefined ? 3 : opts.playoffWeeks;
  const ids = Array.from({ length: n }, (_, i) => String(i + 1));

  /* The circle method, so EVERY team plays exactly one game a week.
     Written properly rather than approximated: the first version rotated
     an index and quietly gave some teams more fixtures than others, which
     read as the simulation favouring a schedule position -- a plausible
     wrong answer produced entirely by the fixture. */
  const matchups = [];
  const wheel = ids.slice();
  for (let w = 1; w <= weeks; w += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      matchups.push({
        week: w,
        home: { teamId: wheel[i], points: null },
        away: { teamId: wheel[n - 1 - i], points: null },
        winner: "UNDECIDED",
        playoff: false,
      });
    }
    // Hold the last seat and rotate the rest, which is what makes the
    // pairing a permutation rather than a sample.
    wheel.splice(1, 0, wheel.splice(n - 1, 1)[0]);
  }
  for (let w = 1; w <= playoffWeeks; w += 1) {
    matchups.push({
      week: weeks + w,
      home: { teamId: ids[0], points: null },
      away: { teamId: ids[1], points: null },
      winner: "UNDECIDED",
      playoff: true,
    });
  }

  return {
    schedule: { matchups, weeks: weeks + playoffWeeks, regularSeasonWeeks: weeks },
    teams: ids.map((id) => ({ ownerId: id, wins: 0, losses: 0, ties: 0, pointsFor: 0 })),
    strength: Object.fromEntries(ids.map((id) => [id, { mean: 110, stdev: 25 }])),
    playoffTeams: opts.playoffTeams === undefined ? 6 : opts.playoffTeams,
    seed: 12345,
  };
}

/* ---- the invariant: the sampler IS the shipped model ---------------- */

check("app.js's own winRateAgainst is what came back", () => {
  // If the lift silently produced something else, every comparison below
  // would be a copy agreeing with itself.
  assert.equal(typeof model.winRateAgainst, "function");
  assert.equal(model.winRateAgainst({ mean: 100, stdev: 10 }, []), null);
  assert.ok(model.winRateAgainst({ mean: 120, stdev: 20 }, [{ mean: 100, stdev: 20 }]) > 0.6);
});

check("one simulated matchup matches the analytic win rate", () => {
  /* The whole reason this file exists. A one-game "season" between two
     teams is a Bernoulli trial whose probability the shipped model states
     in closed form, so the simulation's own answer is checkable rather
     than merely plausible.

     Three pairs, deliberately spread: a near-even matchup where the
     sampler has the most room to be wrong, and two lopsided ones where a
     sign error would be obvious. */
  const cases = [
    [{ mean: 110, stdev: 25 }, { mean: 108, stdev: 25 }],
    [{ mean: 130, stdev: 20 }, { mean: 100, stdev: 30 }],
    [{ mean: 95, stdev: 15 }, { mean: 118, stdev: 22 }],
  ];
  for (const [mine, theirs] of cases) {
    const analytic = model.winRateAgainst(mine, [theirs]);
    const out = sim.seasonOdds({
      schedule: {
        matchups: [{ week: 1, home: { teamId: "a" }, away: { teamId: "b" }, winner: "UNDECIDED", playoff: false }],
        weeks: 2,
        regularSeasonWeeks: 1,
      },
      teams: [
        { ownerId: "a", wins: 0, losses: 0, pointsFor: 0 },
        { ownerId: "b", wins: 0, losses: 0, pointsFor: 0 },
      ],
      strength: { a: mine, b: theirs },
      // One playoff seat, so "made the playoffs" IS "won the one game".
      playoffTeams: 1,
      sims: 40000,
      seed: 7,
    });
    const empirical = sim.oddsFor(out, "a").playoffs;
    /* Three standard errors at n=40,000 is 0.0075, and the tolerance is
       0.01 — loose enough that a healthy run cannot fail it and tight
       enough that a model disagreement cannot pass. `normalCdf` is an
       approximation with its own error near 1e-7, which is nothing here. */
    assert.ok(
      Math.abs(empirical - analytic) < 0.01,
      `simulated ${empirical.toFixed(4)} against analytic ${analytic.toFixed(4)}`
    );
  }
});

/* ---- the arithmetic a plausible number would hide ------------------- */

check("ten identical teams each make a six-of-ten playoff about 60% of the time", () => {
  // A league where every team is the same has one right answer and it is
  // the seat count over the team count. Anything that quietly favoured a
  // schedule position, or seeded the RNG per team, shows up here.
  const out = sim.seasonOdds(league());
  const odds = out.teams.map((t) => t.playoffs);
  odds.forEach((p) => assert.ok(Math.abs(p - 0.6) < 0.05, `a team read ${p.toFixed(3)}`));
  const total = odds.reduce((a, b) => a + b, 0);
  // Six seats are filled in every single season, so the odds sum to six.
  assert.ok(Math.abs(total - 6) < 0.001, `seats add to ${total.toFixed(3)}`);
});

check("and their projected records add up to the games that are played", () => {
  const out = sim.seasonOdds(league());
  const wins = out.teams.reduce((a, t) => a + t.wins, 0);
  assert.ok(Math.abs(wins - out.games) < 0.001, `${wins.toFixed(2)} wins over ${out.games} games`);
});

check("a stronger team really is likelier to make it", () => {
  const base = league();
  base.strength["1"] = { mean: 130, stdev: 25 };
  base.strength["2"] = { mean: 92, stdev: 25 };
  const out = sim.seasonOdds(base);
  const best = sim.oddsFor(out, "1");
  const worst = sim.oddsFor(out, "2");
  assert.ok(best.playoffs > 0.85, `the best team read ${best.playoffs.toFixed(3)}`);
  assert.ok(worst.playoffs < 0.25, `the worst team read ${worst.playoffs.toFixed(3)}`);
  assert.ok(best.wins > worst.wins + 3);
});

check("a season already won is not a coin toss", () => {
  /* Every game played, and one team miles clear on the RECORD while
     scoring the fewest points in the league. A simulation that ignored
     `wins` would hand this team last place rather than first — and that
     is the failure mode that renders most believably, because the
     percentages still add up.

     The disagreement between the two keys is the whole fixture. The first
     version gave the clear team the most points as well, so `pointsFor`
     alone still sorted it top and zeroing `startWins` changed nothing:
     the check passed against a simulation that had thrown the record
     away. A mutation that passes is not a test. */
  const base = league();
  base.schedule.matchups.forEach((m) => { if (!m.playoff) m.winner = "HOME"; });
  base.teams = base.teams.map((t, i) => ({
    ...t,
    wins: i === 0 ? 13 : 3,
    pointsFor: i === 0 ? 1200 : 1500,
  }));
  const out = sim.seasonOdds(base);
  assert.equal(out.games, 0);
  assert.equal(sim.oddsFor(out, "1").playoffs, 1);
  // And the other nine are not all tied for the six remaining seats: the
  // assertion above has to be about the record rather than about a sort
  // that happened to leave team 1 where the array already had it.
  assert.equal(sim.oddsFor(out, "2").seed, 2);
});

check("a record already made carries into a season still being played", () => {
  /* The half of the same rule that a finished season cannot reach: games
     remaining, so the sampler runs, and a team that has banked wins must
     stay ahead of one that has not. Identical strength on both sides, so
     the only thing separating them is what is already in the record. */
  const base = league();
  base.schedule.matchups.forEach((m, i) => {
    if (!m.playoff && i < 40) m.winner = "HOME";
  });
  base.teams = base.teams.map((t, i) => ({ ...t, wins: i === 0 ? 8 : 0 }));
  const out = sim.seasonOdds(base);
  assert.ok(out.games > 0, "there are games left to simulate");
  const banked = sim.oddsFor(out, "1");
  const rest = sim.oddsFor(out, "2");
  assert.ok(
    banked.playoffs > rest.playoffs + 0.3,
    `8-0 read ${banked.playoffs.toFixed(3)} against 0-0's ${rest.playoffs.toFixed(3)}`
  );
});

check("points for is the tiebreak, exactly as the standings table sorts", () => {
  /* Two teams on identical records where one has scored more. If the
     simulation ranked on wins alone the tie would be broken by array
     order, which is the "a constant presented as a ranking" failure the
     standings panel already shipped once. */
  const base = league({ playoffTeams: 1, playoffWeeks: 1 });
  base.schedule.matchups.forEach((m) => { if (!m.playoff) m.winner = "HOME"; });
  base.teams = base.teams.map((t, i) => ({
    ...t,
    wins: 7,
    pointsFor: i === 4 ? 1500 : 1000,
  }));
  const out = sim.seasonOdds(base);
  assert.equal(sim.oddsFor(out, "5").playoffs, 1);
});

/* ---- determinism ---------------------------------------------------- */

check("the same league gives the same answer twice", () => {
  // A number that moves when nothing happened is a number nobody can act
  // on, which is why the RNG is seeded rather than Math.random().
  const a = sim.seasonOdds(league());
  const b = sim.seasonOdds(league());
  assert.deepEqual(a.teams, b.teams);
});

check("and a different seed is a different sample, not a different answer", () => {
  const a = sim.seasonOdds({ ...league(), seed: 1 });
  const b = sim.seasonOdds({ ...league(), seed: 999 });
  assert.notDeepEqual(a.teams, b.teams);
  a.teams.forEach((row, i) => {
    assert.ok(Math.abs(row.playoffs - b.teams[i].playoffs) < 0.03);
  });
});

check("a league's seed is stable, and moves with its week", () => {
  assert.equal(sim.seedFor("lg1", 3), sim.seedFor("lg1", 3));
  assert.notEqual(sim.seedFor("lg1", 3), sim.seedFor("lg1", 4));
  assert.notEqual(sim.seedFor("lg1", 3), sim.seedFor("lg2", 3));
});

/* ---- the bye bracket, derived and checkable ------------------------- */

check("six of twelve in three weeks is two byes", () => {
  assert.equal(sim.byeSeats(6, 3), 2);
});

check("four in two weeks and eight in three are none", () => {
  assert.equal(sim.byeSeats(4, 2), 0);
  assert.equal(sim.byeSeats(8, 3), 0);
});

check("a bracket that does not fit the weeks published refuses the number", () => {
  /* A two-week championship, a consolation round counted as a playoff
     week, anything this does not model. The derivation is only worth
     printing because it can be checked, and this is the check. */
  assert.equal(sim.byeSeats(6, 4), null);
  assert.equal(sim.byeSeats(4, 3), null);
  assert.equal(sim.byeSeats(6, null), null);
  assert.equal(sim.byeSeats(null, 3), null);
});

check("a refused bracket costs the bye odds and not the playoff odds", () => {
  const out = sim.seasonOdds(league({ playoffWeeks: 4 }));
  assert.equal(out.byeSeats, null);
  out.teams.forEach((t) => {
    assert.equal(t.bye, null);
    assert.ok(t.playoffs > 0);
  });
});

check("two byes go to two teams a season, so the odds add to two", () => {
  const out = sim.seasonOdds(league());
  assert.equal(out.byeSeats, 2);
  const total = out.teams.reduce((a, t) => a + t.bye, 0);
  assert.ok(Math.abs(total - 2) < 0.001, `byes add to ${total.toFixed(3)}`);
});

/* ---- every refusal --------------------------------------------------- */

check("no schedule is no simulation", () => {
  // Every Sleeper league: it publishes no season schedule at all.
  assert.equal(sim.seasonOdds({ ...league(), schedule: null }), null);
});

check("a schedule with no regular season is refused", () => {
  const bad = league();
  bad.schedule = { ...bad.schedule, regularSeasonWeeks: 0 };
  assert.equal(sim.seasonOdds(bad), null);
});

check("ONE unprojectable roster refuses the whole table", () => {
  /* The assertion this suite most exists for after the invariant. A team
     Juke cannot price is not a team that can be left out: every other team
     plays it, so dropping it silently makes somebody's schedule easier —
     and a nine-team simulation of a ten-team league produces perfectly
     reasonable percentages. */
  const bad = league();
  delete bad.strength["4"];
  assert.equal(sim.seasonOdds(bad), null);

  const nan = league();
  nan.strength["4"] = { mean: Number.NaN, stdev: 25 };
  assert.equal(sim.seasonOdds(nan), null);
});

check("no playoff seat count draws no playoff odds", () => {
  // Rather than "0% to make it", which is a real number answering a
  // question nobody asked.
  const out = sim.seasonOdds(league({ playoffTeams: null }));
  assert.equal(out.playoffTeams, null);
  out.teams.forEach((t) => assert.equal(t.playoffs, null));
  // The projected record survives, because it needs no bracket.
  out.teams.forEach((t) => assert.ok(t.wins > 0));
});

check("a fixture naming a team the league does not list is skipped, not fatal", () => {
  const bad = league();
  bad.schedule.matchups.push({
    week: 2, home: { teamId: "ghost" }, away: { teamId: "1" }, winner: "UNDECIDED", playoff: false,
  });
  const out = sim.seasonOdds(bad);
  assert.ok(out);
  const total = out.teams.reduce((a, t) => a + t.wins, 0);
  // The ghost game contributes no win to anybody.
  assert.ok(Math.abs(total - out.games) > 0.5);
});

check("oddsFor answers null rather than guessing", () => {
  const out = sim.seasonOdds(league());
  assert.equal(sim.oddsFor(out, null), null);
  assert.equal(sim.oddsFor(null, "1"), null);
  assert.equal(sim.oddsFor(out, "nobody"), null);
});

/* ---- what it costs --------------------------------------------------- */

{
  const fixture = league();
  const t0 = process.hrtime.bigint();
  sim.seasonOdds(fixture);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  note.push(`--  ${sim.SIMS} seasons of a ten-team league: ${ms.toFixed(0)}ms`);
  check("and it is affordable on the screen that draws it", () => {
    // Not a benchmark with a threshold nobody can reproduce: a bound loose
    // enough to survive a slow machine and tight enough that a change which
    // made this quadratic would be caught.
    assert.ok(ms < 2000, `took ${ms.toFixed(0)}ms`);
  });
}

console.log(note.join("\n"));
if (fails.length) {
  console.error(`\nFAIL ${fails.length}\n  x ` + fails.join("\n  x "));
  process.exit(1);
}
console.log(`\nOK — ${note.filter((l) => l.startsWith("ok")).length} checks on the season simulation`);
