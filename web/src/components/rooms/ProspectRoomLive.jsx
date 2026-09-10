import { useMemo, useState } from 'react'
import { PosTile } from './sampleParts.jsx'
import { evidence, knownAbout, rookies } from './prospectBoard.js'
import CollegeBoard from './CollegeBoard.jsx'
import { useEngine, useJukeTick } from '../../hooks/useJukeEngine.js'

/* The Prospect Room.
 *
 * ---- The one room that needs no league, and that is not a shortcut ----
 *
 * Waiver, Trade and Strategy each read a roster, so each is genuinely
 * locked until a league is connected. Nothing here reads one: a rookie is
 * a rookie whoever you are, and every fact on this screen comes off
 * `players.js`/`stats.js`, which every visitor already has. Gating it
 * behind a connection it never consults would be a control that cannot
 * act — the same failure as a tab that unlocks onto nothing, one level up.
 *
 * That also makes it the first room-with-real-content a Playwright run can
 * drive, because it sits outside Clerk's <SignedIn>. Every other live room
 * is in the coverage gap this project keeps recording.
 *
 * ---- The largest gap in the product between promise and proof ----
 *
 * ROOMS' blurb promises "the college production and NFL translation of
 * incoming rookies". Measured against the 8 September 2026 board: 77
 * rookies, every one with a college and a 2026 projection, 62 with a
 * depth-chart slot, and NOT ONE with a college statistic, a combine number
 * or an NFL draft position anywhere in this repository.
 *
 * So this room ranks rookies and cannot explain them, and it says so on
 * screen rather than in a comment. The handoff's own copy is the right
 * posture — "Juke keeps confidence low until the combine and the NFL draft
 * say something. It will not pretend otherwise" — and the banner plus every
 * row's own "not known" column is that sentence made load-bearing.
 *
 * Evidence is a COUNT and not the handoff's capped 71% confidence, for the
 * reason prospectBoard.js states: a number chosen to look uncertain is
 * still a number, and a reader compares it against another one.
 *
 * ---- Two of the handoff's four tabs are absent ----
 *
 * Draft Capital (Season Pass) is NFL draft position, which nothing has —
 * and charging for a tab that unlocks onto nothing is the FAAB Planner
 * problem with a price on it.
 *
 * Prospect Lab is here in reduced form, as what a row expands into rather
 * than as a tab: what Juke knows about one rookie is five facts and a list
 * of gaps, which is a panel and not a screen.
 */

export const TABS = [
  { key: 'lobby', label: 'Lobby' },
  { key: 'board', label: 'Big Board' },
  /* The room's other half, and a different KIND of player rather than a
     different view of the same ones: nobody on it has been drafted, none of
     them is on any Juke board, and none can be ranked by value over
     replacement because that number does not exist for a college player.
     That is why it is a tab and not a filter. */
  { key: 'college', label: 'In College' },
]

/* The Lobby is a sample of the same list rather than a different one.
   Eight is what fits above the fold at 1440 without the reader scrolling
   to find out there is a Big Board tab. */
const LOBBY_ROWS = 8

/* What is known, counted from the rows rather than written down.
 *
 * This banner used to say Juke had "no college statistics, no combine testing
 * and no NFL draft position for any of these players", which was true the day
 * it was written and false the moment the CFBD pipeline ran — two of the three
 * gaps it named had closed underneath it. Copy going stale the day a feature
 * ships is the failure this project catalogues at length, and a banner whose
 * whole job is honesty is the worst place for it.
 *
 * So the numbers are derived. A class where nothing joined says so on its own,
 * and nobody has to remember to come back here. */
