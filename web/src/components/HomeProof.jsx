import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/* The homepage's argument, and the one structure it commits to.

   Four pairs down a single seam. Left of the seam is the number a reader
   is handed anywhere else in this category — a rank, a fixed scoring
   table, a finished board, a confident claim — drawn flat, unlit, with no
   tabular figures. Right of the seam is the same number with its working,
   drawn on a real surface out of live board data.

   The seam runs beside the CELLS and stops at every heading, and that is
   a correction rather than a compromise. It shipped as one absolutely
   positioned rule spanning the whole section, on the reasoning that a line
   restarting at each heading would read as four unrelated comparisons —
   and that reasoning ignored what the headings are. Each `<h2>` spans both
   columns, because the claim belongs to the pair rather than to either
   side of it, so a full-height rule at the centre runs straight through
   all four of them: measured at 1440, a 2,260px line at x=713 crossing
   four heading boxes running 113 to 1313. Reported as text bleeding
   through the line, which is exactly what it was.

   A seam separates two things. At a heading there is one thing, so there
   is nothing to separate and no line — and the four segments still read as
   one system because they sit at the same x with the same weight. What
   would have been wrong is a border per CARD, which is a different thing
   entirely: that draws a box, this draws a division.

   ---- Everything here is computed, and that is the point ----

   PRODUCT.md's binding principle is that every number is explainable on
   the page where it appears, and a page arguing that with invented
   figures would be the product contradicting itself in its own first
   screenful. So: no sample players, no illustrative scores, no rounded-off
   "typical" grade. Every figure below comes off window.JukeEngine — the
   same board, the same projections, the same grade the Draft Room runs —
   and when the engine cannot answer, the pair draws its skeleton and says
   nothing rather than filling the slot.

   There is also nothing to keep in sync. The board is regenerated nightly
   and this section follows it, which is the same argument renderHeroShot()
   already makes for the product shot: a screenshot would be a file to
   rebuild every time the data moved, and wrong the first time somebody
   forgot. */

/* Compute when the reader is nearly here, never at mount.

   Three of the four pairs are genuinely expensive — vorpUnder() walks the
   whole board per format and thirdRoundScenarios() runs three full draft
   simulations — and this is a marketing page whose own measured problem is
   time-to-interactive, not first paint. CLAUDE.md is explicit that app.js
   costs 933ms of DOMContentLoaded on a phone; spending three draft sims on
   top of that, above the fold, for a section most of the viewport has not
   reached yet, would be paying the worst possible bill at the worst
   possible moment.

   200px of rootMargin so the work starts before the pair is on screen and
   the skeleton is rarely seen. Disconnects on first hit: this is a reveal,
   not a subscription. */
function useNearViewport() {
  const ref = useRef(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // No IntersectionObserver (or a prerender pass with no window) means
    // compute immediately rather than never. A section that stays a
    // skeleton forever is a worse failure than one that costs its work
    // early, and this is the branch a crawler and a very old browser take.
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)

    /* A deadline, because a deferral that never fires is a section that is
       blank for ever — and the failure is silent, which is the worst pair.

       Found in verification rather than reasoned about: driving the page in
       an emulated 3900px-tall viewport, the observer produced no callback at
       all for an element sitting at top: 1034 well inside it, so every pair
       stayed a skeleton. That particular case is the harness rather than a
       browser anyone uses — the same observer fires correctly at 1280x720 —
       but a deferral whose only exit is an event nothing guarantees does not
       deserve the benefit of the doubt on a marketing page.

       Three seconds: long enough that an ordinary reader who scrolls has
       already tripped the observer and paid nothing extra, short enough that
       a reader who does not scroll still gets a rendered section rather than
       four empty boxes. */
    const deadline = setTimeout(() => {
      setNear(true)
      io.disconnect()
    }, 3000)

    return () => {
      clearTimeout(deadline)
      io.disconnect()
    }
  }, [])

  return [ref, near]
}

/* The engine, once it can actually answer.

   window.JukeEngine exists almost immediately — app.js is a classic script
   — while players.js, stats.js and draft-engine.js are deferred behind the
   cold-load reveal, so `engine` being present says nothing about whether
   there is a board to read. dataReady() is the real question, which is the
   guard CLAUDE.md records DraftLocker.jsx learning the hard way.

   Both events, deliberately. `juke:data-loaded` is the one that fires when
   the deferred files land, which is the transition this hook exists for;
   `juke:header` fires on every render() and is what carries a later change
   (a scoring edit made in the Draft Room, then a walk back to the
   homepage). Listening to only the first leaves this section describing a
   league the reader has since changed. */
/* What would make any figure on this section different.

   Cheap on purpose: it is compared on every `juke:header`, which is once
   per pick AND once per clock tick, so it has to cost far less than the
   reads it guards. Board length and the league's shape are three property
   reads; the rules digest is a sum over 49 numbers, which is what catches
   a scoring edit — the one change that moves every projection without
   moving anything else here. */
function changeKey(engine) {
  const board = engine.board()
  const league = engine.league()
  if (!board || !league) return null
  let rules = 0
  const table = league.rules || {}
  for (const k in table) {
    const v = table[k]
    if (typeof v === 'number') rules += v
  }
  return `${board.length}|${league.teams}|${league.rounds}|${league.scoring}|${rules}`
}

