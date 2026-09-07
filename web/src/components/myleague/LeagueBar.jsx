import LeagueSwitcher from '../shell/LeagueSwitcher.jsx'
import { platformFor } from '../shell/leaguePlatforms.js'
import { seasonPhase } from '../../lib/seasonPhase.js'
import { ordered } from './StandingsPanel.jsx'

const PHASE_LABEL = { draft: 'DRAFT', 'in-season': 'IN SEASON' }

function ordinal(n) {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
}

/* My League's sticky bar. Reuses <LeagueSwitcher/> outright on desktop
   rather than drawing a second "which league" control — that component
   is already the one place this app switches leagues, and a bar whose
   whole job is showing which league you are looking at is exactly where
   it belongs. Below `sm`, where LeagueSwitcher is intentionally absent
   (see its own file), a plain read-only badge stands in — switching leagues
   on a phone is the You screen's job, same split the header already makes.

   Phase/record/standing render only once the snapshot has landed
   (`snapStatus === 'ready'`), rather than as a placeholder — a bar
   guessing "0-0" for a second reads as a real, wrong answer, and this
   project has a standing rule against that. */
export default function LeagueBar({ league, snapshot, snapStatus }) {
  const ready = snapStatus === 'ready' && !!snapshot
  const table = ready ? ordered(snapshot.teams) : []
  const mine = ready && league.ownerId ? table.find((t) => t.ownerId === league.ownerId) : null
  const rank = mine ? table.indexOf(mine) + 1 : null
  const phase = ready ? seasonPhase(snapshot) : 'unknown'
  const platform = platformFor(league.provider)

  return (
    <div className="sticky top-[57px] z-20 border-b border-line-hairline bg-surface-page/95 backdrop-blur-md sm:top-[68px]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-5 py-2.5 sm:px-10">
        <div className="hidden sm:block">
          <LeagueSwitcher />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:hidden">
          <span
            className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded font-display text-[11px] font-extrabold text-surface-page"
            style={{ background: '#00E5FF' }}
          >
            {platform.mark}
          </span>
          <span className="truncate text-[13px] font-semibold text-voidInk-primary">{league.name}</span>
        </div>

        {phase !== 'unknown' ? (
          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-ink-muted">
            <span>{PHASE_LABEL[phase]}</span>
            {mine ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-voidInk-primary">
                  {mine.wins}-{mine.losses}
                  {mine.ties ? `-${mine.ties}` : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {rank}
                  {ordinal(rank)} of {table.length}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
