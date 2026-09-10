import { Search, X, Zap } from 'lucide-react'
import PickQueueRail from './PickQueueRail.jsx'
import PicksRail from './PicksRail.jsx'
import PlayerQueueSidebar from './PlayerQueueSidebar.jsx'
import { POS_BADGE, POS_LIST } from './draftRoomPositions.js'
import { useMinWidth } from '../hooks/useBreakpoint.js'

const POS_OPTIONS = ['ALL', ...POS_LIST, 'FLEX', 'DST', 'K']

// Pool/Queue/Roster/Picks — the same four ideas the desktop layout spreads
// across three columns (the left rail is Queue+Roster+Limits together),
// as one-at-a-time panes instead. A phone has no room for even two of
// those columns side by side, so this isn't a squeeze of the desktop
// layout, it's the same four surfaces with a switch between them.
const MOBILE_PANES = [
  { key: 'pool', label: 'Pool' },
  { key: 'queue', label: 'Queue' },
  { key: 'roster', label: 'Roster' },
  { key: 'picks', label: 'Picks' },
]

// The one thing shared verbatim between the desktop layout and the mobile
// one below it — same copy, same button, just a different condition
// wrapping it (mobile also stands down while the pick clock band is
// swiped up, see bandCollapsed below).
function AutopickRibbon({ onToggleAutopick }) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-teal-400/[0.22] bg-teal-400/[0.08] px-[18px] py-[11px]">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-teal-400/[0.14] text-teal-300">
        <Zap className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold leading-tight text-white">You're on Autopick</p>
        <p className="text-[12px] text-ink-soft">Juke is picking for you from your queue. Disable Autopick to draft players yourself.</p>
      </span>
      <button
        type="button"
        onClick={onToggleAutopick}
        className="shrink-0 rounded-full bg-cta px-[18px] py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-white"
      >
        Disable Autopick
      </button>
    </div>
  )
}

