---
target: the homepage
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
target_fingerprint: "sha256:21d28c42bc79352756f613d96b60b41772f9334c60e704061a012080aee899c1"
target_path: "C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
timestamp: 2026-09-09T20-51-35Z
slug: web-src-components-homepage-jsx
---
Method: dual-agent (A: design review · B: detector + browser evidence, run isolated and in parallel, with neither told the previous run's score or findings)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 3 | = | The board's own provenance line renders nowhere — `freshnessLine()` computes correctly and both call sites read it once at mount, before the engine answers. |
| 2 | Match System / Real World | 3 | = | `OVER REPLACEMENT` and `+145` appear at y=145 with no unit; the definition arrives at y=990. |
| 3 | User Control and Freedom | 3 | = | The hero card labelled **Connect** goes to `#/rooms`, not a connect flow — label and destination disagree. |
| 4 | Consistency and Standards | 2 | = | Three primary-action treatments on one page: white pill, cyan→periwinkle gradient, flat teal. Two icon languages remain. |
| 5 | Error Prevention | 3 | = | "Plug in your league from **any major platform**" sets up a Yahoo/CBS user for the failure the card 200px below admits. |
| 6 | Recognition Rather Than Recall | 3 | **+1** | Proof pairs now label every figure at the point of use. Against it: the format list has five unlabelled columns. |
| 7 | Flexibility and Efficiency | n/a | = | Single-scroll Persuade surface, one authored control, no repeat-use path. Genuinely inapplicable. |
| 8 | Aesthetic and Minimalist Design | 2 | = | 4,370px desktop / 6,950px phone for a one-argument page. The H1 rags to 4 lines desktop, 5 on phone, three of them orphan words. |
| 9 | Error Recovery | 2 | **−1** | Three surfaces fail by silently disappearing, and **one of them was failing** with nothing on screen or in console to say so. |
| 10 | Help and Documentation | 2 | = | The header links no methodology. "VORP explained" is at y=4,230; "Over replacement +145" is at y=145. |
| **Total** | | **23/36** | **=** | **Acceptable (64%)** |

**The total did not move, and the reason is worth stating plainly rather than spinning.** Heuristic 6 improved by a point because the fixes landed. Heuristic 9 lost a point because this session shipped a new silent failure. One cancelled the other.

## Design Specificity Verdict

**Design review.** The split now runs almost exactly at the fold, and the half that was the complaint has genuinely changed. Grounded in this product: the flat/lit pair structure where the typographic distinction *is* the argument; the `Joint` connector that keeps a stacked pair reading as one argument on a phone; the arithmetic strips, which the reviewer verified by hand — `300 − 155 = 145`, and `17×.50 + 91×.25 + 94×.15 + 56×.10 = 50.95` against the printed **Weighted sum 51**; `POS_CHALK` in the board panel; the projection-record table with its `GP` column.

Still category-interchangeable: the hero shell (mono eyebrow → oversized italic caps H1 → 44ch subhead → two cards → dashed row); the `TrustStrip`; the footer with four social buttons that all open a "coming soon" dialog; and **the cyan→periwinkle gradient**, which is not the product's teal, not `POS_CHALK`, and not a room accent — sitting eight pixels from a panel whose entire justification in code is that its colours are the product's own.

**Deterministic scan.** All six homepage sources returned `[]`, exit 0, and **nothing was suppressed by the two sanctioned `bounce-easing` ignores** — those resolve to `index.css`, not to any target file, confirmed by a `--no-config` pass returning identical results.

**But the clean result has a narrow true surface, and this run proved it rather than assuming it.** A fixture using `text-[9px]`, `outline-none`, `tracking-[-0.09em]`, `leading-[0.7]` and an `<img>` with no `alt` also returned `[]`, exit 0. Non-HTML files get regex matching, not rendered analysis, and these six components are Tailwind-driven — so six clean JSX scans say close to nothing about what renders. The detector does fire: a `cubic-bezier(0.68, -0.55, 0.265, 1.55)` fixture returned exit 2.

**Rendered mode is the one that sees anything.** `detect --viewport 1440x900 <url>` returned **261 findings, exit 2**. Scoped in-page: 1,668 elements, 1,678 findings, **50 visible, 1,628 hidden, 1,621 inside `#view-app`** — the retired Draft Room markup this repo deliberately keeps mounted. **97% of findings are in markup that does not render.** The headline `undersized-ui-text` count collapses from 1,633 to 28 once that is excluded.

**Confirmed false positives**, each with reasoning: `side-tab` ×2 (matched from `style.css` selector text; neither element is visible); `overused-font: "inter (98%)"` (no visible homepage text computes to Inter — measured Hanken Grotesk 75.6%, ui-monospace 13.3%, Gabarito 9.6%); `dark-glow` 14 of 15 (all in `#view-app`); and the single overflow offender, which is the decorative `aria-hidden` watermark clipped by its parent, with no page overflow at either width.

## Overall Impression

Last run's headline problem is fixed and measurably so — the board is above the fold, every interactive element has an accessible name, and every focusable element has an authored focus ring. What the score says is that the page traded a gain for a loss: the fixes bought a point on recognition, and a new silent failure cost a point on recovery.

The remaining problem is no longer "the top is generic" so much as "the top is *three of everything*" — three CTA treatments, two icon languages, three wordings of one promise, and a headline that rags into orphans at both breakpoints.

## What's Working

**The arithmetic reconciles on screen, and it was verified rather than asserted** — both the subtraction in pair 1 and the weighted sum in pair 3, by hand, by a reviewer who did not know what it was supposed to say. It works because the numbers are a strip of labelled rows with tabular figures rather than a chart; the eye can do the subtraction unprompted.

**The min-max caveat under the grade** — volunteering that three of your four headline bars are positions inside a sample rather than scores. The reviewer called it the single most credible sentence on the page, and the kind of thing that gets cut in review everywhere else.

**Verified fixed from last run:** 34/34 interactive elements carry an accessible name; 34/34 focusable elements produce an authored focus indicator (`2px solid rgb(0,229,255)`), 0 falling back to the UA default; 0 missing `alt`; 0 heading skips; no horizontal page overflow at either width.

## Priority Issues

### [P1] The board's provenance line computed correctly and rendered nowhere — **fixed during this run**

`freshnessLine()` returned `480 players · refreshed N hrs ago` while appearing in neither of its two call sites. `BoardPeek` called `setFresh()` outside its `run()`, so it evaluated once at mount before the deferred board landed; `Homepage`'s `useDataFreshness()` had no listener at all and had been rendering empty since before this session. A panel titled **"Tonight's board"** shipped with nothing on it saying which night — the one unfalsifiable claim on a page built from falsifiable ones. Both now read on `juke:data-loaded`; verified rendering `480 players · refreshed 6 hrs ago` in the panel and the footer.

**Suggested command:** fixed — no command needed.

### [P1] "Tonight's board" is five running backs

Sorting the whole board by Juke score and slicing five will do this on essentially any board, because VORP concentrates at RB. Five identical mint chips means the position-colour system — the panel's stated reason for existing — is invisible, so it reads as decoration; the panel looks like a tool that only knows about running backs; and it is the third consecutive place the reader meets Jahmyr Gibbs before scrolling once. **Fix:** take the top-scoring player at each of QB/RB/WR/TE plus the next best overall. Five different chips, and the panel demonstrates a cross-position measure instead of an RB list.

**Suggested command:** `/impeccable layout`

### [P1] The rooms strip's emoji ignore `color`, so their declared accents do nothing

`RoomsGridAlive` applies `style={{ color: room.accent }}` to the glyph span. **Emoji ignore `color`.** Waiver's declared accent is `#00E5FF` and its ⚡ renders orange; Strategy's is `#74E5CE` and its 🧭 renders gold. The two typographic glyphs (◎, ⇄) *do* take their accent, so the strip is internally inconsistent as well as externally out of place — and these are the most saturated objects on an otherwise disciplined page. **Fix:** the same drawn 20×20 stroke SVGs the hero now uses, with `stroke={room.accent}`. If the legacy page still reads `ROOMS[].glyph`, add a parallel `icon` key rather than editing `glyph`.

**Suggested command:** `/impeccable polish`

### [P2] Three CTA treatments, four account controls, and a headline that rags into orphans

Three primary-action looks for one job: white pill (header Sign up), cyan→periwinkle gradient (hero card + account Sign up), flat teal (closing CTA) — against CLAUDE.md's own one-primary-action-colour rule. `Sign up` and `Log in` each render twice above the fold, 586px apart. The `<h1>` measures 634×317px = **4 lines at 1440** and 335×243px = **5 lines at 375**, with three orphan words and 30% of the phone viewport. **Fix:** one CTA treatment; demote the header Sign up to a text link; drop `lg:text-[88px]` to 72 so "KNOW THE MOVE" fits the column and the authored `<br/>` does what it was written to do.

**Suggested command:** `/impeccable typeset`

### [P2] The page's only interaction still opens with its evidence blank

`PairYourRules` defaults to Half PPR and `moved` is measured against half, so all six rows show `—` on arrival. A column of dashes reads as absent data rather than zero change. The evidence exists — Standard moves Henry ▲3 and McCaffrey ▼3; Full PPR brings two WRs into the top six — and the page shows none of it unprompted. **Fix:** default to Standard and label the column against half, or auto-advance once after ~1.2s on first intersection, respecting `prefers-reduced-motion`.

**Suggested command:** `/impeccable animate`

## Persona Red Flags

**The analytical drafter.** Pair 1 closes with `PROJECTION RB1 · MARKET RB1` — having just read "a rank is not a reason", the last line of the rebuttal is the same rank twice, so the page's own exhibit agrees with the thing it is attacking. Pair 4 shows `+51 / +71 / −20`: two beats and one miss, and the miss is the smallest number in the table, which reads as flattering selection even though the code specifically hunted for a miss. The header links no methodology at all.

**The engaged manager.** The hero says "any major platform"; the card 200px below says "Sleeper and ESPN now · Yahoo, CBS soon" — the page contradicts itself within one viewport and the wrong half is in larger type. Nothing anywhere says whether any of this costs money.

**The phone referral.** Screen one at 375 is a 243px five-line headline with three orphans; the board starts at y=702 of an 812px viewport, so one row is visible at most. The `TrustStrip` is `hidden sm:grid`, so the three sentences saying what the product *does* don't exist on a phone — including the read-only reassurance for its riskiest ask.

## Minor Observations

- **28 visible sub-11px text nodes** (of 1,633 flagged, the rest hidden). The two 9px eyebrows on the entry cards were fixed mid-run and now render 11px; the rest are labels, chips and table headers at 10–10.5px.
- **Four dead footer controls.** Facebook / Instagram / X / Reddit all open "Juke isn't on X yet." On a pre-launch page, four platform marks you aren't on advertises absence.
- **`ConnectCard`'s error copy is the best on the page** and is `SignedIn`-only, so the guest this Persuade surface is built for can never see it.
- **`HomeProof`'s comment claiming no global focus style is now stale** — measured, every focusable element gets one.
- **Format buttons are 37px tall**, under 44, and they are the page's only interaction.
- **The seam still doesn't read as a seam** — `lg:border-l` on the right cell only, so with the left cell at 40–60% of the right's height it reads as a card border rather than a division.
- **A fourth way to lie about a colour:** `getComputedStyle().backgroundColor` returns `transparent` on a `linear-gradient`, so a contrast walker reports false failures on gradient CTAs. Computed by hand, both pass — `#14343d` on `#44D4E2` is 7.40:1 and on `#82A1F6` is 5.27:1.

## Questions to Consider

1. **The right column above the fold is the most valuable space on the page. Why is an account signup still the loudest object in it**, on a page that says "no account needed" three times? What happens if the board takes the whole column and the account offer moves below the proof, where the reader has a reason to want their work saved?
2. **Four pairs is a lot of argument for a page with one action.** They occupy 2,700px of 4,370, and three are structurally identical. The strongest is pair 1 and it is the shortest. What is pair 2 adding that the reader hasn't already conceded?
3. **Is showing the *median* team the honest choice, or the one that produces the least persuasive picture of a working grade?** Would the room's spread — ten letters and their weighted sums in a strip — argue the same honesty more convincingly than one team with a 6%-filled bar?
4. **How many visual decisions on this page are being made by `app.js`'s data shape rather than by design?** `glyph` being a character is why three emoji survive in the rooms strip. Is that still a constraint anyone would choose, or one nobody has revisited?
