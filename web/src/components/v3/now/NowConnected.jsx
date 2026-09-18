import { retrySnapshot } from '../../../hooks/useLeague.js'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'
import { useLeagueModel } from '../../v2/league/useLeagueModel.js'
import { oddsFor } from '../../../lib/seasonSim.js'
import { platformFor } from '../../shell/leaguePlatforms.js'
import { stakeLabel } from '../../shell/roomStakes.js'
import { countdownParts } from '../../../lib/countdown.js'
import { msUntilDeadline } from '../../../lib/tradeDeadline.js'
import { seasonPhase } from '../../../lib/seasonPhase.js'
import { seasonSummary } from '../../../lib/schedule.js'
import {
  CallButton, Delta, Fig, GoLink, Headline, Icon, Label, PosTag, QuietButton, Sheet, Skeleton,
  ValueBar, cx, ordinal,
} from '../ui.jsx'
import { recordText, standing, teamHref, useWeekSheet } from '../league/leagueData.js'
import { gameFor, matchupHref, sleeperWeekView } from '../league/matchupData.js'
import { useSleeperWeeks } from '../league/useSleeperWeeks.js'
import { CountText, CountUp } from '../motion.jsx'
import {
  CouldNotRead, InjuryChip, ResultChip, WinBar, pct, useCountdown, useDraftPhase, useKickoff, whenText,
} from '../league/parts.jsx'
import { LockerCard, useLockerSummary } from './parts.jsx'
import { useNextKickoffAt } from './season.js'

/* Now, connected: this week's call sheet.

   ---- One situation band, then the calls ----

   The band says what week it is, in which league, and how long until
   anything happens (the next kickoff, or the draft when there has not been
   one). Under it the matchup, because the one question every manager opens
   an app with on a Tuesday is "am I going to win", and then the week's
   calls — one banded sheet per lane.

   ---- Ranked within their units, never across them ----

   A lineup swap is points THIS WEEK; a waiver claim is SEASON points over
   replacement (roomStakes.js says so at length). Ordering the lanes by the
   size of their number would put +306 on the wire above +8.4 this week
   because 306 is bigger — a comparison between two units that do not
   convert. So the lanes sit in a fixed order, each states its unit in
   words, and only the rows INSIDE a lane are ranked. A stake under
   roomStakes' floor is not shown; the lane says there is nothing to do.

   ---- Every figure is production's ----

   The same modules the Strategy, Waiver and Trade rooms and My League read,
   through leagueData.js — see its header for the list. The calls link to
   the tools at #/calls/*; this page states the call and its arithmetic,
   the tool is where it is worked. */

const PHASE = { soon: 'Draft in', drafting: 'Drafting now', late: 'Draft time passed' }

function SituationBand({ league, snapshot, sheet, rank, total, showKickoff = true }) {
  const kickoff = useKickoff()
  const draft = useDraftPhase(snapshot.draftAt, snapshot.draftStatus)
  const platform = platformFor(league.provider).name
  const preDraft = draft.phase === 'soon' || draft.phase === 'drafting' || draft.phase === 'late'
  const me = sheet && sheet.mine
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-[6px] bg-v3-band px-4 py-2.5 font-figure text-[13px] text-v3-bandInk">
      <span className="min-w-0 truncate font-bold uppercase tracking-[0.14em] text-white">{snapshot.name || league.name}</span>
      <span>{platform} · read-only</span>
      {snapshot.week ? <span>Week <Fig className="font-bold text-white">{snapshot.week}</Fig></span> : null}
      {me ? (
        <span>
          <span className="text-white">{me.teamName}</span>{rank ? <> <Fig className="font-bold text-white">{recordText(me)}</Fig></> : null}
          {rank ? <> · {ordinal(rank)} of {total}</> : null}
        </span>
      ) : null}
      {preDraft ? (
        <span className="font-bold text-white">
          {PHASE[draft.phase]}{draft.parts ? <> <Fig>{draft.parts.full}</Fig></> : null}
        </span>
      ) : kickoff && showKickoff ? (
        <span>Next kickoff <Fig className="font-bold text-white">{kickoff.full}</Fig></span>
      ) : null}
    </div>
  )
}

/* The matchup: both projected totals on one scale, and the probability with
   EVEN drawn. The framing sentence is the one production's own Strategy
   Room refuses to show this number without. */
