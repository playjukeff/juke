import { useEffect, useState } from 'react'
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import JukeLogo from '../juke-logo/JukeLogo.jsx'
import { useAccountUiReady } from '../../hooks/useAccountUiReady.js'
import HeroTelemetry from './HeroTelemetry.jsx'
import PlayerDeepDive from './PlayerDeepDive.jsx'
import GradeInstrument from './GradeInstrument.jsx'
import RoomHub from './RoomHub.jsx'
import V2DraftsPage from './V2DraftsPage.jsx'
import { Arrow, Kicker } from './v2ui.jsx'

/* Juke v2 — "Telemetry". A complete, independent proposal for the site's
   front door and the pages it leads to, built to be compared against the
   live one rather than to replace it on merge.

   ---- Why a route and not a branch deploy ----

   The point is a side-by-side. Living at #/v2 inside the same build means
   both versions read the same board on the same night, so every difference
   on screen is a design difference and never a data one. It also means the
   Draft Room, accounts and league connect behind it are the real ones: a
   "Start free mock draft" here starts a real draft.

   ---- What it changed from the brief, on purpose ----

   Volt (#00FF66) is the action colour, as asked, and it also carries the
   positive value deltas the brief assigns it. That is the one place this
   build disagrees with the repo's own decision system ("teal is the brand
   and the action, and it is never a value"): a page that prints a good
   outcome in its button colour teaches that the colour means good. It is
   kept because the brief is explicit, and it is one token (`v2.volt` on
   the delta spans) to split if the comparison says so. */

let fontRequested = false
function useTelemetryFace() {
  useEffect(() => {
    if (fontRequested || typeof document === 'undefined') return
    fontRequested = true
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&display=swap'
    document.head.appendChild(link)
  }, [])
}

const NAV = [
  { key: '', label: 'Board', href: '#/v2' },
  { key: 'rooms', label: 'Rooms', href: '#/v2/rooms' },
  { key: 'drafts', label: 'Drafts', href: '#/v2/drafts' },
  { key: 'method', label: 'Method', href: '/docs/draft-room-how-it-works.html' },
]

function Header({ sub }) {
  const ready = useAccountUiReady()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [sub])
  const current = sub.split('/')[0]

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-v2-ground/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center gap-4 px-4 sm:px-8">
        <a href="#/v2" aria-label="Juke v2 home" className="shrink-0">
          <JukeLogo size={18} />
        </a>
        <span className="hidden rounded-[6px] bg-v2-volt/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-v2-volt ring-1 ring-inset ring-v2-volt/30 sm:inline">
          v2 preview
        </span>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const on = n.key === current && n.key !== 'method'
            return (
              <a
                key={n.label}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={`relative rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${on ? 'text-v2-ink' : 'text-v2-ink2 hover:text-v2-ink'}`}
              >
                {n.label}
                {on && <span className="absolute inset-x-3 -bottom-[11px] h-[2px] rounded-full bg-v2-volt" aria-hidden="true" />}
              </a>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="#/"
            className="hidden items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[12px] font-medium text-v2-ink2 ring-1 ring-inset ring-white/[0.1] transition-colors hover:text-v2-ink sm:inline-flex"
          >
            Compare with live site <Arrow className="h-3.5 w-3.5" />
          </a>
          {ready ? (
            <>
              <SignedOut>
                <SignInButton mode="modal">
                  <button type="button" className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-v2-ink transition-colors hover:bg-white/[0.05]">
                    Log in
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </>
          ) : (
            <button type="button" className="rounded-[8px] px-3 py-2 text-[13px] font-medium text-v2-ink">Log in</button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="v2-mobile-nav"
            aria-label="Menu"
            className="grid h-10 w-10 place-items-center rounded-[10px] text-v2-ink ring-1 ring-inset ring-white/[0.1] md:hidden"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d={open ? 'M4 4l8 8M12 4l-8 8' : 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="v2-mobile-nav" aria-label="Primary" className="border-t border-white/[0.07] px-4 pb-4 pt-2 md:hidden">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className="flex min-h-[48px] items-center justify-between border-b border-white/[0.05] text-[15px] text-v2-ink">
              {n.label} <Arrow className="h-4 w-4 text-v2-ink3" />
            </a>
          ))}
          <a href="#/" className="flex min-h-[48px] items-center justify-between text-[15px] text-v2-ink2">
            Compare with live site <Arrow className="h-4 w-4" />
          </a>
        </nav>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.07]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div>
          <JukeLogo size={16} />
          <p className="mt-3 max-w-[46ch] text-[13px] leading-[1.6] text-v2-ink3">
            A solo mock draft runs entirely in your browser — nothing you draft is sent anywhere.
            Connecting a league is read-only. Juke never edits it.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          <a className="text-v2-ink2 hover:text-v2-ink" href="/docs/draft-room-how-it-works.html">How it works</a>
          <a className="text-v2-ink2 hover:text-v2-ink" href="/docs/draft-room-how-it-works.html#s06">The draft grade</a>
          <a className="text-v2-ink2 hover:text-v2-ink" href="/docs/privacy.html">Privacy</a>
          <a className="text-v2-ink2 hover:text-v2-ink" href="/docs/terms.html">Terms</a>
        </div>
      </div>
    </footer>
  )
}

