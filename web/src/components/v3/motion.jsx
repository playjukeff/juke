import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, animate, motion, useReducedMotion } from 'framer-motion'

/* Juke v3 — motion. The one place a v3 component gets a duration, an easing,
   a spring or an entrance from. Components use these; they do not write
   their own numbers.

   ---- What is borrowed from Sleeper, and what is not ----

   The owner asked for Sleeper's mannerisms. What transfers is the GRAMMAR —
   when something moves, in what order, and what the movement says — never
   the look. v3 keeps its own rules: its tokens only, no gradient, glass,
   glow, particle or emoji, cobalt for the one primary action.

     Sleeper                         v3
     sub-copy written word by word   StreamText: a short plain sentence,
                                     blurred to sharp, one word at a time
     sections rise as they enter     useReveal: the first viewport of a
                                     page rises 12px on arrival, once --
                                     and NOT as sections scroll past
     the product plays itself        SampleBoard (draft/): shotPicks() on a
                                     loop-free, pausable sample grid
     numbers tick, bars fill         CountUp / CountText / BarFill
     a ranked row slides as it moves layout rows (LAYOUT_ROW) for tables
                                     that re-order now and then; useFlip for
                                     the live draft's pool, feed and ribbon,
                                     which change on every pick

   ---- Three rules every primitive here keeps ----

   1. Reduced motion renders the final state, immediately. MotionRoot sets
      Framer's reducedMotion="user" for anything declarative, and every
      imperative primitive below asks useReducedMotion() and returns before
      touching a style.
   2. Nothing in the first viewport is hidden on first paint. An element
      mounted in view before the reader has navigated anywhere is at rest —
      no opacity-0 hero, and a screenshot of a cold load shows every word.
      Motion is earned: by a route change (the new page's first viewport
      plays), or by scrolling (a Sheet below the fold rises as it enters).
   3. Nothing waits on an animation. Every one runs on transform, opacity
      or a word's blur; none holds input, none sets state a control needs,
      and the value at rest is always the engine's — a count that is
      interrupted lands on the real number, never an intermediate. */

export { AnimatePresence, LayoutGroup, animate, motion }

/* ---- Imperative motion on an element ----

   Native Web Animations, never Framer's animate(el, ...), for everything
   imperative here. Framer commits an animation's last value as an inline
   style on a later frame — after any "clear it when it lands" callback has
   run — so every Sheet that rose was left carrying transform:translateY(0px),
   and a transform on a Sheet traps any position:fixed drawer inside it and
   gives it a stacking context it never asked for. fill:'backwards' holds the
   first frame through a delay and leaves NOTHING behind when it ends: the
   element simply returns to its own CSS. Callers set the hidden state inline
   only while an entrance waits to be seen, and drop it the moment the
   animation starts holding it instead. Framer's animate() stays for numbers
   (CountUp), where nothing is written to an element. */
const cssEase = (e) => (Array.isArray(e) ? `cubic-bezier(${e.join(',')})` : e || 'ease')
export function playOn(el, keyframes, { duration, ease = EASE.out, delay = 0 } = {}) {
  if (!el || typeof el.animate !== 'function') return null
  return el.animate(keyframes, { duration: duration * 1000, delay: delay * 1000, easing: cssEase(ease), fill: 'backwards' })
}
/* Resolves when every one has finished; a cancelled one rejects, which the
   caller ignores — a cancel is always a cleanup that has already landed. */
export function allDone(list) {
  return Promise.all(list.filter(Boolean).map((a) => a.finished))
}
export function cancelAll(list) {
  for (const a of list) { try { if (a) a.cancel() } catch { /* already gone */ } }
}

/* ---- Tokens ---- */

/* Seconds. `stream` is one word's blur-to-sharp; `count` is a figure's tick
   and the bar that fills with it, so the two land together. Exits run at
   about sixty per cent of an entrance, so leaving never feels slower than
   arriving. */
export const DUR = {
  press: 0.12,
  micro: 0.18,
  item: 0.38,
  enter: 0.5,
  stream: 0.55,
  count: 0.9,
  land: 0.45,
  exit: 0.3,
  flip: 0.42,
}

/* Deceleration for everything that arrives — an expo-shaped out curve, so a
   rise settles rather than coasts. Linear only for constant-rate progress
   (the pick clock). */
export const EASE = {
  out: [0.16, 1, 0.3, 1],
  soft: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
}

/* Springs, by what they carry. Data rows are near-critically damped
   (damping ratio ≈ 0.94): an overshoot on a ranked table reads as sloppy.
   A toggle is stiff. A landing — a pick, the grade's letter — is allowed a
   little overshoot, because arriving is the point of it. */
