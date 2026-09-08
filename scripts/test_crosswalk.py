#!/usr/bin/env python3
"""The two crosswalks and the nflverse audit, tested without the network.

Why this file exists when the rest of the pipeline is tested by running it:
a bad join does not look like a failure. Every count still prints, both
generated files still write, the board is still correct, and the only symptom
is one player's news on another player's profile -- with every number around
it right. That is the same shape as the bug this project already has a scar
from, where a pick that failed to resolve hit a silent `return` and a wrong
board looked right for an entire draft.

So the join is exercised directly, against a pool small enough to reason
about, including the cases nobody would think to check by eye: two of theirs
claiming one of ours, a player we hold that they have never heard of, and a
player they hold that we do not carry.

Run:  python scripts/test_crosswalk.py
"""

import contextlib
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_players as bp


FAILURES = []


def check(label, got, want):
    if got == want:
        print(f"ok  {label}")
    else:
        FAILURES.append(label)
        print(f"FAIL {label}\n       got  {got!r}\n       want {want!r}")


# ---- a pool small enough to hold in your head ---------------------------
#
# Two Josh Allens on purpose. They are the reason the fallback matches on
# position as well as name, and the reason a name search at request time is
# not an option.
SLEEPER = {
    "4984": {"full_name": "Josh Allen",     "position": "QB", "team": "BUF"},
    "5092": {"full_name": "Josh Allen",     "position": "DEF", "team": "JAX"},
    "9221": {"full_name": "Jahmyr Gibbs",   "position": "RB", "team": "DET"},
    "6794": {"full_name": "Ja'Marr Chase",  "position": "WR", "team": "CIN"},
    "1234": {"full_name": "Amon-Ra St. Brown", "position": "WR", "team": "DET"},
    "7777": {"full_name": "Nobody Knowsme", "position": "TE", "team": "NYJ"},
}
# Only the players we actually carry. 5092 is deliberately left out: a DEF is
# not in our pool the way a person is, and the join must not invent one.
STATS = {pid: {"age": 25} for pid in ("4984", "9221", "6794", "1234", "7777")}

INDEXES = bp.index_sleeper(SLEEPER)


def tank(pid, name, pos, team, sleeper_id=None):
    row = {"playerID": pid, "longName": name, "pos": pos, "team": team}
    if sleeper_id is not None:
        row["sleeperBotID"] = sleeper_id
    return row


# ---- 1. the good join: they carry our id --------------------------------
linked, report = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T1", "Josh Allen", "QB", "BUF", "4984"),
    tank("T2", "Jahmyr Gibbs", "RB", "DET", "9221"),
])
check("sleeperBotID links straight through", linked, {"4984": "T1", "9221": "T2"})
check("and everything unlinked is reported",
      sorted(l.split(" | ")[0] for l in report),
      ["Amon-Ra St. Brown", "Ja'Marr Chase", "Nobody Knowsme"])


# ---- 2. the fallback: no shared id, match on name/pos/team ---------------
linked, _ = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T1", "Josh Allen", "QB", "BUF"),
    tank("T3", "Ja'Marr Chase", "WR", "CIN"),
])
check("a name/pos/team match is used when there is no shared id",
      linked, {"4984": "T1", "6794": "T3"})


# ---- 3. punctuation and accents are not a difference --------------------
linked, _ = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T4", "Amon-Ra St Brown", "WR", "DET"),      # no full stop
    tank("T5", "JaMarr Chase", "WR", "CIN"),          # no apostrophe
])
check("normalise() is shared with the ADP join, so punctuation does not matter",
      linked, {"1234": "T4", "6794": "T5"})


# ---- 4. the same name at two positions stays two people -----------------
#
# Their quarterback must not be able to claim our defensive end, and the
# fallback must not reach a player we do not carry at all.
linked, _ = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T6", "Josh Allen", "DEF", "JAX"),
])
check("a player we do not carry links to nothing", linked, {})


# ---- 5. two of theirs claiming one of ours ------------------------------
#
# The dangerous case. Keeping either one is a coin flip that serves somebody
# else's news under this player's name, so neither is kept.
linked, report = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T1", "Jahmyr Gibbs", "RB", "DET", "9221"),
    tank("T9", "Jahmyr Gibbs", "RB", "DET", "9221"),
])
check("a collision stores neither id", linked.get("9221"), None)
check("and says so loudly",
      any(l.startswith("COLLISION") and "T1" in l and "T9" in l for l in report), True)


# ---- 6. the same id twice is not a collision ----------------------------
linked, report = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T2", "Jahmyr Gibbs", "RB", "DET", "9221"),
    tank("T2", "Jahmyr Gibbs", "RB", "DET", "9221"),
])
check("a duplicated row is not mistaken for a conflict", linked.get("9221"), "T2")
check("and raises no collision", [l for l in report if l.startswith("COLLISION")], [])


# ---- 7. a bad shared id falls back rather than trusting it --------------
#
# If their sleeperBotID points at somebody we do not hold, the row is not
# thrown away -- the name match still gets a chance.
linked, _ = bp.link_source_ids(STATS, SLEEPER, INDEXES, [
    tank("T7", "Jahmyr Gibbs", "RB", "DET", "999999"),
])
check("an unusable shared id falls through to the name match",
      linked, {"9221": "T7"})