function useEngineData(read, enabled) {
  const [data, setData] = useState(null)
  const lastKey = useRef(null)

  useEffect(() => {
    if (!enabled) return
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return

    const run = () => {
      if (!engine.dataReady || !engine.dataReady()) return

      /* The guard that keeps a marketing section off the pick clock.

         `juke:header` fires from headerInfo() on every render(), and
         render() runs on every tick of a live draft. applyRoute() hides
         #view-home during a draft but React never unmounts it, so without
         this the three uncached reads below — 480 overallScore() calls,
         three full vorpUnder() board walks, and a projectionRecord() walk —
         ran once a second, off-screen, for the whole draft. That is the
         exact bill the deferral at the top of this file exists to avoid,
         arriving through a door the deferral does not cover: it gates the
         FIRST read and says nothing about the hundredth.

         It also stopped every pair re-rendering per tick, which had
         framer-motion re-measuring six layout items a second for a list
         nobody was looking at. */
      const key = changeKey(engine)
      if (key !== null && key === lastKey.current) return

      try {
        const next = read(engine)
        if (next) {
          lastKey.current = key
          setData(next)
        }
      } catch {
        // A throw here costs the pair and must never cost the page. Same
        // contract as the score strip: it fails by disappearing.
        setData(null)
      }
    }

    run()
    window.addEventListener('juke:data-loaded', run)
    window.addEventListener('juke:header', run)
    return () => {
      window.removeEventListener('juke:data-loaded', run)
      window.removeEventListener('juke:header', run)
    }
    // `read` is a fresh closure every render and is only ever read inside
    // the effect, so keying on it would resubscribe on every render for no
    // change in behaviour. `enabled` is the only input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return data
}

// ---------------------------------------------------------------------------
// Shared shells
// ---------------------------------------------------------------------------

/* The two sides, as components, so the flat/lit contrast is declared once.

   Flat is not "disabled" and must not read as broken: it is a complete,
   confident answer that simply has nothing behind it, which is exactly the
   thing being argued about. Body face, muted ink, and deliberately no
   tabular figures — the mono numerals are the tell that a number was
   measured, and they belong on the other side of the seam.

   ---- It was a dashed hairline, and that was the wrong borrowing ----

   The first version took "the idiom the hero's own draft-with-friends row
   already uses", and that row is a live Juke feature. Measured, the two
   computed to an identical `1px dashed rgb(42,49,56)` 900px apart — so the
   page's own device for "the inferior thing somebody else hands you" was
   also its device for "a secondary Juke action". A shipped feature wearing
   the loser's costume weakens both readings, and the section's whole
   rhetoric is that costume.

   It is a recessed well now: no border, a ground darker than the page,
   against a lit card raised above it. That reads as depth rather than as a
   second kind of card, it needs no new token, and it leaves the dashed
   hairline free to mean one thing everywhere. */
function Flat({ label, children }) {
  return (
    <div className="rounded-[18px] bg-black/30 px-5 py-6 sm:px-6 sm:py-7">
      <span className="mb-4 block font-mono text-[10px] uppercase tracking-[0.14em] text-voidInk-muted lg:hidden">
        {label}
      </span>
      {children}
    </div>
  )
}

function Lit({ label, children }) {
  return (
    <div className="rounded-[18px] border border-line-hairline bg-surface-card px-5 py-6 sm:px-6 sm:py-7">
      <span className="mb-4 block font-mono text-[10px] uppercase tracking-[0.14em] text-teal lg:hidden">
        {label}
      </span>
      {children}
    </div>
  )
}

/* One pair: a claim spanning both columns, then the two cells under it.

   The heading spans rather than sitting in the left column, because it is
   not one side's claim — it is the question both cells answer. */
/* The seam's phone form.

   Below `lg` the two cells stack and the centre line has no middle to sit
   on, so the first build simply dropped it — which closed the brief's own
   unresolved risk ("it must not simply stack into two unrelated blocks")
   by deleting the device rather than by finding its phone form. The
   dashed-versus-solid border carries some of the distinction, but the
   FORM's one own-world element was then absent on the viewport most
   visitors use.

   Same 1px hairline, same token, turned through ninety degrees: it runs
   out of the flat cell and into the lit one, so a pair still reads as one
   argument with two sides rather than two boxes that happen to be
   adjacent. */
function Joint() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-5 left-1/2 h-5 w-px -translate-x-1/2 bg-line-hairline lg:hidden"
    />
  )
}

