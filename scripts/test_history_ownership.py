"""The locker write's own ownership check, against real sqlite3.

`draft_history.id` is the PRIMARY KEY and `clerk_id` is an ordinary column
beside it -- so a conflict on that id is not necessarily the caller's own
row. recordHistory() mints the id client-side ("h" + Date.now().toString(36)
+ a short random tail) and meHistoryRoute() reads it straight off the request
body, so it is a claim about WHICH row and never about WHOSE. Without a WHERE
on the DO UPDATE, a signed-in account that knew or guessed another account's
entry id overwrote that entry's `data` with its own.

deleteHistoryEntry() has scoped its WHERE to `clerk_id` since it was written.
The write did not, and nothing this project runs could have caught it: the
row still renders, the route answered a healthy 200, and the only person who
could tell is the account whose archived mock quietly changed.

Two things make it testable offline. sqlite3 is what D1 is, so the migrations
apply unchanged and `changes` means the same thing it does at the edge. And
the SQL is read OUT of store.js rather than restated here -- a copy would pass
while the shipped statement was broken, which is the failure being tested for
wearing a test's clothes. That is scripts/test_schema_ladder.py's own reason,
applied to a second statement.

putSavedDraft() is asserted alongside it rather than assumed safe:
`saved_drafts.clerk_id` is both the PRIMARY KEY and the value bound from the
verified session, so the row a conflict finds is the caller's by
construction -- which is a property worth a test, not a paragraph.

Standard library only, like the rest of the pipeline.

    py scripts/test_history_ownership.py
"""

import io, re, sqlite3, sys

SRC = io.open('worker/store.js', encoding='utf-8').read()


def statement(fn, table):
    """The one INSERT INTO <table> inside function `fn`, as real SQL.

    Bounded to that function's own text, so a similar statement elsewhere in
    store.js cannot stand in for the one under test -- the shared-fragment
    mistake that took the league ladder down, at the level of which function
    a string came from.
    """
    start = SRC.index('export async function ' + fn + '(')
    end = SRC.index('\nexport ', start + 1)
    body = SRC[start:end]
    anchor = body.index('"INSERT INTO ' + table)
    # The concatenated string literal, up to the `)` that closes prepare().
    chunk = body[anchor:body.index(').bind(', anchor)]
    return ''.join(re.findall(r'"((?:[^"\\]|\\.)*)"', chunk))


def db():
    """A migrated database with two accounts in it."""
    con = sqlite3.connect(':memory:')
    con.execute('PRAGMA foreign_keys = ON')
    for name in ('0003_accounts.sql', '0004_drafts.sql'):
        con.executescript(io.open('worker/migrations/' + name, encoding='utf-8').read())
    for who in ('alice', 'mallory'):
        con.execute('INSERT INTO users (clerk_id, created_at, last_seen_at) VALUES (?, 1, 1)', (who,))
    return con


failures = []


def check(what, ok):
    print(('ok  ' if ok else 'x   ') + what)
    if not ok:
        failures.append(what)


HISTORY = statement('putHistoryEntry', 'draft_history')
SAVED = statement('putSavedDraft', 'saved_drafts')
print('history statement read out of store.js:')
print('    ' + HISTORY)
print()


# Bound in the order putHistoryEntry()'s own .bind() call uses.
def write_history(con, who, entry_id, data, completed_at=100, stamp=100):
    return con.execute(HISTORY, (entry_id, who, data, completed_at, stamp)).rowcount


def write_saved(con, who, data, stamp=100):
    return con.execute(SAVED, (who, data, stamp)).rowcount


# ---- the ordinary path, which the guard must not break ----------------------
con = db()
check('a first write inserts the entry', write_history(con, 'alice', 'h1', '{"v":1}') == 1)
check("the owner's own retry still lands",
      write_history(con, 'alice', 'h1', '{"v":2}', completed_at=200, stamp=200) == 1)
check('and the retry is what the row holds',
      con.execute('SELECT data FROM draft_history WHERE id = ?', ('h1',)).fetchone()[0] == '{"v":2}')
check('completed_at moved with it, which is what the ORDER BY reads',
      con.execute('SELECT completed_at FROM draft_history WHERE id = ?', ('h1',)).fetchone()[0] == 200)

# ---- the hole ---------------------------------------------------------------
# `changes` is what the route reads to decide 409, so the count is asserted
# alongside the data: a guard that stopped reporting zero would leave every
# assertion under it green while the client was told a stranger's row was its
# own backup.
check('a second account reusing the id changes no rows',
      write_history(con, 'mallory', 'h1', '{"pwned":1}', completed_at=999, stamp=999) == 0)
check('and the stored data is untouched',
      con.execute('SELECT data FROM draft_history WHERE id = ?', ('h1',)).fetchone()[0] == '{"v":2}')
check('the row still belongs to the account that created it',
      con.execute('SELECT clerk_id FROM draft_history WHERE id = ?', ('h1',)).fetchone()[0] == 'alice')
check('and no second row appeared under the same id',
      con.execute('SELECT COUNT(*) FROM draft_history').fetchone()[0] == 1)

# A refusal must not throw. putHistoryEntry() reads `changes` and reports an
# exception as "error", so a constraint failure here would answer the wrong
# one of the two states -- and log a fault on what is an ordinary collision.
try:
    write_history(con, 'mallory', 'h1', '{"pwned":2}')
    check('a refusal is a no-op rather than an error the caller has to catch', True)
except sqlite3.Error as err:
    check('a refusal is a no-op rather than an error the caller has to catch: %s' % err, False)

# The refusal is about ownership and nothing else, so it is not a guard that
# quietly stops the table working for the account that tripped it.
check('the refused account can still write its own entries',
      write_history(con, 'mallory', 'h2', '{"mine":1}') == 1)
check('and both rows exist, one per owner',
      con.execute('SELECT COUNT(*) FROM draft_history').fetchone()[0] == 2)

# ---- putSavedDraft(), confirmed rather than assumed --------------------------
con = db()
check('a saved draft writes', write_saved(con, 'alice', '{"v":2}') == 1)
check("the owner's own overwrite lands", write_saved(con, 'alice', '{"v":3}', stamp=200) == 1)
check('a second account writes its OWN row rather than conflicting',
      write_saved(con, 'mallory', '{"theirs":1}') == 1)
check("so the first account's saved draft is untouched",
      con.execute('SELECT data FROM saved_drafts WHERE clerk_id = ?', ('alice',)).fetchone()[0] == '{"v":3}')
check('and the table holds one row per account',
      con.execute('SELECT COUNT(*) FROM saved_drafts').fetchone()[0] == 2)

print()
if failures:
    print('FAILED (%d)' % len(failures))
    for what in failures:
        print('  - ' + what)
    sys.exit(1)
print('history ownership: all checks passed')