# ---- 8. nothing at all ---------------------------------------------------
linked, report = bp.link_source_ids(STATS, SLEEPER, INDEXES, [])
check("no rows links nothing", linked, {})
check("and reports every player we hold", len(report), len(STATS))


# ---- 9. no key means no call --------------------------------------------
#
# The build has to survive a missing key, an expired key and a provider that
# is down, all of which arrive here as "no rows".
saved = bp.TANK01_KEY
bp.TANK01_KEY = ""
check("no key returns no rows and does not raise", bp.fetch_tank01_players(), [])
bp.TANK01_KEY = saved


# ---- 10. the printed tally has to agree with what was stored -------------
#
# It did not. A collision counted the row it then discarded, so the run said
# "linked 0 ... (1 on sleeperBotID)", and a duplicated row counted twice. A
# count that disagrees with the data it describes is how you stop believing
# the run output, which is the only thing standing between a quiet bad join
# and a user finding it.
import io as _io, contextlib as _ctx

def tally(rows):
    buf = _io.StringIO()
    with _ctx.redirect_stdout(buf):
        linked, _ = bp.link_source_ids(STATS, SLEEPER, INDEXES, rows)
    line = [l for l in buf.getvalue().splitlines() if "linked" in l][0]
    head = int(line.split("linked ")[1].split(" of ")[0])
    direct = int(line.split("(")[1].split(" on")[0])
    name = int(line.split(", ")[1].split(" on")[0])
    return head, direct + name, len(linked)

for label, rows in [
    ("a collision", [tank("T1", "Jahmyr Gibbs", "RB", "DET", "9221"),
                     tank("T9", "Jahmyr Gibbs", "RB", "DET", "9221")]),
    ("a duplicate row", [tank("T2", "Jahmyr Gibbs", "RB", "DET", "9221"),
                         tank("T2", "Jahmyr Gibbs", "RB", "DET", "9221")]),
    ("a mixed batch", [tank("T1", "Josh Allen", "QB", "BUF", "4984"),
                       tank("T3", "Ja'Marr Chase", "WR", "CIN")]),
]:
    head, parts, stored = tally(rows)
    check(f"{label}: the headline count is what was stored", head, stored)
    check(f"{label}: the breakdown adds up to it", parts, stored)


# ---- 11. the nflverse join -----------------------------------------------
#
# A different source, a different join, and the same failure mode: a wrong
# match does not look wrong. Their file carries no Sleeper id at all, so
# unlike Tank01 there is no shared-identifier tier to fall back from -- the
# name match IS the join, and every case below is one it has to get right.
#
# Its own pool, because these cases need a two-way player and a Rams player
# and the pool above is asserted on exactly as it stands.
NFL_SLEEPER = {
    "1001": {"full_name": "Puka Nacua",     "position": "WR", "team": "LAR"},
    "1002": {"full_name": "Travis Hunter",  "position": "WR", "team": "JAX"},
    "1003": {"full_name": "Jahmyr Gibbs",   "position": "RB", "team": "DET"},
    "1004": {"full_name": "Ja'Marr Chase",  "position": "WR", "team": "CIN"},
}
NFL_STATS = {pid: {"age": 25} for pid in NFL_SLEEPER}
NFL_INDEXES = bp.index_sleeper(NFL_SLEEPER)


def nfl(gsis, name, pos, team, last=2025):
    return {"gsis_id": gsis, "display_name": name, "position": pos,
            "latest_team": team, "last_season": str(last)}


linked, report = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [
    nfl("00-01", "Jahmyr Gibbs", "RB", "DET"),
    nfl("00-02", "Ja'Marr Chase", "WR", "CIN"),
])
check("nflverse joins on name, position and team",
      linked, {"1003": "00-01", "1004": "00-02"})
check("and reports everyone it could not reach",
      sorted(l.split(" | ")[0] for l in report if "no nflverse id" in l),
      ["Puka Nacua", "Travis Hunter"])


# ---- 12. nflverse calls the Rams LA and we call them LAR ------------------
#
# TEAM_ALIASES already knows. The point of the test is that link_nflverse
# actually asks it: a raw team code compared straight across drops every Ram
# to the looser tier, and this is how a defence once reconciled to zero.
linked, _ = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [
    nfl("00-03", "Puka Nacua", "WR", "LA"),
])
check("an nflverse LA row joins our LAR player on the strict tier",
      linked, {"1001": "00-03"})


# ---- 13. a two-way player carries the wrong position ----------------------
#
# nflverse lists Travis Hunter as a DB because that is what he mostly is.
# His receiving is perfectly present under his gsis_id; the position tier
# simply cannot see him, and no amount of name matching will fix that. So
# the join has to fail here rather than guess, and NFLVERSE_MATCHES is what
# rescues him.
linked, _ = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [
    nfl("00-04", "Travis Hunter", "DB", "JAX"),
])
check("a position nobody drafts does not join by itself", linked.get("1002"), None)

saved_matches = bp.NFLVERSE_MATCHES
bp.NFLVERSE_MATCHES = {"1002": "00-04"}
linked, report = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [
    nfl("00-04", "Travis Hunter", "DB", "JAX"),
])
check("NFLVERSE_MATCHES is what reaches him", linked.get("1002"), "00-04")
check("and he stops being reported as missing",
      any("Travis Hunter" in l for l in report), False)
