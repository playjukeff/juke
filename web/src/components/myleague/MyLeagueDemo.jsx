import { useState } from 'react'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'
import { SampleCard } from '../rooms/sampleParts.jsx'
import ConnectLeagueCta from '../shell/ConnectLeagueCta.jsx'
import WeekStrip from './WeekStrip.jsx'
import MoveCard from './MoveCard.jsx'
import SecondaryMoves from './SecondaryMoves.jsx'
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
        <div className="rounded-2xl border border-dashed border-flow-pillEdge px-4 py-3 text-[13px] leading-[1.5] text-voidInk-body">
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

      <div className="mt-4">
        <WeekStrip weeks={data.weeks} selected={week} onSelect={setWeek} />
      </div>

      {data.move ? <MoveCard {...data.move} onOpen={() => {}} /> : null}
      <SecondaryMoves items={data.secondary} />

      <div className="mx-auto mt-3.5 max-w-[1280px] px-5 sm:px-10">
        <SampleCard>
          <span className="font-mono text-[10px] tracking-[0.1em] text-ink-muted">
            {weekLabel.toUpperCase()}
          </span>
          {weekDecisions.length ? (
            <div className="mt-2.5 flex flex-col gap-2.5">
              {weekDecisions.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-voidInk-primary">
                    {d.said} → {d.did}
                  </span>
                  <span className={d.verdict === 'bad' ? 'text-flow-rose' : 'text-mint'}>
                    {d.verdict === 'bad' ? '✗ Bad call' : '✓ Good call'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-[13px] text-ink-muted">Nothing graded for {weekLabel.toLowerCase()}.</p>
          )}
        </SampleCard>
      </div>
    </div>
  )
}