function Pair({ claim, children }) {
  return (
    <>
      {/* The heading spans both columns in the GRID, because the claim
          belongs to the pair rather than to either side of it — but its
          text is capped at the left column's own content width so no glyph
          ever crosses the seam's axis.

          Breaking the rule at the heading rows was not enough, and that is
          the part worth writing down: a seam establishes a vertical axis,
          and the eye continues that axis through the gap. Measured at
          1440 with the line already broken, two headings still ran past it
          — "Your rules, or somebody else's." to 738 against a seam at 713,
          and "Where every other mock stops." to 740. Reported both times,
          because both times it was true.

          `calc(50% - 3rem)` is the grid's half minus the left cell's own
          `pr-12`, so a heading wraps exactly where the flat cell beneath it
          ends and the two share an edge. */}
      {/* The heading row carries the seam across itself.

          The seam is `lg:border-l` on each right cell, and the heading rows
          span both columns -- so the line stopped at every heading and
          started again after it. Measured at 1440: four segments of 420,
          500, 625 and 378px separated by three gaps of 141, which is
          exactly this row (a 4rem margin plus a two-line heading). The
          direction contract names "one vertical seam down the page" as the
          single new device on this page, and 18% of it was missing, in
          three even bites, precisely where the eye carries it anyway.

          A full-height absolute rule is how this was drawn the FIRST time
          and it is what put a line through four headings -- reported twice.
          What makes a connector safe now is the cap that fixed that: the
          heading is `max-w-[calc(50%-3rem)]`, so its ink stops 3rem short
          of the axis and cannot reach the line at any width.

          The wrapper exists because the cap is on the heading itself, so
          `left-1/2` inside it would resolve against half the grid rather
          than the whole of it. The wrapper takes the margin too -- the
          connector reaches up through it to meet the cell above, which is
          where two thirds of each gap actually was. */}
      <div className="relative mt-14 sm:mt-16 lg:col-span-2">
        <h2 className="font-display text-[26px] font-extrabold uppercase italic leading-[1.02] text-white sm:text-[32px] lg:max-w-[calc(50%-3rem)] lg:text-[38px]">
          {claim}
        </h2>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-14 bottom-0 left-1/2 hidden w-px bg-line-hairline sm:-top-16 lg:block"
        />
      </div>
      {children}
    </>
  )
}

/* The door to the working, at the point the working is claimed.

   The published method is this product's stated first differentiator, and
   it was linked exactly once on the whole page: 13px, footer, third
   column, y~3,946 of 4,366. Not one proof pair linked to its own section,
   though the anchors already existed. A page that spends 2,384px arguing
   "we show our working" and never offers the working is arguing against
   itself, and the reader who most wants that door is the one this product
   is built for.

   Each link names the section it actually reaches, which is the rule
   Homepage.jsx already learned the hard way: a footer link labelled "How
   scoring works" pointed at a section about league settings, so somebody
   clicking to learn how points are calculated got a summary of roster
   defaults. The label owes the reader the section, not the claim above it.

   Pair 4 deliberately has no link. Its subject is the projection's own
   record against outcomes, and no section of the document covers that —
   pointing it at "Where the numbers come from" would repeat exactly the
   mistake above. A missing door beats one that opens on the wrong room. */
function MethodLink({ href, children }) {
  return (
    <a
      href={href}
      /* min-h, because an inline anchor is only as tall as its text: these
         measured 18px high. The link sits under a proof pair with room
         beneath it, so a 44px target costs nothing here and is the one
         route from a claim to the working behind it. */
      className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-teal underline-offset-4 transition-colors duration-150 hover:text-white hover:underline"
    >
      {children}
      <span aria-hidden="true">&rarr;</span>
    </a>
  )
}

function Skeleton({ lines = 4 }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/[0.04]" style={{ width: `${92 - i * 13}%` }} />
      ))}
    </div>
  )
}

