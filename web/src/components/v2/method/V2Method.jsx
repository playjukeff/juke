import { useEffect, useRef, useState } from 'react'
import { Kicker, Skeleton } from '../v2ui.jsx'

/* The method, the privacy policy and the terms — re-typeset, not rewritten.

   The words live in docs/*.html and nowhere else. This page fetches the
   same document production serves, takes its <main class="doc">, and sets
   it in the v2 system with a sticky contents rail built from its own
   section headings. A second copy of the method in JSX would be the
   "written down twice" failure this project has a rule about, and the doc
   that drifted first would be the privacy policy — the one page where a
   stale sentence is a legal problem rather than a design one.

   ---- Hash links are intercepted, because this app routes on the hash ----

   The docs link sections as href="#s06". Clicked here, that would replace
   #/v2/method with #s06 and the router would send the reader home. Section
   links scroll instead; links to the app and to the other docs are mapped
   onto their v2 addresses. A section is deep-linkable as ?s=s06. */

const DOCS = {
  'how-it-works': { file: '/docs/draft-room-how-it-works.html', label: 'How it works', kicker: 'The method' },
  privacy: { file: '/docs/privacy.html', label: 'Privacy', kicker: 'Privacy policy' },
  terms: { file: '/docs/terms.html', label: 'Terms', kicker: 'Terms of service' },
}

function sanitize(root) {
  root.querySelectorAll('script, style, link, iframe, object, embed, form').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name)
      if ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name)
    }
  })
}

function mapHref(href) {
  if (!href) return href
  if (/draft-room-how-it-works\.html/.test(href)) return '#/v2/method/how-it-works' + (href.includes('#s') ? `?s=${href.split('#')[1]}` : '')
  if (/privacy\.html/.test(href)) return '#/v2/method/privacy'
  if (/terms\.html/.test(href)) return '#/v2/method/terms'
  if (/index\.html#\/rooms\/draft/.test(href)) return '#/v2/draft'
  if (/index\.html/.test(href) || href === '/' || href === '../') return '#/v2'
  return href
}

async function load(doc) {
  const res = await fetch(DOCS[doc].file, { cache: 'no-cache' })
  if (!res.ok) throw new Error(String(res.status))
  const html = await res.text()
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const main = dom.querySelector('main.doc') || dom.querySelector('main') || dom.body
  sanitize(main)
  main.querySelectorAll('.toc, .backlink').forEach((n) => n.remove())
  main.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href')
    if (!h.startsWith('#')) a.setAttribute('href', mapHref(h))
    if (/^https?:/.test(a.getAttribute('href'))) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') }
  })
  const title = (dom.querySelector('h1') && dom.querySelector('h1').textContent.trim()) || DOCS[doc].label
  const toc = [...main.querySelectorAll('h2[id]')].map((h) => {
    const no = h.querySelector('.no')
    return { id: h.id, no: no ? no.textContent.trim() : '', text: h.textContent.replace(no ? no.textContent : '', '').trim() }
  })
  return { title, html: main.innerHTML, toc }
}

function sectionFromHash() {
  const q = location.hash.split('?')[1]
  if (!q) return null
  return new URLSearchParams(q).get('s')
}

