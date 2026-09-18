import { useMemo, useState } from 'react'
import { SignUpButton, useUser } from '@clerk/clerk-react'
import { useAccountUiReady } from '../../../hooks/useAccountUiReady.js'
import { leagueCap, tierLabel } from '../../../lib/tiers.js'
import { LINE as PLATFORM_LINE } from '../../shell/leaguePlatforms.js'
import {
  CallButton, Delta, Fig, GoLink, Icon, Label, PosTag, QuietButton, Sheet, Skeleton, cx, ordinal,
  useEngineData,
} from '../ui.jsx'
import { CountUp } from '../motion.jsx'
import { SampleTag, WinBar, pct, useCountdown, whenText } from '../league/parts.jsx'
import { matchupHref } from '../league/matchupData.js'
import { lockerStats, useLocker } from '../record/recordKit.js'
import { readSituation } from '../data.js'
import { readSampleWeek } from './nowData.js'

/* The pieces the audience- and season-aware Now pages share. Each draws
   only: every figure is a store's answer or the engine's, and a piece with
   nothing honest to say renders nothing rather than a placeholder. */

/* ---- The band across the top ----

   The page's situation in one line: which week of which season, when the
   next game kicks off (the exact time beside the ticking digits, because
   the fact a reader acts on is the wall-clock time), and how fresh the
   board is. After the season it says the season is over — the page under
   it is the draft page, and the band is what tells a reader why. */
export function SeasonBand({ season, kickoffAt }) {
  const s = useEngineData(readSituation)
  const parts = useCountdown(kickoffAt)
  const bucket = season.phase === 'regular' ? 'season' : 'post'
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[6px] bg-v3-band px-4 py-2.5 font-figure text-[13px] text-v3-bandInk">
      {bucket === 'season' ? (
        <span className="font-bold uppercase tracking-[0.14em] text-white">
          {season.week ? `Week ${season.week}` : 'Regular season'}{season.season ? ` · ${season.season} season` : ''}
        </span>
      ) : (
        <span className="font-bold uppercase tracking-[0.14em] text-white">
          {season.season ? `The ${season.season} season is over` : 'The season is over'}
        </span>
      )}
      {/* A kickoff is a deadline only while there is a week to act in. Under
          "the season is over" it reads as one anyway — a countdown is read
          as a fact about the reader, and the fact here is that nothing on
          this page expires. So the band counts down in season and states
          the season is over after it, never both. */}
      {bucket === 'season' && parts ? (
        <span title={kickoffAt ? whenText(kickoffAt) : undefined}>
          Next kickoff <Fig className="font-bold text-white">{parts.full}</Fig>
        </span>
      ) : null}
      {s ? <span><Fig className="font-bold text-white">{s.players}</Fig> players priced</span> : null}
      {s && s.refreshed ? <span>refreshed {s.refreshed}</span> : null}
    </div>
  )
}

/* ---- The sample week ----

   The in-season tools, working, on the labelled SAMPLE league. Three rows,
   each the figure its tool opens on, each row the door to that tool. Real
   players and real arithmetic; the league is the one invented thing, and
   SAMPLE is on the sheet as well as in the footnote. */
function SampleRow({ href, label, children, aside }) {
  return (
    <li className="border-t border-v3-rule first:border-t-0">
      <a href={href} className="group grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5">
        <div className="min-w-0">
          <Label className="text-[12px]">{label}</Label>
          <div className="mt-1">{children}</div>
        </div>
        <span className="flex items-center gap-3">
          {aside}
          <Icon name="arrow" className="h-4 w-4 shrink-0 text-v3-ink3 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
        </span>
      </a>
    </li>
  )
}