bp.NFLVERSE_MATCHES = saved_matches


# ---- 14. two of theirs claiming one of ours ------------------------------
linked, report = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [
    nfl("00-05", "Jahmyr Gibbs", "RB", "DET"),
    nfl("00-06", "Jahmyr Gibbs", "RB", "DET"),
])
check("an nflverse collision stores neither id", linked.get("1003"), None)
check("and says so loudly",
      any(l.startswith("COLLISION") and "00-05" in l and "00-06" in l for l in report),
      True)


# ---- 15. the outage path -------------------------------------------------
#
# nflverse being down, or a season not played yet, both arrive here as no
# rows. The board must be unaffected and the report must say so, because a
# pipeline that needs a third party to be up in order to produce a board is
# not a pipeline this project wants.
linked, report = bp.link_nflverse(NFL_STATS, NFL_SLEEPER, NFL_INDEXES, [])
check("no rows links nothing", linked, {})
check("and reports every player we hold", len(report), len(NFL_STATS))

lines, flagged = bp.audit_against_nflverse(NFL_STATS, {}, {})
check("an audit with nothing to compare flags nothing", flagged, 0)
check("and says why rather than printing an empty table",
      any("nothing compared" in l for l in lines), True)


# ---- 16. the audit applies the two known definitions ---------------------
#
# These are the two differences that would look like data if they were
# reported, and like a bug if they were fixed by taking nflverse's column.
# A touchdown is a first down to them and is not to us; a blocked kick is a
# miss to us and is not to them.
def audited(ours, theirs):
    stats = {"1003": {"s": {"2025": ours}}}
    seasons = {2025: {"00-01": dict(theirs, player_display_name="Test Player")}}
    return bp.audit_against_nflverse(stats, {"1003": "00-01"}, seasons)[1]


check("a first-down line that differs by exactly the touchdowns is not flagged",
      audited({"cfd": 40, "ct": 9},
              {"receiving_first_downs": "49", "receiving_tds": "9"}), 0)
check("and one that differs by anything else is",
      audited({"cfd": 40, "ct": 9},
              {"receiving_first_downs": "52", "receiving_tds": "9"}), 1)
check("a miss total that differs by exactly the blocked kicks is not flagged",
      audited({"fgx": 6}, {"fg_missed": "4", "fg_blocked": "2"}), 0)
check("and one that differs by anything else is",
      audited({"fgx": 6}, {"fg_missed": "4", "fg_blocked": "0"}), 1)
check("a stat both feeds agree on is not flagged",
      audited({"cy": 1200}, {"receiving_yards": "1200"}), 0)


# ---- 17. the audit never changes a stored number -------------------------
#
# The whole design. Sleeper is the feed every season block, every weekly log
# and every archived projection was built from, so a value quietly replaced
# from somewhere else would make `pp` a comparison between two feeds instead
# of between a forecast and an outcome.
import copy as _copy
before = {"1003": {"s": {"2025": {"cy": 1200, "ct": 9, "cfd": 40}}}}
after = _copy.deepcopy(before)
bp.audit_against_nflverse(after, {"1003": "00-01"}, {2025: {"00-01": {
    "receiving_yards": "999", "receiving_tds": "1", "receiving_first_downs": "2",
    "player_display_name": "Test Player"}}})
check("the audit leaves every stored value exactly as it found it", after, before)


# ---- 17. app.js has the other half of every scoring rule -----------------
#
# The build already refuses to write when a SCOREABLE stat has no home in
# STAT_FIELDS. This is the other direction, and it is just as silent:
# pointsUnder() walks the rules object, so a stat with no default in app.js
# is summed as zero and nothing says a word.
#
# It runs against the real app.js rather than a fixture, because a fixture
# would prove the parser works and not that the two files agree.
_here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cwd = os.getcwd()
os.chdir(_here)
try:
    bp.check_app_rules()
    check("every scoreable stat has a default, a group and a label in app.js",
          True, True)
except SystemExit as error:
    check("every scoreable stat has a default, a group and a label in app.js",
          str(error), "no problems")
finally:
    os.chdir(_cwd)

# ---- 18. the usage block ------------------------------------------------
#
# The one thing nflverse writes into a record. Everything else it does is a
# report, so this is the only place a third party can put a number into
# stats.js at all -- which is why the outage case below matters as much as
# the happy one.
def usage_row(**kw):
    row = {"target_share": "", "air_yards_share": "", "wopr": "",
           "receiving_epa": "", "rushing_epa": "", "passing_epa": "",
           "passing_cpoe": "", "rushing_20": "", "gwfg_att": "", "gwfg_made": ""}
    row.update(kw)
    return row


records = {"1003": {"s": {"2025": {"cy": 1200}}}}
written = bp.build_usage(records, {"1003": "00-01"}, {2025: {"00-01": usage_row(
    target_share="0.30412", air_yards_share="0.3341", wopr="0.6903",
    receiving_epa="41.44", rushing_20="3")}})
check("a usage block is written under `u`, keyed by season like `s`",
      records["1003"].get("u"),
      {"2025": {"ts": 0.304, "ays": 0.334, "wo": 0.69, "ep": 41.4, "r20": 3}})
