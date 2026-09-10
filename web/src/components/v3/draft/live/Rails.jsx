import { DE } from '../../../v2/cockpit/cockpitData.js'
import { Delta, Label, PosTag, Sheet, cx } from '../../ui.jsx'
import { DraftButton, FOCUS, Glyph, Headshot, InjuryTag, StarButton } from '../kit.jsx'

/* The blocks you check between picks — Juke's pick, your roster, your queue,
   your next picks and what just happened. Every name comes off
   engine.picks() and engine.teamLabel(), every seat off
   engine.seatedLineup() (the function that already decides who fills the
   FLEX in draft order), every "who Juke would take" off suggestions('ALL'),
   never the position chip — a filter is a lens, never a decision. */

/* The call, at the head of the pool: Juke's pick with its reason printed
   beside it. When it is your turn its Draft button is the view's one cobalt
   action; when it is not, it says what Juke would take now. */
export function JukesPick({ engine, header, canDraft, draftReason, onDraft, onOpen, nextOverall, phone }) {
  if (header.over) return null
  const top = engine.suggestions('ALL')[0]
  if (!top) return null
  const vorp = engine.replacementGap(top)
  const survival = engine.survivalProbability(top, nextOverall)
  const juke = engine.overallScore(top)
  return (
    <section aria-label="Juke's pick" className="shrink-0 border-b border-v3-rule bg-v3-sheet">
      <div className="flex min-h-[32px] items-center justify-between gap-3 bg-v3-band px-4 text-white">
        <span className="font-figure text-[11px] font-bold uppercase tracking-[0.14em]">{header.myTurn ? `The call · pick ${header.code}` : 'Juke would take'}</span>
        <span className="truncate font-figure text-[11px] uppercase tracking-[0.1em] text-v3-bandInk">Value · need · risk</span>
      </div>
      <div className={cx('flex items-center gap-3', phone ? 'px-3 py-2.5' : 'px-4 py-3')}>
        <button type="button" onClick={() => onOpen(top)} className={cx('flex min-w-0 flex-1 items-center gap-3 rounded-[4px] text-left', FOCUS)}>
          <Headshot src={engine.photoUrl(top)} name={top.name} size={phone ? 36 : 40} />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[16px] font-extrabold tracking-[-0.01em] text-v3-ink">{top.name}</span>
              <PosTag pos={top.pos} />
              <InjuryTag code={top.inj} />
            </span>
            <span className="mt-0.5 block truncate font-figure text-[12px] tabular-nums text-v3-ink2">
              <Delta value={vorp} /> over replacement{juke != null ? ` · Juke ${Math.round(juke)}` : ''}
              {survival != null && nextOverall ? ` · ${Math.round(survival * 100)}% still there at pick ${nextOverall}` : ''}
            </span>
          </span>
        </button>
        {header.myTurn && (
          <DraftButton rank="call" size={phone ? 'md' : 'lg'} disabled={!canDraft} reason={draftReason} onClick={() => onDraft(top)} label={phone ? 'Draft' : `Draft ${top.name.split(' ').slice(-1)[0]}`} />
        )}
      </div>
    </section>
  )
}

