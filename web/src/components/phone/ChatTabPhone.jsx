import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Image as ImageIcon, Mic, Plus, Send, Square, X } from 'lucide-react'
import { SonarPulse } from '../SonarLoader.jsx'
import { CHAT_MAX, buildDisplay, chatTime, seatInitials, seatLabel, seatName } from '../chatHelpers.js'

// README section 8. Reuses the exact chatHelpers.js formatting/grouping
// ChatPanel.jsx (the desktop/tablet dock) already has, and the same real
// engine bridge (sendChat/sendReaction/gifSearch/chatStream/safeGif) for
// text/GIF/reactions. Poll/voice/photo are genuinely new on top of that —
// see the chat backend pass's own report on the exact message shapes.
//
// Two deliberate simplifications from the literal design spec, both because
// the browser gives a more honest version of the same feature for free:
//   - the design's custom animated waveform for a voice note is a real
//     <audio controls> element instead — recording still uses MediaRecorder
//     for real, this only changes how playback is drawn, and a native
//     player is more capable (seek, real duration) than a decorative bar.
//   - "Media"/"Capture" are native file inputs (accept="image/*" and
//     accept="image/*" capture="environment") rather than an in-page photo
//     grid — there is no way to read a phone's photo library into a web
//     page without one, and a fabricated grid of placeholder tiles would be
//     exactly the "looks pressable, does nothing real" trap CLAUDE.md's own
//     dead-control rule warns about.
const GIF_DEBOUNCE_MS = 350
const GIF_CATEGORIES = ['Trending', 'Reactions', 'Football', 'Celebrate']
const GIF_CATEGORY_QUERY = { Trending: 'reaction', Reactions: 'reaction', Football: 'football', Celebrate: 'celebrate' }
const VOICE_SECONDS_MAX = 120 // matches room.js's own VOICE_SECONDS_MAX

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function EmptyNoRoom() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm font-semibold text-ink">Nobody to talk to here</p>
      <p className="text-xs leading-relaxed text-ink-muted">
        Chat is for a shared room. Start one from Mock Drafts and this fills in for both of you.
      </p>
    </div>
  )
}