function Matchup({ sheet, week, platform, hasRules, hasSchedule, sleeperGame }) {
  const { game, opponent, total, oppTotal, winProb, read, mineWeek, oppWeek, source } = sheet
  if (!game && hasSchedule) {
    return (
      <Sheet code={week ? `Week ${week}` : 'The matchup'} aside="No game">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">
          Your league&apos;s schedule has no game for you{week ? ` in week ${week}` : ''} — you are out of the playoffs, or the week is past the last one scheduled. Your lineup is still priced below.
        </p>
        <div className="mt-4"><GoLink href={matchupHref(week)}>Every game this week</GoLink></div>
      </Sheet>
    )
  }
  if (!game && sleeperGame && !sleeperGame.bye && sleeperGame.theirs.team) {
    /* Sleeper's pairing for this week, off /sleeper/matchups (the same
       shared request the matchup page makes). The opponent is named and
       linked; both lineups priced side by side are on the matchup page,
       which is the one place that prices them. */
    const opp = sleeperGame.theirs.team
    return (
      <Sheet code={`The matchup · week ${week}`} aside={platform}>
        <p className="text-[18px] leading-[1.45] text-v3-ink">
          This week you play <a href={teamHref(opp)} className="font-bold underline decoration-v3-rule decoration-2 underline-offset-4 hover:decoration-v3-ink">{opp.teamName}</a>
          <span className="font-figure text-[15px] text-v3-ink2"> · {recordText(opp)}</span>.
        </p>
        <p className="mt-2 text-[15px] leading-[1.5] text-v3-ink2">Your lineup as set projects {sheet.total !== null ? <Fig className="font-bold text-v3-ink">{sheet.total.toFixed(1)}</Fig> : '—'}. {platform} publishes the pairing a week at a time; the matchup page prices both lineups and the win probability.</p>
        <div className="mt-4"><GoLink href={matchupHref(week)}>Both lineups, side by side</GoLink></div>
      </Sheet>
    )
  }
  if (!game) {
    return (
      <Sheet code={week ? `Week ${week}` : 'The matchup'} aside="No schedule">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">
          {platform} does not publish this league&apos;s season schedule on the snapshot this card reads, so there is no opponent priced here.
          It publishes the pairings a week at a time, and the matchup page reads them.
        </p>
        <div className="mt-4"><GoLink href={matchupHref(week)}>{week ? `Open week ${week}'s matchup` : 'Open the matchup'}</GoLink></div>
      </Sheet>
    )
  }
  if (!opponent) {
    return (
      <Sheet code={`Week ${game.week}`} aside="Bye">
        <p className="text-[15px] leading-[1.55] text-v3-ink2">You have no opponent in week {game.week}. Nothing is at stake in the matchup; the calls below still are.</p>
        <div className="mt-4"><GoLink href={matchupHref(game.week)}>Every game this week</GoLink></div>
      </Sheet>
    )
  }
  const max = Math.max(total || 0, oppTotal || 0, 1)
  const word = read === 'favoured' ? 'Favoured' : read === 'behind' ? 'Behind' : read === 'close' ? 'Close' : null
  return (
    <Sheet code={`The matchup · week ${game.week}`} aside={game.home ? 'Home' : 'Away'}>
      <div className="grid gap-2.5">
        {[
          { name: 'You', value: total, tone: 'neutral' },
          { name: opponent.teamName, value: oppTotal, tone: 'neutral', href: teamHref(opponent) },
        ].map((r) => (
          <div key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_1fr_4rem]">
            {r.href ? (
              <a href={r.href} className="truncate text-[15px] font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">{r.name}</a>
            ) : (
              <span className="truncate text-[15px] font-semibold text-v3-ink">{r.name}</span>
            )}
            <ValueBar value={r.value} max={max} tone="neutral" className="order-3 col-span-2 sm:order-none sm:col-span-1" />
            <CountUp value={r.value} format={(v) => v.toFixed(1)} className="text-right font-figure text-[18px] font-bold tabular-nums text-v3-ink" />
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-v3-rule pt-4">
        {winProb === null ? (
          <p className="text-[15px] leading-[1.5] text-v3-ink2">
            {total === null || oppTotal === null
              ? 'No win probability: a starter on one side has no projection, and Juke only prices a matchup when both lineups can be.'
              : 'No win probability yet: the weekly spread it needs is measured once the board has loaded.'}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <Label>Win probability</Label>
              <span className={cx('font-figure text-[28px] font-bold tabular-nums', read === 'favoured' ? 'text-v3-gain' : read === 'behind' ? 'text-v3-cost' : 'text-v3-ink')}>
                <CountText text={pct(winProb)} /> {word ? <span className="text-[15px] font-semibold uppercase tracking-[0.08em]">{word}</span> : null}
              </span>
            </div>
            <WinBar p={winProb} read={read} className="mt-1" />
            <p className="mt-2.5 text-[13px] leading-[1.5] text-v3-ink2">
              {mineWeek.mean.toFixed(1)} against {oppWeek.mean.toFixed(1)} projected; each lineup swings about {Math.round(mineWeek.stdev)} points a week.
              A scoring-strength estimate from two projected lineups — not a simulated week.
            </p>
          </>
        )}
        <p className="mt-2 font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">
          {source === 'all' ? `${platform}'s projection for week ${week}` : source === 'some' ? `${platform}'s projection where it has one, Juke's for the rest` : hasRules ? "Juke's projection under your league's scoring" : "Juke's projection — your league's scoring could not be read, so default rules"}
        </p>
        <div className="mt-4"><GoLink href={matchupHref(game.week)}>Both lineups, and every game this week</GoLink></div>
      </div>
    </Sheet>
  )
}

function PlayerLink({ player, className = '' }) {
  if (!player) return <span className={className}>Empty slot</span>
  return (
    <a href={`#/players/${encodeURIComponent(String(player.id))}`} className={cx('truncate font-semibold text-v3-ink underline decoration-transparent underline-offset-4 hover:decoration-v3-ink', className)}>
      {player.name}
    </a>
  )
}

function Nothing({ children }) {
  return <p className="text-[15px] leading-[1.55] text-v3-ink2">{children}</p>
}

/* THE ONE THING THIS WEEK — the week as the headline.

   One call, chosen by the lane order the calls below already keep rather
   than by whichever number is bigger (the two units do not convert — see
   the header): the lineup swap first, because it is the decision that
   expires at kickoff; then the claim; then a starter who might not play;
   and when none of them clears roomStakes' floor, the block says nothing
   needs doing rather than inventing a call. The matchup is one link away,
   and the next kickoff is printed as the exact time as well as the ticking
   digits — lineups lock as each game kicks off, so that instant is the
   deadline on everything above it. This block carries the page's one
   cobalt action; the lanes below link to their tools quietly. */
function WeekCall({ sheet, week }) {
  const kickoffAt = useNextKickoffAt()
  const parts = useCountdown(kickoffAt)
  const { swaps, gaps, hurt, stakes, total, game, opponent } = sheet
  const starting = hurt.filter((r) => r.starting)
  let call = null
  if (stakes.strategy && swaps[0]) {
    const s = swaps[0]
    call = {
      kind: 'Lineup',
      href: '#/calls/lineup',
      button: 'Make the lineup call',
      pos: s.start.pos,
      title: <>Start <PlayerLink player={s.start} /> over <PlayerLink player={s.sit} /></>,
      figure: (
        <>
          <Delta value={s.gain} digits={1} className="text-[20px]" /> this week
          {total !== null ? <span className="ml-2 text-v3-ink2">{total.toFixed(1)} as set → <span className="font-bold text-v3-ink">{(total + s.gain).toFixed(1)}</span></span> : null}
          {s.replacing ? <span className="ml-2 text-v3-cost">that slot scores 0 as set</span> : null}
        </>
      ),
    }
  } else if (stakes.waiver && gaps[0]) {
    const g = gaps[0]
    call = {
      kind: 'Wire',
      href: '#/calls/wire',
      button: 'Make the claim',
      pos: g.pos,
      title: <>Claim <PlayerLink player={g.best.player} /></>,
      figure: <><Delta value={g.improvement} className="text-[20px]" /> season points over the {g.pos} he would replace</>,
    }
  } else if (starting.length) {
    const r = starting[0]
    call = {
      kind: 'Status',
      href: '#/calls/lineup',
      button: 'Check your lineup',
      pos: r.player.pos,
      title: <><PlayerLink player={r.player} /> might not play</>,
      figure: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <InjuryChip severity={r.severity} onBye={r.onBye} code={r.player.inj} />
          A starter, and nothing on your bench beats him at {r.player.pos}. Check him before his game kicks off.
        </span>
      ),
    }
  }
  const also = []
  if (call && call.kind !== 'Wire' && stakes.waiver) also.push(`a claim worth ${stakeLabel(stakes.waiver)}`)
  if (hurt.length && !(call && call.kind === 'Status')) also.push(`${hurt.length} ${hurt.length === 1 ? 'player' : 'players'} might not play`)
  const matchWeek = game ? game.week : week
  const matchText = matchWeek ? `Week ${matchWeek} matchup` : 'The matchup'
  return (
    <div className="rounded-[6px] border border-v3-ink bg-v3-sheet p-4 shadow-[inset_0_0_0_1px_rgb(var(--v3-ink)),var(--v3-shadow-raised)] sm:p-5" data-now-weekcall={call ? call.kind.toLowerCase() : 'none'}>
      <div className="flex items-center justify-between gap-3">
        <Label>The one thing this week</Label>
        {call ? <span className="rounded-[4px] bg-v3-band px-1.5 py-0.5 font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-white">{call.kind}</span> : null}
      </div>
      {call ? (
        <>
          <div className="mt-3 flex items-start gap-3">
            <PosTag pos={call.pos} className="mt-1.5" />
            <p className="min-w-0 text-[22px] font-black leading-tight tracking-[-0.01em] text-v3-ink">{call.title}</p>
          </div>
          <p className="mt-2 font-figure text-[15px] text-v3-ink2">{call.figure}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[22px] font-black leading-tight tracking-[-0.01em] text-v3-ink">Nothing needs doing this week.</p>
          <p className="mt-2 text-[15px] leading-[1.5] text-v3-ink2">No swap on your bench clears a point, nothing on the wire beats what you hold, and every starter is available. Your lineup stands.</p>
        </>
      )}
      {also.length ? <p className="mt-2 text-[15px] leading-[1.5] text-v3-ink2">Also this week: {also.join(' · ')}.</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        {call ? <CallButton href={call.href}>{call.button} <Icon name="arrow" className="h-4 w-4" /></CallButton> : null}
        <GoLink href={matchupHref(matchWeek)}>{matchText}</GoLink>
      </div>
      {parts ? (
        <div className="mt-4 flex items-start gap-2 border-t border-v3-rule pt-3 font-figure text-[13px] text-v3-ink2">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="block">Next kickoff <span className="font-bold tabular-nums text-v3-ink">{parts.full}</span></span>
            <span className="block">{whenText(kickoffAt)} · lineups lock as each game kicks off</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* LINEUP — points this week. The best same-position swap and the next two,
   ranked by what each adds. */
function LineupCall({ sheet, primary }) {
  const { swaps, total, stakes } = sheet
  const best = swaps[0]
  const worth = !!stakes.strategy
  return (
    <Sheet code="Lineup · this week" aside={worth ? stakeLabel(stakes.strategy) : 'Nothing to change'} className="flex w-full flex-col" bodyClass="flex flex-1 flex-col p-4 sm:p-5">
      {worth ? (
        <>
          <div className="flex items-start gap-3">
            <PosTag pos={best.start.pos} className="mt-1" />
            <div className="min-w-0">
              <div className="text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">
                Start <PlayerLink player={best.start} /> over <PlayerLink player={best.sit} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 font-figure text-[15px] text-v3-ink2">
                <span><Delta value={best.gain} digits={1} className="text-[18px]" /> this week</span>
                {total !== null ? <span>{total.toFixed(1)} as set → <span className="font-bold text-v3-ink">{(total + best.gain).toFixed(1)}</span> with the swap</span> : null}
                {best.replacing ? <span className="text-v3-cost">that slot scores 0 as set</span> : null}
              </div>
            </div>
          </div>
          {swaps.length > 1 ? (
            <ol className="mt-4 grid gap-2 border-t border-v3-rule pt-3" aria-label="Other swaps, alternatives rather than additions">
              <li><Label className="text-[12px]">Or instead — alternatives, not additions</Label></li>
              {swaps.slice(1, 3).map((s) => (
                <li key={s.sit.id + ':' + s.start.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem_3.5rem]">
                  <span className="truncate text-[15px] text-v3-ink2"><span className="text-v3-ink">{s.start.name}</span> over {s.sit.name}</span>
                  <ValueBar value={s.gain} max={best.gain} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                  <Delta value={s.gain} digits={1} className="text-right text-[15px]" />
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : best ? (
        <Nothing>The best swap on your bench adds <Fig className="font-bold text-v3-ink">{best.gain.toFixed(1)}</Fig> — under a point, inside the projection&apos;s own error, so it is not a call. Your lineup stands.</Nothing>
      ) : (
        <Nothing>Nothing on your bench beats a starter at his own position. Your lineup is already the best one Juke can build from this roster.</Nothing>
      )}
      <p className="mt-4 text-[13px] leading-[1.5] text-v3-ink3">Same position only — your platform does not tell Juke which slot is a FLEX, so these are the swaps that are certainly legal.</p>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
        {primary ? <CallButton href="#/calls/lineup">Open the lineup tool <Icon name="arrow" className="h-4 w-4" /></CallButton> : <GoLink href="#/calls/lineup">Open the lineup tool</GoLink>}
      </div>
    </Sheet>
  )
}

/* WIRE — season points over replacement. The best claim, the other
   positions a claim would help, and the league's own waiver system. */
function WireCall({ sheet, snapshot, platform, primary }) {
  const { gaps, stakes } = sheet
  const worth = !!stakes.waiver
  const top = gaps.slice(0, 3)
  const max = top.length ? top[0].improvement : 0
  const waiver = snapshot.waiver || null
  const isFaab = waiver ? waiver.type === 'faab' : !!snapshot.waiverBudget
  return (
    <Sheet code="Wire · season value" aside={worth ? stakeLabel(stakes.waiver) : 'Nothing to claim'} className="flex w-full flex-col" bodyClass="flex flex-1 flex-col p-4 sm:p-5">
      {worth && top.length ? (
        <>
          <div className="flex items-start gap-3">
            <PosTag pos={top[0].pos} className="mt-1" />
            <div className="min-w-0">
              <div className="text-[20px] font-extrabold leading-tight tracking-[-0.01em] text-v3-ink">
                Claim <PlayerLink player={top[0].best.player} />
              </div>
              <div className="mt-1.5 font-figure text-[15px] text-v3-ink2">
                <Delta value={top[0].improvement} className="text-[18px]" /> over your best {top[0].pos}
                {top[0].held === null ? ' — you hold nobody rankable there' : `, who is ${Math.round(top[0].held)} over replacement`}
              </div>
            </div>
          </div>
          {top.length > 1 ? <ol className="mt-4 grid gap-2 border-t border-v3-rule pt-3" aria-label="Where a claim would help, best first">
            <li><Label className="text-[12px]">Every position a claim would help</Label></li>
            {top.map((g) => (
              <li key={g.pos} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem_3.5rem]">
                <span className="flex min-w-0 items-center gap-2 text-[15px] text-v3-ink2"><PosTag pos={g.pos} /><span className="truncate text-v3-ink">{g.best.player.name}</span></span>
                <ValueBar value={g.improvement} max={max} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                <Delta value={g.improvement} className="text-right text-[15px]" />
              </li>
            ))}
          </ol> : null}
        </>
      ) : (
        <Nothing>Nothing on the wire beats what you already hold at any position. In a {snapshot.totalTeams}-team league that is the normal state of the wire, not an error.</Nothing>
      )}
      <div className="mt-4 rounded-[6px] bg-v3-paper p-3">
        <div className="flex items-baseline justify-between gap-3">
          <Label>{isFaab ? 'FAAB pool' : 'Waivers'}</Label>
          <Fig className="text-[18px] font-bold text-v3-ink">{isFaab ? (snapshot.waiverBudget ? `$${snapshot.waiverBudget}` : '—') : 'Order'}</Fig>
        </div>
        <p className="mt-1 text-[13px] leading-[1.45] text-v3-ink2">
          {isFaab
            ? `The season's budget. ${platform} does not report what you have spent, so this is the pool and never a balance.`
            : waiver && waiver.resetsOrder === false
              ? 'A claim moves you to the back, and the order never resets.'
              : 'Claims run on waiver order, not on a budget.'}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
        {primary ? <CallButton href="#/calls/wire">Open the wire <Icon name="arrow" className="h-4 w-4" /></CallButton> : <GoLink href="#/calls/wire">Open the wire</GoLink>}
      </div>
    </Sheet>
  )
}

/* TRADE — whether the window is open, and what you would be trading from. */
function TradeCall({ sheet, snapshot }) {
  const w = sheet.tradeWindow
  const left = w.state === 'open' && w.at !== null ? countdownParts(msUntilDeadline(snapshot.tradeDeadline)) : null
  const aside = w.state === 'open' ? 'Window open' : w.state === 'passed' ? 'Deadline passed' : w.state === 'disabled' ? 'No trading' : 'Deadline unknown'
  const chip = sheet.chips[0] || null
  return (
    <Sheet code="Trade · season value" aside={aside} className="flex w-full flex-col" bodyClass="flex flex-1 flex-col p-4 sm:p-5">
      <p className="text-[15px] font-bold leading-snug text-v3-ink">
        {w.state === 'open'
          ? left ? <>Trading closes in <Fig>{left.compact}</Fig></> : w.week !== null ? <>Trading closes after week <Fig>{w.week}</Fig></> : 'The deadline has not passed.'
          : w.state === 'passed' ? 'The trade deadline has passed.'
          : w.state === 'disabled' ? 'This league does not trade.'
          : 'Your league publishes no trade deadline Juke can read.'}
      </p>
      {w.state === 'open' && w.at !== null ? <p className="mt-1 text-[13px] text-v3-ink2">{whenText(w.at)}</p> : null}
      {sheet.value ? (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[6px] bg-v3-paper p-3">
            <dt><Label className="text-[12px]">Your roster</Label></dt>
            <dd className="mt-0.5"><Delta value={sheet.value.total} className="text-[20px]" /></dd>
            <dd className="text-[12px] text-v3-ink3">{sheet.value.priced} of {sheet.value.held} priced</dd>
          </div>
          <div className="min-w-0 rounded-[6px] bg-v3-paper p-3">
            <dt><Label className="text-[12px]">Top chip</Label></dt>
            <dd className="mt-0.5 truncate text-[15px] font-semibold text-v3-ink">{chip ? chip.player.name : '—'}</dd>
            <dd className="text-[12px] text-v3-ink3">{chip ? <><Delta value={chip.value} className="text-[12px]" /> over repl.</> : 'Nobody priced'}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-[13px] leading-[1.5] text-v3-ink3">Over replacement for the season. Kickers and defenses are not priced — Juke declines to rank them.</p>
      <div className="mt-auto pt-4"><GoLink href="#/calls/trade">{w.state === 'passed' || w.state === 'disabled' ? 'Price a roster' : 'Build a trade'}</GoLink></div>
    </Sheet>
  )
}

/* MIGHT NOT PLAY — the injury watch, anybody whose game has kicked off
   left off (injuryWatch() drops a locked player), designations live from
   the platform where the snapshot carries them. */
function InjuryCall({ sheet, snapshot, platform }) {
  const { hurt } = sheet
  const week = snapshot.week
  const starting = hurt.filter((r) => r.starting).length
  const statusAt = snapshot.status && Number(snapshot.status.week) === Number(week) ? snapshot.status.at : null
  return (
    <Sheet code={`Might not play${week ? ` · week ${week}` : ''}`} aside={hurt.length ? `${hurt.length} · ${starting} starting` : 'All available'} className="flex w-full flex-col" bodyClass="flex flex-1 flex-col p-4 sm:p-5">
      {hurt.length ? (
        <ul className="grid">
          {hurt.slice(0, 6).map((r) => (
            <li key={r.player.id} className="flex min-h-[44px] items-center gap-3 border-b border-v3-rule py-1.5 last:border-b-0">
              <PosTag pos={r.player.pos} />
              <span className="min-w-0 flex-1">
                <PlayerLink player={r.player} className="block text-[15px]" />
                <span className="block font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{r.starting ? 'Starting' : 'Bench'}{r.player.team ? ` · ${r.player.team}` : ''}</span>
              </span>
              <InjuryChip severity={r.severity} onBye={r.onBye} code={r.player.inj} />
            </li>
          ))}
        </ul>
      ) : (
        <Nothing>Everybody on your roster is available{week ? ` in week ${week}` : ''}: no designation, and nobody on bye.</Nothing>
      )}
      <p className="mt-auto pt-3 text-[13px] leading-[1.5] text-v3-ink3">
        {statusAt
          ? `Designations from ${platform}, as of ${new Date(statusAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Anybody whose game has kicked off is left off.`
          : "Designations from last night's board. Anybody whose game has kicked off is left off."}
      </p>
    </Sheet>
  )
}

/* LEAGUE — where the season stands, and the next games. */
function LeagueCall({ league, snapshot, sheet, odds }) {
  const st = standing(snapshot, league.ownerId)
  const me = st.me
  const mine = me ? oddsFor(odds, me.ownerId) : null
  const teams = snapshot.teams || []
  const next = (sheet.games || []).filter((g) => !g.result && (!snapshot.week || g.week >= snapshot.week)).slice(0, 3)
  const recent = (sheet.games || []).filter((g) => g.result).slice(-5)
  return (
    <Sheet code="League · standings" aside={st.rank ? `${ordinal(st.rank)} of ${st.table.length}` : 'No games yet'} className="flex w-full flex-col" bodyClass="flex flex-1 flex-col p-4 sm:p-5">
      {me ? (
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-[6px] bg-v3-paper p-3">
            <dt><Label className="text-[12px]">Record</Label></dt>
            <dd className="mt-0.5 font-figure text-[20px] font-bold text-v3-ink">{recordText(me)}</dd>
            {recent.length ? <dd className="mt-1.5 flex flex-wrap gap-1">{recent.map((g) => <ResultChip key={g.week} result={g.result} />)}</dd> : null}
          </div>
          <div className="rounded-[6px] bg-v3-paper p-3">
            <dt><Label className="text-[12px]">Playoff odds</Label></dt>
            <dd className="mt-0.5 font-figure text-[20px] font-bold tabular-nums text-v3-ink"><CountText text={mine && typeof mine.playoffs === 'number' ? pct(mine.playoffs) : '—'} /></dd>
            <dd className="text-[12px] text-v3-ink3">{mine && typeof mine.playoffs === 'number' ? '10,000 seasons' : st.played ? 'Not simulable here' : 'After week one'}</dd>
          </div>
        </dl>
      ) : (
        <Nothing>Juke does not know which of the {teams.length} rosters is yours — reconnect this league from your account.</Nothing>
      )}
      {next.length ? (
        <div className="mt-4">
          <Label>Next up</Label>
          <ul className="mt-1.5 grid">
            {next.map((g) => {
              const opp = teams.find((t) => String(t.ownerId) === String(g.opponentId))
              return (
                <li key={g.week} className="flex min-h-[44px] items-center gap-3 border-b border-v3-rule text-[15px] last:border-b-0">
                  <a href={matchupHref(g.week)} aria-label={`Week ${g.week} matchup`} className="inline-flex min-h-[44px] w-12 shrink-0 items-center font-figure text-v3-ink2 underline decoration-v3-rule underline-offset-4 hover:text-v3-ink hover:decoration-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">W{g.week}</a>
                  <span className="text-v3-ink3">{g.home ? 'vs' : 'at'}</span>
                  {opp ? <a href={teamHref(opp)} className="min-w-0 truncate font-semibold text-v3-ink underline decoration-v3-rule underline-offset-4 hover:decoration-v3-ink">{opp.teamName}</a> : <span className="text-v3-ink3">Bye</span>}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      <div className="mt-auto pt-4"><GoLink href="#/league">Open League</GoLink></div>
    </Sheet>
  )
}

/* A finished season has no call left in it — the week's lanes would be
   pricing lineups for games nobody plays. So Now says so, reads the season
   back off the schedule (seasonSummary(), every figure exact), and offers
   the one decision that is still ahead: next year's draft. */
function SeasonOver({ league, snapshot, rank, total }) {
  const s = seasonSummary(snapshot.schedule, league.ownerId)
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div>
        <Label tier="page" as="p">Now · the season is over</Label>
        <Headline className="mt-3">No calls left this season.</Headline>
        <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
          {s ? `${s.won}-${s.lost}${s.tied ? '-' + s.tied : ''}${rank ? `, ${ordinal(rank)} of ${total}` : ''}. ` : ''}The one decision still ahead of you is next year&apos;s draft, and it is the only one you can practise.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <CallButton href="#/draft">Mock a {snapshot.totalTeams}-team board <Icon name="arrow" className="h-4 w-4" /></CallButton>
          <QuietButton href="#/league">Read the season back</QuietButton>
        </div>
      </div>
      {s ? (
        <Sheet code="The season, closed out" aside={`${s.played} weeks`}>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[12px]">Points for</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{s.pointsFor.toFixed(1)}</dd></div>
            <div className="rounded-[6px] bg-v3-paper p-3"><dt><Label className="text-[12px]">Points against</Label></dt><dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{s.pointsAgainst.toFixed(1)}</dd></div>
          </dl>
          <p className="mt-4 text-[15px] leading-[1.55] text-v3-ink2">
            {s.lost ? `${s.unlucky} of your ${s.lost} losses came in a week you still outscored the league's median.` : 'Not a single loss.'}
            {s.narrowest ? ` The closest was week ${s.narrowest.week}, by ${s.narrowest.margin.toFixed(1)}.` : ''}
          </p>
        </Sheet>
      ) : null}
    </div>
  )
}

function PreDraft({ league, snapshot }) {
  const draft = useDraftPhase(snapshot.draftAt, snapshot.draftStatus)
  /* The countdown is the whole of what this page knows, and on its own it
     leaves a paying reader a screen of nothing under a clock. The locker is
     the one other real thing there is to say before a draft — what they have
     practised — and it is the pairing NowMember already makes out of season
     for the identical reason. Drawn rather than invented: the same
     historyList() summary Record and Account read. */
  const locker = useLockerSummary()
  /* Words in the headline, the ticking clock in the sheet beside it: a
     headline that changes every minute reads as a counter, not a sentence. */
  const ms = snapshot.draftAt ? snapshot.draftAt - Date.now() : 0
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor(ms / 3600000)
  const when = days >= 1 ? `${days} ${days === 1 ? 'day' : 'days'}` : hours >= 1 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'under an hour'
  const title = draft.phase === 'drafting' ? 'Your draft is running now.' : draft.phase === 'late' ? 'Your draft time has passed.' : draft.parts ? `Your league drafts in ${when}.` : 'Your league has not drafted.'
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div>
        <Label tier="page" as="p">Now · before the draft</Label>
        <Headline className="mt-3">{title}</Headline>
        <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.55] text-v3-ink2">
          Rosters are empty until {snapshot.name || league.name} drafts. The week&apos;s calls — the lineup swap, the claim, the trade window, who might not play — start the morning after.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <CallButton href="#/draft">Mock a {snapshot.totalTeams}-team board first <Icon name="arrow" className="h-4 w-4" /></CallButton>
          <QuietButton href="#/league">Open League</QuietButton>
        </div>
      </div>
      <div className="grid gap-4">
        <Sheet code="Draft" aside={snapshot.draftAt ? whenText(snapshot.draftAt) : 'No time set'}>
          <div className="font-figure text-[44px] font-bold leading-none tabular-nums text-v3-ink">
            {draft.parts ? draft.parts.full : draft.phase === 'drafting' ? 'Live' : '—'}
          </div>
          <p className="mt-3 text-[15px] leading-[1.55] text-v3-ink2">
            {draft.phase === 'drafting'
              ? 'Picks land on your platform; rosters fill here once it finishes — ESPN publishes a draft only when it is complete.'
              : draft.phase === 'late'
                ? 'The scheduled time has gone by and the draft has not run. Rosters appear here once it does.'
                : 'Counted down to the time your platform publishes, in your own time zone.'}
          </p>
        </Sheet>
        <LockerCard summary={locker} />
      </div>
    </div>
  )
}

export default function NowConnected({ plan = null }) {
  const { league } = useLeagueFresh()
  const { snapshot, status, reason } = useSnapshotFresh(league ? league.leagueId : null, league ? league.provider : null)
  const ready = status === 'ready' && !!snapshot
  const sheet = useWeekSheet(league, ready ? snapshot : null)
  const model = useLeagueModel(league, ready ? snapshot : null)
  /* A Sleeper league has no schedule on the snapshot; its week's pairing
     comes off /sleeper/matchups, shared with the matchup page. */
  const sleeperOn = ready && league && league.provider !== 'espn' && !(snapshot.schedule && snapshot.schedule.matchups && snapshot.schedule.matchups.length) && Number(snapshot.week) > 0
  const sw = useSleeperWeeks(sleeperOn ? league.leagueId : null, sleeperOn ? [Number(snapshot.week)] : [], sleeperOn ? Number(snapshot.week) : null)
  const sleeperEntry = sleeperOn ? sw[Number(snapshot.week)] : null
  const sleeperGame = sleeperEntry && sleeperEntry.view && sheet ? gameFor(sleeperWeekView(snapshot, sleeperEntry.view), sheet.mine) : null
  if (!league) return null
  const platform = platformFor(league.provider).name

  if (!ready) {
    if (status === 'loading' || status === 'none') {
      return (
        <div className="grid gap-8" aria-busy="true">
          <div className="h-[44px] animate-pulse rounded-[6px] bg-v3-well" />
          <p className="font-figure text-[13px] uppercase tracking-[0.1em] text-v3-ink3">Reading {league.name} from {platform}…</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Sheet band={false}><Skeleton lines={6} /></Sheet><Sheet band={false}><Skeleton lines={6} /></Sheet></div>
        </div>
      )
    }
    return <CouldNotRead reason={reason} platform={platform} onRetry={() => retrySnapshot(league.leagueId, league.provider)}><QuietButton href="#/account">Manage leagues</QuietButton></CouldNotRead>
  }

  const st = standing(snapshot, league.ownerId)
  const draftDone = snapshot.draftStatus === 'complete' || (sheet && sheet.rostered)

  if (!draftDone) {
    return (
      <div className="grid gap-section">
        <SituationBand league={league} snapshot={snapshot} sheet={sheet} rank={st.rank} total={st.table.length} />
        <PreDraft league={league} snapshot={snapshot} />
        {plan}
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="grid gap-8" aria-busy="true">
        <SituationBand league={league} snapshot={snapshot} sheet={null} rank={st.rank} total={st.table.length} />
        <Sheet band={false}><Skeleton lines={8} /></Sheet>
      </div>
    )
  }

  if (seasonPhase(snapshot) === 'complete') {
    return (
      <div className="grid gap-section">
        {/* No kickoff on a finished season: the page's own headline is that
            nothing is left to decide, and a countdown beside it says the
            opposite. Same rule SeasonBand keeps for the pages with no
            league. */}
        <SituationBand league={league} snapshot={snapshot} sheet={sheet} rank={st.rank} total={st.table.length} showKickoff={false} />
        <SeasonOver league={league} snapshot={snapshot} rank={st.rank} total={st.table.length} />
        {plan}
      </div>
    )
  }

  const { mine, game, opponent, total } = sheet
  const week = snapshot.week

  /* The one cobalt action on the page is WeekCall's — the lane with
     something to do, in lane order, never "whichever number is bigger", for
     the unit reason above. The lanes below link to their tools quietly. */

  const title = !mine
    ? 'Which team is yours?'
    : game && opponent
      ? `Week ${game.week} against ${opponent.teamName}.`
      : sleeperGame && !sleeperGame.bye && sleeperGame.theirs.team
        ? `Week ${week} against ${sleeperGame.theirs.team.teamName}.`
        : week ? `Week ${week}.` : 'Your week.'

  const facts = []
  if (mine && total !== null) facts.push(`You project ${total.toFixed(1)} as set${sheet.oppTotal !== null && opponent ? `; ${opponent.teamName} projects ${sheet.oppTotal.toFixed(1)}` : ''}.`)
  if (mine && total === null) facts.push('A starter has no projection yet, so there is no total to state.')

  return (
    <div className="grid gap-section">
      <SituationBand league={league} snapshot={snapshot} sheet={sheet} rank={st.rank} total={st.table.length} showKickoff={!mine} />

      {/* The opening sentence runs the full measure rather than being wrapped
          by the narrower of two tracks: the headline is sized by the viewport
          (clamp), so squeezing it into a 5fr column put 68px type on four
          lines and left a third of the hero empty beside it. Copy on its own
          row, then the week's two cards side by side underneath. */}
      <div className="grid gap-8">
        <div>
          <Label tier="page" as="p">Now · your call sheet{week ? ` · week ${week}` : ''}</Label>
          <Headline className="mt-3 max-w-[22ch]">{title}</Headline>
          <p className="mt-5 max-w-[62ch] text-[18px] leading-[1.55] text-v3-ink2">
            {mine ? facts.join(' ') : `Juke cannot tell which of the ${(snapshot.teams || []).length} rosters in ${snapshot.name} is yours. Reconnect the league and pick your team, and this becomes your week.`}
          </p>
        </div>
        {mine ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
            <Matchup sheet={sheet} week={week} platform={platform} hasRules={!!snapshot.rules} hasSchedule={!!(snapshot.schedule && snapshot.schedule.matchups && snapshot.schedule.matchups.length)} sleeperGame={sleeperGame} />
            <WeekCall sheet={sheet} week={week} />
          </div>
        ) : (
          <div><QuietButton href="#/account">Manage leagues</QuietButton></div>
        )}
      </div>

      {mine ? (
        <section aria-labelledby="v3-calls" className="grid gap-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <Headline as="h2" size="section" id="v3-calls">This week&apos;s calls</Headline>
            <p className="max-w-[52ch] text-[15px] leading-[1.5] text-v3-ink3">
              Ranked inside each lane, never across them: a point this week and a point of season value are different units.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
            <div className="flex lg:col-span-3"><LineupCall sheet={sheet} primary={false} /></div>
            <div className="flex lg:col-span-3"><WireCall sheet={sheet} snapshot={snapshot} platform={platform} primary={false} /></div>
            <div className="flex lg:col-span-2"><InjuryCall sheet={sheet} snapshot={snapshot} platform={platform} /></div>
            <div className="flex lg:col-span-2"><TradeCall sheet={sheet} snapshot={snapshot} /></div>
            <div className="flex lg:col-span-2"><LeagueCall league={league} snapshot={snapshot} sheet={sheet} odds={model.odds} /></div>
          </div>
        </section>
      ) : (
        <div className="max-w-[520px]"><LeagueCall league={league} snapshot={snapshot} sheet={sheet} odds={model.odds} /></div>
      )}
      {plan}
    </div>
  )
}
