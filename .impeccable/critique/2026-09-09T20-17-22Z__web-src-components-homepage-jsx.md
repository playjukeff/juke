---
target: the homepage
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
target_fingerprint: "sha256:90bc8626826bc8751e058fcb99c8ebf1483f6366a5916984415594ca4a32abb5"
target_path: "C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
timestamp: 2026-09-09T20-17-22Z
slug: web-src-components-homepage-jsx
---
Method: dual-agent (A: design review · B: detector + browser evidence, run isolated and in parallel)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The page's only interaction lands on Half PPR, where all six movement cells read "—". The proof is blank until you click. |
| 2 | Match System / Real World | 3 | "which room to handle it in" appears in sentence two; "The Rooms" defines it 3,300px later. |
| 3 | User Control and Freedom | 3 | Four social buttons that cannot do what their icon promises; three of five room cards lead to a padlock. |
| 4 | Consistency and Standards | 2 | The same room is "Waiver Room" in the strip and "The Waiver Room" in the footer 200px below — against PRODUCT.md's own naming rule. |
| 5 | Error Prevention | 3 | Nothing stops "Starter strength ×50% = 17" reading as a bad score; the disclaimer arrives 200px below the bar. |
| 6 | Recognition Rather Than Recall | 2 | The desktop column key renders once at y=916; pair 4's heading is at y≈2790 — 1,870px below its own label. |
| 7 | Flexibility and Efficiency | n/a | First-contact Persuade surface with no repeat-use path; scoring it would penalise the page for correctly having no accelerators. |
| 8 | Aesthetic and Minimalist Design | 2 | Three parallel vertical rules inside one 96px gutter (x=665 dashed, x=713 seam, x=762 solid), and a seam running up to 339px past the thing it separates. |
| 9 | Error Recovery | 3 | The league-failure card is exemplary; the proof pairs have no "couldn't compute" state, so permanently-skeleton is indistinguishable from slow. |
| 10 | Help and Documentation | 2 | Applicable, not n/a — the positioning *is* published methodology, and `docs/draft-room-how-it-works.html` has zero links above the footer at y=4,187. |
| **Total** | | **23/36** | **Acceptable (64%)** |

Nine heuristics scored; 7 marked n/a, so the maximum is 36 rather than 40.

## Design Specificity Verdict

**The page is two products stitched together at y=916 — and that seam, not the one drawn in CSS, is the real problem.**

**LLM assessment.** Everything above y=916 is category-interchangeable. Swap four nouns and it sells a project-management tool: an accent-caps eyebrow → giant uppercase display H1 with the second line in the accent → two-line subhead → gradient card pair → three-benefit row. That is the default 2025–26 SaaS hero, beat for beat. Eleven emoji render as the icon system (✨×2, 🏈, 🚪×2, 🔭, ⚡, 🧭, 🔒×3) — and the first glyph a visitor sees is ✨, the single most recognisable generated-content tell there is. One gradient (`#44D4E2 → #82A1F6`) does three unrelated jobs: the Mock Draft card, the Sign up button, and the Open My League link. It is not the shark's aqua and it is not a position colour. "Value, not vibes" is a vibe, sitting 900px above the section that prints the value.

Everything below y=916 could not be lifted by anyone: RB1 → +145 over a *named* replacement where 300 − 155 reconciles on screen; three scoring tables re-ranking six real players live; a four-component grade whose bars sum to the printed 51; and a projection-vs-actual table with a **−20** in it. Two things in the top half are also genuinely grounded and should be protected: the KICKOFF countdown pill, and the mono/tabular-nums rule that makes "this is a measurement" legible before you read the number.

**So the "looks AI-built" complaint is accurate, and it is located.** It is the hero and the rooms strip — not the proof section. The one asset no competitor has debuts 916px down, after the visitor has already decided.