// A figure and what it measures. Mono and tabular, because every one of
// these is a measurement rather than a label.
function Line({ label, value, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-divider py-2.5 last:border-b-0">
      <span className="text-[13px] leading-tight text-voidInk-body">{label}</span>
      <span
        className={`shrink-0 font-mono text-[14px] tabular-nums ${accent ? 'text-gain' : 'text-white'}`}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. A rank is not a reason
// ---------------------------------------------------------------------------

/* The player this pair argues about is chosen by the board, not by us.

   Highest Juke score on tonight's board, which is 100 by construction —
   overallScore() is a share of the best figure available, so somebody is
   always 100 and it is whoever the projection currently likes most. A
   hard-coded name would be wrong within a night of somebody getting hurt.

   posRank is the market's own within-position rank, read off ADP order,
   and CLAUDE.md is emphatic that it measures when a player is taken rather
   than what he is worth — which is the whole confrontation. The left cell
   is not a straw man: it is the number this category actually ships. */
function readHeadline(engine) {
  const board = engine.board()
  if (!board || !board.length) return null

  let best = null
  let bestScore = -1
  for (const p of board) {
    const score = engine.overallScore(p)
    if (score === null || score === undefined) continue
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  if (!best) return null

  const readout = engine.jukeReadout(best)
  if (!readout || readout.score === null || readout.gap === null) return null

  // Every player at his position, by value over replacement, so the card can
  // say what the next ranks actually cost.
  const samePos = board
    .filter((p) => p.pos === best.pos)
    .map((p) => engine.replacementGap(p))
    .filter((g) => g !== null && g !== undefined)
    .sort((a, b) => b - a)
  const gapRounded = Math.round(readout.gap)
  const stepTo = (i) =>
    samePos.length > i ? Math.round(gapRounded - Math.round(samePos[i])) : null

  return {
    name: best.name,
    pos: best.pos,
    team: best.team,
    posRank: best.posRank,
    projPts: best.projPts === null || best.projPts === undefined ? null : Math.round(best.projPts),
    score: readout.score,
    gap: readout.gap,
    replacementRank: readout.replacementRank,
    /* What the next ranks are worth, which is the argument.

       This was `PROJECTION RB1 · MARKET RB1` — both ranks side by side, on
       the reasoning that the honest answer changes with the board. It does,
       and tonight the honest answer is that they agree, so the card headed
       "a rank is not a reason" closed by reporting that the rank was right.
       The critique caught it as the section arguing against itself.

       Picking a player where they disagree was the obvious repair and the
       data refuses it: measured, the largest disagreement among players
       scoring 40 or more is ONE rank (Barkley +1, Chase Brown -1). A
       one-place difference demonstrates nothing, and manufacturing a bigger
       one means reaching into the deep bench where every score is 0.

       So the card answers the question the flat cell actually asks instead.
       That cell says a rank "cannot tell you how far ahead of second he is,
       or whether the gap down to fifth is worth a round of your draft" —
       and those are two numbers this board has. Tonight: 7 and 54, from
       ranks that look evenly spaced and are not (RB2 to RB3 is 36 points,
       RB3 to RB4 is 2). */
    stepToSecond: stepTo(1),
    stepToFifth: stepTo(4),
    boardSize: readout.boardSize,
  }
}

function PairRankReason() {
  const [ref, near] = useNearViewport()
  const d = useEngineData(readHeadline, near)

  return (
    <Pair claim="A rank is not a reason.">
      <div ref={ref} className="lg:pr-12">
        <Flat label="What you're handed">
          {d ? (
            <>
              <span className="block font-display text-[54px] font-extrabold uppercase italic leading-none text-voidInk-muted sm:text-[64px]">
                {d.pos}
                {d.posRank}
              </span>
              <span className="mt-3 block text-[14px] text-voidInk-body">{d.name}</span>
              {/* Deliberately not "the market has him wrong". Measured on
                  the 9 September board, the market's own order and the
                  projection's agree exactly for every player at the top —
                  so claiming a disagreement would be inventing one. What
                  is true of any rank is that it is an ordinal: it orders
                  names and cannot express the size of the step between
                  two of them, which is the thing the right-hand cell
                  answers in points. */}
              <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.5] text-voidInk-muted">
                That is the entire answer. It puts him first in a line and stops — it cannot tell
                you how far ahead of second he is, or whether the gap down to fifth is worth a
                round of your draft.
              </p>
            </>
          ) : (
            <Skeleton lines={3} />
          )}
        </Flat>
      </div>

      <div className="relative mt-5 lg:mt-0 lg:border-l lg:border-line-hairline lg:pl-12">
        <Joint />
        <Lit label="What Juke shows">
          {d ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-display text-[22px] font-extrabold uppercase italic leading-none text-white sm:text-[26px]">
                  {d.name}
                </span>
                <span className="shrink-0 font-mono text-[30px] tabular-nums leading-none text-evidence sm:text-[36px]">
                  {d.score}
                </span>
              </div>
              {/* What the number is a share OF.

                  overallScore() divides by the best figure on the board, so
                  whoever leads always scores exactly 100 — and a bare 100
                  with no denominator, on the page arguing that no number
                  should be taken on trust, is the sharpest self-
                  contradiction the critique found. The three lines below
                  explain +145; none of them explained 100. */}
              <p className="mt-2 text-[13px] leading-[1.5] text-voidInk-muted">
                100 is the most value on tonight&apos;s board. Every other score is a share of his.
              </p>
              <div className="mt-5">
                {d.projPts !== null && <Line label="Projected this season" value={`${d.projPts} pts`} />}
                <Line
                  label={`A replaceable starter (${d.replacementRank})`}
                  value={d.projPts !== null ? `${d.projPts - d.gap} pts` : '—'}
                />
                <Line label="What you actually gain" value={`+${d.gap} pts`} accent />
              </div>
              <p className="mt-5 max-w-[42ch] text-[14px] leading-[1.5] text-voidInk-body">
                That is the number a rank cannot carry — and it is the one you are actually
                choosing between when two names sit next to each other on a board.
              </p>
              {(d.stepToSecond !== null || d.stepToFifth !== null) && (
                <p className="mt-3 text-[13px] leading-[1.5] text-voidInk-body">
                  {d.stepToSecond !== null && (
                    <>
                      Second at his position is{' '}
                      <span className="font-mono tabular-nums text-white">{d.stepToSecond}</span>{' '}
                      points back.{' '}
                    </>
                  )}
                  {d.stepToFifth !== null && (
                    <>
                      Fifth is{' '}
                      <span className="font-mono tabular-nums text-white">{d.stepToFifth}</span>.
                    </>
                  )}
                </p>
              )}
              <MethodLink href="/docs/draft-room-how-it-works.html#s07">
                How the Juke score is built
              </MethodLink>
            </>
          ) : (
            <Skeleton />
          )}
        </Lit>
      </div>
    </Pair>
  )
}

// ---------------------------------------------------------------------------
// 2. Your rules, or somebody else's
// ---------------------------------------------------------------------------

const FORMATS = ['standard', 'half', 'ppr']

/* Six players, ranked by value over replacement under one format's rules.

   vorpUnder() is the real table — the same pointsUnder() the Draft Room
   scores with, under rulesForFormat() — so this is not a demonstration of
   re-ranking, it is the re-ranking. Kickers and defenses answer null there
   (UNRANKED_POSITIONS) and drop out, which is correct and needs no note on
   a top-six list.

   `moved` is each player's change in rank against half PPR, the app's own
   default. It exists because the movement is the argument and an animation
   alone cannot state it: a reader who has scrolled past the transition, or
   who has reduced motion on, still needs to see that the order changed. */
function readFormats(engine) {
  const board = engine.board()
  if (!board || !board.length) return null

  const rank = (format) => {
    const table = engine.vorpUnder(format)
    return board
      .map((p) => ({ p, row: table[p.id] }))
      .filter((r) => r.row && r.row.vorp !== null && r.row.vorp !== undefined)
      .sort((a, b) => b.row.vorp - a.row.vorp)
      .map((r) => ({ id: r.p.id, name: r.p.name, pos: r.p.pos, vorp: Math.round(r.row.vorp) }))
  }

  const ranked = {}
  for (const f of FORMATS) ranked[f] = rank(f)
  if (!ranked.half.length) return null

  /* ONE set of players, re-ranked under each format — not the top six of
     each, computed independently.

     Two reasons, and the second is the argument this pair exists to make.

     Independently-computed lists mean rows appear and disappear between
     formats: Derrick Henry is in Standard's top six and out of PPR's. A
     reader watching that cannot tell reordering from replacement, and the
     `layout` animation has nothing coherent to animate — it is not a list
     rearranging, it is a different list.

     And the set has to span positions or the claim cannot be seen. The top
     six by value over replacement is five running backs and a receiver
     under half PPR, and SIX running backs under standard — measured. A
     scoring change that only ever moves running backs past running backs
     demonstrates that the order is sensitive to rules; it does not
     demonstrate the thing Juke actually claims, which is that the rules
     move positions past each other. This is the same defect BoardPeek was
     carrying in the hero, 800px up, and it takes the same fix. */
  const seed = []
  const taken = new Set()
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const best = ranked.half.find((r) => r.pos === pos && !taken.has(r.id))
    if (best) {
      seed.push(best)
      taken.add(best.id)
    }
  }
  for (const r of ranked.half) {
    if (seed.length >= 6) break
    if (!taken.has(r.id)) {
      seed.push(r)
      taken.add(r.id)
    }
  }
  if (!seed.length) return null

  // Where this fixed set sits under half PPR, which is what every move is
  // measured against. Rank within the SET, not within the whole board:
  // a reader comparing two rows on screen is comparing their positions in
  // the six rows on screen.
  const order = (format) => {
    const table = new Map(ranked[format].map((r) => [r.id, r]))
    return seed
      .map((s) => table.get(s.id))
      .filter(Boolean)
      .sort((a, b) => b.vorp - a.vorp)
  }
  /* Measured against STANDARD, not half.

     The arrow used to be "the move against half PPR", which made half the
     one format that could never show one — and half is this app's default
     and most leagues'. Against standard, the leanest ruleset, both PPR
     formats show real movement and only standard itself is flat, which is
     self-explaining because it is the thing being compared to. */
  const baseline = new Map(order('standard').map((r, i) => [r.id, i]))

  const out = {}
  for (const f of FORMATS) {
    out[f] = order(f).map((r, i) => ({
      ...r,
      moved: baseline.has(r.id) ? baseline.get(r.id) - i : null,
    }))
  }
  return { ranked: out, names: engine.scoringNames() }
}

