import { DE, whatItCosts, reasonFor } from '../../../v2/cockpit/cockpitData.js'
import { useClockTick } from '../../../v2/cockpit/useCockpit.js'
import { Delta, Label, PosTag, cx } from '../../ui.jsx'
import { DraftButton, FOCUS, Glyph, Headshot, InjuryTag, StarButton, Switch } from '../kit.jsx'

/* The Call — the one object this room is built around.

   ---- The idea ----

   A draft room is a timed decision repeated fourteen times, and every other
   room (production's, v2's, this file's predecessor) files the decision
   under a tab called Decide that you have to go and find. Here it is never
   anywhere else: the Call is a card that is always on screen — the top of
   the right-hand rail on a desk, the dock under your thumb on a phone — and
   it reshapes itself around whose turn it is.

     On the clock   Juke's pick, two alternatives, why, what it costs, and
                    the view's one cobalt button. The clock drains across
                    the card itself, so the decision and the time left to
                    make it are read in one place.
     Waiting        the same three players, re-read as a forecast: how
                    likely each is to last to YOUR next pick, with the queue
                    star as the action, because between picks the useful
                    thing to do is line somebody up.

   Same object, same order, different emphasis — so the moment the clock
   comes round nothing has moved except which button is lit.

   ---- Where every figure comes from ----

   The three are engine.suggestions('ALL') through cockpitData's
   readDecide() — never the position chip (a filter is a lens, never a
   decision). Their labels, reasons and "what it costs" are the same
   readers DraftDecideScreen uses, with one v3 rule on top: a kicker or a
   defense is never called "value" — they have no Juke score and are priced
   by need, so the reason says so. Survival is survivalProbability() against
   your next pick — FFC's real spread of where a player goes, not a
   simulation — and the pick code is DraftEngine.pickCode(). */

const UNRANKED = new Set(['K', 'DST'])

export function pct(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

/* How likely he lasts, in words. Caution below the line where waiting is a
   real risk; ink above it. Never gain/cost — a survival chance has no
   direction of its own. */
export function survivalWord(s, actionable) {
  if (s == null) return { label: 'No market read', tone: 'text-v3-ink3' }
  if (s < 0.2) return { label: actionable ? 'Take him now' : 'Likely gone', tone: 'font-bold text-v3-warn' }
  if (s < 0.65) return { label: 'Coin flip', tone: 'text-v3-warn' }
  return { label: 'Safe to wait', tone: 'text-v3-ink' }
}

function reasonOf(c) {
  const p = c.player
  if (UNRANKED.has(p.pos)) {
    const slot = p.pos === 'DST' ? 'defense' : 'kicker'
    return c.fit && c.fit.startsNow
      ? `Fills your ${slot} slot. Kickers and defenses are taken for need here, never as value.`
      : `A second ${slot} — kickers and defenses are taken for need, never as value.`
  }
  return reasonFor(c)
}

const surname = (name) => (name || '').split(' ').slice(-1)[0]

/* The clock, drained across the Call rather than printed a second time —
   the header already says the number. Its own component because it is the
   one piece of the card that moves every second. */
export function ClockDrain({ engine, className = '' }) {
  useClockTick(engine)
  const info = engine.headerInfo()
  const length = engine.clockLength()
  if (!info.started || info.over || !info.myTurn || !length) return <div className={cx('h-[3px]', className)} aria-hidden="true" />
  const left = Math.max(0, Math.min(1, engine.timeLeft() / length))
  const caution = !!info.urgent || !!engine.paused()
  return (
    <div className={cx('h-[3px] bg-v3-well', className)} aria-hidden="true">
      <div className={cx('h-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none', caution ? 'bg-v3-warn' : 'bg-v3-ink')} style={{ width: `${left * 100}%` }} />
    </div>
  )
}

function LastsLine({ c, nextOverall, myTurn, big = false }) {
  const w = survivalWord(c.survival, myTurn)
  return (
    <div className={cx('rounded-[4px] bg-v3-paper', big ? 'px-3 py-2.5' : 'px-2.5 py-2')}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[11px]">{nextOverall ? `Lasts to #${nextOverall}` : 'No pick after this'}</Label>
        <span className={cx('whitespace-nowrap font-figure text-[13px]', w.tone)}>{nextOverall ? w.label : '—'}</span>
      </div>
      {nextOverall && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-v3-well" role="img" aria-label={`${pct(c.survival)} chance he is still there at pick ${nextOverall}`}>
            {c.survival != null && <span className="absolute inset-y-0 left-0 rounded-full bg-v3-ink2" style={{ width: `${Math.max(2, c.survival * 100)}%` }} />}
          </div>
          <span className="w-10 text-right font-figure text-[13px] font-bold tabular-nums text-v3-ink">{pct(c.survival)}</span>
        </div>
      )}
    </div>
  )
}

