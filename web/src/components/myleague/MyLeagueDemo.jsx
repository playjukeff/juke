import { useState } from 'react'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { SampleCard } from '../rooms/sampleParts.jsx'
import ConnectLeagueCta from '../shell/ConnectLeagueCta.jsx'
import WeekStrip from './WeekStrip.jsx'
import MoveCard from './MoveCard.jsx'
import SecondaryMoves from './SecondaryMoves.jsx'
import KpiStrip from '../decision/KpiStrip.jsx'
import { verdictFor } from '../ledger/verdicts.js'
import StakeCard from '../decision/StakeCard.jsx'
import RunNextCard from '../decision/RunNextCard.jsx'
import { buildDemoData } from './demoData.js'

/* My League, before a real one is connected — Free and guest alike, per
   the confirmed product rule: Free cannot connect a real league at all, so
   this is not a lesser version of the real screen, it is the whole of what
   Free ever sees here. Fully interactive, on sample data, announced as
   such — the same shape LeaguePreview.jsx used for the old League Room,
   scaled up to the whole of what My League now shows. */
export default function MyLeagueDemo() {
  const engine = useEngine()
  useJukeTick(engine)
  const [week, setWeek] = useState('6')

  const board = engine && engine.board ? engine.board() : []
  // Deferred data (board() empty until players.js lands) rather than a
  // guest-vs-signed-in branch — this screen is the same for both.
  if (!board.length) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-10 sm:px-10">
        <p className="text-[14px] text-ink-muted">Loading your demo league…</p>
      </div>
    )
  }

  const data = buildDemoData(board)
  const weekDecisions = data.decisionsByWeek[week] || []
  const weekLabel = week === 'draft' ? 'Draft' : `Week ${week}`

  return (
    <div className="pb-10">
      <div className="mx-auto max-w-[1280px] px-5 pt-4 sm:px-10">
        <div className="rounded-2xl border border-dashed border-flow-pillEdge px-4 py-3 text-meta leading-[1.5] text-voidInk-body">
          <span className="font-semibold text-white">Demo league · sample data.</span>{' '}
          {data.leagueName}, {data.meta}. Everything here works — connect a real league to see your
          own.
        </div>
      </div>

      <div className="mx-auto mt-3.5 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-10">
        <div className="min-w-0">
          <span className="block truncate font-display text-[22px] font-bold leading-none text-white">
            {data.teamName}
          </span>
          <span className="mt-1 block truncate text-[12px] text-ink-muted">
            {data.leagueName} · {data.record} · {data.standing}
          </span>
        </div>
        <ConnectLeagueCta variant="outline" label="Connect a real league" />
      </div>

      {/* P4. The strip, directly under the identity row and above the week
          calendar — four numbers that say where this season stands before
          the page says anything about this week. */}
      <div className="mx-auto mt-4 max-w-[1280px] px-5 sm:px-10">
        <KpiStrip items={data.kpis} />
      </div>

      <div className="mt-4">
        <WeekStrip weeks={data.weeks} selected={week} onSelect={setWeek} />
      </div>

      {data.move ? (
        <MoveCard {...data.move} onOpen={() => { window.location.hash = `#/rooms/${data.move.slug}` }} />
      ) : null}

      {/* P2. Directly under the Move, which is where the guide puts it on a
          phone and where it belongs at every width on this screen: the Move
          is what to do this week and the stake card is what keeps costing
          you every week. One is a decision, the other is a pattern, and the
          pattern is the one worth the page's only light surface.

          The two-column split below is the desktop sidebar the guide asks
          for; at phone width it stacks, so the stake card lands directly
          under the Move either way. */}
      {/* Three items, two orders. On a desktop this is the guide's sidebar:
          the secondary moves take the left column and the stake card sits at
          the top of the right one with the run-next card under it. On a
          phone the column collapses and the ORDER has to change with it, not
          just the width -- the guide's own screen 18 puts the stake card
          "directly under the Move", and stacking in source order buries it
          under two secondary cards instead. Explicit row/column placement at
          lg, `order` below it. */}
      <div className="mx-auto mt-4 grid max-w-[1280px] items-start gap-4 px-5 sm:px-10 lg:grid-cols-[1fr_340px]">
        <div className="order-2 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <SecondaryMoves items={data.secondary} />
        </div>

        {data.habit ? (
          <div className="order-1 lg:order-none lg:col-start-2 lg:row-start-1">
            <StakeCard
              title={data.habit.title}
              cost={data.habit.cost}
              gain={data.habit.gain}
              action={{
                label: data.habit.action.label,
                onClick: () => { window.location.hash = data.habit.action.href },
              }}
            >
              {data.habit.body}
            </StakeCard>
          </div>
        ) : null}

        {/* P7. Last in the column, and last on the page at every width,
            which is the guide's own placement: the final word is the one
            thing you could run that would settle what it has just said. */}
        {data.runNext ? (
          <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2">
            <RunNextCard title={data.runNext.title} action={data.runNext.action} index={1}>
              {data.runNext.body}
            </RunNextCard>
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-3.5 max-w-[1280px] px-5 sm:px-10">
        <SampleCard>
          <span className="font-mono text-[10px] tracking-[0.1em] text-ink-muted">
            {weekLabel.toUpperCase()}
          </span>
          {weekDecisions.length ? (
            <div className="mt-2.5 flex flex-col gap-2.5">
              {weekDecisions.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-meta">
                  <span className="text-voidInk-primary">
                    {d.said} → {d.did}
                  </span>
                  {/* Glyph, label and tone all off VERDICTS -- three
                      copies of the ledger's own vocabulary written out by
                      hand is how a good call comes to be mint here and
                      gain one screen along. */}
                  <span className={verdictFor(d.verdict).tone}>
                    {verdictFor(d.verdict).glyph} {verdictFor(d.verdict).label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-meta text-ink-muted">Nothing graded for {weekLabel.toLowerCase()}.</p>
          )}
        </SampleCard>
      </div>
    </div>
  )
}
