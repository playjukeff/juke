import { useState } from 'react'
import { ordered, hasPlayed } from '../../../lib/standings.js'
import { oddsFor } from '../../../lib/seasonSim.js'
import { Kicker, PosChip } from '../v2ui.jsx'
import { CARD, Chevron, pct } from './parts.jsx'

/* The league table, as a telemetry list.

   Order is lib/standings.js's ordered() — wins, then points for — and the
   rank is a dash until somebody has played (hasPlayed()), because before
   week one every sort key is 0 and a numbered list would be the order the
   platform returned its teams in. The playoff column is the same ten
   thousand seasons the headline card reads, one row per team, so the
   table and the card cannot disagree. Every row opens its roster in place,
   lineup order first, then the bench. */

function Roster({ team, byId }) {
  const starting = new Set((team.starters || []).map(String))
  const ids = [
    ...(team.starters || []),
    ...(team.players || []).filter((id) => !starting.has(String(id))),
  ]
  if (!ids.length) {
    return <p className="px-4 pb-4 text-[13px] text-v2-ink3">No roster yet — this league has not drafted.</p>
  }
  return (
    <ul className="grid grid-cols-1 gap-x-6 px-3 pb-4 sm:grid-cols-2 sm:px-4">
      {ids.map((id, n) => {
        const p = byId.get(String(id))
        const bench = !starting.has(String(id))
        return (
          <li key={String(id) + n} className="flex min-w-0 items-center gap-2.5 border-b border-white/[0.04] py-1.5">
            <span className="w-[30px] shrink-0">
              {bench ? (
                <span className="inline-grid h-[20px] min-w-[30px] place-items-center rounded-[5px] bg-white/[0.03] font-mono text-[10px] font-semibold text-v2-ink3 ring-1 ring-inset ring-white/[0.07]">BN</span>
              ) : p ? <PosChip pos={p.pos} /> : <span className="font-mono text-[10px] text-v2-ink3">—</span>}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${bench ? 'text-v2-ink2' : 'text-v2-ink'}`}>
              {p ? p.name : String(id)}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">
              {p ? `${bench ? p.pos + ' · ' : ''}${p.team || ''}` : 'Not on the board'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const COLS = 'grid-cols-[26px_minmax(0,1fr)_48px_58px_16px] sm:grid-cols-[30px_minmax(0,1fr)_56px_72px_72px_minmax(96px,150px)_16px]'

export default function Standings({ snapshot, ownerId, odds, byId }) {
  const [openTeam, setOpenTeam] = useState(null)
  const table = ordered(snapshot.teams || [])
  const played = hasPlayed(table)
  const cut = played && snapshot.playoffTeams && snapshot.playoffTeams < table.length ? snapshot.playoffTeams : null
  const hasOdds = !!(odds && odds.playoffTeams)

  return (
    <section aria-labelledby="v2-standings" className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.06] px-4 pb-3 pt-4 sm:px-5">
        <div>
          <Kicker>Standings</Kicker>
          <h2 id="v2-standings" className="mt-1 font-telemetry text-[26px] font-bold uppercase italic leading-none text-v2-ink">The table</h2>
        </div>
        <p className="max-w-[46ch] text-[12px] leading-[1.45] text-v2-ink3">
          Wins, then points for — Juke&apos;s tiebreak, which a league with its own may not share.
          {hasOdds ? ' Playoff column: 10,000 seasons from today’s projections.' : ''}
        </p>
      </div>

      <div className={`grid ${COLS} items-center gap-x-3 px-4 py-2 sm:px-5`} aria-hidden="true">
        <Kicker>#</Kicker>
        <Kicker>Team</Kicker>
        <Kicker className="text-right">W-L</Kicker>
        <Kicker className="text-right">PF</Kicker>
        <Kicker className="hidden text-right sm:block">PA</Kicker>
        <Kicker className="hidden sm:block">{hasOdds ? 'Playoffs' : ''}</Kicker>
        <span />
      </div>

      <ol>
        {table.map((t, i) => {
          const you = ownerId && t.ownerId === ownerId
          const open = openTeam === t.ownerId
          const mine = hasOdds ? oddsFor(odds, t.ownerId) : null
          const p = mine ? mine.playoffs : null
          return (
            <li key={t.rosterId ?? `${t.teamName}-${i}`} className="border-t border-white/[0.05]">
              {cut && i === cut ? (
                <div className="flex items-center gap-2 px-4 py-1 sm:px-5" aria-hidden="true">
                  <span className="h-px flex-1 border-t border-dashed border-v2-cyan/40" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-v2-cyan">Playoff line · top {cut} today</span>
                  <span className="h-px flex-1 border-t border-dashed border-v2-cyan/40" />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setOpenTeam(open ? null : t.ownerId)}
                aria-expanded={open}
                className={`grid w-full ${COLS} items-center gap-x-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt sm:px-5 ${you ? 'bg-v2-cyan/[0.05] shadow-[inset_3px_0_0_#22D3EE]' : ''}`}
              >
                <span className="font-mono text-[13px] tabular-nums text-v2-ink2">{played ? i + 1 : '—'}</span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-v2-ink">{t.teamName}</span>
                    {you ? (
                      <span className="shrink-0 rounded-[5px] bg-v2-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-v2-cyan ring-1 ring-inset ring-v2-cyan/30">You</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[12px] text-v2-ink3">
                    {hasOdds ? <span className="shrink-0 font-mono tabular-nums text-v2-ink2 sm:hidden">{pct(p)} playoffs</span> : null}
                    {hasOdds && t.manager && t.manager !== t.teamName ? <span className="sm:hidden" aria-hidden="true">·</span> : null}
                    <span className="min-w-0 truncate">{t.manager && t.manager !== t.teamName ? t.manager : ' '}</span>
                  </span>
                </span>
                <span className="text-right font-mono text-[13px] tabular-nums text-v2-ink">
                  {t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}
                </span>
                <span className="text-right font-mono text-[13px] tabular-nums text-v2-ink2">{(t.pointsFor || 0).toFixed(1)}</span>
                <span className="hidden text-right font-mono text-[13px] tabular-nums text-v2-ink2 sm:block">{(t.pointsAgainst || 0).toFixed(1)}</span>
                <span className="hidden items-center gap-2 sm:flex">
                  {hasOdds ? (
                    <>
                      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${typeof p === 'number' ? Math.max(p * 100, p > 0 ? 2 : 0) : 0}%` }} />
                      </span>
                      <span className="w-[34px] shrink-0 text-right font-mono text-[12px] tabular-nums text-v2-ink">{pct(p)}</span>
                    </>
                  ) : null}
                </span>
                <Chevron open={open} className="h-4 w-4 text-v2-ink3" />
              </button>
              {open ? (
                <div className="bg-v2-inset/60">
                  <div className="px-4 pb-1 pt-2 sm:px-5"><Kicker>{t.teamName} · roster</Kicker></div>
                  <Roster team={t} byId={byId} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
