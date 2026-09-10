import { POS_SOLID } from '../draftRoomPositions.js'

// README section 7. Same data TeamTab.jsx already reads (engine.seatedLineup
// (viewSlot), which the mobile redesign's own comment in app.js says was
// built for exactly this — "the React Team tab can seat any manager's
// roster, not just yours") in the new pixel layout: team-selector chips,
// slot badges (incl. the WRT tri-colour stripe for FLEX), a real headshot/
// initials avatar per player (same removes-itself-on-404 pattern
// LockerTable.jsx already uses), and a pick-number circle.
const FLEX_STRIPE = 'linear-gradient(90deg,#047857 0 33.34%,#1D4ED8 33.34% 66.67%,#A21CAF 66.67% 100%)'

function Avatar({ player, photoFor, initialsFor }) {
  if (!player) {
    return <div className="h-[34px] w-[34px] shrink-0 rounded-full border border-slate-rule bg-slate-panel" />
  }
  return (
    <div className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-rule bg-slate-panel font-plex text-[10px] text-ink-muted">
      {initialsFor(player)}
      {photoFor(player) && (
        <img
          src={photoFor(player)}
          alt=""
          loading="lazy"
          onError={(e) => e.currentTarget.remove()}
          className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
        />
      )}
    </div>
  )
}

// SLOT_ORDER (app.js) names the flex slot "FLEX", never "WRT" — the badge
// text is the design's own convention (it can be filled by RB/WR/TE, and
// "WRT" says so at a glance the way "FLEX" doesn't), the tri-colour stripe
// keys off the real slot name underneath it.
function SlotRow({ label, player, pickCode, photoFor, initialsFor }) {
  const isFlex = label === 'FLEX'
  const badgeText = isFlex ? 'WRT' : label
  return (
    <div className="flex items-center gap-2.5 py-[7px]">
      <span
        className="flex h-[34px] w-[46px] shrink-0 items-center justify-center rounded-[7px] font-body text-[11px] font-bold tracking-[0.04em] text-white"
        style={isFlex ? { background: FLEX_STRIPE } : { backgroundColor: POS_SOLID[label] || '#38434F', color: player ? undefined : 'rgba(255,255,255,0.5)' }}
      >
        {badgeText}
      </span>

      <Avatar player={player} photoFor={photoFor} initialsFor={initialsFor} />

      <div className="min-w-0 flex-1">
        {player ? (
          <>
            <p className="truncate text-[15px] font-semibold text-ink">{player.name}</p>
            <p className="truncate font-plex text-[11px] text-ink-muted">
              {player.pos} - {player.team} ({player.bye ?? '—'})
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-[#4C5763]">Empty</p>
            <p className="font-plex text-[11px] text-[#4C5763]">open slot</p>
          </>
        )}
      </div>

      {player && pickCode && (
        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full bg-slate-panel">
          <span className="font-numeral text-meta font-bold leading-none text-ink">{pickCode}</span>
          <span className="text-[9px] leading-tight text-ink-muted">pick</span>
        </div>
      )}
    </div>
  )
}

export default function TeamTabPhone({ engine, league, mySlot, viewSlot, onViewSlot, teamLabelOf, picks, photoFor, initialsFor }) {
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const lineup = engine.seatedLineup(viewSlot)
  const seats = lineup?.seats || []
  const bench = lineup?.bench || []
  const benchBoxes = Array.from({ length: league.bench }, (_, i) => bench[i] || null)

  // Draft position, per player on the currently-viewed team — picks() is
  // where "which overall pick" actually lives (pick.overall), never the
  // player object itself (player.overall is the board's own ADP-based
  // rank, a different fact CLAUDE.md's own "draft value" section already
  // warns not to confuse with the pick that landed him).
  const pickCodeFor = (player) => {
    if (!player || !DE) return null
    const pick = picks.find((p) => p.slot === viewSlot && p.player.name === player.name)
    return pick ? DE.pickCode(pick.overall, league) : null
  }

  // Own team first and selected by default: DraftRoom.jsx already seeds
  // viewSlot from mySlot on mount, this just orders the chip row to match.
  const order = Array.from({ length: league.teams }, (_, s) => s).sort((a, b) => (a === mySlot ? -1 : b === mySlot ? 1 : a - b))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 gap-[7px] overflow-x-auto border-b border-white/[0.06] px-3 py-2.5">
        {order.map((slot) => {
          const selected = viewSlot === slot
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onViewSlot(slot)}
              className={
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-3 text-xs font-semibold transition-colors duration-150 ' +
                (selected ? 'bg-ink text-[#0D0F15]' : 'border border-slate-rule bg-slate-panel text-ink')
              }
            >
              <span
                className={
                  'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-plex text-[10px] ' +
                  (selected ? 'bg-[#0D0F15] text-teal-300' : 'bg-slate-sunk text-ink-muted')
                }
              >
                {initialsFor({ name: teamLabelOf(slot) })}
              </span>
              {teamLabelOf(slot)}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {seats.map((s, i) => (
          <SlotRow key={'seat-' + i} label={s.slot} player={s.player} pickCode={pickCodeFor(s.player)} photoFor={photoFor} initialsFor={initialsFor} />
        ))}
        {benchBoxes.map((player, i) => (
          <SlotRow key={'bn-' + i} label="BN" player={player} pickCode={pickCodeFor(player)} photoFor={photoFor} initialsFor={initialsFor} />
        ))}
      </div>
    </div>
  )
}
