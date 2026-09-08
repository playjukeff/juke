"""listLeagues()'s schema ladder, against every database a deploy can meet.

The site deploys itself from git and the worker does not, so worker code is
at some point live against a database that has not had the latest migration
applied. listLeagues() answers that by trying progressively older queries --
and the value of that is entirely in whether the older ones actually work,
which nothing checked.

They did not. Adding 0008's draft columns to a SELECT fragment SHARED by both
attempts meant both named `draft_at`, so against a database without 0008 both
threw and the function answered `[]` -- a signed-in manager told they have no
leagues at all, which is the exact failure the fallback existed to prevent.

So this reads the real SQL out of store.js rather than restating it. A copy
here would pass while the shipped query was broken, which is the failure being
tested for wearing a test's clothes.

It also pins the connect cap, which lives inside those same write statements
rather than in front of them. That is not decoration here: the caller decides
403 tier-limit from `changes` alone, so a gate that stopped gating would leave
every ladder assertion below perfectly green.

Standard library only, like the rest of the pipeline. sqlite3 is what D1 is.

    py scripts/test_schema_ladder.py
"""

import sqlite3, io, re, sys

# Pull the SQL out of store.js rather than restating it: a copy here would
# pass while the real query was broken, which is the whole failure being
# tested for.
src = io.open('worker/store.js', encoding='utf-8').read()
block = src[src.index('const LEAGUE_READS = ['):src.index('];', src.index('const LEAGUE_READS = ['))]
reads = []
for chunk in re.findall(r'((?:\s*"[^"]*"\s*\+?)+),', block + ','):
    sql = ''.join(re.findall(r'"([^"]*)"', chunk))
    if sql.strip().upper().startswith('SELECT'):
        reads.append(sql)

print('read rungs found in store.js:', len(reads))
assert len(reads) >= 1, reads

# The WRITE ladder, extracted the same way and for a sharper reason: this is
# the half that was never tested, and skipping it is what took production
# down. The read ladder was built, tested and written up one commit before a
# worker carrying 0008's columns met a database without them -- at which
# point putLeague()'s INSERT threw and every connect failed, Sleeper as well
# as ESPN. The read degraded perfectly the whole time.
wblock = src[src.index('const LEAGUE_WRITES = ['):src.index('];', src.index('const LEAGUE_WRITES = ['))]
writes = []
for chunk in re.findall(r'sql:((?:\s*"[^"]*"\s*\+?)+),', wblock + ','):
    writes.append(''.join(re.findall(r'"([^"]*)"', chunk)))
print('write rungs found in store.js:', len(writes))
assert len(writes) >= 1, writes

MIGRATIONS = ['0005_leagues.sql', '0006_active_league.sql', '0008_draft_time.sql']

def db_at(level):
    """A database with the first `level` league migrations applied."""
    db = sqlite3.connect(':memory:')
    db.executescript("CREATE TABLE users (clerk_id TEXT PRIMARY KEY);")
    for f in MIGRATIONS[:level]:
        db.executescript(io.open('worker/migrations/' + f, encoding='utf-8').read())
    if level:
        db.execute("INSERT INTO users VALUES ('u1')")
        db.execute(
            "INSERT INTO connected_leagues"
            " (clerk_id,provider,league_id,owner_id,name,season,total_teams,connected_at,refreshed_at)"
            " VALUES ('u1','espn','65142363',NULL,'D-Town Boogie','2026',10,100,100)")
    return db

failures = 0
def check(what, ok):
    global failures
    print(('ok  ' if ok else 'x   ') + what)
    if not ok:
        failures += 1

# The real question: at every schema level a deploy can meet, does SOME rung
# answer, and is it the newest one that can?
for level, label in [(3, 'fully migrated'), (2, '0008 missing'), (1, '0005 only')]:
    db = db_at(level)
    winner = None
    for i, sql in enumerate(reads):
        try:
            rows = db.execute(sql, ('u1',)).fetchall()
            winner = i
            break
        except sqlite3.OperationalError:
            continue
    check('%-16s -> rung %s answers' % (label, winner), winner is not None and len(rows) == 1)
    # The newest rung that CAN work is the one that should win.
    expected = {3: 0, 2: 1, 1: 2}[level]
    check('%-16s -> and it is the newest usable one (%d)' % (label, expected), winner == expected)

