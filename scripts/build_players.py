#!/usr/bin/env python3
"""
Rebuild players.js and stats.js from live data.

Sources (all free, no key, no account -- except the last, which is optional)
  https://api.sleeper.app/v1/players/nfl                    player master, injury, depth chart
  https://api.sleeper.app/v1/stats/nfl/regular/{season}     season totals
  https://api.sleeper.app/v1/stats/nfl/regular/{yr}/{wk}    weekly game logs
  https://api.sleeper.app/v1/projections/nfl/regular/{yr}   projections
  https://fantasyfootballcalculator.com/api/v1/adp/{format} ADP, one set per scoring format
  .../getNFLPlayerList (Tank01, via RapidAPI)               source-id crosswalk, needs TANK01_KEY
  github.com/nflverse/nflverse-data/releases/download/...   a second, independent record of
                                                            the same football, used to CHECK
                                                            Sleeper and never to replace it
  github.com/ffverse/ffopportunity/releases/download/...    precomputed expected fantasy
                                                            points (xFP), display-only in
                                                            the usage panel like the rest
                                                            of the `u` block

TANK01_KEY is read from the environment and is optional. Without it the
crosswalk step is skipped, the build is otherwise identical, and player news
stays switched off in the app. Nothing here may depend on a third party being
up in order to produce a board.

Sleeper asks that these be called no more than once a day.
FFC asks for attribution.

This writes raw components only. Fantasy points are NOT computed here — app.js
applies the scoring rules in the browser, so a league can change them without
rebuilding this data. Sleeper's own pts_half_ppr is ignored for the same
reason it always was: it bakes in assumptions we do not share.

Run by hand:  python scripts/build_players.py
"""

import csv
import gzip
import io
import json
import os
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone

SLEEPER = "https://api.sleeper.app/v1"

FFC_URL = ("https://fantasyfootballcalculator.com/api/v1/adp/{fmt}"
           "?teams={teams}&year={year}&position=all")
ADP_YEAR = 2026

# One ADP set per scoring format, because the draft room can now be set to any
# of the three and 10-team half-PPR ADP would misprice a full-PPR draft by a
# round or more. The short key is what app.js looks up from league.scoring.
#
# Team count is deliberately NOT a second axis. FFC takes a teams= parameter and
# echoes it back in the response meta, but it does not filter the underlying
# sample: 8, 10, 12 and 14 all return the same rows, the same ADP and the same
# total_drafts (checked across 2024, 2025 and 2026). Requesting four team counts
# would write four identical copies of each set and imply a precision the feed
# does not have. If FFC ever starts breaking the sample out by team size, add
# the axis here and widen the key.
ADP_FORMATS = {"standard": "standard", "half": "half-ppr", "ppr": "ppr"}
DEFAULT_FORMAT = "half"          # the Alpine league, and the app's fallback
FFC_TEAMS = 10                   # sent for correctness; see the note above

PLAYERS_FILE = "players.js"
STATS_FILE = "stats.js"
UNMATCHED_FILE = "unmatched.txt"
# Read, never written. check_app_rules() looks in here for the other half of
# a scoring rule -- see the note on that function.
APP_FILE = "app.js"

KEEP = 320             # players written per ADP set (FFC currently returns 205-271)

# FFC's real ADP sample stops where real drafters stop -- 223 to 271 rows
# depending on format, per the 29 August 2026 players.js. A league running
# 24 teams over 20 rounds needs 480 picks, more than any format's real
# sample carries on its own, and until this existed the setup screen simply
# refused the combination (setupProblem() in app.js) rather than ever
# drawing a board that deep. DEEP_TARGET is what extend_deep_bench() tops
# each format's list up to, using Sleeper's own player master once real ADP
# runs out -- see that function's own comment for why search_rank, not an
# invented number, is the ordering it uses below real ADP. 480 is the
# deepest pick count any offered league can ask for (TEAM_COUNTS tops out
# at 24, and the setup screen's own round range tops out at 20); it is a
# ceiling extend_deep_bench() fills toward, not a floor it pads to
# artificially if Sleeper's own pool runs out first.
DEEP_TARGET = 480
# One starting kicker and one starting defense per club, at the largest league
# the setup screen offers. There are only 32 of each in the league, so this is
# "all of them" rather than a number chosen to fit.
FULL_POSITION_COVER = 32

# Every fantasy-relevant Sleeper position, in one place. index_sleeper() and
# extend_deep_bench() both need exactly this list, and writing it out twice
# is the same "league shape written down twice" trap this project's own
# rule elsewhere already names.
FANTASY_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")

WEEKLY_KEEP = 180      # players who also get week-by-week game logs
# Every season back to 2018 covers the full career of essentially any player
# with 2026 draft relevance. Seasons that return nothing are skipped, so this
# is self-limiting if Sleeper's history does not reach that far.
STAT_SEASONS = list(range(2018, 2026))

# Week-by-week logs, newest first. Two seasons, not more.
#
# Season totals above already go back to 2018, which is what a career table
# wants. Weekly rows answer a different and narrower question during a draft
# -- is he trending up, and what did the injury year look like -- and that is
# last season and the one before it. Each season costs about 184KB in
# stats.js, which is a plain script tag on a page with no build step, so a
# five-year selector would put a megabyte of render-blocking JSON in front of
# a phone to answer a question nobody asks mid-draft.
WEEKLY_SEASONS = [2025, 2024]
WEEKLY_WEEKS = 18
PROJECTION_SEASON = 2026

# Past seasons' projections, kept beside the actuals so the app can be held to
# what it said. Until now only the coming season was stored and it was
# overwritten nightly, which meant the one question worth asking of a
# projection -- was it any good -- had no data behind it at all. Season totals
# reach back to 2018 and every one of them is a graded answer to a forecast
# nobody kept.
#
# Three back rather than all of them. A projection block is about the size of a
# season block, so each year costs roughly what a year of actuals costs in a
# file that is a plain script tag on a page with no build step, and three is
# enough to separate a model that is calibrated from one that had a good year.
#
# Whether Sleeper serves these at all is a question this cannot answer from
# here: the endpoint takes a year, and asking for a past one may return the
# preseason forecast, the in-season revision, or nothing. Each fetch is
# optional and the counts are printed, so a season that comes back empty is
# visible in the run rather than silently absent from the file. If they all
# come back empty this list still earns its place going forward -- next year's
# run finds 2026 in it.
PROJECTION_HISTORY = [2025, 2024, 2023]

POSITION_MAP = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE",
                "PK": "K", "K": "K", "DEF": "DST", "DST": "DST"}

TEAM_ALIASES = {"JAC": "JAX", "LA": "LAR", "WSH": "WAS", "SD": "LAC",
                "OAK": "LV", "STL": "LAR", "ARZ": "ARI", "BLT": "BAL",
                "CLV": "CLE", "HST": "HOU"}

TEAM_CITIES = {
    "ARI": "Arizona", "ATL": "Atlanta", "BAL": "Baltimore", "BUF": "Buffalo",
    "CAR": "Carolina", "CHI": "Chicago", "CIN": "Cincinnati", "CLE": "Cleveland",
    "DAL": "Dallas", "DEN": "Denver", "DET": "Detroit", "GB": "Green Bay",
    "HOU": "Houston", "IND": "Indianapolis", "JAX": "Jacksonville",
    "KC": "Kansas City", "LAC": "LA Chargers", "LAR": "LA Rams", "LV": "Las Vegas",
    "MIA": "Miami", "MIN": "Minnesota", "NE": "New England", "NO": "New Orleans",
    "NYG": "NY Giants", "NYJ": "NY Jets", "PHI": "Philadelphia", "PIT": "Pittsburgh",
    "SEA": "Seattle", "SF": "San Francisco", "TB": "Tampa Bay", "TEN": "Tennessee",
    "WAS": "Washington",
}

# The 32 clubs, and the one test for "is this a real team". TEAM_CITIES is
# already exactly them and is needed for a defense's own city name anyway, so
# this is a view of it rather than a second list that could drift.
NFL_TEAMS = frozenset(TEAM_CITIES)

INJURY_CODES = {
    "questionable": "Q", "doubtful": "D", "out": "O",
    "ir": "IR", "injured reserve": "IR",
    "pup": "PUP", "physically unable to perform": "PUP",
    "nfi": "NFI", "non football injury": "NFI",
    "sus": "SUS", "suspended": "SUS", "dnr": "DNR", "cov": "COV",
}

MANUAL_MATCHES = {
    # Sleeper now lists Travis Hunter's primary `position` as "DB" rather than
    # a FANTASY_POSITIONS value, even though his own `fantasy_positions` array
    # still carries "WR" and FFC still drafts him as one (~ADP 162). That
    # single field is all index_sleeper() checks, so he silently fell out of
    # every automatic join tier -- by_name_pos_team, by_name_pos and even the
    # loosest by_name fallback are all built from that same filtered pass.
    # Confirmed against the live Sleeper API 6 September 2026: position "DB",
    # fantasy_positions ["DB", "WR"]. Same Sleeper id NFLVERSE_MATCHES already
    # trusts for him, so this also un-silences that override -- it has been a
    # no-op since his id disappeared from `stats` (link_nflverse() only
    # applies NFLVERSE_MATCHES to an id already present there).
    "Travis Hunter": "12530",
}

# ---------------------------------------------------------------- scoring
#
# There isn't any, and that is the point. This pipeline used to apply one
# league's scoring and bake a points total into stats.js, which meant the
# browser could never rescore anybody and every scoring question needed a
# rebuild. A data pipeline should record facts, not opinions about how to
# value them, so the rules now live in app.js and this file writes raw
# components only.
#
# The one thing that does have to be shared is which short key holds which
# raw stat. Rather than write that map out again in JavaScript and let the
# two drift, it is generated into stats.js from STAT_FIELDS below.
#
# Anything scoreable must appear in STAT_FIELDS. A stat that was never
# stored can never be rescored.

# Scoring inputs, in the order the editor shows them. Values are not stored
# here — app.js owns those — but the pipeline has to know which raw stats
# are scoreable so it can emit the key map and flag anything unstored.
SCOREABLE = [
    "pass_yd", "pass_td", "pass_int", "pass_2pt",
    "pass_att", "pass_cmp", "pass_fd",
    "rush_yd", "rush_td", "rush_2pt", "rush_fd",
    "rec", "rec_yd", "rec_td", "rec_2pt", "rec_fd", "rec_40p",
    "fum_lost", "kr_td", "pr_td",
    "xpm", "xpmiss", "fgmiss",
    # An EXTRA on top of fgmiss, not a replacement for it: a 45-yard miss
    # increments fgmiss and fgmiss_40_49 both, so these default to zero in
    # app.js and a league scaling a miss by distance sets the base on fgmiss
    # and the increment here. Sleeper sends no fgmiss_0_19 -- there were no
    # misses inside twenty yards all last season.
    "fgmiss_20_29", "fgmiss_30_39", "fgmiss_40_49", "fgmiss_50_59", "fgmiss_60p",
    "fgm_0_19", "fgm_20_29", "fgm_30_39", "fgm_40_49", "fgm_50_59", "fgm_60p",
    "sack", "int", "fum_rec", "safe",
    "def_td", "def_st_td", "blk_kick", "def_2pt",
    "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13", "pts_allow_14_20",
    "pts_allow_21_27", "pts_allow_28_34", "pts_allow_35p",
]

# Raw counting stats worth keeping, and the short key used in stats.js.
#
# This is the whole point of the pipeline: record facts, not opinions about
# how to value them. Anything the browser might need to score has to be here,
# because a stat that was never stored can never be rescored. Sparse by
# design — compact() drops every zero, so a running back carries no kicking
# fields and a defense carries no receiving ones.
STAT_FIELDS = {
    # --- passing ---
    "pass_att": "pa", "pass_cmp": "pc", "pass_yd": "py", "pass_td": "pt",
    "pass_int": "pi", "pass_2pt": "p2", "pass_fd": "pfd",
    # --- rushing ---
    "rush_att": "ra", "rush_yd": "ry", "rush_td": "rt", "rush_2pt": "r2",
    "rush_fd": "rfd",
    # --- receiving ---
    # rec_40p is a catch of 40 or more yards, not a bonus on one. Sleeper
    # forecasts it, unlike every other big-play key it carries.
    "rec_tgt": "tg", "rec": "rc", "rec_yd": "cy", "rec_td": "ct",
    "rec_2pt": "c2", "rec_fd": "cfd", "rec_40p": "c40",
    # --- returns and fumbles ---
    "kr": "kr", "kr_yd": "kry", "kr_td": "krt",
    "pr": "pr", "pr_yd": "pry", "pr_td": "prt",
    "fum_lost": "fl",
    # --- kicking, by distance ---
    # Sleeper does separate 50-59 from 60+, despite an older comment in this
    # file claiming otherwise, so a league paying more for the long ones can
    # be scored exactly rather than approximated.
    "fgm": "fg", "xpm": "xp", "xpmiss": "xpx", "fgmiss": "fgx",
    "fgm_0_19": "f19", "fgm_20_29": "f29", "fgm_30_39": "f39",
    "fgm_40_49": "f49", "fgm_50_59": "f59", "fgm_60p": "f60",
    # Misses by distance, and the rest of the kicking line Sleeper has been
    # sending all along. unmatched.txt has listed every one of these under
    # "Sleeper stats we are not storing" since the file existed.
    #
    # fgx is the total and it INCLUDES a blocked kick, so fbk is stored and
    # is deliberately not scoreable: a rule on it would charge a block twice.
    "fgmiss_20_29": "x29", "fgmiss_30_39": "x39", "fgmiss_40_49": "x49",
    "fgmiss_50_59": "x59", "fgmiss_60p": "x60",
    "fg_blkd": "fbk", "xp_blkd": "xbk", "fgm_lng": "flg",
    "fga": "fga", "xpa": "xpa",
    # --- role, red zone and snaps: NOT stored, and the reason is the size ---
    #
    # rec_rz_tgt, rush_rz_att, pass_rz_att, rec_air_yd, rec_yar, pass_air_yd,
    # rush_yac, off_snp, tm_off_snp, rush_40p, rec_drop, rush_btkl, rec_lng
    # and rush_lng all belong here eventually. They were added, measured and
    # taken out again, because the measurement was decisive: they cost
    # 70 KB gzipped in stats.js -- which is a plain classic <script src> in
    # front of every first paint -- and nothing renders one of them.
    #
    # For scale, the five fgmiss_* bands above are the actual new scoring
    # capability in this change and they cost 0.7 KB gzipped. The whole
    # kicking line is 3.2. These fourteen are 98% of the weight of storing
    # anything at all, for a sheet panel that does not exist. Two of them --
    # off_snp and tm_off_snp -- are 20.5 KB between them on their own.
    #
    # This is the same argument WEEKLY_SEASONS already settles for weekly
    # logs, and it lands the same way: a stat costs a phone bytes on every
    # load whether or not a pixel ever shows it. They come back in the same
    # change that draws them, beside the nflverse share and EPA figures they
    # are meant to sit next to.
    #
    # They are deliberately NOT in IGNORED_KEYS, so unmatched.txt goes on
    # listing them. That list is the thing this whole piece of work exists
    # because nobody was reading; hiding them again to keep it tidy would be
    # re-creating the blindness on purpose.
    # --- defense and special teams ---
    "sack": "sk", "int": "in", "fum_rec": "fr", "safe": "sf",
    "def_td": "dtd", "def_st_td": "sttd", "blk_kick": "bk", "def_2pt": "d2",
    # Raw points and yards allowed, as well as Sleeper's own banded counts.
    # The raw number lets a weekly line be banded any way a league likes;
    # the banded counts are the only option for a season total, where the
    # per-game bands have already been collapsed and cannot be recovered.
    "pts_allow": "ptsa", "yds_allow": "ydsa",
    "pts_allow_0": "d0", "pts_allow_1_6": "d1", "pts_allow_7_13": "d7",
    "pts_allow_14_20": "d14", "pts_allow_21_27": "d21",
    "pts_allow_28_34": "d28", "pts_allow_35p": "d35",
}

