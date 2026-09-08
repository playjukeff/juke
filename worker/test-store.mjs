/* The write path's own foreign key, tested without a Clerk token.

   `saved_drafts.clerk_id` and `draft_history.clerk_id` both carry
   `REFERENCES users(clerk_id)`, and D1 enforces it — an insert against a
   clerk_id with no users row fails with `FOREIGN KEY constraint failed`.
   That row was only ever created by touchUser(), which is only called
   from `GET /me`, which nothing on the client has ever called. So every
   save and every history entry failed the moment it reached D1, for every
   account, from the day sync shipped.

   It was invisible to everything this project runs. test-auth.mjs covers
   only the signed-out path by construction (nothing offline can sign a
   Clerk token), the route answered a perfectly healthy 200, and every
   layer under it reports failure as a falsy value — so the page could say
   "could not reach your account" and nothing could say why.

   This is the level that can be tested offline: not whether D1 accepts the
   write, which needs a real database, but whether store.js ISSUES the user
   upsert alongside it. A stub binding records what was prepared. The
   database's own half is verified separately and once, by hand:

       wrangler d1 migrations apply juke_db --local -c worker/wrangler.toml
       wrangler d1 execute juke_db --local -c worker/wrangler.toml \
         --command "INSERT INTO draft_history (id,clerk_id,data,completed_at,updated_at) \
                    VALUES ('p','nobody','{}',1,1)"
       -> FOREIGN KEY constraint failed

       node worker/test-store.mjs

   Needs Node 22 or newer. */

import { putSavedDraft, putHistoryEntry, deleteUserData } from "./store.js";

const fails = [];
const note = [];
function check(name, cond) {
  if (cond) note.push("ok  " + name);
  else fails.push(name);
}

/* A D1 stub that records every statement prepared and every batch run.
   Deliberately not a mock of SQLite — this asserts what store.js asks for,
   which is the thing that was wrong. */
function stubDb(changes = 1) {
  const prepared = [];
  const batches = [];
  const db = {
    prepare(sql) {
      const stmt = { sql, bound: null, bind(...a) { stmt.bound = a; return stmt }, async run() { return { success: true } } };
      prepared.push(stmt);
      return stmt;
    },
    // `meta.changes` is not decoration here: putHistoryEntry() reads it to
    // tell an ordinary write from one the DO UPDATE refused, so a stub that
    // omitted it would exercise the fallback branch on every call and never
    // the real one. `changes` is the default so the ordinary path is what a
    // caller gets by default; a test that wants a refusal passes 0.
    async batch(stmts) { batches.push(stmts); return stmts.map(() => ({ success: true, meta: { changes } })); },
  };
  return { env: { DB: db }, prepared, batches };
}

for (const [label, call, wrote] of [
  ["a saved draft", (env) => putSavedDraft(env, "user_1", '{"v":2}'), true],
  // Three states rather than a boolean: see putHistoryEntry()'s own note on
  // why "refused" may not be a falsy value a caller can read as success.
  ["a history entry", (env) => putHistoryEntry(env, "user_1", "h1", '{"id":"h1"}', 123), "ok"],
]) {
  const { env, prepared, batches } = stubDb();
  const ok = await call(env);

  check(`${label}: reports success`, ok === wrote);
  check(`${label}: goes out as one batch, not two round trips`, batches.length === 1);

  const sql = prepared.map((s) => s.sql).join("\n");
  check(`${label}: creates the users row the foreign key requires`, /INSERT INTO users/.test(sql));
  check(`${label}: and does not error on a user who already exists`,
        /INSERT INTO users[\s\S]*ON CONFLICT\(clerk_id\) DO UPDATE/.test(sql));

  // The user upsert has to be IN the batch and BEFORE the row that
  // references it: a batch is ordered, and the foreign key is checked per
  // statement as it runs.
  const inBatch = batches[0] || [];
  check(`${label}: the user upsert is inside the batch`, inBatch.length === 2);
  check(`${label}: and runs before the row that references it`,
        /INSERT INTO users/.test(inBatch[0] ? inBatch[0].sql : ""));
  // By presence, not by position: saved_drafts binds clerk_id first and
  // draft_history binds it second (its own id leads). Asserting bound[0]
  // for both passed the draft and failed the history — the test being
  // wrong about a column order, which is exactly the kind of thing a
  // stub-based test invents if you let it describe the shape rather than
  // the property.
  check(`${label}: both statements are for the same account`,
        inBatch[0] && inBatch[1] &&
        inBatch[0].bound.includes("user_1") && inBatch[1].bound.includes("user_1"));
}

