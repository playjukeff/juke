/* What the app cannot reach, computed rather than remembered.
 *
 * ---- Why this exists ----
 *
 * CLAUDE.md kept three hand-written lists of components that are "complete and
 * unrendered rather than deleted" - the analytics grid Your Insights replaced,
 * the marketing homepage Flow v3 replaced, and the three sections the owner
 * took off the homepage. Every one of those lists was true when it was
 * written, and by 10 September 2026 they named 16 of the 28 files that are
 * actually unreachable.
 *
 * What they missed is the shape worth guarding: a component does not die on
 * its own, it dies when the last thing importing it dies. LobbyBar.jsx went
 * from "shows on exactly one screen" - CLAUDE.md's own words, in its Still
 * Open list - to reachable by nothing, and took SiteNav, MobileNavSheet and
 * RoomsNavMenu with it. Nothing failed and nothing said so. The imports knew;
 * the prose did not.
 *
 * So the list is a fact about the import graph, and a second copy of it in
 * prose is the written-down-twice rule with dead code in it. This script reads
 * the graph. The set below is the state it is expected to find, and any
 * difference is a decision somebody should make on purpose: a file newly
 * unreachable, a file revived, or a file finally deleted.
 *
 * ---- Deliberately not a delete list ----
 *
 * Unreachable is not the same as unwanted. This project's own rule is to prove
 * the replacement works before deleting what it replaces, and the Insights
 * cards are kept on purpose. This says what is dead, never what to remove.
 *
 * Dependency-free and stdlib-only, like every other node step in tests.yml.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(process.argv[2] || ".");
const SRC = join(ROOT, "web/src");
const ENTRIES = ["web/src/main.jsx", "web/src/entry-server.jsx"];

/* Three roots died and each took its own subtree. Grouping by that rather than
   listing 28 names flat is what makes a new entry readable: a file arriving
   under an existing root is a component whose last caller went, and a file
   arriving on its own is something else entirely. */
const DEAD = {
  "the analytics grid Your Insights replaced": [
    "web/src/components/AnalyticsCard.jsx",
    "web/src/components/AvgRoundByPositionCard.jsx",
    "web/src/components/DraftCapitalAllocationCard.jsx",
    "web/src/components/MostDraftedCard.jsx",
    "web/src/components/NetAdpValueCard.jsx",
    "web/src/components/PositionalWeaknessHeatmap.jsx",
    "web/src/components/RecommendationEngine.jsx",
    "web/src/components/TrendChart.jsx",
    "web/src/components/WeakestSpotCard.jsx",
    "web/src/components/WhatToRunNext.jsx",
    "web/src/components/WinPctTrendCard.jsx",
    "web/src/components/recommendation.js",
  ],
  "the marketing header ShellHeader replaced": [
    "web/src/components/Header.jsx",
    "web/src/components/LobbyBar.jsx",
    "web/src/components/MobileNavSheet.jsx",
    "web/src/components/RoomsNavMenu.jsx",
    "web/src/components/SiteNav.jsx",
  ],
  "the marketing homepage HomeAlive replaced": [
    "web/src/components/ClosingCta.jsx",
    "web/src/components/Hero.jsx",
    "web/src/components/PhaseRail.jsx",
    "web/src/components/RoomsGrid.jsx",
    "web/src/components/ScoringDemoCard.jsx",
    "web/src/components/ShowYourWorking.jsx",
    "web/src/components/TakeAPick.jsx",
    "web/src/components/phone/HomePhone.jsx",
  ],
  /* No importer and no reason recorded anywhere. Named separately rather than
     filed under a root, because "nobody imports it and nobody wrote down why"
     is a different fact from "its caller went". */
  "unreachable on its own, reason not recorded": [
    "web/src/components/NewMockPanel.jsx",
    "web/src/components/TeamTab.jsx",
    "web/src/components/shell/RoomHero.jsx",
  ],
};

const posix = (p) => p.split(String.fromCharCode(92)).join("/");

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/[.](jsx|js)$/.test(e)) files.push(p);
  }
})(SRC);

const seen = new Set();
const queue = ENTRIES.map((p) => join(ROOT, p)).filter((p) => existsSync(p));
if (queue.length === 0) {
  console.error("no entry point found - check ENTRIES");
  process.exitCode = 1;
}
while (queue.length) {
  const f = queue.pop();
  if (seen.has(resolve(f)) || !existsSync(f)) continue;
  seen.add(resolve(f));
  /* Comments first. This repository quotes imports, tags and filenames in its
     own prose constantly, and smoke-pages.mjs already reported a font as a 404
     for exactly that reason. */
  const text = readFileSync(f, "utf8")
    .replace(/[/][*][^]*?[*][/]/g, "")
    .replace(/^\s*[/][/].*$/gm, "");
  const specs = [
    ...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*[(]\s*["']([^"']+)["']\s*[)]/g),
    ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
  ].map((m) => m[1]).filter((s) => s.startsWith("."));
  for (const s of specs) {
    const base = resolve(dirname(f), s);
    for (const c of [base, base + ".jsx", base + ".js",
                     join(base, "index.jsx"), join(base, "index.js")]) {
      if (existsSync(c) && statSync(c).isFile()) { queue.push(c); break; }
    }
  }
}

const unreachable = new Set(
  files.filter((p) => !seen.has(resolve(p))).map((p) => posix(relative(ROOT, p))));
const recorded = new Map();
for (const [why, list] of Object.entries(DEAD)) for (const p of list) recorded.set(p, why);

const appeared = [...unreachable].filter((p) => !recorded.has(p)).sort();
const revived = [...recorded.keys()].filter((p) => !unreachable.has(p) && existsSync(join(ROOT, p))).sort();
const gone = [...recorded.keys()].filter((p) => !existsSync(join(ROOT, p))).sort();

const lines = (p) => readFileSync(join(ROOT, p), "utf8").split("\n").length;
const total = [...unreachable].reduce((n, p) => n + lines(p), 0);
console.log(`${files.length - unreachable.size} of ${files.length} files under web/src are reachable`);
console.log(`${unreachable.size} are not, and they are ${total} lines.`);

let bad = false;
if (appeared.length) {
  bad = true;
  console.log("\nNEWLY UNREACHABLE - something stopped importing these:");
  for (const p of appeared) console.log(`  ${p}  (${lines(p)} lines)`);
  console.log("  Decide whether that was intended, then add them above or restore the caller.");
}
if (revived.length) {
  bad = true;
  console.log("\nRECORDED AS DEAD BUT REACHABLE AGAIN:");
  for (const p of revived) console.log(`  ${p}  (${recorded.get(p)})`);
  console.log("  Take them out of the list above.");
}
if (gone.length) {
  bad = true;
  console.log("\nRECORDED AS DEAD AND NOW DELETED:");
  for (const p of gone) console.log(`  ${p}`);
  console.log("  Take them out of the list above.");
}
if (bad) process.exitCode = 1;
else console.log("\nOK - the unreachable set is exactly what is recorded.");
