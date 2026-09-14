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

/* Several roots died and each took its own subtree. Grouping by that rather
   than listing every name flat is what makes a new entry readable: a file
   arriving under an existing root is a component whose last caller went, and a
   file arriving on its own is something else entirely.

   Deliberately no count in this sentence. It said "28 names" while the set
   below held 51, and then 109 — prose restating a number the data already
   carries, drifting exactly the way this script exists to stop. The run prints
   the real figure on every invocation; that is the only place it belongs. */
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
  /* The cutover: v3 became the site, so App.jsx renders two apps instead of
     nine screens and every production screen lost its only caller in one
     commit. This is the largest single entry this file will ever have, and
     it is exactly the shape the script exists for — App.jsx's diff removed
     seven imports, and twenty-three files died.

     The three myleague/* panels, decision/Confidence.jsx, icons.jsx and
     ledger/VerdictBadge.jsx are the second order: nothing here imported them
     directly, MyLeagueScreen did, and it went. That is LobbyBar taking four
     files with it, at scale.

     None of them is deleted, and that is the same rule as everywhere else:
     prove the replacement works on the running site before removing what it
     replaced. Every capability has an address in v3 (V3App.jsx's route table
     names each one), so what is owed is a deploy and a look, not a decision
     about whether the feature exists. */
  "the production screens v3 replaced at the cutover": [
    "web/src/components/BoardPeek.jsx",
    "web/src/components/ComingSoonModal.jsx",
    "web/src/components/DraftsScreen.jsx",
    "web/src/components/HistoryScreen.jsx",
    "web/src/components/HomeAlive.jsx",
    "web/src/components/HomeProof.jsx",
    "web/src/components/Homepage.jsx",
    "web/src/components/MyLeagueScreen.jsx",
    "web/src/components/RoomsGridAlive.jsx",
    "web/src/components/RoomsLobby.jsx",
    "web/src/components/YouScreen.jsx",
    "web/src/components/decision/Confidence.jsx",
    "web/src/components/icons.jsx",
    "web/src/components/ledger/VerdictBadge.jsx",
    "web/src/components/myleague/DraftReportPanel.jsx",
    "web/src/components/myleague/LeagueBar.jsx",
    "web/src/components/myleague/MoveCard.jsx",
    "web/src/components/myleague/MyLeagueDemo.jsx",
    "web/src/components/myleague/PastWeekPanel.jsx",
    "web/src/components/myleague/SeasonEndPanel.jsx",
    "web/src/components/myleague/SecondaryMoves.jsx",
    "web/src/components/myleague/StandingsPanel.jsx",
    "web/src/components/myleague/WeekStrip.jsx",
  ],
  /* No importer and no reason recorded anywhere. Named separately rather than
     filed under a root, because "nobody imports it and nobody wrote down why"
     is a different fact from "its caller went". */
  "unreachable on its own, reason not recorded": [
    "web/src/components/NewMockPanel.jsx",
    "web/src/components/TeamTab.jsx",
    "web/src/components/shell/RoomHero.jsx",
  ],
  /* The two portals main.jsx dropped at the cutover's last step. AppHeader
     mounted into #appbar-root and DraftRoom into #draftroom-root, and both
     had stopped drawing anything a reader could reach: #appbar is hidden
     unconditionally and #draftroom-root is empty on every v3 address. They
     were kept one pass longer than the screens they belong to precisely
     BECAUSE being reachable is what stopped this script proving them safe -
     so the graph could not argue for them, and the cutover declined to
     change two things at once on a site it was already moving.

     Removing two imports retired 58 files and 19,475 lines, which is the
     clearest demonstration this file has of its own premise: a component
     dies when its last caller does, and nobody can track that by hand. */
  "the two portals main.jsx dropped after the cutover": [
    "web/src/components/ActivityLog.jsx",
    "web/src/components/AnalysisTab.jsx",
    "web/src/components/AppHeader.jsx",
    "web/src/components/BottomSheet.jsx",
    "web/src/components/ChatPanel.jsx",
    "web/src/components/DraftBoardGrid.jsx",
    "web/src/components/DraftCockpitHeader.jsx",
    "web/src/components/DraftDecideScreen.jsx",
    "web/src/components/DraftEntryScreen.jsx",
    "web/src/components/DraftInsightsDashboard.jsx",
    "web/src/components/DraftLobby.jsx",
    "web/src/components/DraftLocker.jsx",
    "web/src/components/DraftLogDock.jsx",
    "web/src/components/DraftMenuOverlay.jsx",
    "web/src/components/DraftRoom.jsx",
    "web/src/components/DraftRoomEntry.jsx",
    "web/src/components/DraftRoomLoader.jsx",
    "web/src/components/DraftSettingsModal.jsx",
    "web/src/components/DraftWithFriendsModal.jsx",
    "web/src/components/EarlyAccessModal.jsx",
    "web/src/components/InProgressBand.jsx",
    "web/src/components/JukeValueAssistant.jsx",
    "web/src/components/LockerTable.jsx",
    "web/src/components/MobileAppTabBar.jsx",
    "web/src/components/MobileDraftTabBar.jsx",
    "web/src/components/PickClockBand.jsx",
    "web/src/components/PickQueueRail.jsx",
    "web/src/components/PickTicker.jsx",
    "web/src/components/PicksRail.jsx",
    "web/src/components/PlayerProfileModal.jsx",
    "web/src/components/PlayerQueueSidebar.jsx",
    "web/src/components/PlayersTab.jsx",
    "web/src/components/PracticeScenarios.jsx",
    "web/src/components/QueueList.jsx",
    "web/src/components/RoomPanel.jsx",
    "web/src/components/ShareBar.jsx",
    "web/src/components/SonarLoader.jsx",
    "web/src/components/chatHelpers.js",
    "web/src/components/insights/InsightsSidebar.jsx",
    "web/src/components/insights/ViewField.jsx",
    "web/src/components/insights/ViewLeftOnBoard.jsx",
    "web/src/components/insights/ViewLeverage.jsx",
    "web/src/components/insights/ViewTrust.jsx",
    "web/src/components/insights/YourInsights.jsx",
    "web/src/components/insights/tokens.js",
    "web/src/components/phone/ChatTabPhone.jsx",
    "web/src/components/phone/CockpitHeaderPhone.jsx",
    "web/src/components/phone/DraftBoardPeekPhone.jsx",
    "web/src/components/phone/DraftRoomPhone.jsx",
    "web/src/components/phone/PlayerProfilePhone.jsx",
    "web/src/components/phone/PlayersTabPhone.jsx",
    "web/src/components/phone/QueueTabPhone.jsx",
    "web/src/components/phone/TeamTabPhone.jsx",
    "web/src/components/phone/playerColumnsPhone.js",
    "web/src/components/settings/DraftOrder.jsx",
    "web/src/components/settings/NotificationSettings.jsx",
    "web/src/components/settings/ScoringRules.jsx",
    "web/src/components/settings/SettingsControls.jsx",
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
