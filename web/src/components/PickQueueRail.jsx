import { X } from 'lucide-react'
import { POS_BADGE } from './draftRoomPositions.js'

// A small track+knob toggle, matching the header's own Autopick switch at
// roughly two-thirds scale — this rail's header has 252px to work with,
// not the top bar's whole width.
function MiniToggle({ on }) {
  return (
    <span className={'relative block h-3.5 w-[26px] shrink-0 rounded-full transition-colors duration-200 ' + (on ? 'bg-teal-500/70' : 'bg-white/[0.16]')}>
      <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all duration-200" style={{ left: on ? 14 : 2 }} />
    </span>
  )
}

// engine.seatedLineup(slot) — the same starter-fill logic TeamTab.jsx
// already reads, taking whichever seat the roster selector below is
// pointed at rather than always your own. Roster Limits stays on mySlot
// regardless of that selector (see its own comment): filterCounts() has no
// slot parameter, so it can only ever answer for your own roster.
export default function PickQueueRail({
  engine,
  league,
  mySlot,
  viewSlot,
  onViewSlot,
  teamLabelOf,
  queuePlayers,
  onToggleQueue,
  autopick,
  onToggleAutopick,
  counts,
}) {
  const lineup = engine.seatedLineup(viewSlot)
  const seats = lineup?.seats || []
  const bench = lineup?.bench || []
  const benchRows = Array.from({ length: league.bench }, (_, i) => ({ slot: 'BE', player: bench[i] || null }))
  const rosterRows = [...seats, ...benchRows]
  const isMineView = viewSlot === mySlot

  // Yours first — the same seat order every other picker in this app
  // starts from, so "YOUR TEAM" is never buried in a ten- or twenty-team
  // list.
  const teamOrder = [mySlot, ...Array.from({ length: league.teams }, (_, s) => s).filter((s) => s !== mySlot)]

  // FLEX and bench have no entry in engine.filterCounts() — that function
  // only ever covers the six real positions (POSITIONS in app.js). Their
  // have/need come from the same seatedLineup(mySlot) read the position
  // rows above already need, rather than a second roster-counting pass.
  const myLineup = isMineView ? lineup : engine.seatedLineup(mySlot)
  const flexHave = (myLineup?.seats || []).filter((s) => s.slot === 'FLEX' && s.player).length
  const flexNeed = (myLineup?.seats || []).filter((s) => s.slot === 'FLEX').length
  const myBench = myLineup?.bench || []
  const limitChips = [
    ...(counts ? ['QB', 'RB', 'WR', 'TE'].map((pos) => ({ label: pos, have: counts[pos].have, need: counts[pos].need })) : []),
    { label: 'FLEX', have: flexHave, need: flexNeed },
    ...(counts ? [{ label: 'D/ST', have: counts.DST.have, need: counts.DST.need }, { label: 'K', have: counts.K.have, need: counts.K.need }] : []),
    { label: 'BE', have: myBench.length, need: league.bench },
  ]
  const rosterCount = counts ? counts.ALL.have : 0
  const rosterNeed = counts ? counts.ALL.need : 0

  return (
    <aside className="flex w-[252px] shrink-0 flex-col overflow-hidden border-r border-slate-rule bg-slate-bar/45">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-rule px-3 py-2.5">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-white">Pick Queue</span>
        <button
          type="button"
          onClick={onToggleAutopick}
          aria-pressed={autopick}
          className="flex items-center gap-1.5 rounded-full border border-slate-rule bg-slate-sunk/60 py-1 pl-2 pr-1"
        >
          <span className="text-[10px] font-semibold text-white/70">Autopick</span>
          <MiniToggle on={autopick} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-slate-rule/50 px-3 py-1.5">
        <span className="w-[30px] shrink-0 font-plex text-[9px] font-semibold tracking-[0.1em] text-ink-muted">RANK</span>
        <span className="flex-1 font-plex text-[9px] font-semibold tracking-[0.1em] text-ink-muted">PLAYER</span>
      </div>
      <div className="max-h-[132px] shrink-0 overflow-y-auto">
        {queuePlayers.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-ink-muted">No players in queue. Star a player to line one up.</p>
        ) : (
          queuePlayers.map((player, i) => (
            <div key={player.id || player.name} className="flex items-center gap-2 border-b border-slate-rule/35 px-3 py-1.5">
              <span className="w-[30px] shrink-0 font-plex text-[11px] text-ink-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/90">{player.name}</span>
              <span className={'shrink-0 rounded px-1 py-px text-[9px] font-bold tracking-[0.02em] ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')}>
                {player.pos}
              </span>
              <button
                type="button"
                onClick={() => onToggleQueue(player.name)}
                title="Remove from queue"
                className="shrink-0 px-0.5 text-ink-muted transition-colors duration-150 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-y border-slate-rule px-3 py-2.5">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-white">Roster</span>
        <select
          value={viewSlot}
          onChange={(e) => onViewSlot(Number(e.target.value))}
          className="min-w-0 flex-1 rounded-md border border-slate-rule bg-slate-sunk px-2 py-1 text-[11px] font-semibold text-white outline-none focus:border-teal-400/60"
        >
          {teamOrder.map((slot) => (
            <option key={slot} value={slot} className="bg-slate-panel">
              {slot === mySlot ? 'YOUR TEAM' : teamLabelOf(slot)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-slate-rule/50 px-3 py-1.5">
        <span className="w-[38px] shrink-0 font-plex text-[9px] font-semibold tracking-[0.1em] text-ink-muted">POS</span>
        <span className="flex-1 font-plex text-[9px] font-semibold tracking-[0.1em] text-ink-muted">PLAYER</span>
        <span className="w-6 shrink-0 text-right font-plex text-[9px] font-semibold tracking-[0.1em] text-ink-muted">BYE</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rosterRows.map((row, i) => (
          <div
            key={row.slot + '-' + i}
            className={
              'flex items-center gap-2 border-b border-slate-rule/30 px-3 py-1.5 ' +
              (row.player && isMineView ? 'bg-[rgba(255,209,102,0.05)] shadow-[inset_2px_0_0_0_#FFD166]' : '')
            }
          >
            <span className="w-[38px] shrink-0 font-plex text-[10px] font-semibold text-ink-soft">{row.slot}</span>
            {row.player ? (
              <>
                <span className="min-w-0 flex-1 truncate text-xs text-white/90">{row.player.name}</span>
                <span className="w-6 shrink-0 text-right font-plex text-[10.5px] text-ink-muted">{row.player.bye || '—'}</span>
              </>
            ) : (
              <span className="min-w-0 flex-1 text-xs italic text-ink-muted">Empty</span>
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-slate-rule bg-slate-sunk/60 px-3 pb-[11px] pt-[9px]">
        <div className="mb-[7px] flex items-baseline justify-between">
          <span className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white">Roster Limits</span>
          <span className="font-plex text-[10px] text-ink-muted">{rosterCount}/{rosterNeed} players</span>
        </div>
        <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
          {limitChips.map((c) => (
            <span key={c.label} className="flex items-baseline justify-between gap-1 rounded bg-white/[0.03] px-1.5 py-1">
              <span className="font-plex text-[9px] font-semibold text-ink-soft">{c.label}</span>
              <span className={'font-plex text-[10px] font-semibold ' + (c.have >= c.need ? 'text-emerald-300' : c.have > 0 ? 'text-ink' : 'text-ink-muted')}>
                {c.have}/{c.need}
              </span>
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