export const SPRING = {
  layout: { type: 'spring', stiffness: 520, damping: 43, mass: 1 },
  toggle: { type: 'spring', stiffness: 700, damping: 38, mass: 0.8 },
  land: { type: 'spring', stiffness: 460, damping: 24, mass: 0.9 },
  nudge: { type: 'spring', stiffness: 380, damping: 22, mass: 0.8 },
}

/* A stagger only ever runs inside one Sheet, a few items deep: past eight
   the last item arrives late enough to read as lag. Words step faster, and
   a whole sentence is capped so a long one is not a slow one. */
export const STAGGER = { item: 0.045, cap: 8, word: 0.04, words: 0.9 }

/* How far a Sheet rises, and how far an item inside it rises. Small enough
   to read as a fade that knows which way is up, not as a slide. */
export const RISE = 12
export const RISE_ITEM = 8

/* Streamed text is for a short plain sentence: at most this many words,
   and no digit anywhere in it — a figure is never written in live. */
export const STREAM_MAX_WORDS = 28

/* Class strings for the two micro-interactions CSS does better than JS.
   PRESS: a button gives under the finger. LIFT: a card rises a pixel, on a
   device that actually hovers — never on touch, where hover sticks. */
export const PRESS = 'transition-[transform,color,background-color,border-color] duration-150 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-colors'
export const LIFT = 'transition-[transform,color,background-color,border-color] duration-200 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 motion-reduce:transform-none'

/* A ranked row that moves when its list re-orders: position only, so a row
   that also changes size (a wrapped name) never squashes. For lists that
   re-order now and then (standings, a sorted table), on Framer's layout. */
export const LAYOUT_ROW = { layout: 'position', transition: { layout: SPRING.layout } }

/* ---- The layout-list helper, for lists that move on every pick ----

   The live draft's pool, pick feed, ribbon and board change on EVERY pick,
   and there a motion component per row is a cost paid on every render —
   measured at 4x CPU throttle it added about 90ms of main-thread work a
   pick. So those lists stay plain elements and this hook does FLIP by hand,
   after each commit: every element marked data-flip="<stable key>" inside
   `ref` has its layout position (offsetTop, or offsetLeft on the x axis —
   layout, so a scrolled container does not read as movement) compared with
   where it was after the last commit; one that moved is played from its old
   place to its new one on transform, and one that is new plays `enter`.
   A move that interrupts a move starts from where the row is drawn, not
   where it was laid out, so nothing jumps. The first commit only records.

   Only the first `limit` marked elements animate — past that a row is off
   screen or not worth the work — and `disabled` (reduced motion) records
   positions without animating anything. Reads, then transform-only writes:
   no layout is invalidated between one read and the next. */
export function useFlip(ref, { axis = 'y', limit = 24, disabled = false, enter = null } = {}) {
  const last = useRef(null)
  const running = useRef(new Map())
  useIsoLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const prop = axis === 'x' ? 'offsetLeft' : 'offsetTop'
    const tf = (v) => (axis === 'x' ? `translateX(${v}px)` : `translateY(${v}px)`)
    const els = box.querySelectorAll('[data-flip]')
    const next = new Map()
    const prev = last.current
    const n = Math.min(els.length, limit + 8)
    for (let i = 0; i < n; i++) {
      const el = els[i]
      const k = el.getAttribute('data-flip')
      const pos = el[prop]
      next.set(k, pos)
      if (!prev || disabled || i >= limit) continue
      if (!prev.has(k)) {
        if (enter) running.current.set(k, playOn(el, enter.keyframes, enter.options))
        continue
      }
      const was = prev.get(k)
      if (Math.abs(was - pos) < 0.5) continue
      let carry = 0
      const busy = running.current.get(k)
      if (busy && busy.playState === 'running') {
        try {
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
          carry = axis === 'x' ? m.m41 : m.m42
        } catch { carry = 0 }
        busy.cancel()
      }
      running.current.set(k, playOn(el, [{ transform: tf(was - pos + carry) }, { transform: tf(0) }], { duration: DUR.flip, ease: EASE.out }))
    }
    last.current = next
    if (running.current.size > 64) for (const [k, a] of running.current) if (!a || a.playState !== 'running') running.current.delete(k)
  })
  useEffect(() => () => { cancelAll([...running.current.values()]) }, [])
}

/* ---- When motion is allowed ---- */

/* A route change arms entrances. Registered once, at import, so it runs
   before the app's own hashchange listener re-renders the new page; the
   short window after it says "this mount belongs to a route change", when
   the page is about to be scrolled back to its top. */
