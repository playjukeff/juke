/* A connected league's own scoring, in Juke's vocabulary.
 *
 * Juke fetched every one of these and threw them away. The rooms scored a
 * real league with `league.rules` -- the DRAFT ROOM's table, whatever the
 * reader last set for a mock -- so a full-PPR league read as half PPR and
 * its Strategy Room understated a week by 13.3 points, measured. The total
 * was the smaller half: bestSwaps() ranks a lineup with those same rules,
 * so reception-heavy players were priced below touchdown-heavy ones and the
 * ADVICE was skewed, not just the arithmetic.
 *
 * ---- This translates vocabulary and decides nothing ----
 *
 * It answers a plain object of Juke rule NAMES to numbers. What counts as a
 * rule at all is DEFAULT_RULES in app.js and stays there -- the worker
 * holding its own copy of the 49 keys is the "nothing about the league
 * shape may be written down twice" failure with a scoring table in it, and
 * it would drift the first time either side gained a rule. The client
 * merges what it recognises and ignores the rest.
 *
 * ---- ESPN's ids were derived, not looked up ----
 *
 * A wrong statId does not throw. It silently scores the wrong category,
 * which is this project's most expensive class of bug, so none of the table
 * below was guessed. Each entry was cross-referenced 8 September 2026
 * against 319 players -- offence matched by name, defences by club -- by
 * taking every player's real 2025 season line from ESPN and from the
 * pipeline's own stats.js and keeping only the statIds that agreed on EVERY
 * player with at least four non-zero samples. Everything here is 100%.
 *
 * ---- Value equality alone is not enough, and receptions prove it ----
 *
 * ESPN carries receptions under BOTH statId 41 and 53, identical on every
 * player. The derivation matched both; only 53 appears in scoringItems, and
 * scoring 41 would have read every league as zero-PPR. So a candidate is
 * kept only when it is the one the scoring table actually references, and
 * an ambiguous key is left out rather than guessed. */

export const ESPN_STAT_IDS = {
  // Passing
  pass_yd: 3, pass_td: 4, pass_int: 20, pass_2pt: 19,
  // Rushing
  rush_yd: 24, rush_td: 25, rush_2pt: 26,
  // Receiving -- 53, NOT its identical twin 41; see above.
  rec: 53, rec_yd: 42, rec_td: 43, rec_2pt: 44, rec_40p: 38,
  // Ball security
  fum_lost: 72,
  // Kicking
  xpm: 86, xpmiss: 88, fgm_40_49: 77, fgm_50_59: 198, fgm_60p: 201,
  // Defence / special teams
  int: 95, safe: 98, blk_kick: 97,
  pts_allow_0: 89, pts_allow_1_6: 90, pts_allow_7_13: 91,
};

/* One ESPN rule that pays several of Juke's.
 *
 * ESPN does not band a short field goal the way the pipeline does: statId
 * 80 is worth 3 and covers every make under forty, where STAT_FIELDS keeps
 * fgm_0_19, fgm_20_29 and fgm_30_39 apart. So one id feeds three rules at
 * the same rate.
 *
 * ---- Derived from the boxscores, which is the only place it shows ----
 *
 * The stat-id derivation could not reach this: it matched a statId to a
 * Juke key by comparing season TOTALS, and ESPN has no total that
 * corresponds to "makes under forty". What exposed it was ESPN's own
 * applied points. Measured 9 September 2026 against the league's real 2025
 * boxscores, weeks 1 to 6: every kicker came out exactly 6 short, and each
 * had two field goals inside forty.
 *
 * Stated as a prediction and then tested: ESPN's points should equal Juke's
 * plus three per make under forty. **37 of 38 kicker-weeks fit.** The one
 * that does not is left alone rather than fitted around — a rule that
 * explains 97% of the evidence and admits the rest is worth more than one
 * tuned until nothing disagrees.
 *
 * Before this, a kicker's score under a connected league was short by three
 * points for every chip shot he made, silently, in the half of the app that
 * decides a lineup. */
export const ESPN_SHARED_IDS = {
  80: ["fgm_0_19", "fgm_20_29", "fgm_30_39"],
};

