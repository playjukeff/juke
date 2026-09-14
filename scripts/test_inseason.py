#!/usr/bin/env python3
"""The season being played, as the pipeline stores it -- without the network.

Three things here fail silently in a real run and are asserted instead:

  * a week nobody has played yet is ABSENT from `w`, never a week of zeros.
    Sleeper answers an unplayed week with {} and a week in progress with
    lines only for the teams that have played. Stored as zeros, every
    player would read as having missed a game he has not had yet;
  * the live season's logs reach the whole pool, not just the top 180 --
    the players a waiver wire is made of are below that cut;
  * out of season nothing changes: the same two past seasons, the same cut.

Run:  python scripts/test_inseason.py
"""

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


# ---- NFL_STATE ----------------------------------------------------------
# Sleeper's own answer on 11 September 2026, verbatim.
WEEK1 = {"week": 1, "leg": 1, "season_type": "regular", "season": "2026", "league_season": "2026",
         "previous_season": "2025", "season_start_date": "2026-09-09", "display_week": 1,
         "league_create_season": "2026", "season_has_scores": True}

check("NFL_STATE carries exactly the five fields app.js reads",
      bp.nfl_state_block(WEEK1),
      {"season": "2026", "week": 1, "seasonType": "regular", "seasonStart": "2026-09-09", "hasScores": True})
check("an unreadable state is null, never a guessed week", bp.nfl_state_block({}), None)
check("so is a season type Sleeper has never sent", bp.nfl_state_block({**WEEK1, "season_type": "mid"}), None)
check("and a state that is not an object at all", bp.nfl_state_block(None), None)
check("a week that is not a number is 0, not a string", bp.nfl_state_block({**WEEK1, "week": "3"})["week"], 0)

# ---- which seasons, which weeks ------------------------------------------
check("week 1 with a score on the board is live, through week 1", bp.live_season(WEEK1), (2026, 1))
check("the regular season before its first score is NOT live",
      bp.live_season({**WEEK1, "season_has_scores": False}), None)
check("preseason is not live", bp.live_season({**WEEK1, "season_type": "pre"}), None)
check("offseason is not live", bp.live_season({**WEEK1, "season_type": "off"}), None)
check("the postseason keeps the regular season's weeks",
      bp.live_season({**WEEK1, "season_type": "post", "week": 3}), (2026, bp.WEEKLY_WEEKS))
check("a week past the regular season is clipped to it",
      bp.live_season({**WEEK1, "week": 22}), (2026, bp.WEEKLY_WEEKS))

check("out of season the stored weeks are exactly what they always were",
      bp.weekly_plan(None), [(s, bp.WEEKLY_WEEKS, False) for s in bp.WEEKLY_SEASONS])
check("in season: the live one (strict, to its current week) and last season",
      bp.weekly_plan((2026, 4)), [(2026, 4, True), (2025, bp.WEEKLY_WEEKS, False)])
check("still two seasons, not three", len(bp.weekly_seasons((2026, 4))), 2)

# ---- a week with no game in it -------------------------------------------
check("Sleeper's answer for an unplayed week is not a played week", bp.played_week({}), False)
check("nor is a file of zero-filled lines",
      bp.played_week({"9221": {"gp": 0}, "SEA": {}}), False)
check("one game is enough", bp.played_week({"9221": {"gp": 0}, "4984": {"gp": 1, "pass_yd": 250}}), True)
check("and a missing file is not one", bp.played_week(None), False)

# ---- whose logs are stored -----------------------------------------------
WEEKLY = {
    2026: {1: {"9221": {"gp": 1, "rush_yd": 32, "rush_att": 12},
               "DEEP": {"gp": 1, "rec": 6, "rec_yd": 131, "rec_tgt": 8, "rec_td": 1},
               "BENCH": {"gp": 0}}},
    2025: {1: {"9221": {"gp": 1, "rush_yd": 100}, "DEEP": {"gp": 1, "rec": 2, "rec_yd": 20}}},
}
LIVE = (2026, 1)
deep = bp.weekly_logs("DEEP", bp.WEEKLY_KEEP + 200, WEEKLY, LIVE)
check("a deep-bench player gets the live season, where the waiver wire lives",
      deep.get("2026"), [{"rc": 6, "cy": 131, "tg": 8, "ct": 1, "w": 1}])
check("and not a past season below the cut, as before", "2025" in deep, False)
top = bp.weekly_logs("9221", 0, WEEKLY, LIVE)
check("a top player gets both seasons", sorted(top), ["2025", "2026"])
check("an inactive week is stored as an empty row -- a real DNP, not a zero game",
      bp.weekly_logs("BENCH", 0, WEEKLY, LIVE).get("2026"), [{"w": 1}])
check("out of season a deep-bench player gets no logs at all, exactly as before",
      bp.weekly_logs("DEEP", bp.WEEKLY_KEEP + 200, {2025: WEEKLY[2025]}, None), {})
check("and a top player's logs are unchanged",
      bp.weekly_logs("9221", 0, {2025: WEEKLY[2025]}, None), {"2025": [{"ry": 100, "w": 1}]})

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: " + ", ".join(FAILURES))
    sys.exit(1)
print("all in-season pipeline checks passed")
