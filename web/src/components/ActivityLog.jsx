// Extracted out of DraftLogDock for the same reason QueueList was — see
// DraftLogDock.jsx's comment on the two wrappers around one set of tabs.
export default function ActivityLog({ picks, engine, DE, league, sniped }) {
  if (picks.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-ink-muted">No picks yet.</p>
  }

  return picks.map((pick) => {
    const code = DE ? DE.pickCode(pick.overall, league) : pick.overall
    return (
      /* Somebody taking a player off your queue is the one line in this
         log that is about YOU, and it read exactly like the other nine.

         Said in words rather than left to a tint: a draft log is read in a
         glance, and a colour is a signal that only gets learned after it
         has already mattered once. The rail and the wash are the peripheral
         half; "was on your queue" is the half that needs no learning.

         DraftRoom computes `sniped` -- it cannot be derived here, because
         pruneQueue() drops the player the moment the pick lands. */
      <p
        key={pick.overall}
        className={
          'mb-1.5 rounded-md px-1 text-xs leading-relaxed ' +
          (sniped && sniped.has(pick.overall)
            ? 'border-l-2 border-l-cost bg-cost/[0.07] pl-1.5 text-white/75'
            : 'text-white/60')
        }
      >
        <span className="text-ink-muted">{code}</span>{' '}
        <span className="font-medium text-white/80">{engine.teamLabel(pick.slot)}</span> took{' '}
        <span className="text-white/90">{pick.player.name}</span>{' '}
        <span className="text-ink-muted">({pick.player.pos})</span>
        {sniped && sniped.has(pick.overall) ? (
          <span className="text-cost"> — was on your queue</span>
        ) : null}
      </p>
    )
  })
}
