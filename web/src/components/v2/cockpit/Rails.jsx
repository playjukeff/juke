import { Kicker, PosChip } from '../v2ui.jsx'
import { DE } from './cockpitData.js'
import { DraftButton, FOCUS, Headshot, InjuryTag, Panel, StarButton } from './parts.jsx'
import { IconDown, IconUp } from './icons.jsx'

/* The things you check between picks: whose picks are coming, your roster,
   your queue, and what just happened. Every name comes off engine.picks()
   and engine.teamLabel(), every seat off engine.seatedLineup() — the
   function that already decides who fills the FLEX in draft order. */

/* ---- The ribbon: the last few picks, the one on the clock, the next few ---- */
export function PickRibbon({ engine, header }) {
  const de = DE()
  if (!de || header.over) return null
  const league = engine.league()
  const picks = engine.picks() || []
  const mySlot = engine.mySlot()
  const total = league.teams * league.rounds
  const cells = []
  for (let o = Math.max(1, header.overall - 3); o <= Math.min(total, header.overall + 8); o++) {
    const made = picks[o - 1]
    const info = de.onTheClock(league, o - 1)
    const slot = made ? made.slot : info ? info.slot : null
    cells.push({ o, made, slot, code: de.pickCode(o, league), mine: slot === mySlot, current: o === header.overall })
  }
  return (
    <div className="flex h-[52px] shrink-0 items-stretch overflow-x-auto border-b border-white/[0.06] bg-v2-inset/60 [scrollbar-width:none]" aria-label="Pick order">
      {cells.map((c) => (
        <div
          key={c.o}
          aria-current={c.current ? 'step' : undefined}
          className={`relative flex min-w-[132px] shrink-0 flex-col justify-center border-r border-white/[0.05] px-3 ${c.current ? 'bg-white/[0.04]' : ''}`}
        >
          {c.mine && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-v2-cyan" aria-hidden="true" />}
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tabular-nums tracking-[0.06em]">
            <span className={c.current ? 'text-v2-ink' : 'text-v2-ink3'}>{c.code}</span>
            {c.current && <span className="text-v2-cyan">· on the clock</span>}
            {c.mine && !c.current && <span className="text-v2-cyan">· you</span>}
          </span>
          {c.made ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <PosChip pos={c.made.player.pos} className="!h-[16px] !min-w-[24px] !text-[10px]" />
              <span className="truncate text-[12px] text-v2-ink2">{engine.shortName(c.made.player)}</span>
            </span>
          ) : (
            <span className={`mt-0.5 truncate text-[12px] ${c.mine ? 'font-semibold text-v2-ink' : 'text-v2-ink2'}`}>
              {c.slot === null ? '—' : engine.teamLabel(c.slot)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---- Roster ---- */
export function RosterPanel({ engine, slot, onSlot, roster, counts, onOpen, dense }) {
  const league = engine.league()
  const mySlot = engine.mySlot()
  const mine = slot === mySlot
  const filled = roster.seats.filter((s) => s.player).length + roster.bench.filter(Boolean).length
  const size = roster.seats.length + league.bench
  const seats = []
  for (let s = 0; s < league.teams; s++) seats.push({ s, label: engine.teamLabel(s) })

  const row = (label, player, key, benched) => (
    <li key={key} className="flex min-h-[40px] items-center gap-2.5 border-b border-white/[0.04] py-1.5 last:border-b-0">
      <span className={`w-[42px] shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${benched ? 'text-v2-ink3' : 'text-v2-ink2'}`}>{label}</span>
      {player ? (
        <button type="button" onClick={() => onOpen(player)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-[6px] text-left ${FOCUS}`}>
          <PosChip pos={player.pos} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-v2-ink">{player.name}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-v2-ink3">{player.team}{player.bye ? ` · ${player.bye}` : ''}</span>
        </button>
      ) : (
        <span className="text-[12px] italic text-v2-ink3">Empty</span>
      )}
    </li>
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Kicker tone="text-v2-ink2">Roster</Kicker>
        <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{filled} of {size}</span>
      </div>
      <label className="mt-2 block">
        <span className="sr-only">Show roster for</span>
        <select
          value={slot}
          onChange={(e) => onSlot(Number(e.target.value))}
          className={`h-10 w-full rounded-[9px] bg-v2-inset px-2.5 text-[13px] text-v2-ink ring-1 ring-inset ring-white/[0.1] ${FOCUS}`}
        >
          {seats.map((x) => (
            <option key={x.s} value={x.s}>{x.s === mySlot ? `Your team · seat ${x.s + 1}` : `${x.label} · seat ${x.s + 1}`}</option>
          ))}
        </select>
      </label>
      <ul className={`mt-2 ${dense ? '' : ''}`}>
        {roster.seats.map((s, i) => row(s.slot === 'DST' ? 'D/ST' : s.slot, s.player, `s${i}`, false))}
        {roster.bench.map((p, i) => row('BN', p, `b${i}`, true))}
      </ul>
      {mine && counts && (
        <div className="mt-3">
          <Kicker>Still to fill</Kicker>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['QB', 'RB', 'WR', 'TE', 'K', 'DST'].map((pos) => {
              const c = counts[pos]
              if (!c) return null
              return (
                <span
                  key={pos}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 font-mono text-[11px] tabular-nums ring-1 ring-inset ${
                    c.short ? 'text-v2-ink ring-white/[0.14]' : 'text-v2-ink3 ring-white/[0.06]'
                  }`}
                  title={c.short ? `${c.need - c.have} more starter${c.need - c.have === 1 ? '' : 's'} to fill` : c.full ? 'At the cap for this position' : 'Starting slot filled'}
                >
                  {pos === 'DST' ? 'D/ST' : pos} {c.text}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- Queue ---- */
export function QueuePanel({ engine, board, canDraft, onDraft, onOpen, draftReason }) {
  const names = engine.queue() || []
  const players = names.map((n) => board.find((p) => p.name === n)).filter(Boolean)
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Kicker tone="text-v2-ink2">Your queue</Kicker>
        <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{players.length}</span>
      </div>
      {!players.length ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-v2-ink3">
          Star a player to line him up. When the clock runs out, or autopick is on, your queue is taken first.
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {players.map((p, i) => (
            <li key={p.name} className="flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-v2-inset px-1.5 py-1 ring-1 ring-inset ring-white/[0.05]">
              <span className="w-5 shrink-0 text-center font-mono text-[10px] tabular-nums text-v2-ink3">{i + 1}</span>
              <button type="button" onClick={() => onOpen(p)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-[6px] text-left ${FOCUS}`}>
                <PosChip pos={p.pos} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-v2-ink">{p.name}</span>
                  <span className="block font-mono text-[10px] text-v2-ink3">{p.team} · ADP {typeof p.adp === 'number' ? p.adp.toFixed(1) : '—'}</span>
                </span>
              </button>
              <span className="flex shrink-0 flex-col">
                <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => engine.queueMove(p.name, -1)} className={`grid h-5 w-7 place-items-center rounded text-v2-ink3 hover:text-v2-ink disabled:cursor-not-allowed disabled:text-white/[0.18] ${FOCUS}`}><IconUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${p.name} down`} disabled={i === players.length - 1} onClick={() => engine.queueMove(p.name, 1)} className={`grid h-5 w-7 place-items-center rounded text-v2-ink3 hover:text-v2-ink disabled:cursor-not-allowed disabled:text-white/[0.18] ${FOCUS}`}><IconDown className="h-3.5 w-3.5" /></button>
              </span>
              <StarButton on onClick={() => engine.queueToggle(p.name)} name={p.name} />
              <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ---- What just happened ---- */
export function PicksFeed({ engine, sniped, onOpen, limit = 16 }) {
  const de = DE()
  const picks = engine.picks() || []
  const league = engine.league()
  const mySlot = engine.mySlot()
  const recent = picks.slice(-limit).reverse()
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Kicker tone="text-v2-ink2">Picks</Kicker>
        <span className="font-mono text-[10px] tabular-nums text-v2-ink3">{picks.length} of {league.teams * league.rounds}</span>
      </div>
      {!recent.length ? (
        <p className="mt-2 text-[12px] text-v2-ink3">No picks yet.</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {recent.map((p) => {
            const mine = p.slot === mySlot
            const snipe = sniped && sniped.has(p.overall)
            return (
              <li key={p.overall}>
                <button
                  type="button"
                  onClick={() => onOpen(p.player)}
                  className={`relative flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left ring-1 ring-inset transition-colors hover:bg-white/[0.03] ${FOCUS} ${
                    snipe ? 'bg-v2-loss/[0.06] ring-v2-loss/25' : 'ring-transparent'
                  }`}
                >
                  {mine && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-v2-cyan" aria-hidden="true" />}
                  <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-v2-ink3">{de ? de.pickCode(p.overall, league) : p.overall}</span>
                  <Headshot src={engine.photoUrl(p.player)} name={p.player.name} pos={p.player.pos} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-v2-ink">{p.player.name}</span>
                      <InjuryTag code={p.player.inj} />
                    </span>
                    <span className="block truncate font-mono text-[10px] text-v2-ink3">
                      {p.player.pos} · {mine ? 'you' : engine.teamLabel(p.slot)}{snipe ? ' · took him off your queue' : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/* ---- Your next picks, as codes and how far away ---- */
export function NextPicks({ engine, nextPicks, picksMade }) {
  const de = DE()
  const league = engine.league()
  if (!de || !nextPicks.length) return null
  return (
    <Panel className="p-4">
      <Kicker tone="text-v2-ink2">Your next picks</Kicker>
      <ol className="mt-2 grid grid-cols-2 gap-1.5">
        {nextPicks.map((o) => (
          <li key={o} className="rounded-[10px] bg-v2-inset px-2.5 py-2 ring-1 ring-inset ring-white/[0.05]">
            <span className="block font-telemetry text-[20px] font-bold leading-none tabular-nums text-v2-ink">{de.pickCode(o, league)}</span>
            <span className="mt-1 block font-mono text-[10px] tabular-nums text-v2-ink3">
              #{o} · in {o - picksMade - 1} {o - picksMade - 1 === 1 ? 'pick' : 'picks'}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
