---
target: the homepage
total_score: 20
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
target_fingerprint: "sha256:21d28c42bc79352756f613d96b60b41772f9334c60e704061a012080aee899c1"
target_path: "C:\\Development\\Juke\\juke\\web\\src\\components\\Homepage.jsx"
timestamp: 2026-09-09T21-31-47Z
slug: web-src-components-homepage-jsx
---
Method: dual-agent (A: design review · B: detector + browser evidence, isolated and parallel, neither told the previous score, the previous findings, or that anything had been fixed)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 3 | = | The format toggle's default state shows six `—`, so "nothing moved" is indistinguishable from "not computed". |
| 2 | Match System / Real World | 2 | **−1** | The Connect card wears the universal *sign-in* glyph and navigates to `#/rooms`, a room catalogue, not a connect flow. |
| 3 | User Control and Freedom | 3 | = | Four footer social buttons open a dialog you must dismiss — controls that cannot act. |
| 4 | Consistency and Standards | 2 | = | The hero's "Or draft with friends" row and all four "what you're handed" cells compute to an identical dashed hairline. |
| 5 | Error Prevention | 3 | = | "any major platform" is corrected 200px later by "Yahoo, CBS soon". |
| 6 | Recognition Rather Than Recall | 2 | **−1** | Desktop column labels appear once at y=908; the per-cell labels are `lg:hidden`, so three pairs later the reader must remember which side is which. |
| 7 | Flexibility and Efficiency | n/a | = | Single-scroll Persuade surface with no accelerator that could exist. |
| 8 | Aesthetic and Minimalist Design | 2 | = | The two primary CTA cards' titles sit 20px apart despite identical tops, heights and padding. |
| 9 | Error Recovery | 2 | = | If the engine never answers, all four pairs render skeletons indefinitely and BoardPeek renders nothing. |
| 10 | Help and Documentation | 1 | **−1** | The published method is linked exactly once, at 13px, in the footer's third column at y≈3,946 of 4,366. |
| **Total** | | **20/36** | **−3** | **Acceptable (56%)** |

**The score fell, and it is worth separating the three points rather than averaging them into a mood.**

**One point is a regression I caused.** Heuristic 2 dropped because the drawn `IconConnect` I added is an arrow-into-a-bracket — the universal *sign-in* glyph — on a card that is not sign-in and that navigates to a room catalogue. The previous emoji was a door, which was at least ambiguous. Replacing a generic mark with a specific and wrong one is worse than the generic mark.

**Two points are the same findings scored harder by an unanchored pass.** Heuristic 6 (the desktop column key) and heuristic 10 (the method linked once in the footer) were both present and both reported in earlier runs; nothing about them changed. Run 2 scored them 3 and 2; run 3 scored them 2 and 1. That is reviewer variance on a rubric with four steps, and it is a real limit of using this total as a progress metric — **a three-point move is inside the noise unless the findings underneath it changed, and here only one of the three did.**

## Design Specificity Verdict