/* ESPN's per-position overrides, and why a defence needs one.
 *
 * An item carries flat `points` and a `pointsOverrides` map keyed by
 * position id -- 16 is D/ST -- and a league that pays a defence differently
 * from everybody else puts the real number there with `points: 0` beside
 * it. Reading `points` alone reports every defensive rule as zero, which is
 * a silently unscored defence rather than an error. */
const DST_POSITION = "16";

function pointsFor(item, dst) {
  const over = item.pointsOverrides || {};
  if (dst && over[DST_POSITION] !== undefined) return Number(over[DST_POSITION]) || 0;
  return Number(item.points) || 0;
}

const DST_RULES = new Set([
  "int", "safe", "blk_kick", "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13",
]);

/* `scoringItems` -> { rules, unmapped }.
 *
 * A statId this knows about and the league does NOT list is a genuine zero:
 * ESPN enumerates what it scores, so an absent category is one the league
 * does not pay for. That is a real answer and it is set to 0 rather than
 * left to the client's default, which would quietly re-add a rule the
 * league had switched off.
 *
 * `unmapped` is the other direction -- what the league scores that this
 * table cannot name -- and it is reported rather than dropped, the same way
 * unmatched.txt reports a stat the pipeline cannot store. A league scoring
 * something Juke cannot reproduce is a fact its screens should be able to
 * admit to, and a silent omission is how a total goes quietly wrong. */
export function rulesFromEspn(scoringItems) {
  const items = Array.isArray(scoringItems) ? scoringItems : [];
  if (!items.length) return { rules: null, unmapped: [] };

  const byId = new Map();
  items.forEach((i) => { if (i && i.statId !== undefined) byId.set(Number(i.statId), i); });

  const rules = {};
  const claimed = new Set();
  for (const [key, id] of Object.entries(ESPN_STAT_IDS)) {
    const item = byId.get(id);
    claimed.add(id);
    rules[key] = item ? pointsFor(item, DST_RULES.has(key)) : 0;
  }
  /* One id, several rules, at the same rate -- see ESPN_SHARED_IDS. Written
     after the one-to-one pass so a key can never be filled twice. */
  for (const [rawId, keys] of Object.entries(ESPN_SHARED_IDS)) {
    const id = Number(rawId);
    const item = byId.get(id);
    claimed.add(id);
    const pts = item ? pointsFor(item, false) : 0;
    keys.forEach((key) => { rules[key] = pts; });
  }

  /* `scores` and not `pointsFor(i, false)`, which was the first version and
     was wrong in the same way reading `points` for a defence is wrong: a
     rule that pays ONLY a defence carries points: 0 with its real number in
     the override, so filtering on the flat value reported it as scoring
     nothing and quietly dropped it from the very list whose job is to say
     what Juke cannot reproduce. Caught by its own test. */
  const scores = (i) =>
    (Number(i.points) || 0) !== 0 ||
    Object.values(i.pointsOverrides || {}).some((v) => (Number(v) || 0) !== 0);

  const unmapped = items
    .filter((i) => i && !claimed.has(Number(i.statId)) && scores(i))
    .map((i) => Number(i.statId))
    .sort((a, b) => a - b);

  return { rules, unmapped };
}

/* Sleeper needs no id table at all, and that is not luck.
 *
 * STAT_FIELDS in build_players.py took Sleeper's own key names, so a
 * league's `scoring_settings` is already in Juke's vocabulary -- `rec`,
 * `pass_yd`, `pts_allow_0`. It is passed through with its numbers coerced
 * and nothing else done to it, and the client keeps the keys it recognises.
 *
 * No zero-filling here, unlike ESPN: Sleeper omits a category it does not
 * score rather than listing it at zero, so an absent key means "not scored"
 * and the client's merge answers that with the same 0 by leaving the
 * DEFAULT_RULES entry -- which is why `unmapped` is what it reports instead
 * of inventing a difference it cannot see. */
export function rulesFromSleeper(scoringSettings) {
  const src = scoringSettings && typeof scoringSettings === "object" ? scoringSettings : null;
  if (!src) return { rules: null, unmapped: [] };

  const rules = {};
  for (const [key, value] of Object.entries(src)) {
    const n = Number(value);
    if (Number.isFinite(n)) rules[key] = n;
  }
  return { rules, unmapped: [] };
}
