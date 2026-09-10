import { useState } from 'react'
import { Check, Copy, Crown, LogOut, Users } from 'lucide-react'
import { useEngine, useJukeTick } from '../hooks/useJukeEngine.js'

const STATUS_TEXT = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected.',
}

// onCreated: optional, fired the instant createRoom() itself succeeds — not
// on join. DraftRoom.jsx uses it to keep a host who creates a room from the
// Lobby on the Lobby (see its own suppressAutoEnterRef comment for why this
// has to be an explicit signal from here rather than something inferred
// from hasRoom()/the hash afterwards). A guest typing in a code is a
// different action with no such case to protect — that path is left alone,
// and still auto-enters exactly as it always has.
//
// onEnter: the seat-picker/live board is one call away (DraftRoom.jsx's own
// enterDraftRoom), not required. Its only caller today is
// DraftWithFriendsModal.jsx, where a host who just created a room otherwise
// had no way forward from this exact screen except closing the modal by
// hand and re-finding "Start mock draft" on the Lobby card underneath —
// two clicks to do one thing, and the second one wasn't even visible from
// here. suppressAutoEnterRef (DraftRoom.jsx) is what keeps this room from
// entering itself the instant it exists; this button is the deliberate,
// explicit version of the same action, for once the host has actually
// copied the link below.
export default function RoomPanel({ onCreated, onEnter }) {
  const engine = useEngine()
  useJukeTick(engine)
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)

  if (!engine) return null

  const hasRoomVal = engine.hasRoom()
  const status = engine.liveStatus()
  const reason = engine.liveReason()

  if (!hasRoomVal) {
    /* Creating or joining a room here doesn't add a room to what you're
       doing — it replaces it. adoptRoom() (app.js) sets state.started to
       the *room's* status (a fresh room is "lobby", so started snaps back
       to false) and, since a real solo pick count essentially never
       matches a brand-new room's empty one, wipes state.picks and
       un-drafts the whole board to match it — no confirmation, because
       there was never a path meant to reach this mid-draft at all: a room
       is a shape decided before a draft starts, not something an existing
       one can be converted into. Gating here is the only fix that doesn't
       need a confirmation dialog defending against a scenario nothing else
       in the room model supports.

       started alone used to gate this, and state.started never goes back
       to false on its own once a draft finishes — so a completed draft
       stayed just as blocked as one mid-round, and the copy below promising
       "finish... this draft first" was never actually true: finishing did
       nothing to this flag, only discarding did. headerInfo().over is the
       same "is there still a live pick to protect" fact DraftCockpitHeader
       already reads to retire its own pick pill once a draft ends; folding
       it in here is what makes "finish" a real way out rather than a
       promise the gate couldn't keep. */
    const info = engine.headerInfo()
    const started = !!info.started && !info.over
    const handleJoin = () => {
      if (started) return
      const code = joinCode.trim().toUpperCase()
      if (code) engine.joinRoomByCode(code)
    }
    return (
      <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-charcoal p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-white">Draft with friends</h2>
        <p className="mt-1 text-sm text-white/50">
          {started
            ? "Can't create or join a room mid-draft — a room replaces the board it's on rather than adopting it, which would discard every pick made so far. Finish or discard this draft first."
            : 'Same board, same picks, everyone watching the same clock.'}
        </p>

        <button
          type="button"
          onClick={() => { if (!started && engine.createRoom() && onCreated) onCreated() }}
          disabled={started}
          title={started ? "Can't create a room mid-draft" : undefined}
          className="mt-6 w-full rounded-full bg-cta py-3 text-sm font-semibold text-white
                     shadow-glass transition-all duration-200 hover:scale-[1.02] hover:animate-pulse-glow
                     disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 disabled:hover:animate-none"
        >
          Create a room
        </button>

        <div className="mt-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide text-white/30">
          <div className="h-px flex-1 bg-white/10" />
          or
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="mt-6 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Enter a room code"
            maxLength={8}
            disabled={started}
            className="w-full rounded-lg border border-white/10 bg-obsidian/60 px-3 py-2.5 text-sm uppercase tracking-widest
                       text-white placeholder:normal-case placeholder:tracking-normal placeholder:text-white/30
                       focus:border-teal-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={started || !joinCode.trim()}
            className="shrink-0 rounded-lg border border-white/15 px-4 text-sm font-medium text-white/70
                       transition-colors duration-200 hover:border-teal-400/60 hover:text-teal-300
                       disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:text-white/70"
          >
            Join
          </button>
        </div>

        {reason && status !== 'open' && (
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-300">
            Couldn't join that room: {reason}.
          </p>
        )}
      </div>
    )
  }

  const room = engine.room()
  // engine.link() (Live.link() underneath), not codeInUrl() — the latter
  // reads the current hash's own query string, which is empty everywhere
  // except #/draft-room?room=... itself. This panel renders on the Lobby
  // too now (DraftWithFriendsModal.jsx), where the hash is bare #/drafts —
  // codeInUrl() here always returned null and this box was always blank
  // the moment a manager clicked back to the Lobby to see it again.
  const link = engine.link() || ''

  const copyLink = () => {
    if (!link) return
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const seats = room ? room.seats : []
  const seatsTaken = seats.filter((s) => s.taken).length

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-charcoal p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Your room</h2>
          <p className="mt-1 text-sm text-white/50">
            {seatsTaken} of {seats.length} seats taken
            {status !== 'open' && STATUS_TEXT[status] && <span className="text-amber-300"> &middot; {STATUS_TEXT[status]}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => engine.leaveRoom()}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium
                     text-white/60 transition-colors duration-200 hover:border-rose-400/50 hover:text-rose-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          Leave
        </button>
      </div>

      <div className="mt-5 flex gap-2">
        <input
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="w-full truncate rounded-lg border border-white/10 bg-obsidian/60 px-3 py-2.5 text-xs text-white/70 focus:outline-none"
        />
        <button
          type="button"
          onClick={copyLink}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-medium text-white/70
                     transition-colors duration-200 hover:border-teal-400/60 hover:text-teal-300"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-teal-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* The one gradient CTA on this screen, same rule NewMockPanel.jsx's
          own comment already states about its "Start mock draft"/"Draft
          with friends" pair: exactly one thing shouting for attention.
          Copy above stays an outline button rather than competing with
          this — send the link first, enter whenever you're ready, in
          either order. py-3 text-sm matches "Create a room" above,
          measured at 44px (12+12 padding, 20px line-height), the primary-
          CTA floor. */}
      <button
        type="button"
        onClick={onEnter}
        className="mt-4 w-full rounded-full bg-cta py-3 text-sm font-semibold text-white
                   shadow-glass transition-all duration-200 hover:scale-[1.02] hover:animate-pulse-glow"
      >
        Enter draft room
      </button>

      <div className="mt-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/30">
        <Users className="h-3.5 w-3.5" />
        Seats
      </div>
      <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
        {seats.map((seat) => {
          const isHostSeat = room && room.hostName && seat.name === room.hostName
          return (
            <div
              key={seat.index}
              className={
                'flex items-center justify-between rounded-lg border px-3 py-2 text-sm ' +
                (seat.you ? 'border-teal-400/40 bg-teal-500/10' : 'border-white/5 bg-white/[0.02]')
              }
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {/* A pill, not a bare Crown icon — the icon alone read as
                    decoration to anyone who didn't already know what it
                    meant. isHostSeat matches on room.hostName, not on seat
                    index, so this stays correct even in the (currently
                    theoretical) case a host isn't sitting in seat 1 — the
                    same "derive it, don't assume it" reasoning DraftEngine's
                    own pick-code math is documented on elsewhere. */}
                {isHostSeat && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    <Crown className="h-2.5 w-2.5" />
                    Host
                  </span>
                )}
                <span className={seat.taken ? 'truncate text-white/90' : 'text-white/30'}>
                  {seat.taken ? seat.name || `Seat ${seat.index + 1}` : 'Open seat'}
                </span>
                {seat.you && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-teal-300">You</span>}
                {seat.auto && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/30">CPU</span>}
              </span>
              {!seat.taken && !seat.you && (
                <button
                  type="button"
                  onClick={() => engine.claimSeat(seat.index)}
                  className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/60
                             transition-colors duration-200 hover:border-teal-400/60 hover:text-teal-300"
                >
                  Sit here
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