check("and it is counted", written, 1)
check("the season block beside it is untouched",
      records["1003"]["s"], {"2025": {"cy": 1200}})

# A zero and a missing value read identically on a sheet, and this file is a
# plain <script src> in front of every first paint. Both are dropped.
records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"},
               {2025: {"00-01": usage_row(target_share="0", receiving_epa="12.5")}})
check("a zero is dropped rather than stored",
      records["1003"]["u"], {"2025": {"ep": 12.5}})

records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"}, {2025: {"00-01": usage_row()}})
check("a row with nothing in it writes no `u` at all", "u" in records["1003"], False)

# Air yards go negative -- a screen pass is caught behind the line -- so the
# sign is meaningful rather than dirty, and it must survive being stored.
records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"},
               {2025: {"00-01": usage_row(air_yards_share="-0.003")}})
check("a negative air-yards share is kept, not clamped or dropped",
      records["1003"]["u"], {"2025": {"ays": -0.003}})

# The outage path. nflverse down, or a season not played yet, both arrive
# as no rows -- and the board must be identical either way.
records = {"1003": {"s": {"2025": {"cy": 1200}}}}
before = _copy.deepcopy(records)
check("no nflverse rows writes no usage", bp.build_usage(records, {}, {}), 0)
check("and leaves every record exactly as it found it", records, before)

records = {"1003": {"s": {"2025": {"cy": 1200}}}}
bp.build_usage(records, {"1003": "00-01"}, {2025: {}})
check("a linked player with no row that season gets no `u`",
      "u" in records["1003"], False)

# USAGE_FIELDS may not name a Sleeper key. compact() resolves STAT_FIELDS
# source names against the raw Sleeper row, so a collision would quietly
# store Sleeper's number under an nflverse label and stay plausible.
check("no usage short key collides with a stored stat short key",
      sorted(set(s for s, _, _ in bp.USAGE_FIELDS) & set(bp.STAT_FIELDS.values())),
      [])
check("no usage source column is a Sleeper key name",
      sorted(set(c for _, c, _ in bp.USAGE_FIELDS) & set(bp.STAT_FIELDS)), [])

# ---- 19. expected points ride the same block ----------------------------
#
# fetch_expected_points() output merges into the same per-season `u` block
# under xf/xd, on the same gsis id. The seasons walked are the union of the
# two feeds, so either one being down costs its own columns and nothing else.
records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"},
               {2025: {"00-01": usage_row(receiving_epa="12.5")}},
               {2025: {"00-01": {"xf": 180.3, "xd": -12.1}}})
check("expected points merge into the same season block",
      records["1003"]["u"], {"2025": {"ep": 12.5, "xf": 180.3, "xd": -12.1}})

records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"}, {},
               {2024: {"00-01": {"xf": 95.0}}})
check("an nflverse outage does not silently drop xFP with it",
      records["1003"]["u"], {"2024": {"xf": 95.0}})

records = {"1003": {}}
bp.build_usage(records, {"1003": "00-01"},
               {2025: {"00-01": usage_row(receiving_epa="12.5")}},
               {2025: {}})
check("no expected points leaves the block exactly as before",
      records["1003"]["u"], {"2025": {"ep": 12.5}})

check("xf/xd do not collide with a stored stat short key",
      sorted({"xf", "xd"} & set(bp.STAT_FIELDS.values())), [])
check("xf/xd do not collide with another usage short key",
      sorted({"xf", "xd"} & set(s for s, _, _ in bp.USAGE_FIELDS)), [])


# ---- 20. team ranks -------------------------------------------------------
#
# A different kind of block from everything above: no player, no crosswalk,
# just clean_team() and nflverse's own stats_team release. The pool is the
# real 32 team codes (TEAM_CITIES's keys, the same universe join_rows() uses
# for a defense's own city name) so the permutation check below means what it
# says rather than passing on a fixture too small to reveal a gap.
TEAMS_32 = sorted(bp.TEAM_CITIES.keys())
check("the real team pool is 32 teams", len(TEAMS_32), 32)


def team_row(i, code):
    # Deliberately decorrelated across categories -- passing yards rises
    # with i, attempts and rushing yards fall with it -- so "most passing
    # yards" and "most attempts" land on different teams rather than the
    # same one coincidentally leading everywhere. passing_tds and
    # rushing_tds both cycle, which manufactures real ties on purpose: the
    # tie-break is only proven by a fixture that actually has one.
    return {
        "season": "2025", "team": code, "season_type": "REG", "games": "17",
        "completions": str(300 + i),
        "attempts": str(400 + (31 - i)),
        "passing_yards": str(3000 + i * 13),
        "passing_tds": str(15 + (i % 7)),
        "passing_interceptions": "10",
        "rushing_yards": str(2500 - i * 9),
        "rushing_tds": str(8 + ((31 - i) % 5)),
        "receiving_yards": str(3000 + i * 13),
        "receiving_tds": str(15 + (i % 7)),
        "def_sacks": "40", "def_interceptions": "12",
    }


rows = [team_row(i, code) for i, code in enumerate(TEAMS_32)]

