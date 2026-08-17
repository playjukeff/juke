# Juke

Juke is the brand. **The Draft Room** is the first of several planned rooms
(Waiver, Prospect, Trade, League, Strategy), and the only one that exists —
so for now the site and the Draft Room are the same thing. Name the room in
the app, not the brand: the header says "The Draft Room", Juke sits above it
in the page title and the manifest.

A fantasy football mock draft simulator, built for one specific ten-team
league and now configurable from the setup screen: 8 to 14 teams, 8 to 20
rounds, any starting lineup, and standard, half or full PPR. That original
league is still what every control defaults to.

Live at `jukeff.com`, hosted on GitHub Pages straight off `main` via the
`CNAME` file. **It serves from the domain root, not a project path** — which
is why `manifest.json` uses `start_url: "/"`. A path-scoped `start_url` here
makes the installed app launch into a 404.

## Stack

Plain HTML, CSS and JavaScript. **No framework, no build step, no npm, no
bundler.** Open `index.html` in a browser and it runs. Keep it that way —
the owner is learning web development and a build step would put the
project out of reach.

Python 3 standard library only in the pipeline. No pip dependencies.

## Files

| File | Role |
|---|---|
| `index.html` | Markup. Sticky header, tabs, action bar, panels, player sheet. |
| `style.css` | All styling. Colours defined once at the top, reused by name. |
| `app.js` | Everything else: draft engine, CPU logic, analysis, rendering. |
| `back-to-top.js` | The back-to-top button. Its own file because the how-it-works page uses it and has no reason to load `app.js`. |
| `draft-engine.js` | The rules of a snake draft — turn order, legality, the CPU wobble. No DOM, no globals, no dependencies, so a server can run the identical file. |
| `room.js` | One shared draft: seats, picks, the clock. Pure, and time is always passed in rather than read. Loaded by the worker only; the page consumes the view it sends. |
| `live.js` | The client end of a room: one socket, the invite code, and the messages. Knows nothing about the board or how anything is drawn. |
| `worker/` | The Cloudflare Durable Object behind an invite link, plus the two proxied routes whose keys may not be in the page (`/giphy`, `/news`) and its `wrangler.toml`. Deployed to `juke-draft-room.jukeff.workers.dev`; a change here needs `wrangler deploy` before the page can use it. See `worker/README.md`. |
| `scripts/test_engine.py` | Runs `draft-engine.js` and `room.js` in node/deno/bun and asserts the rules from outside a browser. |
| `scripts/test_crosswalk.py` | The source-id join, without the network. A bad join does not look like a failure, which is why it is not left to a pipeline run. |
| `tests/` | End-to-end tests: the real pages, in a real browser, two managers in a real room. `playwright.config.mjs` starts both servers itself. |
| `package.json` | **Dev only.** Fetches the test runner and nothing else. The app still has no build step, no bundler and no runtime dependency. |
| `players.js` | **GENERATED.** 260 players by ADP. Never edit by hand. |
| `stats.js` | **GENERATED.** Stats, projections, depth charts by Sleeper ID. `pp` holds what we projected for seasons already played, so a forecast can be graded against what happened. |
| `scripts/build_players.py` | The pipeline that writes the two generated files. |
| `.github/workflows/update-players.yml` | Runs the pipeline daily at 11:00 UTC. |
| `og-image.png` | **GENERATED.** 1200x630 link-preview card. Rebuild by opening `scripts/build_og.html` in a browser and clicking download. |
| `unmatched.txt` | **GENERATED.** Feed rows that failed to join, plus unscored stat keys. |

## Data

Two free feeds, no keys: **Sleeper** (players, injuries, stats back to 2018,
weekly logs, projections, depth charts) and **Fantasy Football Calculator**
(ADP, one set per scoring format, written to `players.js` as `ADP_SETS`).

**The pipeline stores raw components and no points total at all.** Scoring
lives in `app.js` (`DEFAULT_RULES` and `fantasyPoints()`), so all 38 rules are
editable on the setup screen and everything rescores with no rebuild.
Sleeper's own `pts_half_ppr` is discarded, as it always was, because it bakes
in assumptions we do not share.

**Every points total must go through `fantasyPoints()`.** There is no `pts`
field to read any more, so a direct read silently scores zero.

`STAT_KEYS` in `stats.js` maps each scoreable stat to its short key and is
**generated from `STAT_FIELDS`**, so the Python and JavaScript sides cannot
drift. Anything scoreable must be in `STAT_FIELDS` — a stat that was never
stored can never be rescored, and `build_players.py` fails loudly if a
`SCOREABLE` entry has nowhere to live.

## The draft grade

Four components, weighted 50/25/15/10: starter strength, draft value, roster
construction, bye week safety. Each is computed for every team, scaled 0–100
against the rest of the room by `scaleAcross()`, then weighted. The grade is
a ranking inside the room, which is why somebody always gets an A+.

Three of the four were wrong at once, found in one sitting in August 2026,
and they were wrong in the same direction: they all flattered picks nobody
chose to make. Starter strength was correct throughout. What follows is why
each was wrong, because none of them announced themselves.

**`bestLineup()` sorts by `aboveReplacement`, never by `posRank`.** A rank
inside a position cannot choose between positions, and the FLEX is a slot that
has to. Sorting by `posRank` filled it from TE19, RB25 and WR28 by taking the
tight end — 19 is a smaller number than 25 — when TE replacement is 14, so
that tight end was *below* startable and worth 0, while the running back was
five places above his own replacement and sat on the bench.

Half the grade is starter strength, and it was being read off a lineup nobody
would ever field. Measured on one real roster it cost five raw points against
a room spanning 78 to 109, which is about eight points of final grade — several
places in a twelve-team room. Six of the twelve teams in that draft had it, all
six in the FLEX, all six a tight end.

This is the suggestions bug in a different function, and the lesson is the same
one: **a within-position measure cannot answer a between-position question.**
Inside a single-position slot the two orderings are identical, which is exactly
why it hid — every slot but the FLEX looked right.

**A component that is the same for every team is not in the grade.** This is
the check to run first on anything in here. `scaleAcross()` hands every team
50 when the span is zero, so a constant contributes a constant and the weight
beside it is a lie. Roster construction sat at exactly 100 for all ten teams
and had presumably done so for every draft the app had ever graded. Print the
spread of a component across the room before believing it works.

**The draft value gap is pick number minus board rank, in that order.**
`p.overall` is where the pick happened, `p.player.overall` is where the board
had him, so a player still there at 121 whom the board ranked 106 scores
**+15** — he fell fifteen picks, and that is a bargain. It was subtracting the
other way, which swapped the two callouts and, worse, meant a quarter of the
grade spent every draft rewarding reaches and punishing bargains.

It survived because everything around it was right: both callouts already
printed "picks late" for a positive gap, and the how-it-works page already
said a player taken later than his rank is a bargain. Correct prose over
inverted arithmetic reads as correct until somebody knows enough football to
notice the answer is absurd.

**Kickers and defenses are excluded from draft value and from both
callouts.** `cpuScore()` refuses a kicker before the last two rounds and a
defense before the last three, and the suggestions never offer one earlier —
so the app picks the timing, not the manager. Their ADP comes from drafts
that run more rounds than most leagues here, which routinely puts a kicker's
board rank past the last pick that exists, so taking one at all reads as
early. Measured over a ten-team, fourteen-round draft, the mean gap ran
WR +6, RB −2, QB −9, DST −12, TE −22, **K −35**, and every one of the ten
kickers scored as a reach with none neutral. Grading somebody for obeying a
rule the app enforces is not a judgement about drafting. Dropping them moved
no team more than two places, because every team drafts the same forced pair.

**Roster construction measures cover, and it has to be graded rather than a
threshold.** The old test was "fewer than starters + FLEX + 1 at the
position", which is four running backs in the default league — and the CPU's
depth allowance puts every team at exactly four. The cliff sat precisely
where the CPU stops, so it never fired once. It now asks how far from
startable the best benched player at each of RB and WR is, in places past
replacement: nothing if he could start today, the full 12 at `COVER_NONE`
places past it or with nobody there at all.

**Bye week safety counts every bad week, squared.** It used to read the worst
week and stop, so three starters out in week 6 *and* three more in week 8
scored what a single bad week scored — everything after the first was
invisible. Squared because the weeks are not interchangeable: four out at
once is a week you probably lose, three out twice is two weeks you patch from
the bench. One week of four (−80) therefore outranks two weeks of three
(−40), and two bad weeks always beat one.

**`GRADE_SCALE` is fourteen long and `TEAM_COUNTS` goes to twenty-four.** The
index is clamped. Without it a sixteen-team room printed the literal word
"undefined" in the room standings against fifteenth and sixteenth. Anything
indexing that array by finishing position needs the same clamp. Stretching
the scale to fit the room was the alternative and was rejected: it would
quietly regrade every ten-team draft, which is a bigger change than the bug.

**The number in the room standings is the weighted total, and it has to be.**
The table is ordered by that total and the letter is handed out for finishing
position, so a column sitting between the two that shows anything else makes
the table look broken. It used to print starter strength — one component of
four — which produced this:

```
1  The Gibbs Ultimatum   90  A+
4  Your Team             90  B+
5  Nacua Matata          90  B
7  Purdy Vacant          90  C+
```

Four teams sharing a 90 across ranks one to seven with four different grades,
in a column that climbed and fell down a strictly ranked table. Every one of
those numbers was correct and correctly rounded. Nothing underneath was
wrong: those four really did have equal starter strength and really did
separate on the other three components. A reader has no way to know that.

**Which is the lesson worth keeping from it.** Every other bug in this
section was in the arithmetic, and reconciling a total against its parts
catches those. This one had no arithmetic to catch — a right value in the
wrong column — and it only surfaced by reading what the analysis *renders*
and comparing it to what the analysis *computes*. Do both. A grade can be
correct and still be unbelievable, and an unbelievable grade is a broken
feature: this is the same failure as a kicker being named the biggest reach.

**`build` is floored at zero, because it is printed as "x / 100".** Three
rounds in, with six starting slots still empty, the bar read
`Roster construction: -8 / 100` — nine holes at fourteen each and no cover at
either running back or receiver, because there is barely a roster yet. The
sum was right; a score out of a hundred going negative reads as a broken
number rather than a bad roster.

Clamping costs nothing, which was measured rather than assumed. Sampled every
twenty picks through a full draft, the only negatives are in the opening
rounds, and there the score separates teams by whether their third pick has
come round yet — snake position, not construction. From round four on it
never approaches zero, and the number of distinct scores in the room is
identical clamped or not at every stage.

**Open the Analysis tab mid-draft, not just at the end.** Every check in this
section had been run on a completed board, and the incomplete one is a state
every user passes through on the way there. It is also where a component
built for a finished roster behaves least like itself: unfilled starting
slots are catastrophic at pick 140 and inevitable at pick 25, and the same
penalty fires either way. Zero picks is worth a look too — the panel is
supposed to say "Nothing to grade yet" rather than grade an empty room.

**How many of a position you may hold is `starters[pos]` plus the superflex,
for a quarterback.** `league.starters.QB` is 1 in a superflex league as well,
because the extra seat is a SFLEX rather than a second QB slot. Reading the
allowance straight out of `starters` therefore docked every team in a
superflex room nine points for the quarterback the format obliges them to
hold — and not as a flat charge that washes out when everyone pays it.
Dropping the second quarterback *improved* the score: on a built roster,
replacing him with a spare receiver cost five points of starter strength and
gained seven of construction. The component was paying teams to misbuild.

**And this is what the league-shape rule above is for.** `cpuScore()` has had
`league.starters.QB + league.superflex` since superflex was added, so the CPU
drafts two quarterbacks knowing the format allows two, and the grade then
marked it down for doing exactly that. One rule, written down in two places,
which drifted — precisely the failure "nothing about the league shape may be
written down twice" exists to prevent. When something here needs to know what
a league permits, check whether the engine or the CPU already answers it
before writing a second answer.

## The Juke score

Projected points above a replacement starter at that position, as a share of
the best such figure on the board. `overallScore()`, and it is the one number
the app has that a projection feed does not.

**It is a ranking against the pool, not a rating of the player, and nothing on
screen said so.** Both ends of the scale were being read as verdicts: a bare
`0` as "worthless" and a bare `100` as "perfect". Neither is what the number
means, and no reader could get from one to the other unaided.

**The pile of zeros is arithmetic, and that was measured before anything was
changed.** Around three fifths of the half-PPR board scores exactly 0 — the
majority state, not an edge case. Scored on a *fixed cohort* of the players
with a line in 2023, 2024, 2025 and a 2026 projection, so survivorship cannot
drift the answer, the share scoring zero is **the same in every one of those
real completed seasons as it is in the projection** — measured 16 August 2026
at 38.5% against 39.9% over 148 players, and 39.7% against 41.1% over 151 the
day before. A fixed rank cut against a board a couple of hundred deep, in a
league that starts about ninety players, puts most of the pool below the line
whatever happens on the field.

**Those counts move every night and the conclusion does not.** `players.js` is
regenerated daily, so any literal total written down here is stale within a
day — which is why the figures above carry a date and why the app derives
`board.length` rather than quoting one. A drifted number is not a bug; a
number without a date is. So there is nothing to correct in
the maths and re-curving the scale would be correcting football. The floor
needed a name, not a new formula.

**Two zeros are not equal, which is what `replacementGap()` exists to say.**
Michael Wilson scored 14 on last season's actuals — 181.6 points across all
seventeen games, +29.4 over replacement — and reads 0 for 2026 because his
projection falls 45 points *while projected WR replacement rises 22*. Most of
that 67-point swing is the projection compressing the field, not a judgement
about him. It stays out of `overallScore()` deliberately: `modelMultipliers()`
divides by the best score available and a negative there would invert the
discount.

**A score can rise while the points fall, and Gibbs is the case to keep.** He
actually scored 328 points last season for a Juke score of **82** — McCaffrey
was the 100 that year. His 2026 projection is 300 points, twenty-eight
*fewer*, and he scores **100**. Nothing is wrong: a projection is an average
over everything that might happen, so it shaves the extremes off everybody, and
he rises because the field beneath him was compressed further than he was. One
player explains the entire metric, which is why the sheet and the how-it-works
page both carry him.

**The number is sharper than the sport supports, so do not dress it as
precision.** Year to year across real seasons the score persists at r 0.35–0.55
(0.52–0.55 pace-adjusted at 10+ games) with a mean absolute move of 12 to 20
points, and between a quarter and two fifths of the players above zero one year
were back at zero the next. The 2026 projection sits at **r 0.79 against last
season's actuals, MAE 6.8** — roughly twice as tightly coupled to last year as
consecutive real years are to each other. It is last year, smoothed. That is
expected of a projection built knowing last year and is not a bug; it is a
reason to present a ranking rather than a measurement.

