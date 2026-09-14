import { useState } from 'react'
import { useSignedIn } from '../../hooks/useAuthState.js'
import { readLocker } from './v2data.js'
import { Arrow, Kicker, PosChip, Skeleton, VoltButton, useV2Data } from './v2ui.jsx'

/* The locker, as a dense analyst table.

   Paged at 20 with "Show N more", which is the rule the live archive
   already learned ("the locker grew forever"): a list with two hundred
   possible rows needs an end, and the button says what the press does.
   Each row opens its frozen report through #/rooms/draft?report=<id> —
   the same hash channel the live archive uses, so there is one report
   path and not two. */

const PAGE = 20

function FinishBar({ rank, teams }) {
  if (!rank || !teams) return <span className="text-v2-ink3">—</span>
  // Share of the room you finished ahead of — first of ten is 90%, the
  // last is 0 — so a longer bar is always better whatever the league size.
  const pct = teams > 1 ? ((teams - rank) / (teams - 1)) * 100 : 100
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <span className="absolute inset-y-0 left-0 rounded-full bg-v2-cyan/80" style={{ width: `${Math.max(3, pct)}%` }} />
    </span>
  )
}

export default function V2DraftsPage() {
  const locker = useV2Data(readLocker)
  const signedIn = useSignedIn()
  const [shown, setShown] = useState(PAGE)

  const list = locker ? locker.list : []
  const rows = list.slice(0, shown)
  const remaining = list.length - rows.length

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <Kicker tone="text-v2-ink2">Your locker</Kicker>
          <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
            Every draft, graded.
          </h1>
          <p className="mt-4 text-[16px] leading-[1.55] text-v2-ink2">
            {signedIn
              ? 'Synced to your account — every device you sign in on sees the same list.'
              : 'Saved in this browser. Create a free account and they follow you to every device.'}
          </p>
        </div>
        <VoltButton href="#/v2/draft">Start a mock draft <Arrow /></VoltButton>
      </div>

      {locker && (
        <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Drafts', locker.count],
            ['Best finish', locker.best ? `${locker.best.grade} · ${locker.best.projectedRank}` : '—'],
            ['Last draft', locker.last ? locker.last.dateCompleted : '—'],
            ['Formats run', new Set(list.map((e) => e.leagueType)).size || '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[14px] bg-v2-panel p-4 ring-1 ring-inset ring-white/[0.07]">
              <dt><Kicker>{k}</Kicker></dt>
              <dd className="mt-2 truncate font-telemetry text-[32px] font-bold leading-none text-v2-ink tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6 overflow-hidden rounded-[18px] bg-v2-panel ring-1 ring-inset ring-white/[0.07]">
        {!locker ? (
          <div className="p-6"><Skeleton lines={6} /></div>
        ) : !list.length ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="font-telemetry text-[28px] font-bold uppercase italic text-v2-ink">Your first mock lands here</span>
            <p className="max-w-[46ch] text-[14px] leading-[1.55] text-v2-ink2">
              Run one against tonight&apos;s board and it is graded the moment it ends — letter, finishing
              position, and the four parts that add up to it.
            </p>
            <VoltButton href="#/v2/draft" size="md">Start a mock draft <Arrow /></VoltButton>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse bg-v2-panel text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    {['Date', 'Format', 'Seat', 'Finish', '', 'Round 1', 'Starter value', ''].map((h, i) => (
                      <th key={i} scope="col" className="px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-ink3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.025]">
                      <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-v2-ink2">{e.dateCompleted}</td>
                      <td className="px-4 py-3 text-[13px] text-v2-ink">{e.leagueType}</td>
                      <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-v2-ink2">{e.seat}</td>
                      <td className="px-4 py-3">
                        <span className="font-telemetry text-[22px] font-bold italic leading-none text-v2-ink">{e.grade || '—'}</span>
                        <span className="ml-2 font-mono text-[11px] tabular-nums text-v2-ink3">{e.rank ? `${e.projectedRank} of ${e.teams}` : ''}</span>
                      </td>
                      <td className="w-[120px] px-4 py-3"><FinishBar rank={e.rank} teams={e.teams} /></td>
                      <td className="px-4 py-3">
                        {e.round1Pick ? (
                          <span className="flex items-center gap-2">
                            {e.round1PickPos && <PosChip pos={e.round1PickPos} />}
                            <span className="truncate text-[13px] text-v2-ink">{e.round1Pick}</span>
                          </span>
                        ) : <span className="text-v2-ink3">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-v2-ink">
                        {e.rosterVorp === null ? '—' : `${e.rosterVorp > 0 ? '+' : ''}${Math.round(e.rosterVorp)}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a href={`#/v2/draft/report?id=${encodeURIComponent(e.id)}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-v2-ink2 hover:text-v2-ink">
                          Report <Arrow className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-mono text-[11px] tabular-nums text-v2-ink3">Showing {rows.length} of {list.length}</span>
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
                >
                  Show {Math.min(PAGE, remaining)} more
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
