# Product

<!-- impeccable:product-schema 1 -->

Confirmed 9 September 2026. Facts marked **[repo]** are read off the codebase
and its documents rather than stated in the interview; treat them as evidence,
not approval. Facts marked **[open]** are deliberately undecided and must not
be resolved by invention.

## Platform

web

## Users

**Primary: the analytical drafter.** Someone who distrusts expert-consensus
black boxes and stays because every number is explained. They arrive wanting an
answer and stay because they can get from the answer to the reasoning without
leaving the page. Smaller segment than the category's mainstream, materially
higher trust within it. **This is a narrowing of BUSINESS-PLAN.md's customer**
and it is the version to design for.

**Secondary, commercially: the engaged manager in two to four leagues** who
already spends $50–$200 a year on entry fees and treats draft day as the most
important day of the season. **[repo]** BUSINESS-PLAN.md §01. Real, and not the
person whose needs break a tie.

Situation: pre-draft preparation in August, when roughly 80% of the year's usage
arrives in a six-week window **[repo]**; and, since the five in-season rooms
shipped, week-to-week decisions across the rest of a season.

## Product Purpose

Juke is a fantasy football **draft and season analyst**, not a league platform.
The Draft Room is the room it was built around: unlimited mock drafts against a
board carrying real ADP, real projections, and tiers and replacement level
derived from *your* league shape, with a post-draft grade that breaks into four
visible weighted components.

Five further rooms — Prospect, Waiver, Trade, Strategy, plus My League above
them — extend the same analysis layer across a season. **[repo]** `ROOMS` in
`app.js`.

Success is somebody returning unprompted, and being able to answer "why is this
number what it is" from the screen they are already on.

## Positioning

**The transparent alternative.** Three things a neighboring product could not
truthfully copy:

- **Every number is explained.** The grade breaks into four visible components,
  replacement level is a formula on the page, and `docs/draft-room-how-it-works.html`
  publishes the CPU formula, need multipliers, wobble and grade weights. The
  incumbents are expert-consensus black boxes by construction, and an
  expert-consensus business cannot credibly become the show-your-work business.
- **The projection is graded against itself.** `pp` in `stats.js` holds what was
  forecast for seasons that have since been played, so "our record on him" is
  checkable rather than asserted. **[repo]** No other mock tool in the reviewed
  set does this.
- **Points are recomputed from raw components** under the league's own editable
  rules, rather than inheriting a host platform's scoring assumptions.

**One correction is already recorded and must not be re-inflated:** custom
scoring is table stakes on a real league platform, not a moat. What survives is
narrow and true — *mock-draft against your exact rules without creating a league
first.* **[repo]** DESIGN-DIRECTION.md and MVP-ROADMAP.md both record the
original over-claim and its correction.

## Operating Context

- **Seasonal, sharply.** Six rooms strung across pre-season, in-season and
  post-season. Usage, support load and bug reports concentrate in about six
  weeks. **[repo]**
- **A draft is a live event with a clock.** A mock is practice for it, so speed
  and control matter: 140 picks auto-draft in about five seconds, and the room
  runs a real pick clock.
- **Shared rooms.** An invite link puts a whole league in one draft — seats, a
  clock, chat, reactions, polls, voice notes and photos — on a Cloudflare Worker
  with Durable Objects. The league group chat is the highest-intent audience the
  product has.
- **Connected leagues are read-only.** Sleeper by username; ESPN by the league
  id in its URL, public leagues only. Juke never edits anybody's league, and
  that line appears on the unlock cards as a promise.
- **A solo mock touches no server at all**, and works offline and signed out.
- **Phones are a first-class drafting surface**, not a narrow desktop. Below
  `sm` the draft room is a genuinely different screen from its desktop
  counterpart. **[repo]**

## Capabilities and Constraints

**Built and shipped.** Mock drafts at 4–24 teams and 8–20 rounds with any
starting lineup; 49 editable scoring rules that rescore projections, history and
the grade live; snake, linear and third-round-reversal orders; the draft grade
(starter strength vs. par, draft value vs. par, roster construction, bye safety);
the Juke score; Your Insights; the locker and draft history; shared rooms;
accounts via Clerk with a D1-backed saved draft and locker; Sleeper and ESPN
league connect with a name-based crosswalk; five in-season rooms; a phone draft
tree; and a published methodology page.

**Deliberately absent — do not design as though these exist.** Auction drafts
(listed and marked unavailable on purpose); keepers; IDP; a service worker or
true offline PWA; browser-side error tracking; expert rankings of any kind; and
article bodies — news is a headline, one clipped line, an attributed source and
an outbound link, which is a licensing choice rather than a gap. **[repo]**

**Tiers exist in code and nothing charges.** `free` / `pro` / `allaccess`,
customer-facing Free / Season Pass / Multi-League, league caps 0 / 1 / 20, with
upgrade gates live on Waiver and Trade. There is no checkout, no Stripe, and no
paying customer. **[open]** whether, when and at what price that launches.

