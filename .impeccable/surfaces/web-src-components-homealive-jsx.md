---
version: 1
slug: "web-src-components-homealive-jsx"
primary_target: "web/src/components/HomeAlive.jsx"
related_targets: ["web/src/components/Homepage.jsx"]
---

# Homepage (`#/`)

Scope: `HomeAlive.jsx` (the page body) and the `Homepage.jsx` shell it mounts
into. Visitor mode: **Persuade**.

Audience: the analytical drafter, arriving suspicious of ranking sites. Job:
decide whether this tool is honest enough to spend a draft on. Action: start a
mock draft (free, no account) — or connect a league.

Proof available, all of it real: the live board, `overallScore()` and
`replacementGap()`, the editable scoring table, `analyseDraft()`'s four
weighted components, and `projectionRecord()`'s forecast-against-outcome. No
social proof exists and none may be invented — pre-launch, no users, no
revenue, no testimonials.

Fork: **stranger-first, light.** Signed-in state stays as today (account card
becomes connect card, "no account needed" hides). Revisit when there are
returning users to serve.

## Direction contract

**THESIS:** Every claim is one confrontation — a number handed over without
reasons, and the same number with its working beside it. Refuses the
hero-plus-benefit-cards homepage this category ships, where the proof is an
adjective.

**OWN-WORLD:** Inherited v3_alive, unchanged. Ground `#0D0F15`, cards
`#13161C`, hairline `#252930`; teal `#00E5FF` for action only; mint `#74E5CE`
for the overline; room accents on room cards. Gabarito italic caps display,
Hanken Grotesk body, IBM Plex Mono numerals and labels. New and only new: one
vertical seam down the page. Left of it is flat, unlit, no tabular figures.
Right of it is live board data, lit, mono numerals.

**STORY:** A stranger arrives distrusting ranking sites. Four pairs later they
have watched a rank become a reason, seen their own scoring rules move every
number, seen a draft graded in four visible parts, and seen a forecast graded
against what actually happened. They start a mock, free, without an account.

**FIRST VIEWPORT:** Headline left (Gabarito 88 / 72 / 54), mint overline and
kickoff pill above it, account-or-connect card right, and the two action cards
kept where they are — Persuade requires the primary action visible in the
opening, and on a 375px phone the pair cannot start above the fold. The seam
opens immediately beneath them: left cell a bare rank with no reasoning, right
cell the same player with projected points, replacement level and the gap that
makes the score. Amended from "Mock Draft sits in the right half"; the reason
is recorded here rather than diverging silently.

**FORM:** Unexplained / Explained. Position 7 of 7 on the ordered structural
list — dealt lead by seed key `af2ad9a0`, indices 7, 1, 5.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance

## Resolved during the build

- **The seam's phone form.** Below `lg` the cells stack and the centre line
  has no middle to sit on. The first build dropped it, which closed this risk
  by deleting the device; `<Joint />` is the answer instead — the same 1px
  hairline turned through ninety degrees, running out of the flat cell into
  the lit one, so a pair still reads as one argument with two sides.

## Unresolved

- The signed-in fork above the fold, deferred above.
- Three of the grade's four components are min-max scaled against their own
  room and one is absolute. The section states this rather than hiding it,
  but a bar chart mixing the two scales is a real readability question that
  the in-app dashboard has not solved either.
