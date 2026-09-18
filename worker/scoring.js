import { flat, members } from "./yahoo-json.js";

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
 * below was guessed. Each entry was cross-referenced against real 2025
 * season lines -- offence matched by name, defences by club -- taking every
 * player's line from ESPN and from the pipeline's own stats.js and keeping
 * only the statIds that agree with Juke's own stored count.
 *
 * ---- The first derivation compared only where BOTH were non-zero ----
 *
 * Which cannot fail for a candidate that is a strict SUBSET of the real
 * stat: every row it does not appear on is skipped rather than counted as a
 * disagreement. It shipped `rec_40p: 38` on exactly that, and 38 is the
 * 200-yard rushing game bonus -- measured 10 September 2026 across 328
 * joined players, it is non-zero on 5 running backs at 1 apiece, against a
 * `rec_40p` that is non-zero on 103 players and reaches 8.
 *
 * FOUR of those five backs happen to carry `rec_40p: 1` in 2025, which met
 * the old threshold of four agreeing samples, and the 99 receivers with a
 * 40+ yard catch and a zero on 38 were invisible to it. So a full-PPR
 * league was paying four points for every long reception under a rule it
 * does not have.
 *
 * **Compare over the whole population, and count a one-sided row as a
 * disagreement.** Re-derived that way, `rec_40p` matches no ESPN id at all
 * and is left out -- see the reported gap below.
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
  pass_att: 0, pass_cmp: 1,
  // Rushing
  rush_yd: 24, rush_td: 25, rush_2pt: 26,
  // Receiving -- 53, NOT its identical twin 41; see above.
  // There is deliberately no rec_40p here: see the note on subsets.
  rec: 53, rec_yd: 42, rec_td: 43, rec_2pt: 44,
  // Ball security
  fum_lost: 72,
  // Kicking
  xpm: 86, xpmiss: 88, fgm_40_49: 77, fgm_50_59: 198, fgm_60p: 201,
  fgmiss: 85, fgmiss_50_59: 200, fgmiss_60p: 203,
  // Defence / special teams
  sack: 99, int: 95, safe: 98, blk_kick: 97,
  pts_allow_0: 89, pts_allow_1_6: 90, pts_allow_7_13: 91,
};

/* What a real league scores that this table still cannot name, measured
 * against the owner's own ESPN league (53 scoring items) on 10 September
 * 2026. Written down rather than guessed at, because every one of these
 * was CHECKED and rejected rather than merely unexamined:
 *
 *   96  fumble recovered   -- 10 of 32 defences agree with Juke's fum_rec
 *                             and 22 differ, ESPN's count mostly higher.
 *                             Two different definitions, not a mapping.
 *   103 + 104              -- interception-return and fumble-return TDs.
 *                             Juke stores ONE def_td, so two ESPN rules
 *                             feed one rule and there is no single rate to
 *                             take. Their SUM matches def_td on 31 of 32.
 *   101 + 102              -- punt- and kickoff-return TDs against
 *                             def_st_td: the sum differs on 5 of 15, so
 *                             the two feeds draw the defence/special-teams
 *                             line in different places.
 *   92, 121, 124, 125      -- points allowed at 14-17, 18-21, 35-45, 46+.
 *                             ESPN's tiers are not Sleeper's (14-20,
 *                             21-27, 28-34, 35+), so these are not the
 *                             same buckets under a different name.
 *   128-132, 134-136       -- yards allowed. Juke has no such rule at all.
 *   16, 36, 37, 38, 46,    -- the long-play and big-game bonuses: a 50+
 *   56, 57, 63               yard passing TD, 100/150/200-yard rushing
 *                             games, 100/200-yard receiving games. Juke
 *                             has no rule for any of them.
 *   93, 206, 209           -- unidentified, and left that way.
 *
 * Every one of them rides out on `unmapped` rather than being dropped. */

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

/* Which Juke keys read that override, and it is a SECOND hand-kept list
 * that has to move with ESPN_STAT_IDS above.
 *
 * A defensive key added to the table and forgotten here does not throw: it
 * reads the flat `points`, which for a defence-only rule is 0, so the rule
 * silently scores nothing. `sack` was added on 10 September 2026 and did
 * exactly that for one run -- the league pays 1 a sack in
 * pointsOverrides["16"] with points: 0 beside it, and it came back 0. */