# nflverse calls the Rams "LA", not "LAR" -- swap this one row's own code so
# build_team_ranks() has to run it through clean_team() same as every other
# nflverse join in this file, rather than passing by coincidence because the
# fixture happened to already spell it our way. Reuses TEAM_ALIASES, the
# same table the player-level nflverse join is tested against above -- not a
# second alias table for the same fact.
lar_index = TEAMS_32.index("LAR")
rows[lar_index] = dict(rows[lar_index], team="LA")

ranks = bp.build_team_ranks(rows)

check("every one of the 32 teams is ranked", len(ranks), 32)
check("an nflverse LA row joins our LAR team code", "LAR" in ranks, True)
check("and does not also leave a phantom LA entry behind", "LA" in ranks, False)

# (a) a complete 1-32 permutation, no duplicate and no gap, on every
# category -- including the two with real ties in this fixture.
for category in ("off", "passYd", "passAtt", "passTd", "td"):
    check(f"{category} ranks are a complete 1-32 permutation with no ties left over",
          sorted(r[category]["rank"] for r in ranks.values()), list(range(1, 33)))

# (b) the team with the most passing yards is ranked 1st in PASS YD, with
# the raw value alongside it -- not just "some team is rank 1", the actual
# leader.
leader = max(TEAMS_32, key=lambda t: 3000 + TEAMS_32.index(t) * 13)
check("the team with the most passing yards is PASS YD rank 1",
      ranks[leader]["passYd"], {"rank": 1, "val": 3000 + TEAMS_32.index(leader) * 13})

# (c) PASS ATT is ranked the same descending way as the rest (most = 1st),
# not inverted as though fewer attempts were better.
att_leader = max(TEAMS_32, key=lambda t: 400 + (31 - TEAMS_32.index(t)))
check("the team with the most attempts is PASS ATT rank 1",
      ranks[att_leader]["passAtt"]["rank"], 1)

# The 404/outage path: nflverse not having published the file yet arrives
# here as no rows, same as everywhere else in this pipeline, and must not
# raise or invent a partial ranking.
check("no rows ranks no teams and does not raise", bp.build_team_ranks([]), {})

# A row with no team code at all -- clean_team()'s own "FA" fallback -- is
# dropped rather than stored as a 33rd, fictitious "team".
check("a blank team code (clean_team()'s FA fallback) is dropped, not stored",
      bp.build_team_ranks([dict(team_row(0, "ARI"), team="")]), {})

# ---- 21. extending past real ADP with Sleeper's own deeper pool ---------
#
# Real ADP for this format is one player; the pool behind it deliberately
# includes everything that should be excluded -- an id already on the real
# list, a player with no team (retired or a free agent), a position that
# isn't fantasy-relevant (a long snapper), and a team defense keyed by team
# code the way Sleeper's own master actually stores one -- so a wrong
# exclusion or a wrong inclusion shows up as a wrong id in the result
# rather than merely a wrong count.
DEEP_SLEEPER = {
    "1001": {"full_name": "Real Starter", "position": "QB", "team": "BUF", "search_rank": 5},
    "2001": {"full_name": "Bench Guy One", "position": "RB", "team": "DET", "search_rank": 300},
    "2002": {"full_name": "Bench Guy Two", "position": "WR", "team": "MIA", "search_rank": 100},
    "2003": {"full_name": "No Team Guy",   "position": "WR", "team": None,  "search_rank": 1},
    "2004": {"full_name": "Ray Guy",       "position": "LS", "team": "DAL", "search_rank": 1},
    "2005": {"full_name": "No Rank Guy",   "position": "TE", "team": "NYJ"},
    "MIA":  {"position": "DEF", "team": "MIA"},
}
DEEP_PLAYERS = [
    {"id": "1001", "name": "Real Starter", "pos": "QB", "team": "BUF", "bye": 7,
     "adp": 1.0, "sd": 1.1, "td": 40, "inj": "", "_entry": DEEP_SLEEPER["1001"]},
]
DEEP_BYES = {"BUF": 7, "DET": 8, "MIA": 11, "NYJ": 9}

no_op = bp.extend_deep_bench(list(DEEP_PLAYERS), DEEP_SLEEPER, DEEP_BYES, target=1)
check("nothing to add once the target is already met", no_op, DEEP_PLAYERS)

extended = bp.extend_deep_bench(list(DEEP_PLAYERS), DEEP_SLEEPER, DEEP_BYES, target=5)
check("real ADP is left in place, first", extended[0]["id"], "1001")
# The Miami defense leads the tail rather than trailing it, and that is the
# scarce-position rule rather than a search_rank surprise: every roster needs
# one defense and one kicker, and search_rank puts both far below any
# receiver. Everyone after them is still in search_rank order -- 2002 at 100,
# 2001 at 300, then 2005 with none at all.
check("scarce positions lead, then search_rank -- best-known first",
      [p["id"] for p in extended[1:]], ["MIA", "2002", "2001", "2005"])
check("an id already on the real list is never duplicated",
      "1001" in [p["id"] for p in extended[1:]], False)
check("no team means no candidacy", "2003" in [p["id"] for p in extended], False)
check("a position outside FANTASY_POSITIONS is never added",
      "2004" in [p["id"] for p in extended], False)

