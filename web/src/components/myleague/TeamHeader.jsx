/* The team identity strip under the week strip — avatar, name, and (when
   there is one to show) this week's matchup. Demo-only for now: a real
   connected league has no opponent-for-this-week data in any snapshot
   either adapter returns (confirmed against both), so MyLeagueScreen does
   not render this component for a real league at all rather than render
   it with the matchup pill missing — the pill is the reason this exists,
   and a component that only sometimes has a reason to be on screen is the
   dead-control shape by another name. */
export default function TeamHeader({ teamName, meta, matchupLabel, opponent, winProb }) {
  const initial = (teamName || '?').slice(0, 1).toUpperCase()
  return (
    <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl font-display text-[18px] font-extrabold text-surface-page"
          style={{ background: '#00E5FF' }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[22px] font-bold leading-none text-white">
            {teamName}
          </span>
          {meta ? <span className="mt-1 block truncate text-[13px] text-ink-muted">{meta}</span> : null}
        </span>
      </div>
      {opponent ? (
        <div className="shrink-0 rounded-full border border-line-hairline px-3.5 py-[7px] text-[12px] text-voidInk-body">
          <span className="text-ink-muted">{matchupLabel} </span>
          <span className="font-semibold text-white">vs {opponent}</span>
          {winProb ? <span className="ml-1.5 text-mint">{winProb}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
