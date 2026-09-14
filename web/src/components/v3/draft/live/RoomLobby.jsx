import { useEffect, useRef, useState } from 'react'
import { CallButton, Headline, Icon, Label, QuietButton, Sheet, cx } from '../../ui.jsx'
import { FOCUS, Glyph, Problem } from '../kit.jsx'
import { inviteUrl, leaveRoom, sendBlocker, startBlocker } from './room.js'

/* The lobby: the room before it is a draft.

   Four things happen here and nothing else does. Copy the invite. Take a
   chair. Put the chairs in draft order, if the room is yours. Start it, if
   the room is yours.

   ---- Every one of them is an intent ----

   claimSeat, swapSeats and start are messages (live.js), the room decides,
   and this screen redraws from the broadcast that follows. Nothing below
   writes a seat, a name or a status locally and hopes: a refused swap is
   corrected by the next state, which is the only thing all ten managers see.

   ---- A control that cannot act is not offered ----

   Draft order is the HOST'S and only while the room is still filling up —
   once a pick exists the snake order is what those picks MEAN, so moving a
   chair would rewrite whose they were (room.js refuses it, and this does not
   draw it). Start is the host's for the same reason it is in room.js: the
   nine other managers never press it at all, and the transition off this
   screen hangs off the broadcast rather than off the button.

   ---- Tap two, rather than drag ----

   HTML5 drag and drop does not exist on touch, and the host is very often on
   a phone. Tap a chair, tap the one to swap it with — the same two-step the
   classic lobby settled on, and the same swapSeats(a, b) underneath: two
   indices, never a member id, because a client is never told anybody else's
   and "move Blake to seat 3" would have to name Blake. */