**One number may not have three names.** The strip said "Juke score", the meter
two hundred pixels below it said "Overall", the queue row said "Overall" and
the table column said "OVR" — all the same figure, with nothing connecting any
of them, so the sheet appeared to show two unrelated ratings. It is the Juke
score everywhere now. **"Overall" still appears on the sheet and correctly so:
it is the board rank in the first cell of the strip**, which is a different
fact and always was.

**The explanation already existed in the worst possible place.**
`overallReason()` had been writing exactly the right sentence all along and was
reachable only as a `title` tooltip on a table cell — which is to say not at
all on a phone, and never on the sheet somebody opens *because* they are
confused. `jukeNote()` puts it under the strip. When something is unclear on
screen, check whether the app already computes the answer before writing a
second one.

**`buildPriorSeason()` runs inside `buildProjections()`, and it has to.** Last
season is scored with the same `fantasyPoints()` under the same rules, so it
rescores when the scoring table moves exactly as everything else does — a
historical figure that ignored the editor would be the one number on the sheet
quietly describing a different league. Its replacement level is re-derived from
what actually happened rather than reused from the projection: measuring last
season against this season's baseline would call the difference a change in the
player, which is the precise error the comparison exists to expose.

**A missing season is blank, never zero.** Eighteen players on the board have
no line at all, and a 0 there would be a judgement about a season they were not
in — the same rule as "treat `0` from an API as missing".

**`pp` in `stats.js` is what we said about seasons that have since been
played.** Only the coming season's projection was ever stored and it was
overwritten nightly, so the one question worth asking of a projection — was it
any good — had no data behind it at all, and the numbers above had to be
assembled from actuals alone. `PROJECTION_HISTORY` in `build_players.py` fetches
past seasons from the same endpoint; each is optional and the counts are
printed, so a season Sleeper declines to serve is visible in the run rather
than silently absent. Even if every one comes back empty the list still earns
its place, because next year's run finds this year in it.

## Grading the projection against itself

`pp` in `stats.js` holds what we forecast for 2023, 2024 and 2025, beside what
actually happened in `s`. That made the only question worth asking of a
projection answerable for the first time.

**Check the archive is preseason before believing any of it.** Sleeper's
endpoint takes a year, and a forecast updated *during* a season would grade
itself brilliantly. It is not: every player who ended up playing four games or
fewer was still projected for a full eighteen, in all three seasons without
exception. That test is the first thing to re-run if the archive ever moves.

**The projection beats repeating last season, everywhere.** Against actual
points: r 0.83 / 0.79 / 0.72 for 2023 / 2024 / 2025, against 0.58 / 0.57 /
0.59 for last year's actuals used as this year's forecast. So the board is
built on something better than the naive alternative, which was previously an
assumption. Note the population is players on *today's* board, so anyone who
washed out of the league is missing and both predictors are flattered.

**Availability is most of the error, and it cuts both ways.** Players who
managed 15+ games: r 0.873. Under 15: r 0.617. And for the healthy group the
projection runs **20 points light** — a forecast is an expected value that
prices in injury risk, so it must undershoot everyone who avoids it. A healthy
season routinely beats its own projection and that is not a miss.

**The top of the Juke score is trustworthy and the floor is not a sentence.**
Projected 90+ finished at a median of 83, with 80% clearing 50. Of the
projected zeros, 68% finished at zero — so a third climbed out, which matches
the 35% measured from actuals alone by a different route.

### Our record on a player

`projectionRecord()` puts what we forecast beside what happened, on the Seasons
tab. It is the only number on the sheet that can be checked rather than
believed, and it is the thing a projection feed will never show you about
itself.

**Both halves go through `fantasyPoints()` under the current rules**, so it
rescores with the scoring editor like everything else. A historical figure that
ignored the editor would be the one number here quietly describing a different
league.

**Games played is not decoration, it is the honesty.** McCaffrey 2024 reads
"we said 250, he got 40, −210" and that is a true number a reader would draw
entirely the wrong conclusion from. Beside it sits a dimmed **4**. Availability
is most of the projection's error — r 0.873 at 15+ games against 0.617 below —
so the count is what separates a wrong read from a hamstring.

**A column of green needs explaining too.** The forecast runs about 20 points
light on anyone who stays fit, because it is an expected value that prices in
injury risk, so most healthy seasons beat it. Without the note under the table
that reads as a model that is simply too low rather than as one doing its job.

**A season with a forecast but no real games is not gradeable and is dropped**,
and a defense shows a dash rather than a games count — `gp: 1` on an aggregate
DST row is not one game, which is the bug `perGame()` already exists to prevent
arriving from a new direction.

### Kickers and defenses are not ranked, and that is measured

The projected order for these two has no relationship to the finishing order:
**K at r 0.37, −0.09, 0.57 and DST at 0.32, 0.06, 0.25**, against 0.58 to 0.73
for every other position. One kicker season came out backwards.

**There is a mechanical reason and it cannot be repaired from the feed.**
`PROJECTED_KEYS` already records that Sleeper forecasts only `fgm_40_49` and
`fgm_50_59` — **no field goal under forty yards at all**, which was 253 of the
406 made in 2025. Jason Myers was projected 81 points and scored 195. There is
no total FG count in the feed to subtract from, so the short kicks cannot be
recovered, and inventing them would be this pipeline recording an opinion.

This is the same family as the `fgm_50p` bug `reconcile()` fixes, at the other
end of the range, and the difference is that this one has no fix.

**About half the bias cancels in value over replacement** — a kicker and his
replacement move together — and none of the ranking noise does. No arithmetic
repairs r = −0.09, which is why the answer is to withhold the number rather
than adjust it.

**`overallScore()` returns null for `UNRANKED_POSITIONS`,** which flows exactly
as a missing projection already does: a dash on the sheet and in the table, and
`modelMultipliers()` leaving the player where the market put him rather than
pushing him down for the want of a score.

**Withholding has to be complete or it is worse than not withholding.** A
sheet that prints a dash in the strip and then says "K1 on the projection"
three lines below has told the reader to distrust a number and then argued
from it. `ourRead()` and the method note both change for these positions, and
the meter is *replaced* rather than fed a null — left alone it renders an empty
bar labelled "Very Low", which is a verdict, and further from the truth than
the number it replaced.

**The grade is deliberately untouched.** It runs on `aboveReplacement()` and a
kicker really did score those points. How a finished roster performed and how
well a forecast ranks are different questions, and only the second one failed.

## Team colour

One mark per club, in `TEAM_ACCENT`, used in exactly two places on the player
sheet: a ring around the headshot and a band under the header. **Nothing is
ever written on top of it, and that restriction is the whole design.**

**A team-coloured header does not survive thirty-two real teams.** Darkened
far enough to carry white text — lightness only, hue and saturation held, the
same repair the position solids had — ten pairs land below the just-noticeable
difference and 27 of the 496 pairs sit within 6 CIE76. Carolina, Detroit, the
Chargers and Houston all become the same dark teal; Dallas and Indianapolis
become one navy. You pay the whole contrast bill and lose the identity you
were buying. At brand values only 9 pairs are that close, so it is the
darkening that destroys it, and the darkening is not optional if type sits on
top: **Pittsburgh's gold is 1.76:1 against white and New Orleans' is 1.85:1.**

**So the colour goes where there is no text, and then it can be the real
brand colour.** Which is the same trade the position solids could not make —
those carry white type by definition, so they had to move.

**Seven clubs vanish into a navy header at brand value** — CHI, DAL, HOU, JAX,
NE, SEA, TEN, every one of them a navy or a near-black, because the header is
itself brand navy. Those seven take the mark the club is actually known by,
which is a substitution their own kit makes: Chicago's orange, Seattle's
green, Jacksonville's gold, Dallas silver. Raiders silver too — black is
legal against navy and reads as nothing.

**The test is perceptual distance, not contrast ratio.** A decorative mark is
not a UI control and the club is named in text beside it, so 1.4.11's 3:1 is
the wrong bar — measured that way 30 of 32 "fail", and lightening them to pass
moves 30 clubs more than 8 CIE76 off their brand, turning Cleveland brown into
orange. Measured as CIE76 against every surface the mark can touch — all three
navy stops and the card in both themes — every accent clears 12, worst case
13.6. Three pairs are effectively one colour and always will be: CIN and DEN
share a hex, ATL and HOU both use #A71930, CAR and LAC are 2.3 apart at brand.

**It reaches the stylesheet as `--team` on the header, never as a fill.** Same
pattern as `--mark-ink` on a `<use>`. `:root` would be the wrong home: these
are somebody else's colours and there are thirty-two of them. The default
lives on `.sheet-head` so a club with no mark still draws a ring and a band.

**Clear it, do not merely set it.** The sheet is one element reused for every
player, so a sheet opened after Pittsburgh's inherits gold unless the property
is removed. `openSheet()` removes rather than blanks.

**A ring is a `box-shadow`, not a `border`.** Everything is
`box-sizing: border-box`, so a border leaves the outer circle at 62px and eats
three pixels out of the *inside* — `clientWidth` drops to 56 and the headshot
is inset and shrunk. A test asserting the outer rect passes either way and
proves nothing, which is what the first version of it did.

## The suggestions

`suggestions()` ranks by `(adp + jitter)` times need times risk times the
model's opinion, lowest first. The last of those four is new and is the only
one that answers to the scoring table.

**Everything else on the page rescores when the rules change; this did not.**
Setting receptions to five points moved every number printed on a suggestion
card and none of the order, because the order was ADP, need and risk and none
of the three has heard of a scoring rule. With the editor open the app was
computing a better answer than the one it was giving.

**It has to be `overallScore()`, not `marketGap()`.** `marketGap` compares a
player with his own position's market, so it can say "this receiver is
underrated among receivers" and can never say "receivers are worth more than
backs now" — which is the only thing five points a catch changes. It was
tried that way first and the list did not move, because the elite are WR1 and
RB1 on both measures under any rules. `overallScore()` is points above
replacement at his own position measured against the best such figure on the
board, so it compares *across* positions.

**It has to be measured against the best player still available, not
`BEST_VOR`.** `overallScore()` is a share of `BEST_VOR`, which is fixed for
the whole draft, so by the fifth round everyone left scores single figures and
a multiplier taken straight off it collapses to a 6% spread across the
candidate list — which reorders nothing. Against the best still on the board
the range holds at every stage. Both of these were measured before being
believed, and both first attempts looked reasonable and did nothing.

**The multiplier only ever pulls a player up, and it is capped at
`MODEL_CAP`.** A rated player buys a discount on his draft position, up to a
quarter of it; an unrated one stays exactly where the market put him. No
centre point to argue about, and a player with no projection scores `null` and
is left alone rather than pushed down for the want of one. The cap is there
because ADP is the one input that knows when a player will actually be gone,
and advice that forgets that is not advice. Under default scoring it barely
moves — at pick one it swaps the sixth name and reaches no further than ADP 7
— and grows more assertive late, which is where ADP is noisiest.

**`cpuChoice()` deliberately never sees any of this.** The CPU teams are meant
to behave like a room drafting off a market, and in a shared room every client
has to reach the same answer for an empty chair. Your suggestions and the CPU
no longer share one formula, which is why the how-it-works page had to be
changed too — it previously implied they did.

### Tried and rejected: pricing depth by `aboveReplacement`

`needMultiplier()` bands purely on how many of a position you hold, so it
cannot tell McBride from Juwan Johnson — and the grade says those two are the
difference between second in the room and eleventh. The obvious repair is to
ask *would he actually start for me* instead of *how many do I have*:

```js
if (have >= need + 2) return 1.45;                 // hoarding, whoever he is
return aboveReplacement(player) > 0 ? 1.00 : 1.45; // depth only if startable
```

It was built, and it was one-sided by construction — the count bands were left
alone, so nothing could be promoted and the CPU could not be made to reach.
Then it was measured across eleven pinned seeds, at the first and eleventh
seats of a twelve-team draft, my seat drafting each way:

**Starter strength never improved once.** It fell in nine of eleven and tied
in two. Finishing rank got worse more often than better — five places worse on
one seed. It did do exactly what it was built to do, cutting unstartable
bench bodies from five to four, and that bought nothing at all.

**Because replacement level is a yardstick for starters, and a bench pick is
not a starting decision.** Below replacement *today* is not worthless: a bench
spot is a lottery ticket on somebody being startable in November, and pricing
it by who could start in September throws that away. It also goes flat exactly
where it was meant to help — by the closing rounds almost everyone left is
below replacement, so the multiplier stops discriminating and only distorts
the middle rounds, where a third running back just under the line is a
perfectly good pick.

The same number being right in the grade and wrong here is not a
contradiction. The grade is scoring who *starts*. This is choosing who to
*hold*. **Do not reach for `aboveReplacement` again without re-reading this.**

**Whether it helps is a measurable question, so measure it.** Same seed, same
computer teams, your seat drafting each way, across pinned seeds: starter
strength rose every time by four to five points and the finishing rank
improved every time. Draft value moved both ways, which is the tell that it is
finding value rather than reaching. A suggestion change that cannot show this
is a change to the numbers, not to the advice.

## Latest news

Headlines on a player sheet, under "Our read", through the worker. The order
on screen is the order of the argument: ours first, because it is the thing no
feed has, then the wire.

**We link, we do not republish.** A headline, one clipped line, the source's
name and an outbound link. Reproducing the body is what a licence buys;
aggregating a headline and linking back is not that. **`source` is never
dropped** — an unattributed headline is the version of this we may not show,
so it falls back to the provider's own name rather than to an empty string.
This is the narrow exception to "don't republish news"; the Don't rule still
stands for article bodies, expert rankings and analyst commentary.

**The key lives in the worker.** Same rule as `GIPHY_KEY`, same route shape,
same `originAllowed()` refusal *before the key is read* — CORS tells a browser
whether it may read a response and does nothing about the request being made.
The two proxy functions are separate, so the origin check is a call each has
to remember; `test-sockets.mjs` asserts both rather than assuming one covers
the other.

**No key answers `configured: false`, not an empty list.** "Not wired up" and
"nothing today" are different facts and only one is worth investigating. The
panel draws nothing either way — no message, no spinner. A section nobody
asked to wait for is worse as a permanently empty box than as no box, which
is why this differs from the GIF picker, where a button was pressed and
silence would be a bug.