export function SampleWeek({ week, code = 'Sample week · what Now shows', className = '' }) {
  const sample = useEngineData(readSampleWeek)
  const w = week || null
  return (
    <Sheet code={code} aside={<SampleTag />} bodyClass="" className={className}>
      {!sample ? (
        <div className="p-4 sm:p-5"><Skeleton lines={6} /></div>
      ) : (
        <>
          <ul>
            {sample.matchup ? (
              <SampleRow
                href={matchupHref(w)}
                label="The matchup"
                aside={sample.matchup.winProb !== null ? (
                  <span className={cx('font-figure text-[22px] font-bold tabular-nums', sample.matchup.read === 'favoured' ? 'text-v3-gain' : sample.matchup.read === 'behind' ? 'text-v3-cost' : 'text-v3-ink')}>
                    {pct(sample.matchup.winProb)}
                  </span>
                ) : null}
              >
                <span className="block text-[15px] font-semibold text-v3-ink">
                  {sample.matchup.me} <Fig className="text-v3-ink2">{sample.matchup.mine !== null ? sample.matchup.mine.toFixed(1) : '—'}</Fig>
                  <span className="px-1.5 text-v3-ink3">vs</span>
                  {sample.matchup.them} <Fig className="text-v3-ink2">{sample.matchup.theirs !== null ? sample.matchup.theirs.toFixed(1) : '—'}</Fig>
                </span>
                {sample.matchup.winProb !== null ? <WinBar p={sample.matchup.winProb} read={sample.matchup.read} className="mt-1 max-w-[360px]" /> : null}
              </SampleRow>
            ) : null}
            {sample.swap ? (
              <SampleRow href="#/calls/lineup" label="The lineup call" aside={<Delta value={sample.swap.gain} digits={1} className="text-[18px]" />}>
                <span className="flex min-w-0 items-center gap-2">
                  <PosTag pos={sample.swap.start.pos} />
                  <span className="min-w-0 text-[15px] font-semibold leading-snug text-v3-ink">Start {sample.swap.start.name} over {sample.swap.sit.name}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-v3-ink3">points this week</span>
              </SampleRow>
            ) : null}
            {sample.claim ? (
              <SampleRow href="#/calls/wire" label="The claim" aside={<Delta value={sample.claim.improvement} className="text-[18px]" />}>
                <span className="flex min-w-0 items-center gap-2">
                  <PosTag pos={sample.claim.pos} />
                  <span className="min-w-0 text-[15px] font-semibold leading-snug text-v3-ink">Claim {sample.claim.player.name}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-v3-ink3">season points over the {sample.claim.pos} he would replace</span>
              </SampleRow>
            ) : null}
            <SampleRow href="#/calls/trade" label="The trade question">
              <span className="block text-[15px] font-semibold text-v3-ink">Whether a deal is fair before you send it</span>
              <span className="mt-0.5 block text-[12px] text-v3-ink3">both sides priced over replacement</span>
            </SampleRow>
          </ul>
          <p className="border-t border-v3-rule px-4 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">
            A {sample.teams}-team sample league drafted by ADP off tonight’s board, lineups set in draft order. Real players and real arithmetic; the league is invented. Each row opens its tool on the same sample.
          </p>
        </>
      )}
    </Sheet>
  )
}

/* ---- The week's slate ----

   Every game on ESPN's scoreboard this week, live games first, then the
   ones still to kick off in order, then the finals. A kickoff time is
   printed in the reader's own zone; a live or final game says what ESPN
   says about it. Nothing is drawn when there is no scoreboard — the score
   strip's own contract. */
