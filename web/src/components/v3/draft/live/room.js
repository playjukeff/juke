/* A shared draft, read once — the whole of what v3 knows about a room.

   ---- The one rule ----

   There is ONE room protocol and it already exists. live.js is the client
   end, room.js is the room, draft-engine.js is the rules both a browser and
   the worker run, and window.JukeEngine already bridges every one of them
   (see the "Rooms and chat" block at the foot of app.js). Nothing in this
   directory adds a message type, a second socket or a second opinion about
   what is legal. Every function below is either a plain read off that bridge
   or a call into the exact door the classic lobby already presses.

   ---- The two questions that are not the same question ----

   `engine.hasRoom()` is "we are in a room"; `engine.inRoom()` is "the socket
   is up right now". A phone drops its socket the moment the browser stops
   being the front app — which is step three of this feature, because sending
   the invite means leaving the browser — so the drop is the NORMAL path and
   hasRoom() stays true through it. Anything that decides what this screen is
   asks the first; anything that decides whether a control can SEND asks the
   second. Reading the wrong one is what once started a private solo draft on
   the host's phone while nine people waited.

   ---- The browser stops deciding ----

   A pick is an intent: engine.draftPlayer() already sends Live.pick() and
   returns without touching the board (draftAndAdvance() in app.js), and the
   board moves when the room broadcasts. The clock is PAINTED — app.js's
   startRoomTicking() walks the last msLeft down between broadcasts and never
   drafts. Nothing here starts a timer, mutates a seat, or resolves a pick. */

import { useEffect, useReducer, useRef } from 'react'

export const ROOM_HASH = '#/draft/live'
export const LAUNCHER_HASH = '#/draft'

/* Codes are what live.js mints: no vowels, no 0/O, no 1/l/I. Accepted
   case-insensitively and from a pasted LINK as well as a bare code, because
   what a friend sends is a URL and what they read out over the phone is
   eight characters. */
const CODE_CHARS = /[A-Za-z0-9_-]{4,40}/
const IN_QUERY = /[?&]room=([A-Za-z0-9_-]{4,40})/

export function cleanCode(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return null
  const fromLink = IN_QUERY.exec(text)
  if (fromLink) return fromLink[1].toUpperCase()
  const bare = CODE_CHARS.exec(text)
  return bare && bare[0] === text ? text.toUpperCase() : null
}

/* The code of the room we are actually in.

   live.code is not on the bridge as a bare value, and Live.link() is built
   from it (live.js), so the code is read back off the one string that
   already carries it rather than a second copy being kept here — the
   written-down-twice rule, at eight characters. codeInUrl() is the fallback
   for the instant between a link arriving and a socket existing. */
export function codeOf(engine) {
  let link = null
  try { link = engine && engine.link ? engine.link() : null } catch { link = null }
  const m = link && IN_QUERY.exec(link)
  if (m) return m[1]
  try { return (engine && engine.codeInUrl && engine.codeInUrl()) || null } catch { return null }
}

export function roomHref(code) {
  return code ? `${ROOM_HASH}?room=${encodeURIComponent(code)}` : ROOM_HASH
}

/* The link a manager copies. Built off the page it is on, so it is right on
   jukeff.com, on localhost and in the installed app without being told
   which — the same construction Live.link() makes, at v3's own address
   rather than the classic room's. */
export function inviteUrl(code) {
  if (!code || typeof location === 'undefined') return ''
  return location.origin + location.pathname + roomHref(code)
}

