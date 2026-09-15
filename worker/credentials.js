/* ==========================================================
   Juke — sealing a platform credential at rest

   ESPN has no OAuth for third parties, so the only way to read a PRIVATE
   league is the `espn_s2` + `SWID` cookie pair the reader pastes in. That
   pair is not a scoped read token: it is a whole-account ESPN session, and
   it can set a lineup or accept a trade as the person who pasted it.

   `0005_leagues.sql` says in its own header that "there is no token here,
   no OAuth grant, and nothing this worker could send that would change
   anybody's roster", and that this is what makes "Juke never edits your
   league" cheap to keep rather than a policy somebody has to remember.
   **This file is where that stops being free.** From here the promise is
   kept by what the code does, so what it does is written down.

   ---- Four properties, and each one is a decision ----

   **AES-GCM, so tampering is detected rather than decrypted.** A cipher
   with no authentication would hand a modified blob back as plausible
   plaintext. `open()` answers null for a wrong key, a truncated blob and a
   flipped bit alike.

   **The account and the league are the additional data.** A sealed blob is
   bound to the row it was written for, so a credential lifted from one row
   and pasted onto another does not decrypt — and the attack that buys is
   the interesting one: somebody who can WRITE the database but not read
   the key cannot copy a stranger's credential onto their own league row
   and have this worker spend it for them.

   **A missing key refuses; it never falls back.** Storing the pair in the
   clear because `LEAGUE_CRED_KEY` was not set is the failure that would
   look exactly like success — a connected private league, working, with an
   account-acting credential sitting in plain text. `seal()` answers null
   and the connect route says the deployment is not configured for it.

   **Nothing here throws**, which is store.js's rule and applies for the
   same reason one level in: every caller is on a path whose contract is to
   fail by refusing rather than by rejecting a promise.

   ---- The key ----

   32 random bytes, base64, set with `wrangler secret put LEAGUE_CRED_KEY`
   on the worker — the same place `CLERK_SECRET_KEY` lives and the same
   reason: it is not in the page, not in git, and not in the Pages project.
   See worker/README.md for how to mint one.

   Rotating it invalidates every stored credential, which is a reconnect
   rather than a loss: nothing else in the database depends on it, and a
   credential that cannot be opened is reported as "reconnect your league"
   rather than as an error. The `v1.` prefix is what lets a future scheme
   be told apart from this one rather than guessed at.
   ========================================================== */

const VERSION = "v1";
const IV_BYTES = 12;   // AES-GCM's own nominal size; anything else costs speed
const KEY_BYTES = 32;  // AES-256

/* Is this deployment configured to hold credentials at all?

   Read by the connect route BEFORE it asks ESPN anything, so a deployment
   with no key refuses the private branch up front instead of validating
   somebody's cookies and then discovering it has nowhere to put them. */
export function canSealCredentials(env) {
  return !!(env && typeof env.LEAGUE_CRED_KEY === "string" && env.LEAGUE_CRED_KEY.length >= 40);
}

function bytesFromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64FromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function importKey(env) {
  if (!canSealCredentials(env)) return null;
  try {
    const raw = bytesFromBase64(env.LEAGUE_CRED_KEY);
    /* A key of the wrong length is a configuration mistake rather than an
       attack, and it is worth refusing loudly here: importKey would accept
       128 or 192 bits happily, so a truncated secret would "work" at a
       strength nobody chose. */
    if (raw.length !== KEY_BYTES) {
      console.error("LEAGUE_CRED_KEY is " + raw.length + " bytes, expected " + KEY_BYTES);
      return null;
    }
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch (err) {
    console.error("LEAGUE_CRED_KEY is not usable:", err && err.message);
    return null;
  }
}

/* What a blob is bound to.

   Not a secret and not a salt — it is authenticated rather than encrypted,
   so it is checked on the way out and does not need to be. */
function scopeBytes(scope) {
  const s = scope || {};
  return new TextEncoder().encode(
    [s.clerkId || "", s.provider || "", s.leagueId || ""].join("|")
  );
}

/* Seal a credential object for one account's one league.

   `value` is whatever the caller wants back — for ESPN, `{ espnS2, swid }`.
   It is JSON on the way in because the shape is the platform's and will
   differ per platform; the crypto has no opinion about it. */
export async function sealCredential(value, scope, env) {
  const key = await importKey(env);
  if (!key) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cipher = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: scopeBytes(scope) }, key, plain
    ));
    return VERSION + "." + base64FromBytes(iv) + "." + base64FromBytes(cipher);
  } catch (err) {
    console.error("sealCredential failed:", err && err.message);
    return null;
  }
}

/* Open one, or answer null.

   Null covers every way this can go wrong and deliberately does not
   distinguish them for the caller: a wrong key, a rotated key, a tampered
   blob, a blob written for a different row and a blob from a scheme this
   build does not know are all "you need to reconnect this league", and
   there is nothing a reader could do differently for any of them. */
export async function openCredential(blob, scope, env) {
  if (typeof blob !== "string" || !blob) return null;
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const key = await importKey(env);
  if (!key) return null;
  try {
    const iv = bytesFromBase64(parts[1]);
    const cipher = bytesFromBase64(parts[2]);
    if (iv.length !== IV_BYTES) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: scopeBytes(scope) }, key, cipher
    );
    const value = JSON.parse(new TextDecoder().decode(plain));
    return value && typeof value === "object" ? value : null;
  } catch {
    /* Not logged. A failed open is the expected outcome after a key
       rotation, so logging it would fill the log the next real fault has
       to be found in -- which is the argument tell() already makes about
       a dead socket. */
    return null;
  }
}
