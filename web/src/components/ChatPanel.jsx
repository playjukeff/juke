import { useEffect, useReducer, useRef, useState } from 'react'
import { Image as ImageIcon, Send, X } from 'lucide-react'
import { SonarPulse } from './SonarLoader.jsx'
import { CHAT_MAX, buildDisplay, chatTime, seatInitials, seatLabel, seatName } from './chatHelpers.js'

// Replaces ChatPlaceholder.jsx at both its mount points (DraftLogDock's
// desktop column, PlayerHub's mobile Chat tab). Reads and writes the real
// worker/room.js backend that was always there — see CLAUDE.md's note that
// only the React UI reading it was missing. Every formatting helper below
// is a direct port of the equivalent function in app.js (chatTime,
// seatName, seatLabel, seatInitials, the grouping pass in renderChat(),
// renderChatMeta()'s presence/typing lines) rather than a reinvention, so
// the two chat surfaces this app has ever had agree on what a line means.
//
// The one thing that is NOT a copy of app.js: Live.onChange() already
// carries the whole draft loop (adoptRoom/driveRoomCPUs/driveMyAutopilot/
// resetClock — see the bridge comment on window.JukeEngine.room() in
// app.js), so this component reads chat through engine.chatStream(room()),
// recomputed on the same tick every other panel already re-renders on. It
// never registers a second Live.onChange(). Live.onTyping() is the one
// callback the bridge comment marks safe to take over on its own — this is
// the only consumer of it in React, and it hands the slot back to a no-op
// on unmount so a closed chat panel cannot go on calling setState on itself.

const TYPING_MS = 4000 // how long a typing:true is believed before it lapses on its own
const TYPING_RESEND_MS = 2000 // how often typing:true is re-sent while still typing
const GIF_DEBOUNCE_MS = 350

function EmptyNoRoom() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm font-semibold text-white/70">Nobody to talk to here</p>
      <p className="text-xs leading-relaxed text-ink-muted">
        Chat is for a shared room. Start one from Mock Drafts and this fills in for both of you.
      </p>
    </div>
  )
}

function SystemLine({ text }) {
  return <p className="my-1.5 text-center text-[11px] text-ink-muted">{text}</p>
}

function PickLine({ entry, room, DE, mine }) {
  const teams = room.league || null
  const code = DE && teams ? DE.pickCode(entry.overall, teams) : entry.overall
  return (
    <div
      className={
        'my-1.5 flex items-center gap-2 rounded-md border-l-2 px-2 py-1 text-xs ' +
        (mine ? 'border-l-[#FFD166] bg-[#FFD166]/5' : 'border-l-transparent bg-white/[0.03]')
      }
    >
      <span className="font-plex text-[10px] tabular-nums text-ink-muted">{code}</span>
      <span className="min-w-0 flex-1 truncate text-white/70">
        <b className="font-semibold text-white/90">{seatLabel(room, entry.seat, null)}</b> drafted {entry.player}
      </span>
      <span className="shrink-0 text-[10px] text-ink-muted">{chatTime(entry.at)}</span>
    </div>
  )
}

function ReactRow({ entry, onReact }) {
  if (!entry.reacts || !entry.reacts.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entry.reacts.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onReact(entry.id, r.emoji)}
          className={
            'rounded-full border px-1.5 py-0.5 text-[11px] leading-none ' +
            (r.you ? 'border-teal-400/50 bg-teal-400/15 text-teal-200' : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]')
          }
        >
          {r.emoji} <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  )
}

