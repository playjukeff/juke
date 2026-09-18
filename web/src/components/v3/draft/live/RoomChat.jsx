import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PosTag, cx } from '../../ui.jsx'
import { FOCUS, Glyph } from '../kit.jsx'
import { seatNameOf, sendBlocker } from './room.js'

/* The room's talk, beside the room's draft.

   ---- One stream, not two ----

   engine.chatStream(room) is the real merge of room.chat and room.picks into
   one timeline by `at`. Picks are deliberately NOT stored as chat messages:
   the room already has all 140 of them, and writing them down twice would
   push every real message out of a fixed-length log by about the third
   round. So the interleave happens here, on the client, off the one function
   app.js already uses for the classic dock — never re-merged.

   ---- What is escaped, and what still is not ----

   A name and a message are the only text on this page somebody else wrote.
   React escapes both by construction — they are children, never innerHTML —
   so the legacy escHtml() rule is satisfied by the renderer rather than by a
   call. A URL is the exception and stays a CLAIM: a gif goes through
   engine.safeGif() and a voice note or photo through engine.safeMediaUrl()
   before anything is handed to an element that fetches it. The room already
   refused a foreign host (room.js's cleanGif/cleanMediaUrl); this is the
   second check, on the side that actually asks a browser to go and get it.

   ---- Typing never touches state ----

   It is relayed and forgotten: true for about two seconds, and a lie the
   instant a connection drops. engine.onTyping() is a single-slot callback
   whose only other consumer feeds the permanently hidden legacy dock, so
   taking it here has no visible legacy consequence — unlike onChange, which
   this file must never touch (app.js's own handler is what drives
   adoptRoom/driveRoomCPUs/the painted clock). Each seat is believed for four
   seconds and then not, so a tab closed mid-word leaves no ghost. */

const TYPING_MS = 4000
const GROUP_MS = 2 * 60 * 1000