**It fails by disappearing** — the score strip's contract, and now the second
runtime dependency on somebody else's server. Never throws, never blocks a
render, never leaves a gap. The catch on the fetch is the contract rather than
politeness: a rejected promise here surfaces as an unhandled rejection on a
page that is otherwise fine.

**Escape every field, and check the link.** This is the third thing on the
page written by someone outside the project, after chat and the ESPN strip,
and it lands in `innerHTML`. `safeNewsUrl()` parses with `URL` and keeps only
http(s) — the same rule as the GIF host and for a worse reason: a
`javascript:` href is an outside party running script in the page. Verified by
putting `<img src=x onerror=…>` and a `javascript:` link through the real path
and checking no element is built and nothing runs.

**Which player an answer belongs to is checked when it lands, not when it was
asked for.** The sheet is one element reused for everybody, so a slow response
for a player the reader has closed renders into whoever is open now. Nothing
else in the app would catch it.

**And a test for that race is easy to write so that it cannot fail.** Holding
a single `release` variable is the obvious shape and is wrong: the second
`openSheet()` overwrites it, so resolving settles the *second* player's own
request, which is not a race and passes against an app with no guard at all.
Collect the pending resolvers and settle only the first. This was written the
wrong way first and the run that caught it looked like an app bug.

**It has a tab of its own, and the tab is hidden until headlines arrive.**
It began under "Our read" on the Overview tab, which put six cards between the
model's read and the meters that follow it. `renderNews()` reveals the tab and
hides it again on every open — the sheet is one element reused for everybody,
so a tab left showing from the last player opens onto *his* headlines under
this player's name, and the reader has to click before finding out. That is
worse than the panel equivalent, not better.

**The reset toggles by view name, not by index.** It was `i === 0`, which
stopped meaning "Overview" the moment a hidden tab sat second in the strip.

**The source is the link's hostname when the provider does not name one.**
Measured against the real feed rather than guessed: Tank01 returns a title, a
link and an image, and no source field at all — so the first version named
*them* on every card, which is wrong twice. They are the aggregator, not the
author, and "TANK01" tells a reader nothing about whether to trust the line.
The link is the honest answer, parsed with `URL` rather than a regex.

**A field with no value is empty; it does not borrow one.** `at` fell back to
`playerID`, so every card on a real sheet read "TANK01 · 4429795". Anything
that does not look like a date is dropped rather than printed.

**News is asked for by the provider's id, never by a name.** `x` on a stats
record holds this player's id at other sources, built nightly by
`link_source_ids()`. A name search at request time is how one Josh Allen ends
up wearing the other one's news — and every number on the sheet around it
would still be right, so nobody would catch it.

**No id means no news, and no fallback.** Not a name lookup, not league-wide
headlines dressed as his. Somebody else's news under a player's name is the
one outcome worse than an empty panel. The pipeline has already written him
into `unmatched.txt`, which is where that fact belongs.

**The crosswalk prefers an identifier both sides already agree on.** Tank01
carries `sleeperBotID` on its MLB rosters and very likely on its NFL ones; when
it is there the join is a dictionary lookup with nothing to get wrong. The
name/position/team fallback exists for when it is not, and it **reuses
`index_sleeper()` and `normalise()`** rather than reimplementing them — a
second normaliser that drifted from the first is the same class of bug as a
league shape written down twice. The run prints which route each link came
from, and says so loudly if every one came from a name.

**Two of theirs claiming one of ours stores neither.** Picking one is a coin
flip that serves the wrong player's news, so a collision is reported and both
are dropped.

**One call, not thirty-two.** `getNFLPlayerList` is the whole league; per-team
rosters would be 32 × 30 = 960 calls a month against a 1,000 free tier and
would spend the entire allowance on the crosswalk that exists to serve the
news.

**Count what survived, not what was attempted.** The first version tallied as
it went, so a collision printed "linked 0 … (1 on sleeperBotID)" and a
duplicated row counted twice. A count that disagrees with the data it
describes is how you stop believing the run output — which is the only thing
standing between a quiet bad join and a user finding it.

**The nightly workflow needs the key too, and forgetting it fails silently.**
`update-players.yml` regenerates `stats.js` from scratch every morning, so a
run without `TANK01_KEY` does not fail — it quietly drops every `x` id a keyed
run had written, and player news stops working overnight with nothing in the
log that looks like a fault. The secret is set once under Settings → Secrets
and variables → Actions; the workflow passes it in `env:` on the rebuild step.
**A manual local run does not bump `?v=`.** Only the workflow does that, so a
rebuild you run by hand and commit yourself is new data behind a cached
address — which is the same "a rebuild nobody sees" failure, reached from the
other direction.

**The route caches, and that is what makes it affordable.** Without it the
provider is called once per sheet opened, and a draft is the same dozen
players opened over and over. The free tier is a thousand calls a month, so
sweeping the board once — 201 players with an id — is a fifth of the allowance
in a sitting. Measured: 50 requests across 5 players cost **5 upstream calls**
rather than 50. Fifteen minutes, in `NEWS_TTL`.

**The cache key is built, not taken from the request.** `caches.default` keys
on the whole URL, so the real request — which carries an Origin and could
carry anything a client appends — would produce one entry per way of asking
rather than one per player. `newsCacheKey()` canonicalises it.

**A cached entry carries no CORS headers, and the response is rebuilt.** Which
origin may read a response is a per-request decision, and serving one caller's
`access-control-allow-origin` to another turns it into a shared one. The body
is the only thing worth keeping; the headers are put back per request, and the
origin refusal still happens before the cache is ever consulted.

**An error is never cached, and an empty answer is.** "He has no news today"
is a fact worth keeping, and re-asking for it would spend the allowance on
exactly the players who have nothing. Caching a failure would pin an upstream
blip for the whole TTL and turn a moment's outage into a quarter hour of
silence — the same line `configured` already draws between "not wired up" and
"nothing today". Tested by taking the provider down, asking for a new player,
bringing it back and checking the next ask is a miss that returns real items.

**`TANK01_BASE` points the worker at a stub.** The provider cannot be reached
from a test and a key cannot live in the repo, so the whole path — worker,
normalisation, escaping, rendering — is driven against a local server serving
a canned, deliberately hostile payload. Everything above was measured that
way, not reasoned about.

## Conventions

- `app.js` is organised in numbered sections. Keep new code in the right one.
- `render()` rebuilds every panel from scratch on any change. There are no
  partial updates. This is fine at this size and keeps state bugs away.
- Click handling is delegated from `document`, because the DOM is constantly
  rebuilt. Don't attach listeners to elements inside a render function.
