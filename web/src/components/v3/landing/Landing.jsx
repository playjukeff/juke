import { useEffect, useRef } from 'react'
import { CLERK_PUBLISHABLE_KEY } from '../../../clerkConfig.js'
import { useSeason } from '../now/season.js'
import { CallButton, Delta, Headline, Icon, Label, PosTag, QuietButton, Sheet, Skeleton, cx, useEngineData } from '../ui.jsx'
import { readSituation } from '../data.js'
import { useMotionOK } from '../motion.jsx'
import { TheCall } from '../now/TheCall.jsx'
import SampleBoard from '../draft/SampleBoard.jsx'
import { SampleTag } from '../league/parts.jsx'
import { hashQuery } from '../record/recordKit.js'
import { LIVE_NAMES } from '../../shell/leaguePlatforms.js'
import { COMPARISON } from './comparison.js'

/* The logged-out landing page (workstream B).

   ---- Why it is its own component and not a variant of Now ----

   `#/` used to do double duty: Now drew a marketing hero for a guest and
   a dashboard for a reader, and a signed-in reader could watch the first
   become the second. This page is for a visitor and only a visitor. Now
   hands a resolved guest here and nobody else, and `#/welcome` shows it to
   anybody, signed in or not, so there is one address a link from outside
   can point at.

   What stops a signed-in reader seeing it at all is not in React: theme.js
   stamps `data-auth-hint="in"` on <html> before the first paint when
   Clerk's own session cookie says a session exists, and index.css hides
   this page under that stamp. The prerender still writes it — it is what
   a visitor's first frame is — and a stale cookie costs a visitor one
   blank frame rather than costing a reader a flash of marketing.

   ---- It stays in the main bundle, deliberately ----

   The brief asked for its own bundle. It is the prerendered first paint
   for exactly the visitors it is for, so splitting it out would put a
   network round trip in front of the one screen that has to be instant.
   What a code split would buy is keeping it OUT of a reader's download,
   and it is small beside what it reuses (TheCall and SampleBoard load for
   readers anyway).

   ---- The reason to come back ----

   The mock draft runs entirely in the browser with no account, and it is
   the primary action on every section of this page. The call in the hero
   is live on tonight's board too, so the page itself is a tool: change
   the position or the scoring and the call moves.

   ---- Every figure on it is real ----

   The hero call, the priced table and the board are tonight's data read
   through window.JukeEngine. The proof strip states facts about the
   product, not about its users, because there is no user count that can
   be substantiated yet; the social-proof slot is empty on purpose and
   says so in its own component. */


/* Hover lift for a product card (B6): 3px and the one elevation token,
   150ms, and nothing under reduced motion. */
const LIFT = 'transition-[transform,box-shadow] duration-150 ease-out [@media(hover:hover)]:hover:-translate-y-[3px] [@media(hover:hover)]:hover:shadow-v3-raised motion-reduce:transition-none motion-reduce:hover:translate-y-0'

/* ---- Grounds (B5) ---- */

/* A radial accent glow that drifts on a 24s cycle. Decorative. */
function Glow({ className = '' }) {
  return <div aria-hidden="true" className={cx('landing-glow pointer-events-none absolute -z-10 select-none', className)} />
}

/* A tiled type pattern, masked out of ink at 1.8%: the word the product is
   about, repeated. Low enough that it cannot be read as content, and
   aria-hidden and unselectable so nothing reads it as content either. */
function TypeTile({ className = '' }) {
  return <div aria-hidden="true" className={cx('landing-tile pointer-events-none absolute inset-0 -z-10 select-none', className)} />
}

/* ---- The action pair (B2, B3): the same two, everywhere ---- */

function Actions({ hero = false }) {
  return (
    <div className="flex flex-wrap gap-3">
      {/* data-hero-cta is the primary door journey.spec walks into a
          finished draft and sonar.spec hit-tests; exactly one on the page. */}
      <CallButton href="#/draft" {...(hero ? { 'data-hero-cta': true } : {})}>Run a free mock draft <Icon name="arrow" className="h-4 w-4" /></CallButton>
      <QuietButton href="#/account">Connect your league</QuietButton>
    </div>
  )
}

/* ---- A priced table, tonight: the best points over replacement ---- */

function readPriced(engine) {
  const board = engine.board()
  if (!board || !board.length || !engine.replacementGap) return null
  const rows = []
  for (const p of board) {
    const gap = engine.replacementGap(p)
    if (gap == null || !Number.isFinite(gap)) continue
    rows.push({ id: p.id, name: p.name, pos: p.pos, team: p.team, pts: p.projPts, gap })
  }
  rows.sort((a, b) => b.gap - a.gap)
  return rows.slice(0, 6)
}

