/* Sealing a platform credential, offline.

     node worker/test-credentials.mjs

   Nothing is mocked: this is the real WebCrypto AES-GCM the worker runs,
   with a real generated key, because the properties worth asserting are
   cryptographic ones and a stub would agree with itself.

   What it is here to hold is the list in credentials.js's own header --
   that a missing key REFUSES rather than falling back to plaintext, and
   that a blob is bound to the row it was written for. Both of those are
   failures that would look exactly like success on every screen. */
import { sealCredential, openCredential, canSealCredentials } from "./credentials.js";

let failures = 0;
const check = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? "ok  " : "x   ") + what + (ok ? "" : "\n      expected " + JSON.stringify(want) + "\n      received " + JSON.stringify(got)));
};

const keyOf = (bytes) => {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin);
};

const env = { LEAGUE_CRED_KEY: keyOf(32) };
const other = { LEAGUE_CRED_KEY: keyOf(32) };

const scope = { clerkId: "user_alice", provider: "espn", leagueId: "1075383" };
const pair = { espnS2: "AEB%2Fexample-session-value", swid: "{1234ABCD-5678-90EF-1234-567890ABCDEF}" };

console.log("--- a round trip ---");
const sealed = await sealCredential(pair, scope, env);
check("a credential seals", typeof sealed === "string" && sealed.length > 0, true);
check("and opens back to exactly what went in", await openCredential(sealed, scope, env), pair);
check("the blob carries its scheme so a later one can be told apart", sealed.slice(0, 3), "v1.");
check("the plaintext is not in the blob", sealed.includes("example-session-value"), false);

console.log("\n--- the same value seals differently every time ---");
const again = await sealCredential(pair, scope, env);
check("two seals of one value differ (the iv is random)", sealed === again, false);
check("and both open", await openCredential(again, scope, env), pair);

console.log("\n--- bound to the row it was written for ---");
check("another account cannot open it",
  await openCredential(sealed, { ...scope, clerkId: "user_mallory" }, env), null);
check("nor the same account on another league",
  await openCredential(sealed, { ...scope, leagueId: "9999999" }, env), null);
check("nor the same league under another provider",
  await openCredential(sealed, { ...scope, provider: "cbs" }, env), null);

console.log("\n--- a wrong or rotated key is a reconnect, not a crash ---");
check("a different key opens nothing", await openCredential(sealed, scope, other), null);

console.log("\n--- tampering is detected rather than decrypted ---");
const parts = sealed.split(".");
const flipped = parts[2].slice(0, -2) + (parts[2].slice(-2) === "AA" ? "BB" : "AA");
check("a flipped byte of ciphertext", await openCredential(parts[0] + "." + parts[1] + "." + flipped, scope, env), null);
check("a truncated blob", await openCredential(sealed.slice(0, sealed.length - 6), scope, env), null);
check("somebody else's iv", await openCredential(parts[0] + "." + btoa("123456789012") + "." + parts[2], scope, env), null);
check("a scheme this build does not know", await openCredential("v2." + parts[1] + "." + parts[2], scope, env), null);
check("not a blob at all", await openCredential("hello", scope, env), null);
check("nothing at all", await openCredential("", scope, env), null);
check("null", await openCredential(null, scope, env), null);

console.log("\n--- a missing key refuses, and never falls back to plaintext ---");
check("canSealCredentials says so up front", canSealCredentials({}), false);
check("and for a key too short to be one", canSealCredentials({ LEAGUE_CRED_KEY: "nope" }), false);
check("and yes for a real one", canSealCredentials(env), true);
check("sealing without a key answers null", await sealCredential(pair, scope, {}), null);
check("opening without a key answers null", await openCredential(sealed, scope, {}), null);

console.log("\n--- a key of the wrong length is refused rather than quietly weakened ---");
/* 48 real bytes, base64-clean and long enough to pass the old character
   count, so this reaches the KEY_BYTES guard rather than tripping the
   decoder on the way -- the first version of this line was rejected as
   "Invalid character" and passed for a reason it was not about. */
check("a valid base64 key of the wrong length", await sealCredential(pair, scope, { LEAGUE_CRED_KEY: keyOf(48) }), null);
check("and not base64 at all", await sealCredential(pair, scope, { LEAGUE_CRED_KEY: "!".repeat(48) }), null);

/* And the UP-FRONT guard has to refuse those too, which is a different
   assertion from the two above rather than a restatement of them.

   `canSealCredentials()` is read by the connect route BEFORE it contacts
   ESPN or CBS, so that a deployment with no usable key never spends
   somebody's session finding out. It counted characters (`length >= 40`),
   which a 48-byte key passes -- so a real CBS connect on the live worker
   sent the reader's cookie upstream, validated it, and only then failed to
   seal. Nothing was stored, and the cookie had already travelled.

   These are the assertions that would have caught it. */
console.log("\n--- and the up-front guard refuses them too, before anything is sent ---");
check("48 real bytes is not a 32-byte key", canSealCredentials({ LEAGUE_CRED_KEY: keyOf(48) }), false);
check("nor is 16", canSealCredentials({ LEAGUE_CRED_KEY: keyOf(16) }), false);
check("nor is something that is not base64", canSealCredentials({ LEAGUE_CRED_KEY: "!".repeat(48) }), false);
check("a 32-byte key is one", canSealCredentials({ LEAGUE_CRED_KEY: keyOf(32) }), true);
/* Pasting from a terminal picks up whitespace, which is a mis-paste rather
   than a wrong key -- the bytes are right either side of the trim. */
check("and surrounding whitespace does not disqualify it",
  canSealCredentials({ LEAGUE_CRED_KEY: "  " + keyOf(32) + "\n" }), true);

console.log(failures ? `\nFAIL — ${failures} failing` : "\nOK — sealing a platform credential");
process.exit(failures ? 1 : 0);