const DST_RULES = new Set([
  "sack", "int", "safe", "blk_kick",
  "pts_allow_0", "pts_allow_1_6", "pts_allow_7_13",
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


/* ----------------------------------------------------------
   CBS
   ---------------------------------------------------------- */

/* CBS names its own categories, so there is no id table to derive and none
 * of ESPN's subset hazard. `league/scoring/rules` answers 24 entries, each
 * with a `name`, a flat `points`, optional `ranges` (per-unit scoring) and
 * optional `bonuses` (a base rate plus a step). Measured against a real
 * league 15 September 2026.
 *
 * ---- The names are unambiguous; the BANDS are where it stops ----
 *
 * Fifteen offensive and nine defensive categories translate one to one, and
 * that half needed no judgement at all. What does not translate is every
 * rule CBS expresses as a range whose edges disagree with Juke's:
 *
 *   points allowed   CBS 0-1 / 2-6 / 7-13 / 14-17 / 28-34 / 35-45 / 46-60
 *                    Juke   0 / 1-6 / 7-13 / 14-20 / 21-27 / 28-34 / 35+
 *
 * Two align exactly (7-13 and 28-34) and the rest do not. CBS pays NOTHING
 * for 18 to 27 allowed, which is a common scoreline, so mapping its 14-17
 * band onto Juke's 14-20 would pay a point for three scorelines the league
 * does not pay for -- and 35+ is two CBS bands against Juke's one, so
 * either choice is wrong above 45.
 *
 * **So only the exact bands are mapped and the rest are reported.** An
 * approximation nobody measured is an opinion, which is the line this
 * project already refuses to cross for a kicker's short field goals. The
 * cost is real and is stated rather than hidden: a defence scores nothing
 * for the tiers left out, which is visible and reportable, where a band
 * silently off by a point is neither.
 *
 * Yards allowed has no Juke rule in any band, exactly as it has none for
 * ESPN, so the whole category is reported.
 *
 * ---- A range IS the rate for the per-unit rules ----
 *
 * ReYd/RuYd/PaYd carry no flat `points` at all; the number is inside
 * `ranges[0]` as points-per-`per`. Reading `points` for those would score
 * every yardage rule at zero, silently, which is the shape of failure this
 * file exists to prevent. */
const CBS_FLAT = {
  // Offence
  ReTD: "rec_td", Re2P: "rec_2pt", RuTD: "rush_td", Ru2P: "rush_2pt",
  PaTD: "pass_td", Pa2P: "pass_2pt", PaInt: "pass_int", FL: "fum_lost",
  Recpt: "rec", XP: "xpm", MFG: "fgmiss",
  // Defence / special teams
  DTD: "def_td", DFR: "fum_rec", SACK: "sack", STY: "safe", Int: "int",
};

// Per-unit: the rate lives in ranges[0].points over ranges[0].per.
const CBS_PER_UNIT = { ReYd: "rec_yd", RuYd: "rush_yd", PaYd: "pass_yd" };

/* Points allowed, only where CBS's band is byte-identical to Juke's. Keyed
 * "from-to" off CBS's own range so a league with different edges simply
 * does not match rather than matching approximately. */
const CBS_PTS_ALLOW = { "7-13": "pts_allow_7_13", "28-34": "pts_allow_28_34" };

/* A made field goal is a base rate plus distance steps, which is the one
 * place CBS is MORE expressive than a flat rule and Juke can still hold it:
 * every band is its own rule, so base+bonus lands exactly. */
const CBS_FG_BANDS = [
  ["fgm_0_19", 0, 19], ["fgm_20_29", 20, 29], ["fgm_30_39", 30, 39],
  ["fgm_40_49", 40, 49], ["fgm_50_59", 50, 59], ["fgm_60p", 60, 99],
];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function rulesFromCbs(scoringRules) {
  const cats = scoringRules && Array.isArray(scoringRules.categories)
    ? scoringRules.categories : null;
  if (!cats) return { rules: null, unmapped: [] };

  const rules = {};
  const unmapped = [];

  for (const c of cats) {
    if (!c || !c.name) continue;
    const name = String(c.name);
    const ranges = Array.isArray(c.ranges) ? c.ranges.filter((r) => r && num(r.points) !== null) : [];

    if (CBS_FLAT[name]) {
      const pts = num(c.points);
      if (pts !== null) { rules[CBS_FLAT[name]] = pts; continue; }
      unmapped.push(name);
      continue;
    }

    if (CBS_PER_UNIT[name]) {
      const r = ranges[0];
      const pts = r ? num(r.points) : null;
      const per = r ? (num(r.per) || 1) : 1;
      if (pts !== null && per) { rules[CBS_PER_UNIT[name]] = pts / per; continue; }
      unmapped.push(name);
      continue;
    }

    if (name === "FG") {
      const base = num(c.points);
      if (base === null) { unmapped.push(name); continue; }
      const bonuses = Array.isArray(c.bonuses) ? c.bonuses : [];
      for (const [key, lo] of CBS_FG_BANDS) {
        /* Matched on the band's LOWER edge, which is the only edge the two
           vocabularies agree about. CBS states 40-49 / 50-59 / 60-69 and
           Juke's top band is 60+, so containment cannot be the test -- and
           the first version of this tried to be clever about that and paid
           a 60-yard kick the 40-49 bonus, coming out at 4 where the league
           pays 6. Plausible, silent, and wrong by two points a kick. */
        const b = bonuses.find((x) => {
          const from = num(x.from), to = num(x.to);
          return from !== null && lo >= from && (to === null || lo <= to);
        });
        rules[key] = base + (b ? (num(b.points) || 0) : 0);
      }
      continue;
    }

    if (name === "DSTPA") {
      let matched = 0;
      for (const r of ranges) {
        const key = CBS_PTS_ALLOW[`${num(r.from)}-${num(r.to)}`];
        if (key) { rules[key] = num(r.points); matched++; }
      }
      /* Reported whenever ANY band could not be placed, which is the
         honest signal: "points allowed is partly represented" is not a
         thing a reader can act on, and the count of bands is not the
         reader's problem. */
      if (matched < ranges.length) unmapped.push(name);
      continue;
    }

    /* Everything left is a category Juke has no rule for at any band:
       YDS (yards allowed), ST2PT and STY1PT among them. Reported rather
       than approximated, and reported by NAME because CBS's names are its
       own vocabulary and a reader can look one up. */
    const scores = num(c.points) !== 0 && num(c.points) !== null || ranges.length > 0;
    if (scores) unmapped.push(name);
  }

  return { rules, unmapped: unmapped.sort() };
}


/* ----------------------------------------------------------
   Yahoo
   ---------------------------------------------------------- */

/* Yahoo names its own categories, and this matches on the NAME.
 *
 * A league's settings carry two lists: `stat_categories`, each with a
 * `stat_id` and the category's own `name` ("Passing Yards"), and
 * `stat_modifiers`, each with a `stat_id` and the value it pays. The id is
 * used only to join the two. What decides which Juke rule a category is, is
 * the name the league itself printed beside it.
 *
 * That is deliberate, and it is the lesson ESPN's table cost: a wrong
 * statId does not throw, it scores the wrong category in silence. Yahoo's
 * ids are published, but nothing here has been checked against a real
 * league yet -- so an id table would be a table of guesses, and a guess
 * that is off by one pays receptions as rushing touchdowns. Matched on the
 * name, the same mistake cannot happen: a category whose name this does
 * not recognise is REPORTED in `unmapped`, where a screen can admit to it,
 * rather than landing on the wrong rule.
 *
 * ---- Two names that differ by one letter ----
 *
 * "Interceptions" is a passer throwing one (offence); "Interception" is a
 * defence making one. "Sacks" is a quarterback taken down; "Sack" is a
 * defence doing it. The patterns are anchored so neither can match the
 * other, and `position_type` is checked where Yahoo sends it as a second
 * guard.
 *
 * ---- Absent means unscored ----
 *
 * Yahoo lists what a league pays in `stat_modifiers`, so a category Juke
 * knows and the league does not list is a real zero -- the same reading
 * rulesFromEspn() makes, and set explicitly so the client's default does
 * not quietly re-add a rule the league switched off. */
const YAHOO_NAMED = [
  // Passing
  [/^passing yards$/i, ["pass_yd"], "O"],
  [/^passing (touchdowns?|tds?)$/i, ["pass_td"], "O"],
  [/^interceptions$/i, ["pass_int"], "O"],
  [/^passing attempts$/i, ["pass_att"], "O"],
  [/^completions$/i, ["pass_cmp"], "O"],
  [/^passing 1st downs$/i, ["pass_fd"], "O"],
  // Rushing
  [/^rushing yards$/i, ["rush_yd"], "O"],
  [/^rushing (touchdowns?|tds?)$/i, ["rush_td"], "O"],
  [/^rushing 1st downs$/i, ["rush_fd"], "O"],
  // Receiving
  [/^receptions$/i, ["rec"], "O"],
  [/^receiving yards$/i, ["rec_yd"], "O"],
  [/^receiving (touchdowns?|tds?)$/i, ["rec_td"], "O"],
  [/^receiving 1st downs$/i, ["rec_fd"], "O"],
  [/^40\+ yard receptions$/i, ["rec_40p"], "O"],
  // Everybody on offence. Yahoo counts a return touchdown and a two-point
  // conversion once each, and Juke keeps the roles apart, so the one rate
  // is carried to every Juke rule it covers -- ESPN_SHARED_IDS's shape,
  // by name.
  [/^return (touchdowns?|tds?)$/i, ["kr_td", "pr_td"], "O"],
  [/^2-?point conversions?$/i, ["pass_2pt", "rush_2pt", "rec_2pt"], "O"],
  [/^fumbles lost$/i, ["fum_lost"], "O"],
  // Kicking -- made. Yahoo's top band is 50+ and Juke has two above fifty,
  // so the one rate is both.
  [/^field goals 0-19 yards$/i, ["fgm_0_19"], "K"],
  [/^field goals 20-29 yards$/i, ["fgm_20_29"], "K"],
  [/^field goals 30-39 yards$/i, ["fgm_30_39"], "K"],
  [/^field goals 40-49 yards$/i, ["fgm_40_49"], "K"],
  [/^field goals 50\+ yards$/i, ["fgm_50_59", "fgm_60p"], "K"],
  [/^point after attempt made$/i, ["xpm"], "K"],
  [/^point after attempt missed$/i, ["xpmiss"], "K"],
  // Defence / special teams
  [/^sack$/i, ["sack"], "DT"],
  [/^interception$/i, ["int"], "DT"],
  [/^fumble recovery$/i, ["fum_rec"], "DT"],
  [/^touchdown$/i, ["def_td"], "DT"],
  [/^safety$/i, ["safe"], "DT"],
  [/^block kick$/i, ["blk_kick"], "DT"],
  [/^kickoff and punt return touchdowns$/i, ["def_st_td"], "DT"],
  [/^points allowed 0 points$/i, ["pts_allow_0"], "DT"],
  [/^points allowed 1-6 points$/i, ["pts_allow_1_6"], "DT"],
  [/^points allowed 7-13 points$/i, ["pts_allow_7_13"], "DT"],
  [/^points allowed 14-20 points$/i, ["pts_allow_14_20"], "DT"],
  [/^points allowed 21-27 points$/i, ["pts_allow_21_27"], "DT"],
  [/^points allowed 28-34 points$/i, ["pts_allow_28_34"], "DT"],
  [/^points allowed 35\+ points$/i, ["pts_allow_35p"], "DT"],
];

/* A missed field goal is where the two vocabularies are shaped differently
 * and the translation is still exact.
 *
 * Yahoo charges each distance band on its own. Juke charges every miss
 * `fgmiss` and then ADDS a band's own increment -- and has no 0-19 band,
 * because Sleeper sends none. So `fgmiss` is whatever Yahoo charges inside
 * twenty, and each Juke band is its Yahoo band less that base: a 45-yard
 * miss then costs `fgmiss + fgmiss_40_49`, which is Yahoo's 40-49 charge to
 * the point. Yahoo's 50+ is both of Juke's top bands. */
const YAHOO_MISS = /^field goals missed (0-19|20-29|30-39|40-49|50\+) yards$/i;
const MISS_BANDS = {
  "20-29": ["fgmiss_20_29"], "30-39": ["fgmiss_30_39"],
  "40-49": ["fgmiss_40_49"], "50+": ["fgmiss_50_59", "fgmiss_60p"],
};

export function rulesFromYahoo(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const cats = members(flat(s.stat_categories).stats, "stat").map(flat);
  const mods = members(flat(s.stat_modifiers).stats, "stat").map(flat);
  /* No categories means nothing can be matched by name, and matching by id
     alone is the thing this translator refuses to do. So an unreadable
     table is null -- the client falls back to the Draft Room's rules and
     says so -- rather than a table of zeros that reads as a real league. */
  if (!cats.length || !mods.length) return { rules: null, unmapped: [] };

  const value = new Map();
  const bonus = new Set();
  for (const m of mods) {
    const n = Number(m.value);
    value.set(String(m.stat_id), Number.isFinite(n) ? n : 0);
    if (m.bonuses && members(m.bonuses, "bonus").length) bonus.add(String(m.stat_id));
  }

  const rules = {};
  YAHOO_NAMED.forEach(([, keys]) => keys.forEach((k) => { rules[k] = 0; }));
  const miss = {};
  const unmapped = [];

  for (const c of cats) {
    const id = String(c.stat_id);
    const name = String(c.name || "").trim();
    if (!name) continue;
    const pts = value.has(id) ? value.get(id) : 0;
    const type = c.position_type ? String(c.position_type).toUpperCase() : null;

    const band = name.match(YAHOO_MISS);
    if (band) { miss[band[1]] = pts; continue; }

    const spec = YAHOO_NAMED.find(([re, , pos]) => re.test(name) && (!type || !pos || type === pos));
    if (spec) {
      spec[1].forEach((k) => { rules[k] = pts; });
      /* A yardage bonus (300 passing yards, say) has no Juke rule. The base
         rate still maps; the bonus is reported by name so it is not lost. */
      if (bonus.has(id)) unmapped.push(name + " (bonus)");
      continue;
    }
    if (pts !== 0 || bonus.has(id)) unmapped.push(name);
  }

  const base = miss["0-19"] || 0;
  rules.fgmiss = base;
  for (const [band, keys] of Object.entries(MISS_BANDS)) {
    const charge = miss[band] === undefined ? base : miss[band];
    keys.forEach((k) => { rules[k] = charge - base; });
  }

  return { rules, unmapped: [...new Set(unmapped)].sort() };
}