# The cap gate rides on the same statement as the write now -- see
# putLeague()'s own comment for why a separate check-then-write in front of
# it was a race. That makes its bindings part of every rung, and this test
# supplied none of them, so it went red on a binding count rather than on
# anything it was written to measure. The gate is split off the REAL SQL
# rather than counted here, for the same reason the SQL itself is read out
# of store.js: a rung that changes its gate has to fail this, not rebind
# quietly around it.
GATE_AT = " WHERE NOT ?"
TAIL = [100, 100, 1788919200000, 'pre_draft']

def head_args(provider='espn', league_id='65142363', name='D-Town Boogie'):
    return ['u1', provider, league_id, None, name, '2026', 10]

def bind(sql, provider='espn', league_id='65142363', name='D-Town Boogie',
         enforce=False, cap=0):
    """Every binding one rung takes, sized off the statement itself."""
    cut = sql.find(GATE_AT)
    assert cut >= 0, 'a write rung carrying no cap gate: ' + sql[:80]
    head = head_args(provider, league_id, name)
    body_n = sql[:cut].count('?')
    gate = [1 if enforce else 0, 'u1', provider, league_id, 'u1', cap]
    assert sql.count('?') - body_n == len(gate), 'gate shape moved: %d bindings' % (
        sql.count('?') - body_n)
    args = head + TAIL[:body_n - len(head)]
    assert len(args) == body_n, 'body takes %d bindings, supplied %d' % (body_n, len(args))
    return args + gate

# Every write rung, against every schema level. A connect that fails is not
# a degraded feature -- it is the feature. Enforcement is off here so this
# keeps asking the ladder's own question and nothing else.
for level, label in [(3, 'fully migrated'), (2, '0008 missing'), (1, '0005 only')]:
    db = db_at(level)
    db.execute("DELETE FROM connected_leagues")
    winner = None
    for i, sql in enumerate(writes):
        try:
            db.execute(sql, bind(sql))
            winner = i
            break
        except sqlite3.OperationalError:
            continue
    check('%-16s -> a connect succeeds (rung %s)' % (label, winner), winner is not None)
    expected = {3: 0, 2: 1, 1: 1}[level]
    check('%-16s -> on the newest usable write rung (%d)' % (label, expected), winner == expected)
    if winner is not None:
        got = db.execute("SELECT name FROM connected_leagues WHERE clerk_id='u1'").fetchall()
        check('%-16s -> and the row is really there' % label, got == [('D-Town Boogie',)])

# The gate itself, on every rung that can run. The concurrency it closes is
# not reproducible from one thread -- what IS checkable is that the three
# outcomes the caller reads are the three this statement produces, because
# meLeaguesRoute() answers 403 tier-limit off nothing but `changes`. A rung
# that silently stopped enforcing would leave every assertion above green.
CAP_LEVELS = [(3, 'fully migrated', 0), (2, '0008 missing', 1)]
for level, label, rung in CAP_LEVELS:
    sql = writes[rung]

    # At the cap, a DIFFERENT league is refused and nothing is written.
    db = db_at(level)     # already holds one league: espn/65142363
    cur = db.execute(sql, bind(sql, 'sleeper', '999', 'Second League', enforce=True, cap=1))
    n = db.execute("SELECT COUNT(*) FROM connected_leagues").fetchone()[0]
    check('%-16s -> at the cap, a new league is refused' % label, cur.rowcount == 0 and n == 1)

    # A refresh of one already held is not a new connection and must pass,
    # which is the EXISTS branch standing in for the old isRefresh read.
    db = db_at(level)
    cur = db.execute(sql, bind(sql, 'espn', '65142363', 'Renamed', enforce=True, cap=1))
    got = db.execute("SELECT name FROM connected_leagues WHERE clerk_id='u1'").fetchall()
    check('%-16s -> at the cap, a refresh still passes' % label,
          cur.rowcount == 1 and got == [('Renamed',)])

    # getTier() could not answer, so enforcement is skipped rather than
    # defaulting anyone to Free -- an infra hiccup must not block a connect.
    db = db_at(level)
    cur = db.execute(sql, bind(sql, 'sleeper', '999', 'Second League', enforce=False, cap=0))
    n = db.execute("SELECT COUNT(*) FROM connected_leagues").fetchone()[0]
    check('%-16s -> tier unknown, the write is not capped' % label, cur.rowcount == 1 and n == 2)

# No table at all is an account with no leagues, not a crash.
db = db_at(0)
survived = True
for sql in reads:
    try:
        db.execute(sql, ('u1',)).fetchall()
        survived = False   # a missing table must not succeed
    except sqlite3.OperationalError:
        pass
check('no connected_leagues table -> every rung refuses, caller answers []', survived)

print('\nFAIL' if failures else '\nOK — the schema ladder')
sys.exit(1 if failures else 0)