**Design review.** The centre of the page is unmistakably this product and both ends are not. Grounded: `BoardPeek` (five real players, one per position, `+145 / +138 / +85 / +72 / +68`, chips in the app's own `POS_CHALK`, plus `480 players · refreshed 6 hrs ago`); the grade card, verified again by hand as 50.95 → the printed **51**; the forecast table with its **−20**; the format toggle genuinely recomputing VORP across three rule sets (Gibbs 128 / 145 / 161); and `PROJECTION RB1 · MARKET RB1`, which prints agreement with the market rather than manufacturing a disagreement.

Interchangeable: the hero shell, and **the gradient**, which the reviewer calls "the least specific decision on the page" — it carries the primary card, the account Sign up and the closing CTA, three of the page's four loudest surfaces, and it is not in Juke's palette. The one component using Juke's own colours is the one component nobody else could build.

**Deterministic scan.** All seven sources returned 0, exit 0, identical with `--no-config` — so **the two sanctioned `bounce-easing` ignores suppressed nothing here**; they live in `index.css`, not in any target.

**And the scan's blind spot was proved this time rather than asserted.** A throwaway fixture with eight violations written as Tailwind utilities — `text-[8px]`, sub-44px targets, radius sprawl, `font-['Inter']`, a missing `alt`, an h1→h3 skip, a low-contrast pairing — returned **1 of 8**. The one caught was a literal `cubic-bezier` string that survives into source text. Regex mode sees literal CSS values and nothing computed, so a clean JSX result is a statement about source text, not about the rendered page.

**Rendered mode:** 263 findings, exit 2. Scoped in-page via `window.impeccableScan()` rather than the console: 1,673 element groups, 1,682 findings, **54 visible, 1,628 hidden, 1,621 of those inside `#view-app`**. **Only 3.2% of findings concern the homepage.** 140 of the 210 `undersized-ui-text` are the strings `1.0`…`14.0` — a 10×14 grid, the retired Draft Room board — and 14 of 15 `dark-glow` are `#ffd166`, its seat marker.

**Six false positives confirmed and rejected**, including one worth keeping for the next person: `layout-transition` fires on `transition-property: all`, which is the CSS *initial value* on every element with no transition at all — 14,214 of 14,260 elements report it. Filter on duration. Swept properly, exactly two elements in the document animate layout and both are hidden dialogs.

## Overall Impression

The proof section and the board panel are doing real work, and the reviewer verified both by hand without being told what they were meant to say. What has not moved is the frame around them: the hero is still the category default, the method the whole page argues for is still one 13px footer link, and the section's own rhetorical device now has a Juke feature wearing the loser's costume.

## What's Working

**The grade card is the most on-strategy object on the page.** `B · 5th of 10`, four weighted components, and a weighted sum that verifies: 17×.50 + 91×.25 + 94×.15 + 56×.10 = 50.95 → 51. The caption's "you can check it rather than believe it" is literally true, which is rarer than it sounds, and an expert-consensus business structurally cannot copy it.

**BoardPeek earns the fold**, and the one-per-position rule visibly pays off — four chip colours where a straight top-five would have been five identical mint RBs.

**Contrast and focus are genuinely clean and were both proved non-vacuous.** A composited sweep planted with a known-bad 1.08 control returns zero real failures at both widths; the five apparent hits are gradient artifacts, and the real ink runs 5.27–10.73. Under real `Tab` presses, **28/28 focusable elements match `:focus-visible` and carry a visible indicator, 0 on the UA default**, at both widths.

## Priority Issues

### [P1] The one interactive proof opens on its own null result — and on five running backs

Pair 2 defaults to Half PPR, which is the baseline `moved` is measured against, so all six rows render `—`. Worse: measured, Half PPR is RB×5 + WR, and **Standard is six RBs**. The convincing moment — a receiver leaping a back under PPR — needs a third button press. `BoardPeek`'s own source diagnoses this exact defect and fixes it there; pair 2 reproduces it 800px below, uncorrected. **Fix:** default to Standard with `moved` still measured against Half, so the default view opens on ▲1 / ▲3 / ▼3; and seed the rows one-per-position as BoardPeek does, so a format change moves players *across* positions, which is the actual claim.

**Suggested command:** `/impeccable animate`

### [P1] "Read-only. We never touch your league." does not exist on a phone

`TrustStrip` is `hidden sm:grid`. Measured across the full 375px page text: **`read-only` 0 occurrences, `never touch your league` 0**. The page asks for a league connection three times and, on the device most visitors use, never says what it does with one. PRODUCT.md names read-only as a promise. The component's own comment claims "a phone reaches the same claims by scrolling" — it does not. **Fix:** put it on the Connect card's own caption at every width, or as a line under the two hero cards beside "Free · no account needed". It belongs next to the ask.

**Suggested command:** `/impeccable clarify`

### [P1] The published method is linked once, at 13px, in the footer

`How it works` appears exactly one time, at y≈3,946 of 4,366. Not one of the four proof pairs links to its own section, though the anchors already exist — `#s06` the draft grade, `#s07` VORP, `#s02` data sources. The primary persona is defined by distrust of unexplained numbers, and the moment they most want a door is when `Weighted sum 51` appears. **Fix:** one text link at the foot of each lit cell, landing on the section it names.

**Suggested command:** `/impeccable clarify`

### [P2] The dashed hairline means two opposite things, 900px apart

The hero's "Or draft with friends" row and all four "what you're handed" cells compute to an identical `1px dashed rgb(42,49,56)`. `HomeProof`'s source says the flat cell deliberately borrows "the idiom the hero's own draft-with-friends row already uses" — and then assigns that idiom to the thing being argued against. A shipped Juke feature is wearing the loser's costume, which weakens both readings. **Fix:** give the flat cells their own treatment — no border, a recessed ground, muted ink — and let the dashed hairline mean "a secondary Juke action" everywhere.

**Suggested command:** `/impeccable polish`

### [P2] The two primary CTA cards are 20px out of alignment

Measured at 1440: both cards top at y=482, both 178px tall, identical padding — but `PRACTICE` sits at y=566 against `BRING YOUR LEAGUE` at y=545, and `Mock Draft` at y=586 against `Connect` at y=566. The Connect card's caption wraps to two lines and `justify-between` bottom-anchors the block, floating it up, with "soon" orphaned. The rooms strip has the same defect: `The Prospect Room` wraps to a 46px title where the other four are 21–23px. **Fix:** reserve two lines for the caption in `em` so the block height is constant regardless of copy length, and do the same for the rooms strip's titles.

**Suggested command:** `/impeccable layout`

## Persona Red Flags

**The analytical drafter.** `B` at 52px beside `5th of 10` at 13px, above a 50%-weighted Starter strength reading **17** with a bar 17% full — they will check the arithmetic (it holds), then ask why half the grade at 17/100 yields a B, then find the answer 300px below in 13px muted type. "We grade our own forecasts" is carried by **one player, three seasons**, chosen because his record contains a miss — and this persona knows what n=1 buys. The aggregate exists (r 0.83/0.79/0.72 against 0.58/0.57/0.59 for the naive predictor, MAE 6.8) and none of it is on the page.

**The engaged manager.** Arrives at "any major platform", learns 200px later that two of four are "soon", then finds three of five rooms padlocked. On a phone, is asked to connect a league and told nothing about what happens to it. The header carries no navigation at all, so surveying the product means scrolling 6,956px.

**The group-chat sceptic.** The primary card's icon (`#0D2E36` on its own gradient) recedes while the *secondary* card's teal arrow is the brightest glyph on screen — icon hierarchy inverted against CTA hierarchy. Second-loudest object on the first screen is an account ask, on a page captioned "Free · no account needed".

## Minor Observations

- **`KickoffPill` renders nothing at either width.** Both its homes are empty, so the hero eyebrow row's elaborate 375px wrap-protection is guarding a component that is not there.
- **Phone H1 still breaks `KNOW THE / MOVE / BEFORE YOUR / LEAGUE.`** — the clamp fixed desktop to three lines; on a phone "MOVE", the headline's operative noun, is still orphaned by the hard-coded `<br />`.
- **`HomeProof`'s comment claiming no global focus style is stale** — measured, every focusable element has one, and the three format buttons carry a second redundant ring.
- The account card's Sign up and Log in are equal-width `flex-1` pills; ShellHeader's own source argues two equally weighted controls in a row break the one-primary-action rule and makes Log in plain text. The card 400px below does the opposite.
- Standard format ranks Derrick Henry **+90** at 4 and James Cook III **+90** at 5 — identical values, ranked, no tiebreak shown.
- Format buttons are 88×37 — under 44px on touch, and they are the page's only interactive proof.
- Left-column void in the proof section: **73 / 226 / 339 / 140px**, about 778px across four pairs.
- **146px of empty** between the closing caption and the footer.
- Phone rooms strip renders in three different card shapes (two full-width horizontal, two half-width vertical, one full-width vertical with ~90px empty to its right).
- Three `<h1>`s in the document; the first two read "The Draft Room" at 10px and are `display:none`, so out of the a11y tree — but they are what a non-CSS crawler reads first.

## Questions to Consider

1. **The hero sells season-long league tracking; the CTAs, the board panel and all 2,384px of proof sell mock drafting.** Which product is this page for — and if it is the mock draft, why does the only sentence explaining the product name the half that is mostly padlocked?
2. **The gradient carries three of the page's four loudest surfaces and is not in the product's palette.** What does the page look like if it is deleted and brand teal plus the position chalks are the only accents left?
3. **The page argues four times that a number without its working is worthless, then prints "Weighted sum 51" with no link to the document deriving the weights.** Where do you actually expect the reader to go?
4. **"We grade our own forecasts" rests on one player chosen for containing a miss, when the aggregate is in hand.** Which convinces someone who distrusts expert consensus — and why is the anecdote the one on the page?
