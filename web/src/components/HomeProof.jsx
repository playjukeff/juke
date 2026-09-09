import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/* The homepage's argument, and the one structure it commits to.

   Four pairs down a single seam. Left of the seam is the number a reader
   is handed anywhere else in this category — a rank, a fixed scoring
   table, a finished board, a confident claim — drawn flat, unlit, with no
   tabular figures. Right of the seam is the same number with its working,
   drawn on a real surface out of live board data.

   The seam is the whole idea, so it is one continuous rule rather than a
   border per row: a line that restarts at every heading reads as four
   unrelated comparisons, which is the arrangement this replaces.

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
function useEngineData(read, enabled) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!enabled) return
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return

    const run = () => {
      if (!engine.dataReady || !engine.dataReady()) return
      try {
        const next = read(engine)
        if (next) setData(next)
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
   thing being argued about. Dashed hairline (the idiom the hero's own
   draft-with-friends row already uses), body face, muted ink, and
   deliberately no tabular figures — the mono numerals are the tell that a
   number was measured, and they belong on the other side of the seam. */
function Flat({ label, children }) {
  return (
    <div className="rounded-[18px] border border-dashed border-line-hairline px-5 py-6 sm:px-6 sm:py-7">
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
function Pair({ claim, children }) {
  return (
    <>
      <h3 className="mt-14 font-display text-[26px] font-extrabold uppercase italic leading-[1.02] text-white sm:mt-16 sm:text-[32px] lg:col-span-2 lg:text-[38px]">
        {claim}
      </h3>
      {children}
    </>
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
        className={`shrink-0 font-mono text-[15px] tabular-nums ${accent ? 'text-teal' : 'text-white'}`}
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

  return {
    name: best.name,
    pos: best.pos,
    team: best.team,
    posRank: best.posRank,
    projPts: best.projPts === null || best.projPts === undefined ? null : Math.round(best.projPts),
    score: readout.score,
    gap: readout.gap,
    replacementRank: readout.replacementRank,
    /* Both ranks, built here rather than lifted out of readout.reason.
       That string already states the two figures the lines above print,
       so rendering it whole would say 300 and +145 twice in one card —
       and its wording is a tooltip's, not a card's. The two ranks are the
       one fact it carries that nothing else in this cell does. */
    projRank: best.projPosRank ? `${best.pos}${best.projPosRank}` : null,
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
              <span className="mt-3 block text-[15px] text-voidInk-body">{d.name}</span>
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

      <div className="mt-3 lg:mt-0 lg:pl-12">
        <Lit label="What Juke shows">
          {d ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-display text-[22px] font-extrabold uppercase italic leading-none text-white sm:text-[26px]">
                  {d.name}
                </span>
                <span className="shrink-0 font-mono text-[30px] tabular-nums leading-none text-teal sm:text-[36px]">
                  {d.score}
                </span>
              </div>
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
              {/* Both ranks, side by side, because the honest answer changes
                  with the board: tonight the projection and the market agree
                  on him exactly, and on the night they do not this line is
                  where you see it first. */}
              {d.projRank && (
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-voidInk-muted">
                  Projection {d.projRank} · Market {d.pos}
                  {d.posRank}
                </p>
              )}
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

  const baseline = new Map(ranked.half.map((r, i) => [r.id, i]))
  const out = {}
  for (const f of FORMATS) {
    out[f] = ranked[f].slice(0, 6).map((r, i) => ({
      ...r,
      moved: baseline.has(r.id) ? baseline.get(r.id) - i : null,
    }))
  }
  return { ranked: out, names: engine.scoringNames() }
}

function PairYourRules() {
  const [ref, near] = useNearViewport()
  const d = useEngineData(readFormats, near)
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

      <div className="mt-3 lg:mt-0 lg:pl-12">
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
                  className={`rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ${
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
                  <span className="w-5 shrink-0 font-mono text-[12px] tabular-nums text-voidInk-muted">
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
                      r.moved > 0 ? 'text-mint' : r.moved < 0 ? 'text-flow-rose' : 'text-voidInk-muted'
                    }`}
                  >
                    {r.moved ? `${r.moved > 0 ? '▲' : '▼'}${Math.abs(r.moved)}` : '—'}
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-[14px] tabular-nums text-teal">
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
            move against half PPR. Juke has 49 of these rules and every one of them is yours to
            change.
          </p>
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
          <ul className="space-y-2.5 text-[15px] text-voidInk-muted">
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

      <div className="mt-3 lg:mt-0 lg:pl-12">
        <Lit label="What Juke shows">
          {d ? (
            <>
              {/* The letter with its rank, never with a score out of a
                  hundred: the rank is what makes the letter mean
                  something, and the two together need no explaining. */}
              <div className="mb-6 flex items-baseline gap-3">
                <span className="font-display text-[44px] font-extrabold uppercase italic leading-none text-teal sm:text-[52px]">
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
                        className="h-full rounded-full bg-teal"
                        style={{ width: `${Math.max(0, Math.min(100, c.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line-hairline pt-4">
                <span className="text-[13px] text-voidInk-body">Weighted sum</span>
                <span className="shrink-0 font-mono text-[20px] tabular-nums text-teal">
                  {d.composite}
                </span>
              </div>
              <p className="mt-5 max-w-[46ch] text-[13px] leading-[1.5] text-voidInk-muted">
                A middle-of-the-table team from a real {d.teams}-team, {d.rounds}-round mock, graded
                the moment it ended. Four components, weighted, scored against the rest of that
                room — and they add up to the number above, so you can check it rather than believe
                it.
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

      <div className="mt-3 lg:mt-0 lg:pl-12">
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
                      <td
                        className={`py-2.5 text-right font-mono text-[13px] tabular-nums ${
                          r.diff >= 0 ? 'text-mint' : 'text-flow-rose'
                        }`}
                      >
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
    <section className="relative mt-16 pb-8 sm:mt-20 sm:pb-14">
      {/* The seam. One absolutely-positioned rule down the middle rather
          than a border on each right-hand cell, so it does not break at
          every heading — a line that restarts four times is four
          comparisons, not one argument. Desktop only: below `lg` the cells
          stack, the seam has no middle to sit on, and each cell carries
          its own side label instead. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-line-hairline lg:block"
      />

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