function Banner({ rows }) {
  let drafted = 0
  let undrafted = 0
  let withCollege = 0
  for (const row of rows) {
    const p = row.prospect
    if (!p) continue
    if (p.drafted) drafted += 1
    if (p.undrafted) undrafted += 1
    if (p.college) withCollege += 1
  }
  const anything = drafted || undrafted || withCollege

  /* P6. The thin-evidence card, and this notice is the model the decision
     system generalised from -- the guide says so in as many words. So the
     restyle is small and it is the system catching up to this panel rather
     than the other way round: the amber pair becomes `cost`, which is what a
     caveat is coloured in everywhere else now, and the counts become mono
     because they are figures rather than prose.

     What does NOT change is the argument. A room that says out loud which of
     its inputs it does not have is the one thing this file's own header is
     about, and the border is the whole signal: the content inside is
     untouched, so a reader can see the evidence is thin and decide for
     themselves. Withholding the confidence, not the content. */
  return (
    <div className="jd-rise mb-5 rounded-panel border border-cost/60 px-4 py-3" style={{ '--i': 0 }}>
      <div className="font-plex text-label uppercase text-cost">
        What is known, and what is not
      </div>
      <p className="mt-1.5 max-w-[72ch] text-meta leading-relaxed text-voidInk-body">
        {anything ? (
          <>
            Where <strong className="font-plex font-semibold text-ink">{drafted}</strong> of these
            players went in the draft, and what{' '}
            <strong className="font-plex font-semibold text-ink">{withCollege}</strong> of them did
            in college.{' '}
            {undrafted ? (
              <>
                <strong className="font-plex font-semibold text-ink">{undrafted}</strong> were never
                drafted at all — which is a fact about them rather than a gap in what we know.{' '}
              </>
            ) : null}
            Nobody here has a combine number: no feed in this product carries one yet, so every
            profile still says so.
          </>
        ) : (
          <>
            No draft class has been read yet, so nothing below carries a draft position or a
            college line. That fills on the next nightly rebuild — it is a fact about the pipeline
            rather than about this year's rookies.
          </>
        )}
      </p>
    </div>
  )
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-[14px] border border-line-hairline bg-surface-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-hairline px-4 py-3 sm:px-5">
        <h2 className="m-0 font-display text-[17px] font-bold text-white">{title}</h2>
        {action}
      </div>
      <div className="px-4 sm:px-5">{children}</div>
    </section>
  )
}

/* One prospect, and what pressing him reveals.
 *
 * The expanded panel draws BOTH columns, and the right-hand one is the
 * reason the row is expandable at all. A profile that quietly listed five
 * fields would read as complete; one that names what it is missing tells a
 * reader how much weight the ranking above it will carry — the same job
 * the Juke score's own "unranked" note does for kickers. */