**Deterministic scan.** `impeccable detect` returned **0 findings, exit 0** across all five homepage sources. That clean result was verified rather than trusted: no suppressing config, no `DESIGN.md` biasing rules, no inline disables, and a re-run with `--no-config --no-inline-ignores --no-design-system` unchanged. It was also proven non-vacuous — a deliberately slop-filled fixture returned exit 2 with `ai-color-palette` and `bounce-easing`. **But the clean result is narrower than it looks:** in that same fixture the detector did not flag a missing `alt`, an off-scale 13.5px size, a 7px radius, `opacity: .45`, or a saturated glow shadow. JSX targets run in regex mode, so "0 findings" means "no matches for the JSX ruleset", not "free of design defects". Every issue below was found by review or measurement, not by the scanner.

**Visual overlays.** Injection succeeded (mutation preflight passed, overlay served from port 8400, since stopped and confirmed down). The console reported 493 `impeccable` messages — **and 97.9% of them are false positives.** Of 1,662 tagged elements, 1,628 were not visible and 1,621 sat inside `#view-app`, the retired Draft Room markup this repo deliberately keeps mounted-but-hidden. Only 40 were in the actual homepage. The flagged strings were `Your queue`, `Room chat`, `T23`, `QB/RB/WR/TE/FLEX/BN` — Draft Room UI. **One signal does survive scoping:** `undersized-ui-text`. On the visible homepage that is 10px×25 and 10.5px×3 at desktop, and 9px×2 + 10px×29 + 10.5px×3 at mobile — all below an 11px floor.

Two further scanner findings are rejected as false positives: 18 distinct font-sizes and 9 radii are *not* a scale breach, because this repo documents its 8-step scale and 5 radii as living in `style.css`, which it also documents as "not used by `web/src` — Tailwind owns the homepage's styling". And the one element overflowing without scroll or ellipsis is the decorative `aria-hidden` watermark, clipped by its parent, with no horizontal page overflow at either width.

## Overall Impression

The bottom two-thirds of this page is doing something almost nobody in this category does — putting checkable arithmetic on a marketing page and publishing its own miss. The top third is a template. A visitor decides whether to keep scrolling in the first screen, and the first screen is the part that could belong to anyone.

The single biggest opportunity is not to add anything. It is to move one live artifact above the fold and delete the decorations competing with it.

## What's Working

**Every number is computed, and it survives being checked.** Not a claim about real data — a reader who does 300 − 155 = 145, or 17×.5 + 91×.25 + 94×.15 + 56×.10 = 51, finds it reconciles. That is a categorically different persuasive mechanism from a screenshot, it is exactly what the primary user came for, and it cannot rot, because the board is rebuilt nightly and the section follows it.

**The mono/tabular numeral rule has become a signal.** Every measured figure is `font-mono tabular-nums`; every label is the body face. It also gives the flat cells their argument for free — the left side deliberately has no tabular figures, so "RB1" reads as an assertion while the right side reads as a reading. That is design thinking expressed in type rather than decoration.

**The failure states are better than most sites' success states.** The league-error card names what is *not* broken ("your account is fine and nothing has been disconnected"), offers a retry, and offers a path that does not depend on the failing service. The proof pairs degrade to skeletons rather than to invented numbers. The freshness line renders nothing rather than flashing a wrong count. Contrast is genuinely clean across the whole page — unusually so, and worth stating plainly.

## Priority Issues

### [P1] The first 900px is category-generic, and it is the only part most visitors read

**Why it matters:** the decision to keep scrolling is made here, and this screen offers nothing checkable. The right column is empty from y=517 to y=916 — roughly 400px of void that the watermark sits behind rather than fills — while the largest object on that half is a card labelled **"OPTIONAL"**. Meanwhile the one asset no competitor has debuts below the fold.