let navigated = false
let routeFreshUntil = 0
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    navigated = true
    routeFreshUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 700
  })
}
export const hasNavigated = () => navigated

/* prefers-reduced-motion, read once and kept current. The hooks below also
   ask Framer's useReducedMotion(); this is for code that runs outside a
   render (an IntersectionObserver callback, a timer). */
let reducedPref = false
if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedPref = mq.matches
    const on = (e) => { reducedPref = e.matches }
    if (mq.addEventListener) mq.addEventListener('change', on)
    else if (mq.addListener) mq.addListener(on)
  } catch { reducedPref = false }
}
export const prefersReduced = () => reducedPref

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/* Entrances off for a subtree. The live draft wraps itself in this: motion
   there is decoration after the fact — the ring, the ribbon, the feed —
   and a rail Sheet rising every time a tab is switched is not. */
const Quiet = createContext(false)
export function Still({ children }) {
  return <Quiet.Provider value>{children}</Quiet.Provider>
}

export function MotionRoot({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/* 'rest' — draw the final state now; 'play' — animate now; 'wait' — below
   the fold, animate when it enters. Measured before paint. */
function gateFor(el) {
  if (!el || typeof window === 'undefined') return 'rest'
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return 'rest'
  const vh = window.innerHeight || 0
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  // A mount that belongs to a route change is judged against where it will
  // sit once the new page is scrolled to its top, not against the scroll
  // position of the page it replaced.
  const top = now < routeFreshUntil ? r.top + (window.scrollY || 0) : r.top
  const bottom = top + r.height
  const inView = top < vh - 1 && bottom > 1
  if (inView) return navigated ? 'play' : 'rest'
  return top >= vh - 1 ? 'wait' : 'rest'
}

function whenSeen(el, run) {
  if (typeof IntersectionObserver === 'undefined') { run(); return () => {} }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run() }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 })
  io.observe(el)
  return () => io.disconnect()
}

/* Whether this component may animate at all: not reduced, not in a Still
   subtree. */
export function useMotionOK() {
  const reduce = useReducedMotion()
  const quiet = useContext(Quiet)
  return !reduce && !quiet && !reducedPref
}

/* Reduced motion alone — for the live draft's own after-the-fact motion
   (the ring, the ribbon, a pick landing), which runs inside a Still
   subtree and must still stand down for a reader who asked it to. */
export function useCalm() {
  const reduce = useReducedMotion()
  return !!reduce || reducedPref
}

/* The entrance decision as React state, for primitives that render
   differently while they play (StreamText, CountUp, the grade). */