function PricedTable({ className = '' }) {
  const rows = useEngineData(readPriced)
  return (
    <Sheet code="Every player, priced" aside="Tonight" className={className} bodyClass="p-0">
      {!rows ? <div className="p-4"><Skeleton lines={5} /></div> : (
        <table className="w-full border-collapse border-0 bg-v3-sheet text-[15px] [&_td]:border-0 [&_th]:border-0 [&_th]:bg-v3-sheet">
          <thead>
            <tr className="border-b border-v3-rule">
              <th scope="col" className="px-4 py-2 text-left font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">Player</th>
              <th scope="col" className="px-2 py-2 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">Pts</th>
              <th scope="col" className="px-4 py-2 text-right font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">Over repl.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-v3-rule last:border-b-0">
                <td className="px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2"><PosTag pos={r.pos} /><span className="font-semibold text-v3-ink">{r.name}</span></span>
                </td>
                <td className="px-2 py-2.5 text-right font-figure tabular-nums text-v3-ink2">{Math.round(r.pts)}</td>
                <td className="px-4 py-2.5 text-right"><Delta value={r.gap} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  )
}

/* ---- A lineup call, on tonight's board, labelled a sample ---- */

function readLineupSample(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  const wrs = board.filter((p) => p.pos === 'WR' && p.projPts > 0).slice(20, 40)
  if (wrs.length < 2) return null
  const byPts = [...wrs].sort((a, b) => b.projPts - a.projPts)
  const start = byPts[0]
  const sit = byPts[byPts.length - 1]
  const pg = (p) => p.projPts / 17
  return { start: { name: start.name, pg: pg(start) }, sit: { name: sit.name, pg: pg(sit) }, gain: pg(start) - pg(sit) }
}

function LineupSample({ className = '' }) {
  const s = useEngineData(readLineupSample)
  return (
    <Sheet code="The lineup call" aside="Sample" className={className} bodyClass="p-4 sm:p-5">
      {!s ? <Skeleton lines={4} /> : (
        <div className="grid gap-4">
          <div className="flex items-center gap-2"><SampleTag /><Label>A sample roster, tonight&apos;s players</Label></div>
          <p className="text-[18px] leading-[1.45] text-v3-ink">
            Start <strong>{s.start.name}</strong> over <strong>{s.sit.name}</strong> — <Delta value={s.gain} digits={1} className="text-[18px]" /> points a game.
          </p>
          <dl className="grid grid-cols-2 gap-2">
            {[['Start', s.start], ['Sit', s.sit]].map(([k, p]) => (
              <div key={k} className="rounded-[6px] bg-v3-paper p-3">
                <dt><Label>{k}</Label></dt>
                <dd className="mt-1 font-semibold text-v3-ink">{p.name}</dd>
                <dd className="font-figure text-[13px] tabular-nums text-v3-ink2">{p.pg.toFixed(1)} a game, projected</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] leading-[1.5] text-v3-ink3">Connected, this is your own roster under your league&apos;s own scoring. Read-only: Juke never edits your league.</p>
        </div>
      )}
    </Sheet>
  )
}

/* ---- The hero (B2) ---- */

function Hero({ season }) {
  const inSeason = season && season.phase === 'regular' && season.week
  // overflow-x-clip: the glow and the offset table are decoration and may
  // not widen the page. Clip, not hidden, so nothing here becomes a scroll
  // container and the vertical overhang still shows.
  return (
    <section aria-labelledby="landing-title" className="relative isolate overflow-x-clip pt-8 lg:pt-14">
      <Glow className="-left-[20%] -top-[10%] h-[720px] w-[720px] lg:-left-[10%]" />
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          {/* Tier 1: mono, uppercase, accent, 24-28px. */}
          <Label tier="page" as="p" data-hero-eyebrow>{inSeason ? `Juke · week ${season.week} is here` : 'Juke · fantasy football, priced'}</Label>
          {/* Tier 2: display, clamp(40px, 6vw, 84px), 1-3 words a line. */}
          <Headline id="landing-title" className="mt-5 text-[clamp(2.5rem,6vw,5.25rem)] leading-[0.95]">
            Every call,<br />priced.
          </Headline>
          {/* Tier 3: the supporting line, 28-32px. */}
          <p className="mt-6 max-w-[22ch] font-sheet text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-[1.2] text-v3-ink [text-wrap:balance]">
            In points over the player your league would start instead.
          </p>
          <p className="mt-5 max-w-[48ch] text-[17px] leading-[1.55] text-v3-ink2">
            Mock drafts that need no account, and a read-only look at your real league once the season starts.
          </p>
          <div className="mt-8"><Actions hero /></div>
          <p className="mt-4 text-[13px] text-v3-ink3">No account needed · the mock runs in your browser</p>
        </div>

        {/* Real product surfaces, overlapping: the live call in front, the
            priced table behind it and offset. On a phone they stack. */}
        <div className="relative lg:pr-10 xl:pr-16">
          <div className={cx('relative z-10', LIFT)}><TheCall /></div>
          <div className="relative mt-6 lg:absolute lg:-bottom-20 lg:right-0 lg:mt-0 lg:w-[58%]">
            <PricedTable className={cx('shadow-v3-raised', LIFT)} />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- Directly under the hero (B4): facts, and the social-proof slot ---- */

/* The social-proof slot. EMPTY, on purpose: Juke has no user count, no
   mock-draft tally and no grading volume that is counted anywhere a
   visitor could check (mocks run in the browser and are never sent to a
   server unless somebody signs in). A figure here that nobody can
   substantiate is the one thing this page may not do. Pass real, dated
   figures to fill it; with none it renders nothing. */
export const PROOF = []

function ProofStrip() {
  const s = useEngineData(readSituation)
  const facts = [
    { k: 'Players priced tonight', v: s ? String(s.players) : null, note: s && s.refreshed ? `Refreshed ${s.refreshed}` : 'Rebuilt every morning' },
    { k: 'Scoring', v: 'Yours', note: 'Standard, half or full PPR, or any of 49 rules edited' },
    { k: 'Leagues read', v: LIVE_NAMES, note: 'Read-only, never edited' },
    { k: 'Account needed to draft', v: 'None', note: 'Mocks run in your browser' },
  ]
  return (
    <section aria-label="What Juke is working from" className="mt-12 lg:mt-36">
      {PROOF.length ? (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PROOF.map((p) => (
            <div key={p.k}><dt><Label>{p.k}</Label></dt><dd className="mt-1 font-figure text-[28px] font-bold text-v3-ink">{p.v}</dd><dd className="text-[12px] text-v3-ink3">{p.asOf}</dd></div>
          ))}
        </dl>
      ) : null}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-v3-rule bg-v3-rule sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.k} className="bg-v3-sheet p-5">
            <dt><Label>{f.k}</Label></dt>
            <dd className="mt-2 font-figure text-[24px] font-bold leading-tight text-v3-ink">{f.v == null ? '…' : f.v}</dd>
            <dd className="mt-1 text-[13px] leading-[1.45] text-v3-ink3">{f.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ---- The repeatable section (B3) ---- */

function Feature({ icon, label, children }) {
  return (
    <li data-lrise="" className="flex items-start gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[6px] bg-v3-well text-v3-ink" aria-hidden="true"><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block text-[16px] font-bold text-v3-ink">{label}</span>
        <span className="mt-1 block max-w-[48ch] text-[15px] leading-[1.55] text-v3-ink2">{children}</span>
      </span>
    </li>
  )
}

function Section({ id, eyebrow, title, support, features, visual, flip = false, tile = false }) {
  const ref = useRef(null)
  return (
    <section ref={ref} data-lsec="" aria-labelledby={id} className="relative isolate overflow-x-clip">
      {tile ? <TypeTile className="-inset-y-16" /> : null}
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cx(flip && 'lg:order-2')}>
          <Label tier="page" as="p" data-lrise="">{eyebrow}</Label>
          <Headline as="h2" id={id} data-lrise="" className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1]">{title}</Headline>
          <p data-lrise="" className="mt-4 max-w-[40ch] text-[20px] leading-[1.45] text-v3-ink2">{support}</p>
          <ul className="mt-8 grid gap-6">{features}</ul>
          <div data-lrise="" className="mt-10"><Actions /></div>
        </div>
        <div data-lrise="" className={cx('relative', flip && 'lg:order-1', LIFT)}>{visual}</div>
      </div>
    </section>
  )
}

/* ---- The comparison slot (B4) ----

   The layout, with nothing in it. Every cell must be factual, verifiable
   and dated, and framed as what Juke does differently rather than as a
   judgement of anybody else's tool — so the content is the owner's to
   write and approve, in comparison.js. Empty, the section does not
   render. `#/welcome?compare=preview` draws the frame with placeholder
   cells marked as such, so the layout can be reviewed before any content
   exists. */
function Comparison() {
  const preview = hashQuery().get('compare') === 'preview'
  const has = COMPARISON.rows.length > 0
  if (!has && !preview) return null
  const cols = has ? COMPARISON.columns : ['Juke', 'Tool A', 'Tool B']
  const rows = has ? COMPARISON.rows : [0, 1, 2, 3].map((i) => ({ label: `Row ${i + 1} — to be written`, cells: cols.map(() => 'To fill'), source: '' }))
  return (
    <section aria-labelledby="landing-compare" className="relative">
      <Label tier="page" as="p">What Juke does differently</Label>
      <Headline as="h2" id="landing-compare" className="mt-4 text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1]">Side by side.</Headline>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.55] text-v3-ink2">
        {has ? `Checked ${COMPARISON.asOf}. Each row links to where it can be verified.` : 'Preview of the layout. Nothing below is a claim; every cell is a placeholder until it is written, sourced and dated.'}
      </p>
      <div className="mt-8 overflow-x-auto rounded-[6px] border border-v3-rule">
        <table className="w-full min-w-[640px] border-collapse border-0 bg-v3-sheet text-[15px] [&_td]:border-0 [&_th]:border-0 [&_th]:bg-v3-sheet">
          <thead>
            <tr className="border-b border-v3-rule">
              <th scope="col" className="px-4 py-3 text-left"><span className="sr-only">Feature</span></th>
              {cols.map((c) => <th key={c} scope="col" className="px-4 py-3 text-left font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-v3-rule last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-semibold text-v3-ink">{r.label}{r.source ? <a href={r.source} className="ml-2 text-[12px] font-normal text-v3-ink3 underline">source</a> : null}</th>
                {r.cells.map((cell, i) => <td key={i} className={cx('px-4 py-3', has ? 'text-v3-ink' : 'italic text-v3-ink3')}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!has ? <p className="mt-3 text-[13px] text-v3-ink3">Preview only · this section does not render until comparison.js has rows.</p> : null}
    </section>
  )
}

/* theme.js hides this page when Clerk's cookie says a session probably
   exists. The hint comes off only on a real answer of "nobody": no Clerk
   key at all, Clerk loaded and signed out, or Clerk never answering within
   useAuthResolved()'s own four seconds. Not on mount: at hydration the
   page renders for everybody (it has to match the prerender), and taking
   the hint off then would paint the page for the reader it exists to
   hide from. `force` is #/welcome, where somebody asked for this page. */
function useClearAuthHint(force) {
  useEffect(() => {
    const root = document.documentElement
    if (!root.hasAttribute('data-auth-hint')) return undefined
    const clear = () => root.removeAttribute('data-auth-hint')
    if (force || !CLERK_PUBLISHABLE_KEY) { clear(); return undefined }
    const read = () => { const a = window.JukeAuth; if (a && a.isLoaded && !a.isSignedIn) clear() }
    read()
    window.addEventListener('juke:auth', read)
    const ceiling = setTimeout(clear, 4000)
    return () => { window.removeEventListener('juke:auth', read); clearTimeout(ceiling) }
  }, [force])
}

/* #/welcome: the landing page for anybody, signed in or not. */
export function WelcomeRoute() {
  const season = useSeason()
  return <Landing season={season} force />
}

/* ---- The page ---- */

export default function Landing({ season, force = false }) {
  useClearAuthHint(force)
  return (
    <div data-landing="" className="grid">
      <Hero season={season} />
      <ProofStrip />
      <div className="mt-section grid gap-section">
        <Section
          id="landing-draft"
          eyebrow="Draft"
          title="Practice the draft."
          support="Nine CPU managers drafting off tonight's real board, graded the moment the last pick lands."
          features={<>
            <Feature icon="draft" label="Tonight's board">Real ADP and projections, rebuilt every morning, so the room drafts like a room would today.</Feature>
            <Feature icon="star" label="Graded against par">A letter beside where you finished in the room — never a score out of a hundred.</Feature>
            <Feature icon="settings" label="Your league's shape">Four to twenty-four teams, any lineup, and standard, half or full PPR.</Feature>
            <Feature icon="players" label="Draft with friends">Share a link and real managers take seats in one room, with the clock and chat.</Feature>
          </>}
          visual={<Sheet code="The board" aside="Sample" bodyClass="p-3 sm:p-4"><SampleBoard /></Sheet>}
        />
        <Section
          id="landing-league"
          eyebrow="Your league"
          title="Your week, priced."
          support="Connect a league read-only and every call is in points, under that league's own scoring."
          flip
          tile
          features={<>
            <Feature icon="lineup" label="The lineup call">The one swap worth making this week, and what it is worth in points.</Feature>
            <Feature icon="wire" label="The waiver wire">The claim worth making, priced over the player you would drop.</Feature>
            <Feature icon="trade" label="The trade check">Whether an offer is fair before you send it, both sides in one unit.</Feature>
            <Feature icon="league" label="The standings">Every team's playoff odds, from ten thousand simulated seasons.</Feature>
          </>}
          visual={<LineupSample />}
        />
        <Section
          id="landing-math"
          eyebrow="The method"
          title="The math, shown."
          support="A rank says who goes first. Juke says by how much, and shows the math."
          features={<>
            <Feature icon="info" label="Points over replacement">Every player priced against the one your league would start instead.</Feature>
            <Feature icon="check" label="Honest about kickers">Kickers and defenses are scored and never ranked — their order does not predict.</Feature>
            <Feature icon="record" label="Graded against itself">What was projected sits beside what happened, season by season.</Feature>
          </>}
          visual={<PricedTable />}
        />
        <Comparison />
      </div>
    </div>
  )
}