**Technical shape that constrains design.** A static site with three optional
servers behind it (the room, the account, the pipeline), served by Cloudflare
Pages from `main`. The legacy files (`app.js`, `draft-engine.js`, `live.js`,
`style.css`) have no build step, no framework and no bundler; `web/` is the one
deliberate exception (React, Vite, Tailwind, Framer Motion) and `window.JukeEngine`
is the only channel between the two worlds. The data pipeline is Python 3
standard library only. **Nothing about the league shape may be written down
twice.** **[repo]** CLAUDE.md is the authority on all of it, and this record
deliberately does not restate its rules.

**Data feeds.** Sleeper, Fantasy Football Calculator (ADP), nflverse,
ffopportunity, and Tank01 (optional, keyed) for headlines. **[open]** None has
been checked for commercial-use terms — the largest unverified assumption in the
plan, because the cost advantage the positioning rests on sits on top of it.

**Terminology, as the product uses it.** Juke is the brand; The Rooms is the
named set; each room is a name and takes a capital ("The Draft Room"), while
"rooms" as a common noun stays lowercase. The board, the locker, the Juke score,
replacement level, par, tiers, the grade.

## Brand Commitments

- **Name:** Juke. The app names the room, not the brand — the header says "The
  Draft Room" and Juke sits above it in the page title and the manifest. Live at
  `jukeff.com`.
- **The mark is a shark**, and `web/public/juke-mark.js` is vendor: ship as-is,
  do not edit. It is the single copy of the mark's geometry, and every SVG and
  PNG in the icon set is generated from it by `scripts/build_icons.mjs`.
- **Voice:** plain, measured, and it shows its working. Sentence case on
  buttons — uppercase labels are explicitly rejected. No "powerful A.I."
  positioning; explaining the number is the durable version of the same claim.
- **The visual system lives in the code and in CLAUDE.md**, not here. Palette,
  type scale, radii, position colours and motion are deliberately out of this
  file so there is one copy of each.

## Evidence on Hand

**Real, and usable in any surface:**

- The live board — `players.js` and `stats.js`, regenerated nightly, with real
  ADP, projections, weekly logs, depth charts and eight seasons of history.
- `data/baselines/2026/preseason/` — a frozen, hashed preseason snapshot — and
  `data/season/<year>/week-<NN>/`, append-only weekly actuals.
- The projection's own record: what was forecast for 2023, 2024 and 2025 beside
  what actually happened.
- `docs/draft-room-how-it-works.html` — the published method.
- A first-hand competitive review: a completed mock drafted on both Juke and
  Sleeper, and Sleeper's marketing site read frame by frame. **[repo]**
  DESIGN-DIRECTION.md and MVP-ROADMAP.md.
- The shark design packages, the generated icon set, and `og-image.png`.

**Absences future work must not fill by invention.** The product is
**pre-launch, with a handful of beta testers**: there are no users to count, no
revenue, no subscribers, no testimonials, no press, no case studies, no
partnership, and no third-party benchmark. There is no honest social-proof
number yet, and the hero's proof is the board itself. **[repo]** The header
ticker previously carried six fabricated stats and now carries five real ones
read off the live board — the precedent is to replace an invented figure with a
computed one rather than to soften it.

## Product Principles

Two were confirmed binding in this interview; three are derived from the
project's own documents and are marked as such.

1. **A solo mock needs no account and no server.** Every localStorage path runs
   identically signed out and offline, so each server *adds* rather than
   *permits*. Anything that makes a solo draft depend on a server is out.
   *(Confirmed binding.)*
2. **Every number is explainable on the page where it appears.** No black-box
   ranking, and no figure a reader cannot get behind. *(Confirmed binding.)*
3. **Withholding beats guessing.** Where the model cannot rank honestly — kicker
   and defense order, measured at r 0.37 / −0.09 / 0.57 — it withholds the
   number and says so, completely, rather than printing one and hedging beside
   it. **[repo]**
4. **Parity is the wrong goal; the analysis layer is the product.** Close the
   gaps that stop somebody drafting; spend the rest on the layer a platform of
   Sleeper's size has shown no interest in building. **[repo]**
5. **A control that cannot act must not be offered.** A dead control — a
   coloured label with no handler, a refusal with no way out, a fraction whose
   denominator has been discharged — renders, contrasts, throws nothing and
   passes every check. This project has shipped one more than once. **[repo]**

## Accessibility & Inclusion

**No external standard was committed to in this interview**, and none is claimed
here. What is true is that the codebase already enforces a floor and measures
against it **[repo]**:

- 4.5:1 for anything under 24px (or under 18.66px bold), which is very nearly
  all of it; 3:1 for non-text marks such as the board's seat ring, or a bar
  against its track.
- A 16px minimum on every field under `@media (pointer: coarse)`, because iOS
  zooms a smaller focused field and does not zoom back out. `maximum-scale=1` is
  rejected: it buys the same thing by taking pinch-zoom from people who need it.
- Two full themes, both designed, with the ink ramp set from the worst surface
  upward rather than by eye.
- Reduced motion is honored by script where CSS cannot reach — the mark's
  animations live in a shadow root — and the cold-load splash swaps to a static
  variant rather than losing its picture.
- Decorative and blurred preview content is `aria-hidden` and `inert`, so a
  screen reader is not read out a roster nobody can see.

**Three ways to lie about a colour are recorded and must be composited when
measuring:** alpha, a gradient stop, and `opacity` on an ancestor.
