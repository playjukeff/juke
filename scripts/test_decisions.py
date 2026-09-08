"""The decision ledger's own SQL, against a real sqlite.

`worker/test-auth.mjs` covers every way of being signed OUT of
/me/decisions and, structurally, nothing past that: the signed-in path
needs a token Clerk actually signed, which nothing offline can produce.
That is the gap `verifyToken` lived in, and it is where this ledger's one
security-critical statement would live too.

So this reads the real SQL out of store.js -- the same reason
test_schema_ladder.py does, and the same failure it is guarding against:
a copy here would pass while the shipped statement was broken.

What it pins:

  * the write, the read, and the delete round-trip;
  * the DO UPDATE's WHERE, which is what stops one account overwriting
    another's decision by POSTing back an id it guessed. A client mints
    that id, so a conflict on it is not necessarily the caller's own row;
  * the partial index the grader selects on, and that a graded row leaves
    it;
  * that verdict lives in a COLUMN and never inside `data`, since a
    second copy would drift the first time either moved.

Standard library only, like the rest of the pipeline.

    py scripts/test_decisions.py
"""

import sqlite3, io, re, glob, sys


def extract(marker):
    """One concatenated SQL string out of store.js, by its opening literal."""
    src = io.open('worker/store.js', encoding='utf-8').read()
    i = src.index('"' + marker + '"')
    chunk = src[i:src.index('.bind(', i)]
    return ''.join(re.findall(r'"([^"]*)"', chunk))


WRITE = extract('INSERT INTO decisions')
assert 'ON CONFLICT(id) DO UPDATE' in WRITE, WRITE
# The read is built by string concatenation around an optional filter, so
# it is restated in the two shapes listDecisions() can produce -- but the
# columns it selects are asserted against the real one below.
READ_SRC = io.open('worker/store.js', encoding='utf-8').read()
assert '"SELECT data, verdict, graded_at FROM decisions WHERE clerk_id = ?"' in READ_SRC, \
    'listDecisions() no longer selects the three columns this test reads'
assert '" AND league_id = ?"' in READ_SRC and '" ORDER BY decided_at DESC"' in READ_SRC

failures = 0


def check(what, ok):
    global failures
    print(('ok  ' if ok else 'x   ') + what)
    if not ok:
        failures += 1


def fresh():
    db = sqlite3.connect(':memory:')
    db.execute("PRAGMA foreign_keys=ON")
    for f in sorted(glob.glob('worker/migrations/*.sql')):
        db.executescript(io.open(f, encoding='utf-8').read())
    for who in ('u1', 'u2'):
        db.execute("INSERT INTO users (clerk_id, created_at, last_seen_at) VALUES (?,100,100)", (who,))
    return db


def write(db, clerk, rec_id='d1', week=4, room='waiver', data='{"said":"Add X"}', at=100):
    return db.execute(WRITE, (rec_id, clerk, 'sleeper', '123', '2026', week, room, data, at, at))


def read(db, clerk, league=None):
    sql = "SELECT data, verdict, graded_at FROM decisions WHERE clerk_id = ?"
    args = [clerk]
    if league:
        sql += " AND league_id = ?"
        args.append(league)
    return db.execute(sql + " ORDER BY decided_at DESC", args).fetchall()


# ---- the round trip ----
db = fresh()
write(db, 'u1')
check('a decision is stored and reads back', read(db, 'u1') == [('{"said":"Add X"}', None, None)])
check('and it is found by its league', len(read(db, 'u1', '123')) == 1)
check('but not under a league it is not in', read(db, 'u1', '999') == [])

# ---- the same account updating its own row ----
db = fresh()
write(db, 'u1')
cur = write(db, 'u1', data='{"said":"Add X","did":"Added"}')
check('the same account updates its own decision in place', cur.rowcount == 1)
check('and there is still only one row',
      db.execute("SELECT COUNT(*) FROM decisions").fetchone()[0] == 1)
check('carrying what the second write said',
      read(db, 'u1')[0][0] == '{"said":"Add X","did":"Added"}')

# ---- somebody else's id ----
db = fresh()
write(db, 'u1', data='{"said":"mine"}')
cur = write(db, 'u2', data='{"said":"stolen"}')
check("another account cannot overwrite it by reusing the id", cur.rowcount == 0)
check('the original data is untouched', read(db, 'u1')[0][0] == '{"said":"mine"}')
check('and the thief has no decision of their own', read(db, 'u2') == [])

# ---- the grader's index ----
db = fresh()
# Distinct decided_at, so "newest first" is a real order rather than a tie
# the assertions below would then have to be vague about.
write(db, 'u1', rec_id='d1', week=4, at=100)
write(db, 'u1', rec_id='d2', week=5, at=200)
ungraded = lambda season, wk: [r[0] for r in db.execute(
    "SELECT id FROM decisions WHERE season=? AND week=? AND verdict IS NULL", (season, wk))]
check('the grader finds an ungraded decision for its week', ungraded('2026', 4) == ['d1'])
check('and not one from another week', ungraded('2026', 5) == ['d2'])
db.execute("UPDATE decisions SET verdict='good', graded_at=200, updated_at=200 WHERE id='d1'")
check('a graded decision leaves the ungraded set', ungraded('2026', 4) == [])
check('newest first, so d2 leads', len(read(db, 'u1')) == 2)
check('and the verdict reads back beside data the grader never touched',
      read(db, 'u1')[1] == ('{"said":"Add X"}', 'good', 200))
check('verdict is a column, and the write never names it',
      'verdict' not in WRITE)

# ---- a decision outlives the connection it was made under ----
db = fresh()
db.execute("INSERT INTO connected_leagues"
           " (clerk_id,provider,league_id,owner_id,name,season,total_teams,connected_at,refreshed_at)"
           " VALUES ('u1','sleeper','123',NULL,'L','2026',10,100,100)")
write(db, 'u1')
db.execute("DELETE FROM connected_leagues WHERE clerk_id='u1'")
check('disconnecting the league does not erase what was decided under it',
      len(read(db, 'u1')) == 1)

# ---- and it goes with the account ----
db = fresh()
write(db, 'u1')
try:
    db.execute("DELETE FROM users WHERE clerk_id='u1'")
    check('deleting the account before its decisions is refused', False)
except sqlite3.IntegrityError:
    check('deleting the account before its decisions is refused', True)
db.execute("DELETE FROM decisions WHERE clerk_id='u1'")
db.execute("DELETE FROM users WHERE clerk_id='u1'")
check('children first, and the account goes',
      db.execute("SELECT COUNT(*) FROM users WHERE clerk_id='u1'").fetchone()[0] == 0)

# deleteUserData() is the one place that ordering is written down, so a new
# child table missing from it is an account deletion that fails outright.
check('deleteUserData() knows about the decisions table',
      'DELETE FROM decisions WHERE clerk_id' in READ_SRC)

print('\nFAIL' if failures else '\nOK — the decision ledger')
sys.exit(1 if failures else 0)
