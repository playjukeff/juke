import { Sparkles } from 'lucide-react'
import { POS_BADGE, INJURY_META } from './draftRoomPositions.js'

// Every number here is a real, already-existing function — nothing was
// invented for this card:
//   - `player` is suggestions('ALL')[0] from app.js, the same ranking
//     (adp+jitter) x need x risk x model that drives the legacy Suggestions
//     tab. 'ALL' rather than the queue's own position pill on purpose — see
//     CLAUDE.md's autoPickForMe() note: a filter is a lens, never the thing
//     deciding what "recommended" means.
//   - `vorp` is replacementGap(player), the un-clamped points-above-
//     replacement figure overallScore() itself divides down to a 0-100
//     share — already named "vor" in app.js's own source.
//   - `tierLeft` is tierRemaining(player), the exact function the legacy
//     board's tier chips already print ("2 left in tier 1").
//
// The alert only renders when tierLeft is genuinely small (<=3) — the
// legacy tierChip() always prints something, but calling six players left
// a "scarcity alert" would be crying wolf. Nothing to recommend (no
// player, or every position full) means no card, not an empty one.
export default function JukeValueAssistant({ player, vorp, tierLeft, onDraft, myTurn, photoFor, initialsFor, compact, onOpenProfile }) {
  if (!player) return null

  const photo = photoFor(player)
  const inj = INJURY_META[player.inj]

  /* Compact is the desktop panel row's variant, not a smaller taste: the
     board now takes the top half of the window, so the Players panel has
     roughly 470px for a recommendation, a search box, two rows of filter
     chips, a column header and the list itself. The full card is ~200px
     of that and left one player row visible — a recommendation card that
     crowds out the players is not helping anyone choose. Same three facts
     (who, what he is worth, draft him), one row instead of five. The tier
     warning survives as an inline clause rather than its own alert box;
     it is still spelled out in full on the player's own card. */
  if (compact) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-teal-500/40 bg-slate-panel/90 px-2.5 py-2">
        <Sparkles className="h-3 w-3 shrink-0 text-teal-300" />
        <div className="relative flex h-7 w-7 lg:h-10 lg:w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-[8px] lg:text-[10px] font-bold text-ink-soft">
          {initialsFor(player)}
          {photo && (
            <img
              src={photo}
              alt=""
              loading="lazy"
              onError={(e) => e.currentTarget.remove()}
              className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            onClick={() => onOpenProfile && onOpenProfile(player)}
            className={'truncate text-xs font-semibold text-white ' + (onOpenProfile ? 'cursor-pointer hover:text-teal-300' : '')}
          >
            {player.name}
          </p>
          <p className="flex flex-wrap items-center gap-1 truncate text-[10px] text-ink-muted">
            {player.pos} · {player.team}
            {tierLeft != null && tierLeft <= 3 && (
              <span className="text-amber-300"> · {tierLeft} left in tier {player.tier}</span>
            )}
            {inj && (
              <span className={'rounded px-1 py-px text-[8px] font-bold uppercase leading-tight ' + inj.cls}>{player.inj}</span>
            )}
          </p>
        </div>
        {/* Labelled, matching the full card's own VORP tag below — a
            design review caught this compact variant printing a bare
            signed number with nothing saying what it was measuring. */}
        {vorp != null && (
          <div className="shrink-0 text-right leading-none">
            <span className={'block text-xs font-bold tabular-nums ' + (vorp >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
              {vorp >= 0 ? '+' : ''}
              {vorp.toFixed(0)}
            </span>
            <span className="text-[7px] font-semibold uppercase tracking-wide text-ink-muted">VORP</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onDraft(player)}
          disabled={!myTurn}
          title={myTurn ? 'Draft the recommended pick' : 'Not your turn'}
          className={
            'shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-all duration-200 ' +
            (myTurn
              ? 'bg-cta text-white hover:scale-105'
              : 'cursor-not-allowed bg-white/5 text-white/25')
          }
        >
          Draft
        </button>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-xl border border-teal-500/40 bg-slate-panel/90 p-4 shadow-[0_0_20px_rgba(0,229,255,0.1)]">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-teal-300">
        <Sparkles className="h-3 w-3" />
        Juke Value Assistant
      </p>

      <p className="mt-3 text-[9px] font-semibold uppercase tracking-wide text-ink-muted">Recommended pick</p>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 lg:h-12 lg:w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-sunk text-[9px] lg:text-xs font-bold text-ink-soft">
          {initialsFor(player)}
          {photo && (
            <img
              src={photo}
              alt=""
              loading="lazy"
              onError={(e) => e.currentTarget.remove()}
              className={'absolute inset-0 h-full w-full ' + (player.pos === 'DST' ? 'object-contain p-1' : 'object-cover')}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/50')}>
              {player.pos}
            </span>
            <p
              onClick={() => onOpenProfile && onOpenProfile(player)}
              className={'truncate text-sm font-semibold text-white ' + (onOpenProfile ? 'cursor-pointer hover:text-teal-300' : '')}
            >
              {player.name}
            </p>
          </div>
          <p className="flex items-center gap-1 truncate text-[11px] text-ink-muted">
            {player.team}
            {inj && (
              <span className={'rounded px-1 py-px text-[8px] font-bold uppercase leading-tight ' + inj.cls}>{player.inj}</span>
            )}
          </p>
        </div>
        {vorp != null && (
          <div className="shrink-0 text-right leading-none">
            <span className={'block font-display text-base font-bold tabular-nums ' + (vorp >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
              {vorp >= 0 ? '+' : ''}
              {vorp.toFixed(1)}
            </span>
            <span className="text-[8px] font-semibold uppercase tracking-wide text-ink-muted">VORP</span>
          </div>
        )}
      </div>

      {tierLeft != null && tierLeft <= 3 && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-200">
          <span aria-hidden="true">⚠️</span>
          <span>
            <span className="font-bold uppercase tracking-wide">Tier scarcity —</span> only {tierLeft} Tier-{player.tier} {player.pos}
            {tierLeft === 1 ? '' : 's'} remaining before a steep drop-off.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => onDraft(player)}
        disabled={!myTurn}
        title={myTurn ? undefined : 'Not your turn'}
        className={
          'mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all duration-200 ' +
          (myTurn
            ? 'bg-cta text-white shadow-[0_0_18px_rgba(0,229,255,0.5)] hover:scale-[1.02] hover:shadow-[0_0_26px_rgba(0,229,255,0.7)]'
            : 'cursor-not-allowed bg-white/5 text-white/25')
        }
      >
        Draft Recommended
      </button>
    </div>
  )
}