// The ESPN-style three-column draft screen: a left rail of queue/roster/
// limits, a centre column of filters over the pool, a right rail of picks.
// hidden lg:flex — below lg this gives way to the segmented-pane layout
// further down, not a squeeze of the same three columns into one.
export default function PlayersTab({
  engine,
  league,
  mySlot,
  myTurn,
  teamLabelOf,
  autopick,
  onToggleAutopick,
  queuePlayers,
  onToggleQueue,
  rosterSlot,
  onRosterSlot,
  filterCounts,
  picks,
  board,
  players,
  search,
  onSearch,
  posFilter,
  onPosFilter,
  expBand,
  onExpBand,
  showDrafted,
  onShowDrafted,
  season,
  onSeason,
  priorSeasonYear,
  nflTeamFilter,
  onNflTeamFilter,
  pointsFor,
  vorpFor,
  valueFor,
  survivalFor,
  photoFor,
  initialsFor,
  onDraft,
  draftOver,
  queuedNames,
  draftedByFor,
  onSelectPlayer,
  sortBy,
  sortDir,
  onSort,
  projOf,
  tierAvgByPos,
  // Mobile only, below. mobilePane/onMobilePane are lifted to DraftRoom.jsx
  // rather than owned here — see its own openPlayersScreen() comment:
  // DraftDecideScreen's Roster link and "Browse all N players" button both
  // reach into a specific
  // pane of this screen from the Decide tab, which a control can't do to a
  // pane this component keeps as unreachable local state. bandCollapsed
  // mirrors PickClockBand's own swipe state so this ribbon stands down with
  // it, giving the active pane's list the height back rather than fighting
  // the band for it.
  mobilePane,
  onMobilePane,
  bandCollapsed,
}) {
  const nflTeams = Array.from(new Set(board.map((p) => p.team).filter(Boolean))).sort()
  // 1024px matches Tailwind's own `lg` — see useBreakpoint.js's own comment
  // for why this exists at all (the desktop dock's PlayerQueueSidebar and
  // the mobile Pool pane's own copy would otherwise both be mounted at once
  // below lg, colliding on shared layoutIds).
  const isDesktop = useMinWidth(1024)

  return (
    <>
    <div className="hidden min-h-0 flex-1 items-stretch overflow-hidden lg:flex">
      <PickQueueRail
        engine={engine}
        league={league}
        mySlot={mySlot}
        viewSlot={rosterSlot}
        onViewSlot={onRosterSlot}
        teamLabelOf={teamLabelOf}
        queuePlayers={queuePlayers}
        onToggleQueue={onToggleQueue}
        autopick={autopick}
        onToggleAutopick={onToggleAutopick}
        counts={filterCounts}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {autopick && <AutopickRibbon onToggleAutopick={onToggleAutopick} />}

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-rule bg-slate-panel/40 px-[18px] py-2.5">
          {/* Hidden rather than shown against empty columns when the stats
              feed found no prior season to grade against — see
              engine.priorSeason()'s own comment in app.js. */}
          {priorSeasonYear && (
            <select
              value={season}
              onChange={(e) => onSeason(e.target.value)}
              className="rounded-lg border border-slate-rule bg-slate-sunk px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
            >
              <option value="projected">2026 Projected</option>
              <option value="prior">{priorSeasonYear} Season</option>
            </select>
          )}

          <select
            value={posFilter}
            onChange={(e) => onPosFilter(e.target.value)}
            className="rounded-lg border border-slate-rule bg-slate-sunk px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
          >
            {POS_OPTIONS.map((pos) => (
              <option key={pos} value={pos} className="bg-slate-panel">
                {pos === 'ALL' ? 'All positions' : pos === 'DST' ? 'D/ST' : pos}
              </option>
            ))}
          </select>

          <select
            value={nflTeamFilter}
            onChange={(e) => onNflTeamFilter(e.target.value)}
            className="rounded-lg border border-slate-rule bg-slate-sunk px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
          >
            <option value="ALL">All NFL teams</option>
            {nflTeams.map((t) => (
              <option key={t} value={t} className="bg-slate-panel">{t}</option>
            ))}
          </select>

          <select
            value={expBand}
            onChange={(e) => onExpBand(e.target.value)}
            className="rounded-lg border border-slate-rule bg-slate-sunk px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
          >
            <option value="all">All tenure</option>
            <option value="rookie">Rookies</option>
            <option value="veteran">Veterans</option>
          </select>

          <span className="relative min-w-[160px] max-w-[320px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search players"
              className="w-full rounded-lg border border-slate-rule bg-slate-sunk/60 py-1.5 pl-8 pr-2.5 text-xs text-white placeholder:text-white/30 focus:border-teal-400/60 focus:outline-none"
            />
          </span>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => onShowDrafted(!showDrafted)}
            aria-pressed={showDrafted}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-rule bg-slate-sunk/60 px-2.5 py-1"
          >
            <span className="text-[11px] font-semibold text-white/70">Show drafted</span>
            <span className={'relative block h-3.5 w-[26px] rounded-full transition-colors duration-200 ' + (showDrafted ? 'bg-teal-500/70' : 'bg-white/[0.16]')}>
              <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all duration-200" style={{ left: showDrafted ? 14 : 2 }} />
            </span>
          </button>
          <span className="shrink-0 font-numeral tabular-nums text-[10.5px] text-ink-muted">{players.length} available</span>
        </div>

        {/* flex, not bare min-h-0 flex-1 — PlayerQueueSidebar's own root
            comment is explicit that its parent has to be a flex row for
            align-items:stretch to size it; a div with no display utility
            at all is still display:block regardless of min-h-0/flex-1
            sitting on it, so the child never received a height to stretch
            into and grew to its own content size instead — measured at
            1853px of table inside a 796px slot, with nothing left over for
            the inner list to scroll. Reported as a phone that wouldn't
            swipe the Pool list at all, here and on the mobile pane below,
            which shares the identical miss. */}
        <div className="flex min-h-0 flex-1">
          {/* isDesktop, not just this wrapper's own `hidden lg:flex`
              ancestor — that ancestor is CSS-only, so its child stays
              React-mounted (just invisible) below lg, and the mobile Pool
              pane's own PlayerQueueSidebar call further down is a true
              `{mobilePane === 'pool' && ...}` conditional. Together that is
              two mounted instances sharing one player's layoutId the
              moment a phone opens this tab with Pool selected — its own
              *default* pane — not a rare resize-timing edge case. See
              useBreakpoint.js's own comment for why a CSS class can't
              answer "is this really here" and this hook can. */}
          {isDesktop && (
          <PlayerQueueSidebar
            bareTable
            engine={engine}
            players={players}
            posFilter={posFilter}
            pointsFor={pointsFor}
            vorpFor={vorpFor}
            valueFor={valueFor}
            survivalFor={survivalFor}
            photoFor={photoFor}
            initialsFor={initialsFor}
            onDraft={onDraft}
            // Autopick submits your pick itself the instant it's your turn
            // (DraftRoom.jsx's own effect), so a human clicking Draft while
            // it's on is a race that shouldn't read as available — the
            // button has to look disabled, not just happen to lose the
            // race most of the time. myTurn otherwise means exactly what it
            // says; this is the one place that also folds autopick in,
            // because bareTable mode is the only consumer of this prop that
            // has an Autopick concept to fold in at all.
            myTurn={myTurn && !autopick}
            draftOver={draftOver}
            queuedNames={queuedNames}
            onToggleQueue={onToggleQueue}
            draftedByFor={draftedByFor}
            onSelectPlayer={onSelectPlayer}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            projOf={projOf}
            tierAvgByPos={tierAvgByPos}
            projectedGroupLabel={season === 'prior' ? `${priorSeasonYear} Actual` : 'Projected'}
          />
          )}
        </div>
      </main>

      <PicksRail picks={picks} league={league} mySlot={mySlot} teamLabelOf={teamLabelOf} initialsFor={initialsFor} />
    </div>

    {/* Mobile: one pane at a time behind a segmented control, rather than
        the desktop's three columns. Pool reuses the same shared table
        (PlayerQueueSidebar, mobile mode); Queue, Roster and Picks are
        fresh markup at phone scale — PickQueueRail's own Queue/Roster rows
        are sized for a 252px desktop rail, and 44px is this screen's own
        floor for anything tappable, not that rail's. The roster/limits
        arithmetic below is the same read PickQueueRail already does
        (engine.seatedLineup(), filterCounts()) — a second small reader of
        the same engine methods, not a second rule about what a roster is
        allowed to hold. */}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
      {autopick && !bandCollapsed && <AutopickRibbon onToggleAutopick={onToggleAutopick} />}

      <div className="flex shrink-0 gap-1.5 border-b border-slate-rule bg-slate-panel/40 px-2.5 py-2">
        {MOBILE_PANES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onMobilePane(p.key)}
            aria-pressed={mobilePane === p.key}
            className={
              'h-11 flex-1 rounded-full px-2 text-center text-xs font-semibold transition-colors duration-150 ' +
              (mobilePane === p.key ? 'bg-teal-400/[0.14] text-teal-300' : 'text-ink-muted hover:text-white/60')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {mobilePane === 'pool' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-2 border-b border-slate-rule bg-slate-panel/40 px-3 py-2.5">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search players"
                className="h-11 w-full rounded-lg border border-slate-rule bg-slate-sunk/60 pl-8 pr-2.5 text-sm text-white placeholder:text-white/30 focus:border-teal-400/60 focus:outline-none"
              />
            </span>

            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
              {priorSeasonYear && (
                <select
                  value={season}
                  onChange={(e) => onSeason(e.target.value)}
                  className="h-11 shrink-0 rounded-lg border border-slate-rule bg-slate-sunk px-2.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
                >
                  <option value="projected">2026 Projected</option>
                  <option value="prior">{priorSeasonYear} Season</option>
                </select>
              )}
              <select
                value={posFilter}
                onChange={(e) => onPosFilter(e.target.value)}
                className="h-11 shrink-0 rounded-lg border border-slate-rule bg-slate-sunk px-2.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
              >
                {POS_OPTIONS.map((pos) => (
                  <option key={pos} value={pos} className="bg-slate-panel">
                    {pos === 'ALL' ? 'All positions' : pos === 'DST' ? 'D/ST' : pos}
                  </option>
                ))}
              </select>
              <select
                value={nflTeamFilter}
                onChange={(e) => onNflTeamFilter(e.target.value)}
                className="h-11 shrink-0 rounded-lg border border-slate-rule bg-slate-sunk px-2.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
              >
                <option value="ALL">All NFL teams</option>
                {nflTeams.map((t) => (
                  <option key={t} value={t} className="bg-slate-panel">{t}</option>
                ))}
              </select>
              <select
                value={expBand}
                onChange={(e) => onExpBand(e.target.value)}
                className="h-11 shrink-0 rounded-lg border border-slate-rule bg-slate-sunk px-2.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
              >
                <option value="all">All tenure</option>
                <option value="rookie">Rookies</option>
                <option value="veteran">Veterans</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onShowDrafted(!showDrafted)}
                aria-pressed={showDrafted}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-rule bg-slate-sunk/60 px-2.5"
              >
                <span className="text-[11px] font-semibold text-white/70">Show drafted</span>
                <span className={'relative block h-3.5 w-[26px] rounded-full transition-colors duration-200 ' + (showDrafted ? 'bg-teal-500/70' : 'bg-white/[0.16]')}>
                  <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all duration-200" style={{ left: showDrafted ? 14 : 2 }} />
                </span>
              </button>
              <span className="flex-1" />
              <span className="shrink-0 font-numeral tabular-nums text-[10.5px] text-ink-muted">{players.length} available</span>
            </div>
          </div>

          {/* flex, for the identical reason the desktop wrapper above
              needs it — see that comment. Same class, same missing
              display utility, same fix. */}
          <div className="flex min-h-0 flex-1">
            <PlayerQueueSidebar
              bareTable
              mobile
              engine={engine}
              players={players}
              posFilter={posFilter}
              pointsFor={pointsFor}
              vorpFor={vorpFor}
              valueFor={valueFor}
              survivalFor={survivalFor}
              photoFor={photoFor}
              initialsFor={initialsFor}
              onDraft={onDraft}
              myTurn={myTurn && !autopick}
              draftOver={draftOver}
              queuedNames={queuedNames}
              onToggleQueue={onToggleQueue}
              draftedByFor={draftedByFor}
              onSelectPlayer={onSelectPlayer}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
              projOf={projOf}
              tierAvgByPos={tierAvgByPos}
              projectedGroupLabel={season === 'prior' ? `${priorSeasonYear} Actual` : 'Projected'}
            />
          </div>
        </div>
      )}

      {mobilePane === 'queue' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-rule/50 px-4 py-2">
            <span className="w-8 shrink-0 font-plex text-[10px] font-semibold tracking-[0.1em] text-ink-muted">RANK</span>
            <span className="flex-1 font-plex text-[10px] font-semibold tracking-[0.1em] text-ink-muted">PLAYER</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            {queuePlayers.length === 0 ? (
              <p className="px-4 py-8 text-center text-meta leading-relaxed text-ink-muted">
                No players in queue. Star a player in the pool and Autopick will draft him for you.
              </p>
            ) : (
              queuePlayers.map((player, i) => (
                <div key={player.id || player.name} className="flex items-center gap-2 border-b border-slate-rule/35 px-4 py-1.5">
                  <span className="w-8 shrink-0 font-plex text-xs text-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{player.name}</span>
                  <span className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.02em] ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')}>
                    {player.pos}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleQueue(player.name)}
                    title="Remove from queue"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {mobilePane === 'roster' && (() => {
        const lineup = engine.seatedLineup(rosterSlot)
        const seats = lineup?.seats || []
        const bench = lineup?.bench || []
        const benchRows = Array.from({ length: league.bench }, (_, i) => ({ slot: 'BE', player: bench[i] || null }))
        const rosterRows = [...seats, ...benchRows]
        const isMineView = rosterSlot === mySlot
        const teamOrder = [mySlot, ...Array.from({ length: league.teams }, (_, s) => s).filter((s) => s !== mySlot)]
        const myLineup = isMineView ? lineup : engine.seatedLineup(mySlot)
        const flexHave = (myLineup?.seats || []).filter((s) => s.slot === 'FLEX' && s.player).length
        const flexNeed = (myLineup?.seats || []).filter((s) => s.slot === 'FLEX').length
        const myBench = myLineup?.bench || []
        const limitChips = [
          ...(filterCounts ? ['QB', 'RB', 'WR', 'TE'].map((pos) => ({ label: pos, have: filterCounts[pos].have, need: filterCounts[pos].need })) : []),
          { label: 'FLEX', have: flexHave, need: flexNeed },
          ...(filterCounts ? [{ label: 'D/ST', have: filterCounts.DST.have, need: filterCounts.DST.need }, { label: 'K', have: filterCounts.K.have, need: filterCounts.K.need }] : []),
          { label: 'BE', have: myBench.length, need: league.bench },
        ]
        const rosterCount = filterCounts ? filterCounts.ALL.have : 0
        const rosterNeed = filterCounts ? filterCounts.ALL.need : 0

        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-slate-rule px-3 py-2">
              <select
                value={rosterSlot}
                onChange={(e) => onRosterSlot(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-slate-rule bg-slate-sunk px-2.5 text-sm font-semibold text-white outline-none focus:border-teal-400/60"
              >
                {teamOrder.map((slot) => (
                  <option key={slot} value={slot} className="bg-slate-panel">
                    {slot === mySlot ? 'YOUR TEAM' : teamLabelOf(slot)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-b border-slate-rule/50 px-4 py-2">
              <span className="w-10 shrink-0 font-plex text-[10px] font-semibold tracking-[0.1em] text-ink-muted">POS</span>
              <span className="flex-1 font-plex text-[10px] font-semibold tracking-[0.1em] text-ink-muted">PLAYER</span>
              <span className="w-8 shrink-0 text-right font-plex text-[10px] font-semibold tracking-[0.1em] text-ink-muted">BYE</span>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              {rosterRows.map((row, i) => (
                <div
                  key={row.slot + '-' + i}
                  className={
                    'flex items-center gap-2 border-b border-slate-rule/30 px-4 py-2 ' +
                    (row.player && isMineView ? 'bg-[rgba(255,209,102,0.05)] shadow-[inset_2px_0_0_0_#FFD166]' : '')
                  }
                >
                  <span className="w-10 shrink-0 font-plex text-[11px] font-semibold text-ink-soft">{row.slot}</span>
                  {row.player ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm text-white/90">{row.player.name}</span>
                      <span className="w-8 shrink-0 text-right font-plex text-xs text-ink-muted">{row.player.bye || '—'}</span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 text-sm italic text-ink-muted">Empty</span>
                  )}
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-slate-rule bg-slate-sunk/60 px-3 pb-3 pt-2.5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white">Roster Limits</span>
                <span className="font-plex text-[10px] text-ink-muted">{rosterCount}/{rosterNeed} players</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {limitChips.map((c) => (
                  <span key={c.label} className="flex items-baseline justify-between gap-1 rounded bg-white/[0.03] px-1.5 py-1.5">
                    <span className="font-plex text-[10px] font-semibold text-ink-soft">{c.label}</span>
                    <span className={'font-plex text-[10px] font-semibold ' + (c.have >= c.need ? 'text-emerald-300' : c.have > 0 ? 'text-ink' : 'text-ink-muted')}>
                      {c.have}/{c.need}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {mobilePane === 'picks' && (
        <PicksRail mobile picks={picks} league={league} mySlot={mySlot} teamLabelOf={teamLabelOf} initialsFor={initialsFor} />
      )}
    </div>
    </>
  )
}