added = extended[1:]
check("every extension carries deep: true", all(p.get("deep") is True for p in added), True)
check("no real ADP sample behind these, so sd/td are both zero",
      [(p["sd"], p["td"]) for p in added], [(0.0, 0)] * 4)
check("adp continues past the real sequence rather than restarting it",
      [p["adp"] for p in added], [2.0, 3.0, 4.0, 5.0])
check("bye comes from the team lookup built off real ADP rows, not a fetch of its own",
      [p["bye"] for p in added], [11, 11, 8, 9])
# Found by id rather than by position in the list. It was extended[4], which
# was true until the scarce-position rule moved defenses to the front -- an
# index is a claim about ordering smuggled into a test about naming.
check("a team defense gets the same city name join_rows() gives one",
      next(p["name"] for p in extended if p["id"] == "MIA"), "Miami Defense")

exhausted = bp.extend_deep_bench(list(DEEP_PLAYERS), DEEP_SLEEPER, DEEP_BYES, target=50)
check("stops once the real pool runs out, rather than inventing players to hit target",
      len(exhausted), 1 + 4)

# A player Sleeper only carries as first_name/last_name (no full_name) still
# gets a real name -- join_rows()'s own ADP rows never hit this path (FFC
# always sends a name), but Sleeper's master sometimes has no full_name for
# a player nobody has looked up yet.
NO_FULL_NAME = {
    "1001": DEEP_SLEEPER["1001"],
    "4001": {"first_name": "Fallback", "last_name": "Name", "position": "RB",
              "team": "CHI", "search_rank": 1},
}
fallback = bp.extend_deep_bench(list(DEEP_PLAYERS), NO_FULL_NAME, DEEP_BYES, target=2)
check("first_name + last_name stands in for a missing full_name",
      fallback[1]["name"], "Fallback Name")

# A free agent is not "no team". Sleeper stamps an unsigned player "FA",
# which is truthy, so `entry.get("team")` let them through while correctly
# excluding the None case above -- the two look like the same test and are
# not. Measured on the real feed before this was fixed: fourteen of them on
# the half-PPR board, a retired Derek Carr and four unsigned kickers among
# them, each arriving as a 33rd "club" with a bye of 0. A 0 bye reads as
# *never on bye*, which is a quietly better roster in a grade that spends
# 10% of itself on bye-week safety.
FA_SLEEPER = {
    "1001": DEEP_SLEEPER["1001"],
    "3001": {"full_name": "Released Guy", "position": "WR", "team": "FA", "search_rank": 1},
    "3002": {"full_name": "Signed Guy",   "position": "WR", "team": "DET", "search_rank": 900},
}
fa = bp.extend_deep_bench(list(DEEP_PLAYERS), FA_SLEEPER, DEEP_BYES, target=3)
check("a free agent is dropped even though \"FA\" is a truthy team",
      [p["id"] for p in fa], ["1001", "3002"])
check("and no club called FA reaches the board",
      sorted({p["team"] for p in fa}), ["BUF", "DET"])

# Every roster needs one kicker and one defense, and search_rank ranks both
# far below any receiver -- so depth alone does not guarantee the two slots a
# league cannot start without. FULL_POSITION_COVER pulls them forward until
# every club has one. Here the receiver is the best-known player in the pool
# and still goes last.
COVER_SLEEPER = {
    "1001": DEEP_SLEEPER["1001"],
    "4101": {"full_name": "Famous Receiver", "position": "WR", "team": "DET", "search_rank": 2},
    "4102": {"full_name": "Some Kicker",     "position": "K",  "team": "MIA", "search_rank": 5000},
    "MIA":  {"position": "DEF", "team": "MIA"},
}
cover = bp.extend_deep_bench(list(DEEP_PLAYERS), COVER_SLEEPER, DEEP_BYES, target=3)
check("a kicker and a defense are taken before a better-known receiver",
      sorted(p["pos"] for p in cover[1:]), ["DST", "K"])

deep_all = bp.extend_deep_bench(list(DEEP_PLAYERS), COVER_SLEEPER, DEEP_BYES, target=4)
check("and the receiver still arrives once both slots are covered",
      [p["pos"] for p in deep_all[1:]].count("WR"), 1)