function PairYourRules() {
  const [ref, near] = useNearViewport()
  const d = useEngineData(readFormats, near)
  /* Standard, not half.

     `moved` is measured against half PPR, so defaulting to half rendered
     six em-dashes — the page's one interactive proof opening on its own
     null result, under a heading promising the order changes.

     Standard fixed that and bought a worse problem: BoardPeek in the hero
     reads the LIVE league, which is half PPR, so the same player carried
     two different numbers under the same words 1,000px apart — Gibbs at
     +145 up there and +128 down here, with nothing on the page reconciling
     them. That is this product's binding principle failing on the two
     panels that exist to demonstrate it.

     So the default is half, matching the hero and the app, and the arrow
     moved to a standard baseline instead — which is what lets half open on
     movement rather than on dashes. Both problems, one change. */
  const [format, setFormat] = useState('half')
  const reduce = useReducedMotion()

  const rows = d ? d.ranked[format] : null

  return (
    <Pair claim="Your rules, or somebody else's.">
      <div ref={ref} className="lg:pr-12">
        <Flat label="What you're handed">
          <span className="block font-display text-[30px] font-extrabold uppercase italic leading-[1.05] text-voidInk-muted sm:text-[36px]">
            One scoring
            <br />
            table
          </span>
          <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.5] text-voidInk-muted">
            Built for a league that is probably not yours. Every ranking downstream of it inherits
            assumptions you never agreed to, and none of them are shown to you.
          </p>
        </Flat>
      </div>

      <div className="relative mt-5 lg:mt-0 lg:border-l lg:border-line-hairline lg:pl-12">
        <Joint />
        <Lit label="What Juke shows">
          {/* The page's one authored interaction. Everything else on this
              screen is still; this moves because the movement IS the
              claim — the order is not decoration on top of the argument,
              it is the argument. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scoring format">
            {FORMATS.map((f) => {
              const on = f === format
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFormat(f)}
                  /* An explicit focus ring, themed. These are the only
                     controls this section adds, and the page ships no
                     global focus-visible style — so a keyboard reader
                     would otherwise get the browser's default outline,
                     which belongs to no design system and is close to
                     invisible on this ground. */
                  className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card ${
                    on
                      ? 'bg-teal text-[#0B0E14]'
                      : 'border border-line-hairline text-voidInk-body hover:border-teal/40 hover:text-white'
                  }`}
                >
                  {d ? d.names[f] : f}
                </button>
              )
            })}
          </div>

          {rows ? (
            <ol className="mt-5">
              {rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  layout={!reduce}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="flex items-baseline gap-3 border-b border-line-divider py-2.5 last:border-b-0"
                >
                  <span className="w-5 shrink-0 font-mono text-[13px] tabular-nums text-voidInk-muted">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-white">{r.name}</span>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-voidInk-muted">
                    {r.pos}
                  </span>
                  {/* A mark, not a colour-only signal: the arrow carries
                      the direction on its own for anyone who cannot
                      separate the two hues. */}
                  <span
                    className={`w-11 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                      r.moved > 0 ? 'text-gain' : r.moved < 0 ? 'text-cost' : 'text-voidInk-muted'
                    }`}
                  >
                    {r.moved ? `${r.moved > 0 ? '▲' : '▼'}${Math.abs(r.moved)}` : '—'}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[14px] tabular-nums text-gain">
                    +{r.vorp}
                  </span>
                </motion.li>
              ))}
            </ol>
          ) : (
            <div className="mt-5">
              <Skeleton lines={5} />
            </div>
          )}

          <p className="mt-5 max-w-[46ch] text-[13px] leading-[1.5] text-voidInk-muted">
            Points over replacement, recomputed from raw stats under each rule set. The arrow is the
            move against standard scoring. Juke has 49 of these rules and every one of them is yours to
            change.
          </p>
          <MethodLink href="/docs/draft-room-how-it-works.html#s03">
            How your league shapes the board
          </MethodLink>
        </Lit>
      </div>
    </Pair>
  )
}

// ---------------------------------------------------------------------------
// 3. Where every other mock stops
// ---------------------------------------------------------------------------

const COMPONENT_LABEL = {
  starters: 'Starter strength',
  value: 'Draft value',
  build: 'Roster construction',
  byes: 'Bye week safety',
}

/* A complete graded draft, not a described one and not a partial one.

   The first version of this read thirdRoundScenarios(), which stops two
   picks past the third round — and measured on the 9 September board that
   grade came back with build 0, byes 50 and starters 100 for both cuts,
   only draft value moving at all. Four bars with three of them frozen
   argues the opposite of the claim above them. sampleGradedDraft() runs
   the same simulation to the last pick instead and grades the room.

   The median finishing team, chosen by rank rather than by which
   components look best: every seat in that room drafts to one rule, so
   nobody out-drafts anybody and showing the winner would be showing the
   scaling's own top end.

   The letter stands beside its rank and never beside a score out of a
   hundred — "B+ · 5th of 10" is internally consistent because the rank
   says exactly what the letter means, which is the repair CLAUDE.md
   records for a letter that used to sit above a bare 69. The weighted sum
   is the one figure that does stay: four bars that visibly add up to it
   are the reconciliation, and it is what lets a reader check the grade
   rather than take it. */
function readGrade(engine) {
  if (!engine.sampleGradedDraft) return null
  const room = engine.sampleGradedDraft()
  if (!room || !room.teamsRanked || !room.teamsRanked.length) return null

  const weights = engine.gradeWeights ? engine.gradeWeights() : null
  if (!weights) return null

  const median = room.teamsRanked[Math.ceil(room.teams / 2) - 1] || room.teamsRanked[0]

  return {
    teams: room.teams,
    rounds: room.rounds,
    rank: median.rank,
    grade: median.grade,
    composite: median.composite,
    components: Object.keys(COMPONENT_LABEL).map((key) => ({
      key,
      label: COMPONENT_LABEL[key],
      value: median.components[key],
      weight: Math.round(weights[key] * 100),
    })),
  }
}

function ordinal(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}

function PairGraded() {
  const [ref, near] = useNearViewport()
  const d = useEngineData(readGrade, near)

  return (
    <Pair claim="Where every other mock stops.">
      <div ref={ref} className="lg:pr-12">
        <Flat label="What you're handed">
          <ul className="space-y-2.5 text-[14px] text-voidInk-muted">
            <li>A finished board.</li>
            <li>Your roster, listed.</li>
            <li>A button.</li>
          </ul>
          <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.5] text-voidInk-muted">
            You drafted for an hour and nothing told you whether it went well. The one question you
            came to answer is the one nobody answers.
          </p>
        </Flat>
      </div>

      <div className="relative mt-5 lg:mt-0 lg:border-l lg:border-line-hairline lg:pl-12">
        <Joint />
        <Lit label="What Juke shows">
          {d ? (
            <>
              {/* The letter with its rank, never with a score out of a
                  hundred: the rank is what makes the letter mean
                  something, and the two together need no explaining. */}
              <div className="mb-6 flex items-baseline gap-3">
                <span className="font-display text-[44px] font-extrabold uppercase italic leading-none text-white sm:text-[52px]">
                  {d.grade}
                </span>
                <span className="font-mono text-[13px] tabular-nums text-voidInk-body">
                  {ordinal(d.rank)} of {d.teams}
                </span>
              </div>
              <div className="space-y-4">
                {d.components.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-voidInk-body">
                        {c.label}
                        <span className="ml-2 font-mono text-[10px] tabular-nums text-voidInk-muted">
                          ×{c.weight}%
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[14px] tabular-nums text-white">
                        {c.value}
                      </span>
                    </div>
                    {/* Track and fill, both real: the bar is the value out
                        of 100, so the fill is the number beside it rather
                        than an illustration of it. */}
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-evidence"
                        style={{ width: `${Math.max(0, Math.min(100, c.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line-hairline pt-4">
                <span className="text-[13px] text-voidInk-body">Weighted sum</span>
                <span className="shrink-0 font-mono text-[20px] tabular-nums text-evidence">
                  {d.composite}
                </span>
              </div>
              {/* The property that makes these numbers readable, and the one
                  a bare "x50%" caption invites a reader to get wrong.
                  scaleAcross() is min-max, so starter strength, draft value
                  and bye safety are POSITIONS inside this room — somebody
                  scores 0 and somebody scores 100 whatever actually
                  happened — while roster construction is an absolute score
                  and is not scaled at all. CLAUDE.md spends a section on
                  each; the in-app dashboard carries the same note beside the
                  same bars. Omitting it on the one section arguing that
                  every number arrives with its working would be the page
                  contradicting its own thesis, two inches under a pair whose
                  whole point is that an ordinal cannot express distance. */}
              <p className="mt-4 max-w-[46ch] text-[13px] leading-[1.5] text-voidInk-muted">
                0 and 100 are this room&apos;s floor and ceiling on the first three, not a verdict —
                roster construction is the one absolute score. A weight is how much a component
                counts, not how much it separates the room.
              </p>
              <p className="mt-3 max-w-[46ch] text-[13px] leading-[1.5] text-voidInk-muted">
                A middle-of-the-table team from a simulated {d.teams}-team, {d.rounds}-round room,
                every seat drafting to the same rule, graded the moment it ended — which is what
                makes the middle team the honest one to show. The four add up to the number above,
                so you can check it rather than believe it.
              </p>
              <MethodLink href="/docs/draft-room-how-it-works.html#s06">
                How the grade is worked out
              </MethodLink>
            </>
          ) : (
            <Skeleton lines={6} />
          )}
        </Lit>
      </div>
    </Pair>
  )
}

