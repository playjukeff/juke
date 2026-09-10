/* The live injury vocabulary, and that it has not drifted from the pipeline's.

     node worker/test-status.mjs

   status.js writes INJURY_CODES a second time, in JavaScript, so a live
   designation reads through the same injurySeverity() a board one does. Two
   copies of one table drift silently -- a code the worker spells one way and
   the board another does not throw, it just stops being recognised -- so
   this reads the Python table out of build_players.py and holds every entry
   to it, the same arrangement test_engine.py has for normalise(). */
import fs from "node:fs";
import { INJURY_CODES, injuryCode } from "./status.js";

let failures = 0;
const check = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? "ok  " : "x   ") + what + (ok ? "" : "\n      expected " + JSON.stringify(want) + "\n      received " + JSON.stringify(got)));
};

const py = fs.readFileSync(new URL("../scripts/build_players.py", import.meta.url), "utf8");
const block = py.match(/^INJURY_CODES = \{([\s\S]*?)^\}/m);
check("build_players.py still has an INJURY_CODES table to compare against", !!block, true);
const pairs = [...(block ? block[1] : "").matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
check("and it is not empty", pairs.length > 10, true);
for (const [k, v] of pairs) check(`"${k}" means ${v} in both languages`, INJURY_CODES[k], v);

console.log("\n--- the platforms' own spellings ---");
check("ESPN OUT is out", injuryCode("OUT"), "O");
check("ESPN QUESTIONABLE", injuryCode("QUESTIONABLE"), "Q");
check("ESPN DOUBTFUL", injuryCode("DOUBTFUL"), "D");
check("ESPN INJURY_RESERVE", injuryCode("INJURY_RESERVE"), "IR");
check("ESPN SUSPENSION", injuryCode("SUSPENSION"), "SUS");
check("ESPN DAY_TO_DAY reads as questionable", injuryCode("DAY_TO_DAY"), "Q");
check("Sleeper Out", injuryCode("Out"), "O");
check("Sleeper IR", injuryCode("IR"), "IR");
check("Sleeper Sus", injuryCode("Sus"), "SUS");

console.log("\n--- healthy is an answer, unknown is not ---");
check("ESPN ACTIVE is healthy, which is a real answer", injuryCode("ACTIVE"), "");
check("an empty string is healthy", injuryCode(""), "");
check("no field at all is no answer", injuryCode(null), null);
check("a spelling nobody knows is no answer, never a guess", injuryCode("WEIRD_NEW"), null);
check("Sleeper's NA is not claimed as healthy", injuryCode("NA"), null);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — the live injury vocabulary");
process.exit(failures ? 1 : 0);
