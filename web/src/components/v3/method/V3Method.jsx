import { useEffect, useRef, useState } from 'react'
import { CallButton, Headline, Icon, Label, QuietButton, Skeleton, cx } from '../ui.jsx'
import { XIcon } from '../record/recordParts.jsx'
import { hashQuery, replaceQuery, scrollPageTo } from '../record/recordKit.js'

/* Method — the how-it-works page, the privacy policy and the terms, set in
   the call sheet's type. Re-typeset, never rewritten.

   The words live in docs/*.html and nowhere else. This fetches the same
   document production serves, takes its <main class="doc">, strips anything
   that can run, drops the page's own contents list and back link (the rail
   here replaces both), and draws it. A second copy of the method in JSX is
   the "written down twice" failure this project has a rule about, and the
   copy that would drift first is the privacy policy — the one page where a
   stale sentence is a legal problem rather than a design one.

   ---- The hash is the router, so the document's own anchors are caught ----

   The docs link sections as href="#s06". Followed here, that would replace
   #/v3/method/how-it-works with #s06 and the app would route home. So a
   section link scrolls instead, links between the three docs and back into
   the app are rewritten to their v3 addresses, and outside links open in a
   new tab. A section is deep-linkable as ?s=s06, and moving through the
   contents keeps the address on the section you are reading — written with
   replaceState, because a hashchange runs app.js's router, which scrolls to
   the top. */

const DOCS = {
  'how-it-works': { file: '/docs/draft-room-how-it-works.html', label: 'How it works', kicker: 'Method · how Juke calls it' },
  privacy: { file: '/docs/privacy.html', label: 'Privacy', kicker: 'Method · privacy policy' },
  terms: { file: '/docs/terms.html', label: 'Terms', kicker: 'Method · terms of service' },
}

function sanitize(root) {
  root.querySelectorAll('script, style, link, meta, iframe, object, embed, form, input, button, noscript').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name)
      if ((a.name === 'href' || a.name === 'src' || a.name === 'xlink:href') && /^\s*(javascript|data|vbscript):/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
}