function Seat({ chair, index, held, canOrder, canClaim, onClaim, onHold, hostSeat }) {
  const who = chair.you ? 'You' : chair.taken ? (chair.name || 'Manager') : 'CPU'
  const pressable = canOrder || (canClaim && !chair.taken)
  const label = canOrder
    ? `Seat ${index + 1}, ${who}. ${held ? 'Tap another seat to swap.' : 'Tap to move.'}`
    : canClaim && !chair.taken ? `Take seat ${index + 1}` : `Seat ${index + 1}, ${who}`

  const body = (
    <>
      <span className={cx('w-5 shrink-0 text-right font-figure text-[13px] font-bold tabular-nums', chair.you ? 'text-white' : 'text-v3-ink3')}>{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">
        <span className={cx(chair.taken ? 'font-semibold' : '')}>{who}</span>
        {index === hostSeat && <span className={cx('ml-1.5 font-figure text-[11px] uppercase tracking-[0.08em]', chair.you ? 'text-v3-bandInk' : 'text-v3-ink3')}>host</span>}
      </span>
      {/* A chair somebody holds that the room is already picking for: they
          have dropped, and the room hands the seat to the CPU so the draft
          keeps moving. Said rather than left to look like a normal seat. */}
      {chair.taken && chair.auto && <span className={cx('shrink-0 font-figure text-[11px] uppercase tracking-[0.08em]', chair.you ? 'text-v3-bandInk' : 'text-v3-warn')}>away</span>}
      {!chair.taken && <Glyph name="cpu" className={cx('h-4 w-4 shrink-0', chair.you ? 'text-white' : 'text-v3-ink3')} />}
    </>
  )

  const cls = cx(
    'flex min-h-[44px] w-full items-center gap-2.5 rounded-[4px] border px-2.5 text-left',
    FOCUS,
    held ? 'border-v3-call bg-v3-callWash text-v3-ink'
      : chair.you ? 'border-v3-band bg-v3-band text-white'
        : chair.taken ? 'border-v3-rule bg-v3-sheet text-v3-ink'
          : 'border-dashed border-v3-rule bg-v3-paper text-v3-ink2',
  )

  if (!pressable) return <li><span className={cls} aria-label={label}>{body}</span></li>
  return (
    <li>
      <button type="button" aria-label={label} aria-pressed={canOrder ? held : undefined} onClick={() => (canOrder ? onHold(index) : onClaim(index))} className={cls}>
        {body}
      </button>
    </li>
  )
}

function Invite({ code }) {
  const url = inviteUrl(code)
  const [copied, setCopied] = useState(false)
  const field = useRef(null)
  useEffect(() => {
    if (!copied) return undefined
    const t = setTimeout(() => setCopied(false), 2400)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    // select() first, so a browser that refuses the clipboard still leaves
    // the link highlighted and one keystroke from being copied by hand.
    if (field.current) { field.current.focus(); field.current.select() }
    try { await navigator.clipboard.writeText(url); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <div>
      <Label className="block">The invite</Label>
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="v3-invite">Invite link</label>
        <input
          id="v3-invite"
          ref={field}
          readOnly
          value={url}
          data-invite-link
          onFocus={(e) => e.target.select()}
          className={cx('min-h-[44px] min-w-0 flex-1 rounded-[4px] border border-v3-rule bg-v3-paper px-3 font-figure text-[16px] text-v3-ink2', FOCUS)}
        />
        <QuietButton onClick={copy} className="shrink-0 px-4">
          <Glyph name={copied ? 'check' : 'copy'} className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}
        </QuietButton>
      </div>
      <p className="mt-2 text-[13px] leading-[1.5] text-v3-ink2">
        Send it and they land straight in this room. Code <b className="font-figure font-bold tracking-[0.08em] text-v3-ink">{code}</b> if it is easier to read out.
      </p>
      <p role="status" className="sr-only">{copied ? 'Invite link copied' : ''}</p>
    </div>
  )
}

/* Your name, as everybody else sees it. Stored in this browser and sent to
   the room, which cleans it before anybody draws it — control characters
   out, line breaks to a space, then cut to twenty. So the limit here is a
   courtesy to the field, never the check. */
function NameField({ engine, blocked }) {
  const [name, setName] = useState(() => { try { return engine.myName() || '' } catch { return '' } })
  const [saved, setSaved] = useState(false)
  const commit = () => {
    const next = name.trim()
    try { engine.setMyName(next) } catch { /* nothing to tell */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }
  return (
    <div>
      <label htmlFor="v3-room-name"><Label className="block">Your name in this room</Label></label>
      <div className="mt-2 flex gap-2">
        <input
          id="v3-room-name"
          value={name}
          maxLength={20}
          disabled={!!blocked}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          placeholder="Chase"
          className={cx('min-h-[44px] min-w-0 flex-1 rounded-[4px] border border-v3-rule bg-v3-paper px-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 disabled:cursor-not-allowed', FOCUS)}
        />
        <QuietButton onClick={commit} className="shrink-0 px-4">Save</QuietButton>
      </div>
      <p role="status" className="mt-1 h-4 text-[12px] text-v3-ink3">{saved ? 'Saved — it follows you into every room.' : ''}</p>
    </div>
  )
}

export default function RoomLobby({ engine, view }) {
  const [held, setHeld] = useState(null)
  const [notice, setNotice] = useState('')

  const blocked = sendBlocker(view)
  const refusal = startBlocker(view, engine)
  const canOrder = view.isHost && view.phase === 'lobby' && !blocked
  const canClaim = view.phase === 'lobby' && !blocked
  /* Which chair the host is in is not on the room's view — deliberately, for
     the reason every member id is kept off the wire. hostName is, so the
     badge is drawn only when exactly ONE seat wears that name: two managers
     called Chase would otherwise both be labelled host, which is a confident
     wrong answer where a missing badge is merely a quiet one. */
  const named = view.hostName ? view.seats.filter((s) => s.taken && s.name === view.hostName) : []
  const hostSeat = view.isHost && view.mySeat !== null ? view.mySeat
    : named.length === 1 ? view.seats.indexOf(named[0]) : -1

  // A held chair only means something while the order can still move.
  useEffect(() => { if (!canOrder && held !== null) setHeld(null) }, [canOrder, held])

  const onHold = (index) => {
    if (held === null || held === index) { setHeld(held === index ? null : index); return }
    engine.swapSeats(held, index)
    setHeld(null)
  }
  const onClaim = (index) => {
    engine.claimSeat(index)
    setNotice(`Asked the room for seat ${index + 1}.`)
    setTimeout(() => setNotice(''), 2600)
  }

  const title = view.hostName ? `${view.hostName}'s draft room` : 'Your draft room'
  const waiting = view.taken === 1
    ? `You are the only one here. The other ${view.seats.length - 1} seats draft as CPUs unless somebody takes them.`
    : `${view.taken} of ${view.seats.length} seats taken. The rest are CPU.`

  return (
    <div className="min-h-dvh bg-v3-paper px-4 pb-16 pt-8 sm:px-8">
      <div className="mx-auto grid max-w-[1100px] gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Label>The Draft Room · with friends</Label>
            <Headline className="mt-2" size="section">{title}</Headline>
            <p className="mt-2 max-w-[60ch] text-[15px] leading-[1.55] text-v3-ink2">{waiting}</p>
          </div>
          <QuietButton onClick={() => leaveRoom(engine)} data-leave-room className="shrink-0">
            <Glyph name="back" className="h-4 w-4" /> Leave the room
          </QuietButton>
        </header>

        {blocked && <Problem text={blocked} />}

        {/* The invite leads on a phone and the seats lead on a desk, which is
            the same page read in the two orders it is actually read in: the
            first thing a host does on a phone is send the link, and ten seats
            above it is ten seats of scrolling before the one control the
            screen exists for. order-* rather than two copies of the markup. */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="order-2 grid gap-5 lg:order-1">
            <Sheet code="Seats" aside={`${view.taken} of ${view.seats.length}`} rise={false}>
              <p className="mb-3 text-[14px] leading-[1.5] text-v3-ink2">
                {canOrder
                  ? held === null
                    ? 'Tap a seat, then tap the one to swap it with. The order is the snake, so it is fixed once the first pick lands.'
                    : `Seat ${held + 1} is up — tap the seat to swap it with.`
                  : view.phase === 'lobby'
                    ? view.isHost ? 'The draft order is yours to set once the room can hear you.' : 'Tap a free seat to take it. The host sets the order.'
                    : 'The draft has started, so the order is fixed.'}
              </p>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {view.seats.map((chair, i) => (
                  <Seat
                    key={i}
                    chair={chair}
                    index={i}
                    hostSeat={hostSeat}
                    held={held === i}
                    canOrder={canOrder}
                    canClaim={canClaim}
                    onClaim={onClaim}
                    onHold={onHold}
                  />
                ))}
              </ol>
              <p role="status" className="mt-2 h-4 text-[12px] text-v3-ink3">{notice}</p>
            </Sheet>

            <Sheet code={view.isHost ? 'Start the draft' : 'Waiting for the host'} rise={false}>
              {view.isHost ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <CallButton
                    data-start-room
                    onClick={() => engine.startDraft({})}
                    disabled={!!refusal}
                    className="min-h-[52px] w-full px-7 text-[16px] sm:w-auto"
                  >
                    <Glyph name="play" className="h-4 w-4" filled /> Start for everyone
                  </CallButton>
                  {refusal ? <Problem text={refusal} className="flex-1" /> : (
                    <p className="flex-1 text-[14px] leading-[1.5] text-v3-ink2">
                      Every empty chair drafts as a CPU from your browser, so it keeps moving whether or not all {view.seats.length} seats fill.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[15px] leading-[1.55] text-v3-ink2">
                  {view.hostName ? `${view.hostName} starts it` : 'The host starts it'} when the room is ready. Everybody moves to the board at the same moment — this screen does it for you.
                </p>
              )}
            </Sheet>
          </div>

          <div className="order-1 grid gap-5 lg:order-2">
            <Sheet code="Invite" rise={false}>
              {/* minmax(0,1fr), not a bare auto track. A grid item's default
                  min-width is `auto`, so the track is sized by the item's
                  min-content and a column holding a URL field overflows its
                  own sheet by 26px at 375 — measured, and invisible at any
                  width where the sheet is wider than the field. Same repair
                  CLAUDE.md already records for <BarRow>, one layout along. */}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
                <Invite code={view.code} />
                <NameField engine={engine} blocked={blocked} />
              </div>
            </Sheet>

            {/* The one cost of the host's browser being the CPU, said on the
                screen where the host is standing rather than discovered when
                the board stops. */}
            <Sheet code="How a shared room works" band rise={false}>
              <ul className="grid gap-2.5 text-[14px] leading-[1.5] text-v3-ink2">
                {/* ui.jsx's Icon, not kit.jsx's Glyph: kit's set has no
                    clock, and a name it does not carry draws an empty path
                    rather than throwing — a missing icon that renders. */}
                <li className="flex gap-2"><Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-v3-ink3" /><span>The room keeps the clock. When it runs out the seat is drafted for, and the pick is the same one Juke would advise.</span></li>
                <li className="flex gap-2"><Glyph name="cpu" className="mt-0.5 h-4 w-4 shrink-0 text-v3-ink3" /><span>Empty chairs are drafted by {view.isHost ? 'your' : "the host's"} browser. If {view.isHost ? 'you close this tab' : 'the host closes their tab'} they stop until {view.isHost ? 'you are' : 'they are'} back.</span></li>
                <li className="flex gap-2"><Glyph name="users" className="mt-0.5 h-4 w-4 shrink-0 text-v3-ink3" /><span>The league, the scoring and the lineup are the room's. Everyone drafts the same board, whatever their own settings say.</span></li>
              </ul>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  )
}