// ---------------------------------------------------------------------------
// 4. We grade our own forecasts
// ---------------------------------------------------------------------------

/* The one number on the page that can be checked rather than believed.

   `pp` in stats.js holds what Juke forecast for seasons that have since
   been played, so projectionRecord() puts the forecast beside the outcome.
   Nothing else in this market publishes its own misses.

   The player must have a record that contains a miss, and that
   requirement is the section rather than a detail of it.

   Ranked purely by Juke score the answer is tonight's best player, whose
   three graded seasons all came in ABOVE forecast — measured 9 September:
   +53, +128, +45. Three green numbers under a heading about grading your
   own forecasts is not accountability, it is a highlight reel, and a
   reader is right to discount it. It is also structurally likely rather
   than bad luck: the projection is an expected value that prices in
   injury risk, so it runs about twenty points light on anyone who stays
   fit, and the players with the highest scores are disproportionately the
   ones who did.

   So the pick is the highest-scoring player with at least one season we
   got wrong. The table then shows a miss and a beat together, which is
   what the claim above it actually promises.

   Games played rides along for the same reason it does on the sheet:
   availability is most of the projection's error (r 0.873 at 15+ games
   against 0.617 below it), so a season that reads as a catastrophic miss
   is very often a hamstring, and printing the miss without the games
   count invites exactly the wrong conclusion. */