function Lead({ engine, c, myTurn, canDraft, draftReason, onDraft, onOpen, queued, nextOverall, counts, compact }) {
  const p = c.player
  const costs = myTurn ? whatItCosts(engine, p, counts, nextOverall) : null
  return (
    <div className={compact ? 'p-3' : 'p-4'}>
      <Label className="block text-[11px]">{myTurn ? c.label : 'If Juke picked now'}</Label>
      <div className="mt-1.5 flex items-start gap-2">
        <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 flex-1 items-center gap-3 rounded-[4px] text-left', FOCUS)}>
          <Headshot src={engine.photoUrl(p)} name={p.name} size={compact ? 40 : 48} />
          <span className="min-w-0">
            <span className={cx('block truncate font-extrabold leading-tight tracking-[-0.01em] text-v3-ink', compact ? 'text-[17px]' : 'text-[20px]')}>{p.name}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <PosTag pos={p.pos} />
              <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink3">{p.team || 'FA'} · bye {p.bye || '—'}</span>
              <InjuryTag code={p.inj} />
            </span>
          </span>
        </button>
        <StarButton on={queued} onClick={() => engine.queueToggle(p.name)} name={p.name} className="h-11 w-11" />
      </div>
      <dl className={cx('mt-3 grid gap-2', myTurn ? 'grid-cols-4' : 'grid-cols-3')}>
        <div className="min-w-0"><dt><Label className="text-[11px]"><abbr title="Projected points over a replacement starter" className="no-underline">Vs repl</abbr></Label></dt><dd className="mt-0.5 text-[20px] leading-none"><Delta value={c.vorp} /></dd></div>
        <div className="min-w-0"><dt><Label className="text-[11px]">Juke</Label></dt><dd className="mt-0.5 font-figure text-[20px] font-bold leading-none tabular-nums text-v3-ink">{c.juke == null ? '—' : Math.round(c.juke)}</dd></div>
        <div className="min-w-0"><dt><Label className="text-[11px]"><abbr title="Players left in his tier at his position" className="no-underline">In tier</abbr></Label></dt><dd className="mt-0.5 font-figure text-[20px] font-bold leading-none tabular-nums text-v3-ink">{c.tierLeft ?? '—'}</dd></div>
        {myTurn && (
          <div className="min-w-0">
            <dt><Label className="text-[11px]"><abbr title={nextOverall ? `Chance he is still there at your next pick, #${nextOverall}` : 'You have no pick after this one'} className="no-underline">Lasts</abbr></Label></dt>
            <dd className={cx('mt-0.5 font-figure text-[20px] font-bold leading-none tabular-nums', c.survival != null && c.survival < 0.2 ? 'text-v3-warn' : 'text-v3-ink')}>{nextOverall ? pct(c.survival) : '—'}</dd>
          </div>
        )}
      </dl>
      {!myTurn && <div className="mt-3"><LastsLine c={c} nextOverall={nextOverall} myTurn={myTurn} big /></div>}
      <p className="mt-3 text-[14px] font-semibold leading-[1.45] text-v3-ink">{reasonOf(c)}</p>
      {costs && <p className="mt-1 text-[13px] leading-[1.5] text-v3-ink2"><span className="font-semibold text-v3-ink">What it costs: </span>{costs}</p>}
      {myTurn && (
        <DraftButton id="v3-call-draft" rank="call" size="lg" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} label={`Draft ${surname(p.name)}`} who={p.name} className="mt-3 w-full" />
      )}
    </div>
  )
}