export function RosterPanel({ engine, slot, onSlot, roster, counts, onOpen }) {
  const league = engine.league()
  const mySlot = engine.mySlot()
  const mine = slot === mySlot
  const filled = roster.seats.filter((s) => s.player).length + roster.bench.filter(Boolean).length
  const size = roster.seats.length + league.bench
  const row = (label, player, key, benched) => (
    <li key={key} className="flex min-h-[40px] items-center gap-2.5 border-b border-v3-rule py-1.5 last:border-b-0">
      <span className={cx('w-[40px] shrink-0 font-figure text-[11px] font-bold uppercase tracking-[0.06em]', benched ? 'text-v3-ink3' : 'text-v3-ink')}>{label}</span>
      {player ? (
        <button type="button" onClick={() => onOpen(player)} className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left', FOCUS)}>
          <PosTag pos={player.pos} />
          <span className="min-w-0 flex-1 truncate text-[14px] text-v3-ink">{player.name}</span>
          <span className="shrink-0 font-figure text-[11px] tabular-nums text-v3-ink3">{player.team}{player.bye ? ` · ${player.bye}` : ''}</span>
        </button>
      ) : <span className="text-[13px] text-v3-ink3">Empty</span>}
    </li>
  )
  return (
    <Sheet code={mine ? 'Your roster' : 'Roster'} aside={`${filled} of ${size}`} bodyClass="p-3">
      <label className="block">
        <span className="sr-only">Show roster for</span>
        <select value={slot} onChange={(e) => onSlot(Number(e.target.value))} className={cx('h-10 w-full rounded-[4px] border border-v3-rule bg-v3-sheet px-2.5 text-[16px] text-v3-ink sm:text-[14px]', FOCUS)}>
          {Array.from({ length: league.teams }, (_, s) => (
            <option key={s} value={s}>{s === mySlot ? `Your team · seat ${s + 1}` : `${engine.teamLabel(s)} · seat ${s + 1}`}</option>
          ))}
        </select>
      </label>
      <ul className="mt-2">
        {roster.seats.map((s, i) => row(s.slot === 'DST' ? 'D/ST' : s.slot, s.player, `s${i}`, false))}
        {roster.bench.map((p, i) => row('BN', p, `b${i}`, true))}
      </ul>
      {mine && counts && (
        <div className="mt-3 border-t border-v3-rule pt-3">
          <Label className="text-[11px]">Still to fill</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['QB', 'RB', 'WR', 'TE', 'K', 'DST'].map((pos) => {
              const c = counts[pos]
              if (!c) return null
              return (
                <span key={pos} title={c.short ? `${c.need - c.have} more starter${c.need - c.have === 1 ? '' : 's'} to fill` : c.full ? 'At the cap for this position' : 'Starting slot filled'} className={cx('inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-figure text-[12px] tabular-nums', c.short ? 'border-v3-ink font-bold text-v3-ink' : 'border-v3-rule text-v3-ink3')}>
                  {pos === 'DST' ? 'D/ST' : pos} {c.text}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </Sheet>
  )
}

export function QueuePanel({ engine, board, canDraft, onDraft, onOpen, draftReason }) {
  const names = engine.queue() || []
  const players = names.map((n) => board.find((p) => p.name === n)).filter(Boolean)
  return (
    <Sheet code="Your queue" aside={String(players.length)} bodyClass="p-3">
      {!players.length ? (
        <p className="text-[13px] leading-[1.5] text-v3-ink2">Star a player to line him up. When the clock runs out, or autopick is on, your queue is taken first.</p>
      ) : (
        <ol className="space-y-1">
          {players.map((p, i) => (
            <li key={p.name} className="flex min-h-[44px] items-center gap-1 rounded-[4px] bg-v3-paper px-1 py-1">
              <span className="w-5 shrink-0 text-center font-figure text-[11px] tabular-nums text-v3-ink3">{i + 1}</span>
              <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left', FOCUS)}>
                <PosTag pos={p.pos} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-v3-ink">{p.name}</span>
                  <span className="block font-figure text-[11px] text-v3-ink3">{p.team} · ADP {typeof p.adp === 'number' ? p.adp.toFixed(1) : '—'}</span>
                </span>
              </button>
              <span className="flex shrink-0 flex-col">
                <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => engine.queueMove(p.name, -1)} className={cx('grid h-5 w-7 place-items-center rounded text-v3-ink2 hover:text-v3-ink disabled:cursor-not-allowed disabled:text-v3-rule', FOCUS)}><Glyph name="up" className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${p.name} down`} disabled={i === players.length - 1} onClick={() => engine.queueMove(p.name, 1)} className={cx('grid h-5 w-7 place-items-center rounded text-v3-ink2 hover:text-v3-ink disabled:cursor-not-allowed disabled:text-v3-rule', FOCUS)}><Glyph name="down" className="h-3.5 w-3.5" /></button>
              </span>
              <StarButton on onClick={() => engine.queueToggle(p.name)} name={p.name} className="h-10 w-8" />
              <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} />
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}

export function PicksFeed({ engine, sniped, onOpen, limit = 16 }) {
  const de = DE()
  const picks = engine.picks() || []
  const league = engine.league()
  const mySlot = engine.mySlot()
  const recent = picks.slice(-limit).reverse()
  return (
    <Sheet code="Recent picks" aside={`${picks.length} of ${league.teams * league.rounds}`} bodyClass="p-2">
      {!recent.length ? <p className="p-2 text-[13px] text-v3-ink2">No picks yet.</p> : (
        <ol className="space-y-0.5">
          {recent.map((p) => {
            const mine = p.slot === mySlot
            const snipe = sniped && sniped.has(p.overall)
            return (
              <li key={p.overall}>
                <button type="button" onClick={() => onOpen(p.player)} className={cx('relative flex min-h-[44px] w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left hover:bg-v3-paper', FOCUS, snipe && 'bg-v3-warnWash')}>
                  {mine && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-v3-ink" aria-hidden="true" />}
                  <span className="w-10 shrink-0 font-figure text-[11px] font-bold tabular-nums text-v3-ink3">{de ? de.pickCode(p.overall, league) : p.overall}</span>
                  <Headshot src={engine.photoUrl(p.player)} name={p.player.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="truncate text-[13px] font-semibold text-v3-ink">{p.player.name}</span><InjuryTag code={p.player.inj} /></span>
                    <span className="block truncate font-figure text-[11px] text-v3-ink2">{p.player.pos === 'DST' ? 'D/ST' : p.player.pos} · {mine ? 'you' : engine.teamLabel(p.slot)}{snipe ? ' · took him off your queue' : ''}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </Sheet>
  )
}

export function NextPicks({ engine, nextPicks, picksMade }) {
  const de = DE()
  const league = engine.league()
  if (!de) return null
  return (
    <Sheet code="Your next picks" aside={nextPicks.length ? 'if you wait' : 'none left'} bodyClass="p-3">
      {!nextPicks.length ? <p className="text-[13px] text-v3-ink2">You have no pick left in this draft.</p> : (
        <ol className="grid grid-cols-2 gap-1.5">
          {nextPicks.map((o) => (
            <li key={o} className="rounded-[4px] bg-v3-paper px-2.5 py-2">
              <span className="block font-figure text-[20px] font-bold leading-none tabular-nums text-v3-ink">{de.pickCode(o, league)}</span>
              <span className="mt-1 block font-figure text-[11px] tabular-nums text-v3-ink2">#{o} · in {o - picksMade - 1} {o - picksMade - 1 === 1 ? 'pick' : 'picks'}</span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  )
}
