// Homepage v4 pass 2's "Take a pick" module — three real, seeded third-round
// decisions (see app.js's generateThirdRoundScenario()/thirdRoundScenarios(),
// bridged as engine.thirdRoundScenarios()), each played out as a five-phase
// loop. "Nothing here is a marketing screenshot" is the section's own
// promise (§3.5's sub), so every player name, every grade number and every
// caption below is read off a real simulated draft — nothing in this file
// is a literal string standing in for one.
import { useEffect, useMemo, useRef, useState } from 'react'
import { PauseCircle, PlayCircle } from 'lucide-react'
import { POS_BADGE } from './draftRoomPositions.js'

// §6.1's own table. Index = phase.
const PHASE_MS = [3000, 2600, 2600, 3400, 3600]
const PHASE_TAGS = ['On the clock', 'Your pick', 'The room reacts', 'Grade rerun', 'Grade rerun']

// Exported for ShowYourWorking.jsx's own card 03 weight-bar chart (design
// handoff §6) — analyseDraft()'s real 50/25/15/10 weighting either way, so
// a second copy of this table would be the same "league shape written down
// twice" failure CLAUDE.md already has a rule about, just for a weight
// instead of a roster rule.
export const COMPONENT_LABELS = [
  { key: 'starters', label: 'Starter strength', weight: 50 },
  { key: 'value', label: 'Draft value', weight: 25 },
  { key: 'build', label: 'Roster construction', weight: 15 },
  { key: 'byes', label: 'Bye-week safety', weight: 10 },
]

function lastNameOf(name) {
  const parts = name.split(' ').filter((w) => !['Jr.', 'Sr.', 'II', 'III', 'IV'].includes(w))
  return parts[parts.length - 1] || name
}

// §6.2's own four templates. Phase 3 and 4 share one — "the scenario's own
// explanation, with any derived figure interpolated" — built from whichever
// grade component moved the most between before/after, since that's the
// real answer to "why did the grade change" for THIS scenario, not a
// generic line true of all three.
function captionFor(scenario, phase) {
  const { player, pickCode, survivalPct, opponentPicks, before, after } = scenario
  if (phase === 0) {
    return `Pick ${pickCode} — you are on the clock. ${lastNameOf(player.name)} is ${survivalPct}% to survive to your next turn.`
  }
  if (phase === 1) {
    return `You take ${player.name} at ${pickCode}.`
  }
  if (phase === 2) {
    return `${opponentPicks[0].name} and ${opponentPicks[1].name} come off the board before the wheel comes back.`
  }
  // phase 3 or 4
  const deltas = COMPONENT_LABELS.map((c) => ({ ...c, delta: after.components[c.key] - before.components[c.key] }))
  const biggest = deltas.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
  const dir = biggest.delta >= 0 ? 'climbs' : 'falls'
  // No composite number here either, for the same reason GradePanel's own
  // comment gives — a sentence pairing a room-relative composite with the
  // letter it produced is the identical "score out of a hundred beside a
  // letter grade" pattern, just in prose instead of a chip.
  return `${biggest.label} ${dir} ${Math.abs(biggest.delta)} — the grade moves from ${before.letter} to ${after.letter}.`
}

function useThirdRoundScenarios() {
  const [scenarios, setScenarios] = useState(null)

  useEffect(() => {
    const engine = typeof window !== 'undefined' ? window.JukeEngine : null
    if (!engine) return

    const read = () => {
      if (!engine.dataReady()) return
      const rows = engine.thirdRoundScenarios()
      if (rows && rows.length) setScenarios(rows)
    }

    read()
    window.addEventListener('juke:header', read)
    return () => window.removeEventListener('juke:header', read)
  }, [])

  return scenarios
}