- Comments explain *why*, not *what*. The owner reads this code to learn.
- **Two themes, one set of names.** `:root` holds the dark values and is
  therefore the default; `:root[data-theme="light"]` overrides them. A new
  rule may only name a colour that is the same under both themes — brand
  navy, a position solid, or white on top of one of those. Anything else
  has to become a token in both blocks, or it will be invisible in one of
  them. Blue is two tokens for this reason: `--blue` always sits under
  white text, `--link` is blue *as* text on a surface. Orange is two for the
  same reason: `--orange` (#ED6011) is the brand, and it is only 3.34:1
  against white, so anything putting white text on it uses `--orange-cta`
  (#C2410C, 5.18:1) instead.
- **A border-bottom is inside the box, so symmetric padding is not symmetric
  space.** `.sheet-tabs` had an even `9px 12px` and the selected pill measured
  9px of clearance above it and 10 below, because the 1px border sits within
  the element. Small enough to be invisible as a number and quite visible as a
  lopsided chip — it was spotted by eye before it was measured. The padding is
  `9px 12px 8px` now, so 8 + the border is the 9 the top already had.
- **Two scales, and no rule below them may write a raw px.** Eight type
  steps — 10, 12, 14, 16, 19, 23, 32, 42 — and five radii — 4, 8, 12, 16,
  pill. They live in their own `:root` block above the colours, because
  they do not move between themes and should not be read as if they might.

  They replaced 26 font sizes and 15 radii: every half step from 8.5px to
  16px and every integer from 2 to 12, each chosen per element by eye. The
  draft room rendered eleven sizes at once, nine of them between 8.5 and 13.
  **Every individual choice was defensible and the set was not** — nothing
  shared a size, so nothing read as belonging to the same family, and that
  is a thing a visitor feels without being able to name.

  Radii divide by the job, not by taste: an inline mark, a control, a card,
  an overlay. `50%` stays where a circle is genuinely wanted.

  The check is one line in the console, and it should come back 8 and 5:
  the count of distinct `fontSize` and `borderRadius` across everything
  rendered. Anything off the scale is a rule that forgot, and an icon-only
  button with no `font-size` at all counts — Chrome gives it 13.333px, so
  `.theme-toggle`, `.to-top` and `.home` each carry one that changes
  nothing on screen and keeps that audit honest.
- **One primary action colour, and it is `--orange-cta`.** Orange means
  act; blue means state — focus rings, the selected tab, the header when
  the clock is yours. They were split for a long time, `.cta` orange and
  `.primary` blue, which meant the same control was two colours depending
  on the screen: "Resume" on a saved draft was orange on the landing page
  and blue three lines into the draft view, from the same two words in the
  same codebase.

  **`.draft-btn` is blue on purpose and is not an oversight.** The rule is
  about *the primary action* — the one thing a screen is asking for — and
  that is a row control repeated on every player in a 200-row table. Two
  hundred orange buttons is wallpaper, and it would outshout the actual
  primary on the same screen, which is the point of having one. The split
  is by rank, not by whether a control does something.
- **The setup screen leads with the two settings people change and folds
  the rest away.** It asked 68 questions before it would let anybody draft
  — fourteen selects and forty-four scoring inputs — with the Start button
  under all of it. Six controls are visible now; nothing was removed.

  Three `.setupbox` disclosures — League, Scoring, Draft with friends —
  each carrying a summary of what is inside, so shut is still informative.
  That summary comes from `league` through `leagueSummary()` and
  `scoringLabel()`, never from a second copy of the same lookup.

  **Anything that can refuse the Start button has to say so outside the box
  that caused it.** Every check in `setupProblem()` lives inside League, so
  `refreshSetup()` writes the reason to `#setupProblemMsg` beside the button
  *and* forces the box open. A disabled button whose explanation is folded
  away is worse than the wall of controls this replaced. It opens and never
  closes itself: shutting the box the moment the arithmetic came right would
  take the screen away mid-edit.
- **The hero product shot is generated, not an image.** `renderHeroShot()`
  draws the opening rounds of a real board from the same `board` array, the
  same valuation and the same position solids the draft uses. A PNG would be
  a file to rebuild every time the design or the nightly data moved, and it
  would be wrong the first time somebody forgot. This one has nothing in it
  to keep in sync.

  **It drafts rather than slices, because ADP is an average and no single
  draft looks like an average.** It used to be `board[i]` — the first forty
  names in ADP order — and that is a real board that no room has ever
  produced. A position that goes early in half the rooms and late in the
  other half averages to the middle, where it loses to the backs and
  receivers that go at the same spot in every room; so the top forty by ADP
  is 18 RB, 21 WR, 1 QB and **no tight end at all**, and the graphic was two
  colours. The elite quarterback goes in the third round of a real ten-team
  draft and the two tight ends worth having go in the fourth, which is a
  thing anybody who has drafted knows on sight — and the reason the picture
  read as synthetic without anybody being able to say why.

  `shotPicks()` runs fifty picks in snake order, each seat valuing the board
  the way `suggestions()` does: ADP, need, injury risk and the model. Two of
  those move the scarce positions, for different reasons. **The model prices
  them** — `overallScore()` is points above replacement measured *across*
  positions, so it can say an elite tight end beats the twenty-fifth
  receiver, which is what an ADP average smooths away and what the product
  claims to know. **Need is what makes a seat stop taking backs** — a fourth
  running back is past the starting requirement and loses the 0.80, so the QB
  and TE still on it finally win a pick, which is why a real fifth round has
  quarterbacks in it and an ADP slice never does. `MODEL_CAP` keeps the first
  of those to a quarter of a player's price, so it stays a nudge off the
  market: the quarterback moves 30 → 23, the tight ends out of round five into
  round four, and the first two rounds barely move.

  **Five rounds, not four, and the fade is why.** The mask starts dissolving
  at 46%, so at four rounds the fourth row is the one being eaten — and the
  fourth row is where the tight ends land. The only two cells on the board
  that are not a back or a receiver arrived as ghosts. A fifth round costs
  37px, moves nothing above it, and gives the fade a row of its own.

  Nothing in it is a name: whoever tonight's data says is QB1 and TE1 is who
  turns up.

  It is the one place in the app where something overflows and can neither
  scroll nor ellipsise — the phone crop, where ten columns wide enough for a
  surname cannot fit and 31px columns would not be a picture of anything.
  That is deliberate and it is the *only* exception: the clipped part is
  decoration with a duplicate one click away, not content with no way to
  reach it. Anything else that trips that check is still a bug.

  **A card here is a name and a club, and that is an editorial decision
  rather than a rule.** The shot is an *excerpt* of the board — five rounds of
  fourteen, ten teams fixed, no faces — so what it leaves out gets decided per
  item, not settled once by "match the product".

  The faces are out on cost: fifty headshots is fifty requests to somebody
  else's server on the first paint of the marketing page, for decoration the
  mask starts dissolving at 46%. The landing page loads no third-party image
  at all, and a test asserts that.

  **The arrow and the pick number were carried over from the board and did not
  survive being looked at.** They shipped for one commit and the owner's first
  reaction to the rendered page was that it looked jumbled, which was right.

  **The pick numbers zigzag.** Row one runs `1.01 → 1.10` left to right and row
  two runs `2.10 → 2.01` back the other way — correct, and on the working board
  it is something a drafter actively tracks. On a graphic somebody glances at,
  it is fifty four-character numbers alternating direction with no pattern for
  the eye to hold.

  **And there was no way to demote them.** The usual repair for two elements
  competing is to make one smaller or dimmer. Both are shut here: `--fs-2xs` is
  the bottom of the type scale, and dimming is precisely the opacity bug that
  had to be removed from this file and the board's. So the pick number would
  have competed with the player's name at equal weight for ever, in a 103×54px
  box whose whole job is the name.

  **`shortName()` stays**, which is the half of that change that worked:
  "J. Gibbs" reads as a person where "Gibbs" read as a row in a table.

  **The lesson is about the frame, not the elements.** "It draws the board
  card" was written as though matching the product were the goal, and it is
  not — the shot has about two seconds to say *this is a real draft board,
  colour-coded, with real players*. Every true fact added to a cell with room
  in it costs some of that. A test now asserts exactly two elements per card,
  because the pull is always towards adding one more.

  **The phone floor is 70px, and the initial is why.** At 58px, with a surname
  alone, 38 of the 50 names fitted. The card carries "G. Pickens" now, about
  14px more, and at 58px that collapses to **11 of 50** — a board of "G. Pic…"
  and "A. Bro…", which is not truncation but a different graphic. 70px gives 40
  of 50 and still shows 4.8 of the ten columns. It stayed at 70 when the foot
  came off, because the foot never decided it: it wanted 41px at its widest and
  the names want more.

  **The shot is ten teams whatever the visitor has set, and the test for that
  has to call the function.** `renderHeroShot()` runs once at startup, when
  `league.teams` is still the default ten, so a version reading `league.teams`
  draws an identical shot and no page-level check can separate them. It is a
  latent bug rather than a live one. **A mutation that passes is not a test** —
  the first version of this one did, and its comment claimed otherwise.

  **A flex column compresses rather than overflows, so clipping does not
  report as clipping.** The row height was set to 48px against a card wanting
  54, and the `POS · TEAM` line was cut in half on every cell — with
  `scrollHeight === clientHeight`, so an overflow sweep saw nothing at all.
  Measure a free-standing clone of the card against the row instead, which is
  what the test does.
- **The centred wordmark needs a breakpoint.** `.shell-inner` is
  `1fr auto 1fr`, so each side gets the same width. Below about 540px the
  sides need ~191px of links and get ~110px, and because the links are
  `nowrap` they do not shrink — they spill straight over the wordmark. Under
  700px the header keeps only the burger, the brand and Sign up; How it works,
  Log in, Install and the theme toggle move into the rooms panel.
- **The rooms panel is inside `#shellbar`.** Scope mobile hide rules to
  `.shell-inner`, not the header, or they hide the panel's copies too.
- **A `<select>` draws its arrow inside the padding, so padding cannot buy
  room for the text.** Three dropdowns across a `.field-row` is comfortable
  while the options are `QB 1` and `RB 2`. The league row's options are words,
  and at 375px each select gets 96px: `14 rounds` wants 67px of it and the
  arrow wants about 16 more, so the text finishes hard against the arrow.
  Widening `padding-right` looks like the fix and does nothing — the arrow
  moves with it. The row needs *width*, so `.field-row.wordy` wraps to two
  lines under 480px. 481px still fits three across with 25px to spare, which
  is where that number came from. The class says `wordy` rather than
  `league-row` because the shape of the options is the reason, not the row.
- **Nothing caches `.theme-toggle`.** There are up to three of them and one is
  rendered, so clicks are delegated and `syncThemeButton()` re-queries.

- **One header, two sets of content.** `.shellbar` and `.appbar` share a
  surface, a border and a 1120px centred column, so the Draft Room and the
  landing page read as the same site. Only `.my-turn` and `.urgent` take
  colour, and they carry their own reversed mark and white text. A CPU being
  on the clock is the resting state and must look like the homepage.

- **The navy band starts below the header, and that is the rule above
  holding.** The landing page was two tones ten points apart — `--page`
  under `--card` — across a thousand square pixels, with the one saturated
  thing on it being the CTA at 0.8% of the area. `.hero-band` is the second
  surface, and it is brand navy specifically because `--navy-deep`, `--navy`
  and `--navy-glow` are byte-identical in both blocks. **That is what lets
  everything inside it name white and the `--band-*` values directly**, the
  same licence `.appbar.my-turn` already uses.

  Making the header navy too would read better and would mean making
  `.appbar` navy with it, which is a change to the draft room rather than to
  the landing page. The seam is handled with an inset shadow instead, so the
  header casts onto the band rather than mismatching against it.

  Full bleed by nesting — `.hero-band` > `.band-inner`, with the 1120px
  column moved out of `.landing` — **never by `100vw`**, which counts the
  scrollbar and starts overflowing sideways on whichever machine shows one.

  Its bottom fade is the one value in that block that moves between themes,
  and it has to: the band's job at that edge is to arrive at whatever page
  it is sitting on. **Anything laid over that fade needs clearance**, which
  is what `.hero-band .hero`'s bottom padding is for — `--band-ink-mid` over
  a light-theme fade loses its contrast on the way down. The product shot is
  the exception and fades itself, on purpose, with its own mask.

- **Two views, one hash route.** `#/` is the landing page, `#/draft` is the
  Draft Room. Hash routing because GitHub Pages has no rewrite to send a real
  `/draft` path back to `index.html`, and because it keeps the back button
  working for someone mid-draft. `applyRoute()` is the only thing that decides
  what is visible; `render()` must never fight it.
- **Leaving the draft is not discarding it.** Navigating home stops the CPU
  timer and the clock and leaves everything else alone, so nothing advances
  off-screen. Returning hands the clock back or restarts the room. Only
  "Discard draft" clears the save.
- **The rooms are written down once,** in `ROOMS` in `app.js`, and rendered
  into both the header panel and the landing page. Adding a room is one entry.

  **On the landing page they turn through a door.** It was a grid of six cards
  with five greyed out, which is the worst available framing of a roadmap: it
  reads as five things that are missing. A door you have not opened yet is the
  same fact told properly, and the placard promises nothing the data does not
  say — `live` and `season` come straight from `ROOMS`, so it cannot overclaim.

  Drawn in CSS, no image, for the reason written beside the product shot: a
  picture is a file to rebuild every time the palette moves, and it is wrong the
  first time somebody forgets.

  **Three things about it that are invisible when they break.**

  **`overflow` on any ancestor between `.doorway` and `.door` flattens the 3D.**
  Any value but `visible` establishes a flattening context that
  `transform-style: preserve-3d` cannot cross, so the transform still applies
  and the door squashes instead of swinging. The interior clips; the frame must
  not. A width check alone does not catch this — the panel narrows either way.
  What separates them is **height**: under perspective a door swung towards the
  reader draws *taller* than at rest, and flattened it does not move at all.

  **`margin: 0 auto` on the doorway collapses it to nothing.** An auto margin on
  a grid item defeats the default `stretch` and makes the item shrink-wrap its
  content — and every child of `.doorway` is absolutely positioned, so its
  intrinsic width is zero. At phone width the whole thing vanished while still
  computing a perfectly healthy `max-width: 320px`. `justify-self` instead, and
  test the measured box rather than the style.

  **The door opens *towards* the reader, and that is deliberate.** Away is what
  it really does seen from inside the room, and at that angle it is edge-on,
  unlit and invisible — correct physics, no picture. Towards costs about 47% of
  the frame, which is why the interior text starts at half and the frame is
  wider than it looks like it needs to be. Anything written under the swing is
  hidden by the thing that is supposed to be revealing it.

  **The frame is what buys width on a phone, not the angle.** A swung door
  covers cos(θ), so opening it *further* uncovers more — the intuition runs
  backwards, and 48° and 54° were both tried before that was measured. But the
  angle only ever moves width between the placard and the room's name, because
  both live on the same frame. Widening the frame gives both, and the frame had
  a `max-width: 320px` while the list beneath it used the full column: 354px at
  390, 378 at 414. The door sat inside an edge every other block on the page
  shares. It is 380 now, at 70°, and the placard came out bigger than it was at
  320.

  **Measure text in place, never with a probe.** A detached span carrying a copy
  of the computed style inherits the body font, and it reported 141px for "The
  Waiver Room" in a 154px column — a comfortable fit, on a name that was
  visibly wrapping. `white-space: nowrap` on the real element says 158. The
  longest is "The Prospect Room" at 175, which no angle reaches on a 320 frame:
  buying it there needs about 75°, where the door is edge-on and stops being a
  door.

  **Below 360px it still wraps, and two lines is the right way to lose that.**
  A 320px screen offers a 260px room against a 175px name. The alternative is
  dropping the name to the blurb's own size, which is a worse answer than a
  second line.

  **Anything measuring the door has to stop the cycle *and* cancel what is
  already scheduled.** `doorRunning = false` prevents the next queue; it does
  not cancel the step in flight, and `DOOR_HOLD` is six seconds — so a walk
  through six rooms has one fire underneath it, add `.turning`, and rotate the
  whole doorway 90°. That measured as the door lying 317px across the text,
  which reads as a layout bug and is a doorway seen side-on. `doorClear()`
  before every open. Waiting for the transform to go *stable* is not enough
  either: between the class landing and the first painted frame it sits at its
  start value, so two identical polls can both read a shut door — it must also
  have turned.

  **A colour inside the room is a literal, not a token.** `--band-ink` is
  declared on `.hero-band`, not on `:root`, so naming it out here resolved to
  nothing — the property fell back to inherit and the room's name picked up the
  page's dark ink and disappeared against a dark interior in the light theme.
  The room carries its own ground in both themes, which is exactly the case
  where white may be named directly.
- **A room is a name and takes a capital. So does the landing section: "The
  Rooms". Everywhere else in a sentence, "rooms" is a common noun and stays
  lowercase.**

  So: "The Draft Room", "The Waiver Room", and the heading "The Rooms" — but
  "all six rooms", "shared rooms", "as rooms arrive".

  The grammar on its own would keep the heading lowercase, the way "the cars"
  sits under "the Ford Mustang", and it did until the owner decided otherwise.
  That is a brand call rather than a correction: it makes the set of rooms a
  named surface of the product instead of a description of what is below the
  fold. Juke is still the brand above it, which is why the individual rooms
  keep their own names underneath and nothing else in the prose changes.

  The header button reading "Rooms" is not evidence either way. It is the
  first word of a nav label, which is capitalised whatever the word is doing —
  "How it works" sits beside it in sentence case for the same reason.

  There is exactly one heading, in `index.html`, and after this change every
  *visible* use of the word on the landing page is capitalised: the nav
  button, the heading, and the six room names. The lowercase uses are all in
  comments and in this file — real prose about the project rather than copy
  anybody reads on the page. So a sentence that needs the common noun still
  gets a small r; there simply is not one on screen today.
- **Check a new class name against the existing sheet before using it.**
  The landing section was first called `.home`, which is already the header's
  home button; it inherited `display:flex` and collapsed to zero width. The
  chat avatar was first called `.avatar`, which is the player photo and is
  hidden outright inside the rail.

- **The same goes for function names, and it fails more quietly.** `app.js`
  is one scope, so a second `function initials()` does not shadow the first —
  it replaces it, whichever is declared last, with no warning anywhere. The
  chat's version was silently calling the player one, which happened to
  return something plausible for a real name and threw on an empty seat.
  `grep -n "function <name>"` before adding one.

- **The logo is navy-on-light, and the header is navy.** The mark is inlined
  rather than an `<img>` so the navy half can be reversed to white on the
  header (`.mark-body`) while the swoosh keeps its orange (`.mark-accent`).
  It is 662 × 774, not square — sizing it as a square squashes it.

## Hard-won rules — do not undo these

**A pick number is not a seat number, and for half the board they are the
same.** `pickCode()` returned the seat, so every even round came out mirrored:
in a ten-team league the first pick of round two was labelled `2.10` and the
last was labelled `2.01`. Odd rounds were correct, which is why it lasted as
long as the app has existed — at any moment half the board agreed with it.

The mirror lives in `DraftEngine.pickInRound()` now and nowhere else, because
the board was computing its own copy of it inline. Anything holding a round
and a seat and wanting a label asks the engine.

**The tell was two correct numbers side by side disagreeing.** The header
prints `Pick 2.10 (11 Overall)`, and 11 overall in a ten-team league can only
be the first pick of round two. Nothing about the arithmetic was wrong —
`pickInfo()` had the seat right the whole time — only what the result was
called. That is the same failure as the standings printing starter strength
under a column of totals, and it is found the same way: read what the screen
says and check it against what the app computed.

**Uniqueness is the obvious test and it does not catch this.** Reading the
seat still hands out every code in a round exactly once, because each overall
number in a round has its own seat — the set is right and only the assignment
is backwards. What catches it is that a pick code must be derivable from the
overall number and the league size alone, with no reference to the snake at
all. Test that property, not the count.

**Decide a player's type from `player.pos`, never from whether a stat is
present.** Christian McCaffrey threw one pass in 2025, and a check of
`if (stats.pa)` rendered him with quarterback columns and no receiving line
at all. Presence of data is not identity.

**Treat `0` from an API as missing, not as a real zero.** Sleeper returns
`pts: 0` for players it has no projection for. Counting those as valid
projections dragged replacement level toward zero and made every other
player look elite.

**Never hand-edit `players.js` or `stats.js`.** The next scheduled run
overwrites them. Change `build_players.py` instead.

**Nothing about the league shape may be written down twice.** `app.js` has
one `league` object and everything else derives from it — replacement level,
roster limits, the starting lineup, the round a kicker becomes legal, even
the prose in the method notes. The old code spelled "ten teams" out in a
dozen places and carried a hand-picked replacement level that was only
correct for one of them.

**FFC's `teams=` parameter does nothing.** It is echoed back in the response
meta, so it looks like it worked, but 8, 10, 12 and 14 all return the same
rows, the same ADP and the same `total_drafts` — checked across 2024, 2025
and 2026. Only the scoring format actually changes the data. Don't build a
team-count axis on top of it without re-checking that first.

**`gp` on a projection is not a games count for every position.** Sleeper
forecasts a team defense as one aggregate row stamped `gp: 1`, where every
other position carries the real projected week count. Dividing by it made
every DST's per-game figure identical to its season total — Pittsburgh read
93 points and 93.0 per game. Per-game figures go through `perGame(points,
games)`, which takes the denominator explicitly and prints a dash rather
than dividing by a fallback, and DST rows get theirs from `projGames()`.
Kickers were never affected: they carry the same `gp` as skill players.

**Sleeper's projections are coarser than its actuals, and the pipeline has to
reconcile that.** Season and weekly lines carry `fgm_50_59` and `fgm_60p`;
projections carry only the combined `fgm_50p`, and express misses solely as
`fgmiss_50p`. Reading the fine-grained keys alone silently drops every
projected 50-yard field goal — 183 of them — and makes kickers look far worse
than they are. `reconcile()` folds the coarse keys in. Check any new stat
across all three feeds before trusting it.

**Bump `?v=` in `index.html` on every deploy that changes a file it loads.**
Everything the page asks for is cached, so without a version in the address a
returning visitor runs today's HTML against Tuesday's JavaScript. That does
not fail as a blank page. It fails as a page that half works: the shared room
shipped with `renderChat` in the new `app.js` and the chat panel hidden in
the markup, so anyone who had visited before got a room with no chat window
at all and nothing in the console to say why. One number, changed in
`index.html` and `docs/draft-room-how-it-works.html`, in every `?v=` on the
page. A query string rather than renamed files, because renaming needs a
manifest and a manifest is a build step. The daily workflow bumps it too,
when it commits new player data — a nightly rebuild behind a cache is a
rebuild nobody sees.

**Do not request the new `?v=` URL until the deploy has actually landed.**
This is the one way the scheme bites you, and it is easy to do while trying
to be careful. GitHub Pages publishes `index.html` and the assets a moment
apart, so a verification poll fired too early asks for `app.js?v=<new>` while
Pages is still serving the old body at that path — and Cloudflare caches that
answer against the fresh address for the full ten minutes. New HTML, old
JavaScript, at a URL specifically designed to prevent exactly that. It has
happened once, on the profile deploy.

Wait for `curl https://jukeff.com/` to come back asking for the new version
*and* give the assets a moment after that, or verify with an extra throwaway
query (`?v=<new>&bust=1`), which reaches the origin without poisoning the
real address. If it does happen, Caching → Configuration → Custom Purge, one
URL per line, fixes it in seconds.

That window used to be four hours. It was Cloudflare's Browser Cache TTL
overriding GitHub Pages, which sends ten minutes; the zone is now set to
**Respect Existing Headers**, so `Cache-Control: max-age=600` reaches the
browser unchanged. If a stale asset ever reappears, check that setting first
— but the `?v=` is what actually closes the hole, and it works whoever is
serving the file.

**The pages themselves carry no `?v=`, so checking a deploy needs the same
throwaway query.** `?v=` protects everything `index.html` *loads* and can do
nothing for `index.html` itself, or for
`docs/draft-room-how-it-works.html` — those are cached under their own plain
addresses for the same ten minutes. `curl` will show you the new page while
the browser sitting next to it still shows the old one, because they hold
separate caches, and a forced reload does not always clear the browser's:
after the how-it-works rewrite the tab kept serving the previous copy until
it was loaded as `…draft-room-how-it-works.html?cb=1`. So when the change is
to a page rather than to an asset, verify it with a throwaway query too, and
do not conclude a deploy failed because a tab you already had open disagrees
with `curl`. Only the assets get a version; the pages get patience.

**`og:image` must be an absolute URL, and it is baked to `jukeff.com`.**
Link previews are fetched by Slack, iMessage and Twitter from their own
servers, so a relative path resolves to nothing. If the domain ever changes,
`index.html` and `manifest.json` both need updating.

**Scores come from ESPN, and nothing else does.** Sleeper's schedule feed
carries no scores at all — only home, away, date and status — so the strip
uses ESPN's public scoreboard endpoint. It is a third feed, it is
undocumented, and it is the only thing in Juke that depends on someone
else's server at run time. So it fails by disappearing: down, slow, blocked,
or changed shape all end at `strip.hidden = true`. It also renders nothing
when there are no games, which is most of February to August. Never let it
throw, never let it show an error, and never let it block a render.

**Escape every chat message, and every name attached to one.** Chat is the
only text on the page written by another person rather than by our own
pipeline, and `renderChat()` puts it in `innerHTML`. It all goes through
`escHtml()` first. This is not a style preference: without it, one manager
can put a script tag in everyone else's draft. Verified by sending
`<img src=x onerror=...>` through a real room and checking no image element
is created and nothing runs.

**A name is the second thing on the page somebody else wrote.** Chat was the
first, and for a while it was the only one, which made the seat list safe by
accident: every chair said "Manager" or "CPU" and we wrote both. The moment
names became real, `renderInvite()` was putting a person's typing straight
into `innerHTML`. Anywhere a name is drawn — the seat list, a message header,
an avatar, the typing line, the "took seat 4" announcement — it is escaped,
and the room cleans it first: control characters out, tabs and line breaks to
a space (dropping a newline turns "Chase\nCantwell" into one word, which is a
different name, not a safer one), collapsed, trimmed, then cut to 20.

**Reactions are stored as member ids and never sent as them.** A chat line
keeps `reacts: { "🔥": [memberId, ...] }`, and `viewFor()` turns that into
`{ emoji, count, you }` before it leaves. That is the same rule the rest of
the view follows and the reason it exists: a client that has never been told
another member's id cannot impersonate them by echoing it back. The emoji is
checked against `REACTIONS` for the same reason a GIF host is — otherwise it
is an arbitrary string, per person, per message, in a room strangers can be
invited into.

**Typing never touches state.** It is relayed to the other sockets and
forgotten. Storing it would mean a Durable Object write per keystroke to
record something that is true for two seconds, and it is a lie the instant a
connection drops. The seat comes from the socket, never from the message, so
"seat 4 is typing" about somebody else is not a claim the room honours.

**Picks are not chat messages; the client merges them in.** `room.picks`
already carries every pick with a timestamp, so `chatStream()` interleaves
them by `at` rather than the room storing them twice. The version that stored
them looked fine for a round and then wasn't: 140 picks through a
fixed-length log pushes every real message out by about round three.

**The chat log is bounded in bytes as well as lines.** The whole room is
written to storage on every action and a Durable Object value has a hard
ceiling. Five hundred characters is a legal message, so 200 of them do not
fit beside the picks and the league — a line count alone does not bound the
write.

**An author `display` beats `[hidden]`.** The chat dock is hidden from
JavaScript and given `display: flex` by CSS, and the CSS wins — a solo draft
grew a chat panel for a room it was not in. Anything that is both toggled by
the `hidden` property and given a display in the stylesheet needs
`[hidden] { display: none }` or `:not([hidden])` on the display rule.

**`top` survives every change of `position`, and it has now caused two
different bugs.** The docked chat sets `position: sticky; top: 8px`, and both
of the rules that re-position it inherited that 8px:

- *As a fixed sheet:* the mobile rule sets `bottom: 0` and a height. Top plus
  height is a complete answer, so the browser took it and ignored `bottom`,
  and the sheet opened at the top of the screen.
- *As a relative block:* the lobby rule changes only `position`, and `top`
  applies just as happily to a relatively positioned box — as an 8px shove
  downwards with the layout box left where it was. So the dock hung 8px below
  its own slot and sat on top of the Start button beneath it. Eight dead
  pixels on the button the whole screen exists to get you to press.

`top: auto` is the fix in both. **Changing `position` on a shared rule means
auditing `top`, `right`, `bottom` and `left` with it** — they do not stop
applying, they change meaning, and nothing warns you.

**Every field is 16px on a touch screen, because iOS zooms anything smaller.**
Safari zooms the page in when a field under 16px takes focus and does not zoom
back out, so typing one line of chat left the whole draft magnified and the
manager pinching their way back — every time they said anything. Every field
in the app was under it: the selects at 14.5, chat and the GIF search at 12.5.

Those three sizes no longer exist. The type scale below puts `--fs-base` at
16px and every field on it, so the rule is now a floor the design already
meets rather than an exception fighting it. **Leave the rule in.** It costs
nothing while the scale holds and it is the only thing standing between a
field added in a hurry and a magnified draft.

It is one rule under `@media (pointer: coarse)`, with `!important`, and both
parts are deliberate. Coarse pointers only, so desktop typography is
untouched. `!important` because every field here is styled through a class and
`.chatform input` beats a bare `input` — the first version of the rule moved
the selects, silently left the chat box, the name and the player search where
they were, and looked like it had worked. This is a floor under the design
rather than an opinion competing with it, and a field added later inherits it
without anybody remembering this exists.

The other fix is `maximum-scale=1` on the viewport. It works and it is worse:
it buys this by taking pinch-zoom from everybody, including people who need it
to read the page at all.

**`scrollWidth > clientWidth` is what correct truncation looks like too.**
Sweeping the page for elements wider than their box is a good way to find a
phone layout that leaks, but on its own it reports every properly ellipsised
label as a fault. A board header for a team called
"Bone-Thugs-N-Montgomery" is 123px of name in a 74px cell and is behaving
perfectly: `overflow: hidden`, `text-overflow: ellipsis`, `white-space:
nowrap`. The question is not whether an element overflows, it is whether it
can either **scroll** (`overflow-x` is `auto` or `scroll`) or **ellipsise**.
Anything that overflows and can do neither is the real leak. Filtered that
way, the whole app comes back clean at 375px and the board's three inner
scrollers — the tab strip, the action bar and the grid — show up as the
scrollers they are.

**A monospace box stops being code the moment its lines become sentences.**
The formulas on the how-it-works page are prose now, which made them long
enough to wrap on a phone, and a wrapped line starting hard against the left
edge reads as the next step of the sum rather than the rest of the current
one — three steps looking like five. Each line is its own `div` inside
`.formula` with a hanging indent, so a continuation sits in from the margin.
Nothing wraps at desktop width, so the indent never shows there.

**A GIF address from chat is a claim, not a fact.** It arrives from another
manager exactly as a message does, and it ends up in an `img src`. Only
GIPHY's own media is allowed, checked with `URL` rather than a substring —
`https://evil.com/?x=giphy.com` contains the string and is not GIPHY, and
`giphy.com.evil.com` is a different site entirely. Checked twice: `cleanGif()`
in the room before it is stored, `safeGif()` in the page before a browser is
asked to fetch it.

**The GIPHY key lives in the worker and nowhere else.** In the page it would
be readable by anyone who opened dev tools. `wrangler secret put GIPHY_KEY`,
or the dashboard, and the worker proxies the search. With no key it answers
`configured:false` so the picker says GIFs are not set up rather than showing
an empty search.

**Escape anything that comes from ESPN.** Every other string on the page is
generated by our own pipeline and goes into `innerHTML` as-is. The score
strip is the exception, so team names and status text run through
`escHtml()` first. Do not follow the surrounding style here.

**Anything an API gives us that we don't use should be visible, not silent.**
Unmatched players and unscored stat keys both get written to `unmatched.txt`
rather than dropped.

**CSS cannot reach inside `<use>`.** The mark is one `<symbol>` cloned into
each header, and `<use>` builds a shadow tree that descendant selectors do
not match — `.appbar .mark-body` silently matches nothing. Custom properties
*do* inherit into it, so per-header overrides set a variable on the `<svg>`
(`.appbar .mark { --mark-ink: #fff }`), never a `fill` on the path.

**The logo is navy-on-light, so it needs `--mark-ink`, not a fixed fill.**
Hardcoding white made it invisible on every light surface, with only the
orange swoosh showing. The token is brand navy in light, white in dark, and
forced white on the navy draft bar.

**Weekly logs are keyed by season; season totals are not.** `stat.w` is
`{ "2025": [...], "2024": [...] }`, two years, and `stat.s` is every season
back to 2018. They answer different questions: the career table wants depth
and costs nothing extra, week-by-week wants recency and costs about 184KB a
season in a file that is a plain script tag on a page with no build step.
Five years of weekly rows would put a megabyte of render-blocking JSON in
front of a phone. `WEEKLY_SEASONS` in `build_players.py` is the one place to
change it, and `logYears()` draws a selector of the years a player actually
has rather than five tabs with three of them dead.

**Sleeper stores height as inches**, a bare number from 67 to 78 across the
whole pool, with no quote form anywhere in it. `heightText()` renders it. A
team defense has no height, weight, age or college — it is eleven people —
so `bioLine()` gives it its own line rather than a strip of dashes, and
`ourRead()` calls it "this defense" rather than "him".

## The board card

Five things per cell: who, what and where, which way the pick order is
travelling, which pick it was, and a face. It was a surname and a position.

**The arrow is there for the turn, which is the one thing the numbers do not
tell you on sight.** Down on the last pick of a round, along the way its round
runs otherwise — and it asks `DraftEngine.pickInRound()` rather than deriving
the mirror again, which is the third caller and the reason that function
exists.

**A defense keeps its club.** `lastName()` drops the word "Defense", so
initialising what is left gives "L. Chargers", which is nobody: the first word
of a team name is not a first name.

**`avatar()` is deliberately not reused for the face.** It draws initials
underneath as a fallback and carries `.avatar`, which is hidden outright inside
the rail and is the player photo on the sheet. A 20px board face wants neither,
and a missing photo draws nothing at all — 140 grey circles is a worse board
than 140 cards, six of which have no picture.

**The row owns the height, not the cell.** A row is as tall as its tallest
cell, so a floor on the cell gives a uniform board only while the floor happens
to exceed the card's natural height. Set at 56 against cards that came out 58,
the board had two row heights and every row jumped 2px the moment its first
pick landed — on a pane that is simultaneously trying to keep the live pick
centred. `grid-auto-rows` states it once; `grid-template-rows: auto` leaves the
header sizing to itself.

**140 headshots cost one request each and nothing per render.** Measured:
`renderBoard()` goes 5.3ms to 15.2ms and the whole `render()` 34ms to 41ms,
once per pick — and across ~90 rebuilds the browser made exactly 140 requests,
because the DOM churn re-uses the cache. The board being rebuilt from scratch
on every change is not a reason to fear images on it.

**Centring the empty cells was not cosmetic tidying.** They were pinned to the
top, which was 6px above and 25 below at 42px and became 6 above and 41 below
at 58. Nobody would have called the old one wrong; the new one read as a number
that had slipped its box.

## Contrast

Every one of these was found in a single sweep, and none of them announced
itself. The app looked fine throughout. **The bar is 4.5:1 for anything
under 24px — or under 18.66px bold — which is very nearly all of it**, and
a sweep that uses 18px, or 14px bold, is measuring a rule that does not
exist and will pass things that fail.

**`--ink-light` is pinned by `--fill`, not by taste.** It is the tertiary
tone, used 58 times, almost always at `--fs-2xs` or `--fs-xs`. It missed on
every surface it lands on: 4.43 on `--sunken`, 4.18 on `--card`, 3.83 on
`--well`, 3.54 on `--fill` — and the light theme, which nobody had checked,
bottomed out at **2.31**. 122 elements across the two.

**Fixing the tertiary tone forced the secondary along with it.** In light,
`--ink-light` has to reach `#5E6A76` to clear `--fill`, and `--ink-mid` was
sitting at `#5A6875` — 4.83 against 5.00. Two tones 0.17 apart is one tone
with two names, so `--ink-mid` moved to `#4C5763`. **The ramp is set from
the bottom in both themes**: the tertiary is whatever the worst surface
allows, and the secondary is placed above it. Body text getting darker in
light is the side effect and it is the right one.

`--fill-hi` looks like a fifth failing surface at 3.02 and is not: every
rule that hovers to it either sets `--ink` or starts from `--ink-mid`,
which clears it at 5.30. Check what a token is actually paired with before
solving for it.

**Four of the six position solids failed under the white text they are
documented as always carrying.** TE 2.68, WR 3.12, QB 3.96, RB 3.97 — 80
elements — with only K (4.52) and DST (4.86) passing. They are darkened by
lightness alone, hue and saturation held, so the board colour-codes exactly
as it did: the closest pair is RB/DST and it separates by 25 in CIE76
against a just-noticeable threshold near 2.3. TE moved most, by 19.

**So four of these are no longer the values sampled off the logo artwork,
and that is not a drift to correct.** Five seat colours were the same hex
and carried the same fault; they took the same values. **A seventh position
or a ninth seat needs white checked against it before it is added.**

**Every stop in a gradient must clear white on its own.** `--hdr-cyan` was
`#12A3DC` — 2.88, the worst in the app — under a header carrying a 16px
headline, a 12px pick line and a 10px label. It sits at 130%, so it is
never fully painted, and it is tempting to check only the colour the box
actually reaches. **Do not tie the requirement to a stop percentage**: move
the stop later and the contrast silently breaks. With every stop passing,
any interpolation between them passes too.

**Translucent white on a saturated surface is a false economy.** The header
labels were `rgba(255,255,255,.82)` and `.68`, measuring 2.95 and **2.48** —
the worst contrast on the screen somebody stares at while their own clock
runs down. At a 4.6 backdrop the minimum workable alpha is **0.98**, and
even a solid `#F2F6F9` only reaches 4.27. There is no opacity that reads as
secondary and stays legible; the choice is not a real one. Hierarchy on a
strong colour comes from size and weight.

**And `opacity` is a third way to lie about a colour, after alpha and
gradients.** The board card's `POS · TEAM` line carried `opacity: .85` for as
long as the board has existed, measuring 3.74 (QB), 3.79 (RB), 3.82 (WR and
TE), 3.81 (K) and 4.02 (DST) — all six under the bar, on every card on screen.
It survived every sweep this project has run, including the one that caught the
header labels above, because a walker reading `color` sees `#fff` and reports
4.62: the opacity is a property on the *element*, not a channel in the colour,
so it never appears in the value being measured.

The solids are darkened to put white at exactly 4.6, which is the other half of
it — there is no margin to spend, so *any* translucency takes them under.
**A sweep has to composite `opacity` against the backdrop the same way it
composites alpha**, and `tests/board-card.spec.mjs` now does.

**A disabled control is exempt, which is how a regression hid in one.**
`.primary:disabled` was white on `--ink-light` at 3.88. Lightening
`--ink-light` to clear its own bar dropped that to **2.83**, and no sweep
would ever have caught it, because WCAG excuses inactive controls. It is
muted text on a muted fill now. **Fixing a token can degrade something the
rules do not check** — when a token moves, look at what else names it.

**Sweep with the real backdrop, or the answer is noise in both
directions.** A walker that reads `backgroundColor` cannot see a gradient:
on `.appbar.my-turn` it falls through to `--card` and reports white-on-white
at 1.07, which is not a failure, and on the navy band it reported the hero
slogan at 4.30 when the slogan actually sits over the flat `--navy-deep`
region and measures 5.15. **Both a false alarm and a real miss came out of
the same shortcut.** Composite the alpha, and interpolate the gradient at
the element's own position.

## Security

The zone is set beyond Cloudflare's defaults, and the defaults were not
good enough:

- **SSL/TLS is Full (Strict)**, not Full. Full encrypts to the origin but
  validates nothing, so anything that can answer as GitHub Pages is
  accepted — Cloudflare's own warning says so.
- **Minimum TLS is 1.2.** The default is 1.0. Measured before changing it:
  1,680 requests on 1.3, 92 on 1.2, none below.
- **HSTS**, six months, no `includeSubDomains`, no preload. Preload is
  months to exit, so it is a decision for when there is something to lose.
- **A "Security headers" Transform Rule** sets `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` and the CSP. `X-Content-Type-Options`
  comes from the No-Sniff toggle in the HSTS dialog instead. GitHub Pages
  cannot set headers at all, so Cloudflare is the only place these can live.

**The CSP is enforced. Of Cloudflare's own two injections, one is allowed by
name and the other is blocked on purpose.** Driving the whole app against the
policy — player photos from sleepercdn, the ESPN scoreboard, the worker over
https and wss, a GIPHY image — produces zero violations, and always did. What
kept the policy report-only was Cloudflare injecting script into our pages,
and the two it injects end differently because they are different kinds of
script:

- **The Web Analytics beacon is an ordinary external script,** so the host
  goes in `script-src`. Allow `https://static.cloudflareinsights.com`, the
  bare host — **not the path Cloudflare's own docs give you.** The real `src`
  is `beacon.min.js/v4513226c…`, a version segment *after* the filename, and
  a CSP source whose path does not end in `/` has to match exactly, so
  `…/beacon.min.js` matches nothing at all. The beacon reports to
  `/cdn-cgi/rum` on our own domain, which `connect-src 'self'` already
  covers; the `cloudflareinsights.com` connect host in the docs is for sites
  that embed the beacon by hand.
- **The bot-detection script is inline,** so no host can allow it, and it
  cannot be hashed either: the body carries `r:'<cf-ray>'`, unique per
  request, so the hash the console helpfully offers is stale before you can
  paste it. It has no nonce for the reason below. So it is **blocked, on
  purpose**, and the only cost is console noise wherever a browser reports it.
  Nothing else: the script never runs, `window.__CF$cv$params` is undefined
  after load, and no part of the app has ever depended on it. The alternative
  was `'unsafe-inline'` in `script-src`, which would hand any injected chat
  message the run of the page — the single thing this file is most arranged to
  prevent. A line in a console nobody but us opens is a much smaller price.

**The blocked script is doing nothing anyway, and that took two toggles to
establish.** Bot Fight Mode is **off** and JavaScript Detections is **off**,
both under Security → Bots — and the injection continues regardless. Turning
off JavaScript Detections alone changes nothing, because Cloudflare's own docs
say "for Bot Fight Mode customers, JavaScript Detections is automatically
enabled and cannot be disabled". Turning Bot Fight Mode off as well should
have ended it, and did not: the free plan is currently injecting the script
with both switches off and the card still reporting "JS Detections: On". That
is a Cloudflare bug with open community reports, not a setting anybody missed.
So the script we block is a leftover of a feature that is switched off. When
Cloudflare fixes it the two console errors disappear on their own, and nothing
here needs changing.

**A nonce cannot rescue that, and the reason is circular.** It looks like it
should work, and the usual objection does not apply here: a nonce normally has
to reach the script tags too and a Transform Rule cannot touch the body, but
every script on our pages is an external `src` from `'self'` and wants no
nonce, so the header would be the whole job. Cloudflare does parse the CSP it
is about to send and stamp the value onto its own injections. It was tried, as
a dynamic header value, and `uuidv4(cf.random_seed)` did produce a fresh nonce
per request:

```
concat("… script-src 'self' 'nonce-", uuidv4(cf.random_seed), "' https://static.cloudflareinsights.com; …")
```

The injected `<script>` came back with no `nonce` attribute on it at all. Bot
detection injects **before** response-header Transform Rules run, so there was
no header yet to read a nonce out of. Cloudflare's propagation works on a CSP
the *origin* sent — and our origin is GitHub Pages, which cannot send headers,
which is the whole reason the CSP is a Transform Rule. A `<meta>` CSP is not a
way out either: Cloudflare documents JavaScript Detections as unsupported with
nonces set that way.

**Change the value before you change the header name.** Put a new value on
`Content-Security-Policy-Report-Only` first and reload: an empty console is
the only evidence worth having. Only then rename the header. Enforcing first
and reading the console afterwards learns the same fact far too late — and
this is exactly how the nonce turned out to be worthless, cheaply, instead of
expensively.

**Keep it enforceable.** No inline `<script>`, no `onerror=` or other inline
handlers — that is why the theme switch is `theme.js`, why avatars use
`data-drop-on-error` and a captured listener, and why back-to-top takes
`data-auto` instead of a one-line call. `style-src` does allow
`'unsafe-inline'`, because inline `style` attributes are everywhere and style
injection is a far smaller problem than script injection.

**The worker refuses, it does not just withhold.** CORS headers tell a
browser whether to let a page read a response and do nothing about the
request being made — `curl` with a made-up Origin drank the GIPHY quota
happily. `originAllowed()` returns 403 before the key is touched. Forty
actions per socket per ten seconds are allowed, which is far above a real
draft and far below a script; a flood is refused, never disconnected,
because a client with a runaway loop should lose the message and not the
draft. Limiting *room creation* is not done and belongs on the edge, not in
the room.

**Never sort `board` in place.** `DraftEngine.jitter()` reads a player's
position in it, so the order of that array is an input to what every CPU
does — and in a room, every client has to agree on it. Sorting it to draw a
table would change the draft, and change it differently depending on which
column somebody clicked. `sortedPlayers()` sorts a copy, and the filter
before it already returns one.

**A missing number is not a small number, and sorting is where that bites.**
Ascending "rushing yards" must not open with two hundred players who have no
rushing projection at all. Blanks go last in both directions.

**Sleeper shows a TAR column their own projections do not fill** — it reads
0 for every player, Bijan and Ja'Marr included. We show REC instead, which
is projected, is what PPR actually scores, and is a number rather than a
zero. Copy the layout, not the gap in it.

**`display: flex` on a `<td>` stops it being a table cell.** It no longer
stretches to the height of its row and sizes to its own content, so its
bottom border lands above everybody else's — a step in the divider starting
exactly where that column does. This was `.rowacts` for months. Lay a cell's
contents out with inline-block, or wrap them in a div and flex that.

**A sticky table cell needs `border-collapse: separate`, and no
`overflow: hidden` on the table.** With collapsed borders Chrome accepts the
rule — the computed style says `sticky` — and scrolls the cell away anyway,
because the table owns the borders. `overflow: hidden` (there to clip a
corner radius) makes the table its own scroll container, so the cell sticks
to the table rather than to `.tblscroll`. The player grid overrides both.
Collapse also overrides an explicit cell width, which is how the pinned name
column ended up offset against a rank column that was not the width it had
been told to be.

**`offsetTop` is not a distance to the scroller.** It is the distance to the
nearest *positioned* ancestor, and nothing between a board cell and
`#boardScroll` is positioned — so `scrollBoardToLive()` was reading a figure
measured from `<body>`, 207px too large. One mistake, two symptoms that
looked unrelated: the board sat about four rounds past the live pick, because
207px is roughly four rows; and it twitched on every CPU pick, because
anything above the board changing height — the ticker arriving, the header
turning blue for your turn — moves the board down the page, which moved a
number that was never supposed to be about the page. Both went away by
measuring `getBoundingClientRect()` against the scroller's own rect. Do not
"fix" this by adding `position: relative` to the scroller; that makes
`offsetTop` correct today and silently wrong again the next time someone
changes positioning.

**Do not re-ask for a scroll you are already at.** `render()` rebuilds the
board on every change, and `scrollTo({behavior:"smooth"})` starts an
animation whether or not the target moved. During a run of CPU picks that is
a new animation every few hundred milliseconds. `scrollBoardToLive()` returns
early when the target is within 4px of where it already is, which is what
takes the board from "moves constantly" to "moves once per round".

**`:last-of-type` counts element types, not classes.** Every child of the
board grid is a `div`, so `.cell.mine:last-of-type` matches the last cell on
the board and only helps when the bottom-right chair happens to be yours. For
"the last one matching this class", use `querySelectorAll` and take the end.

**`scrollBy({behavior})` beats the stylesheet.** A `prefers-reduced-motion`
rule on the container does not apply to a programmatic scroll that asks for
`smooth`, so the score arrows check the media query themselves.

**Inline SVG needs explicit `width` and `height` attributes**, not just CSS.
A cached stylesheet once let the logo expand to fill the entire screen.

## Testing

- Room over sockets: `cd worker && wrangler dev --port 8787 --local`, then
  `node worker/test-sockets.mjs` in another terminal. Seventy-six assertions
  against the real Durable Object runtime, no Cloudflare account needed.
  This is the only thing that covers sockets, storage, the alarm and the
  messages that never reach storage at all — typing is relayed, so a suite
  that only inspects state cannot see it. The room logic itself is pure and
  covered below. `npx --yes wrangler@4 dev …` works if wrangler is not
  installed globally and leaves nothing in the repo.

  **It is also the only thing that checks the adapter passes the sender
  through.** `test_engine.py` proves `Room.pause()` refuses a guest, and that
  proof is worthless if the worker calls it without a member — which is
  exactly what it did, undetected, for as long as `pause` existed. A host
  check the adapter never gives a member to is not a check, so the host-only
  messages are asserted here, over a socket, and not only against the pure
  room. Anything gated on *who sent it* belongs in both suites.

  Run it against production after a deploy, too:
  `JUKE_WORKER=wss://juke-draft-room.jukeff.workers.dev node worker/test-sockets.mjs`.
- Engine: `py scripts/test_engine.py` — runs `draft-engine.js` and `room.js`
  outside a browser and asserts the snake maths, the turn order, the legality
  checks, the determinism of the CPU wobble, and the parts of a room that a
  person types into: name cleaning, renaming, reaction privacy and the two
  bounds on the chat log. It needs node, deno or bun on PATH
  and says so plainly if none is there rather than looking like a failure.
  Node is installed user-scope via winget, so a new terminal sees it and an
  already-open one does not.
- Crosswalk: `python scripts/test_crosswalk.py` — the source-id join against a
  handful of players, including two Josh Allens, a collision and a player
  neither side shares. Needs nothing but the standard library.
- Pipeline: `python scripts/build_players.py` — prints counts and writes the
  generated files. Check `unmatched.txt` afterwards. **`TANK01_KEY` in the
  environment is optional**: without it the crosswalk is skipped, the build is
  otherwise identical, and news stays off. On Windows run it as
  `py scripts/build_players.py`. A bare `python` reaches the Microsoft Store
  stub and fails with "Python was not found" unless the installer's
  "Add python.exe to PATH" box was ticked, which it usually isn't.
- App: open `index.html` directly in a browser. `file://` works because the
  data files load via `<script src>` rather than fetch.
- **In a headless or hidden browser, disable transitions before you measure
  a colour.** A pane that is not compositing produces no frames, so a CSS
  transition never advances — it sits frozen at its starting value, and
  `getComputedStyle` reports that old value indefinitely. It does not look
  like an artifact. It looks like a bug, with a plausible cause.

  It manufactured two in one session. `.room` has `transition: border-color`,
  so removing the `live` class left the border reading orange forever and
  looked like a specificity problem. `.appbar` has `transition: color`, so
  the my-turn header reported `--ink` rather than `#fff` and a rule was
  nearly added to "fix" a headline that was already white.

  `document.head.appendChild` a `* { transition: none !important }` style,
  measure, then remove it. And note that `requestAnimationFrame` never fires
  in such a pane either, so anything awaiting one hangs until the tool times
  out — `setTimeout` still works.

  The same pane cannot take screenshots, which is worth saying plainly:
  **everything above can be verified this way and none of it is a substitute
  for looking.** A grade can be correct and unbelievable; so can a colour.
- **Point the same suite at what is deployed, after deploying it.**

  ```bash
  JUKE_SITE=https://jukeff.com \
  JUKE_WORKER_HTTP=https://juke-draft-room.jukeff.workers.dev \
  npx playwright test tests/room.spec.mjs
  ```

  The socket suite has had `JUKE_WORKER` since it was written and this one had
  no equivalent, so the one thing nobody could run was the one thing worth
  running after a deploy: a full room draft against the real worker, over the
  real CSP, through Cloudflare. **Local is where a bug is found; live is where
  it is confirmed gone**, and they are not the same claim — the room deadlock
  at pick 86 was a rate limit that localhost is too fast to reach.

  The two variables move together. `live.js` picks its worker off the address
  bar — localhost means `127.0.0.1:8787`, anything else means the deployed one
  — so pointing the page at production while the assertions watch a local
  worker tests two rooms and reconciles neither. `webServer` is skipped
  entirely when the site is not local, because waiting on a port nobody will
  listen on times the run out before it starts.

  `SITE` and `WORKER_HTTP` live in `tests/helpers.mjs` and are re-exported by
  `playwright.config.mjs`. They used to be declared in both, which is the same
  fact in two places and would have failed as a suite quietly testing a server
  nobody was running.

- **End to end: `npm install` once, then `npx playwright test`.** Forty-seven
  tests, about fifteen minutes, and it starts the static server and `wrangler dev`
  itself. It drives the real pages in a real browser — a solo draft at both
  shapes, a full two-manager room draft to completion, a dropped socket
  reconnecting, leaving and rejoining, the phone layout, what the player sheet
  says about the Juke score, that every club's colour is drawn where no text
  can land on it, that a news payload cannot put script in the page, and that
  the positions we refuse to rank are refused consistently.

  **The static server is `py` on Windows and `python3` everywhere else**, picked
  in `playwright.config.mjs` from `process.platform`. It was `py` outright,
  which is the Windows launcher and exists nowhere else, so on Linux or macOS
  the whole suite died with "py: not found" before a single test ran — a
  failure that looks like a broken harness rather than a missing interpreter.

  It is the only tool here that is not plain Python or plain JavaScript, and
  it earns that: everything it covers lives in the browser, so neither
  existing suite can reach any of it. `package.json` exists for this and
  nothing else — **the app still has no build step and no dependency**, and
  nothing under `node_modules/` is served, imported or needed to run the site.

  Three things about it worth knowing before changing it:

  - **A manager is a browser context, not a tab.** Contexts have their own
    `localStorage`, so their own `juke.member`. Two tabs share one id and the
    room is right to treat them as one person with two sockets.
  - **`state` is a top-level `const`, so it is not on `window`.** Waiting for
    `window.state` waits forever on a page that is working perfectly; refer to
    it unqualified, as the app's own code does.
  - **A test that changes the league has to open the League box first.**
    `page.selectOption` waits for the control to be visible and the setup
    controls sit inside a collapsed `<details>` now, so eight tests went red
    on `#teamCount` until `openLeagueBox()` went in front of them. That is
    the real journey, not a workaround — a person opens it too.

    `page.evaluate` does not care: `runSoloDraft` sets values through the
    DOM and `createRoom` calls `.click()` directly, so both still work on a
    control nobody can see. Which is worth knowing in both directions —
    it is also why a harness can pass a screen a person cannot use.

  When adding a test, check it fails against the bug it is meant to catch —
  put the bug back for one run. Every test in there was written against a real
  failure and confirmed to go red without the fix.

  **And disable the HTTP cache while you do it, or the answer is noise.**
  `app.js?v=` is a fixed address between deploys, which is the whole point of
  it — but a bug-back run edits `app.js` without touching the version, so the
  browser is entitled to serve the body it already has. Five mutations in a row
  came back failing all six tests, including tests the mutation could not
  possibly reach, and every one of those runs was measuring some mixture of the
  patched file and the cached one. It does not look like a caching problem; it
  looks like a suite with no discrimination at all.

  Launch with `--disable-application-cache --disk-cache-size=1` and set
  `Cache-Control: no-cache` on the context. Done that way each mutation flips
  exactly the property its own test asserts and nothing else, which is the
  result that means something. Same trap as the deploy note in the caching
  section, reached from the other direction.

- **A room draft has to be run to the end, with two clients, before anything
  touching a room is believed.** Solo drafts have been driven to completion
  since the beginning and a shared one never had been — which is how a room
  that deadlocks at pick 86 shipped, and why it took an unattended full draft
  rather than a bug report to find it. The two members need **two origins**:
  `localhost:8765` and `127.0.0.1:8765` have separate `localStorage` and so
  separate member ids, where two tabs on one origin are correctly treated as
  one manager with two sockets. Assert at the end:

  - 140 picks, 140 distinct players, 14 a team, snake order intact;
  - **no rejections on either socket.** This is the one that matters. Wrap
    `Live.pick`/`Live.autoPick` and listen for `type: "rejected"` — a room
    can be rejecting half of what a client sends and look perfectly healthy
    right up until it stops;
  - **the sum of what each client sent equals the picks on the board**, with
    every client's own-seat count matching its own picks. That single line is
    what proves nobody drafted for anybody else;
  - the gaps between picks. A median under 100ms is not a fast draft, it is
    a client in a loop, and it will find the rate limiter.

  Drive the second client from its **socket messages, not a timer**: a hidden
  tab has its timers throttled to about once a minute, and that is the
  harness stalling, not the app.

- Before claiming a change works, run a full simulated draft and confirm
  140 picks, no duplicate players, 14 per team, no kicker before round 13.
  Then run one at a different shape — 12 teams, 15 rounds, full PPR, **bench
  6** — and confirm 180 picks, 15 per team, one QB each and no kicker before
  round 14.

  The bench matters and this file used to leave it out. The default lineup is
  eight starters plus a FLEX plus five bench, which is fourteen roster spots,
  so fifteen rounds would draft a fifteenth player with nowhere to put him.
  `setupProblem()` catches it and the Start button refuses — correctly, and
  for several sessions this instruction quietly described a league the app
  will not run.

  **Drive it through the Start button, and assert `state.started` afterwards.**
  Calling `autoDraftRest()` straight from the console drafts a full board
  whether or not a draft was ever started, so a harness that skips the button
  will happily "pass" a configuration the app rejects — which is exactly how
  the missing bench went unnoticed. The picks it produces are real; the run
  is not.

  If the console reports an error naming something the source no longer
  contains, you are looking at a cached `app.js`, not a real failure. Hard
  reload, or serve the folder over `python -m http.server` and use that.

- Grade: after any change to `analyseTeam()`, count the distinct values each
  component takes across the room, not just your own card. Three of the four
  were broken at once and every one of them still rendered a plausible bar on
  a plausible-looking grade — the tell was in the spread, where roster
  construction was the same number for all ten teams. Reconcile a total
  against its own parts too; both are two lines in the console:

  ```js
  const all = analyseDraft(), w = WEIGHTS;
  ["startersScaled","valueScaled","buildScaled","byePenaltyScaled"]
    .forEach(k => console.log(k, new Set(all.map(t => Math.round(t[k]))).size));
  console.log("totals reconcile", all.every(t => Math.abs(
    t.startersScaled*w.starters + t.valueScaled*w.value +
    t.buildScaled*w.build + t.byePenaltyScaled*w.byes - t.total) < 1e-9));
  ```

  And run one draft at more than fourteen teams. The grade scale is fourteen
  long, the team count goes to twenty-four, and that is a shape nothing else
  in the routine covers.

  Then read the panel and check it against those numbers, because the snippet
  above cannot see the whole class of bug where the arithmetic is right and
  the screen is wrong. The standings printed starter strength for months in a
  table sorted by the weighted total, and every check that only looks at
  computed values passes that happily. Scrape the table and compare:

  ```js
  const all = analyseDraft();
  const shown = [...document.querySelectorAll("table.standings tr")]
    .map(tr => [...tr.children].map(td => td.textContent.trim()));
  console.log("standings match totals", shown.every(r =>
    +r[2] === Math.round(all.find(t => t.rank === +r[0]).total)));
  console.log("column descends", shown.map(r => +r[2])
    .every((v, i, a) => i === 0 || v <= a[i - 1]));
  ```

  Do all of that **twice**: once on the finished board and once about three
  rounds in. Everything in the grade section had only ever been checked on a
  completed draft, which is how a bar reading `-8 / 100` survived — mid-draft
  is where a component written for a finished roster behaves least like
  itself. `autoDraftRest()` gets you the end state; for the middle, step the
  clock forward by hand:

  ```js
  let g = 0;
  while (state.picks.length < 25 && g++ < 60) {
    const c = onTheClock();
    makePick(cpuChoice(c.slot, c.round));
  }
  render();
  ```

  And if you sweep the rendered text for `NaN`, match it case-sensitively.
  `/nan/i` hits the running back **Monangai**, which cost a few minutes
  chasing a bug that was a regex.

  **Run a superflex draft as well.** The two shapes above are the only ones
  the routine covers, and the whole grade had been checked against nothing
  else — which is how a component that pays teams to misbuild a superflex
  roster survived. Superflex is `SFLEX 1` and one extra round, two clicks
  from the default. The thing to assert is that holding what the format
  requires costs nothing, and that giving it up does not help:

  ```js
  const s = 0, saved = state.picks.slice(), before = analyseTeam(s).build;
  const qbs = state.picks.filter(p => p.slot === s && p.player.pos === "QB")
    .sort((a, b) => a.player.posRank - b.player.posRank);
  const spare = board.find(p => p.pos === "WR" && !p.drafted);
  state.picks = state.picks.map(p => p === qbs[1] ? { ...p, player: spare } : p);
  console.log("breaking it helps?", analyseTeam(s).build > before);  // must be false
  state.picks = saved;
  ```

  Any league setting that changes what a roster is allowed to hold deserves
  the same treatment. A grade that rewards a worse roster is worse than no
  grade, and it will not show up in a spread or a reconciliation.

## Don't

- Don't add a framework, bundler, or npm dependency.
- Don't scrape or republish expert rankings, news articles or analyst
  commentary. That content belongs to the sites that produce it.
- Don't commit secrets. There are none in this project and there shouldn't be.
  This gets harder, not easier, once there is a backend: a GIPHY key in
  client-side JavaScript is public, so it proxies through the server.

## Multi-user drafting

This file used to say don't. The owner has decided otherwise, so the rule is
replaced by the terms it happens on.

**Solo mock drafts stay exactly as they are.** Static, no backend, opening
from `file://`, working offline, free to run. Multiplayer is a *mode*, not a
conversion, and the fallback stays a complete product rather than a degraded
one. Anything that makes a solo draft depend on a server is out.

**The rules live in `draft-engine.js` and only there.** With one drafter the
browser deciding what is legal is fine, because there is nobody to disagree
with. With ten people the server has to decide, and the server and every
client have to reach the same verdict, or two managers take the same player
milliseconds apart and the room forks. That is why the engine has no DOM, no
globals and no imports: so both sides can run the identical file.

**The host's browser is the CPU.** The worker has no board — a megabyte of
generated data — so the opinion for an empty chair is worked out where the
board already is and submitted as a normal pick. `Room.hostPick()` still
checks it really is the host and really an auto seat, so authority stays on
the server while the knowledge stays on the client. The cost: CPU seats stall
if the host closes the tab. Visible rather than silent, and better than
shipping the board to a Durable Object.

**In a room the browser stops deciding.** `draftAndAdvance()` sends the intent
and returns; the board only moves when the room broadcasts. The local clock
and the CPU animation loop both switch off, because a second timer counting
locally disagrees with the room within seconds.

**The CPU wobble is arithmetic, not randomness,** for the same reason —
`DraftEngine.jitter()` must give every participant the same answer. It reads
a player's board position, so a room has to pin the data version it started
with. The files are rebuilt nightly and a mid-draft change would drift the
boards apart.

### "The browser stops deciding" has to be applied everywhere, not once

The rule above was written for `draftAndAdvance()` and applied to
`draftAndAdvance()`. Three other places went on deciding, and each one was a
bug somebody hit in a real draft with a real friend on the other phone.

**`autoDraftRest()` drafted the whole board.** Solo that is exactly right —
"the rest" is nine CPUs and nobody minds. In a room "the rest" is other
people's teams, and it filled all ten of them, locally, so the host was
looking at a completed draft the room had never heard of. In a room it is now
an autopilot on your own chair: one pick per turn, submitted through the same
door as any other pick, everybody else untouched. The label was half the bug
— "Auto-draft the rest" is a promise the app cannot keep in a room — so it
reads "Auto-draft my picks" there, and toggles off.

**`goHome()` cleared the local draft and stayed in the room.** The next
broadcast put the draft straight back and `enterDraftUI()` returned you to
it, at the room's real position. Pressing "New mock draft" and landing back in
the old one is not a stale screen; it is the app refusing to leave. Leaving
the draft screen now leaves the room — a real departure, chair to the CPU,
exactly as closing the tab has always been — and it is recoverable because
rejoining reclaims the seat.

**An invite code arriving without a page load did nothing.** Joining happened
once, at startup, which covers a link opened into a fresh tab and nothing
else. A tab already on the site only changes its hash. That became reachable
the moment leaving a room started clearing the code out of the address: the
way back in is the link, and the link was the case that did not work.
`hashchange` now joins when the code differs from the one we are in.

### Joining a room means taking all of its league, not part of it

`adoptRoom()` compared one field:

```js
if (room.league && room.league.teams !== league.teams) { ... }
```

Ten teams either side and it adopted nothing — so a joiner kept their own
rounds, lineup, bench, clock and **scoring**, and scoring is not a preference.
It picks the ADP set, and the sets are not the same people: **standard 207,
half 221, full PPR 260**. A half-PPR joiner in a full-PPR room therefore had a
board missing 39 of the players that room could legally draft, defenses and
kickers among them.

Every one of those picks arrived at `board.find(p => p.name === rp.key)`,
missed, and hit `if (!player) return;` — dropped without a word. That is four
separate symptoms from one line:

- **a CPU seat that appears to skip its turn**, which is a blank cell where a
  pick should be, reported from a real draft as exactly that;
- **a draft that can never finish on that screen.** 139 of 140 means
  `draftOver()` stays false forever, so the Analysis tab sits on "Grade so
  far — 3 of 10" for a draft the room completed minutes ago;
- **a full board rebuild on every broadcast**, chat messages included, because
  `state.picks.length !== room.picks.length` can no longer ever be false;
- **a setup screen still describing the last room you made**, which is what it
  felt like from the outside and has nothing obviously to do with any of the
  above.

The league is adopted whole now, `sameLeague()` compares the keys the *room*
sent rather than ours — comparing ours means an older room missing a key
reports a difference adopting can never close, and rebuilds forever — and a
key that still does not resolve says so in the console instead of leaving a
hole for somebody to find in the last round.

**A silent `return` on unresolvable data is how a wrong board looks right.**
Nothing about that draft appeared broken until the very end.

### Everything the room decides has to be locked, not just the five obvious ones

`LOCKABLE` named five controls. A league is far more than five, and the
starting lineup, the bench and all thirty-eight scoring rules were left open to
anybody in the room — each of them wired to `refreshSetup()` → `readSetup()` →
`buildBoard()`. So a guest could rebuild their own board out from under the
draft they were in, and nothing on screen said so: their replacement levels,
suggestions and grade simply stopped describing everybody else's draft, and
`adoptRoom()` cannot put it back, because a room only ever broadcasts the
league it was created with.

Locked for the **host** too. The wobble reads board position and every client
has to agree, so the shape is fixed the moment the room exists. Changing it
means a new room.

The scoring editor is locked by sweeping `#scoringFields` rather than by name,
and `renderScoringFields()` re-applies it — those inputs are new elements every
time it runs, so a lock set on the previous set has already been thrown away.

**A control that cannot act must not merely fail; it must not be offered.**
Pause, Undo and "Discard draft" were all on screen for everybody in a room and
all three were the browser deciding:

- **Pause was a local flag that sent nothing.** The room went on counting and
  handed the seat to the CPU while the header read "Paused". It is a message
  now, and `Room.pause()` has the host check it never had — nothing had caught
  that, because no client had ever sent the message.
- **Undo rolled picks off the local copy** and the next broadcast put them
  back. There is no shared undo and there should not be one. It is hidden in a
  room.
- **"Discard draft" discarded nobody's draft.** What it did was walk you out
  of the room, so it says "Leave the room" there. The label was the bug.

### A clock everyone is waiting on has to be a clock everyone can see

`clockRunnable()` answered two questions with one condition, and one of them
was wrong. "Should this browser be counting" is only ever your own turn in a
solo draft — running out of it drafts for you. "Is there a countdown worth
drawing" is true for the whole room on anybody's turn, and the page was using
the first to answer the second. Nine managers out of ten watched a clock they
could not see, in both places it is drawn: the header and the live board cell.

`clockShowing()` is now the display question and `clockRunnable()` stays the
authority question. In a room the countdown is **painted, never counted**:
`startRoomTicking()` walks the last `msLeft` down between broadcasts — which
arrive on picks and messages, not once a second, so a clock drawn only from
those sits still for a minute and then jumps — and it never drafts. Running out
is the room's business.

`resetClock()` asks `hasRoom()` rather than `inRoom()`, because a dropped
socket is still a room and a browser answering "no" would start counting on its
own and draft for a seat it no longer speaks for.

### Following the live pick is a default, not a rule

`render()` rebuilds the board on every change — one per CPU pick — and
`scrollBoardToLive()` re-centred every time without asking where the reader had
put it. So scrolling up to look at round one during a run of CPU picks was
impossible: measured at round 12, somebody at the top of the board was pulled
back to 316px two or three times a second, for as long as they kept trying.

`boardFollow` holds it. **The `scroll` event cannot be what frees it** — a
smooth programmatic scroll fires a stream of them and the board would free
itself on its own animation — so it listens for `wheel`, `touchstart`,
`pointerdown` and `keydown`, which only a person produces. It resumes on its
own when the reader scrolls back to the live pick, which needs no separate
gesture to mean "done looking", and your own turn takes the lead back **once**
rather than continuously, or scrolling during your own pick would be undone as
briskly as during anybody else's.

### Hiding a thing is not the same as putting it away

`.draftshell > .chatslot:not(:empty)` claims a 330px column, and `:empty` is
about child *nodes* — a slot holding a dock with `hidden` on it is not empty.
`renderChat()` hid the dock when there was no room and left it where it was, so
leaving a room and starting a solo draft in the same tab kept the whole column:
**330px of nothing beside the board, and the board down from 1391px to 1061px
to pay for it.** `placeChat()` parks it back outside the grid now.

Same family as "an author `display` beats `[hidden]`", and the same lesson:
`hidden` is a rendering hint, and layout questions are answered by where a node
actually is.

### A shared board is a board nine other people are reading

The Value and Reach chips are the app reading the board for you before you
commit, which is right in a solo mock and is scouting for the entire room in a
shared one. In a room they come off the Players tab and are said in the ticker
after the pick instead — to the one manager who has already made the decision.
`marketChip()` is the single renderer for both, so the two can't drift.

### Blue text is a promise too

The rail's bench row ended in `<span class="rtm">My Team</span>`, coloured
`--link`, sitting at the end of the one row whose entire job is to say *there
are players here I am not showing you*. Nothing listened to it. It had never
been clickable on any screen the app has, and it was reported from the
installed desktop app only because that is where somebody sat down and tried.

**Nothing about it looked wrong, because looking right was the whole defect.**
A dead control is invisible to every check this project runs: it renders, it
contrasts, it does not overflow, no console error, no failing assertion. The
only thing that finds it is pressing it.

It is a `<button>` now, delegated — `renderRail()` rebuilds that row on every
pick, so a listener attached to the element would be discarded seconds after it
was set.

**And it could not have worked without `goToTab()` existing first.** Switching
tabs was three lines inside the tab strip's own click handler, so the only
thing in the app able to change tabs was the tab strip; anything else had to
write "which tab is on" down a second time. That is why the row got a colour
and no behaviour — the behaviour had nowhere to come from. A control that
cannot reach the thing it names is a design problem before it is a bug, and
the fix is to give the destination a name, not to copy the three lines.

Setting the panel without the strip is its own small lie: the app is then on a
tab its own nav says it is not. `goToTab()` does both, and the test asserts
both.

### A fraction is a promise about its denominator

The position filter doubles as the roster-need display, and it printed
`have/starters` in every state with the count turning `--good` once the
starting slot was filled. At tight end that is a green **"1/1"** the moment you
take one — a success colour on a fraction that reads as a ceiling — when
`maxAt("TE")` is 3 and a backup tight end is an ordinary pick.

It was reported from a real draft as *the app would not let me take a second
one*, and the app had let him take anything he liked: the Draft button on an
available tight end is disabled only when the clock is not yours, there were
nineteen on the board at the time, and `suggestions()` had simply not offered
one in its top six. **Nothing was broken except the sentence the screen was
saying.** That is the same failure as a kicker being named the biggest reach —
a correct number that no reader can arrive at the right conclusion from.

So the denominator is only drawn while it is still owed. A requirement you have
met is discharged, and continuing to print it as a fraction invents a limit
that does not exist; what replaces it is the count alone, in the muted tone,
until the position is genuinely full. **The stylesheet had already written the
rule, one line above the rule that broke it** — "a filled slot is the normal
case and does not need to shout about itself" — which is worth noticing,
because a comment contradicting the declaration underneath it is a bug someone
has already half-found.

**`atPositionCap()` asks `needMultiplier()` rather than answering again.** The
cap is not one rule: `maxAt()` for the skill positions, the starting
requirement for a kicker or a defense, `starters.QB + superflex` for a
quarterback. Writing that down a second time is precisely how the superflex bug
happened. The last round is passed in so the K and DST *timing* gates do not
fire — this is a question about a roster, not about when a kicker becomes
legal.

And when a test asks "was it my turn", **read it before the test stuffs the
roster, not after.** Pushing picks straight into `state.picks` to reach a cap
moves whose turn it is, so an answer collected at the end of the block is about
the board the harness built rather than the one it drove. That cost a red run
on a test whose subject was fine.

### A filter is a lens, never a decision

`suggestions()` is filtered by the position chip on the panel, and
`autoPickForMe()` read that list. So a manager looking at tight ends who
already held their three got an empty list — and "Auto-draft the rest" read
empty as *there is nothing left to draft* and abandoned the remaining rounds
without a word. Reported from a real draft: eleventh of twelve, stopped in the
ninth round of fourteen.

**`autoPickForMe()` now takes `suggestions("ALL")`, never the filtered list.**
Consulting the chip first and falling back looked like the respectful version
and is worse: leave the panel on K, walk away, and the clock hands you a
kicker in the fifth round. That was caught by the test written for the bug
above — the fix had a bug of its own, and one run of the suite found it. The
queue is where "what I actually want" lives; a chip is where you happen to be
looking.

**And the button now either finishes the draft or the board is empty.** Both
branches of the loop fall back to `bestLeft()`, and a rejected pick breaks out
instead of being retried identically until the guard runs down — which looked
exactly like stopping halfway, because it was. `cpuChoice()` itself is left
alone: every client in a room has to agree with it, so the fallback lives in
the solo loop, where nobody else is watching.

**Any preference that can empty a list can end a draft.** The roster caps in
`maxAt()` are the same shape of thing — they exist to stop the CPU hoarding
tight ends, not to decide your draft is over — which is why the last resort
ignores those too.

### A safety limit the app trips on itself

The worst of the four was not reported by anyone, because it does not look
like a bug until it is fatal. A full ten-team room draft, run end to end,
**stopped dead at pick 86** with an empty chair on the clock and every client
waiting on a browser that was waiting on them.

The chain, which is worth reading in full because no single link is wrong:

1. `adoptRoom()` cleared `autoInFlight` on every broadcast carrying a pick, so
   the host's CPU driver sent the next one the moment the last came back.
   Measured on localhost: **a pick every 25ms**, a whole round inside a
   second.
2. The worker allows **forty actions per socket per ten seconds**. That
   comment says "which no person reaches", and it is right — but the host's
   browser is not a person, and it reaches it in the second round.
3. The room answered `too-fast`. **A rejection goes to one socket and causes
   no broadcast.**
4. The driver only ever ran *on* a broadcast. With none coming, it never ran
   again. The two-second timer cleared the flag but nothing retried — and
   permission to try again is not a try.
5. The clock was off, so no alarm woke the room either.

Four correct-looking pieces, one dead draft. The fixes: the driver is still
woken by the broadcast, because **a timer cannot be the engine** — a
background tab has its timers clamped to a second and eventually to one a
minute, and the host's phone is in a pocket for most of a draft — but it
refuses to send twice inside `AUTO_PICK_MS`, and it keeps one retry timer as a
backstop so a rejection, a lost broadcast or a momentary nothing-to-do cannot
be the end of the chain.

**Anything the app does on your behalf has to fit inside the limits the app
imposes on you.** The rate limiter was written thinking about an attacker and
a person, and the host's own browser is neither.

### A dropped socket is the normal path, not an edge case

A phone closes a WebSocket the moment the browser stops being the front app.
So the drop is not a failure to design around — it is step three of the
feature: create the room, copy the link, **leave the browser to send it**.
Everything below was one report from one real draft on one phone, and all of
it is that single second.

**The page reconnects itself.** It did not, at all: nothing in `live.js`
reopened a socket, so a drop was permanent until somebody reopened the link.
Backoff for a worker that is genuinely down, and an immediate retry on
`visibilitychange`, `online` and `pageshow` — coming back to the tab is the
strongest evidence there is that now is the moment, and it is exactly when it
happens. `open()` is split from `connect()` so a retry does not clear
`live.room`: that is the last thing the room said and the whole page is drawn
from it, so wiping it to reopen a socket blanks the seat list and the chat
log for as long as the socket takes.

**"In a room" is `Live.room()`. "The socket is up right now" is
`Live.active()`.** They are not the same question and the start button asked
the wrong one. With a dropped socket `inRoom()` is false, so the handler fell
past the room branch into the one below it — and the branch below it starts a
**solo** draft. Not a degraded shared draft: a different draft, on the host's
phone, against CPUs, while everybody else sat on "Waiting for the host…"
until they gave up. `renderInvite()` had the same bug and dressed it: keyed on
the socket, it unlocked every setup control and relabelled the button "Start
your draft", so the app cheerfully offered the wrong draft. Both now key on
the room, and the button says "Reconnecting…" and is disabled while the
socket is down.

**A control that cannot act has to say so.** Chat is all socket messages, so
all of it stops working on a drop — and it stopped silently: the box still
invited a message, Send did nothing whatsoever, and the line was neither sent
nor kept. "Nothing happens" is how it was reported, and that is the correct
description. The whole footer now goes dead together with one line saying
why. The one honest signal that already existed — `#inviteStatus` reading
"Lost the connection" — was a grey hint contradicted by every control around
it, which is not far off no signal at all.

**Coming back has to undo exactly what leaving did.** `leave()` marks the
chair `auto` so the room keeps moving without you, which is right. `join()`
did not clear it, and could not even find the chair: `leave()` deletes the
member record, so a returning manager took the "new person" branch, which
mid-draft assigns no seat at all. The seat stayed theirs and stayed `auto`,
so the host's browser went on drafting for someone sitting there watching it
happen — no error, no message, visible only as picks they never made. This
one had never bitten because nothing reconnected on its own; making
reconnection work is what turned a dormant bug into the common path.

**The member record outlives the connection.** It is the only thing that can
tell a reconnection from an arrival — the lobby frees a dropped chair, so
"had no seat a moment ago" is true of both — and without it every trip to the
messages app and back added another "took seat 1" to the log. `leave()` keeps
the record and forgets its chair; the worker announces on the record, not on
the seat.

**Two members in one browser: use two origins.** `localhost:8765` and
`127.0.0.1:8765` are different origins with different `localStorage`, so they
hold different `juke.member` ids and the room treats them as two people. Two
tabs on the same origin share the id and the worker correctly treats them as
one manager with two sockets, which tests nothing about a second person — and
overwriting the id in one tab breaks the other the next time it reconnects.