function Row({ rank, row, open, onToggle, note }) {
  const p = row.player
  const { known, missing } = knownAbout(row)
  const e = evidence(row)
  return (
    <div className="border-b border-line-hairline last:border-b-0" data-prospect-row>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-2.5 text-left"
      >
        <span className="w-6 shrink-0 font-mono text-[11px] text-ink-muted">
          {String(rank).padStart(2, '0')}
        </span>
        <PosTile pos={p.pos} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-white">{p.name}</span>
          <span className="block truncate font-mono text-[11px] text-ink-muted">
            {[row.stat.col, p.team].filter(Boolean).join(' · ')}
          </span>
        </span>
        {/* The number the list is ORDERED by, in the column the eye reads.

            This panel is titled "Rookies, by value over replacement" and
            ordered by exactly that -- row.value, the sort key -- and the
            quantity appeared in no row. What sat here instead was "7 of 8
            known", which reads identically on almost every row, so the one
            number on screen was constant and the one that varied was
            absent. On the product whose binding principle is that every
            number is explainable on the page where it appears, the list
            asked to be taken on faith.

            Same treatment as the homepage board peek 300px into the page,
            deliberately: mono, tabular, signed, gain-toned. A reader who
            has seen one recognises the other.

            Toned by sign, and here that IS the meaning rather than merely
            the direction: value over replacement above zero is a rookie
            who would start, below it one who would not. That is the
            opposite of the homepage's "Miss" column, where the same
            gain/cost pair had to be removed because the quantity there is
            an error magnitude and colouring it by direction praised the
            worst forecast on the table. Same two tokens, and the test for
            which applies is whether the sign carries a verdict.

            null stays a dash rather than a zero. A kicker or a defense is
            REFUSED a rating (UNRANKED_POSITIONS), and the note under this
            panel already says so -- printing 0 would turn a refusal into a
            verdict, which is the one thing withholding exists to avoid. */}
        <span className="shrink-0 text-right">
          <span
            className={
              'block font-mono text-meta tabular-nums ' +
              (row.value == null ? 'text-ink-muted' : row.value >= 0 ? 'text-gain' : 'text-cost')
            }
          >
            {row.value == null ? '—' : `${row.value >= 0 ? '+' : ''}${Math.round(row.value)}`}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
            {open ? 'hide' : `${e.known}/${e.total} known`}
          </span>
        </span>
      </button>

      {open ? (
        <div className="grid gap-4 pb-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-mint">
              On file
            </div>
            {known.map((k) => (
              <div key={k.label} className="flex justify-between gap-3 py-1 text-meta">
                <span className="text-ink-muted">{k.label}</span>
                <span className="font-mono text-voidInk-primary">{k.value}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-flow-amber">
              Not known
            </div>
            {missing.map((m) => (
              <div key={m} className="py-1 text-meta text-ink-muted">
                {m}
              </div>
            ))}
          </div>
          {/* Withholding has to be complete. A kicker sorted to the bottom
              of a board whose profile looks exactly like a ranked player's
              has told the reader nothing about why — the same failure as a
              sheet printing a dash and then arguing from the number. The
              sentence comes from jukeReadout(), which is where the app
              already says this on the player sheet. */}
          {note ? (
            <p className="m-0 max-w-[80ch] border-t border-line-hairline pt-3 text-[12px] leading-relaxed text-ink-muted sm:col-span-2">
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default function ProspectRoomLive({ tab }) {
  const engine = useEngine()
  /* useJukeTick TAKES the engine and returns nothing — it forces a
     re-render on `juke:header`. Called bare it attaches no listener and
     this room renders its loading block for ever. */
  useJukeTick(engine)
  const [open, setOpen] = useState(null)
  const [pos, setPos] = useState('ALL')

  const ready = !!(engine && engine.dataReady && engine.dataReady())
  const board = ready ? engine.board() : []
  const statOf = engine ? engine.statOf : null
  const gapOf = engine ? engine.replacementGap : null

  /* `board.length` is in the deps and `board` is not, for this project's
     own documented reason: the array is mutated in place and never
     replaced, so it is worthless as a memo key. PlayersTabPhone froze its
     whole player pool on exactly that, and the Waiver Room reproduced it
     once before catching it. Length is what actually moves here — an empty
     board becoming 480 rows when the deferred data lands. */
  /* rookies() stays pure — it takes lookups rather than the engine — so what
     the pipeline learned about each player is attached HERE, once, rather
     than read again inside knownAbout(). One interpretation of the three
     draft states, and it is prospectFor()'s. */
  const rows = useMemo(
    () =>
      rookies(board, statOf, gapOf).map((row) => ({
        ...row,
        prospect: engine && engine.prospectFor ? engine.prospectFor(row.player) : null,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length, statOf, gapOf, engine]
  )

  /* Below the hooks, and that placement is the whole point.
   *
   * The college half draws none of what is computed above -- no board, no
   * projection, no replacement level -- so returning early is right. But this
   * component does NOT unmount between tabs, and useMemo() sits above: an
   * early return placed before it changes the hook COUNT between 'college'
   * and every other tab, which React throws on. Written that way first and
   * caught by reading the order rather than by the crash.
   *
   * The same wall DraftLocker already hit once, and the reason RoomPage
   * computes its own state above three returns for. */
  if (tab === 'college') return <CollegeBoard />

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1280px] px-5 py-8 sm:px-10">
        <div className="h-[180px] animate-pulse rounded-[14px] border border-line-hairline bg-surface-card" />
      </div>
    )
  }

  /* The positions these rookies actually play, in board order, rather than
     POSITIONS — no rookie is ever a defense, and which of the other six a
     given class contains is a fact about the class. A chip for a position
     nobody plays is a dead control. */
  const positions = []
  for (const r of rows) if (!positions.includes(r.player.pos)) positions.push(r.player.pos)

  /* Why a filter at all, on a list that is already ordered.

     Value over replacement is the app's one currency and this room keeps
     it — but it buries quarterbacks by construction, because QB
     replacement is the highest on the board. Measured on the 8 September
     2026 class: the best rookie QB projects 239 points and scores -98,
     which puts him below every one of the nineteen tight ends. That is
     arithmetically right and it is not what somebody asking "who are the
     rookie quarterbacks" wants to read 40 rows to find out.

     A filter answers that without inventing a second ranking, which is
     what a per-position score or a hand-weighted board would be. */
  /* Why this row carries no rating, in the app's own words rather than a
     second copy of them. Only asked of a row that HAS none — jukeReadout()
     walks the projection and the signals, and running it for all 77 on
     every render would be work nobody reads. */
  const noteFor = (row) => {
    if (row.value !== null || !engine || !engine.jukeReadout) return null
    const readout = engine.jukeReadout(row.player)
    return readout && readout.unrankedNote ? readout.unrankedNote : null
  }

  const shown = pos === 'ALL' ? rows : rows.filter((r) => r.player.pos === pos)
  const limit = tab === 'board' ? shown.length : LOBBY_ROWS
  const more = shown.length - limit

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 sm:px-10">
      <Banner rows={rows} />
      {positions.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {['ALL'].concat(positions).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPos(key)}
              aria-pressed={pos === key}
              className={
                /* min-h/min-w rather than more padding: these measured
                   32x27 (and "K" at 32 wide), under the 44px comfort
                   target on a product that calls phones a first-class
                   drafting surface. Padding would have grown the pill
                   visually; a minimum with centred content grows the
                   TARGET and leaves the chip looking as it did. */
                'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-150 ' +
                (pos === key
                  ? 'border-mint/60 bg-mint/15 text-mint'
                  : 'border-line-hairline text-ink-muted hover:border-white/25')
              }
            >
              {key}
            </button>
          ))}
        </div>
      ) : null}

      <Panel
        title="Rookies, by value over replacement"
        action={
          <span className="font-mono text-[11px] text-ink-muted">
            {shown.length} first-year {shown.length === 1 ? 'player' : 'players'}
          </span>
        }
      >
        {shown.length ? (
          <>
            {shown.slice(0, limit).map((row, i) => (
              <Row
                key={row.player.id}
                rank={i + 1}
                row={row}
                note={noteFor(row)}
                open={open === row.player.id}
                onToggle={() => setOpen(open === row.player.id ? null : row.player.id)}
              />
            ))}
            {more > 0 ? (
              <div className="py-3 text-center font-mono text-[11px] text-ink-muted">
                {more} more on the Big Board
              </div>
            ) : null}
          </>
        ) : (
          /* Absent, not broken. Between the last game of a season and the
             next class being added to the board this is the honest state,
             and it says which one it is. */
          <div className="py-10 text-center text-meta text-ink-muted">
            No first-year players are on the board yet. Between the season and the incoming class
            that is the normal state rather than an error.
          </div>
        )}
      </Panel>

      {/* Ranked by Juke's own projection rather than by ADP, and the screen
          says which — a board that mirrored the market would have nothing
          of its own to say about a player nobody has seen play. */}
      <p className="mt-3 max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
        Ordered by projected points over replacement at each position, not by draft position. A
        rookie Juke declines to rate — a kicker or a defense — sits at the bottom rather than the
        top, and says so when you open him.
      </p>
    </div>
  )
}