// One chained setTimeout, not an interval — §6.1 is explicit that this is
// five state transitions per loop, not a continuously re-rendering clock.
// Runs only while inView && !paused && !reducedMotion; reduced motion
// renders phase 0 and never starts at all, per §6.1's own instruction.
function useAutoPlayLoop(scenarioCount) {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [phase, setPhase] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
    // scenarioCount, not []: the ref's target only exists once scenarios
    // have loaded and the real container (as opposed to the loading
    // skeleton) has actually mounted. An empty deps array runs this
    // effect once, immediately, while containerRef.current is still null
    // — found by testing, not by reading the code, since nothing throws
    // when an observer is silently never created.
  }, [scenarioCount])

  const running = inView && !paused && !reducedMotion && scenarioCount > 0

  useEffect(() => {
    if (!running) return
    timerRef.current = setTimeout(() => {
      setPhase((p) => {
        const next = (p + 1) % PHASE_MS.length
        if (next === 0) setScenarioIndex((s) => (s + 1) % scenarioCount)
        return next
      })
    }, PHASE_MS[phase])
    return () => clearTimeout(timerRef.current)
  }, [running, phase, scenarioCount])

  // Jumping to a scenario via the dots resets to phase 0 for it — picking
  // up mid-phase on a decision the reader just switched to would be
  // showing them a pick already half-made without the "on the clock"
  // moment that explains it.
  const goToScenario = (i) => {
    setScenarioIndex(i)
    setPhase(0)
  }

  return { containerRef, scenarioIndex, phase, paused, setPaused, goToScenario, running }
}

// text-white/NN reads muted at a glance and fails 4.5:1 in practice —
// measured across this whole file (and ScoringDemoCard.jsx, and
// ShowYourWorking.jsx) with transitions disabled: every one of /25 through
// /45 came back under the bar against these cards' near-black
// backgrounds, from 2.13 up to 4.45 at best. Homepage cosmetic revision:
// now the same voidInk.muted the rest of the page's meta text uses
// (tailwind.config.js), not a one-off hex — it clears ~6:1 against every
// background any of these panels use.
const MUTED = '#808389'