/* engine.createRoom() / joinRoomByCode() / leaveRoom() are the real doors —
   the same sequence the classic lobby runs, and the only ones that register
   Live.onChange(onRoomChange) through app.js's own joinRoom(). Registering
   it a second time from here would REPLACE that single-slot callback and
   stop adoptRoom(), driveRoomCPUs(), driveMyAutopilot() and resetClock()
   from ever running again, which is why this file never touches Live.

   All three set location.hash to the CLASSIC address as their last act,
   which would navigate straight out of v3. replaceState puts v3's own
   address back inside the SAME synchronous task — before the hashchange
   that assignment queued has fired — so every listener (React's
   useHashRoute, app.js's applyRoute, app.js's own invite-code join) reads
   the v3 hash off location and neither a classic screen nor a second join
   ever happens. replaceState fires no hashchange of its own, which is
   exactly why it is the tool: the queued one is the navigation, and this
   only corrects where it lands. */
function handoff(hash) {
  if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', hash)
  else location.hash = hash
}

export function createRoom(engine) {
  let code = null
  try { code = engine.createRoom() } catch { code = null }
  // null is setupProblem() refusing — a league the board cannot seat. The
  // caller says which; a room that cannot be created must not look created.
  if (!code) return null
  handoff(roomHref(code))
  return code
}

export function joinRoom(engine, raw) {
  const code = cleanCode(raw)
  if (!code) return false
  try { engine.joinRoomByCode(code) } catch { return false }
  handoff(roomHref(code))
  return true
}

export function leaveRoom(engine) {
  try { engine.leaveRoom() } catch { /* already gone */ }
  handoff(LAUNCHER_HASH)
}

/* Everything this screen needs about the room, in one read.

   Null when there is no room at all, so a caller branches once. `phase` is
   the room's own status word — the room is the authority on whether a draft
   has begun, and state.started is only its echo (adoptRoom sets it from
   exactly this field). */
export function readRoom(engine) {
  let room = null
  try { room = engine && engine.hasRoom && engine.hasRoom() ? engine.room() : null } catch { room = null }
  if (!room) return null

  const status = safeCall(engine, 'liveStatus', 'off')
  const seats = room.seats || []
  return {
    room,
    status,
    // The socket, not the room. Every control that SENDS is gated on this.
    socket: status === 'open',
    reason: safeCall(engine, 'liveReason', null),
    code: codeOf(engine),
    phase: room.status,
    isHost: !!room.isHost,
    hostName: room.hostName || null,
    mySeat: room.yourSeat >= 0 ? room.yourSeat : null,
    seats,
    taken: seats.filter((s) => s.taken).length,
    // A seat somebody holds but whose manager has gone quiet. The room does
    // not distinguish it from an empty chair when it picks; a reader does.
    away: seats.filter((s) => s.taken && s.auto).length,
    paused: !!room.paused,
    msLeft: room.msLeft,
    clockLength: room.clockLength,
    reactions: room.reactions || [],
    chatLength: (room.chat || []).length,
  }
}

function safeCall(engine, name, fallback) {
  try { return engine && engine[name] ? engine[name]() : fallback } catch { return fallback }
}

/* A room changes in ways a DRAFT does not, and nothing was watching them.

   useDraftVersion() (v2's, shared) bumps on a key built from the draft:
   picks, the queue, my seat, whether there IS a room. It deliberately does
   not carry the room's own facts, because the cockpit it was written for had
   none — so a seat claimed in the lobby, a name typed, a message sent or a
   socket dropping moved nothing on screen. It LOOKED fine in a live draft
   only because picks were landing a second apart and dragging a re-render
   along with them; the lobby, where no pick ever lands, would have sat still
   while managers arrived.

   So this is the room's own version beside it rather than an edit to a hook
   two other builds share. Same shape, same subscription: "juke:header" is
   fired by renderHeader() at the end of every render, and app.js's
   onRoomChange() ends in render() — so every broadcast already announces
   itself and nothing here polls.

   The key is what a reader can SEE change. msLeft is deliberately out: the
   clock is painted by its own per-second subscription (useClockTick), and
   putting it here would re-render the whole room once a second to move one
   digit — the exact cost useDraftVersion's own comment exists to avoid. */