function readRecord(engine) {
  const board = engine.board()
  if (!board || !board.length) return null

  let best = null
  let bestScore = -1
  let bestRows = null
  let fallback = null
  let fallbackScore = -1
  let fallbackRows = null

  for (const p of board) {
    const score = engine.overallScore(p)
    if (score === null || score === undefined) continue
    if (score <= bestScore && score <= fallbackScore) continue
    const rows = engine.projectionRecord(p)
    if (!rows || rows.length < 2) continue

    if (rows.some((r) => r.diff < 0)) {
      if (score > bestScore) {
        bestScore = score
        best = p
        bestRows = rows
      }
    } else if (score > fallbackScore) {
      // Kept only for the board where nobody's record contains a miss,
      // which is not a board this project has seen and is not a reason to
      // draw nothing.
      fallbackScore = score
      fallback = p
      fallbackRows = rows
    }
  }

  if (!best) {
    best = fallback
    bestRows = fallbackRows
  }
  if (!best) return null

  /* Three seasons, newest first — but never three that all went our way
     when an older one did not. projectionRecord() returns newest first, so
     a plain slice can crop the very season this pair was chosen for. */
  let shown = bestRows.slice(0, 3)
  if (!shown.some((r) => r.diff < 0)) {
    const miss = bestRows.find((r) => r.diff < 0)
    if (miss) shown = shown.slice(0, 2).concat(miss).sort((a, b) => Number(b.year) - Number(a.year))
  }

  return {
    name: best.name,
    rows: shown.map((r) => ({
      year: r.year,
      proj: Math.round(r.proj),
      act: Math.round(r.act),
      diff: Math.round(r.diff),
      games: r.games,
    })),
  }
}

