import { useEffect, useRef, useState } from 'react'

/* A9: a clipped label may not be the only copy of its value a reader can
   reach. Team and manager names wrap instead (there is room for them); what
   is still `truncate` is a chip, a badge or a cell that genuinely has to hold
   one line, and this is the accessible path to the rest of it.

   One layer rather than a wrapper at ~140 call sites: a wrapper is a second
   thing every future `truncate` has to remember, and the one that forgets is
   the defect. This reads the DOM instead — an element is marked only while it
   is ACTUALLY clipped (scrollWidth past clientWidth), so the same span at a
   width where it fits gets nothing.

   Three ways in, because the brief names three:
   - pointer: hover shows it;
   - keyboard: a clipped element outside any control becomes focusable
     (tabindex 0), and focusing it — or the link or button it sits in —
     shows it;
   - touch: a tap on a clipped element that is not itself a control shows it,
     and a second tap anywhere hides it.
   Screen readers never needed any of this: the full text is in the DOM. */

const SEL = '[data-v3-root] .truncate'
// Things a keyboard can land on. [tabindex="-1"] is excluded on purpose:
// <main> carries it so a skip link can focus it, and counting it as a
// control meant nothing inside the page ever got its own stop.
const INTERACTIVE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[role="button"]'

function mark(root) {
  root.querySelectorAll(SEL).forEach((el) => {
    const clipped = el.scrollWidth > el.clientWidth + 1
    const text = (el.textContent || '').trim()
    if (clipped && text) {
      if (el.dataset.full !== text) el.dataset.full = text
      if (!el.closest(INTERACTIVE) && !el.hasAttribute('tabindex')) { el.tabIndex = 0; el.dataset.fullFocus = '1' }
    } else if (el.dataset.full !== undefined) {
      delete el.dataset.full
      if (el.dataset.fullFocus) { el.removeAttribute('tabindex'); delete el.dataset.fullFocus }
    }
  })
}

function clippedIn(target) {
  if (!(target instanceof Element)) return null
  if (target.dataset && target.dataset.full) return target
  const inner = target.matches(INTERACTIVE) ? target.querySelector('[data-full]') : null
  return inner || target.closest('[data-full]')
}

export default function FullValueTips() {
  const [tip, setTip] = useState(null)
  const at = useRef(null)

  useEffect(() => {
    let raf = 0
    const scan = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => mark(document)) }
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', scan)
    scan()
    return () => { mo.disconnect(); window.removeEventListener('resize', scan); cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    const place = (el) => {
      const r = el.getBoundingClientRect()
      if (r.bottom < 0 || r.top > window.innerHeight) { at.current = null; setTip(null); return }
      setTip({ text: el.dataset.full, x: Math.max(8, Math.min(r.left, window.innerWidth - 328)), y: r.bottom + 6 })
    }
    const show = (el) => { at.current = el; place(el) }
    const hide = () => { at.current = null; setTip(null) }
    // Focusing an element scrolls it into view, so a tip that closed on
    // scroll closed the instant a keyboard reached it. It follows instead,
    // and leaves once its element is off screen.
    const follow = () => { if (at.current) place(at.current) }
    const over = (e) => { if (e.pointerType === 'mouse') { const el = clippedIn(e.target); if (el) show(el) } }
    const out = (e) => { if (e.pointerType === 'mouse' && clippedIn(e.target)) hide() }
    const focus = (e) => { const el = clippedIn(e.target); if (el) show(el); else hide() }
    const tap = (e) => {
      if (e.pointerType === 'mouse') return
      const el = clippedIn(e.target)
      if (el && !e.target.closest('a,button')) show(el); else hide()
    }
    const key = (e) => { if (e.key === 'Escape') hide() }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('pointerdown', tap)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', tap)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', follow, true)
    }
  }, [])

  if (!tip) return null
  return (
    <div
      role="tooltip"
      data-full-tip
      style={{ left: tip.x, top: tip.y }}
      className="pointer-events-none fixed z-[70] max-w-[320px] rounded-[6px] bg-v3-ink px-3 py-2 text-[14px] font-medium leading-snug text-v3-sheet shadow-[0_8px_24px_-12px_rgb(var(--v3-shade)/0.5)]"
    >
      {tip.text}
    </div>
  )
}