**Fix:** move one live artifact above the fold. Cheapest version: render pair 1's *lit* cell (name, Juke score, three lines that add up) at ~420px in the right column, and demote the account card beneath it. That fills the void, unseats "OPTIONAL" as the loudest right-hand object, and puts a checkable number on the first screen. Then delete both ✨ and replace 🏈/🚪 with the coloured-tile treatment `RoomsGridAlive` already uses, so the icon language is one system instead of three.

**Suggested command:** `/impeccable bolder`

### [P1] The seam does not earn its place, and this is measurable rather than taste

**Why it matters:** at 1440 the flat cell's dashed right edge is at x=665, the seam at x=713, the lit card's left border at x=762 — three parallel vertical rules inside a 96px gutter. Because the seam is the right column's border, it runs the full height of the lit cell regardless of the flat cell beside it:

| pair | flat cell | seam | orphaned rule |
|---|---:|---:|---:|
| 1 | 282px | 355px | +73 |
| 2 | 238px | 456px | +218 |
| 3 | 250px | 589px | **+339** |
| 4 | 238px | 378px | +140 |

For more than half of pair 3's height the seam has nothing on its left — at that point it is not a division between two things, it is a second left border on the right card offset by 48px. It has already cost two bug reports, and **both fixes weakened it**: the line now breaks four times, and the headings are clamped into the left column, so each claim now reads as a caption for the cell it criticises rather than the question both cells answer.

**Fix:** delete the seam. Dashed-vs-solid, muted-vs-white ink, and absent-vs-present tabular figures already carry the division at full strength — which is precisely why the phone version works with no seam at all. Then let the heading span its natural two-column width again; the crossing problem disappears with the line.

**Suggested command:** `/impeccable distill`

### [P1] Exactly one control on the page has a designed focus state, and a locked room is locked only to sighted users

**Why it matters:** measured by tabbing, the hero cards, the draft-with-friends row, Sign up, Log in, all five room cards, every footer link and all four social buttons fall back to Chrome's UA ring (`outline: auto 1px rgb(238,238,238)`), which on `#0B0E14` is close to invisible. The only exception is the scoring pills, whose own code comment admits the global style does not exist rather than adding it. Separately, the padlock is `<span aria-hidden="true">🔒</span>` — with aria-hidden content stripped, a locked card reads *"IN-SEASON Waiver Room Preview: 4 claims worth making this week"* and nothing states it is locked, so three of five cards lead somewhere the user was not warned about. The scoring pills also measure 84×29 and the social buttons 36×36, both under the 44px this project's own coarse-pointer discipline implies.

**Fix:** one global `:focus-visible` token applied at the app shell. Give locked cards a visible non-emoji lock plus an accessible name. Take pills to `py-2.5` (≈41px) and social buttons to `h-11 w-11`.

**Suggested command:** `/impeccable harden`

### [P2] The desktop column key is off-screen for three of the four pairs

**Why it matters:** "What you're handed" / "What Juke shows" render once at y=916, and pair 4's heading is at y≈2790. The per-cell labels that would solve this are `lg:hidden`. The section's whole argument is a contrast, and on desktop the reader loses the labels after pair 1 — so an unlabelled "ONE SCORING TABLE" can easily be read as something Juke offers, since the flat cells are deliberately written as complete, confident answers.

**Fix:** drop `lg:hidden` from the cells' own labels and delete the one-off key at the top. Every cell then self-labels at every width, which is exactly what makes the phone version legible today. Cost: four extra label rows on desktop.

**Suggested command:** `/impeccable layout`

### [P2] The same room has two names within one screenful

**Why it matters:** `LockedCard` runs `room.name.replace(/^The /, '')`, so the strip reads "The Prospect Room / The Draft Room / Waiver Room / Trade Room / Strategy Room" — two keep the article, three do not, in one row — while the footer 200px below lists all five with "The". Confirmed in the accessibility tree. PRODUCT.md is explicit that each room is a proper name taking "The", and beyond the rule this is the specific kind of inconsistency that reads as an unfinished site.