function PairRecord() {
  const [ref, near] = useNearViewport()
  const d = useEngineData(readRecord, near)

  return (
    <Pair claim="We grade our own forecasts.">
      <div ref={ref} className="lg:pr-12">
        <Flat label="What you're handed">
          <span className="block max-w-[12ch] font-display text-[30px] font-extrabold uppercase italic leading-[1.05] text-voidInk-muted sm:text-[36px]">
            Trust the projections
          </span>
          <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.5] text-voidInk-muted">
            Every site says this, with equal confidence, and none of them will show you last year's.
            A forecast nobody grades is not a forecast.
          </p>
        </Flat>
      </div>

      <div className="relative mt-5 lg:mt-0 lg:border-l lg:border-line-hairline lg:pl-12">
        <Joint />
        <Lit label="What Juke shows">
          {d ? (
            <>
              <span className="block font-display text-[22px] font-extrabold uppercase italic leading-none text-white sm:text-[26px]">
                {d.name}
              </span>
              {/* bg-transparent is load-bearing, not tidiness. style.css
                  carries a bare `table { background: var(--card) }`, that
                  sheet is a plain <link> on this same document, and --card
                  is #18212D — lighter than the #13161C cell this table sits
                  on. Inheriting it raised the ground under every cell and
                  took voidInk-muted from passing to 4.15 and 3.85 against a
                  4.5 bar, measured. This is the same reach-in CLAUDE.md
                  already records for four Draft Room tabs, and the same
                  repair: state the surface rather than narrowing the legacy
                  rule, which also styles 404.html and the docs pages. */}
              <table className="mt-5 w-full border-collapse bg-transparent">
                <thead>
                  <tr className="border-b border-line-hairline text-left">
                    {['Season', 'We said', 'He scored', 'Miss', 'GP'].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        /* voidInk-body, not muted: at 10px the muted ink
                           measured 4.15 against a 4.5 bar on this cell's
                           own ground. A column header is a label somebody
                           has to read to parse the row under it, so it is
                           the wrong place to spend the last of a token's
                           contrast on hierarchy. */
                        className={`pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-voidInk-body ${
                          i === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.year} className="border-b border-line-divider last:border-b-0">
                      <td className="py-2.5 font-mono text-[13px] tabular-nums text-voidInk-body">
                        {r.year}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums text-white">
                        {r.proj}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums text-white">
                        {r.act}
                      </td>
                      {/* `evidence`, not gain/cost, and the column header is
                          why: this is a MISS, so its magnitude is the
                          quantity and its sign is only which side of the
                          forecast he landed.

                          Coloured by direction it ranked the three seasons
                          in reverse order of forecast quality -- the +71,
                          a 30% error and the worst row in the table, drew
                          in the gain colour, while a -20 drew as a loss on
                          the most accurate season shown. On the one
                          section whose whole argument is that we publish
                          our own misses, the colour was congratulating the
                          biggest one.

                          CLAUDE.md already states the rule this broke: a
                          delta's sign is direction, its colour is meaning,
                          and anywhere "up" and "good" point opposite ways
                          the sign has to be written rather than coloured.
                          The sign stays, because which side he landed on
                          is genuinely informative; the verdict goes. */}
                      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums text-evidence">
                        {r.diff >= 0 ? `+${r.diff}` : r.diff}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[13px] tabular-nums text-voidInk-muted">
                        {r.games === null ? '—' : r.games}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-5 max-w-[46ch] text-[13px] leading-[1.5] text-voidInk-muted">
                Both columns scored under your rules, so this rescores when you change them. A
                projection prices in the games a player might miss, so it runs light on anyone who
                stays fit — which is why the games column is here and not decoration.
              </p>
            </>
          ) : (
            <Skeleton lines={6} />
          )}
        </Lit>
      </div>
    </Pair>
  )
}

// ---------------------------------------------------------------------------

/* The section's own bottom padding, because the rooms strip below keeps the
   mt-[26px] it had when it followed the hero directly. Separation between two
   sections has to exceed the 56/64px this one uses between its own pairs, or
   the rooms read as a fifth pair. */
export default function HomeProof() {
  return (
    <section aria-label="What Juke shows that a ranking cannot" className="relative mt-16 pb-8 sm:mt-20 sm:pb-14">
      <div className="hidden lg:grid lg:grid-cols-2">
        <span className="pr-12 font-mono text-[10px] uppercase tracking-[0.14em] text-voidInk-muted">
          What you're handed
        </span>
        <span className="pl-12 font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
          What Juke shows
        </span>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:items-start">
        <PairRankReason />
        <PairYourRules />
        <PairGraded />
        <PairRecord />
      </div>
    </section>
  )
}