function RowTag({ label, tone }) {
  const toneClass =
    tone === 'mine'
      ? 'bg-teal-500 text-obsidian'
      : tone === 'gone'
        ? 'bg-white/[0.06]'
        : 'border border-teal-400/40 text-teal-300'
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 font-plex text-[10px] font-semibold uppercase tracking-[0.12em] ${toneClass}`}
      style={tone === 'gone' ? { color: MUTED } : undefined}
    >
      {label}
    </span>
  )
}

function BoardPanel({ scenario, phase }) {
  return (
    <div className="flex h-full flex-col px-6 py-5">
      <p className="font-numeral text-[10.5px] font-semibold uppercase tracking-[0.13em] text-voidInk-muted">On the board</p>
      <div className="mt-3 flex flex-col gap-[6px]">
        {scenario.boardRows.map((row) => {
          // Nothing is added or removed as the phase advances (§4.3) — the
          // same eight rows just change their own tag, border and text
          // colour (never opacity — see RowCells' comment below).
          const isGoneNow = phase >= 2 && row.isOpponent
          const isMineNow = row.isMine
          return (
            <div
              key={row.name}
              className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border px-3 py-[9px] transition-colors duration-500"
              style={{
                borderColor: isMineNow && phase >= 1 ? 'rgba(94,234,212,0.4)' : '#252930',
                backgroundColor: isMineNow && phase >= 1 ? 'rgba(94,234,212,0.06)' : 'transparent',
              }}
            >
              {/* A gone row dims by changing the name's own colour to a
                  solid, still-compliant muted grey — never opacity on the
                  row or on this position label. Measured against this
                  card's own #0d1216: earlier drafts put opacity on both
                  and took the text under 3:1, which is the exact mistake
                  §9's acceptance criteria calls out by name. The badge
                  stays at full strength on purpose — POS_BADGE's solids
                  are already the ones this project darkens until white
                  clears 4.5:1 on every one of them; dimming it a second
                  way here would undo that. */}
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold ${POS_BADGE[row.pos] || 'bg-white/10 text-white/50'}`}>
                {row.pos}
              </span>
              <span
                className={`min-w-0 truncate text-[14px] font-semibold transition-colors duration-500 ${isGoneNow ? 'line-through decoration-[#6b7680] text-voidInk-muted' : 'text-voidInk-primary'}`}
              >
                {row.name}
              </span>
              {isMineNow && phase >= 1 && <RowTag label="Yours" tone="mine" />}
              {isMineNow && phase === 0 && <RowTag label="Best value" tone="best" />}
              {isGoneNow && <RowTag label="Gone" tone="gone" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RosterPanel({ scenario, phase }) {
  const lineup = phase >= 1 ? scenario.after.lineup : scenario.before.lineup
  return (
    <div className="flex h-full flex-col border-x border-line-hairline px-6 py-5">
      <p className="font-numeral text-[10.5px] font-semibold uppercase tracking-[0.13em] text-voidInk-muted">
        Your roster &middot; pick {scenario.pickCode}
      </p>
      <div className="mt-3 flex flex-col gap-[6px]">
        {lineup.map((s, i) => (
          <div key={`${s.slot}-${i}`} className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-row px-3 py-[7px] transition-colors duration-500">
            <span className="font-plex text-[10px] font-semibold uppercase tracking-[0.12em] text-voidInk-muted">{s.slot}</span>
            {s.player ? (
              <span
                className="truncate text-meta font-semibold text-voidInk-primary transition-colors duration-500"
                style={s.player.name === scenario.player.name && phase >= 1 ? { color: '#5EEAD4' } : undefined}
              >
                {s.player.name}
              </span>
            ) : (
              <span className="text-meta text-voidInk-muted">Empty</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function GradeBar({ label, weight, before, after, animate }) {
  const value = animate ? after : before
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta font-medium text-voidInk-body">{label}</span>
        {/* text-voidInk-body, not -muted — measured too dim against this
            panel's own #0E2628-adjacent surroundings next to the brighter
            label and letter beside it; body is the next step up the same
            scale and still reads as secondary to the label. */}
        <span className="font-numeral tabular-nums text-[10px] font-semibold text-voidInk-body">wt {weight}</span>
      </div>
      <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-teal-400 transition-[width] duration-[1400ms] ease-out"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  )
}

function GradePanel({ scenario, phase }) {
  const animate = phase >= 3
  const grade = animate ? scenario.after : scenario.before
  return (
    <div className="flex h-full flex-col px-6 py-5">
      <p className="font-numeral text-[10.5px] font-semibold uppercase tracking-[0.13em] text-voidInk-muted">Draft grade &middot; live</p>
      {/* Letter only, no paired "/100" — this used to render a 52px
          composite number immediately beside the letter chip (design_
          handoff_homepage_cosmetic §5's own restructure), which is exactly
          the pairing CLAUDE.md's "A letter grade may not stand next to a
          score out of a hundred" section documents fixing everywhere else
          in the real product (the share card, both Analysis headers, the
          Insights summary, the mobile grade·score chip, all three
          standings tables) — a room-relative composite read against a
          school scale produced a letter that agreed with it on 0 of 10
          teams. This module is a marketing demo of the same real engine,
          so it inherited the same bug the moment §5 was implemented
          literally off a mockup that predated that fix. The letter stays;
          the number is gone, matching every other grade surface in the
          app. Still real, animating scenario data — freezing the one live
          "watch it get graded" number on the page would undercut the
          section's whole premise. */}
      <div className="mt-3 flex items-center gap-4">
        <div
          className="flex flex-col items-center gap-[3px] rounded-xl border px-5 py-3"
          style={{ background: '#0E2628', borderColor: '#155157' }}
        >
          <span className="font-numeral text-[42px] font-bold leading-none text-[#59E4F3] transition-all duration-700">{grade.letter}</span>
          <span className="font-numeral text-[9px] font-semibold tracking-[0.14em] text-[#82A6AA]">GRADE</span>
        </div>
        <p className="font-numeral tabular-nums text-meta font-medium text-[#83868C]">after {grade.picksMade} picks</p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {COMPONENT_LABELS.map((c) => (
          <GradeBar
            key={c.key}
            label={c.label}
            weight={c.weight}
            before={scenario.before.components[c.key]}
            after={scenario.after.components[c.key]}
            animate={animate}
          />
        ))}
      </div>
    </div>
  )
}

// §12's own dot spec: 26px×4px pill active, 7px circles inactive. Each
// dot's visible size is what the spec gives — a carousel indicator, not a
// button, should read small — min-h/min-w-[44px] on the button itself is
// the actual tap target, invisible padding around a small dot rather than
// a 44px dot. Shared by the mobile and desktop rows so the two can't drift
// on what a dot looks like.
function ScenarioDots({ scenarios, scenarioIndex, goToScenario }) {
  return (
    <div className="flex items-center">
      {scenarios.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => goToScenario(i)}
          aria-label={`Scenario ${i + 1}`}
          aria-current={i === scenarioIndex}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <span
            className={`rounded-full transition-all duration-300 ${
              i === scenarioIndex ? 'h-1 w-[26px] bg-[#4DDAE9]' : 'h-[7px] w-[7px] bg-[#35383E]'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

// §12's pause control: a 26px circle with a 1px border, the same visible-
// size-vs-tap-target split as the dots beside it.
function PauseButton({ paused, running, setPaused }) {
  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      aria-label={paused ? 'Play' : 'Pause'}
      aria-pressed={paused}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center"
    >
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#424853] text-voidInk-body transition-colors hover:text-white">
        {paused || !running ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
}

export default function TakeAPick() {
  const scenarios = useThirdRoundScenarios()
  const count = scenarios ? scenarios.length : 0
  const { containerRef, scenarioIndex, phase, paused, setPaused, goToScenario, running } = useAutoPlayLoop(count)

  const scenario = scenarios ? scenarios[scenarioIndex] : null
  const caption = useMemo(() => (scenario ? captionFor(scenario, phase) : ''), [scenario, phase])

  return (
    <section className="relative mx-auto max-w-[1200px] px-10 pb-0 pt-[96px]">
      <div className="max-w-[720px]">
        <h2 className="text-balance font-display text-[clamp(32px,3.6vw,48px)] font-extrabold italic leading-none">
          Take a pick. Watch it get graded.
        </h2>
        <p className="mt-3 text-[17px] leading-[1.55] text-voidInk-body">
          Three third-round decisions, playing out. Nothing here is a marketing screenshot.
        </p>
      </div>

      {!scenario ? (
        <div className="mt-[28px] h-[420px] animate-pulse rounded-[14px] bg-surface-row" />
      ) : (
        <>
          {/* Mobile: caption bar above the stacked panels (§4.3), so it's
              visible without scrolling past them — a deliberate, unrelated
              mobile UX call this pass doesn't touch. min-h reserves room
              for the longest of the four caption shapes so the bar's own
              height doesn't jump between phases. */}
          <div
            aria-live="polite"
            className="mt-[28px] flex min-h-[52px] items-center rounded-[14px] border border-line-hairline bg-surface-card px-4 py-3 text-[14px] leading-[1.5] text-voidInk-body lg:hidden"
          >
            {caption}
          </div>

          <div ref={containerRef} className="mt-3 grid overflow-hidden rounded-[14px] border border-line-hairline bg-surface-card lg:grid-cols-[410px_330px_1fr]">
            <BoardPanel scenario={scenario} phase={phase} />
            <RosterPanel scenario={scenario} phase={phase} />
            <GradePanel scenario={scenario} phase={phase} />
          </div>

          {/* §12 — dots + pause move from above the container to its
              bottom edge. Desktop puts them on the same row as the
              caption chip (justify-between, matching the handoff's own
              "YOUR PICK" row); mobile's caption chip already sits above
              the grid in its own unrelated position (see that bar's own
              comment), so there's no single shared row for it there —
              it gets its own row underneath instead, keeping the
              controls reachable at every width. */}
          <div className="mt-3 flex items-center justify-end gap-3 lg:hidden">
            <ScenarioDots scenarios={scenarios} scenarioIndex={scenarioIndex} goToScenario={goToScenario} />
            <PauseButton paused={paused} running={running} setPaused={setPaused} />
          </div>

          <div className="mt-3 hidden items-center justify-between gap-3 lg:flex">
            <div
              aria-live="polite"
              className="flex min-h-[52px] items-center rounded-[10px] border border-line-hairline bg-surface-card px-4 py-[11px] text-[15px] leading-[1.5] text-voidInk-body"
            >
              <span className="mr-3 shrink-0 font-numeral text-[10.5px] font-semibold uppercase tracking-[0.12em] text-teal-400">{PHASE_TAGS[phase]}</span>
              {caption}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <ScenarioDots scenarios={scenarios} scenarioIndex={scenarioIndex} goToScenario={goToScenario} />
              <PauseButton paused={paused} running={running} setPaused={setPaused} />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