export default function V2Method({ doc = 'how-it-works' }) {
  const key = DOCS[doc] ? doc : 'how-it-works'
  const [state, setState] = useState({ status: 'loading' })
  const [active, setActive] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    load(key)
      .then((d) => alive && setState({ status: 'ready', ...d }))
      .catch(() => alive && setState({ status: 'error' }))
    return () => { alive = false }
  }, [key])

  // Deep link on arrival, and the section the reader is in for the rail.
  useEffect(() => {
    if (state.status !== 'ready' || !bodyRef.current) return
    const s = sectionFromHash()
    if (s) {
      const el = bodyRef.current.querySelector(`#${CSS.escape(s)}`)
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
    }
    const heads = [...bodyRef.current.querySelectorAll('h2[id]')]
    if (!heads.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' }
    )
    heads.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [state])

  const onClick = (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]')
    if (!a) return
    const h = a.getAttribute('href')
    if (h.startsWith('#/')) return
    e.preventDefault()
    const el = bodyRef.current && bodyRef.current.querySelector(h)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const jump = (id) => {
    const el = bodyRef.current && bodyRef.current.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[760px]">
          <Kicker tone="text-v2-ink2">{DOCS[key].kicker}</Kicker>
          <h1 className="mt-3 font-telemetry text-[clamp(2.6rem,5.5vw,4.6rem)] font-extrabold uppercase italic leading-[0.9] text-v2-ink">
            {state.status === 'ready' ? state.title : DOCS[key].label}
          </h1>
        </div>
        <nav aria-label="Documents" className="inline-flex self-start rounded-[10px] bg-v2-inset p-1 ring-1 ring-inset ring-white/[0.06] lg:self-auto">
          {Object.entries(DOCS).map(([k, d]) => (
            <a
              key={k}
              href={`#/v2/method/${k}`}
              aria-current={k === key ? 'page' : undefined}
              className={`min-h-[34px] rounded-[7px] px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                k === key ? 'bg-v2-volt text-v2-voltInk' : 'text-v2-ink2 hover:text-v2-ink'
              }`}
            >
              {d.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          {state.status === 'ready' && state.toc.length > 0 && (
            <nav aria-label="On this page" className="sticky top-[84px]">
              <Kicker>On this page</Kicker>
              <ol className="mt-3 space-y-0.5 border-l border-white/[0.08]">
                {state.toc.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => jump(t.id)}
                      className={`-ml-px flex w-full gap-2.5 border-l-2 py-1.5 pl-3 text-left text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt ${
                        active === t.id ? 'border-v2-volt text-v2-ink' : 'border-transparent text-v2-ink2 hover:text-v2-ink'
                      }`}
                    >
                      {t.no && <span className="font-mono text-[11px] tabular-nums text-v2-ink3">{t.no}</span>}
                      <span>{t.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>

        <article className="min-w-0">
          {state.status === 'loading' && <Skeleton lines={10} />}
          {state.status === 'error' && (
            <div className="rounded-[18px] bg-v2-panel p-6 ring-1 ring-inset ring-white/[0.07]">
              <p className="text-[15px] text-v2-ink2">
                The document didn&apos;t load. It&apos;s also available at{' '}
                <a className="text-v2-ink underline" href={DOCS[key].file}>{DOCS[key].file}</a>.
              </p>
            </div>
          )}
          {state.status === 'ready' && (
            <div
              ref={bodyRef}
              onClick={onClick}
              className={[
                'max-w-[72ch] text-[16px] leading-[1.7] text-v2-ink2',
                '[&_p]:mt-4 [&_.doc-intro]:mt-0 [&_.doc-intro]:text-[19px] [&_.doc-intro]:leading-[1.55] [&_.doc-intro]:text-v2-ink',
                '[&_h2]:mt-16 [&_h2]:scroll-mt-24 [&_h2]:font-telemetry [&_h2]:text-[34px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:italic [&_h2]:leading-[0.95] [&_h2]:text-v2-ink',
                '[&_h2_.no]:mb-2 [&_h2_.no]:block [&_h2_.no]:font-mono [&_h2_.no]:text-[11px] [&_h2_.no]:not-italic [&_h2_.no]:font-semibold [&_h2_.no]:tracking-[0.16em] [&_h2_.no]:text-v2-ink3',
                '[&_h3]:mt-10 [&_h3]:scroll-mt-24 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:text-v2-ink',
                '[&_b]:font-semibold [&_b]:text-v2-ink [&_strong]:text-v2-ink [&_em]:text-v2-ink',
                '[&_a]:text-v2-ink [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-2 hover:[&_a]:decoration-v2-volt',
                '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_li]:marker:text-v2-ink3',
                '[&_.formula]:mt-5 [&_.formula]:overflow-x-auto [&_.formula]:rounded-[12px] [&_.formula]:bg-v2-inset [&_.formula]:p-4 [&_.formula]:font-mono [&_.formula]:text-[13px] [&_.formula]:leading-[1.7] [&_.formula]:text-v2-ink [&_.formula]:ring-1 [&_.formula]:ring-inset [&_.formula]:ring-white/[0.06]',
                '[&_.formula>div]:pl-4 [&_.formula>div]:-indent-4',
                '[&_.note]:mt-5 [&_.note]:rounded-[12px] [&_.note]:border-l-0 [&_.note]:bg-v2-cyan/[0.06] [&_.note]:p-4 [&_.note]:text-[15px] [&_.note]:ring-1 [&_.note]:ring-inset [&_.note]:ring-v2-cyan/20',
                '[&_.worked]:mt-5 [&_.worked]:rounded-[12px] [&_.worked]:bg-v2-panel [&_.worked]:p-5 [&_.worked]:ring-1 [&_.worked]:ring-inset [&_.worked]:ring-white/[0.07] [&_.worked-title]:font-mono [&_.worked-title]:text-[11px] [&_.worked-title]:uppercase [&_.worked-title]:tracking-[0.14em] [&_.worked-title]:text-v2-ink3',
                '[&_table]:mt-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded-[12px] [&_table]:bg-v2-panel [&_table]:text-[14px] [&_table]:ring-1 [&_table]:ring-inset [&_table]:ring-white/[0.07]',
                '[&_td]:border-b [&_td]:border-white/[0.06] [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top [&_tr:last-child_td]:border-b-0 [&_.n]:text-right [&_.n]:font-mono [&_.n]:tabular-nums [&_.n]:text-v2-ink',
                '[&_.k]:font-mono [&_.k]:text-v2-ink [&_.gap]:text-v2-volt',
              ].join(' ')}
              // Our own document from our own origin, sanitised above: scripts,
              // handlers and javascript: links are removed before it lands.
              dangerouslySetInnerHTML={{ __html: state.html }}
            />
          )}
        </article>
      </div>
    </>
  )
}