function Alternate({ engine, c, myTurn, canDraft, draftReason, onDraft, onOpen, queued, nextOverall }) {
  const p = c.player
  const w = survivalWord(c.survival, myTurn)
  return (
    <li className="flex min-h-[56px] items-center gap-2 border-t border-v3-rule px-3 py-2">
      <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 flex-1 items-center gap-2.5 rounded-[4px] text-left', FOCUS)}>
        <PosTag pos={p.pos} />
        <span className="min-w-0">
          <span className="block truncate font-figure text-[11px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{c.label}</span>
          <span className="block truncate text-[14px] font-bold leading-tight text-v3-ink">{p.name}</span>
          <span className="block truncate font-figure text-[12px] tabular-nums text-v3-ink2">
            <Delta value={c.vorp} className="text-[12px]" /> vs repl
            {nextOverall ? <> · <span className={w.tone}>{pct(c.survival)}</span> lasts</> : null}
          </span>
        </span>
      </button>
      <StarButton on={queued} onClick={() => engine.queueToggle(p.name)} name={p.name} className="h-11 w-9" />
      {myTurn && <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} who={p.name} className="min-h-[40px]" />}
    </li>
  )
}

/* The card itself. `compact` for the narrower rail at lg; the phone's sheet
   gets the full one. */