function roomKey(engine) {
  const v = readRoom(engine)
  if (!v) return 'none'
  const chat = v.room.chat || []
  const last = chat[chat.length - 1]
  return [
    v.status,
    v.phase,
    v.isHost ? 1 : 0,
    v.mySeat,
    v.paused ? 1 : 0,
    v.seats.map((s) => `${s.taken ? 1 : 0}${s.auto ? 1 : 0}${s.name || ''}`).join(','),
    chat.length,
    last ? last.id : 0,
    // A reaction or a poll vote changes a line without adding one, so the
    // length and the newest id both stay put. Counted rather than listed:
    // this runs on every header tick.
    chat.reduce((n, m) => n + (m.reacts ? m.reacts.length : 0) + (m.poll ? m.poll.options.reduce((k, o) => k + o.count, 0) : 0), 0),
  ].join('~')
}

export function useRoomVersion(engine) {
  const [version, bump] = useReducer((x) => x + 1, 0)
  const last = useRef(null)
  useEffect(() => {
    if (!engine) return undefined
    const on = () => {
      const k = roomKey(engine)
      if (k !== last.current) { last.current = k; bump() }
    }
    on()
    window.addEventListener('juke:header', on)
    window.addEventListener('juke:data-loaded', on)
    return () => {
      window.removeEventListener('juke:header', on)
      window.removeEventListener('juke:data-loaded', on)
    }
  }, [engine])
  return version
}

/* What a seat is called, to everybody in the room.

   engine.teamLabel() answers "Your Team" or a CPU name, which is right for a
   solo mock and a lie in a room where a person called Blake is sitting in
   seat 3. The room's own view already carries the cleaned name on every
   chair (room.js cleans it server-side, because the page that typed it is
   not the only page that will draw it), so this reads that and falls back to
   the CPU label only for a chair nobody is in. */
export function seatNameOf(view, slot, engine) {
  if (!view) return engine ? engine.teamLabel(slot) : `Seat ${slot + 1}`
  const chair = view.seats[slot]
  if (!chair) return `Seat ${slot + 1}`
  if (chair.taken) return chair.name || (chair.you ? 'Your seat' : `Manager ${slot + 1}`)
  return 'CPU'
}

/* The room's names, given to every part of the live room that draws one.

   Board, ribbon, rails, pool and drawer all ask `engine.teamLabel(slot)`,
   and threading a name function through six components is six props that
   mean nothing in a solo draft. So the room branch hands those components an
   engine whose teamLabel is the room's — one own-property override on a
   plain object copy, every other method the same function object. Identity
   is stable across renders (the caller memoises), and the override reads the
   room at CALL time, so it is never a stale copy of a seat list. */
export function withRoomNames(engine, view) {
  if (!engine || !view) return engine
  return { ...engine, teamLabel: (slot) => seatNameOf(readRoom(engine) || view, slot, engine) }
}

/* Why a control cannot act, in words rather than as a grey nobody reads.
   Null when it can. */
export function sendBlocker(view) {
  if (!view) return null
  if (view.socket) return null
  if (view.status === 'rejected') return 'The room would not let you in.'
  if (view.status === 'reconnecting' || view.status === 'closed') return 'Reconnecting to the room — your seat is held.'
  return 'Connecting to the room…'
}

/* What the room refuses, said before the button is pressed rather than after.
   The room itself is still the authority — every one of these is re-checked
   server-side in room.js, and a rejection there causes no broadcast — but a
   control that cannot act must not merely fail. */
export function startBlocker(view, engine) {
  if (!view) return 'You are not in a room.'
  if (view.phase !== 'lobby') return 'This draft has already started.'
  if (!view.isHost) return `Only the host can start the draft${view.hostName ? ` — that is ${view.hostName}.` : '.'}`
  const send = sendBlocker(view)
  if (send) return send
  let problem = null
  try { problem = engine && engine.setupProblem ? engine.setupProblem() : null } catch { problem = null }
  return problem || null
}