function PollBubble({ entry, onVote }) {
  const p = entry.poll
  if (!p) return null
  const total = p.options.reduce((sum, o) => sum + o.count, 0)
  return (
    <div className="mt-1 w-[236px] rounded-[14px] border border-slate-rule bg-slate-sunk p-3">
      <p className="text-meta font-semibold text-ink">{p.question}</p>
      <div className="mt-2 flex flex-col gap-2">
        {p.options.map((o, i) => {
          const pct = total > 0 ? Math.round((o.count / total) * 100) : 0
          return (
            <button
              key={i}
              type="button"
              onClick={() => onVote(entry.id, i)}
              className="flex flex-col gap-1 text-left"
            >
              <span className="flex items-center justify-between text-xs">
                <span className={o.you ? 'font-semibold text-teal-300' : 'text-ink'}>{o.choice}</span>
                <span className="text-ink-muted">{pct}%</span>
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-slate-panel">
                <span
                  className={'block h-full rounded-full ' + (o.you ? 'bg-teal-400' : 'bg-[#00B8CC]')}
                  style={{ width: pct + '%' }}
                />
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 font-plex text-[10px] text-ink-muted">
        {total} vote{total === 1 ? '' : 's'} &middot; tap to vote
      </p>
    </div>
  )
}

function MessageBody({ entry, gif, mediaUrl, onVote }) {
  if (entry.type === 'poll') return <PollBubble entry={entry} onVote={onVote} />
  if (entry.type === 'voice') {
    return mediaUrl ? (
      <div className="mt-1 flex items-center gap-2 rounded-full border border-slate-rule bg-slate-sunk px-3 py-2">
        <audio controls preload="none" src={mediaUrl} className="h-8 max-w-[220px]" />
        <span className="font-plex text-[11px] text-ink-muted">{formatDuration(entry.seconds)}</span>
      </div>
    ) : null
  }
  if (entry.type === 'photo') {
    return mediaUrl ? (
      <img src={mediaUrl} alt="" loading="lazy" className="mt-1 max-h-52 rounded-[14px] border border-slate-rule" />
    ) : null
  }
  return (
    <>
      {entry.text && <span className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-[1.4] text-ink">{entry.text}</span>}
      {gif && <img src={gif} alt="" loading="lazy" className="mt-1 max-h-40 rounded-[14px]" />}
    </>
  )
}

export default function ChatTabPhone({ engine, onExpandSheet }) {
  const [text, setText] = useState('')
  const [composer, setComposerRaw] = useState('none') // none | tray | gif | poll | voice | recording
  // Opening any composer expands the sheet to its tallest snap (README's
  // own interaction table) — the one thing this tab can't do on its own,
  // since sheet height is DraftRoomPhone's state, not this tab's.
  const setComposer = (next) => {
    setComposerRaw(next)
    if (next !== 'none' && onExpandSheet) onExpandSheet()
  }
  const [gifQuery, setGifQuery] = useState('')
  const [gifCategory, setGifCategory] = useState('Trending')
  const [gifPayload, setGifPayload] = useState(null)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollChoices, setPollChoices] = useState(['', ''])
  const [pollMulti, setPollMulti] = useState(true)
  const [pollAnon, setPollAnon] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [, forceTick] = useReducer((x) => x + 1, 0)

  const logRef = useRef(null)
  const gifTimerRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recChunksRef = useRef([])
  const recTimerRef = useRef(null)
  const sentTypingAtRef = useRef(0)

  useEffect(() => {
    const id = setInterval(forceTick, 1000)
    return () => clearInterval(id)
  }, [])

  const room = engine.room()
  const DE = typeof window !== 'undefined' ? window.DraftEngine : null
  const connected = !!engine.inRoom()
  const entries = room ? engine.chatStream(room) : []
  const display = buildDisplay(entries)

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [entries.length])

  if (!room) return <EmptyNoRoom />

  function closeComposer() { setComposer('none') }

  function send(overrides) {
    const value = text.trim()
    if (!connected || (!value && !overrides)) return
    engine.sendChat(value, null)
    setText('')
    sentTypingAtRef.current = 0
    engine.sendTyping(false)
    closeComposer()
    inputRef.current && inputRef.current.focus()
  }

  function handleTextChange(value) {
    setText(value)
    if (!connected || !value) return
    const now = Date.now()
    if (now - sentTypingAtRef.current < 2000) return
    sentTypingAtRef.current = now
    engine.sendTyping(true)
  }

  function handleGifQuery(value) {
    setGifQuery(value)
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current)
    if (!value.trim()) { setGifPayload(null); return }
    gifTimerRef.current = setTimeout(() => {
      engine.gifSearch(value.trim()).then(setGifPayload)
    }, GIF_DEBOUNCE_MS)
  }

  function pickGifCategory(cat) {
    setGifCategory(cat)
    handleGifQuery(GIF_CATEGORY_QUERY[cat])
  }

  function sendGif(url) {
    if (!connected) return
    engine.sendChat('', url)
    closeComposer()
  }

  async function pickPhoto(file) {
    if (!file || !connected) return
    setBusy(true)
    try {
      const url = await engine.uploadMedia('photo', file)
      if (!url) return
      const dims = await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve({ w: null, h: null })
        img.src = URL.createObjectURL(file)
      })
      engine.sendPhoto(url, dims.w, dims.h)
    } finally {
      setBusy(false)
      closeComposer()
    }
  }

  async function startRecording() {
    if (!connected || typeof navigator === 'undefined' || !navigator.mediaDevices) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recChunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
      rec.start()
      mediaRecorderRef.current = rec
      setRecSecs(0)
      setComposer('recording')
      recTimerRef.current = setInterval(() => {
        setRecSecs((s) => {
          if (s + 1 >= VOICE_SECONDS_MAX) { stopRecording(true); return VOICE_SECONDS_MAX }
          return s + 1
        })
      }, 1000)
    } catch (err) {
      // No mic permission, or no device — the composer just closes rather
      // than pretending recording started.
      closeComposer()
    }
  }

  function stopRecording(send) {
    clearInterval(recTimerRef.current)
    const rec = mediaRecorderRef.current
    if (!rec) { closeComposer(); return }
    const mimeType = rec.mimeType
    rec.onstop = async () => {
      rec.stream.getTracks().forEach((t) => t.stop())
      if (!send) { closeComposer(); return }
      setBusy(true)
      try {
        const blob = new Blob(recChunksRef.current, { type: mimeType })
        const url = await engine.uploadMedia('voice', blob)
        if (url) engine.sendVoice(url, recSecs)
      } finally {
        setBusy(false)
        closeComposer()
      }
    }
    rec.stop()
  }

  function cancelRecording() {
    clearInterval(recTimerRef.current)
    const rec = mediaRecorderRef.current
    if (rec) { rec.onstop = () => rec.stream.getTracks().forEach((t) => t.stop()); rec.stop() }
    closeComposer()
  }

  function updatePollChoice(i, value) {
    setPollChoices((cs) => cs.map((c, idx) => (idx === i ? value : c)))
  }

  function submitPoll() {
    const question = pollQuestion.trim()
    const choices = pollChoices.map((c) => c.trim()).filter(Boolean)
    if (!connected || !question || choices.length < 2) return
    engine.sendPoll(question, choices, { multi: pollMulti, anon: pollAnon })
    setPollQuestion('')
    setPollChoices(['', ''])
    setPollMulti(true)
    setPollAnon(false)
    closeComposer()
  }

  const votePoll = (id, choice) => { if (connected) engine.votePoll(id, choice) }
  const reactTo = (id, emoji) => { if (connected) engine.sendReaction(id, emoji) }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2 pt-4">
        {display.length === 0 && (
          <div className="pb-4">
            <p className="font-display text-[28px] font-bold text-ink">Ready&hellip; Set&hellip;</p>
            <p className="mt-1 text-sm leading-[1.45] text-ink-muted">
              This is the beginning of the chat room. Type something to kick it off!
            </p>
          </div>
        )}

        {display.map(({ entry, grouped }) => {
          if (entry.kind === 'system') {
            return <p key={'sys-' + entry.id} className="my-2 text-center text-[11px] text-ink-muted">{entry.text}</p>
          }
          if (entry.kind === 'pick') {
            const teams = room.league || null
            const code = DE && teams ? DE.pickCode(entry.overall, teams) : entry.overall
            return (
              <div key={'pick-' + entry.overall} className="my-2 flex items-center gap-2 rounded-md border-l-2 border-l-[#FFD166] bg-[#FFD166]/5 px-2 py-1 text-xs">
                <span className="font-plex text-[10px] tabular-nums text-ink-muted">{code}</span>
                <span className="min-w-0 flex-1 truncate text-ink/80">
                  <b className="font-semibold text-ink">{seatLabel(room, entry.seat, null)}</b> drafted {entry.player}
                </span>
              </div>
            )
          }
          const gif = engine.safeGif(entry.gif)
          const mediaUrl = (entry.type === 'voice' || entry.type === 'photo') ? engine.safeMediaUrl(entry.url) : null
          const named = seatName(room, entry.seat, entry.name)
          const who = seatLabel(room, entry.seat, entry.name)
          const isSystem = entry.seat < 0
          return (
            <div key={'msg-' + entry.id} className={grouped ? 'flex items-start gap-2.5 pl-[42px]' : 'mt-3.5 flex items-start gap-2.5'}>
              {!grouped && (
                <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' + (isSystem ? 'bg-teal-500/[0.16] text-teal-300' : 'bg-slate-panel text-ink-muted')}>
                  {isSystem ? '✦' : seatInitials(named, entry.seat)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="mb-1 flex items-baseline gap-2 text-[11px]">
                    <span className="font-plex text-ink-muted">{chatTime(entry.at)}</span>
                    <button type="button" className="font-bold text-teal-300">Reply</button>
                    <span className="text-[#4C5763]">{who}</span>
                  </p>
                )}
                <MessageBody entry={entry} gif={gif} mediaUrl={mediaUrl} onVote={votePoll} />
                {!!(entry.reacts && entry.reacts.length) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.reacts.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => reactTo(entry.id, r.emoji)}
                        className={'rounded-full border px-1.5 py-0.5 text-[11px] leading-none ' + (r.you ? 'border-teal-400/50 bg-teal-400/15 text-teal-200' : 'border-slate-rule bg-slate-panel text-ink-muted')}
                      >
                        {r.emoji} <span className="tabular-nums">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {composer === 'recording' ? (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.06] px-3 py-2.5">
          <button type="button" onClick={cancelRecording} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted">
            <X className="h-4 w-4" />
          </button>
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-400" />
          <span className="min-w-0 flex-1 truncate font-plex text-xs text-ink-muted">Recording&hellip;</span>
          <span className="shrink-0 font-plex text-meta tabular-nums text-ink">{formatDuration(recSecs)}</span>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500 text-teal-950 disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        </div>
      ) : (
        <>
          {!connected && (
            <p className="shrink-0 border-t border-white/[0.06] px-3 py-1.5 text-center text-[11px] text-amber-300/80">
              Reconnecting — chat will send again once you're back.
            </p>
          )}

          <div className="shrink-0 border-t border-white/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={!connected}
                onClick={() => setComposer((c) => (c === 'tray' ? 'none' : 'tray'))}
                className={'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full disabled:opacity-40 ' + (composer === 'tray' ? 'bg-slate-rule' : 'bg-slate-panel')}
                aria-label="Attach"
              >
                {composer === 'tray' ? <X className="h-4 w-4 text-ink-muted" /> : <Plus className="h-4 w-4 text-ink-muted" />}
              </button>
              <button
                type="button"
                disabled={!connected}
                onClick={() => setComposer((c) => (c === 'gif' ? 'none' : 'gif'))}
                className={'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] font-plex text-[11px] font-semibold disabled:opacity-40 ' + (composer === 'gif' ? 'bg-teal-500/[0.16] text-teal-300' : 'bg-slate-panel text-ink-muted')}
              >
                GIF
              </button>
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                disabled={!connected}
                maxLength={CHAT_MAX}
                placeholder={connected ? 'Start chatting' : 'Reconnecting…'}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                className="min-w-0 flex-1 rounded-full border border-slate-rule bg-slate-panel/50 px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-muted focus:border-teal-400/50 disabled:opacity-50"
              />
              {text.trim() ? (
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!connected}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-teal-500 text-teal-950 disabled:opacity-30"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!connected}
                  onClick={startRecording}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border border-slate-rule text-ink-muted disabled:opacity-40"
                  aria-label="Record a voice message"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
            </div>

            {composer === 'gif' && (
              <div className="mt-2.5 rounded-[14px] border border-slate-rule bg-slate-sunk p-2.5">
                <input
                  autoFocus
                  value={gifQuery}
                  onChange={(e) => handleGifQuery(e.target.value)}
                  placeholder="Search&hellip;"
                  className="mb-2 w-full rounded-[12px] border border-slate-rule bg-slate-panel px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted"
                />
                <div className="mb-2 flex gap-1.5 overflow-x-auto">
                  {GIF_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => pickGifCategory(cat)}
                      className={'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ' + (gifCategory === cat ? 'bg-teal-500 text-teal-950' : 'bg-slate-panel text-ink-muted')}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {gifQuery.trim() && !gifPayload && (
                  <p className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-ink-muted">
                    <SonarPulse width={14} delay={0} /> Searching&hellip;
                  </p>
                )}
                {gifPayload && !gifPayload.configured && <p className="py-3 text-center text-[11px] text-ink-muted">GIFs are not set up for this room yet.</p>}
                {gifPayload && gifPayload.configured && !gifPayload.error && gifPayload.results.length > 0 && (
                  <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto">
                    {gifPayload.results.map((g) => {
                      const url = engine.safeGif(g.url)
                      if (!url) return null
                      return (
                        <button key={g.id} type="button" onClick={() => sendGif(url)} className="overflow-hidden rounded-[12px]">
                          <img src={url} alt={g.alt || 'GIF'} loading="lazy" className="h-24 w-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {composer === 'tray' && (
              <div className="mt-2.5 flex items-center justify-around rounded-[14px] bg-[#1B2637] py-4">
                <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={!connected || busy} className="flex flex-col items-center gap-2">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0D131C] text-[#33EAFF]"><ImageIcon className="h-6 w-6" /></span>
                  <span className="text-sm font-semibold text-ink">Media</span>
                </button>
                <button type="button" onClick={() => cameraInputRef.current && cameraInputRef.current.click()} disabled={!connected || busy} className="flex flex-col items-center gap-2">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0D131C] text-[#33EAFF]"><Camera className="h-6 w-6" /></span>
                  <span className="text-sm font-semibold text-ink">Capture</span>
                </button>
                <button type="button" onClick={() => setComposer('poll')} disabled={!connected} className="flex flex-col items-center gap-2">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0D131C] text-[#33EAFF]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><rect x="4" y="12" width="4" height="8" /><rect x="10" y="6" width="4" height="14" /><rect x="16" y="9" width="4" height="11" /></svg>
                  </span>
                  <span className="text-sm font-semibold text-ink">Poll</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files && e.target.files[0])} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickPhoto(e.target.files && e.target.files[0])} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Portalled to document.body — this sheet is nested inside
          BottomSheet's own `fixed`+`z-30` div, which establishes its own
          stacking context. A `fixed` descendant is positioned against the
          viewport but still PAINTS inside its nearest stacking-context
          ancestor, so a plain `z-[80]` in place here would render behind
          CockpitHeaderPhone's `z-40` bar rather than over it — found by
          driving this composer in a real two-manager room test, where the
          Create button was there, visible, and unclickable: the header's
          own settings icon was intercepting the tap. */}
      {composer === 'poll' && createPortal(
        <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#0D131C] p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={closeComposer} className="text-ink-muted"><X className="h-5 w-5" /></button>
            <button
              type="button"
              onClick={submitPoll}
              disabled={!pollQuestion.trim() || pollChoices.filter((c) => c.trim()).length < 2}
              className="font-plex text-meta font-semibold uppercase tracking-[0.1em] text-teal-300 disabled:opacity-40"
            >
              Create
            </button>
          </div>
          <input
            autoFocus
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Ask something..."
            className="mb-4 w-full bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-[#4C5763]"
          />
          {pollChoices.map((c, i) => (
            <input
              key={i}
              value={c}
              onChange={(e) => updatePollChoice(i, e.target.value)}
              placeholder={`Choice ${i + 1}${i < 2 ? ' (required)' : ''}...`}
              className="mb-3 h-12 w-full rounded-[14px] border border-slate-rule bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          ))}
          {pollChoices.length < 8 && (
            <button
              type="button"
              onClick={() => setPollChoices((cs) => [...cs, ''])}
              className="mb-4 flex h-12 w-full items-center justify-between rounded-[14px] border border-slate-rule px-4 text-sm text-ink"
            >
              Add choice <span>+</span>
            </button>
          )}
          <div className="rounded-[14px] border border-slate-rule bg-[#111A26] p-4">
            <p className="mb-3 text-base text-ink">Poll Settings</p>
            <div className="flex items-center justify-between py-2">
              <span className="font-plex text-xs text-ink-muted">MULTI-SELECT</span>
              <button
                type="button"
                onClick={() => setPollMulti((v) => !v)}
                className={'relative h-[27px] w-12 rounded-full ' + (pollMulti ? 'bg-[#33EAFF]' : 'bg-slate-rule')}
              >
                <span className="absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-[left]" style={{ left: pollMulti ? 24 : 3 }} />
              </button>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-plex text-xs text-ink-muted">ANONYMOUS VOTING</span>
              <button
                type="button"
                onClick={() => setPollAnon((v) => !v)}
                className={'relative h-[27px] w-12 rounded-full ' + (pollAnon ? 'bg-[#33EAFF]' : 'bg-slate-rule')}
              >
                <span className="absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-[left]" style={{ left: pollAnon ? 24 : 3 }} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
