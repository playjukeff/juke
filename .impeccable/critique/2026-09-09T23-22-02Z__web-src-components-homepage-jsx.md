---
target: the homepage
total_score: 21
max_score: 32
na_heuristics: 7,9
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
target_fingerprint: "sha256:21d28c42bc79352756f613d96b60b41772f9334c60e704061a012080aee899c1"
target_path: "C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
timestamp: 2026-09-09T23-22-02Z
slug: web-src-components-homepage-jsx
---
Method: dual-agent (isolated, parallel, neither told the previous score, the previous findings, or that anything had been fixed)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Load states handled well — BoardPeek mounts 584ms before the splash lifts, so nothing shifts — but the format pills change six numbers with no transition cue when the order holds. |
| 2 | Match System / Real World | 3 | Vocabulary is right. "Connect" is a verb that does not connect: it navigates to `#/rooms`. |
| 3 | User Control and Freedom | 2 | One authored control on the page, and no header navigation at all — logo, kickoff pill, Log in, Sign up, nothing else. |
| 4 | Consistency and Standards | 2 | The same player carried two values under one label: +145 in the hero, +128 in the proof. Also five distinct links share one href. |
| 5 | Error Prevention | 3 | The one trap: a reader can leave `#/rooms` believing a connected league unlocks Waiver/Trade/Strategy. `LIVE_ROOMS` is empty. |
| 6 | Recognition Rather Than Recall | 2 | Desktop column labels render once at y=908 and the per-cell labels are `lg:hidden`, so ~2,000px of a 2,492px section has no label on either side. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface, no repeat-use path, no accelerator that could exist. |
| 8 | Aesthetic and Minimalist Design | 3 | Composition clean, contrast sweep zero failures. Cost: 34 elements at 10px, including every explanatory label the argument depends on. |
| 9 | Error Recovery | n/a | No forms, no validation, no submitted state. The league-error card exists in code but cannot render for a guest. |
| 10 | Help and Documentation | 3 | The method links are the best thing here — each names the section it reaches rather than the claim above it. Undercut by being 12px and 18px tall, and absent from the header. |

**Total: 21 / 32 applicable.**

**The denominator changed this run and the totals are not like-for-like.** Heuristic 9 was scored 2 in the previous run and `n/a` here, on the reasoning that a page with no forms and no submitted state has no error recovery to assess. That is defensible and it moves the maximum from 36 to 32. Read as percentages the four runs are **63.9% → 63.9% → 55.6% → 65.6%**, which is the only comparison that means anything.

## Design Specificity Verdict

**Design review.** "Grounded — unusually so — from y≈145 to y≈3,400, and generic at both ends." Specific and not transplantable: BoardPeek's five real players with `+145 / +138 / +85 / +72 / +68` and position chips in the app's own chalk; the four-pair flat/lit structure, where every figure is computed; the graded-draft card, which the reviewer reconciled by hand again as **17×.50 + 91×.25 + 94×.15 + 56×.10 = 50.95 → the printed 51**; pair 4's `2023 · we said 237 · he scored 217 · −20`; and the `×50% / ×25% / ×15% / ×10%` weights beside each bar with the note that three components are min-max positions and one is absolute — "nobody else in the category would write that sentence".

Still template: the hero furniture (gradient card, italic caps H1, tracked eyebrow, two-up card pair), the TrustStrip, the closing block, and the footer's four dead social buttons.

**Deterministic scan.** All seven sources clean, exit 0, identical with `--no-config` — the two sanctioned `bounce-easing` ignores suppressed nothing here, verified three ways. Pointed at `index.css` the same ignores demonstrably work (0 with config, 2 without), so the config is live rather than inert.

**And the coverage question is now answered with a number.** Two throwaway fixtures planted **17 slop patterns; JSX regex mode caught 1** — a literal easing curve. Every pattern it missed (cyan→purple gradient, a 40px cyan glow, a radial spotlight, 8px text, 0.2em tracking, all-caps body, `100vw`, `outline:none`) was caught by rendered mode on the real page. On these files regex mode effectively sees literal easing curves and nothing else: no computed style, no geometry, no composited colour, and nothing arriving from `style.css`. **Seven clean results, true and low-information.**

**Rendered mode:** 266 findings via CLI, 1,689 in-page. Scoped: **61 visible, 1,628 hidden, 1,621 inside `#view-app`** — 96% in the retired Draft Room markup, including 1,604 of the 1,632 `undersized-ui-text` and 14 of 15 `dark-glow`. The two scan modes also disagree on totals and run different rule sets, which is worth knowing before either number is quoted.

**Eight false positives** confirmed with reasoning, including one that corrects an earlier read: the footer links measuring under 44px at 1440 carry `lg:min-h-0` deliberately — computed `min-height` is 44px at 375 and 0 at 1440, exactly as authored. The reviewer initially blamed Tailwind JIT lag, caught itself, and traced it to source.

## What the fixes bought, verified

Both claims from the previous commit came back as numbers rather than adjectives:

- **Dashed borders: exactly 1 distinct** on the whole page, carried by "Or draft with friends" — the Juke action. The flat cells no longer wear it.
- **Room card alignment: every delta exactly 0.00** across all five at 1440 (cardTop 3477.81, eyebrow 3538.81, title 3556.81), and 0.00 within every row at 375.
- **Hero cards: 1.00px**, down from 20px — and diagnosed rather than left as "aligned": it is sub-pixel distribution inside `justify-content: space-between`, with the icon spans differing 1px the other way. Not a token mismatch.