function SectionHead({ index, kicker, title, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Kicker tone="text-v2-ink2">
          <span className="text-v2-ink3">{index}</span> &nbsp;{kicker}
        </Kicker>
        <h2 className="mt-2 font-telemetry text-[clamp(2.1rem,4vw,3.25rem)] font-extrabold uppercase italic leading-[0.9] text-v2-ink">
          {title}
        </h2>
      </div>
      {children && <div className="max-w-[46ch] text-[15px] leading-[1.55] text-v2-ink2">{children}</div>}
    </div>
  )
}

function Home() {
  return (
    <>
      <HeroTelemetry />

      <section className="mt-24" aria-labelledby="v2-s2">
        <SectionHead index="02" kicker="The specificity display" title={<span id="v2-s2">A rank is not a reason.</span>}>
          A rank puts a name first and stops. It cannot say how far ahead of second he is — which is the
          number you are actually choosing between.
        </SectionHead>
        <PlayerDeepDive />
      </section>

      <section className="mt-24" aria-labelledby="v2-s3">
        <SectionHead index="03" kicker="The grade engine" title={<span id="v2-s3">Where every other mock stops.</span>}>
          You drafted for an hour. This is the part that tells you whether it went well — four weighted
          parts that add up to the grade, so you can check it rather than believe it.
        </SectionHead>
        <GradeInstrument />
      </section>

      <section className="mt-24" aria-labelledby="v2-s4">
        <SectionHead index="04" kicker="The room hub" title={<span id="v2-s4">One call per room.</span>}>
          Two rooms are open to everybody, today. Three read your real league — each one is previewed
          here on tonight&apos;s actual board.
        </SectionHead>
        <RoomHub />
      </section>
    </>
  )
}

function RoomsPage() {
  return (
    <>
      <div className="max-w-[760px]">
        <Kicker tone="text-v2-ink2">The rooms</Kicker>
        <h1 className="mt-3 font-telemetry text-[clamp(2.8rem,6vw,5rem)] font-extrabold uppercase italic leading-[0.88] text-v2-ink">
          A room for every call in the season.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.55] text-v2-ink2">
          Scout, draft, then manage the week. The first two need nothing from you; the rest read your
          connected league and never write to it.
        </p>
      </div>
      <div className="mt-10">
        <RoomHub expanded />
      </div>
    </>
  )
}

export default function V2App({ sub = '' }) {
  useTelemetryFace()
  const page = (sub || '').split('/')[0]
  return (
    <div className="relative min-h-screen overflow-x-clip bg-v2-ground font-body text-v2-ink">
      {/* A faint pitch grid under everything: telemetry, not decoration.
          Masked to the top so it never competes with a table's own rules. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-[0.5] [background-image:linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,255,102,0.07),transparent)]"
        aria-hidden="true"
      />
      <Header sub={sub || ''} />
      <main className="relative mx-auto max-w-[1320px] px-4 pt-10 sm:px-8 sm:pt-14">
        {page === 'rooms' ? <RoomsPage /> : page === 'drafts' ? <V2DraftsPage /> : <Home />}
      </main>
      <Footer />
    </div>
  )
}
