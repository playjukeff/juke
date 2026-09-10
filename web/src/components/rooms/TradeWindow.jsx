import { useEffect, useState } from 'react'
import { countdownParts } from '../../lib/countdown.js'
import { tradeWindow, msUntilDeadline } from '../../lib/tradeDeadline.js'

/* Whether this league is still trading, drawn at the top of the Trade Room.
 *
 * Screen 14 of the decision guide is "Trade · deadline passed", and it asks
 * for "what the missed trades cost — one bar per missed offer". **That half
 * is not built and cannot be**: nothing in this project records a trade
 * offer. Neither adapter reports a pending one (both need write-scoped auth
 * Juke deliberately does not hold), and the transaction feed carries trades
 * that were EXECUTED — a missed offer is by construction the one thing no
 * feed here can see.
 *
 * So this is the reachable half, and it is the half that was actually
 * blocked: until 9 September 2026 the room had no idea a deadline existed at
 * all. What ships is the window's own state, which a reader can act on while
 * it is open and needs explaining once it is shut.
 *
 * That split is the same one screens 05 and 07 already took — ship the part
 * the data supports, name the part it does not, and do not fill a confident
 * surface with a number nobody computed.
 *
 * ---- It fails by disappearing ----
 *
 * `unknown` draws nothing. A room that cannot find out whether trading is
 * open must not say either "open" or "shut", and a banner reading "we could
 * not tell" on every Sleeper league before week one is furniture. The score
 * strip's contract, applied to the one other thing that reads a deadline.
 */

/* Ticks only while there is something counting down, and only to the minute.
 *
 * A trade deadline is days away for most of a season, so a per-second tick
 * would re-render the whole room 86,400 times to move a digit nobody is
 * watching. That is the opposite trade from the draft countdown, which ticks
 * per second BECAUSE a reader stares at it in its last hour — see the
 * countdown section's own note on why the kickoff pill differs.
 *
 * The banner prints the date beside the countdown for exactly that reason:
 * the precise moment is the fact, and the countdown is the gloss. */
function useMinuteTick(active) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => bump((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [active])
}

/* The instant, in the reader's own zone.
 *
 * `toLocaleString` rather than a hand-rolled format: a deadline is a wall
 * clock time somebody has to be awake for, and ESPN's value is UTC. A league
 * closing at "5:00pm" is closing at 5pm where the manager is, and printing
 * the UTC hour would be a right number in the wrong zone -- this file's own
 * recurring failure, with a timezone instead of a column. */
function whenText(at) {
  try {
    return new Date(at).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    // An unformattable date is not worth taking the banner down for.
    return null
  }
}

export default function TradeWindow({ snapshot }) {
  const deadline = (snapshot && snapshot.tradeDeadline) || null
  const week = snapshot && snapshot.week
  const w = tradeWindow(deadline, { week })
  useMinuteTick(w.state === 'open' && w.at !== null)

  if (w.state === 'unknown') return null

  if (w.state === 'disabled') {
    return (
      <Banner tone="neutral">
        <b className="font-semibold text-ink">This league does not trade.</b>{' '}
        Its settings have trading switched off, so nothing built here can be sent.
      </Banner>
    )
  }

  if (w.state === 'passed') {
    return (
      <Banner tone="cost">
        <b className="font-semibold text-cost">The trade deadline has passed.</b>{' '}
        {w.at !== null
          ? `It closed ${whenText(w.at) || 'earlier this season'}.`
          : `It closed after week ${w.week}.`}{' '}
        {/* What the room can still do, said plainly rather than left to be
            discovered by pressing things. Every price below is still real —
            a roster is worth what it is worth whether or not the window is
            open — and a reader closing out a season is exactly the person
            who wants to know that. */}
        Your roster is still priced below, and nothing here can be sent.
      </Banner>
    )
  }

  // Open. An instant can count down; a week number cannot become a duration
  // without the week-boundary table nobody has, so it says the week instead.
  const left = w.at !== null ? countdownParts(msUntilDeadline(deadline)) : null
  return (
    <Banner tone="neutral">
      <b className="font-semibold text-ink">Trading is open.</b>{' '}
      {left ? (
        <>
          It closes in <span className="font-plex text-ink">{left.compact}</span>
          {whenText(w.at) ? ` — ${whenText(w.at)}.` : '.'}
        </>
      ) : w.week !== null ? (
        <>It closes after week {w.week}.</>
      ) : (
        // Open with an instant that has no formattable date and no week:
        // reachable only from a malformed feed, and it still says the true
        // half rather than inventing the rest.
        <>The deadline has not passed.</>
      )}
    </Banner>
  )
}

/* One shell for all three, so the states cannot drift apart in padding the
   way three hand-built divs would. `cost` gets the rule down its left edge —
   the same 3px `cost.deep` mark a KPI card uses, which answers to 1.4.11's
   3:1 rather than to 4.5 because it is a mark and never type. */
function Banner({ tone, children }) {
  return (
    <div
      className={
        'mb-5 rounded-[12px] border border-line-hairline bg-surface-card px-4 py-3 ' +
        'text-meta leading-relaxed text-voidInk-body ' +
        (tone === 'cost' ? 'border-l-[3px] border-l-cost-deep' : '')
      }
      data-trade-window={tone}
    >
      {children}
    </div>
  )
}