function timeOf(at) {
  if (!at) return ''
  const d = new Date(at)
  let h = d.getHours()
  const suffix = h < 12 ? 'am' : 'pm'
  h = h % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}${suffix}`
}

function Avatar({ name, seat, mine }) {
  const text = name
    ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
    : String(seat + 1)
  return (
    <span
      aria-hidden="true"
      className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full font-figure text-[12px] font-bold', mine ? 'bg-v3-band text-white' : 'bg-v3-well text-v3-ink2')}
    >
      {text}
    </span>
  )
}

/* A poll, as the room projects it: counts and whether it was you, never who
   voted unless the author said it could be named. pollView() decides that,
   not this — an anonymous poll still reports how many chose an option. */
function Poll({ poll, id, onVote, blocked }) {
  const total = poll.options.reduce((n, o) => n + o.count, 0)
  const closed = poll.endsAt != null && Date.now() >= poll.endsAt
  return (
    <div className="mt-1 rounded-[4px] border border-v3-rule bg-v3-sheet p-2.5">
      <p className="text-[15px] font-semibold text-v3-ink">{poll.question}</p>
      <ul className="mt-2 space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = total ? Math.round((o.count / total) * 100) : 0
          return (
            <li key={i}>
              <button
                type="button"
                disabled={closed || !!blocked}
                onClick={() => onVote(id, i)}
                aria-pressed={!!o.you}
                title={blocked || (closed ? 'This poll has closed' : undefined)}
                className={cx('relative flex min-h-[36px] w-full items-center gap-2 overflow-hidden rounded-[4px] border px-2 text-left disabled:cursor-not-allowed', FOCUS, o.you ? 'border-v3-band' : 'border-v3-rule')}
              >
                <span className="absolute inset-y-0 left-0 bg-v3-well" style={{ width: `${pct}%` }} aria-hidden="true" />
                <span className="relative min-w-0 flex-1 truncate text-[13px] text-v3-ink">{o.choice}</span>
                <span className="relative shrink-0 font-figure text-[12px] tabular-nums text-v3-ink2">{o.count}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">
        {total} {total === 1 ? 'vote' : 'votes'}{poll.anon ? ' · anonymous' : ''}{closed ? ' · closed' : ''}
      </p>
    </div>
  )
}

function Said({ entry, view, engine, grouped, onReact, blocked }) {
  const mine = entry.seat >= 0 && entry.seat === view.mySeat
  const who = entry.seat < 0 ? 'Someone' : seatNameOf(view, entry.seat, engine)
  const gif = entry.gif ? engine.safeGif(entry.gif) : null
  const media = entry.url ? engine.safeMediaUrl(entry.url) : null
  return (
    <li className={cx('flex gap-2 px-3', grouped ? 'mt-0.5' : 'mt-3')}>
      <span className="w-7 shrink-0">{!grouped && <Avatar name={entry.name} seat={entry.seat} mine={mine} />}</span>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className={cx('truncate text-[13px] font-bold', mine ? 'text-v3-ink' : 'text-v3-ink')}>{who}</span>
            <span className="shrink-0 font-figure text-[12px] tabular-nums text-v3-ink3">{timeOf(entry.at)}</span>
          </p>
        )}
        {entry.text && <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-v3-ink2">{entry.text}</p>}
        {gif && <img src={gif} alt="" loading="lazy" className="mt-1 max-h-[180px] rounded-[4px]" />}
        {entry.type === 'photo' && media && <img src={media} alt="A photo sent to the room" loading="lazy" className="mt-1 max-h-[220px] rounded-[4px]" />}
        {entry.type === 'voice' && media && (
          <span className="mt-1 flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={media} controls preload="none" className="h-9 max-w-full" />
            <span className="font-figure text-[12px] tabular-nums text-v3-ink3">{entry.seconds}s</span>
          </span>
        )}
        {entry.type === 'poll' && entry.poll && <Poll poll={entry.poll} id={entry.id} onVote={(id, i) => engine.votePoll(id, i)} blocked={blocked} />}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {(entry.reacts || []).map((r) => (
            <button
              key={r.emoji}
              type="button"
              disabled={!!blocked}
              onClick={() => onReact(entry.id, r.emoji)}
              aria-label={`${r.count} reacted ${r.emoji}`}
              aria-pressed={!!r.you}
              title={blocked || undefined}
              className={cx('inline-flex h-7 items-center gap-1 rounded-full border px-2 font-figure text-[12px] tabular-nums disabled:cursor-not-allowed', FOCUS, r.you ? 'border-v3-band bg-v3-well text-v3-ink' : 'border-v3-rule text-v3-ink2')}
            >
              <span aria-hidden="true">{r.emoji}</span>{r.count}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}

/* A pick, in the transcript where it happened. The room's picks carry the
   player's KEY (his name) and nothing else, so the position comes off the
   board by that name — the same board every client drafted from. */
function Pick({ entry, view, engine }) {
  const board = engine.board() || []
  const player = board.find((p) => p.name === entry.player) || null
  const mine = entry.seat === view.mySeat
  return (
    <li className="mt-3 px-3">
      <p className={cx('flex items-center gap-2 rounded-[4px] border-l-[3px] bg-v3-paper px-2.5 py-1.5', mine ? 'border-v3-ink' : 'border-v3-rule')}>
        <span className="shrink-0 font-figure text-[12px] font-bold uppercase tracking-[0.08em] text-v3-ink3">#{entry.overall}</span>
        {player && <PosTag pos={player.pos} className="!h-[18px] !min-w-[28px] !text-[12px]" />}
        <span className="min-w-0 flex-1 truncate text-[13px] text-v3-ink">
          <span className="font-semibold">{seatNameOf(view, entry.seat, engine)}</span> took {entry.player}
        </span>
      </p>
    </li>
  )
}

export default function RoomChat({ engine, view, className = '' }) {
  const [text, setText] = useState('')
  const [typing, setTyping] = useState({})
  const log = useRef(null)
  const pinned = useRef(true)
  const sentTypingAt = useRef(0)

  const blocked = sendBlocker(view)
  const stream = engine.chatStream(view.room) || []

  /* Typing is relayed rather than stored, so it is React state here and
     nowhere else. Each seat is believed until its own deadline; one sweep
     runs only while somebody is actually typing. */
  useEffect(() => {
    engine.onTyping((msg) => {
      if (!msg || msg.seat < 0) return
      setTyping((prev) => {
        const next = { ...prev }
        if (msg.on) next[msg.seat] = Date.now() + TYPING_MS
        else delete next[msg.seat]
        return next
      })
    })
    return () => engine.onTyping(null)
  }, [engine])

  useEffect(() => {
    if (!Object.keys(typing).length) return undefined
    const id = setInterval(() => {
      const now = Date.now()
      setTyping((prev) => {
        const next = {}
        let changed = false
        for (const seat of Object.keys(prev)) {
          if (prev[seat] > now) next[seat] = prev[seat]
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(id)
  }, [typing])

  /* Pinned to the newest line unless the reader has scrolled up to read
     something — a log that yanks itself down mid-sentence on every CPU pick
     is unreadable in exactly the rounds it matters. */
  useLayoutEffect(() => {
    const el = log.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [stream.length])

  const onScroll = () => {
    const el = log.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const send = (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || blocked) return
    // An intent, like every other message: the room stores it and broadcasts
    // it back, and the log below is drawn from the broadcast.
    engine.sendChat(body)
    engine.sendTyping(false)
    sentTypingAt.current = 0
    setText('')
    pinned.current = true
  }

  /* On the leading edge and then not again until it lapses. A message per
     keystroke would be a message per keystroke for everybody else too, and
     the room refuses forty actions per socket per ten seconds. */
  const onType = (value) => {
    setText(value)
    if (blocked) return
    const now = Date.now()
    if (value && now - sentTypingAt.current > TYPING_MS / 2) {
      sentTypingAt.current = now
      engine.sendTyping(true)
    }
    if (!value) { sentTypingAt.current = 0; engine.sendTyping(false) }
  }

  const typingSeats = Object.keys(typing).map(Number).filter((s) => s !== view.mySeat)
  const typingText = typingSeats.length === 1
    ? `${seatNameOf(view, typingSeats[0], engine)} is typing…`
    : typingSeats.length > 1 ? `${typingSeats.length} people are typing…` : ''

  let last = null
  return (
    <section aria-label="Room chat" data-room-chat className={cx('flex min-h-0 flex-col overflow-hidden rounded-[6px] border border-v3-rule bg-v3-sheet', className)}>
      <div className="flex min-h-[38px] shrink-0 items-center justify-between gap-3 bg-v3-band px-3 text-white">
        <span className="font-figure text-[12px] font-bold uppercase tracking-[0.14em]">Room chat</span>
        <span className="font-figure text-[12px] uppercase tracking-[0.1em] text-v3-bandInk">{view.taken} in</span>
      </div>

      <ul ref={log} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-2" aria-live="off">
        {!stream.length && <li className="px-3 py-6 text-center text-[15px] text-v3-ink2">Nothing said yet. Every pick lands here too.</li>}
        {stream.map((entry, i) => {
          if (entry.kind === 'pick') { last = null; return <Pick key={`p${entry.overall}`} entry={entry} view={view} engine={engine} /> }
          if (entry.kind === 'system') {
            last = null
            return <li key={`s${entry.id}`} className="mt-3 px-3 text-center font-figure text-[12px] uppercase tracking-[0.08em] text-v3-ink3">{entry.text}</li>
          }
          const grouped = !!last && last.seat === entry.seat && (entry.at || 0) - (last.at || 0) < GROUP_MS
          last = entry
          return <Said key={`m${entry.id}`} entry={entry} view={view} engine={engine} grouped={grouped} onReact={(id, emoji) => engine.sendReaction(id, emoji)} blocked={blocked} />
        })}
        <li aria-hidden={!typingText} className="h-5 px-3 pt-1 text-[12px] italic text-v3-ink3">{typingText}</li>
      </ul>

      <form onSubmit={send} className="shrink-0 border-t border-v3-rule p-2">
        {blocked && <p role="status" className="mb-2 px-1 text-[12px] text-v3-warn">{blocked}</p>}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="v3-room-chat">Say something to the room</label>
          <input
            id="v3-room-chat"
            value={text}
            onChange={(e) => onType(e.target.value)}
            onBlur={() => { if (!blocked) engine.sendTyping(false) }}
            disabled={!!blocked}
            maxLength={500}
            placeholder={blocked ? 'Reconnecting…' : 'Say something'}
            /* 16px, because Safari zooms any field under it on focus and
               never zooms back out — style.css's own floor, restated where
               this field is drawn rather than inherited from a sheet v3
               does not load. */
            className={cx('min-h-[44px] min-w-0 flex-1 rounded-[4px] border border-v3-rule bg-v3-paper px-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 disabled:cursor-not-allowed', FOCUS)}
          />
          <button
            type="submit"
            disabled={!!blocked || !text.trim()}
            aria-label="Send"
            className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-v3-call text-v3-onCall disabled:bg-v3-well disabled:text-v3-ink3', FOCUS)}
          >
            <Glyph name="arrow" className="h-5 w-5" />
          </button>
        </div>
      </form>
    </section>
  )
}
