import { useEffect, useState } from 'react'
import { draftPhase } from '../../lib/countdown.js'

/* How long until this league drafts.

   Reported: connecting an ESPN league gives a league with ten empty
   rosters, because it has not drafted yet, and nothing on any screen said
   when it would. Both platforms publish the time and neither was read.

   ---- One component, three surfaces ----

   The You screen's league rows, the header switcher's menu, and the League
   Room's own header. All three draw the same fact about the same league, so
   a second copy of "how do we word a draft that is already running" would
   drift the first time either was touched. `variant` covers the shapes.

   ---- It ticks once a second, and only while it is on screen ----

   `setInterval` in an effect, cleared on unmount. Cheap: the work per tick
   is one subtraction and a string. The alternative — a shared clock every
   countdown subscribes to — is what you build when there are many of these
   on one screen, and there are at most a handful.

   **A phase this cannot count is not re-checked on a timer**, because
   nothing about it can change without the league being re-read: a draft
   that has completed stays completed, and a league with no scheduled time
   gets one from the next cache refresh, not from the clock. So those return
   before the interval is ever set.

   ---- What it does when it does not know ----

   `phase: 'none'` renders nothing at all. A league with no draft scheduled
   is an ordinary state — most Sleeper leagues sit that way for months — and
   an empty "DRAFT —" slot is a worse answer than no slot, which is the same
   contract KickoffPill and the score strip already keep.

   ---- 'complete' also renders nothing, and that is the point ----

   The countdown exists to explain an empty roster. Once the draft has run
   the rosters are the explanation, and a row reading "drafted" is furniture
   on every screen for the rest of the season. */

const TONE = {
  // Teal is the CTA colour and blue is state; a countdown is neither, so
  // this borrows the same mint the shell already uses for "live and fine"
  // and the rose it uses for "look at this".
  soon: 'text-mint',
  drafting: 'text-mint',
  late: 'text-flow-rose',
}

export default function DraftCountdown({ league, variant = 'row', className = '' }) {
  const at = league && league.draftAt
  const status = league && league.draftStatus

  const [state, setState] = useState(() => draftPhase(at, status))

  useEffect(() => {
    const next = draftPhase(at, status)
    setState(next)
    // Nothing that ticks can change these, so no timer is started for them.
    if (next.phase !== 'soon') return

    const id = setInterval(() => setState(draftPhase(at, status)), 1000)
    return () => clearInterval(id)
  }, [at, status])

  if (state.phase === 'none' || state.phase === 'complete') return null

  const label =
    state.phase === 'drafting' ? 'DRAFTING NOW'
    : state.phase === 'late' ? 'DRAFT TIME PASSED'
    : 'DRAFTS IN'

  const tone = TONE[state.phase] || 'text-voidInk-body'

  /* `chip` is the switcher menu and My League's own banner
     (myleague/StandingsPanel.jsx) — a bordered pill that has to survive
     sitting beside other chips. `row` is the You screen, where it is one
     more line of metadata under a league name and a border would be the
     only box on that row. */
  /* Seconds in BOTH forms, which is not what KickoffPill does.

     That pill drops them below `sm` for a measured reason — it shares the
     hero's eyebrow row at 375px and the pair overflowed by nine pixels.
     Neither of these surfaces has that constraint: the menu row and My
     League's own banner are both full-width blocks with the countdown on a
     line of its own.

     And the reason to keep them is the one KickoffPill was reported for:
     `3D 06:21` changes once a minute and reads as frozen. A menu is open
     for seconds so it hardly matters there, but My League's banner sits on
     screen for as long as somebody is looking at their league — and a
     countdown that never visibly moves is not a live countdown, which is
     the whole of what was asked for. */
  if (variant === 'chip') {
    return (
      <span
        className={
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ' +
          'border border-flow-pillEdge px-2 py-[3px] font-mono text-[10px] leading-none ' +
          'tracking-[0.1em] ' + tone + ' ' + className
        }
      >
        {/* The label and the value are one text node per variant rather than
            two spans, for the reason KickoffPill records: a flex container
            drops the whitespace in an anonymous text item, and that shipped
            "KICKOFF5D 10:04:59" to production once already. */}
        {state.parts ? `${label} ${state.parts.full}` : label}
      </span>
    )
  }

  return (
    <span
      className={
        'inline-flex items-center whitespace-nowrap font-mono text-[11px] ' +
        'tracking-[0.1em] ' + tone + ' ' + className
      }
    >
      {state.parts ? `${label} ${state.parts.full}` : label}
    </span>
  )
}