Also standing: **36/36 interactive elements named**, **34/34 and 33/33 focusable elements carrying a visible focus indicator with 0 on the UA default**, 0 missing `alt`, 0 heading skips, no page-level horizontal overflow at either width, and the `<h1>` at 3 lines / 205px desktop and 4 lines / 180px phone.

## Priority Issues

### [P1] The same number appeared twice with two values and one label — **fixed during this run**

BoardPeek printed Gibbs at **+145** under "over replacement"; pair 2 printed him at **+128** under the same words, 1,000px apart. Cause was mine: I defaulted the format pills to standard two commits ago to stop the proof opening on six em-dashes, while BoardPeek reads the live league (half PPR). That is the binding principle failing on the two panels that exist to demonstrate it.

Fixed by moving the arrow's baseline from half to **standard**, which lets the pills default to half — matching the hero and the app — and still open on movement. Verified: **+145 in both panels**; half and full each show three moving rows where one state did before; standard is flat and self-explaining as the baseline. BoardPeek now also names its ruleset, read from the live league.

### [P1] The interaction showed nothing changing on two of three states — **fixed by the same change**

`moved` measured against half PPR, so both half and full rendered six em-dashes and only standard moved. The middle pill — this app's default and most leagues' — made the argument disprove itself. Now 2 of 3 states move, and every value moves in all three (Nacua 66 / 85 / 105).

### [P1] Pair 1 opens the argument on a case that refutes it, using an unexplained tautology

The heading is "A rank is not a reason" and the card concludes `PROJECTION RB1 · MARKET RB1` — the rank was right. And the headline **100** is `overallScore()`, which is a share of the board's best figure, so the top player *always* scores 100; the three lines beneath explain +145, not 100. A bare unexplained 100 on the page arguing no number should be taken on trust is the sharpest self-contradiction left. **Fix:** pick the highest-scoring player whose `projPosRank` disagrees with `posRank` — both fields already exist — falling back to today's top player when none disagrees; and add one line under the 100 saying what it is a share of.

**Suggested command:** `/impeccable clarify`

### [P2] Three padlocks, no stated unlock, and the next screen states a false one

A guest sees `Locked. IN-SEASON` three times in the last content section with nothing saying what opens them, and `#/rooms` says "the rest unlock when you connect a league" — but `LIVE_ROOMS` is empty, so connecting unlocks none of the three. The true sentence is already written in `ConnectCard`, which only renders signed in. **Fix:** move it out of that branch onto the strip, and correct the `#/rooms` line.

**Suggested command:** `/impeccable clarify`

### [P2] "Or draft with friends" promises multiplayer and links to the solo draft

Its href is byte-identical to the Mock Draft card's, and to three other links on the page — `#/rooms/draft`, five links, one destination, no state passed. Two visually distinct CTAs making two different promises and delivering the same thing. **Fix:** pass a query the entry screen reads to open the draft-with-friends panel, or fold the line into the Mock Draft card's caption.

**Suggested command:** `/impeccable harden`

## Persona Red Flags

**The analytical drafter.** Presses **HALF PPR** — his own league — and, before this run's fix, got six dashes. The **100** on Gibbs's card: he works out in ten seconds that the best player always scores 100, and the card never says so.

**The sceptic who has been burned by a ranking site.** Pair 4 gives him +51, +71, −20 — one small miss against two large beats — under a heading promising accountability, which reads as curation. And the **GP column is 17, 17, 17**: the caption insists it "is here and not decoration", and in the only instance he sees, it is.

**The engaged manager.** "Plug in your league from any major platform" and "Any platform" in the trust strip, then "Sleeper and ESPN now · Yahoo, CBS soon" in 13px — overclaimed twice before correcting in the smallest type in the hero. The largest room card on his phone is **The Strategy Room at 335×185, locked**. No price anywhere: five mentions of "free", three padlocks, no tier.

## Minor Observations

- **Desktop loses the column labels for ~2,000px** — the `lg:hidden` per-cell labels never render at desktop, so mobile is better labelled than desktop here.
- **The seam measures 1.31:1** against the ground — as a device it barely perceptually exists; the flat/lit surface split is doing the work.
- **34 elements at 10px**, including every explanatory label in the argument.
- **Three method links are 18px tall**, under WCAG 2.5.8's 24px.
- **Heading outline is h1 + 4×h2 and stops** — the rooms strip, account card and closing CTA carry none, so heading navigation never reaches the rooms.
- **"480 players · refreshed 8 hrs ago" prints twice**, in BoardPeek and again in the footer 3,700px later.
- **Locked rooms have better copy than open ones** — "Preview: fair-value check on any offer" against the Draft Room's "Mock smarter."
- **The rooms lobby one click away still uses emoji** while the homepage replaced its own. The homepage's fix created that inconsistency.
- **BoardPeek's no-skeleton choice has a 584ms margin on localhost** — it mounts before the splash lifts. That margin is the thing to re-measure on a throttled connection.
- **Three transparent-outline focus cases** rely on `box-shadow`, which is dropped under forced-colors.

## Questions to Consider

1. **Pair 2 says the rules change the order, and the ranks move on two of three settings while the points move on all three.** What is the rank-delta buying that the points-delta isn't?
2. **The page names six players out of 480 and shows the top one four times.** If the whole asset is that nobody else has this board, why does the reader leave having met 1.25% of it?
3. **You show the median team's B and 51 because it is honest. Who is that honesty for?** Would showing the room's spread — best and worst, both graded, both reconciling — be more honest *and* more persuasive than one team plus 46 characters explaining the choice?
4. **Three of five rooms are padlocked with no unlock stated, and the next screen states a false one.** At what point does an advertised-but-locked room cost more trust than it buys interest — and is the answer different when the product's position is that it doesn't hide things?