const STATE_ORDER = { in: 0, pre: 1, post: 2 }
function kickoffText(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

const PHONE_SLATE = 8
export function Slate({ games, kickoffAt }) {
  const [all, setAll] = useState(false)
  const rows = useMemo(() => {
    if (!Array.isArray(games)) return []
    return games
      .filter((g) => g && g.away && g.home)
      .slice()
      .sort((a, b) => (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) || (Date.parse(a.kickoff || '') || 0) - (Date.parse(b.kickoff || '') || 0))
  }, [games])
  if (!rows.length) return null
  const live = rows.filter((g) => g.state === 'in').length
  return (
    <Sheet code="This week’s slate" aside={`${live ? `${live} live · ` : ''}${rows.length} games`} bodyClass="">
      {/* The exact time, not a second ticking clock — the band above the
          page already counts down to this same instant. */}
      {kickoffAt && kickoffAt > Date.now() ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-v3-rule px-4 py-3 sm:px-5">
          <Label>Next kickoff</Label>
          <span className="font-figure text-[15px] font-bold text-v3-ink">{whenText(kickoffAt)}</span>
        </div>
      ) : null}
      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {rows.map((g, i) => {
          const scored = g.state !== 'pre' && g.awayScore !== undefined && g.homeScore !== undefined
          const when = g.state === 'pre' && g.kickoff ? kickoffText(Date.parse(g.kickoff)) : g.detail
          return (
            <li key={`${g.away}-${g.home}-${i}`} className={cx('relative min-h-[48px] items-center justify-between gap-3 border-b border-v3-rule px-4 py-2 sm:flex sm:px-5 sm:[&:nth-child(odd)]:border-r', g.id && 'hover:bg-v3-paper focus-within:bg-v3-paper', !all && i >= PHONE_SLATE ? 'hidden' : 'flex')}>
              {/* The whole row opens the game. A cached scoreboard from before
                  ESPN's event id was kept has none, and that row is plain. */}
              {g.id ? <a href={`#/games/${encodeURIComponent(g.id)}`} aria-label={`${g.away} at ${g.home}, game details`} className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call" /> : null}
              <span className="flex min-w-0 items-baseline gap-2 font-figure text-[15px] font-semibold text-v3-ink">
                <span>{g.away}</span>
                {scored ? <Fig className="text-v3-ink2">{g.awayScore}</Fig> : null}
                <span className="font-normal text-v3-ink3">at</span>
                <span>{g.home}</span>
                {scored ? <Fig className="text-v3-ink2">{g.homeScore}</Fig> : null}
              </span>
              <span className={cx('shrink-0 truncate font-figure text-[12px] uppercase tracking-[0.06em]', g.state === 'in' ? 'font-bold text-v3-ink' : 'text-v3-ink3')}>
                {g.state === 'in' ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-v3-cost align-middle" aria-hidden="true" /> : null}
                {when || ''}
              </span>
            </li>
          )
        })}
      </ul>
      {/* A phone gets the live games and the next ones up, and the rest a
          press away: sixteen rows is a screen and a half of scrolling past
          before anything else on the page. Two columns hold all of them. */}
      {rows.length > PHONE_SLATE && !all ? (
        <button type="button" onClick={() => setAll(true)} className="flex min-h-[48px] w-full items-center justify-center gap-2 border-b border-v3-rule text-[15px] font-semibold text-v3-ink hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:hidden">
          All {rows.length} games <Icon name="arrow" className="h-4 w-4 rotate-90" />
        </button>
      ) : null}
      <p className="px-4 py-3 text-[13px] leading-[1.5] text-v3-ink3 sm:px-5">From ESPN’s scoreboard. Kickoff times are in your own time zone.</p>
    </Sheet>
  )
}

/* ---- Who moved ----

   JukeEngine.playerMovers()'s rows, drawn as they come: rank now, where he
   stood before, and the season so far. The direction is worked out from
   the two ranks when both are there (a smaller rank is higher), and from
   the engine's own delta otherwise. */
function moveOf(r) {
  if (typeof r.rankNow === 'number' && typeof r.rankBefore === 'number') return r.rankBefore - r.rankNow
  return typeof r.delta === 'number' ? r.delta : null
}

export function Movers({ rows, week }) {
  if (!rows || !rows.length) return null
  return (
    <Sheet code={week ? `Who moved · week ${week}` : 'Who moved'} aside="Rank now · was" bodyClass="">
      <ol>
        {rows.map((r) => {
          const m = moveOf(r)
          return (
            <li key={r.id || r.name} className="border-t border-v3-rule first:border-t-0">
              <a href={r.id ? `#/players/${encodeURIComponent(String(r.id))}` : '#/players'} className="grid min-h-[56px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-v3-paper focus-visible:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call sm:px-5">
                <PosTag pos={r.pos} />
                <span className="min-w-0">
                  <span className="block break-words [overflow-wrap:anywhere] text-[15px] font-semibold text-v3-ink">{r.name}</span>
                  <span className="block truncate font-figure text-[12px] text-v3-ink3">
                    {r.team || 'FA'}
                    {typeof r.seasonPts === 'number' ? ` · ${r.seasonPts.toFixed(1)} pts` : ''}
                    {typeof r.ppg === 'number' ? ` · ${r.ppg.toFixed(1)} a game` : ''}
                  </span>
                </span>
                <span className="text-right font-figure">
                  <span className="block text-[15px] font-bold tabular-nums text-v3-ink">
                    {typeof r.rankNow === 'number' ? `#${r.rankNow}` : '—'}
                    {typeof r.rankBefore === 'number' ? <span className="ml-1.5 text-[12px] font-normal text-v3-ink3">was #{r.rankBefore}</span> : null}
                  </span>
                  {m !== null && m !== 0 ? (
                    <span className={cx('block text-[12px] font-semibold', m > 0 ? 'text-v3-gain' : 'text-v3-cost')}>{m > 0 ? `Up ${m}` : `Down ${-m}`}</span>
                  ) : m === 0 ? <span className="block text-[12px] text-v3-ink3">No change</span> : null}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

/* ---- Your locker ----

   The same summary the Record and Account pages draw — historyList()
   through the bridge — plus a draft left mid-way, which is the one thing
   worth resuming. */
export function useLockerSummary() {
  const locker = useLocker()
  const stats = useMemo(() => lockerStats(locker.list), [locker.list])
  const inProgress = useEngineData((e) => {
    try { return e.inProgressSummary ? e.inProgressSummary() || { none: true } : { none: true } } catch { return { none: true } }
  })
  return { ready: locker.ready, stats, inProgress: inProgress && !inProgress.none ? inProgress : null }
}

export function LockerCard({ summary, compact = false, className = '' }) {
  const { ready, stats, inProgress } = summary
  const last = stats.last
  return (
    <Sheet code="Your locker" aside={ready ? `${stats.count} ${stats.count === 1 ? 'mock' : 'mocks'}` : ''} className={className}>
      {!ready ? <Skeleton lines={3} /> : (
        <>
          {inProgress ? (
            <a href="#/draft" className="mb-4 flex min-h-[56px] items-center justify-between gap-3 rounded-[6px] border border-v3-rule bg-v3-paper px-3 py-2.5 transition-colors hover:border-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">
              <span className="min-w-0">
                <Label className="text-[12px]">A mock left mid-way</Label>
                <span className="mt-0.5 block truncate text-[15px] font-semibold text-v3-ink">
                  <Fig>{inProgress.made}</Fig> of <Fig>{inProgress.total}</Fig> picks · {inProgress.pickPosition} seat{inProgress.leagueType ? ` · ${inProgress.leagueType}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-v3-ink">Resume <Icon name="arrow" className="inline h-4 w-4" /></span>
            </a>
          ) : null}
          {stats.count === 0 ? (
            <p className="text-[15px] leading-[1.55] text-v3-ink2">Nothing here yet. Your first mock lands in the locker with a letter, where it finished in its room, and the four parts that add up to it.</p>
          ) : (
            <dl className={cx('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
              <div className="rounded-[6px] bg-v3-paper p-3">
                <dt><Label className="text-[12px]">Mocks</Label></dt>
                <dd className="mt-0.5 font-figure text-[22px] font-bold tabular-nums text-v3-ink"><CountUp value={stats.count} /></dd>
              </div>
              <div className="rounded-[6px] bg-v3-paper p-3">
                <dt><Label className="text-[12px]">Best finish</Label></dt>
                <dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{stats.best ? stats.best.grade : '—'}</dd>
                {stats.best ? <dd className="font-figure text-[12px] text-v3-ink3">{ordinal(stats.best.rank)} of {stats.best.teams}</dd> : null}
              </div>
              {!compact ? (
                <div className="col-span-2 rounded-[6px] bg-v3-paper p-3 sm:col-span-1">
                  <dt><Label className="text-[12px]">Last mock</Label></dt>
                  <dd className="mt-0.5 font-figure text-[22px] font-bold text-v3-ink">{last && last.grade ? last.grade : '—'}</dd>
                  {last && last.rank && last.teams ? <dd className="font-figure text-[12px] text-v3-ink3">{ordinal(last.rank)} of {last.teams}</dd> : null}
                </div>
              ) : null}
            </dl>
          )}
          <div className="mt-4"><GoLink href="#/record?show=drafts">Open your record</GoLink></div>
        </>
      )}
    </Sheet>
  )
}

/* ---- "Tell me when it opens" ----

   Billing is not built, so the one honest thing a plan prompt can offer is
   what production's UpgradeGate and the connect dialog's tier-limit screen
   already offer: an email, recorded against the tier it is for
   (Live.signup(email, 'upgrade:<tier>')). A button that looked like a
   purchase and took none would be worse than no prompt. The label is
   visible, the field is 16px (iOS zooms anything smaller), and the error
   sits under the field it is about. */
export function NotifyForm({ need, primary = false, button = 'Tell me', id }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')
  const fieldId = id || `v3-now-notify-${need}`
  const submit = (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || value.indexOf('@') < 1) { setState('invalid'); return }
    setState('submitting')
    const live = typeof window !== 'undefined' ? window.Live : null
    if (!live || !live.signup) { setState('error'); return }
    Promise.resolve(live.signup(value, 'upgrade:' + need))
      .then((res) => setState(res && res.ok ? 'success' : 'error'))
      .catch(() => setState('error'))
  }
  if (state === 'success') {
    return <p className="text-[15px] font-semibold text-v3-gain" role="status">You are on the list. Nothing else to do.</p>
  }
  const Btn = primary ? CallButton : QuietButton
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={fieldId} className="block font-figure text-[12px] font-semibold uppercase tracking-[0.12em] text-v3-ink3">Email</label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          id={fieldId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') setState('idle') }}
          placeholder="you@example.com"
          aria-invalid={state === 'invalid' ? 'true' : undefined}
          aria-describedby={state === 'invalid' || state === 'error' ? `${fieldId}-msg` : undefined}
          className="min-h-[44px] min-w-0 flex-1 basis-[200px] rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
        />
        <Btn type="submit" disabled={state === 'submitting'}>{state === 'submitting' ? 'Sending…' : button}</Btn>
      </div>
      {state === 'invalid' ? <p id={`${fieldId}-msg`} className="mt-2 text-[13px] text-v3-cost" role="alert">That does not look like an email.</p> : null}
      {state === 'error' ? <p id={`${fieldId}-msg`} className="mt-2 text-[13px] text-v3-cost" role="alert">That did not send. Nothing was lost — try again in a moment.</p> : null}
    </form>
  )
}

/* ---- What Season Pass adds ----

   Only what the codebase defines: the plan names are tiers.js's, the
   league counts are its LEAGUE_CAP, and every line under them is a screen
   that exists today behind a connected league (Now's week, the three call
   tools, League) or behind Multi-League's own gate (League intel on the
   wire, Rival needs on a trade). No price, no trial — there is no checkout
   to quote one from — and the card says the plan is not on sale, because
   it is not. `primary` makes the email the page's one cobalt action: in
   season, when a mock has stopped being the thing to do. */
export function PassCard({ week, primary = false, inSeason = false }) {
  const pro = tierLabel('pro')
  const multi = tierLabel('allaccess')
  const one = leagueCap('pro')
  const many = leagueCap('allaccess')
  const items = inSeason
    ? [
        ['league', `Week ${week || '—'} on this page: your matchup, and the win probability`],
        ['lineup', 'The lineup swap worth making, in points this week'],
        ['wire', 'The claim worth making, priced over replacement'],
        ['trade', 'Whether a trade is fair before you send it'],
      ]
    : [
        ['clock', 'Your league’s draft, counted down on this page'],
        ['lineup', 'Then the week’s calls: the lineup swap and the claim, in points'],
        ['trade', 'Whether a trade is fair before you send it'],
        ['league', 'Standings with every team’s playoff odds'],
      ]
  return (
    <Sheet code={inSeason ? `${pro} · this week` : pro} aside="Not on sale yet" className="flex flex-col">
      <p className="text-[20px] font-black leading-tight tracking-[-0.01em] text-v3-ink">
        {inSeason ? `What ${pro} would put on this page` : `What ${pro} adds when your league drafts`}
      </p>
      <ul className="mt-3 grid gap-2.5">
        {items.map(([icon, text]) => (
          <li key={icon} className="flex items-start gap-3 text-[15px] leading-[1.45] text-v3-ink2">
            <Icon name={icon} className="mt-0.5 h-5 w-5 shrink-0 text-v3-ink" />{text}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] leading-[1.55] text-v3-ink2">
        {pro} reads {one === 1 ? 'one league' : `${one} leagues`}; {multi} reads up to {many} and adds what every rival is short of. Neither is on sale yet — leave an email and Juke will tell you when it is.
      </p>
      <div className="mt-4"><NotifyForm need="pro" primary={primary} /></div>
      <p className="mt-3 text-[12px] text-v3-ink3">Read-only: Juke never edits your league. {PLATFORM_LINE}.</p>
    </Sheet>
  )
}

/* A free account that still has a league connected — one connected on a
   plan it has since left. The week's calls above read it as they read
   anybody's; what its plan does not reach is Multi-League's own gate. */
export function FreeLeagueNote() {
  const multi = tierLabel('allaccess')
  return (
    <Sheet code={`Your plan · ${tierLabel('free')}`} aside="Not on sale yet">
      <p className="max-w-[62ch] text-[15px] leading-[1.55] text-v3-ink2">
        Your league stays connected and every call above reads it. {multi} adds what every rival is short of — League intel on the wire and Rival needs on a trade — and reads up to {leagueCap('allaccess')} leagues. It is not on sale yet.
      </p>
      <div className="mt-4 max-w-[520px]"><NotifyForm need="allaccess" /></div>
    </Sheet>
  )
}

/* ---- Who is signed in ----

   The first name from Clerk's own user, mounted only when a provider
   exists (useAccountUiReady) — useUser() throws without one, and a keyless
   build has none. Without it the welcome simply has no name in it. */
function ClerkFirst({ fallback }) {
  const { user } = useUser()
  const name = user && (user.firstName || user.username)
  return <>{name ? `Welcome back, ${name}.` : fallback}</>
}
export function Welcome({ fallback = 'Welcome back.' }) {
  const ready = useAccountUiReady()
  return ready ? <ClerkFirst fallback={fallback} /> : <>{fallback}</>
}

/* The way in for somebody signed out, on a page whose job is a league:
   connecting it is the primary action, and the fine print says plainly
   what connecting takes. Clerk's sign-up where a provider exists; the
   account page in a keyless build. */
export function ConnectWayIn() {
  const ready = useAccountUiReady()
  const main = <CallButton>Connect your league <Icon name="arrow" className="h-4 w-4" /></CallButton>
  return (
    <div className="flex flex-wrap gap-3">
      {ready ? <SignUpButton mode="modal">{main}</SignUpButton> : <CallButton href="#/account">Connect your league <Icon name="arrow" className="h-4 w-4" /></CallButton>}
      <QuietButton href="#/account">Log in</QuietButton>
    </div>
  )
}

/* The mock draft, kept reachable once it has left the hero. */
export function StillDrafting({ post = false }) {
  return (
    <Sheet band={false} bodyClass="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <span className="flex items-start gap-3">
        <Icon name="draft" className="mt-0.5 h-5 w-5 shrink-0 text-v3-ink" />
        <span>
          <span className="block text-[15px] font-bold text-v3-ink">{post ? 'Next year’s draft is the one decision left' : 'Still drafting?'}</span>
          <span className="block text-[15px] leading-[1.5] text-v3-ink2">Mock drafts against tonight’s board are in Draft — free, no account, graded the moment the last pick lands.</span>
        </span>
      </span>
      {/* data-hero-cta: the guest homepage's draft door IN SEASON.
          NowSeason renders StillDrafting and NowGuest renders DraftBlock's
          own copy, so exactly one of the two markers is ever on the page -
          which is what journey.spec's `.first()` and sonar.spec's
          first-with-height both assume. See Now.jsx's note for why a
          connect button is deliberately not marked: journey walks this
          control to a FINISHED DRAFT, and only a #/draft door gets there. */}
      <QuietButton data-hero-cta href="#/draft" className="shrink-0">Set up a mock</QuietButton>
    </Sheet>
  )
}