/* A link out of a document, onto its v3 address. */
function mapHref(href) {
  const sec = href.includes('#s') ? href.split('#')[1] : null
  if (/draft-room-how-it-works\.html/.test(href)) return '#/v3/method/how-it-works' + (sec ? `?s=${sec}` : '')
  if (/privacy\.html/.test(href)) return '#/v3/method/privacy' + (sec ? `?s=${sec}` : '')
  if (/terms\.html/.test(href)) return '#/v3/method/terms' + (sec ? `?s=${sec}` : '')
  if (/index\.html#\/rooms\/draft/.test(href)) return '#/v3/draft'
  if (/index\.html/.test(href) || href === '/' || href === '../') return '#/v3'
  return href
}

async function load(doc) {
  const res = await fetch(DOCS[doc].file, { cache: 'no-cache' })
  if (!res.ok) throw new Error(String(res.status))
  const html = await res.text()
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const main = dom.querySelector('main.doc') || dom.querySelector('main')
  if (!main) throw new Error('no document')
  sanitize(main)
  main.querySelectorAll('.toc, .backlink').forEach((n) => n.remove())
  main.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href') || ''
    if (!h.startsWith('#')) a.setAttribute('href', mapHref(h))
    if (/^https?:/i.test(a.getAttribute('href'))) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
  // A wide table scrolls inside its own wrapper; the page never scrolls
  // sideways. The wrapper carries the white ground, because style.css's
  // bare `table { background: var(--card) }` is the dark theme's card.
  main.querySelectorAll('table').forEach((t) => {
    const wrap = dom.createElement('div')
    wrap.className = 'doc-table'
    t.parentNode.insertBefore(wrap, t)
    wrap.appendChild(t)
  })
  const h1 = dom.querySelector('h1')
  const title = (h1 && h1.textContent.trim()) || DOCS[doc].label
  const toc = [...main.querySelectorAll('h2[id]')].map((h) => {
    const no = h.querySelector('.no')
    const n = no ? no.textContent.trim() : ''
    return { id: h.id, no: n, text: h.textContent.replace(n, '').trim() }
  })
  return { title, html: main.innerHTML, toc }
}

/* Two frames: after V3App's own scroll-to-top for a new address has run. */
function afterPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

function NotFound({ doc }) {
  return (
    <div className="grid min-h-[40vh] content-center gap-6">
      <Label>Method · no such document</Label>
      <Headline>That page isn&apos;t in the method.</Headline>
      <p className="max-w-[56ch] text-[17px] leading-[1.55] text-v3-ink2">
        There is no document called <span className="font-figure text-v3-ink">{String(doc).slice(0, 40)}</span>. The method is three pages, and all three are here.
      </p>
      <div className="flex flex-wrap gap-2">
        <CallButton href="#/v3/method/how-it-works">How Juke calls it <Icon name="arrow" className="h-4 w-4" /></CallButton>
        <QuietButton href="#/v3/method/privacy">Privacy</QuietButton>
        <QuietButton href="#/v3/method/terms">Terms</QuietButton>
      </div>
    </div>
  )
}

/* The three documents, as links styled like a segmented control. Links and
   not buttons — each is a different address — so the chosen one carries
   aria-current rather than aria-pressed, and ink rather than cobalt. */
function DocSwitch({ current }) {
  return (
    <nav aria-label="Method documents" className="inline-flex max-w-full self-start overflow-x-auto rounded-[6px] border border-v3-rule bg-v3-sheet p-[3px] lg:self-end">
      {Object.entries(DOCS).map(([k, d]) => (
        <a
          key={k}
          href={`#/v3/method/${k}`}
          aria-current={k === current ? 'page' : undefined}
          className={cx(
            'inline-flex min-h-[38px] shrink-0 items-center rounded-[4px] px-3 font-figure text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
            k === current ? 'bg-v3-band text-white' : 'text-v3-ink2 hover:text-v3-ink',
          )}
        >
          {d.label}
        </a>
      ))}
    </nav>
  )
}

/* The prose, in v3 type. Headings step onto <Headline>'s scale (section for
   h2, block for h3), the section number sits above as a label, tables sit in
   scroll wrappers on white, and the measure stays readable. */
const PROSE = [
  'max-w-[68ch] text-[17px] leading-[1.7] text-v3-ink2',
  '[&_p]:mt-4 [&_.doc-intro]:mt-0 [&_.doc-intro]:text-[20px] [&_.doc-intro]:leading-[1.55] [&_.doc-intro]:text-v3-ink',
  '[&_h2]:mt-16 [&_h2]:scroll-mt-[68px] md:[&_h2]:scroll-mt-[60px] lg:[&_h2]:scroll-mt-[20px] [&_h2]:font-sheet [&_h2]:text-[clamp(1.6rem,3vw,2.25rem)] [&_h2]:font-black [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.025em] [&_h2]:text-v3-ink [&_h2]:[text-wrap:balance]',
  '[&_h2_.no]:mb-2 [&_h2_.no]:block [&_h2_.no]:font-figure [&_h2_.no]:text-[12px] [&_h2_.no]:font-semibold [&_h2_.no]:uppercase [&_h2_.no]:tracking-[0.12em] [&_h2_.no]:text-v3-ink3',
  '[&_h3]:mt-10 [&_h3]:scroll-mt-[68px] md:[&_h3]:scroll-mt-[60px] lg:[&_h3]:scroll-mt-[20px] [&_h3]:font-sheet [&_h3]:text-[20px] [&_h3]:font-black [&_h3]:leading-[1.2] [&_h3]:tracking-[-0.02em] [&_h3]:text-v3-ink',
  '[&_b]:font-semibold [&_b]:text-v3-ink [&_strong]:font-semibold [&_strong]:text-v3-ink [&_em]:not-italic [&_em]:text-v3-ink [&_i]:not-italic',
  '[&_a]:font-medium [&_a]:text-v3-ink [&_a]:underline [&_a]:decoration-v3-rule [&_a]:decoration-2 [&_a]:underline-offset-4 hover:[&_a]:decoration-v3-ink',
  '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_li]:marker:text-v3-ink3',
  '[&_.formula]:mt-5 [&_.formula]:overflow-x-auto [&_.formula]:rounded-[6px] [&_.formula]:border [&_.formula]:border-v3-rule [&_.formula]:bg-v3-well [&_.formula]:p-4 [&_.formula]:font-figure [&_.formula]:text-[15px] [&_.formula]:leading-[1.7] [&_.formula]:text-v3-ink',
  '[&_.formula>div]:pl-4 [&_.formula>div]:-indent-4',
  '[&_.note]:mt-5 [&_.note]:rounded-[6px] [&_.note]:border [&_.note]:border-v3-rule [&_.note]:border-l-[4px] [&_.note]:border-l-v3-band [&_.note]:bg-v3-sheet [&_.note]:px-4 [&_.note]:py-3.5 [&_.note]:text-[16px] [&_.note]:leading-[1.6]',
  '[&_.worked]:mt-5 [&_.worked]:overflow-hidden [&_.worked]:rounded-[6px] [&_.worked]:border [&_.worked]:border-v3-rule [&_.worked]:bg-v3-sheet [&_.worked]:px-4 [&_.worked]:pb-4 [&_.worked]:pt-0 [&_.worked]:text-[16px]',
  '[&_.worked-title]:-mx-4 [&_.worked-title]:!mt-0 [&_.worked-title]:mb-3 [&_.worked-title]:bg-v3-band [&_.worked-title]:px-4 [&_.worked-title]:py-2.5 [&_.worked-title]:font-figure [&_.worked-title]:text-[12px] [&_.worked-title]:font-bold [&_.worked-title]:uppercase [&_.worked-title]:tracking-[0.14em] [&_.worked-title]:text-white',
  '[&_.doc-table]:mt-5 [&_.doc-table]:max-w-full [&_.doc-table]:overflow-x-auto [&_.doc-table]:rounded-[6px] [&_.doc-table]:border [&_.doc-table]:border-v3-rule [&_.doc-table]:bg-v3-sheet',
  '[&_table]:w-full [&_table]:border-0 [&_table]:bg-v3-sheet [&_table]:text-[15px] [&_table]:leading-[1.5] [&_table]:rounded-none',
  '[&_td]:border-b [&_td]:border-v3-rule [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:border-b [&_th]:border-v3-rule [&_th]:bg-v3-paper [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-v3-ink3 [&_tr:last-child_td]:border-b-0',
  '[&_.k]:whitespace-nowrap [&_.k]:font-semibold [&_.k]:text-v3-ink [&_.n]:text-right [&_.n]:font-figure [&_.n]:tabular-nums [&_.n]:text-v3-ink [&_.gap]:font-semibold [&_.gap]:text-v3-ink',
  '[&_.mark]:font-semibold [&_.mark]:text-v3-ink',
].join(' ')

/* The contents: sticky beside the prose on a desk, a collapsible bar that
   stays under the header on a phone. Both highlight the section you are in. */
function Contents({ toc, active, onJump, phone, className = '' }) {
  const [open, setOpen] = useState(false)
  if (!toc.length) return null
  const list = (
    <ol className="space-y-0.5 border-l border-v3-rule">
      {toc.map((t) => {
        const on = active === t.id
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => { setOpen(false); onJump(t.id) }}
              aria-current={on ? 'location' : undefined}
              className={cx(
                '-ml-px flex min-h-[40px] w-full items-start gap-2.5 border-l-[3px] py-2 pl-3 pr-2 text-left text-[14px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call',
                on ? 'border-v3-ink font-semibold text-v3-ink' : 'border-transparent text-v3-ink2 hover:text-v3-ink',
              )}
            >
              {t.no ? <span className="mt-[1px] font-figure text-[12px] tabular-nums text-v3-ink3">{t.no}</span> : null}
              <span>{t.text}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
  if (!phone) {
    return (
      <nav aria-label="On this page" className="sticky top-[92px]">
        <Label>On this page</Label>
        <div className="mt-3 max-h-[calc(100vh-140px)] overflow-y-auto">{list}</div>
      </nav>
    )
  }
  const current = toc.find((t) => t.id === active) || toc[0]
  return (
    <nav aria-label="On this page" className={cx('sticky top-[68px] z-30 mb-6 rounded-[6px] border border-v3-rule bg-v3-sheet/95 px-3 backdrop-blur', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call"
      >
        <Label as="span" className="shrink-0 text-[11px]">Contents</Label>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-v3-ink">
          {current.no ? <span className="mr-2 font-figure text-[12px] text-v3-ink3">{current.no}</span> : null}{current.text}
        </span>
        <XIcon name="chevron" className={cx('h-5 w-5 shrink-0 text-v3-ink2 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open ? <div className="max-h-[60vh] overflow-y-auto pb-3">{list}</div> : null}
    </nav>
  )
}

export default function V3Method({ doc = 'how-it-works' }) {
  const known = !!DOCS[doc]
  const [state, setState] = useState({ status: 'loading' })
  const [active, setActive] = useState(null)
  const bodyRef = useRef(null)
  const deepLinked = useRef(false)

  useEffect(() => {
    if (!known) return undefined
    let alive = true
    deepLinked.current = false
    setState({ status: 'loading' })
    setActive(null)
    load(doc)
      .then((d) => { if (alive) setState({ status: 'ready', ...d }) })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
  }, [doc, known])

  const scrollToId = (id, smooth) => {
    const root = bodyRef.current
    if (!root || !id) return false
    const el = root.querySelector(`#${CSS.escape(id)}`)
    if (!el) return false
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollPageTo(el, smooth && !reduce)
    return true
  }

  /* A deep link lands, and STAYS landed while the page finishes laying out.
     The faces V3App requests on mount arrive after the document does, and
     the swap from the fallback reflows every paragraph above the target —
     measured, a one-shot scroll to s06 ended 227px past it at 1440 and 400px
     short at 375. So for three seconds any change in the page's size
     re-aims the scroll, and the first sign of a person scrolling (wheel,
     touch, key, press) lets go at once, so it never fights the reader. */
  const pinRef = useRef(null)
  const pin = (id) => {
    if (pinRef.current) pinRef.current()
    if (!scrollToId(id, false)) return
    setActive(id)
    const evs = ['wheel', 'touchstart', 'keydown', 'pointerdown']
    let ro = null
    let t = null
    const release = () => {
      if (ro) ro.disconnect()
      clearTimeout(t)
      evs.forEach((e) => window.removeEventListener(e, release))
      pinRef.current = null
    }
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scrollToId(id, false))
      ro.observe(document.body)
      if (bodyRef.current) ro.observe(bodyRef.current)
    }
    evs.forEach((e) => window.addEventListener(e, release, { passive: true }))
    t = setTimeout(release, 3000)
    pinRef.current = release
  }
  useEffect(() => () => { if (pinRef.current) pinRef.current() }, [])

  // Deep link on arrival (?s=), and the section the reader is in.
  useEffect(() => {
    if (state.status !== 'ready' || !bodyRef.current) return undefined
    if (!deepLinked.current) {
      deepLinked.current = true
      const s = hashQuery().get('s')
      if (s) afterPaint().then(() => pin(s))
    }
    const heads = [...bodyRef.current.querySelectorAll('h2[id]')]
    if (!heads.length || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: '-120px 0px -60% 0px' },
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [state])

  // A link to another section of THIS document (the footer's "The draft
  // grade", say) changes only the query, so it arrives as a hashchange with
  // the same doc — scroll to it rather than reloading anything.
  useEffect(() => {
    const on = () => {
      const s = hashQuery().get('s')
      if (s) afterPaint().then(() => pin(s))
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const jump = (id) => {
    if (scrollToId(id, true)) {
      setActive(id)
      replaceQuery({ s: id })
    }
  }

  const onClick = (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]')
    if (!a) return
    const h = a.getAttribute('href')
    if (h.startsWith('#/')) return
    e.preventDefault()
    jump(h.slice(1))
  }

  if (!known) return <NotFound doc={doc} />

  const title = state.status === 'ready' ? state.title : DOCS[doc].label
  const toc = state.status === 'ready' ? state.toc : []

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[760px]">
          <Label>{DOCS[doc].kicker}</Label>
          <Headline className="mt-2">{title}</Headline>
        </div>
        <DocSwitch current={doc} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:mt-12 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <Contents toc={toc} active={active} onJump={jump} />
        </aside>
        <article className="min-w-0" aria-busy={state.status === 'loading' ? 'true' : undefined}>
          {/* A direct child of the article, so it stays stuck under the
              header for the whole length of the document — inside a
              wrapper of its own it would only stick within the wrapper. */}
          <Contents toc={toc} active={active} onJump={jump} phone className="lg:hidden" />
          {state.status === 'loading' ? <Skeleton lines={12} className="max-w-[68ch]" /> : null}
          {state.status === 'error' ? (
            <div className="max-w-[68ch] rounded-[6px] border border-v3-rule bg-v3-sheet p-5" role="alert">
              <p className="text-[16px] leading-[1.55] text-v3-ink2">
                The document didn&apos;t load. The same page is also served on its own at{' '}
                <a className="font-semibold text-v3-ink underline decoration-v3-rule decoration-2 underline-offset-4" href={DOCS[doc].file}>{DOCS[doc].file}</a>.
              </p>
            </div>
          ) : null}
          {state.status === 'ready' ? (
            <div
              ref={bodyRef}
              onClick={onClick}
              className={PROSE}
              // Our own document from our own origin, sanitised in load():
              // scripts, handlers, forms and script-scheme links are gone
              // before it lands.
              dangerouslySetInnerHTML={{ __html: state.html }}
            />
          ) : null}
        </article>
      </div>
    </div>
  )
}