def test_cfbd_crosswalk():
    """The CFBD draft-pick join, against a pool small enough to reason about.

    This one carries a hazard the other two crosswalks do not: a school name.
    Sleeper says "Miami (FL)" and CFBD says "Miami", and they are two strings
    for one school sitting next to "Miami (OH)", which is a genuinely
    different one. Get that wrong in the obvious direction and the join loses
    every player out of a major programme while working perfectly for
    everybody else -- a partial failure, which is the kind nobody notices.

    ---- Every tier is tested where NO OTHER tier can rescue it ----

    The first version of this file did not do that, and two mutations proved
    it: replacing normalise_college() with normalise(), and deleting the
    NFL-team tier outright, both left it green. Each tier had been given a
    fixture that the tier below it could also satisfy, so the suite was
    measuring "does the join work at all" three times over.

    So the pool below deliberately carries TWO Cam Wards and TWO Carnell
    Tates -- same name, same position, different schools and clubs. A
    duplicate kills the name-only tier, and a pick whose NFL team matches
    neither of them kills the team tier, which is what leaves exactly one
    tier able to answer. This is the same lesson the Strategy and Trade
    boards each paid for once: a fixture written to demonstrate a feature
    proves less than one written to starve it.

    Everything here is synthetic. The real feed needs a key, and the shape of
    what it returns was read off CFBD's published OpenAPI spec, so what is
    pinned below is this file's own logic rather than an assumption about
    theirs.
    """
    sleeper = {
        # Miami (FL) against CFBD's "Miami" -- the case the alias table is
        # for -- with a namesake at another school so the name tier cannot
        # answer for either of them.
        "1": {"full_name": "Cam Ward", "position": "QB",
              "team": "TEN", "college": "Miami (FL)"},
        "8": {"full_name": "Cam Ward", "position": "QB",
              "team": "CLE", "college": "Ohio"},
        # Miami (OH), which must NOT collapse into Miami (FL).
        "2": {"full_name": "Travis Ward", "position": "WR",
              "team": "CIN", "college": "Miami (OH)"},
        # Unique on name and position: the only one the loosest tier can have.
        "3": {"full_name": "Jeremiyah Love", "position": "RB",
              "team": "ARI", "college": "Notre Dame"},
        # A second namesake pair, for the NFL-team tier.
        "4": {"full_name": "Carnell Tate", "position": "WR",
              "team": "TEN", "college": "Ohio State"},
        "9": {"full_name": "Carnell Tate", "position": "WR",
              "team": "NYJ", "college": "Directional State"},
        # On our books, never in this draft class.
        "6": {"full_name": "Old Timer", "position": "TE",
              "team": "KC", "college": "Alabama"},
        # Not a fantasy position, so never indexed at all.
        "7": {"full_name": "Some Corner", "position": "CB",
              "team": "NYJ", "college": "LSU"},
    }
    stats = {k: {} for k in sleeper}
    indexes = bp.index_sleeper(sleeper)
    college_index = bp.index_sleeper_by_college(sleeper)

    def pick(name, position, college, nfl, overall, athlete, extra=None):
        row = {"name": name, "position": position, "collegeTeam": college,
               "nflTeam": nfl, "overall": overall, "round": 1,
               "pick": overall, "year": 2026, "collegeAthleteId": athlete}
        row.update(extra or {})
        return row

    def link(rows):
        return bp.link_cfbd_draft(stats, sleeper, indexes, college_index, rows)

    # ---- tier 1: only the school can answer ----
    # PIT is neither Cam Ward's club, so the team tier is dead; there are two
    # Cam Wards, so the name tier is dead. If the alias is missing or the
    # wrong normaliser is used, this player is simply not found.
    only_college, _ = link([pick("Cam Ward", "Quarterback", "Miami", "PIT", 1, 4001)])
    check("CFBD: a school the two feeds spell differently is the join, alone",
          only_college.get("1", {}).get("athlete"), 4001)
    check("CFBD: and it brings the pick, which is the whole point",
          only_college.get("1", {}).get("overall"), 1)
    check("CFBD: the namesake at another school is untouched",
          "8" in only_college, False)

    # Miami (OH) is a different school and must resolve to its own player.
    other_miami, _ = link([pick("Travis Ward", "WR", "Miami (OH)", "PIT", 20, 4002)])
    check("CFBD: Miami (OH) joins as itself, not as Miami (FL)",
          other_miami.get("2", {}).get("athlete"), 4002)

    # ---- tier 2: only the NFL team can answer ----
    # An unknown school kills the college tier; two Carnell Tates kill the
    # name tier. Nothing but the club is left.
    only_team, _ = link([pick("Carnell Tate", "Wide Receiver",
                              "Not A School CFBD Names", "TEN", 40, 4004)])
    check("CFBD: an unreconciled school falls back to the NFL club, alone",
          only_team.get("4", {}).get("athlete"), 4004)
    check("CFBD: and it picks the right one of the two namesakes",
          "9" in only_team, False)

    # ---- tier 3: only the name can answer ----
    # Unknown school, and a club that is not his either.
    only_name, _ = link([pick("Jeremiyah Love", "Running Back",
                              "Not A School CFBD Names", "PIT", 33, 4003)])
    check("CFBD: a unique name still joins when school and club both fail",
          only_name.get("3", {}).get("athlete"), 4003)

    # An ambiguous name with nothing else to go on must resolve to NOBODY
    # rather than to whichever was indexed first.
    ambiguous, _ = link([pick("Cam Ward", "QB", "Not A School", "PIT", 1, 4001)])
    check("CFBD: two players share a name and nothing else matches, so neither is taken",
          ambiguous, {})

    # ---- what must never join ----
    rest, _ = link([
        pick("Some Corner", "Cornerback", "LSU", "NYJ", 55, 4005),
        pick("Nobody Here", "Wide Receiver", "Toledo", "CLE", 90, 4006),
    ])
    check("CFBD: a defensive pick matches nobody, and that is correct",
          rest, {})
    check("CFBD: a veteran with no pick in this class is untouched",
          "6" in rest, False)

    # ---- the expert-ranking rule, enforced rather than trusted ----
    # CFBD returns preDraftRanking / preDraftPositionRanking / preDraftGrade on
    # every pick, and this project does not republish somebody else's scouting
    # grade. A pick number is a fact about what happened; a grade is an opinion
    # about what should have.
    graded, _ = link([pick("Cam Ward", "QB", "Miami", "PIT", 1, 4001,
                           {"preDraftRanking": 3, "preDraftPositionRanking": 1,
                            "preDraftGrade": 92})])
    stored = sorted(graded.get("1", {}))
    check("CFBD: no scouting grade is carried, however freely it is offered",
          [k for k in stored if any(w in k.lower() for w in ("grade", "rank"))], [])
    check("CFBD: and the pick itself still is",
          graded.get("1", {}).get("round"), 1)

    # ---- two of theirs claiming one of ours: keep neither ----
    doubled, doubled_report = link([
        pick("Cam Ward", "QB", "Miami", "PIT", 1, 4001),
        pick("Cam Ward", "QB", "Miami", "PIT", 2, 9999),
    ])
    check("CFBD: two picks claiming one player store neither",
          "1" in doubled, False)
    check("CFBD: and the collision is reported rather than swallowed",
          any(l.startswith("COLLISION") for l in doubled_report), True)

    # ---- the report is what finishes COLLEGE_ALIASES from a real run ----
    _weak, weak_report = link([pick("Carnell Tate", "WR",
                                    "Notre Dame University", "TEN", 40, 4004)])
    check("CFBD: a school that needed a weaker tier names itself in the report",
          any(l.startswith("COLLEGE |") and "Notre Dame University" in l
              for l in weak_report), True)

    _n, strange_report = link([pick("Jeremiyah Love", "Offensive Weapon",
                                    "Notre Dame", "ARI", 33, 4003)])
    check("CFBD: an unrecognised position is reported, not silently dropped",
          any(l.startswith("POSITION |") and "OFFENSIVE WEAPON" in l
              for l in strange_report), True)


    # ---- the alarm about COLLEGE_ALIASES has to be sized ----
    #
    # Both directions, because a threshold that silenced it everywhere would
    # pass a one-sided check and quietly remove the only thing that would tell
    # anybody the alias table had gone wrong. The first version fired on any
    # fixture that exercised a weaker tier, so this suite printed it twice on
    # a passing run -- and a warning that cries wolf is one nobody reads.
    def warnings_for(rows):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            link(rows)
        return [l for l in buffer.getvalue().splitlines() if "COLLEGE_ALIASES" in l]

    small = [pick("Jeremiyah Love", "RB", "Not A School CFBD Names", "PIT", 33, 4003)]
    check("CFBD: one pick matching no school is not evidence about the alias table",
          warnings_for(small), [])

    # A whole class that matched nothing on college IS evidence, and must say
    # so. Built from real board players so nothing but the school is wrong:
    # every one of these resolves on the NFL club instead.
    # Letter-only and all distinct, because normalise() strips DIGITS -- a
    # first version numbered them Player Number0..9, which all reduce to the
    # one key "playernumber", collide, and are correctly thrown away. The
    # fixture proved the collision guard instead of the alarm.
    CLASS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo",
             "Foxtrot", "Golf", "Hotel", "Kilo", "Lima"]
    assert len(CLASS) >= bp.CFBD_COLLEGE_ALARM_MIN
    klass, wide, wide_stats = [], dict(sleeper), dict(stats)
    for i, surname in enumerate(CLASS):
        klass.append(pick(f"Player {surname}", "WR", "Not A School CFBD Names",
                          "TEN", 100 + i, 5000 + i))
        wide[f"w{i}"] = {"full_name": f"Player {surname}", "position": "WR",
                         "team": "TEN", "college": "Directional State"}
        wide_stats[f"w{i}"] = {}
    wide_indexes = bp.index_sleeper(wide)
    wide_college = bp.index_sleeper_by_college(wide)
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        linked_wide, _ = bp.link_cfbd_draft(wide_stats, wide, wide_indexes,
                                            wide_college, klass)
    warned = [l for l in buffer.getvalue().splitlines() if "COLLEGE_ALIASES" in l]
    check("CFBD: a whole class matching no school still raises the alarm",
          len(warned), 1)
    check("CFBD: and those picks did join, on the weaker tier",
          len(linked_wide), len(CLASS))

    # ---- the normaliser itself, where the Miami trap actually lives ----
    check("college: Sleeper's Miami (FL) and CFBD's Miami are one school",
          bp.normalise_college("Miami (FL)"), bp.normalise_college("Miami"))
    check("college: Miami (OH) is NOT that school",
          bp.normalise_college("Miami (OH)") == bp.normalise_college("Miami"), False)
    check("college: punctuation and case do not matter",
          bp.normalise_college("texas a&m"), bp.normalise_college("Texas A&M"))
    check("college: accents are stripped the way names already are",
          bp.normalise_college("San Jose State"), bp.normalise_college("San José State"))
    check("college: nothing is not something",
          bp.normalise_college(None), "")
    # normalise() eats generational suffixes -- jr, sr, ii, iii, iv, v. A
    # school is not a person, and running one through the wrong normaliser is
    # the drift this second function exists to prevent.
    check("college: a school is not put through the person normaliser",
          bp.normalise_college("Old Dominion"), "olddominion")


test_cfbd_crosswalk()


print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: " + ", ".join(FAILURES))
    sys.exit(1)
print("OK")
