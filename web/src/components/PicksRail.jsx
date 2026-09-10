import { POS_BADGE } from './draftRoomPositions.js'

// No avatars available for a pick row — a player's face lives on the pool
// row and the profile modal, not here — so initials are the intended
// treatment rather than a fallback, the same initialsFor() every other
// surface already uses.
//
// `mobile`: the Players screen's own Picks pane (PlayersTab.jsx) reuses
// this exact row markup full-width instead of as a 288px side rail — no
// header (the segmented control's own "Picks" pill already says what this
// is, the same reason the Queue/Roster panes don't repeat their own
// names), and 32px circles rather than 28px, the handoff's own number.
export default function PicksRail({ picks, league, mySlot, teamLabelOf, initialsFor, mobile }) {
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const total = DE ? DE.totalPicks(league) : league.teams * league.rounds
  // Most recent first — the rail is a feed, not the board's own left-to-
  // right pick order.
  const ordered = picks.slice().reverse()
  const avatarSize = mobile ? 'h-8 w-8' : 'h-7 w-7'

  const list = (
    <div className={'min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1.5 ' + (mobile ? 'no-scrollbar' : '')}>
      {ordered.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12px] text-ink-muted">No picks yet.</p>
      ) : (
        ordered.map((pick) => {
          const mine = pick.slot === mySlot
          const code = DE ? DE.pickCode(pick.overall, league) : pick.overall
          return (
            <div
              key={pick.overall}
              className={
                'mb-[3px] flex items-center gap-[9px] rounded-md border-l-2 px-2 py-[7px] ' +
                (mine ? 'border-l-[#FFD166] bg-[rgba(255,209,102,0.05)]' : 'border-l-transparent bg-white/[0.015]')
              }
            >
              <span className={'relative flex shrink-0 items-center justify-center rounded-full bg-slate-panel text-[9px] font-bold text-ink-soft ' + avatarSize}>
                {initialsFor(pick.player)}
                <span
                  className={
                    'absolute -bottom-[3px] -right-[3px] rounded px-1 py-px text-[7px] font-bold leading-tight ring-2 ring-slate-bar ' +
                    (POS_BADGE[pick.player.pos] || 'bg-white/10 text-white/50')
                  }
                >
                  {pick.player.pos}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/90">{pick.player.name}</p>
                <p className="truncate font-plex text-[10px] text-ink-muted">{code} · {teamLabelOf(pick.slot)}</p>
              </span>
            </div>
          )
        })
      )}
    </div>
  )

  if (mobile) {
    return <div className="flex min-h-0 flex-1 flex-col">{list}</div>
  }

  return (
    <aside className="flex w-[288px] shrink-0 flex-col overflow-hidden border-l border-slate-rule bg-slate-bar/45">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-slate-rule px-3.5 py-2.5">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-white">Picks</span>
        <span className="font-plex text-[10px] text-ink-muted">{picks.length} of {total}</span>
      </div>
      {list}
    </aside>
  )
}