**Fix:** delete the `.replace()`. If line length in a 246px card is the concern, drop the title to `text-[20px]` and let it wrap — the card already reserves a two-line box below it.

**Suggested command:** `/impeccable clarify`

## Persona Red Flags

**The sceptical analytical drafter** (PRODUCT.md's primary user, arriving from a Reddit link): the first glyph is ✨ and the first words are an alliterative slogan with nothing behind it — read as marketing. "Value, not vibes" is a vibe, 900px above the value. **No link to the methodology page anywhere above the footer**, though their first question is "how do you compute this". "One call per room. Draft, waivers, trades, lineups" — three of those four rooms are padlocked on the same page. And when they reach the one interactive proof, it opens on Half PPR with six em-dashes in the movement column: the claim is unevidenced in the state they land in.

**The distracted mobile visitor** (375px, in a league group chat): the page is **6,530px tall** — eight folds. First checkable number at ~1,600px; the grade pair's 90-word caveat at ~3,000px. The one thing worth tapping is at ~2,100px and measures 84×29px. The "THE ROOMS" row collides at 375: the left label wraps to two lines ending at x=92, the device line wraps to two starting at x=104 — twelve pixels apart, both wrapped, in a `justify-between` baseline row. The page ends on three padlocked cards and a copyright block.

**The keyboard / screen-reader user:** covered in [P1] above, plus the hero `<h1>` textContent is **"Know the movebefore your league."** — the `<br>` yields no space, so some assistive tech will announce "movebefore". The four social buttons announce as "Facebook", "Instagram", "X", "Reddit" and open a dialog saying Juke is not on them yet, with no way to know before activating.

## Minor Observations

- Two extra `<h1>` elements ("The Draft Room") sit in the DOM from the hidden Draft Room markup. Both are correctly hidden from assistive tech, but a crawler sees "The Draft Room" as the homepage's first H1.
- The format list's `layout` spring overlaps rows for ~200ms — two player names were captured simultaneously illegible mid-transition. The page's one authored interaction is briefly unreadable at its most-watched moment.
- "Preview: 4 claims worth making this week" on the locked Waiver card reads as a live count to a guest with no league. "Preview:" carries the disclaimer, but a specific integer is the strongest thing in that sentence.
- The `Joint` — the 20px hairline connecting stacked cells on phone — is 1px `#252930` on `#0B0E14`. At 375px it could only be located by measuring. It is not doing the job its comment claims.
- The proof section has no "could not compute" state: permanently-skeleton looks identical to slow.
- `ClosingCta` and `ShowYourWorking` are removed, so the final interactive element before the footer is a padlocked room card. There is no closing call to action at all.
- No horizontal overflow at either width, and nothing that overflows while unable to scroll, wrap or ellipsise. The project's truncation rule holds.

## Questions to Consider

1. **What if the board were the hero?** The one asset no competitor can copy is 480 players with live ADP, projections and tiers, rebuilt nightly — currently the fifth thing on the page. `renderHeroShot()` already exists and draws five real rounds of a real snake draft from it. What does this page look like if the hero's right column *is* live draft data instead of a card labelled "OPTIONAL"?
2. **Is the flat/lit frame costing more than it buys?** Half the section — four cells and ~1,000px of vertical — is spent drawing the *competitor's* answer. What if each pair were one lit cell that opens with the weak answer inline, so 100% of the pixels are Juke's and the contrast is carried by sequence rather than by a grid?
3. **Why does the reader have to click to see the argument?** Pair 2 lands where every movement cell reads "—". What if it landed on Full PPR, with Chase at ▲2 visible on arrival, and Half PPR were what they click back to?
4. **What is this page's last impression meant to be?** It ends on three padlocked rooms and a copyright line. If the binding promise is that a solo mock needs no account and no server, should the last thing on the page be a locked catalogue — or the Mock Draft action again, with `480 players · refreshed 5 hrs ago` under it as the closing proof?