function SaidLine({ entry, grouped, room, mine, gif, reactions, connected, pickerOpen, onTogglePicker, onReact, pickerRef }) {
  const named = seatName(room, entry.seat, entry.name)
  const who = seatLabel(room, entry.seat, entry.name)

  const body = (
    <div className="min-w-0 flex-1">
      {entry.text && <span className="whitespace-pre-wrap break-words text-meta text-white/85">{entry.text}</span>}
      {gif && <img src={gif} alt="" loading="lazy" className="mt-1 max-h-40 rounded-lg" />}
      <ReactRow entry={entry} onReact={onReact} />
    </div>
  )

  const addBtn = connected && (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => onTogglePicker(entry.id)}
        className="rounded px-1 text-xs text-ink-muted opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
        aria-label="React to this message"
      >
        +
      </button>
      {pickerOpen && (
        <div ref={pickerRef} className="absolute right-0 top-full z-10 mt-1 flex gap-0.5 rounded-lg border border-white/10 bg-slate-rule p-1 shadow-xl">
          {reactions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(entry.id, emoji)}
              className="rounded px-1.5 py-0.5 text-sm hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (grouped) {
    return (
      <div className={'group flex items-start gap-1.5 py-0.5 pl-9' + (mine ? ' flex-row-reverse pl-0 pr-9 text-right' : '')}>
        {body}
        {addBtn}
      </div>
    )
  }

  return (
    <div className={'group mt-2 flex items-start gap-1.5' + (mine ? ' flex-row-reverse text-right' : '')}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/70">
        {seatInitials(named, entry.seat)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={'mb-0.5 flex items-baseline gap-1.5 text-[11px]' + (mine ? ' flex-row-reverse' : '')}>
          <span className="font-semibold text-white/80">{who}</span>
          <span className="text-ink-muted">{chatTime(entry.at)}</span>
        </p>
        {body}
      </div>
      {addBtn}
    </div>
  )
}

export default function ChatPanel({ engine }) {
  const [text, setText] = useState('')
  const [gifOpen, setGifOpen] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifPayload, setGifPayload] = useState(null)
  const [reactPickerFor, setReactPickerFor] = useState(null)
  const [unread, setUnread] = useState(0)
  const [, forceTick] = useReducer((x) => x + 1, 0)

  const logRef = useRef(null)
  const pickerRef = useRef(null)
  const pinnedRef = useRef(true)
  const seenIdRef = useRef(0)
  const sentTypingAtRef = useRef(0)
  const typingMapRef = useRef({}) // seat -> believed-until ms
  const gifTimerRef = useRef(null)
  const inputRef = useRef(null)

  // The one Live.onTyping() consumer in React. Handed back to a no-op on
  // unmount rather than left pointing at a closure over an unmounted
  // component's setState — see the file comment.
  useEffect(() => {
    function onTypingMsg(msg) {
      if (!msg || msg.seat < 0) return
      if (msg.on) typingMapRef.current[msg.seat] = Date.now() + TYPING_MS
      else delete typingMapRef.current[msg.seat]
      forceTick()
    }
    engine.onTyping(onTypingMsg)
    return () => engine.onTyping(() => {})
  }, [engine])

  // Nothing else forces a re-render purely on the clock, so a typing
  // indicator with no further keystrokes would otherwise hang forever
  // instead of lapsing at TYPING_MS — the same job startTypingSweep() does
  // in app.js.
  useEffect(() => {
    const id = setInterval(forceTick, 1000)
    return () => clearInterval(id)
  }, [])

  // Close the emoji picker on an outside click, same trigger app.js uses
  // ("thrown away on the next click anywhere").
  useEffect(() => {
    if (reactPickerFor == null) return
    function onDocClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setReactPickerFor(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [reactPickerFor])

  const room = engine.room()
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const connected = !!engine.inRoom()

  const entries = room ? engine.chatStream(room) : []
  const display = buildDisplay(entries)
  const entrySig = entries.length + ':' + (entries.length ? entries[entries.length - 1].id ?? entries[entries.length - 1].overall : '')

  useEffect(() => {
    const log = logRef.current
    if (!log || !room) return
    const newestId = entries.reduce((top, e) => (e.id && e.id > top ? e.id : top), 0)
    if (pinnedRef.current) {
      log.scrollTop = log.scrollHeight
      seenIdRef.current = newestId
      setUnread(0)
    } else {
      setUnread(entries.filter((e) => e.kind === 'said' && e.id > seenIdRef.current && e.seat !== room.yourSeat).length)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySig])

  if (!room) return <EmptyNoRoom />

  function handleScroll() {
    const log = logRef.current
    if (!log) return
    pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48
    if (pinnedRef.current) setUnread(0)
  }

  function jumpToBottom() {
    pinnedRef.current = true
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
    setUnread(0)
  }

  function send(gifUrl) {
    const value = text.trim()
    if (!connected || (!value && !gifUrl)) return
    engine.sendChat(value, gifUrl || null)
    setText('')
    sentTypingAtRef.current = 0
    engine.sendTyping(false)
    setGifOpen(false)
    setGifPayload(null)
    setGifQuery('')
    inputRef.current && inputRef.current.focus()
  }

  function handleTextChange(value) {
    setText(value)
    if (!connected) return
    if (!value) {
      if (sentTypingAtRef.current) {
        sentTypingAtRef.current = 0
        engine.sendTyping(false)
      }
      return
    }
    const now = Date.now()
    if (now - sentTypingAtRef.current < TYPING_RESEND_MS) return
    sentTypingAtRef.current = now
    engine.sendTyping(true)
  }

  function handleGifQuery(value) {
    setGifQuery(value)
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current)
    if (!value.trim()) {
      setGifPayload(null)
      return
    }
    gifTimerRef.current = setTimeout(() => {
      engine.gifSearch(value.trim()).then(setGifPayload)
    }, GIF_DEBOUNCE_MS)
  }

  function reactTo(id, emoji) {
    if (!connected) return
    engine.sendReaction(id, emoji)
    setReactPickerFor(null)
  }

  const taken = room.seats.filter((s) => s.taken).length
  const now = Date.now()
  const typingNames = Object.keys(typingMapRef.current)
    .filter((seat) => typingMapRef.current[seat] > now && Number(seat) !== room.yourSeat)
    .map((seat) => seatLabel(room, Number(seat), null))
  const typingLine =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
        ? typingNames[0] + ' is typing…'
        : typingNames.length === 2
          ? typingNames[0] + ' and ' + typingNames[1] + ' are typing…'
          : 'Several managers are typing…'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-white/[0.06] px-2.5 py-1.5">
        <span className="text-[10px] text-ink-muted">
          {taken} {taken === 1 ? 'manager' : 'managers'} here
        </span>
        <span className="truncate text-[10px] italic text-teal-300/80">{typingLine}</span>
      </div>

      <div ref={logRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5">
        {display.length === 0 && <p className="py-6 text-center text-xs text-ink-muted">Nobody has said anything yet.</p>}
        {display.map(({ entry, grouped }) => {
          if (entry.kind === 'system') return <SystemLine key={'sys-' + entry.id} text={entry.text} />
          if (entry.kind === 'pick') {
            return <PickLine key={'pick-' + entry.overall} entry={entry} room={room} DE={DE} mine={entry.seat === room.yourSeat} />
          }
          const gif = engine.safeGif(entry.gif)
          return (
            <SaidLine
              key={'msg-' + entry.id}
              entry={entry}
              grouped={grouped}
              room={room}
              mine={entry.seat >= 0 && entry.seat === room.yourSeat}
              gif={gif}
              reactions={room.reactions || []}
              connected={connected}
              pickerOpen={reactPickerFor === entry.id}
              onTogglePicker={(id) => setReactPickerFor((cur) => (cur === id ? null : id))}
              onReact={reactTo}
              pickerRef={pickerRef}
            />
          )
        })}
      </div>

      {unread > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="mx-auto mb-1 shrink-0 rounded-full bg-teal-500 px-3 py-1 text-[11px] font-semibold text-teal-950 shadow-lg"
        >
          {unread} new {unread === 1 ? 'message' : 'messages'} ↓
        </button>
      )}

      {!connected && (
        <p className="shrink-0 border-t border-white/[0.06] px-2.5 py-1.5 text-center text-[11px] text-amber-300/80">
          Reconnecting — chat will send again once you're back.
        </p>
      )}

      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <div className="mb-1.5 flex gap-1.5">
          {['Nice pick', 'Reach.', 'Wow.'].map((line) => (
            <button
              key={line}
              type="button"
              disabled={!connected}
              onClick={() => engine.sendChat(line, null)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/[0.08] disabled:opacity-40"
            >
              {line}
            </button>
          ))}
        </div>

        {gifOpen && (
          <div className="mb-1.5 rounded-lg border border-white/10 bg-slate-rule/80 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <input
                autoFocus
                value={gifQuery}
                onChange={(e) => handleGifQuery(e.target.value)}
                placeholder="Search GIPHY…"
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-panel/60 px-2 py-1 text-xs text-white outline-none focus:border-teal-400/50"
              />
              <button type="button" onClick={() => setGifOpen(false)} className="rounded p-1 text-ink-muted hover:text-white/70" aria-label="Close GIF search">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {!gifQuery.trim() && <p className="py-3 text-center text-[11px] text-ink-muted">Type to search.</p>}
            {/* delay={0} on purpose. Rule 01 says nothing under 300ms gets a
                loader, and this line clears that bar before it is ever drawn:
                handleGifQuery waits GIF_DEBOUNCE_MS (350) before the request
                even opens, and this text has been on screen for all of it. A
                mark that faded in 300ms after the words beside it would read as
                a second, later event rather than as the same one. */}
            {gifQuery.trim() && !gifPayload && (
              <p className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-ink-muted">
                <SonarPulse width={14} delay={0} />
                Searching…
              </p>
            )}
            {gifPayload && !gifPayload.configured && <p className="py-3 text-center text-[11px] text-ink-muted">GIFs are not set up for this room yet.</p>}
            {gifPayload && gifPayload.configured && gifPayload.error && <p className="py-3 text-center text-[11px] text-ink-muted">GIPHY did not answer. Try again in a moment.</p>}
            {gifPayload && gifPayload.configured && !gifPayload.error && gifPayload.results.length === 0 && gifQuery.trim() && (
              <p className="py-3 text-center text-[11px] text-ink-muted">Nothing found.</p>
            )}
            {gifPayload && gifPayload.configured && !gifPayload.error && gifPayload.results.length > 0 && (
              <div className="grid max-h-40 grid-cols-3 gap-1 overflow-y-auto">
                {gifPayload.results.map((g) => {
                  const url = engine.safeGif(g.url)
                  if (!url) return null
                  return (
                    <button key={g.id} type="button" onClick={() => send(url)} className="overflow-hidden rounded-md">
                      <img src={url} alt={g.alt || 'GIF'} loading="lazy" className="h-16 w-full object-cover" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex items-center gap-1.5"
        >
          <button
            type="button"
            disabled={!connected}
            onClick={() => setGifOpen((o) => !o)}
            className="shrink-0 rounded-md p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-40"
            aria-label="Send a GIF"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={!connected}
            maxLength={CHAT_MAX}
            placeholder={connected ? 'Say something…' : 'Reconnecting…'}
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-teal-400/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !text.trim()}
            className="shrink-0 rounded-full bg-teal-500 p-1.5 text-teal-950 disabled:opacity-30"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  )
}
