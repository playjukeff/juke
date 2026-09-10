import { useState } from 'react'
import { useEngine, useJukeTick } from '../hooks/useJukeEngine.js'
import ActivityLog from './ActivityLog.jsx'
import ChatPanel from './ChatPanel.jsx'

const TABS = [
  { key: 'chat', label: 'Chat' },
  { key: 'log', label: 'Log' },
  { key: 'picks', label: 'Picks' },
]

/* The full pick history — every pick, own included, most recent first,
   with a "Round N" divider wherever the round changes. Deliberately
   separate from the Log tab's feed: that one is a narrow activity ticker
   (last 10, other seats only), and this is the record. One pass, no
   separate grouping structure, matching renderPicks() in app.js. */
function buildPickItems(picks) {
  const items = []
  let lastRound = null
  picks.slice().reverse().forEach((pick) => {
    if (pick.round !== lastRound) {
      items.push({ type: 'divider', round: pick.round })
      lastRound = pick.round
    }
    items.push({ type: 'pick', pick })
  })
  return items
}

function PicksList({ items, engine, DE, league, mySlot, sniped }) {
  if (items.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-ink-muted">No picks yet.</p>
  }
  return items.map((item) =>
    item.type === 'divider' ? (
      <p
        key={'round-' + item.round}
        className="mb-1 mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted first:mt-0"
      >
        Round {item.round}
      </p>
    ) : (
      /* Gold on your own picks — identity, the same mark the board's
         column ring uses, and never as text colour (CLAUDE.md: #FFD166
         is 1.4:1 as type on a light card). A left border and a wash. */
      /* Three states, not two. Yours is gold; somebody taking a player
         off your queue is `cost`, and says so in words rather than
         relying on a reader to notice a colour; everything else is the
         resting grey it always was.

         The words matter more than the rail here: a draft log is read in
         a glance and a tinted border is exactly the kind of signal that
         gets learned only after it has already mattered once. "was on
         your queue" needs no learning. */
      <p
        key={item.pick.overall}
        className={
          'mb-1.5 rounded-md border-l-2 px-2 py-1 text-xs leading-relaxed ' +
          (item.pick.slot === mySlot
            ? 'border-l-[#FFD166] bg-[#FFD166]/5 text-white/80'
            : sniped && sniped.has(item.pick.overall)
              ? 'border-l-cost bg-cost/[0.07] text-white/75'
              : 'border-l-transparent text-white/60')
        }
      >
        <span className="text-ink-muted">
          {DE ? DE.pickCode(item.pick.overall, league) : item.pick.overall}
        </span>{' '}
        <span className="font-medium text-white/80">{engine.teamLabel(item.pick.slot)}</span> took{' '}
        <span className="text-white/90">{item.pick.player.name}</span>{' '}
        <span className="text-ink-muted">({item.pick.player.pos})</span>
        {sniped && sniped.has(item.pick.overall) ? (
          <span className="text-cost"> — was on your queue</span>
        ) : null}
      </p>
    )
  )
}

// Chat owns its own scroll region (the log scrolls, the composer stays
// pinned) and needs a flex column to size that against, so it gets a bare
// wrapper rather than the padded, single-axis-scrolling one Log/Picks share.
function TabContent({ tab, engine, recentOthers, pickItems, DE, league, mySlot, sniped }) {
  if (tab === 'chat') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatPanel engine={engine} />
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {tab === 'picks' ? (
        <PicksList items={pickItems} engine={engine} DE={DE} league={league} mySlot={mySlot} sniped={sniped} />
      ) : (
        <ActivityLog picks={recentOthers} engine={engine} DE={DE} league={league} sniped={sniped} />
      )}
    </div>
  )
}

// Desktop (lg+) only — the mobile equivalents of these tabs live in
// PlayerHub.jsx's bottom sheet instead. A real column in the panel row
// beside the board, not a float over it, so it draws no card chrome of
// its own: DraftRoom's row already gives it a border and a ground.
export default function DraftLogDock({ recentOthers, sniped }) {
  const engine = useEngine()
  useJukeTick(engine)
  // 'log', not 'chat'. A brand new room's chat starts empty ("Nobody has
  // said anything yet"), where Log/Picks always have something real to
  // show the moment a draft exists — same reasoning PlayerHub.jsx's mobile
  // strip defaults to 'players' rather than its own Chat tab.
  const [tab, setTab] = useState('log')
  // border-slate-rule, not -800 — see SidePanel.jsx's own comment. This
  // panel's tab row (Chat/Log/Picks) is the other half of the seam a
  // design review flagged: the two adjacent tab strips read as one bar.

  if (!engine) return null

  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot() ?? 0
  const pickItems = buildPickItems(picks)

  return (
    <div className="flex h-full w-full min-h-0 flex-col border-r border-slate-rule bg-slate-panel/40 last:border-r-0">
      <div className="flex shrink-0 border-b border-slate-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'flex-1 border-b-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-150 ' +
              (tab === t.key ? 'border-teal-400 text-teal-300' : 'border-transparent text-ink-muted hover:text-white/60')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <TabContent
          tab={tab}
          engine={engine}
          recentOthers={recentOthers}
          pickItems={pickItems}
          DE={DE}
          league={league}
          mySlot={mySlot}
          sniped={sniped}
        />
      </div>
    </div>
  )
}
