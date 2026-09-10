import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { POS_BADGE, POS_CHALK, INJURY_META } from './draftRoomPositions.js'
import QueueList from './QueueList.jsx'

function round1(v) {
  return v == null ? null : Math.round(v)
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// One function for verdict word, colour and the matching action — so a
// not-your-turn card can't say "safe to wait" in emerald and then hand
// you a rose Draft-now button underneath it. Thresholds are round numbers
// chosen for legibility, not fit to anything; survivalProbability() is
// the real measurement, this only buckets it into three sentences.
//
// `actionable` is whether Draft is really available right now. SurvivorCard
// is the "who's still here at my next turn" screen, rendered exactly when
// it is NOT your turn (Card covers the myTurn case and never calls this),
// so its Draft button is correctly disabled the whole time it's on screen.
// "Take him now" above a button that cannot be pressed is the same failure
// as naming a kicker the biggest reach: a correct number nobody can act on.
// The bucket, the colour and the button's own action never change — only
// the word painted above a button that was never clickable.
function verdictFor(survival, actionable = true) {
  if (survival == null) return { label: 'Unranked market', color: 'text-ink-muted', action: 'Draft' }
  if (survival < 0.2) {
    return actionable
      ? { label: 'Take him now', color: 'text-rose-300', action: 'Draft' }
      : { label: 'Likely gone', color: 'text-rose-300', action: 'Draft' }
  }
  if (survival < 0.65) {
    return actionable
      ? { label: 'Coin flip', color: 'text-amber-300', action: 'Queue him' }
      : { label: 'Coin flip on lasting', color: 'text-amber-300', action: 'Queue him' }
  }
  return { label: 'Safe to wait', color: 'text-emerald-300', action: 'Leave him' }
}

function whatItDoes(engine, player, vorp) {
  const fit = engine.draftFit(player)
  const vorpText = vorp != null ? ` ${vorp >= 0 ? '+' : ''}${Math.round(vorp)} points above replacement.` : ''
  if (fit && fit.startsNow) return `Fills your ${ordinal(fit.have + 1)} ${player.pos} slot.${vorpText}`
  return `Bench depth at ${player.pos}.${vorpText}`
}

// A design review flagged this directly: the recommended card's own Juke
// score can print lower than a sibling's ("Juke's pick" at 57 next to a
// 59), and a reader's first conclusion is that the app recommended the
// worse player. It didn't — suggestions() ranks by ADP, need and risk
// alongside the model's opinion (see CLAUDE.md's "The suggestions"
// section), on purpose, so it can rank a lower-scoring player above a
// higher-scoring one when the higher scorer doesn't fill a real need or
// is riskier. Re-sorting the cards by the number shown would undo that —
// the fix is to say the actual reason a card won its slot instead of
// leaving a bare number to imply one that may not be true.
/* The line below which "scarce" and "safe" stop meaning anything.

   Module scope because reasonFor() has to answer the SAME question the
   demotion asked -- a second copy of this number is how the label and its
   own explanation drift apart, which is exactly what happened. */
const BAD_VORP = -30

/* Genuinely likely gone, on the same 0.4 the "If you wait" box already
   treats as a real risk. One reading of one threshold, used by the
   demotion and by the sentence that explains it. */
const AT_RISK = 0.4

function reasonFor(rankLabel, candidate, engine) {
  if (rankLabel === 'Scarcest') {
    return candidate.tierLeft != null
      ? `Only ${candidate.tierLeft} left in his tier — the run won't wait.`
      : "Thin at his position — the run won't wait."
  }
  if (rankLabel === 'Safest wait') return 'Deepest tier of the three — the least urgent pick here.'
  // 'Also available' — a candidate too far below replacement for
  // "scarce"/"safe" to mean anything (see BAD_VORP above). Was "Nobody's
  // rushing for him — pure bench depth at this point," which read as a
  // verdict on the player rather than a fact about the market — "pure"
  // and "nobody's rushing" both frame him as barely worth having, when
  // the actual reason he's in this slot is timing, not quality: nothing
  // else here scored him low, the market just isn't pricing urgency into
  // him. Same "no rush" fact Safest wait states, in the same neutral
  // register.
  if (rankLabel === 'Also available') {
    /* Say WHY this card was demoted, rather than one sentence for three
       different reasons.

       A card reaches 'Also available' three ways: Scarcest with a VORP
       below BAD_VORP, Safest wait with a VORP below it, or Safest wait
       whose survival is under AT_RISK. The third is demoted precisely
       BECAUSE he is likely gone -- and every one of them printed "No
       urgency behind him", directly above an "If you wait" box reading
       "Gone before pick 20 in 100% of boards". The mechanism guaranteed
       the contradiction: the same condition that moved the label wrote
       the sentence denying it.

       The label was fixed once already for this exact shape (see the
       demotion's own comment on a real −100 VORP card reading
       "Scarcest") and the sentence underneath it was not. Both now read
       the same two thresholds. */
    if (candidate.survival != null && candidate.survival < AT_RISK) {
      return 'Likely gone before your next pick — but not the best of the three.'
    }
    if (candidate.vorp != null && candidate.vorp < BAD_VORP) {
      return 'Below the tier worth rushing for — depth, not a starter.'
    }
    return 'No urgency behind him — steady bench value whenever you need it.'
  }
  const fit = engine.draftFit(candidate.player)
  return fit && fit.startsNow ? 'Best value for a slot you still need to fill.' : 'Best value still on the board.'
}

/* Every card answers the same question about what it forgoes, not a
   different one depending on rank — "what it costs" always means "the best
   available player at your other most pressing need, and whether the
   market says he lasts to your next pick." Built entirely from real,
   already-bridged reads (replacementGap, survivalProbability); nothing
   here estimates a future board the way a single "-34 points" delta would
   have to. */
function whatItCosts(engine, board, player, counts, nextOverall) {
  if (!counts) return "Nothing to compare yet — the draft hasn't started."
  const short = ['QB', 'RB', 'WR', 'TE'].filter((pos) => pos !== player.pos && counts[pos] && counts[pos].short)
  if (!short.length) return 'Nothing — every other starting slot is already filled.'
  // The position furthest from covered, first.
  short.sort((a, b) => (counts[b].need - counts[b].have) - (counts[a].need - counts[a].have))
  const need = short[0]
  const bestAtNeed = board
    .filter((p) => !p.drafted && p.pos === need)
    .map((p) => ({ p, gap: engine.replacementGap(p) }))
    .filter((x) => x.gap != null)
    .sort((a, b) => b.gap - a.gap)[0]
  if (!bestAtNeed) return `Nothing left at ${need} worth comparing against.`
  const vorpText = `${bestAtNeed.gap >= 0 ? '+' : ''}${Math.round(bestAtNeed.gap)}`
  const survival = nextOverall != null ? engine.survivalProbability(bestAtNeed.p, nextOverall) : null
  if (survival == null) {
    return `The board's best ${need} right now is ${bestAtNeed.p.name} (${vorpText} VORP) — no market read on whether he lasts.`
  }
  const pct = Math.round(survival * 100)
  return survival < 0.4
    ? `The board's best ${need}, ${bestAtNeed.p.name} (${vorpText}), is unlikely to last — ${pct}% chance he's still there at your next pick.`
    : `The board's best ${need}, ${bestAtNeed.p.name} (${vorpText}), should still be around — ${pct}% chance he lasts to your next pick.`
}

// Shared by the desktop tier ladder and the mobile tier strip below, so
// the two can never describe the identical row differently.
function tierCaption(row) {
  if (row.tier1.length === 0) return 'none this deep'
  if (row.remaining === 0) return 'tier gone'
  if (row.remaining <= 4) return `cliff after ${row.remaining} more`
  return 'no rush'
}

/* When two of the three cards land on the identical rounded Juke score, a
   reader has no way to know why one outranks the other without this — the
   suggestion engine's own weighting (ADP, need, risk, the model) is
   opaque from here, so this names a real, checkable difference between the
   tied pair rather than claiming to know the algorithm's own reasoning. */
function tiebreakNote(candidate, siblings) {
  if (candidate.juke == null) return null
  const tied = siblings.find((s) => s !== candidate && s.juke != null && Math.round(s.juke) === Math.round(candidate.juke))
  if (!tied) return null
  const vorpGap = Math.round((candidate.vorp ?? 0) - (tied.vorp ?? 0))
  if (Math.abs(vorpGap) >= 3) {
    return `Ties ${tied.player.name} on Juke score — ${vorpGap > 0 ? 'edges him' : 'trails him'} by ${Math.abs(vorpGap)} VORP.`
  }
  if (candidate.player.bye && tied.player.bye && candidate.player.bye !== tied.player.bye) {
    return `Ties ${tied.player.name} on Juke score — byes land in different weeks (${candidate.player.bye} vs ${tied.player.bye}).`
  }
  return `Ties ${tied.player.name} on Juke score.`
}

function Card({ candidate, rankLabel, primary, onDraft, myTurn, engine, board, counts, siblings, onOpenProfile }) {
  const { player, vorp, juke, survival, nextOverall } = candidate
  const proj = typeof player.projPts === 'number' ? Math.round(player.projPts) : null
  const risky = survival != null && survival < 0.4
  const inj = INJURY_META[player.inj]

  return (
    <div
      className={
        'flex flex-col rounded-xl border p-[18px] ' +
        (primary ? 'border-teal-400/35 bg-gradient-to-b from-teal-400/[0.08] to-transparent' : 'border-white/[0.08] bg-white/[0.02]')
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <span className={'rounded px-[9px] py-1 text-[10px] font-bold ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/60')}>
          {player.pos}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/55">{rankLabel}</span>
      </div>

      {/* The one player-facing surface on this screen that had no way to
          open the profile it's describing — every number below is drawn
          from data the profile explains in full, and there was no path to
          it from here. cursor-pointer plus a hover state, the same
          affordance the Everyone Else rows below already carry. */}
      <div
        onClick={() => onOpenProfile(player)}
        className="cursor-pointer font-display text-[32px] font-bold leading-none text-white transition-colors hover:text-teal-300"
      >
        {player.name}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/60">
        {player.team} · bye {player.bye || '—'}
        {player.tier ? ` · tier ${player.tier}` : ''}
        {inj && (
          <span className={'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ' + inj.cls} title={inj.label}>
            {player.inj}
          </span>
        )}
      </div>

      {/* The reason this card won its slot, not just a number a reader has
          to compare against the other two cards themselves. */}
      <div className="mb-3 text-sm font-semibold leading-[1.4] text-teal-200">{reasonFor(rankLabel, candidate, engine)}</div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">VORP</div>
          <div className="font-numeral text-lg font-bold tabular-nums text-emerald-300">
            {vorp != null ? `${vorp >= 0 ? '+' : ''}${Math.round(vorp)}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Juke score</div>
          <div className="font-numeral text-lg font-bold tabular-nums text-teal-300">{juke ?? '—'}</div>
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Proj</div>
          <div className="font-numeral text-lg font-bold tabular-nums text-white">{proj ?? '—'}</div>
        </div>
      </div>

      <div className="mb-2 rounded-lg bg-white/[0.04] p-3">
        <div className="mb-[5px] text-[10px] font-bold uppercase tracking-[0.09em] text-ink-muted">What it does</div>
        <div className="text-sm leading-[1.45] text-white/90">{whatItDoes(engine, player, vorp)}</div>
      </div>

      {survival != null && (
        <div className={'mb-2 rounded-lg p-3 ' + (risky ? 'bg-rose-500/10' : 'bg-emerald-500/10')}>
          <div className={'mb-[5px] text-[10px] font-bold uppercase tracking-[0.09em] ' + (risky ? 'text-rose-300' : 'text-emerald-300')}>
            If you wait
          </div>
          <div className={'text-sm leading-[1.45] ' + (risky ? 'text-rose-200' : 'text-emerald-200')}>
            {risky
              ? `Gone before pick ${nextOverall} in ${Math.round((1 - survival) * 100)}% of boards.`
              : `Still there at ${nextOverall} in ${Math.round(survival * 100)}% of boards.`}
          </div>
        </div>
      )}

      {/* Every card names what it adds ("What it does" above); this is the
          other half — what it forgoes. Same question asked of all three
          cards, so a reader can compare them on this too, not just VORP. */}
      <div className="mb-4 rounded-lg bg-white/[0.04] p-3">
        <div className="mb-[5px] text-[10px] font-bold uppercase tracking-[0.09em] text-ink-muted">What it costs</div>
        <div className="text-sm leading-[1.45] text-white/90">{whatItCosts(engine, board, player, counts, nextOverall)}</div>
      </div>

      {siblings && (() => {
        const note = tiebreakNote(candidate, siblings)
        return note ? <div className="mb-3 text-[12px] leading-relaxed text-ink-muted">{note}</div> : null
      })()}

      <button
        type="button"
        onClick={() => onDraft(player)}
        disabled={!myTurn}
        className={
          'mt-auto w-full rounded-lg py-[13px] text-sm font-bold transition-all duration-200 ' +
          (!myTurn
            ? 'cursor-not-allowed bg-white/5 text-white/25'
            : primary
              ? 'bg-cta text-white shadow-glass hover:scale-[1.02]'
              : 'bg-white/[0.06] text-white/85 hover:bg-white/10')
        }
      >
        Draft {player.name}
      </button>
    </div>
  )
}

function SurvivorCard({ candidate, engine, onQueueToggle, onDraft, myTurn, queued, onOpenProfile }) {
  const { player, survival } = candidate
  const verdict = verdictFor(survival, myTurn)
  const pct = survival != null ? Math.round(survival * 100) : null
  const barColor = survival == null ? 'bg-white/20' : survival < 0.2 ? 'bg-rose-400' : survival < 0.65 ? 'bg-amber-300' : 'bg-emerald-400'

  const act = () => {
    if (verdict.action === 'Draft') onDraft(player)
    else if (verdict.action === 'Queue him') onQueueToggle(player.name)
    // "Leave him" does nothing — that's the point of it.
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={'rounded px-2 py-0.5 text-[10px] font-bold ' + (POS_BADGE[player.pos] || 'bg-white/10 text-white/60')}>
          {player.pos}
        </span>
        <span className={'text-[10px] font-bold uppercase tracking-[0.08em] ' + verdict.color}>{verdict.label}</span>
      </div>
      <div
        onClick={() => onOpenProfile(player)}
        className="mb-3 cursor-pointer font-display text-[23px] font-bold leading-tight text-white transition-colors hover:text-teal-300"
      >
        {player.name}
      </div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className={'font-display text-[32px] font-bold leading-[0.95] ' + verdict.color}>{pct != null ? `${pct}%` : '—'}</span>
        <span className="text-xs text-white/55">still there</span>
      </div>
      <div className="mb-3 h-[5px] overflow-hidden rounded-full bg-white/[0.09]">
        <div className={'h-full rounded-full ' + barColor} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <button
        type="button"
        onClick={act}
        disabled={verdict.action === 'Draft' && !myTurn}
        /* The gold border and wash are the seat's mark; the label is ink.
           Gold as 12px type on its own 10% wash measured 2.81:1. */
        className="w-full rounded-lg border border-[#FFD166]/45 bg-[#FFD166]/10 py-2.5 text-xs font-bold text-ink transition-colors hover:bg-[#FFD166]/[0.18] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {verdict.action === 'Queue him' && queued ? 'Queued' : verdict.action}
      </button>
    </div>
  )
}

// Mobile only — the desktop tier ladder (above) is a grid of cards with
// room to spell "TIER 1" and a caption out in full; this is the same six
// fields (tierCaption() included, never a second wording of the same row)
// in a phone-width cell, one swipe-scrollable row instead of a grid.
function TierStripMobile({ tierLadder }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
      {tierLadder.map((row) => (
        <div key={row.pos} className="w-[108px] shrink-0 rounded-lg bg-white/[0.03] p-2.5">
          <div className="flex items-center gap-1">
            <span className={'rounded px-1.5 py-0.5 text-[9px] font-bold ' + (POS_BADGE[row.pos] || 'bg-white/10 text-white/60')}>
              {row.pos}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-ink-muted">Tier 1</span>
          </div>
          <div className="mt-1.5 font-numeral tabular-nums text-[10.5px] text-ink-muted">{row.remaining} left</div>
          <div className="mt-1 truncate font-numeral text-[10px] text-ink-muted">{tierCaption(row)}</div>
        </div>
      ))}
    </div>
  )
}

// Mobile only — one Card/SurvivorCard at a time (desktop shows all three
// side by side; a phone has room for one) with a 48x44 previous/next pair
// and a dot per candidate, the active one teal-400. Neither leaf component
// is touched: this only changes how many of them are on screen and how you
// move between them, never what a card itself says or how it decides
// anything, which is exactly what CLAUDE.md's own "do not touch
// DraftDecideScreen.jsx's grading, sentence generation or rank-label logic"
// rule is protecting.
//
// Swiping the card left/right pages it too, via the same drag-a-fixed-
// element-then-measure-the-release-point shape PlayerHub's own sheet and
// PickClockBand's own grab handle already use elsewhere in this redesign —
// pointer and touch both, a real distance threshold rather than any move
// at all counting as a page.
function CardPager({ count, index, onIndex, children }) {
  const dragX = useRef(null)
  const onDragStart = (e) => { dragX.current = e.touches ? e.touches[0].clientX : e.clientX }
  const onDragEnd = (e) => {
    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
    const dx = dragX.current == null ? 0 : x - dragX.current
    dragX.current = null
    if (dx < -32) onIndex(Math.min(count - 1, index + 1))
    else if (dx > 32) onIndex(Math.max(0, index - 1))
  }
  return (
    <div>
      <div
        onTouchStart={onDragStart}
        onTouchEnd={onDragEnd}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </div>
      <div className="mt-3.5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Previous option"
          className="flex h-11 w-12 items-center justify-center rounded-lg border border-white/[0.12] text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className={'h-[7px] w-[7px] rounded-full ' + (i === index ? 'bg-teal-400' : 'bg-white/[0.18]')} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => onIndex(Math.min(count - 1, index + 1))}
          disabled={index === count - 1}
          aria-label="Next option"
          className="flex h-11 w-12 items-center justify-center rounded-lg border border-white/[0.12] text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function DraftDecideScreen({ engine, league, mySlot, myTurn, autopick, picks, onDraft, onQueueToggle, onOpenProfile, queuedNames, nextOverall, nextPicks, onOpenHub }) {
  // Folded once, here, rather than at every Draft affordance below —
  // PlayersTab.jsx's own two PlayerQueueSidebar calls already do this same
  // fold ("a human clicking Draft while [autopick's] on is a race that
  // shouldn't read as available"); this screen never received an autopick
  // prop at all, so every Draft button here — the two ranked cards, the
  // queue list, and the "Everyone else" rows, on both mobile and desktop —
  // stayed clickable through a whole autopick turn. engine.draftPlayer()
  // only checks whose turn it is, never this local toggle, so a tap here
  // during autopick was a genuine race for who actually drafts, not a
  // harmless no-op.
  const canDraftNow = myTurn && !autopick
  // Mobile's own segmented control (Juke/Everyone/Team) and the pager's
  // current card, declared above the draftOver() early return below so
  // every hook still runs on every render regardless of which branch this
  // component takes — the same rule AnalysisTab.jsx's own mobile state
  // already follows, for the same reason.
  const [mobilePane, setMobilePane] = useState('juke')
  const [cardIndex, setCardIndex] = useState(0)
  // A new pick landing means new candidates — the reader's own place in
  // the old set means nothing against the new one, so this resets to the
  // first card rather than silently showing "card 2 of 3" of a set nobody
  // chose to look at yet.
  useEffect(() => { setCardIndex(0) }, [picks.length])
  // A finished draft has no decision left to make — suggestions('ALL')
  // returns nothing, survivalProbability() has no next pick to check
  // against, and the not-your-turn cards would otherwise show three
  // "Unranked market" verdicts, a label built for an unrankable *player*
  // (K/DST), not for "there is no more draft." The real end-of-draft
  // banner and report are a later phase — this is just the guard against
  // rendering something confusing in the meantime, since finishing a
  // draft while sitting on this tab is one click away for anyone.
  if (engine.draftOver()) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <div className="mb-1 font-display text-[32px] font-bold text-white">Draft complete</div>
          <p className="text-sm text-white/60">
            {picks.length} picks made. See the Board or Analysis tab for the finished draft.
          </p>
        </div>
      </div>
    )
  }

  // nextOverall/nextPicks come from DraftRoom.jsx now, not computed here —
  // PickClockBand.jsx needs the identical values above the tab strip on
  // every tab, not just Decide, and this off-by-one (skip my own current
  // pick when it's genuinely my turn) already cost one design-review round
  // to get right. Lifting it to one call site is what stops a second copy
  // drifting from this one; see DraftRoom.jsx's own comment on both values.
  const lineup = engine.seatedLineup(mySlot)
  const counts = engine.filterCounts()
  // K and DST belong on this list too — a roster isn't full without them,
  // and their absence here read as the app not knowing they existed.
  // filterCounts() already builds a real have/need/text for every entry in
  // POSITIONS (K and DST included, capped by atPositionCap() rather than
  // league.starters directly, same as everywhere else that asks); this was
  // just filtering four of the six back out.
  const needRows = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
    .map((pos) => ({ pos, ...(counts ? counts[pos] : { have: 0, need: 0 }) }))

  const raw = engine.suggestions('ALL').slice(0, 3)
  const candidates = raw.map((player) => ({
    player,
    // Rounded once, here, rather than at each place a card or a row
    // prints it — overallScore()/replacementGap() are real-valued
    // (Jahmyr Gibbs's own 100 is a coincidence of being the best score
    // on the board, not evidence the function rounds).
    vorp: round1(engine.replacementGap(player)),
    tierLeft: engine.tierRemaining(player),
    juke: round1(engine.overallScore(player)),
    survival: engine.survivalProbability(player, nextOverall),
    nextOverall,
  }))

  // Index 0 is already "Juke's pick" (suggestions() is best-first). Of the
  // other two, "Safest wait" now goes to whichever is more LIKELY TO
  // SURVIVE to your next pick — the same real number the card's own "If
  // you wait" box prints — not whichever sits in the deeper tier. Tier
  // depth is a proxy for survival and the two can disagree; when they do,
  // a card labelled "safest wait" in teal and then, two inches below, a
  // red "gone before your next pick" is the exact self-contradiction this
  // screen opened with.
  let rankLabels = ['Juke’s pick', 'Scarcest', 'Safest wait']
  if (candidates.length === 3) {
    const s1 = candidates[1].survival ?? -1
    const s2 = candidates[2].survival ?? -1
    const safer = s2 > s1 ? 2 : 1
    const scarcer = safer === 1 ? 2 : 1
    rankLabels = []
    rankLabels[0] = 'Juke’s pick'
    rankLabels[scarcer] = 'Scarcest'
    rankLabels[safer] = 'Safest wait'
  }
  // Two ways a label can fail to earn itself. "Scarcest" means "grab him
  // before the tier runs out" — a claim that only makes sense if the tier
  // is worth being in; late rounds routinely hand suggestions() three
  // below-replacement players with nothing else to rank them by, and
  // stamping the deepest-negative one "Scarcest" reads as advice to rush a
  // player who isn't worth having (caught by a design review against a
  // real −100 VORP card). "Safest wait" fails the same way whenever the
  // survival number that just chose it is itself below the same 0.4 the
  // "If you wait" box already treats as a real risk — genuinely likely
  // gone is not safe to wait on, whichever of the two candidates it is.
  rankLabels = rankLabels.map((label, i) => {
    const c = candidates[i]
    if (!c) return label
    if (label === 'Scarcest' && c.vorp != null && c.vorp < BAD_VORP) return 'Also available'
    if (label === 'Safest wait') {
      const genuinelyAtRisk = c.survival != null && c.survival < AT_RISK
      const badPick = c.vorp != null && c.vorp < BAD_VORP
      if (genuinelyAtRisk || badPick) return 'Also available'
    }
    return label
  })

  // The board, not suggestions('ALL') sliced past 3 — that was the first
  // fix tried, and it barely moved anything: suggestions() is itself a
  // curated shortlist (six players, measured, this many rounds in), so
  // slicing past the top three ever returned three or four more of the
  // same shortlist, never "the rest of the board" the way the request for
  // this asked for ("similar to view located on BOARD tab"). This is that
  // same board, filtered to what's actually still available and minus the
  // three already shown above, in board/ADP order — genuinely everyone
  // else, not another few names off the same short list.
  const board = engine.board()
  const topThreeNames = new Set(candidates.map((c) => c.player.name))
  const others = board
    .filter((p) => !p.drafted && !topThreeNames.has(p.name))
    .sort((a, b) => a.overall - b.overall)
    .map((player) => ({
      player,
      vorp: round1(engine.replacementGap(player)),
      juke: round1(engine.overallScore(player)),
    }))
  // Why the model did not put each of these in the top three — a real
  // comparison, not a bare number a reader has to interpret alone. Prefers
  // the top-three card sharing this player's position (the natural point
  // of comparison); failing that, an earlier row in this same list at the
  // same position; failing that, the player's own roster count, for the
  // "highest value here, but you're already stocked" case.
  others.forEach((o, i) => {
    const fit = engine.draftFit(o.player)
    const topSibling = candidates.find((c) => c.player.pos === o.player.pos)
    if (topSibling) {
      const gap = Math.round((topSibling.juke ?? 0) - (o.juke ?? 0))
      o.whyNot = gap > 0
        ? `Fills the slot you need, ${gap} points of Juke score below ${topSibling.player.name}.`
        : `Fills the slot you need and rates within a few points of ${topSibling.player.name}.`
      return
    }
    const earlierSibling = others.slice(0, i).find((e) => e.player.pos === o.player.pos)
    if (earlierSibling) {
      // Positive: this row trails the earlier one, the usual case since
      // suggestions() is already best-first. Negative is real too, just
      // rarer — the earlier row can rate higher on need or risk while
      // scoring less on raw VORP, and the sentence has to say which one
      // actually happened rather than always claiming "behind."
      const gap = Math.round((earlierSibling.vorp ?? 0) - (o.vorp ?? 0))
      o.whyNot = gap >= 0
        ? `Same slot as ${earlierSibling.player.name} and ${gap} points behind on VORP.`
        : `Same slot as ${earlierSibling.player.name} — ${Math.abs(gap)} points ahead on VORP, but rated lower here.`
      return
    }
    const have = fit ? fit.have : 0
    o.whyNot = have > 0
      ? `Highest value here, but you already hold ${have} ${o.player.pos}${have === 1 ? '' : 's'}.`
      : null
  })

  // Room-live rail. Last 10 for the strip, last 6 for the sentence — same
  // slice the strip's own tail already is, not a second read of picks()
  // that could disagree with what's drawn.
  const last10 = picks.slice(-10)
  const last6 = picks.slice(-6)
  const posCounts = {}
  last6.forEach((p) => { posCounts[p.player.pos] = (posCounts[p.player.pos] || 0) + 1 })
  let runPos = null, runCount = 0
  Object.entries(posCounts).forEach(([pos, n]) => { if (n > runCount) { runCount = n; runPos = pos } })
  const runDepth = runPos ? engine.positionDepthRemaining(runPos) : null

  // The count both mobile-only labels print — "N available" over the cards
  // and "Browse all N players" under them. One read of the same board array
  // the queue below already resolves against, never a second call that
  // could answer differently between two lines of the same screen. `board`
  // itself is declared up with `others` now, which needs it first.
  const availableCount = board.filter((p) => !p.drafted).length
  const queue = engine
    .queue()
    .map((name) => board.find((p) => p.name === name))
    .filter(Boolean)

  const survivalOfName = (p) => engine.survivalProbability(p, nextOverall)

  /* Tier ladder — real tiers straight off the board (buildTiers() in
     app.js already stamped every player), not a new scarcity metric. One
     row per skill position: how many of tier 1 are left, and how big the
     drop to tier 2 actually is once it runs out, so "cliff" means a real
     points gap rather than a feeling.

     "How many remain" goes through engine.tierRemaining() rather than a
     second `!p.drafted` filter here — it's the exact function app.js's own
     board chip prints ("2 left in tier 1") and the candidate cards above
     already call it per-player (see `tierLeft` a few lines up). tier1[0]
     stands in for "a tier-1 player at this position" because every element
     of tier1 shares the same pos/tier by construction, which is all
     tierRemaining() reads — it re-counts off the real board itself, so it
     can't drift from this array's own contents. */
  const tierLadder = ['QB', 'RB', 'WR', 'TE'].map((pos) => {
    const posBoard = board.filter((p) => p.pos === pos)
    const tier1 = posBoard.filter((p) => p.tier === 1)
    const remaining = tier1.length ? engine.tierRemaining(tier1[0]) : 0
    const tier2 = posBoard.filter((p) => p.tier === 2)
    let drop = null
    if (tier1.length && tier2.length) {
      const avg = (list) => list.reduce((s, p) => s + (p.projPts || 0), 0) / list.length
      drop = Math.round(avg(tier1) - avg(tier2))
    }
    return { pos, tier1, remaining, drop }
  })

  /* Projected board at the next pick — the same survival model the cards'
     own "If you wait" boxes use, applied to the players actually worth
     asking about. The board's very top is never in question this many
     picks out (of course the consensus top five are gone by pick 20 —
     that's not a preview, it's arithmetic), so this centres on the
     players whose board rank sits nearest your *next* pick, where real
     uncertainty actually lives, then restores board order for display. */
  const projectedSurvivors = nextOverall == null
    ? []
    : board
        .filter((p) => !p.drafted)
        .slice()
        .sort((a, b) => Math.abs(a.overall - nextOverall) - Math.abs(b.overall - nextOverall))
        .slice(0, 5)
        .sort((a, b) => a.overall - b.overall)
        .map((p) => ({ player: p, survival: engine.survivalProbability(p, nextOverall) }))
  // ink-muted, not white/40: translucent white on slate.panel composites to
  // 3.56:1 and a sweep reading `color` never sees it -- the same lie the
  // legacy board's `opacity: .85` told for years. ink-muted is 4.87 there.
  const survivalTextColor = (s) => (s == null ? 'text-ink-muted' : s < 0.2 ? 'text-rose-300' : s < 0.65 ? 'text-amber-300' : 'text-emerald-300')

  return (
    /* flex-col below lg, grid at lg+ — not grid-cols-1 at every width down
       to a lg:grid-cols override. A single-column grid still lays its
       children out as auto-placed rows, and an auto-sized grid row inside a
       container with a definite height (this one: min-h-0 flex-1, a fixed
       share of the viewport) stretches to fill leftover space by default —
       align-content: stretch, dividing the height evenly across all three
       rows whether or not their content actually fills it. That is
       invisible on the desktop 3-COLUMN grid, where three equal-height
       columns is the point, and only appears once grid-cols-1 turns those
       columns into rows: three panels each hard-capped to roughly a third
       of the screen with their own internal scrollbar, rather than one page
       that scrolls through Your team, then the cards, then The room live in
       reading order. flex-col's main axis does not stretch children to fill
       leftover space by default, which is the actual fix — every child
       below also drops its own overflow-y-auto down to lg:, since a
       naturally-sized flex child needs no scroll container of its own; the
       one on this wrapper is what scrolls the whole stack on a phone. */
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(58px+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[300px_minmax(0,1fr)_330px] lg:overflow-hidden lg:pb-0">
      {/* Mobile: Juke/Everyone/Team behind a segmented control, replacing
          both the old "Still to fill" strip this comment used to describe
          and the always-visible stacked layout the Centre column showed
          below lg before this pass — that column is desktop-only now (see
          its own comment). Same computed data throughout (candidates,
          others, tierLadder, needRows, lineup, projectedSurvivors — every
          one already built above, once, for the desktop layout); this is a
          second reading of it, never a second calculation. */}
      <div className="flex shrink-0 gap-1.5 border-b border-white/[0.06] bg-slate-panel/40 px-2.5 py-2 lg:hidden">
        {[
          { key: 'juke', label: 'Juke' },
          { key: 'everyone', label: 'Everyone' },
          { key: 'team', label: 'Team' },
        ].map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setMobilePane(p.key)}
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

      {mobilePane === 'juke' && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:hidden">
          <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-white">What Juke would do</h2>
          <p className="mb-4 mt-1 text-[14px] text-white/60">
            {myTurn ? 'Three options, ranked.' : `Who's still here at ${nextOverall ?? '—'}.`}
            {candidates.length > 0 && ` Card ${Math.min(cardIndex, candidates.length - 1) + 1} of ${candidates.length}.`}
          </p>
          <TierStripMobile tierLadder={tierLadder} />
          {candidates.length > 0 && (() => {
            const i = Math.min(cardIndex, candidates.length - 1)
            const c = candidates[i]
            return (
              <CardPager count={candidates.length} index={i} onIndex={setCardIndex}>
                {myTurn ? (
                  <Card
                    candidate={c}
                    rankLabel={rankLabels[i]}
                    primary={i === 0}
                    onDraft={onDraft}
                    myTurn={canDraftNow}
                    engine={engine}
                    board={board}
                    counts={counts}
                    siblings={candidates}
                    onOpenProfile={onOpenProfile}
                  />
                ) : (
                  <SurvivorCard
                    candidate={c}
                    engine={engine}
                    onQueueToggle={onQueueToggle}
                    onDraft={onDraft}
                    myTurn={canDraftNow}
                    queued={queuedNames.has(c.player.name)}
                    onOpenProfile={onOpenProfile}
                  />
                )}
              </CardPager>
            )
          })()}
          {!myTurn && (
            <div className="mt-4 rounded-lg bg-white/[0.035] p-3.5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-white/55">Your queue · while you wait</span>
              </div>
              <p className="mb-2.5 text-xs text-white/55">Autopick will take #1 if you're away</p>
              <QueueList players={queue} myTurn={canDraftNow} engine={engine} survivalOf={survivalOfName} />
            </div>
          )}
        </div>
      )}

      {mobilePane === 'everyone' && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:hidden">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Everyone else</span>
            <span className="font-numeral text-[10px] text-ink-muted">VORP &middot; JUKE</span>
          </div>
          {others.length === 0 ? (
            <p className="py-6 text-center text-meta text-ink-muted">Nobody left off the top three right now.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {others.map((o) => (
                <div
                  key={o.player.name}
                  onClick={() => onOpenProfile(o.player)}
                  className="grid min-h-[44px] cursor-pointer grid-cols-[26px_minmax(0,1fr)_44px_38px_56px] items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.05]"
                >
                  <span className="text-[10px] font-bold text-white/55">{o.player.pos}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{o.player.name}</p>
                    {o.whyNot && <p className="truncate text-[10px] leading-tight text-ink-muted">{o.whyNot}</p>}
                  </div>
                  <span className="text-right text-xs tabular-nums text-white/85">
                    {o.vorp != null ? `${o.vorp >= 0 ? '+' : ''}${Math.round(o.vorp)}` : '—'}
                  </span>
                  <span className="text-right text-xs font-semibold tabular-nums text-teal-300">{o.juke ?? '—'}</span>
                  {/* This row had no disabled state at all — reachable
                      whenever the "Everyone" pane is open, independent of
                      whose turn it is (a completely ordinary thing to check
                      while waiting), unlike every other Draft control in
                      the app. */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (canDraftNow) onDraft(o.player) }}
                    disabled={!canDraftNow}
                    title={canDraftNow ? 'Draft' : 'Not your turn'}
                    className={
                      'h-11 rounded-full border text-[11px] font-bold ' +
                      (canDraftNow
                        ? 'border-teal-400/40 text-teal-300'
                        : 'cursor-not-allowed border-white/10 text-white/25')
                    }
                  >
                    Draft
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* The other half of dropping a longer everyone-else list: three
              recommendations plus a door to all N, rather than an arbitrary
              few more names. Same button this pane inherited from the old
              always-visible mobile layout — see Centre's own comment on why
              it moved here rather than staying put. */}
          {onOpenHub && (
            <button
              type="button"
              onClick={() => onOpenHub()}
              className="mt-4 flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.12] text-[15px] font-semibold text-white/65"
            >
              Browse all {availableCount} players
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {mobilePane === 'team' && (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:hidden">
          <div className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Your team</div>
          <div className="mb-5 flex flex-col gap-1">
            {lineup.seats.map((s, i) => (
              <div key={i} className="grid h-9 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2.5">
                <span className={'rounded py-0.5 text-center text-[10px] font-bold ' + (s.player ? POS_BADGE[s.player.pos] || 'bg-white/10 text-white/60' : 'bg-white/5 text-ink-muted')}>
                  {s.slot}
                </span>
                <span className={'truncate text-xs font-medium ' + (s.player ? 'text-white' : 'text-ink-muted')}>
                  {s.player ? s.player.name : '—'}
                </span>
                {s.player && (
                  <span className="text-[10px] tabular-nums text-emerald-300">
                    {(() => { const g = engine.replacementGap(s.player); return g != null ? `${g >= 0 ? '+' : ''}${Math.round(g)}` : '' })()}
                  </span>
                )}
              </div>
            ))}
            {Array.from({ length: league.bench }, (_, i) => {
              const p = lineup.bench[i] || null
              return (
                <div key={'bn-' + i} className="grid h-9 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2.5">
                  <span className={'rounded py-0.5 text-center text-[10px] font-bold ' + (p ? POS_BADGE[p.pos] || 'bg-white/10 text-white/60' : 'bg-white/5 text-ink-muted')}>
                    BN
                  </span>
                  <span className={'truncate text-xs font-medium ' + (p ? 'text-white' : 'text-ink-muted')}>
                    {p ? p.name : '—'}
                  </span>
                  {p && (
                    <span className="text-[10px] tabular-nums text-emerald-300">
                      {(() => { const g = engine.replacementGap(p); return g != null ? `${g >= 0 ? '+' : ''}${Math.round(g)}` : '' })()}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mb-5 border-t border-white/[0.07] pt-[18px]">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Still to fill</div>
            <div className="flex flex-col gap-2.5">
              {needRows.map((r) => (
                <div key={r.pos} className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2.5">
                  <span className="text-xs font-bold text-white/70">{r.pos}</span>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${r.need ? Math.min(100, (r.have / r.need) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-right text-[10px] tabular-nums text-white/60">{r.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gold is the seat's MARK and never its type. CLAUDE.md says so
              about the board ring -- #FFD166 measured 1.04:1 as text on
              these chips, which had been drawing the pick codes in it. The
              wash keeps the gold, a 12px gold rule beside the eyebrow keeps
              "yours" legible as a mark, and the codes take full ink. */}
          {nextPicks.length > 0 && (
            <div className="seat-wash mb-3 rounded-lg p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                <span className="h-px w-3 shrink-0 bg-[#FFD166]" aria-hidden="true" />
                Your next picks
              </div>
              <div className="flex flex-wrap gap-[7px]">
                {nextPicks.map((overall) => {
                  const code = window.DraftEngine ? window.DraftEngine.pickCode(overall, league) : overall
                  return (
                    <span key={overall} className="rounded bg-white/10 px-2.5 py-1 font-plex text-xs font-semibold text-ink">
                      {code}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {projectedSurvivors.length > 0 && (
            <div className="rounded-lg border border-teal-400/20 bg-teal-400/[0.03] p-3.5">
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-300">
                Likely there at {window.DraftEngine ? window.DraftEngine.pickCode(nextOverall, league) : nextOverall}
              </div>
              <div className="flex flex-col gap-2">
                {projectedSurvivors.map(({ player, survival }) => (
                  <div key={player.name} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-white/80">{player.name}</span>
                    <span className={'font-numeral tabular-nums text-[11px] font-semibold ' + survivalTextColor(survival)}>
                      {survival != null ? `${Math.round(survival * 100)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 font-numeral text-[9px] leading-relaxed text-ink-muted">
                The same survival model the cards use, run forward to your next pick.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roster rail — desktop only, see Centre's own comment above. */}
      <div className="hidden border-white/[0.06] px-[18px] py-5 lg:block lg:overflow-y-auto lg:border-r">
        <div className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Your team</div>
        <div className="mb-5 flex flex-col gap-1">
          {lineup.seats.map((s, i) => (
            <div key={i} className="grid h-8 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2.5">
              <span className={'rounded py-0.5 text-center text-[10px] font-bold ' + (s.player ? POS_BADGE[s.player.pos] || 'bg-white/10 text-white/60' : 'bg-white/5 text-ink-muted')}>
                {s.slot}
              </span>
              <span className={'truncate text-xs font-medium ' + (s.player ? 'text-white' : 'text-ink-muted')}>
                {s.player ? s.player.name : '—'}
              </span>
              {s.player && (
                <span className="text-[10px] tabular-nums text-emerald-300">
                  {(() => { const g = engine.replacementGap(s.player); return g != null ? `${g >= 0 ? '+' : ''}${Math.round(g)}` : '' })()}
                </span>
              )}
            </div>
          ))}
          {/* The starting lineup isn't the whole roster — league.bench more
              seats exist and this rail stopped at the starters, same gap
              DraftEntryScreen.jsx's pre-draft rail had. lineup.bench holds
              whoever's actually there; league.bench is the real ceiling, so
              an empty slot still prints rather than the row disappearing
              the moment a bench spot goes unfilled. */}
          {Array.from({ length: league.bench }, (_, i) => {
            const p = lineup.bench[i] || null
            return (
              <div key={'bn-' + i} className="grid h-8 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2.5">
                <span className={'rounded py-0.5 text-center text-[10px] font-bold ' + (p ? POS_BADGE[p.pos] || 'bg-white/10 text-white/60' : 'bg-white/5 text-ink-muted')}>
                  BN
                </span>
                <span className={'truncate text-xs font-medium ' + (p ? 'text-white' : 'text-ink-muted')}>
                  {p ? p.name : '—'}
                </span>
                {p && (
                  <span className="text-[10px] tabular-nums text-emerald-300">
                    {(() => { const g = engine.replacementGap(p); return g != null ? `${g >= 0 ? '+' : ''}${Math.round(g)}` : '' })()}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="mb-5 border-t border-white/[0.07] pt-[18px]">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Still to fill</div>
          <div className="flex flex-col gap-2.5">
            {needRows.map((r) => (
              <div key={r.pos} className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2.5">
                <span className="text-xs font-bold text-white/70">{r.pos}</span>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-teal-400"
                    style={{ width: `${r.need ? Math.min(100, (r.have / r.need) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-right text-[10px] tabular-nums text-white/60">{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        {nextPicks.length > 0 && (
          <div className="seat-wash rounded-lg p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                <span className="h-px w-3 shrink-0 bg-[#FFD166]" aria-hidden="true" />
                Your next picks
              </div>
            <div className="flex flex-wrap gap-[7px]">
              {nextPicks.map((overall) => {
                const code = window.DraftEngine ? window.DraftEngine.pickCode(overall, league) : overall
                return (
                  <span key={overall} className="rounded bg-white/10 px-2.5 py-1 font-plex text-xs font-semibold text-ink">
                    {code}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* The same survival model the cards use, run down the board's own
            best-available order to the pick that actually returns to you —
            not a guess dressed as a preview. */}
        {projectedSurvivors.length > 0 && (
          <div className="mt-3 rounded-lg border border-teal-400/20 bg-teal-400/[0.03] p-3.5">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-300">
              Likely there at {window.DraftEngine ? window.DraftEngine.pickCode(nextOverall, league) : nextOverall}
            </div>
            <div className="flex flex-col gap-2">
              {projectedSurvivors.map(({ player, survival }) => (
                <div key={player.name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80">{player.name}</span>
                  <span className={'font-numeral tabular-nums text-[11px] font-semibold ' + survivalTextColor(survival)}>
                    {survival != null ? `${Math.round(survival * 100)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 font-numeral text-[9px] leading-relaxed text-ink-muted">
              The same survival model the cards use, run forward to your next pick.
            </div>
          </div>
        )}
      </div>

      {/* Centre — desktop only from here down. Mobile's own version of
          everything inside it (the tier ladder, the three cards, Everyone
          else) is the segmented Juke/Everyone/Team control above, built
          fresh around the same Card/SurvivorCard leaves and the same
          computed data rather than squeezing this column's own layout —
          three cards side by side and a table with five grid columns have
          no honest single-column reading, which is the whole reason this
          prompt exists. None of the JSX below changed to make room for
          that; it just stopped being reachable below lg. */}
      <div className="hidden px-[22px] py-5 lg:block lg:min-w-0 lg:overflow-y-auto">
        {myTurn ? (
          <>
            {/* One heading again, and it is the live one. An earlier pass
                gave the phone its own "Three ways to go" plus a count, from
                the first handoff's mock; the revision asks for this heading
                at 19px/800 on a phone with its real subline, and it is
                right — the subline is the sentence that says the numbers on
                these cards are the same ones the grade uses, which is the
                whole claim, and a bare count said nothing a reader needed.
                Size and the icon are what differ by width, not the words. */}
            <div className="mb-1 flex items-center gap-2.5">
              <Sparkles className="hidden h-4 w-4 text-teal-300 lg:block" />
              <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-white lg:font-display lg:text-[32px] lg:font-bold lg:leading-none lg:tracking-normal">
                What Juke would do
              </h2>
            </div>
            <p className="mb-4 text-[14px] text-white/60 lg:text-sm">Three options, ranked. Every number is the same one the grade uses.</p>

            {/* Tier ladder — you already compute tiers; this just shows the
                structure the three cards below are reacting to. Faded pips
                are gone; a lit one is still on the board. */}
            <div className="mb-[18px] rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Tier 1 remaining, by position</span>
                <span className="hidden text-[10.5px] text-ink-muted sm:inline">Faded = already drafted</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {tierLadder.map((row) => {
                  const caption = tierCaption(row)
                  return (
                    <div key={row.pos} className="rounded-lg bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className={'rounded px-1.5 py-0.5 text-[9px] font-bold ' + (POS_BADGE[row.pos] || 'bg-white/10 text-white/60')}>
                            {row.pos}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">tier 1</span>
                        </span>
                        <span className="font-numeral tabular-nums text-[10.5px] text-ink-muted">{row.remaining} left</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-[3px]">
                        {/* POS_CHALK, not POS_SOLID. These nine-pixel
                            squares carry no text, and the whole row is a
                            count of how many of a tier are left — which
                            only works if a taken square and a live one are
                            told apart at a glance. At -700 against this
                            panel the live squares measured 1.46-2.93:1
                            and the drafted grey sat *brighter* than some
                            of them, so the two states could invert. The
                            chalk fills clear 8.74 at worst and are the
                            same six the board draws. */}
                        {row.tier1.map((p) => (
                          <span
                            key={p.name}
                            className="h-[9px] w-[9px] rounded-sm"
                            style={{ background: p.drafted ? 'rgba(255,255,255,0.13)' : POS_CHALK[row.pos] || 'rgba(255,255,255,0.55)' }}
                          />
                        ))}
                      </div>
                      <div
                        className="mt-2 font-numeral text-[10px] text-ink-muted"
                        title={row.drop != null ? `Next tier projects about ${row.drop} fewer points` : undefined}
                      >
                        {caption}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* repeat(auto-fit, minmax(300px, 1fr)), not md:grid-cols-3 — three
                equal columns resolved to about 105px per card at 1100px (a
                perfectly ordinary laptop width) and clipped every headline
                mid-word. auto-fit asks the real question instead: how many
                300px-plus cards actually fit, so this shows 1 at 1100px minus
                the two rails, 2 once there's room, 3 only once there's really
                room for three — never a forced count narrower than its own
                floor. grid-cols-1 stays as the true mobile default below md;
                nothing about this screen's phone layout is this prompt's job
                (prompt 06 replaces it with a pager, not a grid). */}
            <div className="mb-[18px] grid grid-cols-1 gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
              {candidates.map((c, i) => (
                <Card
                  key={c.player.name}
                  candidate={c}
                  rankLabel={rankLabels[i]}
                  primary={i === 0}
                  onDraft={onDraft}
                  myTurn={canDraftNow}
                  engine={engine}
                  board={board}
                  counts={counts}
                  siblings={candidates}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </div>

            {/* Back on the phone. An earlier pass hid this below lg and left
                "Browse all N players" as the only way past the three cards;
                the revision keeps both, and the two do different jobs — this
                is the next four names at a glance, that is the whole board
                when you want to search it.

                Two changes make it work at 358px rather than just fit. The
                column pair is labelled `VORP · JUKE` in the header, because
                desktop leaves it unlabelled and an unlabelled number pair on
                a phone is unreadable. And the per-row Draft control takes
                the 44px tap floor rather than a 34px chip: it is a real
                action against a running clock, so it is not exempt. */}
            {others.length > 0 && (
              <div>
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Everyone else</span>
                  <span className="font-numeral text-[10px] text-ink-muted lg:hidden">VORP &middot; JUKE</span>
                </div>
                {/* Column heads — a design review caught "+64 · 38 · Draft"
                    with nothing saying which number was which. */}
                {/* The name column was minmax(0,1fr) — every pixel this
                    centre column wasn't using went there, so "Brock Bowers"
                    sat in a ~290px box on a wide desktop with VORP and Juke
                    pushed out to the far edge of it, reported as dead space
                    between the name and the numbers. 280px is plenty for a
                    name plus its two-line whyNot sentence and stops the
                    column claiming the rest of the row's width for nothing. */}
                <div className="hidden h-5 grid-cols-[30px_minmax(0,280px)_60px_64px_70px] items-center gap-3.5 px-3 text-[9px] font-semibold uppercase tracking-wide text-ink-muted lg:grid">
                  <span />
                  <span />
                  <span className="text-right">VORP</span>
                  <span className="text-right">Juke</span>
                  <span />
                </div>
                <div className="flex flex-col gap-1">
                  {others.map((o) => (
                    <div
                      key={o.player.name}
                      onClick={() => onOpenProfile(o.player)}
                      className="grid min-h-[44px] cursor-pointer grid-cols-[30px_minmax(0,280px)_60px_64px_70px] items-center gap-3.5 rounded-md px-3 py-1.5 transition-colors hover:bg-white/[0.05] lg:min-h-[40px]"
                    >
                      <span className="text-[10px] font-bold text-white/55">{o.player.pos}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{o.player.name}</p>
                        {/* The why-not — the board leader on VORP and Juke
                            score used to sit here unexplained, which read
                            as the model missing its own top player rather
                            than weighing need on purpose. */}
                        {o.whyNot && <p className="truncate text-[10.5px] leading-tight text-ink-muted">{o.whyNot}</p>}
                      </div>
                      <span className="text-right text-xs tabular-nums text-white/85">
                        {o.vorp != null ? `${o.vorp >= 0 ? '+' : ''}${Math.round(o.vorp)}` : '—'}
                      </span>
                      <span className="text-right text-xs font-semibold tabular-nums text-teal-300">{o.juke ?? '—'}</span>
                      {/* Same missing disabled state as the mobile "Everyone
                          else" row — see its own comment. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (canDraftNow) onDraft(o.player) }}
                        disabled={!canDraftNow}
                        title={canDraftNow ? 'Draft' : 'Not your turn'}
                        className={
                          'h-11 rounded-full border text-xs font-bold lg:h-auto lg:border-0 lg:py-1.5 ' +
                          (canDraftNow
                            ? 'border-teal-400/40 text-teal-300 lg:bg-teal-400/[0.14]'
                            : 'cursor-not-allowed border-white/10 text-white/25 lg:bg-white/[0.04]')
                        }
                      >
                        Draft
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-1 font-display text-[32px] font-bold leading-none text-white">
              Who's still here at {nextOverall ?? '—'}
            </h2>
            <p className="mb-4 text-sm text-white/60">Same three cards, different question. Survival odds run off the board's own ADP distribution.</p>

            {/* auto-fit against the CONTAINER, not `md:grid-cols-3` against the
                viewport. The Decide column is ~350px wide at 1024 whatever the
                window is doing, so three across left each card 105px - 73 after
                its own p-4 - against a 23px display name wanting 94 and a
                "52% still there" line wanting 95. Measured: three cards
                overflowing a box that can neither scroll nor ellipsise.

                Same defect as <BarRow>'s, and the same reading: a `md:` variant
                is a question about the window and the answer depends on the
                box. 150px is the floor a card needs to hold its own name (126
                measured, plus margin), so this is two across in the room's
                column and still three wherever there is room for three. */}
            <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
              {candidates.map((c) => (
                <SurvivorCard
                  key={c.player.name}
                  candidate={c}
                  engine={engine}
                  onQueueToggle={onQueueToggle}
                  onDraft={onDraft}
                  myTurn={canDraftNow}
                  queued={queuedNames.has(c.player.name)}
                  onOpenProfile={onOpenProfile}
                />
              ))}
            </div>

            <div className="rounded-lg bg-white/[0.035] p-3.5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-white/55">Your queue · while you wait</span>
                <div className="flex-1" />
                <span className="text-xs text-white/55">Autopick will take #1 if you're away</span>
              </div>
              <QueueList players={queue} myTurn={canDraftNow} engine={engine} survivalOf={survivalOfName} />
            </div>
          </>
        )}
      </div>

      {/* Room-live rail — desktop only. On a phone the same information has
          a better home already: the Board tab's own "Log ›" button
          (DraftBoardGrid.jsx) opens PlayerHub's Log tab, which is the full
          pick history rather than the last nine, and the board itself shows
          the position runs this rail summarises. Artboard 1c draws neither
          on the phone for that reason. */}
      <div className="hidden border-white/[0.06] px-[18px] py-5 lg:block lg:overflow-y-auto lg:border-l">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">The room, live</div>

        {runPos && runCount >= 3 && (
          <div className="mb-4 rounded-lg bg-white/[0.04] p-3.5">
            <div className="mb-2.5 text-sm font-semibold text-white">{runPos} run</div>
            <div className="mb-2.5 flex gap-1">
              {/* POS_CHALK, same reason as the tier squares above: a
                  bare colour block with the sentence underneath doing all
                  the naming. This strip exists to make a position *run*
                  visible as a block of one colour, which is the reading
                  the darkest steps cost most. */}
              {last10.map((p, i) => (
                <span key={i} className="h-5 flex-1 rounded-sm" style={{ background: POS_CHALK[p.player.pos] || 'rgba(255,255,255,0.25)' }} />
              ))}
            </div>
            <div className="text-xs leading-[1.5] text-white/60">
              {runCount} of the last {last6.length} were {runPos}s.
              {runDepth != null ? ` ${runDepth} left above replacement.` : ''}
            </div>
          </div>
        )}

        {/* ink-soft on the rows below, not ink-muted: this rail sits a
            surface lighter than the panel and ink-muted measured 4.48 on
            it, which is a miss by the width of a rounding error. */}
        <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Last picks</div>
        <div className="flex flex-col gap-[3px]">
          {picks.slice(-9).reverse().map((p) => {
            const code = window.DraftEngine ? window.DraftEngine.pickCode(p.overall, league) : p.overall
            const mine = p.slot === mySlot
            return (
              <div
                key={p.overall}
                className={'grid h-[30px] grid-cols-[36px_minmax(0,1fr)] items-center gap-2.5 rounded-[5px] border-l-2 px-2 ' + (mine ? 'seat-wash border-[#FFD166]' : 'border-transparent')}
              >
                <span className="font-plex text-[10px] text-ink-soft">{code}</span>
                <span className="flex min-w-0 items-baseline gap-[7px]">
                  <span className="shrink-0 whitespace-nowrap text-xs font-medium text-white">{p.player.name}</span>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] text-ink-soft">{p.player.team}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
