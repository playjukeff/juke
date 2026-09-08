/* The tier ladder, which now decides what content a reader can see.
 *
 * `meetsTier()` was arithmetic nobody depended on until UpgradeGate started
 * asking it whether to draw a room's section. It is three lines and it is
 * the kind of three lines that fails open — and a gate that fails open is
 * indistinguishable from no gate, because the content renders and nothing
 * errors.
 *
 * lib/tiers.js imports nothing, so this runs with no npm install like every
 * other step in tests.yml.
 *
 * Run: node scripts/test_tiers.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { meetsTier, tierLabel, leagueCap, TIER_ORDER, TIER_LABEL, LEAGUE_CAP } = await import(
  pathToFileURL(path.resolve("web/src/lib/tiers.js")).href
);

/* The worker's own copy, imported rather than restated -- the same call
   test_history_ownership.py makes about store.js's SQL. A second literal
   here would be a third place the caps are written down, and it would pass
   while the two deployables disagreed. store.js imports only names.js,
   which is dependency-free, so this still needs no npm install. */
const { LEAGUE_CAP: WORKER_LEAGUE_CAP } = await import(
  pathToFileURL(path.resolve("worker/store.js")).href
);

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failures += 1; console.log("FAIL " + name + "\n     " + e.message); }
};

check("a tier reaches itself and everything below it", () => {
  assert.equal(meetsTier("pro", "pro"), true);
  assert.equal(meetsTier("allaccess", "pro"), true);
  assert.equal(meetsTier("allaccess", "free"), true);
});

check("and never reaches above itself", () => {
  assert.equal(meetsTier("free", "pro"), false);
  assert.equal(meetsTier("pro", "allaccess"), false);
  assert.equal(meetsTier("free", "allaccess"), false);
});

check("an unknown tier reaches nothing", () => {
  /* tierStore holds `tier: null` until /me answers. A gate that fell open
     there would flash paid content at a Free account on every page load,
     and a gate that flashes is not a gate. */
  assert.equal(meetsTier(null, "pro"), false);
  assert.equal(meetsTier(undefined, "pro"), false);
  assert.equal(meetsTier("enterprise", "pro"), false, "and neither does a tier that does not exist");
});

check("an unknown REQUIREMENT is not a free pass either", () => {
  assert.equal(
    meetsTier("free", "platinum"), false,
    "a gate naming a tier this file has never heard of must not open"
  );
});

check("no gate at all is open to everybody", () => {
  assert.equal(meetsTier("free", null), true);
  assert.equal(meetsTier(null, undefined), true, "an ungated section is ungated even before /me answers");
});

check("the ladder is ordered, and every tier in it has a label and a cap", () => {
  assert.deepEqual(TIER_ORDER, ["free", "pro", "allaccess"]);
  for (const tier of TIER_ORDER) {
    assert.ok(TIER_LABEL[tier], tier + " has a customer-facing name");
    assert.equal(typeof LEAGUE_CAP[tier], "number", tier + " has a cap");
  }
});

check("the labels are the customer's words, never the worker's", () => {
  /* A badge or a gate chip printing "PRO" would be showing somebody an
     internal identifier. tierLabel() is the only thing standing between
     the enum and a screen. */
  for (const tier of TIER_ORDER) {
    assert.equal(
      /^(free|pro|allaccess)$/.test(tierLabel(tier)) && tier !== "free", false,
      tier + " must not render as its enum value"
    );
  }
  assert.equal(tierLabel("pro"), "Season Pass");
  assert.equal(tierLabel("allaccess"), "Multi-League");
});

check("an unknown tier reads and prices as Free, never as a paid one", () => {
  assert.equal(tierLabel("nonsense"), "Free");
  assert.equal(leagueCap("nonsense"), 0);
  assert.equal(leagueCap(null), 0);
});

check("the ladder's caps rise with it", () => {
  /* Not the same fact as the ordering, and deliberately asserted apart
     from it: meetsTier() compares POSITION and the cap is a separate
     column, so a future tier that raised one without the other would pass
     one of these two and not the other. */
  const caps = TIER_ORDER.map((t) => leagueCap(t));
  assert.deepEqual(caps, caps.slice().sort((a, b) => a - b));
});

check("the client's caps and the worker's are the same caps", () => {
  /* Two copies across the client/worker boundary, because those are two
     separate deployables with no module system between them -- tiers.js's
     own header says so, and says "keep the values in sync if either
     changes". Nothing enforced that until this check.

     A drift does not throw. It fails as a gate disagreeing with the thing
     it gates: raise the client's cap alone and the reader is invited to
     connect a league the worker then refuses with a bare tier-limit 403;
     raise the worker's alone and a cap the account has actually paid for
     is never offered. Both render, both look deliberate, and neither is a
     number anybody re-reads. */
  assert.deepEqual(
    LEAGUE_CAP, WORKER_LEAGUE_CAP,
    "web/src/lib/tiers.js and worker/store.js disagree about LEAGUE_CAP"
  );
});

console.log(failures ? `\n${failures} FAILED` : "\nOK — the tier ladder");
process.exit(failures ? 1 : 0);