export function CallCard({ engine, decide, header, canDraft, draftReason, onDraft, onOpen, nextOverall, autopick, compact = false }) {
  const de = DE()
  const league = engine.league()
  const myTurn = !!header.myTurn
  const cands = decide.candidates || []
  const queued = new Set(engine.queue() || [])
  const gap = header.rightLabel === 'Your turn in' ? Number(header.rightValue) : null
  const nextCode = nextOverall && de ? de.pickCode(nextOverall, league) : null
  const band = myTurn ? `The call · ${header.code}` : nextCode ? `Your next pick · ${nextCode}` : 'No picks left'
  const aside = myTurn
    ? (autopick ? 'autopick takes it' : 'value · need · risk')
    : gap != null && Number.isFinite(gap) ? `${autopick ? 'autopick · ' : ''}in ${gap} ${gap === 1 ? 'pick' : 'picks'}` : ''

  return (
    <section aria-label="The call" data-call={myTurn ? 'on-clock' : 'waiting'} className="overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet">
      <div className="flex min-h-[38px] items-center justify-between gap-3 bg-v3-band px-4 text-white">
        <span className="min-w-0 truncate font-figure text-[12px] font-bold uppercase tracking-[0.14em]">{band}</span>
        {aside && <span className="shrink-0 font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">{aside}</span>}
      </div>
      <ClockDrain engine={engine} />
      {!cands.length ? (
        <p className="p-4 text-[14px] text-v3-ink2">Nothing left on the board worth ranking.</p>
      ) : (
        <>
          <Lead engine={engine} c={cands[0]} myTurn={myTurn} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={onOpen} queued={queued.has(cands[0].player.name)} nextOverall={nextOverall} counts={decide.counts} compact={compact} />
          {cands.length > 1 && (
            <ul aria-label="Alternatives">
              {cands.slice(1).map((c) => (
                <Alternate key={c.player.name} engine={engine} c={c} myTurn={myTurn} canDraft={canDraft} draftReason={draftReason} onDraft={onDraft} onOpen={onOpen} queued={queued.has(c.player.name)} nextOverall={nextOverall} />
              ))}
            </ul>
          )}
          {(!myTurn || autopick) && (
            <p className="border-t border-v3-rule px-4 py-2.5 text-[12px] leading-[1.45] text-v3-ink3">
              {autopick
                ? 'Autopick is on: when your pick comes round, Juke takes your queue first, then what a CPU in your seat would take.'
                : 'Not your turn. Star a player to line him up — your queue is taken first when the clock runs out or autopick is on.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/* Who is likely still on the board when you pick: the players whose board
   rank sits nearest your next pick, where the uncertainty actually lives
   (readDecide's survivors), each with survivalProbability(). */
export function Forecast({ engine, decide, nextOverall, onOpen, limit = 6 }) {
  const de = DE()
  if (!nextOverall) return null
  const rows = (decide.survivors || []).slice(0, limit)
  const code = de ? de.pickCode(nextOverall, engine.league()) : nextOverall
  return (
    <section aria-label={`Likely there at pick ${code}`} className="overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet">
      <div className="flex min-h-[38px] items-center justify-between gap-3 bg-v3-band px-4 text-white">
        <span className="font-figure text-[12px] font-bold uppercase tracking-[0.14em]">Likely there at {code}</span>
        <span className="font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">#{nextOverall}</span>
      </div>
      {!rows.length ? <p className="p-4 text-[13px] text-v3-ink2">Nobody left to forecast.</p> : (
        <ul className="p-1.5">
          {rows.map((s) => {
            const w = survivalWord(s.survival, false)
            return (
              <li key={s.player.name}>
                <button type="button" onClick={() => onOpen(s.player)} className={cx('grid min-h-[44px] w-full grid-cols-[auto_minmax(0,1fr)_minmax(48px,28%)_40px] items-center gap-2.5 rounded-[4px] px-2 text-left hover:bg-v3-paper', FOCUS)}>
                  <PosTag pos={s.player.pos} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-v3-ink">{s.player.name}</span>
                    <span className="block truncate font-figure text-[12px]"><span className={w.tone}>{w.label}</span> <span className="text-v3-ink3">·</span> <Delta value={s.vorp} className="text-[12px]" /></span>
                  </span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-v3-well" aria-hidden="true">
                    {s.survival != null && <span className="absolute inset-y-0 left-0 rounded-full bg-v3-ink2" style={{ width: `${Math.max(2, s.survival * 100)}%` }} />}
                  </span>
                  <span className="text-right font-figure text-[13px] font-bold tabular-nums text-v3-ink">{pct(s.survival)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="border-t border-v3-rule px-4 py-2 text-[12px] leading-[1.45] text-v3-ink3">Read off the market’s own spread of where each player goes — not a simulation.</p>
    </section>
  )
}

/* The room, in one strip above the pool: whether a position is running, and
   how much of the top tier is left at each. readDecide's tierLadder and run
   — positionDepthRemaining() and tierRemaining() underneath. */
export function RoomRead({ engine, decide, phone }) {
  const run = decide.run
  // For each lead position, the tier its best available player sits in and
  // how many are left in it — engine.tierRemaining() on that player. Tier
  // one reads "gone" by pick five, which is true and tells nobody anything.
  const board = engine.board() || []
  const ladder = ['QB', 'RB', 'WR', 'TE'].map((pos) => {
    const best = board.find((p) => p.pos === pos && !p.drafted && p.tier != null)
    return best ? { pos, tier: best.tier, left: engine.tierRemaining(best) } : { pos, tier: null, left: 0 }
  })
  return (
    <div className={cx('flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-v3-rule bg-v3-sheet', phone ? 'px-3 py-2.5' : 'px-4 py-2.5')} aria-label="The room">
      <span className="flex min-w-0 items-center gap-2">
        <Label className="shrink-0 text-[11px]">The room</Label>
        <span className="min-w-0 text-[13px] leading-snug text-v3-ink2">
          {run
            ? <><span className="font-bold text-v3-warn">{run.pos === 'DST' ? 'D/ST' : run.pos} run</span> — {run.count} of the last six{run.depth != null ? ` · ${run.depth} starters’ worth left` : ''}</>
            : 'No run on'}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <Label className="shrink-0 text-[11px]">Left in the best tier</Label>
        {ladder.map((t) => {
          const warn = t.tier != null && t.left <= 2
          return (
            <span key={t.pos} className="inline-flex items-center gap-1.5" title={t.tier == null ? `${t.pos}: nobody tiered left` : `${t.pos}: ${t.left} left in tier ${t.tier}, the best still available`}>
              <PosTag pos={t.pos} className="!h-[20px] !min-w-[30px] !text-[11px]" />
              <span className={cx('font-figure text-[13px] tabular-nums', t.tier == null ? 'text-v3-ink3' : warn ? 'font-bold text-v3-warn' : 'font-semibold text-v3-ink')}>
                {t.tier == null ? '—' : <>{t.left}<span className="ml-0.5 font-medium text-v3-ink3">·T{t.tier}</span></>}
              </span>
            </span>
          )
        })}
      </span>
    </div>
  )
}

/* The phone's dock: the Call under your thumb. On the clock it is Juke's
   pick and the cobalt Draft — one tap from anywhere in the room. Waiting,
   it says who is picking and how long until you are, with autopick beside
   it. Pressing the player opens the whole card as a sheet. */
export function CallDock({ engine, decide, header, canDraft, draftReason, onDraft, onOpenCall, autopick, onAutopick, nextOverall }) {
  const de = DE()
  const myTurn = !!header.myTurn
  const lead = (decide.candidates || [])[0]
  const gap = header.rightLabel === 'Your turn in' ? Number(header.rightValue) : null
  const nextCode = nextOverall && de ? de.pickCode(nextOverall, engine.league()) : null

  let body
  if (autopick) {
    body = (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Glyph name="cpu" className="h-6 w-6 shrink-0 text-v3-ink" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-v3-ink">Autopick is on</span>
          <span className="block truncate text-[13px] text-v3-ink2">Juke drafts your picks — your queue first.</span>
        </span>
        <button type="button" onClick={() => onAutopick(false)} className={cx('min-h-[44px] shrink-0 rounded-[6px] border border-v3-ink bg-v3-sheet px-4 text-[14px] font-semibold text-v3-ink', FOCUS)}>Turn off</button>
      </div>
    )
  } else if (myTurn && lead) {
    const p = lead.player
    body = (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onOpenCall} aria-haspopup="dialog" aria-label={`The call: ${p.name}. Open the call and its alternatives`} className={cx('flex min-w-0 flex-1 items-center gap-2.5 rounded-[4px] text-left', FOCUS)}>
          <Headshot src={engine.photoUrl(p)} name={p.name} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Label className="shrink-0 text-[11px] text-v3-ink">The call</Label>
              <Glyph name="chevUp" className="h-3.5 w-3.5 shrink-0 text-v3-ink2" />
            </span>
            <span className="block truncate text-[16px] font-extrabold leading-tight text-v3-ink">{p.name}</span>
            <span className="block truncate font-figure text-[12px] tabular-nums text-v3-ink3">{p.pos === 'DST' ? 'D/ST' : p.pos} · <Delta value={lead.vorp} className="text-[12px]" />{lead.survival != null ? ` · ${pct(lead.survival)} lasts` : ''}</span>
          </span>
        </button>
        <DraftButton rank="call" size="lg" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} label="Draft" who={p.name} className="min-w-[96px]" data-dock-draft />
      </div>
    )
  } else {
    body = (
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onOpenCall} aria-haspopup="dialog" aria-label="Open the forecast for your next pick" className={cx('flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left', FOCUS)}>
          <span className="min-w-0">
            <span className="block truncate font-figure text-[12px] font-bold uppercase tracking-[0.1em] text-v3-ink3">{header.code} · {header.onClockName || 'CPU'}</span>
            <span className="block truncate text-[15px] font-bold text-v3-ink">
              {nextCode ? <>You’re up {gap === 1 ? 'next' : `in ${gap}`} · <span className="font-figure tabular-nums">{nextCode}</span></> : 'No picks left for you'}
            </span>
          </span>
          <Glyph name="chevUp" className="h-4 w-4 shrink-0 text-v3-ink2" />
        </button>
        <Switch checked={autopick} onChange={onAutopick} label="Autopick" />
      </div>
    )
  }

  return (
    <div data-dock className="shrink-0 border-t border-v3-rule bg-v3-sheet" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ClockDrain engine={engine} />
      {body}
    </div>
  )
}