# Keys we knowingly ignore, so the diagnostic below stays useful.
# off_snp and tm_off_snp used to be here and are deliberately not any more.
# They are not stored either -- see the note in STAT_FIELDS -- so they now
# appear in unmatched.txt's unstored list, which is exactly where a key we
# intend to store later belongs. "Knowingly ignored" is a claim about a key
# nobody wants; these are wanted and are waiting on something to draw them.
IGNORED_KEYS = {
    "gp", "gs", "gms_active", "team", "tm_def_snp",
    "tm_st_snp", "def_snp", "st_snp", "pts_std", "pts_ppr", "pts_half_ppr",
    "rank_std", "rank_ppr", "rank_half_ppr", "pos_rank_std", "pos_rank_ppr",
    "pos_rank_half_ppr", "anytime_tds", "tm_st_snp_pct",
    # Folded into the finer buckets by reconcile(), so not a gap.
    "fgm_50p", "fgmiss_50p",
}


# ---------------------------------------------------------------- helpers

def fetch_json(url, optional=False):
    request = urllib.request.Request(url, headers={"User-Agent": "alpine-draft-room/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as error:
        if optional:
            print(f"  ! skipped {url} ({error})")
            return {}
        raise


def fetch_json_headers(url, headers, optional=False):
    """fetch_json with request headers, for a source that needs a key.

    Split out rather than adding a parameter to fetch_json, because every
    caller of that one is a free public feed and should stay obviously so.
    A key is a different kind of dependency and it reads better named.
    """
    merged = {"User-Agent": "alpine-draft-room/1.0"}
    merged.update(headers or {})
    request = urllib.request.Request(url, headers=merged)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as error:
        if optional:
            print(f"  ! skipped {url} ({error})")
            return {}
        raise


def normalise(name):
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", text)
    return re.sub(r"[^a-z]", "", text)


def clean_team(code):
    return TEAM_ALIASES.get((code or "FA").upper(), (code or "FA").upper())


def injury_code(entry):
    for field in ("injury_status", "status"):
        value = (entry.get(field) or "").strip().lower()
        if value in INJURY_CODES:
            return INJURY_CODES[value]
    return ""


def check_app_rules():
    """Fail the run when a scoreable stat has no rule waiting for it in app.js.

    This file already refuses to write when a SCOREABLE stat has no home in
    STAT_FIELDS, because the browser can only score what the pipeline
    records. The other direction had no guard and is just as silent:
    pointsUnder() walks the rules object rather than the stat list, so a stat
    added here with no entry in DEFAULT_RULES is never summed, and one
    missing from RULE_GROUPS or RULE_LABELS never appears in the editor.
    Neither shows up as an error. The total is simply lower than it should
    be, which is the shape of bug this project keeps finding the hard way.

    unmatched.txt has said "and give it a default in app.js" at the head of
    its unstored-keys list all along. Nothing enforced it.

    app.js is read as text rather than parsed. Only the key names are needed,
    and the three tables are all one identifier per entry -- but if their
    shape ever changes this raises rather than passing quietly, which is the
    whole point of a guard.

    Run before any network, so a mistake in a rule table costs nothing.
    """
    try:
        with open(APP_FILE, encoding="utf-8") as handle:
            source = handle.read()
    except OSError as error:
        raise SystemExit(f"Cannot read {APP_FILE} to check the scoring rules: {error}")

    def table(name, close):
        match = re.search(r"const " + name + r"\s*=\s*[\[{](.*?)\n" + re.escape(close),
                          source, re.S)
        if not match:
            raise SystemExit(
                f"{APP_FILE}: could not find {name}. The scoring-rule check reads "
                "these three tables by name, so a rename has to be made here too.")
        return match.group(1)

    def keys_of(text):
        # Comments out, then strings out. Both can hold a word followed by a
        # colon -- these tables are heavily commented on purpose -- and
        # either would otherwise read as a rule that does not exist. Found
        # by this check firing on its own explanatory comment.
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        text = re.sub(r"//[^\n]*", "", text)
        return set(re.findall(r"([a-z][a-z0-9_]*)\s*:", re.sub(r'"[^"]*"', '""', text)))

    defaults = keys_of(table("DEFAULT_RULES", "};"))
    labels = keys_of(table("RULE_LABELS", "};"))
    # Group titles are quoted prose and start with a capital, so an
    # identifier-shaped string is a rule and nothing else is.
    grouped = set(re.findall(r'"([a-z][a-z0-9_]*)"', table("RULE_GROUPS", "];")))

    problems = []
    for stat in SCOREABLE:
        missing = [where for where, known in (
            ("a default in DEFAULT_RULES", defaults),
            ("a group in RULE_GROUPS", grouped),
            ("a label in RULE_LABELS", labels)) if stat not in known]
        if missing:
            problems.append(f"{stat}: needs " + ", ".join(missing))
    for rule in sorted(defaults - set(SCOREABLE)):
        problems.append(f"{rule}: has a default in {APP_FILE} but is not SCOREABLE, "
                        "so STAT_KEYS will not carry it and pointsUnder() scores it zero")
    if problems:
        raise SystemExit(f"{APP_FILE} and SCOREABLE disagree:\n  " + "\n  ".join(problems))

    print(f"  a default, a group and a label for all {len(SCOREABLE)} scoreable stats")


SEEN_KEYS = set()


def reconcile(row):
    """Fold Sleeper's coarse projection keys into the shape its actuals use.

    Projections are a coarser dataset than season and weekly lines. They carry
    a combined fgm_50p where actuals carry fgm_50_59 and fgm_60p, and they
    express misses only as fgmiss_50p. Left alone, a kicker's projection loses
    every 50-yard field goal — 183 of them across 34 kickers — while his
    history keeps them, which makes the projection look far worse than the
    player.

    Checked against 2025: fgm_50p equals fgm_50_59 + fgm_60p on every row that
    carries both, so folding it in cannot double count. Everything 50+ is
    attributed to 50-59 rather than split, because projected 60-yarders are
    rare enough (10 all last season against 158 from 50-59) that splitting
    would be inventing precision the feed does not have.
    """
    if row.get("fgm_50p") and not row.get("fgm_50_59") and not row.get("fgm_60p"):
        row = dict(row)
        row["fgm_50_59"] = row["fgm_50p"]
    if row.get("fgmiss_50p") and not row.get("fgmiss"):
        row = dict(row) if row is not None else {}
        row["fgmiss"] = row["fgmiss_50p"]
    return row


def compact(row):
    """Keep the listed stats, and only where they are non-zero."""
    SEEN_KEYS.update(row.keys())
    row = reconcile(row)
    out = {}
    for source, short in STAT_FIELDS.items():
        value = row.get(source)
        if value:
            out[short] = round(float(value), 1) if isinstance(value, float) else int(value)
    return out


# ---------------------------------------------------------------- source ids
#
# One player, several providers, each with its own id. `x` on a stats record
# holds the foreign keys, so anything we add later joins to the same player
# without a second lookup at request time -- which is the part that matters.
# A name search performed while somebody is reading a profile is how one Josh
# Allen ends up wearing the other one's news, and every number around it would
# still be right.
#
# The key is read from the environment and never written down here. With no
# key the whole step is skipped, the build succeeds, and the app carries on
# exactly as it does today: no `x`, so no news. A pipeline that needs a
# third party to be up in order to produce a board is not a pipeline this
# project wants.
TANK01_KEY = os.environ.get("TANK01_KEY", "")
TANK01_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com"

# One call, not thirty-two. The free tier allows a thousand a month and the
# workflow runs daily, so per-team rosters (32 x 30 = 960) would spend the
# entire allowance on the crosswalk alone and leave nothing for the news the
# crosswalk exists to serve. getNFLPlayerList is the whole league in one.
TANK01_LIST = f"https://{TANK01_HOST}/getNFLPlayerList"


def fetch_tank01_players():
    """Every Tank01 player, or nothing at all. Never fatal."""
    if not TANK01_KEY:
        print("Tank01: no TANK01_KEY set, skipping the source-id crosswalk")
        return []

    print("Fetching Tank01 player list...")
    body = fetch_json_headers(TANK01_LIST, {
        "x-rapidapi-key": TANK01_KEY,
        "x-rapidapi-host": TANK01_HOST,
    }, optional=True)

    rows = body.get("body") if isinstance(body, dict) else body
    rows = rows if isinstance(rows, list) else []
    print(f"  {len(rows)} players")
    return rows


def link_source_ids(stats, sleeper, indexes, tank_rows):
    """Attach Tank01 ids to our records, and report anything that did not.

    Two joins, in order of how much they can be trusted:

    1. Their `sleeperBotID`, if they carry it. That is an identifier both
       sides already agree on, so there is nothing to get wrong.
    2. Failing that, the same name/position/team match the ADP join uses.
       Reused rather than reimplemented -- a second normalise() that drifted
       from the first would be the same class of bug as a league shape
       written down twice.

    Returns (linked, report_lines). Everything that fails is in the report:
    a crosswalk that misses quietly is worse than no crosswalk, because a
    wrong match does not look wrong on the page.
    """
    by_name_pos_team, by_name_pos, _by_name = indexes
    linked, report = {}, []
    claimed = {}                        # our id -> their id, to catch collisions
    method = {}                         # our id -> how it was matched

    for row in tank_rows:
        their_id = str(row.get("playerID") or "").strip()
        if not their_id:
            continue

        name = (row.get("longName") or row.get("espnName") or "").strip()
        position = POSITION_MAP.get((row.get("pos") or "").upper())
        team = clean_team(row.get("team"))

        # 1. The identifier they already share with us.
        our_id = str(row.get("sleeperBotID") or "").strip()
        how = "sleeperBotID"

        # 2. Name, position and team, strictest first -- and only for players
        #    we actually carry, so the report is about our pool rather than
        #    about every practice-squad player in the league.
        if not our_id or our_id not in stats:
            our_id = ""
            key = normalise(name)
            if key and position:
                match = (by_name_pos_team.get((key, position, team))
                         or by_name_pos.get((key, position)))
                if match:
                    our_id = match[0]
                    how = "name+pos+team"

        if not our_id or our_id not in stats:
            continue

        # Two of theirs pointing at one of ours means the join is wrong, not
        # that the player has two ids. Report it and keep neither, because
        # picking one at random is how the wrong news gets served.
        if our_id in claimed and claimed[our_id] != their_id:
            report.append(f"COLLISION | {name} | {position} | {team} | "
                          f"{claimed[our_id]} and {their_id} both map to {our_id}")
            linked.pop(our_id, None)
            continue

        claimed[our_id] = their_id
        linked[our_id] = their_id
        method[our_id] = how

    # What we hold and could not link. This is the list that matters: every
    # one of these is a player whose sheet will have no news, and silence
    # about it is exactly what unmatched.txt exists to prevent.
    for our_id, record in stats.items():
        if our_id in linked:
            continue
        entry = sleeper.get(our_id) or {}
        name = entry.get("full_name") or entry.get("last_name") or our_id
        pos = entry.get("position") or "?"
        report.append(f"{name} | {pos} | {clean_team(entry.get('team'))} | "
                      f"no Tank01 id")

    # Counted from what survived, not from what was attempted. Tallying as we
    # went made a collision read "1 on sleeperBotID" beside "linked 0", and a
    # duplicated row count twice -- a number that disagrees with the thing it
    # is describing is how you stop trusting the numbers.
    direct = sum(1 for k in linked if method.get(k) == "sleeperBotID")
    fallback = len(linked) - direct
    print(f"  linked {len(linked)} of {len(stats)} "
          f"({direct} on sleeperBotID, {fallback} on name)")
    if tank_rows and not direct:
        # Worth saying plainly: it means the good join is not available and
        # every row came from name matching, which is the fragile one.
        print("  ! no sleeperBotID on any row -- every link came from a name")
    return linked, report


def index_sleeper(sleeper):
    """Index the Sleeper master three ways, strictest first, so a name that is
    ambiguous on its own can still be matched on position and team."""
    by_name_pos_team, by_name_pos, by_name = {}, {}, {}

    for player_id, entry in sleeper.items():
        if entry.get("position") not in FANTASY_POSITIONS:
            continue
        key = normalise(entry.get("full_name") or entry.get("last_name") or "")
        if not key:
            continue
        record = (player_id, entry)
        position = entry["position"]
        team = clean_team(entry.get("team"))
        by_name_pos_team.setdefault((key, position, team), record)
        by_name_pos.setdefault((key, position), record)
        by_name.setdefault(key, []).append(record)

    return by_name_pos_team, by_name_pos, by_name


def join_rows(adp_rows, sleeper, indexes):
    """Turn one format's FFC rows into player records carrying a Sleeper id.

    Runs once per scoring format. Anything that fails to join is returned
    separately rather than dropped, so unmatched.txt can report it.
    """
    by_name_pos_team, by_name_pos, by_name = indexes
    players, unmatched = [], []

    for row in adp_rows:
        position = POSITION_MAP.get((row.get("position") or "").upper())
        if position is None:
            continue

        team = clean_team(row.get("team"))
        # Same rule as extend_deep_bench()'s, from the same constant, because
        # FFC ranks a few unsigned players too -- its sample was taken before
        # they were released, so their ADP is a fact about a roster that no
        # longer exists. Left in they arrive as a 33rd "club" called FA with no
        # bye. Pre-existing rather than new: the 30 August build carried Bub
        # Means in the standard and PPR sets and missed the half set only by
        # luck, which is why "all 32 clubs resolve to a colour" had never gone
        # red.
        if team not in NFL_TEAMS:
            continue
        name = (row.get("name") or "").strip()
        key = normalise(name)
        sleeper_position = "DEF" if position == "DST" else position
        match = None

        if position == "DST":
            entry = sleeper.get(team)
            if entry:
                match = (team, entry)
            name = f"{TEAM_CITIES.get(team, team)} Defense"

        if match is None and name in MANUAL_MATCHES:
            manual = MANUAL_MATCHES[name]
            if manual in sleeper:
                match = (manual, sleeper[manual])
        if match is None:
            match = by_name_pos_team.get((key, sleeper_position, team))
        if match is None:
            match = by_name_pos.get((key, sleeper_position))
        if match is None:
            candidates = by_name.get(key, [])
            if len(candidates) == 1:
                match = candidates[0]

        player_id, entry = match if match else ("", {})
        if not match:
            unmatched.append(f"{name} | {position} | {team} | ADP {row.get('adp')}")

        players.append({
            "id": player_id, "name": name, "pos": position, "team": team,
            "bye": int(row.get("bye") or 0),
            "adp": round(float(row.get("adp") or 999), 1),
            # FFC's real dispersion across recorded drafts — sd is the ADP
            # standard deviation, td the sample size it's measured over.
            # Fetched and thrown away until the Draft Room Cockpit needed a
            # survival probability honest enough to satisfy the project's
            # own standing rule against dressing a ranking up as a
            # measurement: 1 - Φ((pick - adp) / sd) is a real statistic
            # over real boards, not an invented one. td travels with it so
            # a thin sample can be withheld rather than trusted.
            "sd": round(float(row.get("stdev") or 0), 2),
            "td": int(row.get("times_drafted") or 0),
            "inj": injury_code(entry), "_entry": entry,
        })

    players.sort(key=lambda p: p["adp"])
    return players[:KEEP], unmatched


def extend_deep_bench(players, sleeper, team_byes, target):
    """Top up one format's real-ADP list with Sleeper's own deeper pool.

    Below real ADP there is no more market signal to rank by -- nobody in
    FFC's sample drafted these players, and that absence is itself the
    fact, not a gap to paper over. What's left is Sleeper's own player
    master, which runs to every player still on an NFL roster, ordered by
    `search_rank` -- Sleeper's general "how known is this player" figure,
    used for its own search/autocomplete and computed across virtually the
    whole league. It is not a fantasy opinion the way `pts_ppr` or
    `rank_ppr` are (both sit in IGNORED_KEYS for exactly that reason): it
    never claims to be a scored value, so using it here to order players
    nobody has scored an opinion on isn't the same mistake as scoring off
    Sleeper's own points.

    Every player this adds carries `deep: True`. The app owes the reader
    the same honesty it already gives a kicker or a defense (UNRANKED_
    POSITIONS in app.js): a rank with no market behind it is not the same
    claim as one FFC's real drafts priced, and the UI has to say so rather
    than let a deep-bench player sit in the same tier as somebody real
    drafters actually took.

    `players` is one format's real-ADP list (already `join_rows()`'s
    output, so every entry already carries a real Sleeper id or an empty
    one for an unmatched ADP row). Candidates are excluded by id, so a
    player already on the list -- real or, in principle, previously
    extended -- is never duplicated.
    """
    covered = {p["id"] for p in players if p["id"]}
    candidates = [
        (player_id, entry) for player_id, entry in sleeper.items()
        if player_id not in covered
        and entry.get("position") in FANTASY_POSITIONS
        # `entry.get("team")` was the test here and it is truthy for a free
        # agent: Sleeper stamps an unsigned player "FA", so retired and
        # released players came through as a 33rd "club" with no accent colour
        # and, worse, no bye. team_byes.get(team, 0) then gives them 0, and a
        # 0 bye reads as *never on bye* -- a quietly better roster in a grade
        # that spends 10% of itself on bye-week safety. Measured on the real
        # feed: fourteen of them on the half-PPR board, a retired Derek Carr
        # and four unsigned kickers among them.
        and clean_team(entry.get("team")) in NFL_TEAMS
    ]
    candidates.sort(key=lambda pair: pair[1].get("search_rank") or 9_999_999)

    room = target - len(players)
    if room <= 0 or not candidates:
        return players

    # Continues the real sequence rather than restarting it, so the whole
    # list stays sorted by "adp" with the deep tail strictly after every
    # real pick -- the one thing that lets a single divider, rather than a
    # per-position one, mark where real ADP ends (see PlayerQueueSidebar.jsx).
    next_adp = int(max((p["adp"] for p in players), default=0)) + 1

    # Kickers and defenses are pulled to the front of the queue until every
    # club has one, before depth is spent on anyone else.
    #
    # search_rank is a "how known is this player" figure, so it orders the
    # league's kickers and defenses far below its receivers -- and every roster
    # needs exactly one of each. Measured on the 30 August board: the half-PPR
    # set carried 19 kickers and 21 defenses, so an 18- or 24-team league could
    # not have filled those two starting slots even with picks to spare. That
    # is a ceiling poolSize() cannot see, because it counts players and not
    # positions, and it surfaces as a draft that completes and leaves lineups
    # unfillable rather than as a setup screen that refuses.
    #
    # Filling to DEEP_TARGET by search_rank alone happens to cover it today at
    # 480, which is exactly the kind of accident that stops being true when the
    # target moves. Stated as a rule instead: a total that fits is not the same
    # as a roster that fills.
    have = {}
    for player in players:
        have[player["pos"]] = have.get(player["pos"], 0) + 1
    scarce, rest = [], []
    for player_id, entry in candidates:
        position = POSITION_MAP.get(entry.get("position"))
        if position in ("K", "DST") and have.get(position, 0) < FULL_POSITION_COVER:
            have[position] = have.get(position, 0) + 1
            scarce.append((player_id, entry))
        else:
            rest.append((player_id, entry))
    ordered = scarce + rest

    extra = []
    for player_id, entry in ordered[:room]:
        position = POSITION_MAP.get(entry.get("position"))
        team = clean_team(entry.get("team"))
        if position == "DST":
            name = f"{TEAM_CITIES.get(team, team)} Defense"
        else:
            name = entry.get("full_name") or \
                f"{entry.get('first_name', '')} {entry.get('last_name', '')}".strip()
        extra.append({
            "id": player_id, "name": name, "pos": position, "team": team,
            "bye": team_byes.get(team, 0),
            # sd/td are 0 rather than omitted, matching what a real row gets
            # when FFC sends no stdev/sample -- survivalProbability() in
            # app.js already withholds a probability rather than divide by
            # a zero sd, so a deep-bench player correctly shows no "still
            # on the board" odds instead of a fabricated one.
            "adp": float(next_adp), "sd": 0.0, "td": 0,
            "inj": injury_code(entry), "_entry": entry, "deep": True,
        })
        next_adp += 1

    return players + extra


# Sleeper's distance bands are complete from this season on, and lossy
# before it. Measured 27 August 2026 over every kicker season we store:
# the six fgm_* bands account for 100.0% of fgm in 2024 and 2025 and for
# 83-91% before, and the five fgmiss_* bands account for 100.0% of fgmiss
# in 2024 and 2025 and for 52-63% before. The boundary is sharp -- there is
# no season that is partly one and partly the other -- so it is a change
# Sleeper made to its own history rather than a definition either side
# disagrees about.
BAND_COMPLETE_FROM = 2024

FG_MADE_BANDS = ("f19", "f29", "f39", "f49", "f59", "f60")
FG_MISS_BANDS = ("x29", "x39", "x49", "x59", "x60")


def check_miss_bands(stats):
    """Do Sleeper's distance bands account for every kick its own totals count?

    Both directions, because both are scored. The six fgm_* bands have been
    SCOREABLE since kickers existed here; the five fgmiss_* bands are new.
    Either one silently under-charging is invisible on screen: the totals
    reconcile perfectly against attempts, so nothing else in the pipeline
    ever compares a band to the total it is supposed to decompose.

    The blocked-kick correction that belongs in the nflverse audit does NOT
    belong here. `fga == fgm + fgmiss` reconciles for every kicker season
    without exception, so a block is structurally inside fgmiss -- and in
    the complete era the bands equal fgmiss exactly, so a block is inside a
    band too. Adding fbk back would overshoot. That correction is about
    nflverse's fg_missed, which is the narrower number; see AUDIT_BLOCKED.

    A season before BAND_COMPLETE_FROM falling short is expected and is
    reported as a rate. A season at or after it falling short is the thing
    that means something, and it is the only thing counted as a failure --
    a check that reports 145 known-lossy seasons every morning is a check
    nobody reads by the end of the week.
    """
    made, miss, over = {}, {}, []
    for our_id, record in sorted(stats.items()):
        for season, block in (record.get("s") or {}).items():
            got = made.setdefault(season, [0, 0])
            got[0] += block.get("fg") or 0
            got[1] += sum(block.get(k) or 0 for k in FG_MADE_BANDS)
            lost = miss.setdefault(season, [0, 0])
            lost[0] += block.get("fgx") or 0
            lost[1] += sum(block.get(k) or 0 for k in FG_MISS_BANDS)
            # A part cannot exceed the whole it decomposes, so this is never
            # the sparse-history story below -- it is a miscount at source,
            # and it nets invisibly against a shortfall in a season total.
            for label, total_key, band_keys in (
                    ("fgm", "fg", FG_MADE_BANDS), ("fgmiss", "fgx", FG_MISS_BANDS)):
                whole = block.get(total_key) or 0
                parts = sum(block.get(k) or 0 for k in band_keys)
                if parts - whole > 0.01:
                    over.append(f"  {season} | {our_id} | {label} {whole:g} | "
                                f"bands {parts:g} | +{parts - whole:g}")

    lines, off = [], 0
    lines.append("Sleeper's own totals against Sleeper's own distance bands. The")
    lines.append("totals are trustworthy either way -- fga == fgm + fgmiss for every")
    lines.append("kicker season -- so a shortfall here is a band that was never")
    lines.append("populated, not a kick that did not happen.")
    lines.append("")
    lines.append("season    fgm  in bands   short      fgmiss  in bands   short")
    for season in sorted(set(made) | set(miss)):
        m_total, m_band = made.get(season, [0, 0])
        x_total, x_band = miss.get(season, [0, 0])
        if not m_total and not x_total:
            continue
        m_pct = 100.0 * (m_total - m_band) / m_total if m_total else 0.0
        x_pct = 100.0 * (x_total - x_band) / x_total if x_total else 0.0
        lines.append(f"{season:<8}{m_total:>5.0f}{m_band:>10.0f}{m_pct:>7.1f}%"
                     f"{x_total:>12.0f}{x_band:>10.0f}{x_pct:>7.1f}%")
        if int(season) >= BAND_COMPLETE_FROM and (
                abs(m_total - m_band) > 0.01 or abs(x_total - x_band) > 0.01):
            off += 1

    lines.append("")
    lines.append(f"Bands are complete from {BAND_COMPLETE_FROM} on and lossy before it,")
    lines.append("and the two halves are lossy to very different degrees in this pool.")
    lines.append("The made bands very nearly reconcile throughout; the miss bands do not,")
    lines.append("leaving a third to a half of every pre-2024 miss in no band at all. So a")
    lines.append("league that scales a miss by distance gets a penalty that fires on about")
    lines.append("half the misses on an old season, while fgmiss itself stays whole. That")
    lines.append("is the reason the bands are an extra on fgmiss rather than a")
    lines.append("replacement for it, and it is visible on the Seasons tab.")
    lines.append("")
    if over:
        lines.append(f"{len(over)} seasons where the bands EXCEED the total they")
        lines.append("decompose. A part cannot be larger than its whole, so this is a")
        lines.append("miscount at source rather than the sparse history above -- and it")
        lines.append("nets against a shortfall in a season total, which is why it is")
        lines.append("counted on its own:")
        lines.extend(over[:20])
        if len(over) > 20:
            lines.append(f"  ... and {len(over) - 20} more, not listed")
        lines.append("")
    if off:
        lines.append(f"{off} seasons at or after {BAND_COMPLETE_FROM} DO NOT reconcile. "
                     "That is new.")
        lines.append("Either Sleeper changed something or a band key was renamed. The")
        lines.append("bands are an extra on top of fgmiss in app.js and that arrangement")
        lines.append("assumes they decompose it exactly.")
    else:
        lines.append(f"Every season from {BAND_COMPLETE_FROM} on reconciles exactly, "
                     "both directions.")
    return lines, off


# ---------------------------------------------------------------- nflverse
#
# A second, independent record of the same football. nflverse publishes
# nflfastR's play-by-play derivatives as plain files on a GitHub release --
# no key, no account -- and the .csv.gz variants are five to six times
# smaller than the .csv and open with the standard library alone.
#
# It is here to CHECK Sleeper, never to replace it. Sleeper stays
# authoritative for everything in STAT_FIELDS, because `pp` -- the archive of
# what we forecast for seasons already played -- was built against it, and a
# history that quietly re-based itself would turn projectionRecord() into a
# comparison between two feeds rather than between a forecast and an outcome.
#
# Nothing in this section writes a stored value. It reports.
NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download"

# Tied to STAT_SEASONS rather than copied from it. A season audited with no
# `s` block beside it is a comparison against nothing, and an `s` block with
# no audit is a season nobody is checking. nflverse covers 2018-2025, which
# is exactly what STAT_SEASONS asks for today.
NFL_SEASONS = STAT_SEASONS

# Sleeper id -> nflverse gsis_id, for a player the name join cannot reach.
#
# Not MANUAL_MATCHES: that one maps an FFC ADP name to a Sleeper id and is
# read by join_rows(). This is a different join between two different
# sources, and putting an entry in the wrong table is a silent no-op.
#
# Travis Hunter plays both ways, so nflverse lists him as a DB while we list
# him as a WR. His receiving is perfectly present under this gsis_id -- it is
# the position tier of the join that cannot see him. Measured 27 August 2026:
# he is the only one of 241 skill players on the board who needs a line here.
NFLVERSE_MATCHES = {
    "12530": "00-0040718",          # Travis Hunter, WR to us and DB to them
}

# What we stored, against what they derived. Short key on the left because
# that is what a finished record holds; nflverse column on the right.
#
# Measured 27 August 2026 over 2025: every pair below agreed exactly for
# every board player, bar one rushing line by five yards and two target
# lines by one. That is what makes the check worth running -- when these
# diverge next season, it means something.
AUDIT_PAIRS = [
    ("py", "passing_yards"), ("pt", "passing_tds"),
    ("pi", "passing_interceptions"), ("pa", "attempts"), ("pc", "completions"),
    ("ry", "rushing_yards"), ("rt", "rushing_tds"), ("ra", "carries"),
    ("cy", "receiving_yards"), ("ct", "receiving_tds"), ("rc", "receptions"),
    ("tg", "targets"),
    ("fg", "fg_made"), ("xp", "pat_made"),
    ("f19", "fg_made_0_19"), ("f29", "fg_made_20_29"), ("f39", "fg_made_30_39"),
    ("f49", "fg_made_40_49"), ("f59", "fg_made_50_59"), ("f60", "fg_made_60_"),
]

# The first of the two known definitional differences, and the reason no
# nflverse first down may ever be written into cfd, rfd or pfd.
#
# nflverse counts a touchdown as a first down; Sleeper, following the fantasy
# convention, does not. Measured over 2025 this explained 311 of 313
# disagreements exactly -- 32 of 32 passers, 161 of 161 receivers, 118 of 120
# rushers. Dropping their column straight in would pay every league that
# scores first downs for every touchdown twice, and a receiver's total would
# rise by single digits and stay entirely plausible.
AUDIT_FIRST_DOWNS = [
    ("pfd", "passing_first_downs", "passing_tds"),
    ("rfd", "rushing_first_downs", "rushing_tds"),
    ("cfd", "receiving_first_downs", "receiving_tds"),
]

# The second: Sleeper's miss total counts a blocked kick and nflverse's does
# not. Eleven kickers agreed outright in 2025 (they had none) and the other
# nine matched exactly once fg_blocked was added back. Swapping their column
# in would silently forgive every block -- and it would make kickers look
# better, which is the direction nobody checks.
AUDIT_BLOCKED = [
    ("fgx", "fg_missed", "fg_blocked"),
    ("xpx", "pat_missed", "pat_blocked"),
]

# A tenth of a point is the precision the raw data arrives in, and compact()
# rounds to it. Half a unit is comfortably outside that and comfortably
# inside a disagreement worth reading.
AUDIT_TOLERANCE = 0.5

# What the first run of this audit found, with the date, because a number
# without a date is the bug and a drifted number is not.
#
# Measured 27 August 2026 over 2018-2025. The disagreement rate falls
# steeply with recency -- 16.2% of comparisons in 2018, 4.1% in 2022, 0.3%
# in 2025 -- and two named causes account for most of the old end. Both are
# Sleeper changing its own mind years ago, and neither is fixable from here:
# the history is what it is.
AUDIT_NOTES = [
    "Sleeper's first-down definition changed between 2018 and 2020. In 2018,",
    "42 of 55 first-down lines match nflverse RAW (touchdown counted); from",
    "2020 on, 91-99% match nflverse MINUS touchdowns, which is what this",
    "audit applies. 2019 is the changeover and matches neither cleanly. So",
    "pfd, rfd or cfd disagreeing on an old season is expected; on 2024 or",
    "2025 it is not. (Measured 27 August 2026.)",
    "",
    "A 60-yard field goal sat in Sleeper's 50-59 band before 2024 and in",
    "nflverse's 60+ band. Six kicker seasons across 2021-2023, every one a",
    "single kick, and the made-total always agrees. A league paying extra",
    "for 60+ is slightly under-paying on those seasons. (Same date.)",
]


def fetch_csv_gz(url, optional=False):
    """A gzipped CSV as a list of dicts. Standard library only.

    Returns [] rather than raising when optional, which is the normal state
    of every in-season file before a season starts: nflverse publishes
    stats_player_reg_2026 the first time 2026 games are played, and asking
    for it before then is a 404 rather than a fault. So the pipeline picks a
    new season up on its own, and if it never appears the run is identical
    to today's.
    """
    request = urllib.request.Request(
        url, headers={"User-Agent": "alpine-draft-room/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            text = gzip.decompress(response.read()).decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError,
            OSError, UnicodeDecodeError) as error:
        if optional:
            print(f"  ! skipped {url} ({error})")
            return []
        raise
    return list(csv.DictReader(io.StringIO(text)))


def fetch_nflverse_players():
    """The crosswalk master, or nothing at all. Never fatal.

    Filtered by recency and never by position. A two-way player carries one
    position and it is not the fantasy one, so a position filter drops him
    while his statistics sit there under his gsis_id -- which is exactly how
    Travis Hunter came to need a line in NFLVERSE_MATCHES.
    """
    print("Fetching nflverse player master...")
    rows = fetch_csv_gz(f"{NFLVERSE}/players/players.csv.gz", optional=True)
    first = min(NFL_SEASONS)
    recent = []
    for row in rows:
        try:
            last = int(row.get("last_season") or 0)
        except ValueError:
            last = 0
        if last >= first:
            recent.append(row)
    print(f"  {len(recent)} of {len(rows)} played in {first} or later")
    return recent


def fetch_nflverse_season(season):
    """One season of totals, or nothing. A season not yet played is a 404."""
    rows = fetch_csv_gz(
        f"{NFLVERSE}/stats_player/stats_player_reg_{season}.csv.gz", optional=True)
    print(f"  {season}: {len(rows)} lines")
    return rows


# Expected fantasy points, from ffverse/ffopportunity's precomputed model --
# the "what should his role have scored" number no box score can produce.
# Keyed by the same gsis_id link_nflverse() already resolves, so it rides the
# existing join and needs no crosswalk of its own.
FFOPP = ("https://github.com/ffverse/ffopportunity/releases/download/"
         "latest-data/ep_weekly_{season}.csv")

# scripts/fetch_ffopportunity.py writes here, and the Tuesday workflow keeps
# the newest season current. A season on disk is read from disk; one that is
# not is fetched off the release -- history never changes, so only the
# current season ever actually moves between runs.
EP_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "..", "src", "data")


def fetch_expected_points():
    """{season: {gsis_id: {"xf": .., "xd": ..}}}, season totals from weekly rows.

    xf is the model's expected fantasy points, xd is actual minus expected --
    stored as sent rather than recomputed, because expectation lives in
    ffopportunity's own play-by-play model and its own scoring assumptions.
    That makes these the one pair of usage figures the scoring editor cannot
    move, which the panel says out loud rather than hiding.

    Optional at every step, like the rest of the nflverse section: a missing
    season, a dead release or a malformed file is a smaller usage table, and
    every board number is untouched.
    """
    print("Fetching ffopportunity expected points...")
    out = {}
    for season in NFL_SEASONS:
        local = os.path.join(EP_DATA_DIR, f"ep_weekly_{season}.csv")
        if os.path.exists(local):
            with open(local, encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))
            source = "local"
        else:
            request = urllib.request.Request(
                FFOPP.format(season=season),
                headers={"User-Agent": "alpine-draft-room/1.0"})
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    text = response.read().decode("utf-8-sig")
            except (urllib.error.URLError, urllib.error.HTTPError,
                    OSError, UnicodeDecodeError):
                print(f"  {season}: unavailable, no xFP for this season")
                continue
            rows = list(csv.DictReader(io.StringIO(text)))
            source = "release"

        agg = {}
        for row in rows:
            gsis = (row.get("player_id") or "").strip()
            if not gsis:
                continue
            totals = agg.setdefault(gsis, [0.0, 0.0])
            for i, column in enumerate(("total_fantasy_points_exp",
                                        "total_fantasy_points_diff")):
                try:
                    totals[i] += float(row.get(column) or 0)
                except ValueError:
                    pass
        # Rounded to one decimal and zeros dropped, the same convention the
        # rest of the `u` block and compact() already follow: this file is a
        # plain <script src> in front of every first paint.
        season_map = {}
        for gsis, (xf, xd) in agg.items():
            one = {}
            if round(xf, 1):
                one["xf"] = round(xf, 1)
            if round(xd, 1):
                one["xd"] = round(xd, 1)
            if one:
                season_map[gsis] = one
        if season_map:
            out[season] = season_map
        print(f"  {season}: {len(rows)} weekly lines, "
              f"{len(season_map)} players ({source})")
    return out


# ---------------------------------------------------------------------------
# CollegeFootballData: what a rookie did before he got here
# ---------------------------------------------------------------------------
#
# The Prospect Room ranks first-year players and cannot explain them: it names
# college production, combine testing and NFL draft position as three things
# nobody here knows. CFBD closes two of those three. /draft/picks carries the
# pick itself and a collegeAthleteId, and that id is what makes college
# production joinable on an identifier rather than on a second name match.
#
# There is no combine endpoint anywhere in their 84, so combine testing stays
# missing and the room must go on saying so. Closing two gaps and quietly
# rewording the third would be worse than closing none.
#
# The key is optional, exactly like TANK01_KEY: without it this is skipped, the
# rebuild is otherwise identical, and the room keeps working with one more gap
# named. A pipeline that cannot run without somebody's key is a pipeline that
# stops running the day the key lapses.

# Their position string may be a name ("Wide Receiver") or an abbreviation
# ("WR") -- DraftPosition carries both and DraftPick.position is documented
# only as `string`, so this accepts either rather than betting on one. An
# unrecognised value is counted and reported rather than dropped silently: a
# draft class that suddenly matches nobody is what this table would cause, and
# it would read as a bad join rather than as a renamed position.
# How many linked picks it takes before "nothing matched on college" is
# evidence about COLLEGE_ALIASES rather than about the sample.
#
# The alarm below first read `if linked and strict_n == 0`, which is true of
# any fixture built to exercise the weaker tiers -- so test_crosswalk.py
# printed it twice on a passing run. A warning that fires when nothing is
# wrong is a warning nobody reads by the end of the week, which is the
# standing-red trap this project already has a scar from.
#
# Ten is comfortably above any fixture and far below a real run: the board
# carried 77 first-year players on 8 September 2026, and the fantasy-relevant,
# board-resolvable share of a draft class is on that order. Below ten links
# the join has a bigger problem than its alias table, and a message about
# school naming would send the next person the wrong way.
CFBD_COLLEGE_ALARM_MIN = 10

CFBD_POSITIONS = {
    "QB": "QB", "QUARTERBACK": "QB",
    "RB": "RB", "RUNNING BACK": "RB", "HB": "RB", "HALFBACK": "RB",
    "FB": "RB", "FULLBACK": "RB",
    "WR": "WR", "WIDE RECEIVER": "WR",
    "TE": "TE", "TIGHT END": "TE",
    "K": "K", "PK": "K", "KICKER": "K", "PLACE KICKER": "K",
}

# Sleeper's college string against CFBD's school name, where the two disagree.
#
# ---- Miami is the reason this table exists ----
#
# Sleeper carries "Miami (FL)" AND "Miami (OH)" -- two different schools, both
# on the board. CFBD calls the first one just "Miami". So the obvious
# normaliser (strip everything that is not a letter) turns Sleeper's into
# "miamifl" against their "miami" and silently loses every player out of one
# of the most productive programmes in the country, while "miamioh" goes on
# matching perfectly and hides the fact that anything is wrong.
#
# Aliases map onto the shorter form, because that is the one both feeds are
# likelier to agree on, and only where the two genuinely differ. Everything
# not named here normalises to itself.
#
# ---- Measured, 8 September 2026, against the real 2026 class ----
#
# 257 picks, 82 of them at a fantasy position, against the 77 first-year
# players on the half-PPR board. 59 matched, every one on name+pos+college.
# Without this table it is 57: the two it rescues are Carson Beck, whom CFBD
# files under "Miami" and Sleeper under "Miami (FL)", and Justin Joly, "NC
# State" against "North Carolina State". So the Miami hazard this was built
# for is real and it costs a first-round quarterback.
#
# Two entries are therefore measured and the rest are seeded from the 125
# distinct values in stats.js against CFBD's own naming -- unexercised by this
# class, kept for the next one, and all of them safe in the direction they map
# (nothing here collapses two schools that are actually different; "Miami (OH)"
# stays "miamioh" precisely because it is not aliased). link_cfbd_draft()
# still REPORTS any school it could not reconcile, which is what would catch a
# class that brings a naming difference nobody has seen yet.
COLLEGE_ALIASES = {
    "miamifl": "miami",
    "miamiflorida": "miami",
    "northcarolinastate": "ncstate",
    "connecticut": "uconn",
    "massachusetts": "umass",
    "southerncalifornia": "usc",
    "louisianastate": "lsu",
    "texaschristian": "tcu",
    "brighamyoung": "byu",
    "centralflorida": "ucf",
    "mississippi": "olemiss",
    "southernmethodist": "smu",
    "pitt": "pittsburgh",
    "appstate": "appalachianstate",
    "louisianalafayette": "louisiana",
}


def normalise_college(name):
    """A school name, reduced to something two feeds can agree on.

    Deliberately NOT normalise(). That one strips generational suffixes --
    jr, sr, ii, iii, iv, v -- which is right for a person and wrong for a
    school: "Vanderbilt" survives, but any school whose name carried a
    standalone "v" would not, and the rule has no business being applied to
    an institution in the first place. Two normalisers doing two jobs, rather
    than one doing both and being subtly wrong at one of them.
    """
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    key = re.sub(r"[^a-z]", "", text)
    return COLLEGE_ALIASES.get(key, key)


def index_sleeper_by_college(sleeper):
    """A fourth index, for the one join that has a school in it.

    Separate from index_sleeper() rather than a fourth slot in its tuple,
    because three call sites unpack that tuple by position and widening it
    would touch all of them to serve one caller. It reuses normalise() for
    the name half, so there is still exactly one of those in this file.

    College is the strongest discriminator CFBD gives us, and the reason this
    join can be stronger than the nflverse one: a player's school never
    changes, where the NFL team that drafted him can already be wrong by
    September -- traded, cut, or signed elsewhere off a practice squad.
    """
    index = {}
    for player_id, entry in sleeper.items():
        if entry.get("position") not in FANTASY_POSITIONS:
            continue
        key = normalise(entry.get("full_name") or entry.get("last_name") or "")
        college = normalise_college(entry.get("college"))
        if not key or not college:
            continue
        index.setdefault((key, entry["position"], college), (player_id, entry))
    return index


def link_cfbd_draft(stats, sleeper, indexes, college_index, picks):
    """Attach a CFBD draft pick to our records, and report what did not join.

    The same discipline as link_source_ids() and link_nflverse(): tiers,
    strictest first; a collision refuses both rather than picking one;
    everything that failed comes back for the report; and the counts are
    taken from what SURVIVED rather than from what was attempted.

    Two tiers:

      name + position + college   -- college is immutable, so this is the one
                                     tier that cannot go stale
      name + position             -- only when it is unique on our side, for a
                                     school COLLEGE_ALIASES has no entry for

    ---- There was a third, on the NFL club, and measuring it killed it ----

    It sat between these two and it was DEAD CODE: CFBD sends nflTeam as a
    city ("Las Vegas"), not the abbreviation clean_team() resolves, so it could
    never match a Sleeper team and the tier silently did nothing. Worse than
    nothing -- a fallback that cannot fire reads as a safety net and is not
    one.

    Fixing it was costed and rejected. It needs a 32-entry city table, and two
    of those cities name two clubs each: "New York" and "Los Angeles" cannot
    identify a club at all without a second fetch of /draft/teams for the
    nickname. Against that, the measurement says it would buy nothing -- on the
    real 2026 class all 59 matches landed on college and NOT ONE needed a
    weaker tier. The name tier below is the honest safety net: a rookie's name
    is very nearly always unique on a 480-player board, it needs no new table,
    and it degrades an unknown school rather than dropping the player.

    Every pick that lands on the weaker tier still names its school in the
    report, which is how COLLEGE_ALIASES gets completed from a real run rather
    than from guesswork.

    Nothing is stored here. This resolves WHICH of our players a pick belongs
    to; what gets written, and where it lives, is a separate decision that
    wants a measurement of the real payload first.
    """
    _by_name_pos_team, _by_name_pos, by_name = indexes
    linked, report = {}, []
    claimed, method = {}, {}
    unknown_positions, unknown_colleges = {}, {}

    for row in picks:
        raw_position = (row.get("position") or "").strip().upper()
        position = CFBD_POSITIONS.get(raw_position)
        if position is None:
            # Every defensive and offensive-line pick lands here, which is the
            # overwhelming majority of a draft and is not a fault. Counted
            # rather than listed one by one: whoever reads the report is
            # looking for a string that SHOULD have mapped, and 200 lines of
            # "Cornerback" is how they would miss it.
            if raw_position and raw_position not in CFBD_IGNORED_POSITIONS:
                unknown_positions[raw_position] = unknown_positions.get(raw_position, 0) + 1
            continue

        key = normalise(row.get("name") or "")
        if not key:
            continue

        college = normalise_college(row.get("collegeTeam"))

        strict = college_index.get((key, position, college)) if college else None
        match, how = strict, "name+pos+college"
        if match is None:
            candidates = [c for c in by_name.get(key, [])
                          if c[1].get("position") == position]
            if len(candidates) == 1:
                match, how = candidates[0], "name+pos"
        if match is None or match[0] not in stats:
            continue

        our_id = match[0]
        their_id = row.get("collegeAthleteId")

        # Two of theirs claiming one of ours means the join is wrong, not that
        # the player was drafted twice. Keep neither.
        if our_id in claimed and claimed[our_id] != their_id:
            report.append(
                f"COLLISION | {row.get('name')} | {position} | "
                f"{row.get('collegeTeam')} | {claimed[our_id]} and {their_id} "
                f"both map to {our_id}")
            linked.pop(our_id, None)
            method.pop(our_id, None)
            continue

        if how != "name+pos+college" and row.get("collegeTeam"):
            school = row.get("collegeTeam")
            unknown_colleges[school] = unknown_colleges.get(school, 0) + 1

        claimed[our_id] = their_id
        method[our_id] = how
        linked[our_id] = {
            "athlete": their_id,
            "overall": row.get("overall"),
            "round": row.get("round"),
            "pick": row.get("pick"),
            "year": row.get("year"),
            "college": row.get("collegeTeam"),
            # preDraftRanking / preDraftPositionRanking / preDraftGrade are
            # deliberately NOT carried. They are somebody else's scouting
            # grade, and this project does not republish expert rankings --
            # the same rule that keeps analyst commentary off the player
            # sheet. A pick number is a fact about what happened; a grade is
            # an opinion about what should have.
        }

    for school, n in sorted(unknown_colleges.items(), key=lambda kv: -kv[1]):
        report.append(f"COLLEGE | {school} | {n} matched on a weaker tier | "
                      f"add an alias if this is a naming difference")
    for raw, n in sorted(unknown_positions.items(), key=lambda kv: -kv[1]):
        report.append(f"POSITION | {raw} | {n} picks | not a fantasy position, "
                      f"or a name CFBD_POSITIONS has not heard of")

    strict_n = sum(1 for k in linked if method.get(k) == "name+pos+college")
    loose_n = sum(1 for k in linked if method.get(k) == "name+pos")
    print(f"  CFBD: linked {len(linked)} picks ({strict_n} on name+pos+college, "
          f"{loose_n} on name+pos)")
    if len(linked) >= CFBD_COLLEGE_ALARM_MIN and strict_n == 0:
        print("  ! not one of these matched on college -- COLLEGE_ALIASES is "
              "probably wrong about CFBD's naming")
    return linked, report


# ---------------------------------------------------------------------------
# CollegeFootballData: the fetch, and the one key it writes
# ---------------------------------------------------------------------------
#
# Optional throughout, exactly like TANK01_KEY. Without CFBD_KEY this is
# skipped, the rebuild is otherwise identical, and the Prospect Room keeps
# working with one more gap named. A pipeline that cannot run without
# somebody's key is a pipeline that stops running the day the key lapses.
CFBD_KEY = os.environ.get("CFBD_KEY", "")
CFBD_BASE = os.environ.get("CFBD_BASE", "https://api.collegefootballdata.com")

# Which class, and which college season it played.
#
# Derived from STAT_SEASONS rather than written down: its last entry is the
# last COMPLETED NFL season, so the coming draft is the year after it and the
# class's final college year is that same last entry. One constant to bump in
# January, and this follows.
PROSPECT_DRAFT_YEAR = STAT_SEASONS[-1] + 1
PROSPECT_COLLEGE_SEASON = STAT_SEASONS[-1]

# The college stat lines worth storing, in the SHORT KEYS this file already
# uses for the same quantities. Reusing them rather than inventing a second
# vocabulary is the "nothing written down twice" rule: a college receiving
# yard and an NFL receiving yard are the same measurement, and a sheet that
# put them under two names could not place them side by side.
#
# Everything else CFBD sends for a skill player is deliberately dropped:
# defensive, fumbles, kick and punt returns are 61k of the 141k rows in a
# season and none of them is what "college production" means on this screen.
CFBD_STAT_KEYS = {
    ("passing", "YDS"): "py", ("passing", "TD"): "pt", ("passing", "INT"): "pi",
    ("passing", "ATT"): "pa", ("passing", "COMPLETIONS"): "pc",
    ("rushing", "YDS"): "ry", ("rushing", "TD"): "rt", ("rushing", "CAR"): "ra",
    ("receiving", "YDS"): "cy", ("receiving", "TD"): "ct", ("receiving", "REC"): "rc",
    ("kicking", "FGM"): "fgm", ("kicking", "FGA"): "fga", ("kicking", "XPM"): "xpm",
}


# Positions CFBD sends that will never be fantasy-relevant, so their absence
# from CFBD_POSITIONS is not news.
#
# Without this the report carries a line per defensive position on EVERY run
# -- nine of them, about 175 of the 257 picks -- and a file that always says
# the same nine things is a file nobody reads by the end of the week. The same
# reason IGNORED_KEYS exists for Sleeper stats, and the same lesson the
# COLLEGE_ALIASES alarm had to learn one commit earlier.
#
# What is left after this filter is a string that is in NEITHER table, which
# is the only kind worth a line: either CFBD has renamed a position we score,
# or they have invented one.
CFBD_IGNORED_POSITIONS = frozenset({
    "CORNERBACK", "DEFENSIVE TACKLE", "DEFENSIVE EDGE", "LINEBACKER",
    "SAFETY", "OFFENSIVE TACKLE", "OFFENSIVE GUARD", "CENTER", "PUNTER",
    "LONG SNAPPER", "FULLBACK", "DEFENSIVE END", "DEFENSIVE BACK",
})


def fetch_cfbd(path):
    """One CFBD call, optional, through the keyed helper this file already has.

    CFBD_BASE is the seam a test points at a stub, the same way TANK01_BASE
    already is -- the provider cannot be reached from a test and a key cannot
    live in the repository.
    """
    if not CFBD_KEY:
        return []
    rows = fetch_json_headers(CFBD_BASE + path,
                              {"Authorization": "Bearer " + CFBD_KEY},
                              optional=True)
    return rows if isinstance(rows, list) else []


def build_prospects(stats, sleeper, indexes, college_index, picks, season_rows):
    """Write record["pr"] for every first-year player, and report the rest.

    Runs AFTER the records are built, and it has to for build_usage()'s own
    reason: compact() returns a fresh dict assembled only from STAT_FIELDS, so
    anything merged into a record before it runs is discarded without a word.

    ---- Three states for a draft position, because two would lie ----

      "d": [round, pick, overall]   we know where he went
      "d": 0                        he was not drafted, and that is a FACT
      absent                        we could not tell

    The middle one is the whole reason this function is careful. An unmatched
    rookie is either genuinely undrafted or a join this file got wrong, and
    those look identical from inside the join -- so "undrafted" is claimed
    only when the player's name appears NOWHERE in the entire draft, at any
    position and any school, rather than merely nowhere among the picks that
    joined. Anything else is reported and left absent, because "Undrafted"
    on a screen reads as certainty and would be a fact we invented.

    Measured 8 September 2026 against the real 2026 class: 59 of 77 board
    rookies drafted, 18 undrafted with their names absent from all 257 picks,
    and ZERO ambiguous. The ambiguous branch has never fired; it exists
    because the year it does is the year this would otherwise start lying.

    ---- Rookies only ----

    A player leaves this block the season he stops being one. The Prospect
    Room is the only thing that reads it and it draws exp === 0, so carrying
    college lines for a fourth-year pro would be bytes on every page load for
    a screen nobody can reach them from -- the argument that kept the fourteen
    role and snap keys out of stats.js.
    """
    # No class is not a class of undrafted players.
    #
    # An empty picks list is what an outage, a rate limit or a tier change
    # looks like from in here -- and with no names to check against, EVERY
    # rookie is trivially "in no pick" and would be stamped undrafted. That is
    # 77 invented facts from one failed request, and it is the same shape as
    # this file already refuses elsewhere: a season that has not started is a
    # 404 rather than a fault, and the answer is to write nothing.
    #
    # Caught by its own test rather than in production; main() happens to
    # guard the second fetch on this, which would have hidden it.
    if not picks:
        print("  prospects: CFBD returned no picks, so nothing is claimed")
        return 0, ["CFBD returned no picks; no draft position was written"]

    linked, report = link_cfbd_draft(stats, sleeper, indexes, college_index, picks)

    # Their final college season, keyed by the athlete id the pick carried --
    # an identifier join, not a second name match. CFBD's `playerId` on a stat
    # row IS collegeAthleteId; checked against Fernando Mendoza, 4837248.
    athletes = {str(v["athlete"]): our_id
                for our_id, v in linked.items() if v.get("athlete")}
    college = {}
    for row in season_rows or []:
        our_id = athletes.get(str(row.get("playerId")))
        if our_id is None:
            continue
        key = CFBD_STAT_KEYS.get((row.get("category"), row.get("statType")))
        if key is None:
            continue
        try:
            value = float(row.get("stat"))
        except (TypeError, ValueError):
            continue
        # Zeros are dropped, as compact() drops them from a season block: a
        # quarterback carries no receiving line rather than a row of noughts.
        if value:
            college.setdefault(our_id, {})[key] = (
                int(value) if value == int(value) else round(value, 1))

    # Every name in the WHOLE draft, not only the picks that joined -- see the
    # three-states note above. Defensive picks included, deliberately: a
    # two-way player we file as a receiver and they file as a corner is
    # exactly the case where "undrafted" would be wrong.
    drafted_names = {normalise(p.get("name") or "") for p in picks or []}

    written, undrafted, unclear = 0, 0, []
    for our_id, record in stats.items():
        if record.get("exp") != 0:
            continue
        block = {}
        pick = linked.get(our_id)
        if pick and pick.get("overall"):
            block["d"] = [pick.get("round"), pick.get("pick"), pick.get("overall")]
        elif normalise((sleeper.get(our_id) or {}).get("full_name") or "") not in drafted_names:
            block["d"] = 0
            undrafted += 1
        else:
            entry = sleeper.get(our_id) or {}
            unclear.append(f"{entry.get('full_name') or our_id} | "
                           f"{entry.get('position') or '?'} | {entry.get('college') or '?'} | "
                           f"in the draft under a name we could not join")
        if college.get(our_id):
            block["c"] = college[our_id]
        if block:
            record["pr"] = block
            written += 1

    report.extend(unclear)
    drafted = sum(1 for r in stats.values() if isinstance(r.get("pr", {}).get("d"), list))
    with_college = sum(1 for r in stats.values() if r.get("pr", {}).get("c"))
    print(f"  prospects: {written} first-year players ({drafted} drafted, "
          f"{undrafted} undrafted, {len(unclear)} unclear), "
          f"{with_college} with a college line")
    return written, report


def link_nflverse(stats, sleeper, indexes, nfl_rows):
    """Attach an nflverse gsis_id to our records, and report anything that did not.

    The same shape and the same discipline as link_source_ids(): two tiers,
    strictest first, a collision refuses both rather than picking one, and
    everything that failed comes back in the report. It reuses the indexes
    index_sleeper() already built rather than making a second set, so there
    is one normalise() in this file and it cannot drift from itself.

    Their file carries no Sleeper id at all, so unlike the Tank01 crosswalk
    there is no shared-identifier tier to try first. The name join is not the
    fallback here, it is the join -- measured at 240 of 241 on the strict
    tier alone, every one of them carrying a gsis_id.

    Team codes go through clean_team() because nflverse calls the Rams `LA`
    and we call them `LAR`. TEAM_ALIASES already knows; raw nflverse rows do
    not, and a defence reconciling to zero is how that was found.
    """
    by_name_pos_team, by_name_pos, _by_name = indexes
    linked, report = {}, []
    claimed, method = {}, {}

    for row in nfl_rows:
        their_id = (row.get("gsis_id") or "").strip()
        position = POSITION_MAP.get((row.get("position") or "").upper())
        key = normalise(row.get("display_name") or "")
        if not their_id or not position or not key:
            continue

        team = clean_team(row.get("latest_team"))
        strict = by_name_pos_team.get((key, position, team))
        match = strict or by_name_pos.get((key, position))
        if not match or match[0] not in stats:
            continue
        our_id = match[0]

        # Two of theirs pointing at one of ours means the join is wrong, not
        # that the player has two ids. Keep neither.
        if our_id in claimed and claimed[our_id] != their_id:
            report.append(
                f"COLLISION | {row.get('display_name')} | {position} | {team} | "
                f"{claimed[our_id]} and {their_id} both map to {our_id}")
            linked.pop(our_id, None)
            method.pop(our_id, None)
            continue

        claimed[our_id] = their_id
        linked[our_id] = their_id
        method[our_id] = "name+pos+team" if strict else "name+pos"

    # By hand, last, so an override wins over a wrong automatic match and
    # survives a collision that discarded one.
    for our_id, their_id in NFLVERSE_MATCHES.items():
        if our_id in stats:
            linked[our_id] = their_id
            method[our_id] = "manual"

    for our_id in stats:
        if our_id in linked:
            continue
        entry = sleeper.get(our_id) or {}
        name = entry.get("full_name") or entry.get("last_name") or our_id
        report.append(f"{name} | {entry.get('position') or '?'} | "
                      f"{clean_team(entry.get('team'))} | no nflverse id")

    # Counted from what survived, not from what was attempted -- the same
    # lesson link_source_ids() records: a number that disagrees with the
    # thing it describes is how you stop trusting the numbers.
    strict_n = sum(1 for k in linked if method.get(k) == "name+pos+team")
    loose_n = sum(1 for k in linked if method.get(k) == "name+pos")
    manual_n = sum(1 for k in linked if method.get(k) == "manual")
    print(f"  linked {len(linked)} of {len(stats)} ({strict_n} on name+pos+team, "
          f"{loose_n} on name+pos, {manual_n} by hand)")
    return linked, report


def audit_against_nflverse(stats, linked, nfl_seasons):
    """Compare what we stored against what nflverse derived, and report.

    Reports only. Nothing here changes a stored number, and that is the whole
    design: Sleeper is the feed every season block, every weekly log and
    every archived projection was built from, so a value quietly replaced
    from somewhere else would make `pp` a comparison between two feeds
    instead of between a forecast and an outcome.

    Two known definitional differences are applied rather than reported --
    see AUDIT_FIRST_DOWNS and AUDIT_BLOCKED. Anything left over is either
    real drift in one of the feeds or a definition that has moved, and both
    are worth a line in the file.
    """
    lines, agree, checked, flagged = [], {}, {}, []
    season_seen, season_off = {}, {}

    def number(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    for our_id, record in sorted(stats.items()):
        their_id = linked.get(our_id)
        if not their_id:
            continue
        for season, rows in sorted(nfl_seasons.items()):
            theirs = rows.get(their_id)
            ours = (record.get("s") or {}).get(str(season))
            if not theirs or not ours:
                continue

            comparisons = [(short, number(ours.get(short)), number(theirs.get(column)))
                           for short, column in AUDIT_PAIRS]
            # A touchdown is a first down to them and is not to us.
            comparisons += [
                (short, number(ours.get(short)),
                 number(theirs.get(column)) - number(theirs.get(td_column)))
                for short, column, td_column in AUDIT_FIRST_DOWNS]
            # A blocked kick is a miss to us and is not to them.
            comparisons += [
                (short, number(ours.get(short)),
                 number(theirs.get(column)) + number(theirs.get(blocked)))
                for short, column, blocked in AUDIT_BLOCKED]

            for short, mine, theirs_value in comparisons:
                if not mine and not theirs_value:
                    continue
                checked[short] = checked.get(short, 0) + 1
                season_seen[season] = season_seen.get(season, 0) + 1
                if abs(mine - theirs_value) <= AUDIT_TOLERANCE:
                    agree[short] = agree.get(short, 0) + 1
                else:
                    season_off[season] = season_off.get(season, 0) + 1
                    flagged.append((abs(mine - theirs_value), short, season,
                                    theirs.get("player_display_name") or their_id,
                                    mine, theirs_value))

    lines.append("Two differences are known, applied rather than reported, and")
    lines.append("must not be `fixed' by taking their column:")
    lines.append("  * nflverse counts a touchdown as a first down; Sleeper does not.")
    lines.append("  * Sleeper counts a blocked kick as a miss; nflverse does not.")
    lines.append("")
    lines.extend(AUDIT_NOTES)
    lines.append("")

    if not checked:
        lines.append("(nothing compared -- no nflverse rows this run)")
        return lines, 0

    lines.append("season    compared  disagree    rate")
    for season in sorted(season_seen):
        seen, off = season_seen[season], season_off.get(season, 0)
        lines.append(f"{season:<8}{seen:>10}{off:>10}{100.0 * off / seen:>7.1f}%")
    lines.append("")

    width = max(len(k) for k in checked)
    lines.append(f"{'stat'.ljust(width)}  compared   agree   agree%")
    for short in sorted(checked):
        got, total = agree.get(short, 0), checked[short]
        lines.append(f"{short.ljust(width)}  {total:>8}  {got:>6}  "
                     f"{100.0 * got / total:>6.1f}%")

    lines.append("")
    if flagged:
        lines.append(f"{len(flagged)} disagreements beyond {AUDIT_TOLERANCE}, "
                     "largest first:")
        for _, short, season, name, mine, theirs_value in sorted(flagged, reverse=True)[:60]:
            lines.append(f"  {season} | {short:<4} | {name} | "
                         f"ours {mine:g} | theirs {theirs_value:g}")
        if len(flagged) > 60:
            lines.append(f"  ... and {len(flagged) - 60} more, not listed")
    else:
        lines.append("No disagreements. Both feeds tell the same story.")

    return lines, len(flagged)


# ---------------------------------------------------------------- team ranks
#
# A team's own offense, ranked against the other 31 -- not a player number at
# all, but the shape of the games a fantasy player is playing in, for the
# player profile's Team tab. nflverse publishes this pre-aggregated, one row
# per team per season, under a different release tag from the player-level
# file fetched above (stats_team rather than stats_player), so there is no
# per-game rollup to do and no player crosswalk to build: clean_team() is the
# only join this needs, for the same reason it is needed everywhere else
# nflverse's own team codes show up -- it calls the Rams "LA" and we call
# them "LAR".
#
# Five categories, all real columns on this file and none invented: OFFENSE
# (passing + rushing yards), PASS YD, PASS ATT, PASS TD, and TD (passing +
# rushing touchdowns -- deliberately not defensive or special-teams scores,
# because this describes the offense a fantasy player plays IN, not the team
# as a whole). There is no red-zone column on stats_team, so there is no
# red-zone category here; inventing one is exactly what this project's whole
# pipeline exists to refuse to do.
TEAM_RANK_FIELDS = [
    ("off",     lambda r: team_stat(r, "passing_yards") + team_stat(r, "rushing_yards")),
    ("passYd",  lambda r: team_stat(r, "passing_yards")),
    # Pass attempts is volume, not a skill measure the way the other four
    # are -- more is not really "better" -- but it is ranked the same
    # descending way as the rest for consistency, most attempts first,
    # rather than singled out with its own inverted rule.
    ("passAtt", lambda r: team_stat(r, "attempts")),
    ("passTd",  lambda r: team_stat(r, "passing_tds")),
    ("td",      lambda r: team_stat(r, "passing_tds") + team_stat(r, "rushing_tds")),
]


def team_stat(row, column):
    try:
        return float(row.get(column) or 0)
    except (TypeError, ValueError):
        return 0.0


def fetch_team_stats(season):
    """One season of team-level offensive totals, or nothing at all.

    Same optional shape as fetch_nflverse_season() -- a season not yet played
    is a 404, not a fault, so the pipeline picks a new one up on its own the
    first morning nflverse publishes it and is otherwise unaffected. This is
    a different release tag though (stats_team, not stats_player): nflverse
    already aggregates it to one row per team, so there is no per-game work
    to do on this side at all.
    """
    rows = fetch_csv_gz(
        f"{NFLVERSE}/stats_team/stats_team_reg_{season}.csv.gz", optional=True)
    print(f"  {season}: {len(rows)} team lines")
    return rows


def build_team_ranks(rows):
    """Rank all 32 teams, 1st (best) to 32nd (worst), on five offensive counts.

    Descending value order on every category, PASS ATT included -- see the
    note above TEAM_RANK_FIELDS on why volume is ranked the same way as the
    rest rather than singled out.

    Ties are broken by team code, so every category comes out a complete
    1-32 permutation with no shared rank and no gap. Real season totals
    rarely tie exactly, but a rank column that COULD ever come out with a
    hole in it is a worse bug than a coin-flipped tie, so the tie-break is
    unconditional rather than a fallback for an edge case.

    Returns {team: {category: {"rank": int, "val": int}}}. The raw value
    travels with the rank so the UI can print "3947 pass yds", not just
    "3rd" -- a number with nothing under it is exactly the kind of unchecked
    claim this project's data pipeline exists to avoid.
    """
    by_team = {}
    for row in rows:
        team = clean_team(row.get("team"))
        if not team or team == "FA":
            continue
        # First row per team wins. stats_team_reg_<season> is documented as
        # one row per team per season already; a duplicate is a data problem
        # worth seeing, not a total worth silently summing twice.
        by_team.setdefault(team, row)

    if by_team and len(by_team) != 32:
        print(f"  ! stats_team returned {len(by_team)} teams, not 32 -- ranking anyway")

    values = {team: {key: fn(row) for key, fn in TEAM_RANK_FIELDS}
              for team, row in by_team.items()}

    ranks = {team: {} for team in by_team}
    for key, _ in TEAM_RANK_FIELDS:
        ordered = sorted(by_team, key=lambda t: (-values[t][key], t))
        for i, team in enumerate(ordered):
            ranks[team][key] = {"rank": i + 1, "val": int(round(values[team][key]))}
    return ranks


# The usage block: what nflverse adds that no box score can produce.
#
# Every one of these needs either the rest of the offence (a share needs the
# team's whole season in the denominator) or a play-by-play model (EPA, CPOE).
# That is the entire justification for a second feed -- everything else on the
# original wish list turned out to be arriving from Sleeper already, which is
# what the note above STAT_FIELDS is about.
#
# Rounded on the way in, because the raw values carry fifteen decimals and
# this file is a plain <script src> in front of every first paint. Rounding
# and dropping zeros is what takes all eight seasons to 12 KB gzipped rather
# than the 30 a naive write costs.
#
# Deliberately NOT here:
#   racr, pacr -- unstable, and negatively correlated with next season's
#     points. Measured, in the spec this came from, at r -0.113 for WR/TE.
#   receiving_air_yards, receiving_yards_after_catch, receiving_20 -- Sleeper
#     sends all three. A second copy under an nflverse name is the trap the
#     "do not give an nflverse field a Sleeper key name" rule exists for.
#   *_first_downs -- a different definition; see AUDIT_FIRST_DOWNS.
#   games -- `gp` is already in every season block. nflverse's own `games`
#     counts games in which the player recorded a stat and Sleeper's counts
#     games played, so they differ on 12.9% of seasons (Keenan Allen 2018:
#     16 against 15). Storing both would be one fact written down twice and
#     the wrong one would get read; the sheet wants "how much of the season
#     was he here for", which is Sleeper's.
USAGE_FIELDS = [
    ("ts",  "target_share",    3),
    ("ays", "air_yards_share", 3),
    ("wo",  "wopr",            3),
    ("ep",  "receiving_epa",   1),
    ("rep", "rushing_epa",     1),
    ("pep", "passing_epa",     1),
    ("cpo", "passing_cpoe",    1),
    ("r20", "rushing_20",      0),
    ("gwa", "gwfg_att",        0),
    ("gwm", "gwfg_made",       0),
]


def build_usage(stats, linked, nfl_seasons, ep_seasons=None):
    """Write record["u"], the one thing here that is not a check on Sleeper.

    Runs AFTER the records are built, and it has to: compact() returns a fresh
    dict assembled only from STAT_FIELDS, so anything merged into a record
    before it runs is discarded without a word.

    Keyed by season exactly as `s` is, and tied to the same NFL_SEASONS, so a
    usage row always has a season block beside it to be read against. A `u`
    year with no `s` year is a row the sheet cannot place.

    ep_seasons is fetch_expected_points()'s output, merged into the same
    per-season block under `xf`/`xd`. The seasons walked are the union of the
    two feeds, so an nflverse outage costs the shares and EPA without also
    silently dropping xFP -- and the other way round. Both ride the same
    gsis_id, so an unjoined player is absent from both halves at once.

    Returns a count rather than a report: an unjoined player is already named
    in link_nflverse()'s report, and saying it twice in one file is how a
    reader learns to skim both.
    """
    ep_seasons = ep_seasons or {}
    written = 0
    for our_id, record in stats.items():
        their_id = linked.get(our_id)
        if not their_id:
            continue
        block = {}
        for season in set(nfl_seasons) | set(ep_seasons):
            row = nfl_seasons.get(season, {}).get(their_id)
            one = {}
            for short, column, places in USAGE_FIELDS if row else []:
                raw = (row.get(column) or "").strip()
                if not raw:
                    continue
                try:
                    value = round(float(raw), places)
                except ValueError:
                    continue
                # compact() drops zeros from a season block for the same
                # reason: a zero and a missing value read identically here,
                # and the file is served to a phone.
                if value == 0:
                    continue
                one[short] = int(value) if places == 0 else value
            # Already rounded and zero-dropped by fetch_expected_points().
            one.update(ep_seasons.get(season, {}).get(their_id, {}))
            if one:
                block[str(season)] = one
        if block:
            record["u"] = block
            written += 1
    return written


def player_line(player):
    """One line of the PLAYERS array, as it appears in players.js.

    `deep` is only ever written as `true` -- appended, never a `false` on
    every other row, the same convention `inj: ""` breaks and this one
    doesn't: app.js reads `player.deep` and an absent key is already a
    falsy read, so a real ADP row costs nothing extra for the field it
    doesn't have.
    """
    extra = ", deep: true" if player.get("deep") else ""
    return ('  {{ id: "{id}", name: "{name}", pos: "{pos}", team: "{team}", '
            'bye: {bye}, adp: {adp}, sd: {sd}, td: {td}, inj: "{inj}"{extra} }}'.format(
                id=player["id"], name=player["name"].replace('"', "'"),
                pos=player["pos"], team=player["team"], bye=player["bye"],
                adp=player["adp"], sd=player["sd"], td=player["td"],
                inj=player["inj"], extra=extra))


# ---------------------------------------------------------------- main

def main():
    # Before any network: a scoreable stat with no rule waiting for it in
    # app.js is scored as zero by a browser and says nothing about it.
    print("Checking app.js has a rule for every scoreable stat...")
    check_app_rules()

    print("Fetching Sleeper player master...")
    sleeper = fetch_json(f"{SLEEPER}/players/nfl")
    print(f"  {len(sleeper)} players")

    print("Fetching FFC ADP, one set per scoring format...")
    adp_raw = {}
    for key, fmt in ADP_FORMATS.items():
        url = FFC_URL.format(fmt=fmt, teams=FFC_TEAMS, year=ADP_YEAR)
        rows = fetch_json(url, optional=(key != DEFAULT_FORMAT)).get("players", [])
        if rows:
            adp_raw[key] = rows
        print(f"  {key:<9} {len(rows)} rows")

    # Real 2026 bye weeks, for free: every ADP row already carries its
    # player's team's bye, so the union across every format and every row
    # gives every team's real bye without a fetch of its own -- exactly
    # what extend_deep_bench() needs for a player FFC never sampled.
    team_byes = {}
    for rows in adp_raw.values():
        for row in rows:
            team = clean_team(row.get("team"))
            bye = int(row.get("bye") or 0)
            if bye and team not in team_byes:
                team_byes[team] = bye

    season_stats = {}
    for season in STAT_SEASONS:
        print(f"Fetching {season} season stats...")
        data = fetch_json(f"{SLEEPER}/stats/nfl/regular/{season}", optional=True)
        if data:
            season_stats[season] = data
        print(f"  {len(data)} lines")

    print(f"Fetching {PROJECTION_SEASON} projections...")
    projections = fetch_json(
        f"{SLEEPER}/projections/nfl/regular/{PROJECTION_SEASON}", optional=True)
    print(f"  {len(projections)} lines")

    # The same endpoint, pointed at seasons that have already been played. A
    # year that returns nothing simply does not appear, exactly as a missing
    # season of actuals does.
    past_projections = {}
    for season in PROJECTION_HISTORY:
        print(f"Fetching {season} projections (archive)...")
        data = fetch_json(
            f"{SLEEPER}/projections/nfl/regular/{season}", optional=True)
        if data:
            past_projections[season] = data
        print(f"  {len(data)} lines")

    # Optional, keyed, and never fatal: no key means no crosswalk and a build
    # that is otherwise identical to today's.
    tank_rows = fetch_tank01_players()

    # Keyed by season, then week. A season that returns nothing simply does
    # not appear, so the app draws a selector of the years it actually has
    # rather than a tab that opens onto an empty table.
    weekly = {}
    for season in WEEKLY_SEASONS:
        print(f"Fetching {season} weekly game logs...")
        got = {}
        for week in range(1, WEEKLY_WEEKS + 1):
            data = fetch_json(
                f"{SLEEPER}/stats/nfl/regular/{season}/{week}", optional=True)
            if data:
                got[week] = data
        if got:
            weekly[season] = got
        print(f"  {len(got)} weeks")

    # ---- team ranks: the offense a fantasy player is playing in ----
    #
    # Derived from season_stats rather than hardcoded, the same reason
    # PRIOR_SEASON in app.js is derived rather than written down: a literal
    # year here would go stale every February, and app.js's own
    # latestStatSeason() already treats "the max season key actually
    # returned" as the definition of "the last completed season" -- this is
    # that same rule, asked of the same data, once.
    team_ranks, team_ranks_season = {}, None
    if season_stats:
        team_ranks_season = max(season_stats)
        print(f"Fetching {team_ranks_season} team stats (nflverse stats_team)...")
        team_rows = fetch_team_stats(team_ranks_season)
        if team_rows:
            team_ranks = build_team_ranks(team_rows)
            print(f"  team ranks: {len(team_ranks)} of 32 teams ranked "
                  f"for {team_ranks_season}")
        else:
            print(f"  ! nflverse stats_team not published for {team_ranks_season} "
                  "yet -- skipping Team Rank this run")
    else:
        print("  ! no season stats fetched at all, so there is no 'last completed "
              "season' to rank teams for -- skipping Team Rank this run")

    # ---- join every ADP set to Sleeper records ----
    indexes = index_sleeper(sleeper)

    sets, unmatched = {}, []
    for key in ADP_FORMATS:
        if key not in adp_raw:
            print(f"  ! no {key} ADP, that set will be missing from players.js")
            continue
        joined, missed = join_rows(adp_raw[key], sleeper, indexes)
        real_count = len(joined)
        joined = extend_deep_bench(joined, sleeper, team_byes, DEEP_TARGET)
        sets[key] = joined
        print(f"  {key:<9} {real_count} real ADP + {len(joined) - real_count} deep bench "
              f"= {len(joined)}")
        # The same player fails to join in every set, so report each name once.
        for line in missed:
            if line not in unmatched:
                unmatched.append(line)

    if DEFAULT_FORMAT not in sets:
        raise SystemExit(f"No {DEFAULT_FORMAT} ADP: refusing to write a players.js "
                         "the app cannot fall back to.")

    players = sets[DEFAULT_FORMAT]

    # Stats are keyed by Sleeper id and shared by every set, so they have to
    # cover the union. PPR runs deeper than half-PPR, and a player who only
    # appears in the deeper set still needs his stat line. Ranked by each
    # player's best ADP across the sets, so the weekly-log cut stays meaningful.
    best_adp, union = {}, {}
    for joined in sets.values():
        for player in joined:
            if not player["id"]:
                continue
            if player["id"] not in union or player["adp"] < best_adp[player["id"]]:
                best_adp[player["id"]] = player["adp"]
                union[player["id"]] = player

    pool = sorted(union.values(), key=lambda p: p["adp"])

    # ---- build stats.js ----
    stats = {}
    for rank, player in enumerate(pool):
        player_id = player["id"]
        if not player_id:
            continue
        entry = player["_entry"]
        record = {}

        if entry.get("age"):
            record["age"] = int(entry["age"])
        if entry.get("years_exp") is not None:
            record["exp"] = int(entry["years_exp"])

        # Bio. Already in the player feed we fetch, previously thrown away.
        # It is the top line of a player profile everywhere else in fantasy,
        # and it costs a few bytes a head.
        if entry.get("height"):
            record["ht"] = str(entry["height"])
        if entry.get("weight"):
            record["wt"] = str(entry["weight"])
        if entry.get("college") and entry["college"] != "-":
            record["col"] = entry["college"]
        if entry.get("number") is not None:
            record["no"] = int(entry["number"])
        if entry.get("depth_chart_position"):
            record["depth"] = entry["depth_chart_position"]
        if entry.get("depth_chart_order") is not None:
            record["order"] = int(entry["depth_chart_order"])

        seasons = {}
        for season in sorted(season_stats):
            line = season_stats[season].get(player_id)
            if not line:
                continue
            games = int(line.get("gp") or 0)
            block = compact(line)
            # A season the player was not in the league: no games, and not a
            # single counting stat. Judged on the raw data now that there is
            # no points total to judge it by.
            if games == 0 and not block:
                continue
            block["gp"] = games
            seasons[str(season)] = block
        if seasons:
            record["s"] = seasons

        projection = projections.get(player_id)
        if projection:
            block = compact(projection)
            # gp is what tells the app this is a real forecast rather than a
            # zero-filled row. Sleeper returns those for players it has no
            # opinion on, and counting them as real projections once dragged
            # replacement level toward zero.
            block["gp"] = int(projection.get("gp") or 0)
            record["p"] = block

        # What we said about seasons that have since been played, keyed the
        # same way the actuals in "s" are, so the two line up by year without
        # the app having to know anything about how either was fetched. Same
        # gp test as above: a zero-filled row is not a forecast.
        past = {}
        for season in sorted(past_projections):
            line = past_projections[season].get(player_id)
            if not line:
                continue
            block = compact(line)
            games = int(line.get("gp") or 0)
            if games == 0 and not block:
                continue
            block["gp"] = games
            past[str(season)] = block
        if past:
            record["pp"] = past

        if rank < WEEKLY_KEEP:
            by_season = {}
            for season, weeks in weekly.items():
                logs = []
                for week in sorted(weeks):
                    line = weeks[week].get(player_id)
                    if not line:
                        continue
                    block = compact(line)
                    block["w"] = week
                    logs.append(block)
                if logs:
                    by_season[str(season)] = logs
            if by_season:
                record["w"] = by_season

        if record:
            stats[player_id] = record

    # ---- source ids ----
    #
    # After the records exist, because the join is against the pool we
    # actually carry rather than against every player either source knows
    # about. Attached to stats.js and not players.js: the same player appears
    # once per scoring format there, so an id would be stored three times and
    # could disagree with itself.
    source_ids, source_report = link_source_ids(stats, sleeper, indexes, tank_rows)
    for our_id, their_id in source_ids.items():
        stats[our_id]["x"] = {"tank": their_id}

    # ---- nflverse: a second opinion on the same football ----
    #
    # After the records exist, for the same reason the source-id crosswalk
    # is: the join is against the pool we actually carry rather than against
    # everybody either source has heard of.
    #
    # The audit writes no stored value. build_usage() writes exactly one key,
    # `u`, and nothing else in the file reads it -- so if nflverse is down,
    # every board number is identical and the usage panel is absent rather
    # than wrong. A pipeline that needs a third party to be up in order to
    # produce a board is not a pipeline this project wants.
    nfl_players = fetch_nflverse_players()
    nfl_linked, nfl_report, nfl_seasons = {}, [], {}
    if nfl_players:
        nfl_linked, nfl_report = link_nflverse(stats, sleeper, indexes, nfl_players)
        print("Fetching nflverse season totals...")
        for season in NFL_SEASONS:
            rows = fetch_nflverse_season(season)
            if rows:
                nfl_seasons[season] = {row["player_id"]: row for row in rows}
    else:
        print("  nflverse returned nothing, so there is no audit this run")

    # After the records are built, because compact() rebuilds each one from
    # STAT_FIELDS alone and would discard this without a word. Expected points
    # are only worth fetching when the gsis join exists to attach them to.
    ep_seasons = fetch_expected_points() if nfl_linked else {}
    usage_written = build_usage(stats, nfl_linked, nfl_seasons, ep_seasons)

    # ---- CollegeFootballData: what a rookie did before he got here ----
    #
    # After the records exist, for the reason build_usage() states: compact()
    # rebuilds each one from STAT_FIELDS alone and would discard `pr` without
    # a word.
    #
    # Two calls, not one per player. /draft/picks is the whole class, and
    # /stats/player/season is the whole college season -- 23.6 MB and about
    # 12s, measured, against 59 per-player calls that would spend a rate limit
    # to arrive at the same rows. The season is fetched only when a pick
    # actually joined, so an outage on the first call does not pay for the
    # second.
    prospect_report = []
    if CFBD_KEY:
        print(f"Fetching the {PROSPECT_DRAFT_YEAR} draft class from CFBD...")
        picks = fetch_cfbd(f"/draft/picks?year={PROSPECT_DRAFT_YEAR}")
        season_rows = []
        if picks:
            print(f"  {len(picks)} picks; fetching {PROSPECT_COLLEGE_SEASON} "
                  f"college season totals (this one is large)...")
            season_rows = fetch_cfbd(
                f"/stats/player/season?year={PROSPECT_COLLEGE_SEASON}")
        _written, prospect_report = build_prospects(
            stats, sleeper, indexes, index_sleeper_by_college(sleeper),
            picks, season_rows)
    else:
        print("CFBD: no CFBD_KEY set, so no draft position and no college line")

    audit_lines, audit_flagged = audit_against_nflverse(stats, nfl_linked, nfl_seasons)
    band_lines, band_off = check_miss_bands(stats)

    # ---- which scoreable stats the forecast actually carries ----
    #
    # Sleeper's projections are far coarser than its actuals: it forecasts
    # first downs but not a single 40-yard-touchdown bonus, forced fumble or
    # target. A rule over a stat it never projects still scores history and
    # week-by-week logs correctly, but contributes exactly zero to the 2026
    # numbers the draft board is built from.
    #
    # That is the kind of silent nothing this project refuses to ship, so the
    # set is measured here rather than written down, and the scoring editor
    # labels every rule with whether it moves the projection. Measured, so it
    # self-corrects the season Sleeper starts or stops forecasting something.
    # Measured through reconcile(), not off the raw feed: the coarse kicking
    # keys only become fgm_50_59 and fgmiss after folding, and reading the raw
    # rows marked both history-only when the app scores them from a real
    # projected value. A wrong label here is worse than no label.
    reconciled = [reconcile(line) for line in projections.values()]
    projected_keys = sorted(
        stat for stat in SCOREABLE
        if any((line.get(stat) or 0) for line in reconciled)
    )
    print(f"  {len(projected_keys)} of {len(SCOREABLE)} scoreable stats are forecast")

    # ---- write the files ----
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Every scoreable stat has to have somewhere to live, or the app will
    # silently score it as zero. Fail loudly instead.
    unstored = [k for k in SCOREABLE if k not in STAT_FIELDS]
    if unstored:
        raise SystemExit("Scoreable stats missing from STAT_FIELDS, so app.js "
                         f"could never score them: {', '.join(unstored)}")
    key_map = {k: STAT_FIELDS[k] for k in SCOREABLE}
    matched = sum(1 for p in players if p["id"])
    flagged = sum(1 for p in players if p["inj"])
    deep = sum(1 for p in players if p.get("deep"))
    projected = sum(1 for v in stats.values() if "p" in v)
    archived = sum(1 for v in stats.values() if "pp" in v)
    crosswalked = sum(1 for v in stats.values() if "x" in v)
    archive_years = sorted({y for v in stats.values() for y in v.get("pp", {})})

    set_blocks = ",\n\n".join(
        f'  "{key}": [\n' + ",\n".join(player_line(p) for p in sets[key]) + "\n  ]"
        for key in ADP_FORMATS if key in sets)

    counts = " · ".join(f"{key} {len(sets[key])}" for key in ADP_FORMATS if key in sets)

    with open(PLAYERS_FILE, "w", encoding="utf-8") as handle:
        handle.write(
            "/* ==========================================================\n"
            "   Alpine Draft Room - player data\n"
            "   GENERATED FILE. Edit scripts/build_players.py instead.\n\n"
            f"   Generated : {stamp}\n"
            f"   Players   : {counts}\n"
            f"   Seasons   : {min(season_stats) if season_stats else '-'}"
            f"-{max(season_stats) if season_stats else '-'}\n"
            f"   Matched   : {matched} of the {DEFAULT_FORMAT} set carry a Sleeper id\n"
            f"   Flagged   : {flagged} carry an injury designation\n"
            f"   Deep      : {deep} of the {DEFAULT_FORMAT} set carry no real ADP -- ranked\n"
            "               by Sleeper's own depth order rather than a live draft\n"
            "               sample, and marked `deep: true` for the UI to say so\n"
            f"   Projected : {projected} have {PROJECTION_SEASON} projections\n\n"
            "   ADP: Fantasy Football Calculator, one set per scoring format.\n"
            "   Team count is not an axis: FFC returns the same sample for\n"
            "   8, 10, 12 and 14 teams. See the note in build_players.py.\n"
            "   Below real ADP, Sleeper's own player master extends each set\n"
            "   toward DEEP_TARGET players -- see extend_deep_bench().\n"
            "   Player, injury and stat data: Sleeper.\n"
            "   ========================================================== */\n\n"
            f'const PLAYERS_META = {{ generated: "{stamp}", count: {len(players)}, '
            f"matched: {matched}, flagged: {flagged}, deep: {deep}, "
            f"projected: {projected}, unmatched: {len(unmatched)} }};\n\n"
            "/* One ordered list per scoring format. app.js picks the set that\n"
            "   matches league.scoring when a draft starts, and works out every\n"
            "   rank and tier from that set rather than from a fixed board. */\n"
            "const ADP_SETS = {\n" + set_blocks + "\n};\n\n"
            "// The Alpine default, and what the app falls back to if a set is missing.\n"
            f'const PLAYERS = ADP_SETS["{DEFAULT_FORMAT}"];\n')

    with open(STATS_FILE, "w", encoding="utf-8") as handle:
        handle.write(
            "/* ==========================================================\n"
            "   Alpine Draft Room - stats, projections and depth charts\n"
            "   GENERATED FILE. Keyed by Sleeper player id.\n\n"
            "     age / exp    age, years of experience\n"
            "     ht/wt/col/no height, weight, college, jersey number\n"
            "     depth/order  depth chart slot and place on it\n"
            "     s            season totals by year\n"
            "     p            projection for the coming season\n"
            "     pp           what we projected for seasons already played,\n"
            "                  keyed by year to line up with s\n"
            "     x            this player's id at other sources, so nothing\n"
            "                  has to match on a name at request time\n"
            "     w            week by week logs, keyed by season\n"
            "     pr           prospect: what a FIRST-YEAR player did before\n"
            "                  he got here. d is [round, pick, overall], or 0\n"
            "                  for undrafted -- which is a fact rather than a\n"
            "                  gap, and is claimed only when his name is in no\n"
            "                  pick at all. Absent d means we could not tell.\n"
            "                  c is his final college season in the same short\n"
            "                  keys as s. Absent entirely without CFBD_KEY.\n"
            "     u            usage from nflverse, keyed by season like s:\n"
            "                  ts/ays/wo share and WOPR, ep/rep/pep EPA,\n"
            "                  cpo CPOE, r20 20-yard rushes, gwa/gwm\n"
            "                  game-winning field goals. Never scored, and\n"
            "                  absent entirely if nflverse was unreachable.\n"
            "                  A share is over the team's whole season, so\n"
            "                  read it beside s[year].gp and not alone.\n\n"
            "   Raw components only. There is no points total in here: app.js\n"
            "   applies the scoring rules, so a league can change them without\n"
            "   this file being rebuilt.\n\n"
            "   STAT_KEYS maps each scoreable stat to the short key holding it.\n"
            "   Generated from STAT_FIELDS so the two cannot drift apart.\n\n"
            "   PROJECTED_KEYS is the subset Sleeper actually forecasts. A rule\n"
            "   over anything outside it scores history correctly and adds\n"
            "   nothing to the 2026 projection, which is what the draft board\n"
            "   is ranked on. The scoring editor says so on each rule.\n\n"
            "   TEAM_RANKS is a separate, player-less block: each of the 32 NFL\n"
            "   teams (by code, aliased through the same TEAM_ALIASES a player\n"
            "   record's own team uses) ranked 1st (best) to 32nd (worst) on\n"
            "   five offensive counts from nflverse's stats_team release --\n"
            "   off (pass+rush yards), passYd, passAtt, passTd, td (pass+rush\n"
            "   TDs). Every entry is {rank, val}, so the UI can print the raw\n"
            "   number beside the rank. For the Team tab, not a player's own\n"
            "   sheet. TEAM_RANKS_META names the season it was built from.\n\n"
            f"   Source ids : {crosswalked} of {len(stats)} players carry a Tank01 id\n"
            f"   Archived   : {archived} players carry past projections"
            f"{' for ' + ', '.join(archive_years) if archive_years else ' (none returned)'}\n"
            f"   Generated : {stamp}\n"
            "   ========================================================== */\n\n"
            "const STAT_KEYS = " + json.dumps(key_map, separators=(",", ":")) + ";\n\n"
            "const PROJECTED_KEYS = " + json.dumps(projected_keys, separators=(",", ":")) + ";\n\n"
            "const PLAYER_STATS = " + json.dumps(stats, separators=(",", ":")) + ";\n\n"
            "const TEAM_RANKS_META = " + json.dumps(
                {"season": team_ranks_season, "teams": len(team_ranks)},
                separators=(",", ":")) + ";\n\n"
            "const TEAM_RANKS = " + json.dumps(team_ranks, separators=(",", ":")) + ";\n")

    with open(UNMATCHED_FILE, "w", encoding="utf-8") as handle:
        handle.write(f"FFC rows that did not join to a Sleeper player\nGenerated {stamp}\n"
                     "Across every scoring format, each name listed once.\n"
                     "Add an entry to MANUAL_MATCHES in build_players.py to fix one.\n\n")
        handle.write("\n".join(unmatched) if unmatched else "(none)\n")

        unscored = sorted(
            key for key in SEEN_KEYS
            if key not in STAT_FIELDS
            and key not in IGNORED_KEYS and not key.startswith("bonus_"))
        # A player we hold but could not link is a player whose sheet will
        # have no news. That is a small thing on its own and a bad thing to
        # discover from a user, so it is written down here with everything
        # else the pipeline could not use.
        handle.write("\n\n\nPlayers with no id at another source\n")
        handle.write("Each of these has no Latest news on their sheet, because the\n"
                     "only safe way to ask for it is by id. A COLLISION line means two\n"
                     "of their players claim one of ours -- neither is stored, since\n"
                     "picking one would serve somebody else's news under this name.\n\n")
        if not TANK01_KEY:
            handle.write("(no TANK01_KEY set, so no crosswalk was attempted)\n")
        else:
            handle.write("\n".join(source_report) if source_report else "(none)\n")

        handle.write("\n\n\nSleeper stats we are not storing\n")
        handle.write("The browser can only score what this pipeline records, so anything\n"
                     "here is a scoring rule the app could never support. If a league\n"
                     "counts it, add it to STAT_FIELDS and SCOREABLE in build_players.py\n"
                     "and give it a default in app.js.\n\n"
                     "Read this section before adding a feed. It is the pipeline's own\n"
                     "answer to what is missing, and everything in it is already arriving.\n\n")
        handle.write("\n".join(unscored) if unscored else "(none)\n")

        # A fourth section rather than a fourth file: this one is already
        # committed by the workflow, already regenerated every run, and
        # already the first place anyone looks. A new file would need adding
        # to the workflow's git add, and on a day when only the audit moved
        # the early exit would say "No change in the feeds today" and commit
        # nothing at all.
        handle.write("\n\n\nSleeper against nflverse\n")
        handle.write("Two feeds built from different sources, compared stat by stat over\n"
                     "every season we store. Sleeper stays authoritative: this changes no\n"
                     "stored number and never should. It is here so that when the two\n"
                     "start disagreeing, somebody finds out from this file.\n\n")
        if not nfl_players:
            handle.write("(nflverse was unavailable this run, so nothing was compared)\n")
        else:
            handle.write(f"{len(nfl_linked)} of {len(stats)} players joined to an "
                         f"nflverse record.\n")
            unlinked = [line for line in nfl_report if " | no nflverse id" in line]
            collisions = [line for line in nfl_report if line.startswith("COLLISION")]
            if collisions:
                handle.write("\n" + "\n".join(collisions) + "\n")
            handle.write("\nNo nflverse record for:\n")
            handle.write(("\n".join(unlinked) if unlinked else "(none)") + "\n")
            handle.write("\n" + "\n".join(audit_lines) + "\n")

        handle.write("\n\n\nSleeper against itself: field goals by distance\n")
        handle.write("Every made and missed kick should sit in exactly one distance band,\n"
                     "because app.js scores the made bands and now offers the missed ones.\n"
                     "This is where that is checked, in both directions.\n\n")
        handle.write("\n".join(band_lines) + "\n")

    print(f"\n{PLAYERS_FILE}: {counts}, {matched} matched, "
          f"{flagged} flagged, {len(unmatched)} unmatched")
    print(f"{STATS_FILE}: {len(stats)} players with stats, {projected} with projections")
    # Said out loud either way. Sleeper may or may not serve a past season's
    # forecast, and "no archive" is a fact about the feed worth seeing in the
    # run rather than inferring from a file that looks the same as before.
    if not TANK01_KEY:
        print("  no TANK01_KEY, so no source ids; player news stays off")
    else:
        print(f"  source ids on {crosswalked} of {len(stats)} players "
              f"({len(stats) - crosswalked} without, see unmatched.txt)")

    if archive_years:
        print(f"  archived projections for {', '.join(archive_years)} "
              f"on {archived} players")
    else:
        print("  no past projections returned; nothing archived this run")

    # Said out loud either way, and in one line, because a number that only
    # appears when something is wrong is a number nobody learns to read.
    if not nfl_players:
        print("  nflverse unavailable: no audit, and stats.js is unaffected")
    else:
        print(f"  nflverse: {len(nfl_linked)} of {len(stats)} joined, "
              f"{audit_flagged} stat lines disagree beyond the two known definitions")
        print(f"  usage: a `u` block on {usage_written} players "
              f"({len(NFL_SEASONS)} seasons of share, EPA and CPOE; "
              f"xFP on {len(ep_seasons)} seasons)")
    print(f"  field goal bands: "
          + (f"every season from {BAND_COMPLETE_FROM} decomposes exactly "
             f"(earlier ones are lossy at source -- see {UNMATCHED_FILE})"
             if not band_off
             else f"{band_off} seasons at or after {BAND_COMPLETE_FROM} DO NOT "
                  f"reconcile, which is new -- see {UNMATCHED_FILE}"))
    # Said out loud either way, same convention as every other optional feed
    # above: a number that only appears on success is a number nobody learns
    # to trust the absence of.
    if team_ranks:
        print(f"  team ranks: {len(team_ranks)} teams ranked for "
              f"{team_ranks_season} (OFFENSE / PASS YD / PASS ATT / PASS TD / TD)")
    else:
        print("  team ranks: none this run (see log above)")

    # The smallest set is the ceiling on teams x rounds, so print it: it is the
    # number the setup screen validates against.
    smallest = min(sets, key=lambda k: len(sets[k]))
    print(f"Smallest set is {smallest} at {len(sets[smallest])} players, "
          f"so a draft can be at most {len(sets[smallest])} picks.")

    if unmatched:
        print("\nUnmatched (see unmatched.txt):")
        for line in unmatched[:20]:
            print("  " + line)


if __name__ == "__main__":
    main()