/* A history id that already belongs to somebody else.

   The SQL is what refuses it — scripts/test_history_ownership.py drives the
   real statement against real sqlite3 and asserts the row is untouched.
   What is testable HERE is the other half: that store.js reads the refusal
   off `changes` and says so, rather than reporting a write that did not
   happen. Both halves are needed, and only one of them is about SQL. */
{
  const { env } = stubDb(0);
  const ok = await putHistoryEntry(env, "user_1", "h1", '{"id":"h1"}', 123);
  check("a refused history write is reported as a conflict", ok === "conflict");
  check("and not as a falsy value a caller could read as an error",
        ok !== false && ok !== "error");
}

/* A binding that reports no `changes` at all.

   The SQL is what enforces the ownership; reading `changes` only decides
   what to SAY about it. So an unreadable meta has to fall to "written":
   the row is safe either way, and the alternative turns every ordinary save
   into a 409 the moment a binding stops reporting the field. */
{
  const prepared = [];
  const db = {
    prepare(sql) {
      const stmt = { sql, bound: null, bind(...a) { stmt.bound = a; return stmt } };
      prepared.push(stmt);
      return stmt;
    },
    async batch(stmts) { return stmts.map(() => ({ success: true })); },
  };
  const ok = await putHistoryEntry({ DB: db }, "user_1", "h1", '{"id":"h1"}', 123);
  check("a result with no meta reports written rather than refused", ok === "ok");
}

/* Deleting an account: the same foreign key, from the other end.

   `saved_drafts` and `draft_history` both reference `users(clerk_id)`, so
   removing the parent first fails the constraint exactly as inserting the
   child first did. Order is the whole assertion here — a stub cannot prove
   D1 accepts it, but it can prove the statements go out in an order that
   can be accepted, which is the part a future edit would get wrong. */
{
  const { env, batches } = stubDb();
  const ok = await deleteUserData(env, "user_1");

  check("deleting an account reports success", ok === true);
  check("it is one batch, so a half-deleted account cannot exist", batches.length === 1);

  /* Asserted as the property rather than as an arrangement, because the
     first version was the arrangement and went stale exactly as this file's
     own testing rules predict: it pinned three statements with `users` at
     index 2, and 0005_leagues.sql added connected_leagues between them. The
     code was right and had been for months; the test described the shape of
     a batch it had seen once. It failed by not finding something, on a
     property nothing had changed — which is the tell.

     What actually has to hold is that the parent goes last: `users` is
     referenced by every other table here, so a batch that clears it first
     fails the foreign key. Stated that way, the next child table added
     satisfies it without an edit. */
  const sql = (batches[0] || []).map((s) => s.sql);
  const parent = sql.findIndex((q) => /FROM users\b/.test(q));
  check("every table keyed by clerk_id is cleared", sql.length >= 3);
  check("the two the account cannot exist without are among them",
        sql.some((q) => /draft_history/.test(q)) && sql.some((q) => /saved_drafts/.test(q)));
  check("children before the parent, or the foreign key refuses",
        parent === sql.length - 1);
  check("every statement is scoped to the one account",
        (batches[0] || []).every((s) => s.bound && s.bound[0] === "user_1"));
  check("and every one of them is a DELETE",
        sql.every((q) => /^\s*DELETE FROM/.test(q)));
}

// A missing binding is still a normal condition, not a fault — the rule
// this file's own module docstring already states for every function here.
{
  const ok = await putSavedDraft({}, "user_1", "{}");
  check("no D1 binding answers false rather than throwing", ok === false);

  // In putHistoryEntry()'s own vocabulary, and deliberately "error" rather
  // than "conflict": no binding is the same fault as a failed write, and it
  // must not reach the reader as somebody else owning their id.
  const hist = await putHistoryEntry({}, "user_1", "h1", "{}", 123);
  check("and the history write says so in its own three states", hist === "error");

  const del = await deleteUserData({}, "user_1");
  check("and a delete against no binding answers false too", del === false);
}

note.forEach((n) => console.log(n));
if (fails.length) {
  console.error("\nFAILED:\n" + fails.map((f) => "  " + f).join("\n"));
  process.exit(1);
}
console.log(`\nOK — ${note.length} assertions`);