export function useEntrance(ref, { disabled = false } = {}) {
  const ok = useMotionOK()
  const [phase, setPhase] = useState('rest')
  useIsoLayoutEffect(() => {
    if (disabled || !ok) return undefined
    const g = gateFor(ref.current)
    if (g === 'rest') return undefined
    if (g === 'play') { setPhase('play'); return undefined }
    setPhase('wait')
    return whenSeen(ref.current, () => setPhase('play'))
    // Decided once, at mount: an entrance is a first view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return phase
}

function hideNow(el, y) {
  el.style.opacity = '0'
  if (y) el.style.transform = `translateY(${y}px)`
}
function clearNow(el) {
  el.style.opacity = ''
  el.style.transform = ''
  el.style.filter = ''
  el.style.willChange = ''
}

/* A Sheet rises once, on ARRIVAL, and the items in it marked data-rise
   follow in a short stagger.

   Arrival only, and that is the whole rule: a route change plays the new
   page's first viewport and nothing else. A Sheet below the fold is
   simply THERE when the reader reaches it — it does not fade and rise as
   it scrolls into view.

   That was the earlier behaviour and it is the one entrance pattern worth
   naming as a mistake. A page of 7 to 12 sections each fading and rising
   as it enters is the generic default — it reads as a template rather
   than as this product, it puts motion in front of a reader who is
   scrolling BECAUSE they want to read the next thing, and it makes every
   section equally important by giving them all the same gesture. One
   orchestrated moment per navigation lands harder than a dozen scattered
   ones, and it costs the reader nothing when they are hunting for a
   number further down the page.

   What is kept is the moment that answers something the reader did: they
   opened this page, so its first screen assembles once. Everything below
   is at rest. The value primitives (CountUp, BarFill) still wait to be
   seen before they run, because those animate a number IN PLACE rather
   than moving a section — they show what a figure is, which is the kind
   of motion worth having.

   Imperative on purpose: a Sheet can hold a whole page's worth of rows,
   and re-rendering them to move one transform would cost more than the
   motion is worth. Styles are cleared when it lands, so no transform is
   left behind to trap a sticky child or a fixed drawer. */
export function useReveal(ref, { y = RISE, disabled = false, items = true } = {}) {
  const ok = useMotionOK()
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || disabled || !ok) return undefined
    // 'play' only: 'wait' (below the fold) and 'rest' (a cold load) are
    // both at rest now, so only a route change's first viewport animates.
    if (gateFor(el) !== 'play') return undefined
    const kids = items ? [...el.querySelectorAll('[data-rise]')].slice(0, 16) : []
    hideNow(el, y)
    kids.forEach((k) => hideNow(k, RISE_ITEM))
    const running = []
    let alive = true
    const play = () => {
      if (!alive) return
      if (!reducedPref) {
        running.push(playOn(el, [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'translateY(0px)' }], { duration: DUR.enter }))
        kids.forEach((k, i) => {
          running.push(playOn(k, [{ opacity: 0, transform: `translateY(${RISE_ITEM}px)` }, { opacity: 1, transform: 'translateY(0px)' }], {
            duration: DUR.item, delay: 0.08 + Math.min(i, STAGGER.cap) * STAGGER.item,
          }))
        })
      }
      // The animations hold the first frame now; the inline hold goes, so
      // nothing is left on the element when they end.
      clearNow(el)
      kids.forEach(clearNow)
    }
    play()
    return () => {
      alive = false
      cancelAll(running)
      clearNow(el)
      kids.forEach(clearNow)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/* A generic block that rises in — for the few places that are not a Sheet
   but read as one (the Now hero's paragraph, a card group). */
export function Reveal({ as: Tag = 'div', y = RISE, children, ...rest }) {
  const ref = useRef(null)
  useReveal(ref, { y })
  return <Tag ref={ref} {...rest}>{children}</Tag>
}

/* ---- Streamed text ---- */

function streamable(text, max) {
  if (typeof text !== 'string') return null
  if (/\d/.test(text)) return null
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length || words.length > max) return null
  return words
}

/* A short sentence arrives the way Sleeper writes its sub-copy: word by
   word, each one going from blurred and transparent to sharp. Only a plain
   string of at most STREAM_MAX_WORDS words and no digits — never data, and
   never a paragraph. Anything else gets the plain rise of a block, or
   nothing at all when it is at rest.

   The words stay as spans once written (their styles cleared) rather than
   being swapped back for a text node, so nothing reflows at the end. */
export function StreamText({ text, as: Tag = 'span', className = '', max = STREAM_MAX_WORDS, stream = true, ...rest }) {
  const ref = useRef(null)
  const words = stream ? streamable(text, max) : null
  const phase = useEntrance(ref, { disabled: !words })
  const [written, setWritten] = useState(false)
  const blockRef = useRef(null)
  useReveal(blockRef, { y: RISE_ITEM, disabled: !!words || typeof text !== 'string', items: false })

  useIsoLayoutEffect(() => {
    if (phase !== 'play' || written || !ref.current) return undefined
    const spans = ref.current.querySelectorAll('[data-w]')
    if (!spans.length) return undefined
    const step = Math.min(STAGGER.word, STAGGER.words / spans.length)
    const running = [...spans].map((s, i) => playOn(s, [
      { opacity: 0, filter: 'blur(8px)', transform: 'translateY(0.14em)' },
      { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0em)' },
    ], { duration: DUR.stream, ease: EASE.soft, delay: i * step }))
    // The animations hold the veil now. React's style prop is unchanged
    // until `written`, so it does not write the veil back meanwhile.
    spans.forEach(clearNow)
    let alive = true
    allDone(running).then(() => { if (alive) setWritten(true) }, () => {})
    // Interrupted (unmounted, or the text replaced): land on the words.
    return () => { alive = false; cancelAll(running); spans.forEach(clearNow) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (!words) {
    return <Tag ref={blockRef} className={className} {...rest}>{text}</Tag>
  }
  if (phase === 'rest') {
    return <Tag ref={ref} className={className} {...rest}>{text}</Tag>
  }
  // Hidden only while waiting or writing; once written (or if the text is
  // replaced afterwards) every word is simply drawn.
  const veil = !written ? { opacity: 0, filter: 'blur(8px)', transform: 'translateY(0.14em)' } : undefined
  return (
    <Tag ref={ref} className={className} {...rest}>
      {words.map((w, i) => (
        <span key={i}>
          <span data-w="" className="inline-block" style={veil}>{w}</span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  )
}

/* ---- Figures ---- */

/* A figure, drawn at its value.

   It used to count up to that value on first view. It does not any more,
   and the reason is a report rather than a preference: the playoff-odds
   figure was captured reading 63%, then 71%, then 75% in consecutive
   frames. A number that is still moving is a number a reader cannot act
   on, and every figure in this product exists to be acted on — the whole
   claim is that a call arrives with its arithmetic beside it. An
   animation that makes the arithmetic unreadable for 600ms is spending
   the one thing the page is for.

   The component survives rather than its 17 call sites being edited: the
   signature is unchanged, `format` and the dash for a missing value still
   hold, and there is one place to look if this is ever reversed. `from`
   and `duration` are accepted and ignored for the same reason.

   Motion still belongs on this page — it is on the bar beside the figure
   (BarFill), on a section arriving (useReveal), on a sentence being
   written in (StreamText). None of those change what a number says. */
export function CountUp({ value, format = defaultFormat, className = '', as: Tag = 'span', from, duration, ...rest }) {
  const valid = typeof value === 'number' && Number.isFinite(value)
  return <Tag className={className} {...rest}>{valid ? format(value) : '—'}</Tag>
}

function defaultFormat(v) {
  return String(Math.round(v))
}

/* Count a figure that already arrives as text — "80%", "820.0", "$100",
   "+8.1" — without the caller having to take it apart. Only a string with
   exactly one number in it, no thousands separators and no ordinal suffix
   (an ordinal's suffix changes with its number, so "0rd" would be a lie on
   the way up). Anything else — "4-4", "3rd", "Order" — is drawn as it is.
   The prefix, the suffix and the number of decimals are the original's, so
   the text at rest is the text that was passed in, character for
   character. */
const ONE_NUMBER = /^([^\d]*?)(\d+(?:\.\d+)?)([^\d]*)$/
export function CountText({ text, className = '', as: Tag = 'span', ...rest }) {
  const m = typeof text === 'string' ? ONE_NUMBER.exec(text) : null
  if (!m || /^(st|nd|rd|th)\b/i.test(m[3]) || /,/.test(text)) {
    return <Tag className={className} {...rest}>{text}</Tag>
  }
  const [, pre, num, post] = m
  const dp = num.includes('.') ? num.split('.')[1].length : 0
  const fmt = (v) => `${pre}${Math.max(0, v).toFixed(dp)}${post}`
  return <CountUp value={Number(num)} format={fmt} className={className} as={Tag} {...rest} />
}

/* ---- A bar that fills with its number ---- */

/* The fill of a horizontal bar. It keeps whatever width/left/right its
   caller gives it — the bar's own geometry never changes — and moves on
   transform only: scaleX from 0 on first view, and from the old length to
   the new one when the value changes. Same duration and curve as CountUp,
   so a figure and its bar land on the same frame. `origin` is the end the
   bar grows from (right for a negative value drawn left of a zero axis). */
export function BarFill({ width, origin = 'left', className = '', style = {} }) {
  const ref = useRef(null)
  const ok = useMotionOK()
  const last = useRef(null)
  const started = useRef(false)
  const pct = typeof width === 'number' ? width : parseFloat(width) || 0

  useIsoLayoutEffect(() => {
    const el = ref.current
    last.current = pct
    if (!el || !ok || pct <= 0) { started.current = true; return undefined }
    const g = gateFor(el)
    if (g === 'rest') { started.current = true; return undefined }
    el.style.transform = 'scaleX(0)'
    let c = null
    const play = () => {
      started.current = true
      c = playOn(el, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DUR.count, ease: EASE.soft })
      el.style.transform = ''
    }
    const stop = g === 'play' ? (play(), () => {}) : whenSeen(el, play)
    return () => { stop(); cancelAll([c]); el.style.transform = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useIsoLayoutEffect(() => {
    const el = ref.current
    const prev = last.current
    last.current = pct
    if (!el || !started.current || !ok || prev === null || prev === pct || pct <= 0 || prev <= 0) return undefined
    const from = Math.max(0, Math.min(4, prev / pct))
    const c = playOn(el, [{ transform: `scaleX(${from})` }, { transform: 'scaleX(1)' }], { duration: DUR.count * 0.7, ease: EASE.soft })
    return () => cancelAll([c])
  }, [pct])

  return <span ref={ref} className={className} style={{ ...style, transformOrigin: origin === 'right' ? 'right center' : 'left center' }} />
}

/* ---- A value that has just changed ---- */

/* Returns a key that bumps each time `value` changes after mount, and
   whether this render is that first moment — for "move the card, don't
   just recolour it" state changes. */
export function useChanged(value) {
  const prev = useRef(value)
  const mounted = useRef(false)
  const changed = mounted.current && prev.current !== value
  useEffect(() => { mounted.current = true; prev.current = value }, [value])
  return changed
}
