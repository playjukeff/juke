import { useMemo, useState } from 'react'
import { evidence, knownAbout, productionLine, rookies } from '../../rooms/prospectBoard.js'
import { useEngine, useJukeTick } from '../../../hooks/useJukeEngine.js'
import { Kicker } from '../v2ui.jsx'
import { ChipRow, Empty, Loading, Panel, PosSquare } from './roomKit.jsx'

/* The Prospect Room — open to everybody, because nothing on it reads a
   league: every fact comes off players.js/stats.js, which every visitor
   already has (production's OPEN_ROOMS, asked through roomIsOpen()).

   Rookies are prospectBoard.js's rookies() ranked by
   JukeEngine.replacementGap(); what is known and what is not is its
   knownAbout(), with JukeEngine.prospectFor() attached once; the college
   half is JukeEngine.collegeBoard(). Evidence is a COUNT, never a
   confidence percentage — a number chosen to look uncertain is still a
   number. Three sections, as production: Lobby, Big Board, In College. */

const LOBBY_ROWS = 8
const COLLEGE_PAGE = 24

/* What is known, counted from the rows rather than written down — so a
   class where nothing joined says so on its own. */
function KnownBanner({ rows }) {
  let drafted = 0, undrafted = 0, withCollege = 0
  for (const row of rows) {
    const p = row.prospect
    if (!p) continue
    if (p.drafted) drafted += 1
    if (p.undrafted) undrafted += 1
    if (p.college) withCollege += 1
  }
  const anything = drafted || undrafted || withCollege
  const Stat = ({ n, label }) => (
    <div className="flex flex-col-reverse rounded-[12px] bg-v2-inset px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
      <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-v2-ink3">{label}</dt>
      <dd className="font-telemetry text-[30px] font-bold leading-none tabular-nums text-v2-ink">{n}</dd>
    </div>
  )
  return (
    <section className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-v2-warn/30">
      <Kicker tone="text-v2-warn">What is known, and what is not</Kicker>
      {anything ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat n={rows.length} label="first-year players" />
            <Stat n={drafted} label="draft position known" />
            <Stat n={withCollege} label="college line known" />
            <Stat n={undrafted} label="went undrafted" />
          </dl>
          <p className="mt-3 max-w-[74ch] text-[13px] leading-[1.55] text-v2-ink2">
            Undrafted is a fact about a player rather than a gap in what we know. Nobody here has a combine number: no
            feed in this product carries one yet, so every profile still says so.
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-[72ch] text-[13px] leading-[1.55] text-v2-ink2">
          No draft class has been read yet, so nothing below carries a draft position or a college line. That fills on
          the next nightly rebuild — it is a fact about the pipeline rather than about this year&rsquo;s rookies.
        </p>
      )}
    </section>
  )
}

/* One rookie, and what pressing him reveals: both columns, because a
   profile that quietly listed five fields would read as complete. */
function RookieRow({ rank, row, open, onToggle, note }) {
  const p = row.player
  const { known, missing } = knownAbout(row)
  const e = evidence(row)
  const id = `v2-rookie-${p.id}`
  return (
    <div className="border-b border-white/[0.05] last:border-b-0" data-prospect-row>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v2-volt"
      >
        <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3">{String(rank).padStart(2, '0')}</span>
        <PosSquare pos={p.pos} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-v2-ink">{p.name}</span>
          <span className="block truncate font-mono text-[11px] text-v2-ink3">{[row.stat.col, p.team].filter(Boolean).join(' · ')}</span>
        </span>
        {/* The number the list is ordered by, in the column the eye reads.
            Toned by sign because here the sign IS the verdict: above zero
            would start, below would not. null is a refusal, drawn as a dash. */}
        <span className="shrink-0 text-right">
          <span className={`block font-mono text-[14px] font-semibold tabular-nums ${row.value == null ? 'text-v2-ink3' : row.value >= 0 ? 'text-v2-volt' : 'text-v2-loss'}`}>
            {row.value == null ? '—' : `${row.value >= 0 ? '+' : '−'}${Math.abs(Math.round(row.value))}`}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-v2-ink3">{e.known}/{e.total} known</span>
        </span>
        <svg viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-v2-ink3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={id} className="grid grid-cols-1 gap-4 pb-4 pl-9 sm:grid-cols-2">
          <div className="rounded-[12px] bg-v2-inset p-3 ring-1 ring-inset ring-white/[0.06]">
            <Kicker tone="text-v2-ink2">On file</Kicker>
            <dl className="mt-1.5">
              {known.map((k) => (
                <div key={k.label} className="flex justify-between gap-3 py-1 text-[13px]">
                  <dt className="text-v2-ink3">{k.label}</dt>
                  <dd className="min-w-0 text-right font-mono text-v2-ink">{k.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-[12px] bg-v2-inset p-3 ring-1 ring-inset ring-white/[0.06]">
            <Kicker tone="text-v2-warn">Not known</Kicker>
            <ul className="mt-1.5">
              {missing.map((m) => <li key={m} className="py-1 text-[13px] text-v2-ink2">{m}</li>)}
            </ul>
          </div>
          {note && <p className="text-[12px] leading-[1.55] text-v2-ink3 sm:col-span-2">{note}</p>}
        </div>
      )}
    </div>
  )
}

function classLabel(year) {
  return { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'SR+', 6: 'SR+' }[year] || '—'
}

/* Players still in college and never drafted — keyed by CFBD id, on no
   Juke board, and ordered by production (which the page says is not a
   prospect ranking). JukeEngine.collegeBoard() is the whole source. */
function CollegeBoard({ engine }) {
  const [pos, setPos] = useState('ALL')
  const [shown, setShown] = useState(COLLEGE_PAGE)
  const ready = !!(engine && engine.dataReady && engine.dataReady())
  const rows = useMemo(
    () => (engine && engine.collegeBoard ? engine.collegeBoard() : []),
    [engine, ready]
  )
  const meta = engine && engine.collegeBoardMeta ? engine.collegeBoardMeta() : null

  if (!ready) return <Loading />
  if (!rows.length) {
    return (
      <Panel>
        <Empty>
          No college board yet. It fills from College Football Data on the next nightly rebuild — a fact about the
          pipeline rather than about this year&rsquo;s class.
        </Empty>
      </Panel>
    )
  }

  const positions = []
  for (const r of rows) if (!positions.includes(r.pos)) positions.push(r.pos)
  const filtered = pos === 'ALL' ? rows : rows.filter((r) => r.pos === pos)
  const page = filtered.slice(0, shown)

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] bg-v2-panel p-5 ring-1 ring-inset ring-v2-cyan/25">
        <Kicker tone="text-v2-cyan">Not drafted · not on any Juke board</Kicker>
        <p className="mt-2 max-w-[76ch] text-[13px] leading-[1.55] text-v2-ink2">
          Every player here is still in college and has never been drafted, so none of them can be queued or drafted in
          a mock. They arrive on the real board the season an NFL team takes one.
          {meta && (
            <> Production is their <b className="font-semibold text-v2-ink">{meta.season}</b> season; class years are from
            the {meta.roster} rosters, and the next draft they can enter is <b className="font-semibold text-v2-ink">{meta.draft}</b>.</>
          )}{' '}
          There is no combine testing and no draft position for any of them yet — nobody has measured or picked them.
        </p>
      </section>

      {positions.length > 1 && (
        <ChipRow label="Filter by position" options={['ALL'].concat(positions)} value={pos} onChange={(k) => { setPos(k); setShown(COLLEGE_PAGE) }} />
      )}

      <Panel title="By college production, within position" action={<Kicker>{filtered.length} {filtered.length === 1 ? 'player' : 'players'}</Kicker>}>
        {page.map((row) => {
          const line = productionLine(row.pos, row.college).join(' · ')
          return (
            <div key={row.id} data-college-row className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0">
              {/* His rank AT HIS POSITION — "WR3" is a fact; a row index in a
                  filtered list is only where he happens to sit. */}
              <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-v2-ink3">{row.pos}{row.rank || '—'}</span>
              <PosSquare pos={row.pos} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-v2-ink">{row.name}</span>
                <span className="block truncate font-mono text-[11px] text-v2-ink3">{row.school} · {classLabel(row.classYear)}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-v2-ink2 sm:hidden">{line}</span>
              </span>
              <span className="hidden max-w-[45%] shrink-0 truncate text-right font-mono text-[12px] tabular-nums text-v2-ink2 sm:block">{line}</span>
            </div>
          )
        })}
        {page.length < filtered.length && (
          <div className="py-3 text-center">
            <button
              type="button"
              onClick={() => setShown(shown + COLLEGE_PAGE)}
              className="inline-flex min-h-[44px] items-center rounded-[10px] px-4 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
            >
              Show {Math.min(COLLEGE_PAGE, filtered.length - page.length)} more
            </button>
          </div>
        )}
      </Panel>
      <p className="max-w-[76ch] text-[12px] leading-[1.55] text-v2-ink3">
        Ranked within each position by yards, which is production and not a prospect ranking — it rewards volume and
        opportunity rather than talent, and a scout&rsquo;s board would look different. Juke does not reorder them,
        because doing so would mean inventing a scouting model rather than reporting what happened. FBS only, and only
        players a year or more from being draft-eligible.
      </p>
    </div>
  )
}

export default function ProspectRoom({ tab, setTab }) {
  const engine = useEngine()
  useJukeTick(engine)
  const [open, setOpen] = useState(null)
  const [pos, setPos] = useState('ALL')

  const ready = !!(engine && engine.dataReady && engine.dataReady())
  const board = ready ? engine.board() : []
  const statOf = engine ? engine.statOf : null
  const gapOf = engine ? engine.replacementGap : null

  const rows = useMemo(
    () => rookies(board, statOf, gapOf).map((row) => ({
      ...row,
      prospect: engine && engine.prospectFor ? engine.prospectFor(row.player) : null,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.length, statOf, gapOf, engine]
  )

  // Below every hook: the college half draws none of the above, and this
  // component does not unmount between tabs.
  if (tab === 'college') return <CollegeBoard engine={engine} />
  if (!ready) return <Loading />

  const positions = []
  for (const r of rows) if (!positions.includes(r.player.pos)) positions.push(r.player.pos)
  // Why the sentence, only for a row with no rating — the app's own words.
  const noteFor = (row) => {
    if (row.value !== null || !engine || !engine.jukeReadout) return null
    const readout = engine.jukeReadout(row.player)
    return readout && readout.unrankedNote ? readout.unrankedNote : null
  }
  const shown = pos === 'ALL' ? rows : rows.filter((r) => r.player.pos === pos)
  const limit = tab === 'board' ? shown.length : LOBBY_ROWS
  const more = shown.length - limit

  return (
    <div className="space-y-4">
      <KnownBanner rows={rows} />
      {positions.length > 1 && (
        /* A filter rather than a second ranking: value over replacement
           buries quarterbacks by construction (QB replacement is the highest
           on the board), and "who are the rookie QBs" should not take forty
           rows to answer. */
        <ChipRow label="Filter by position" options={['ALL'].concat(positions)} value={pos} onChange={setPos} />
      )}
      <Panel
        title="Rookies, by value over replacement"
        action={<Kicker>{shown.length} first-year {shown.length === 1 ? 'player' : 'players'}</Kicker>}
      >
        {shown.length ? (
          <>
            {shown.slice(0, limit).map((row, i) => (
              <RookieRow
                key={row.player.id}
                rank={i + 1}
                row={row}
                note={noteFor(row)}
                open={open === row.player.id}
                onToggle={() => setOpen(open === row.player.id ? null : row.player.id)}
              />
            ))}
            {more > 0 && (
              <div className="py-3 text-center">
                <button
                  type="button"
                  onClick={() => setTab('board')}
                  className="inline-flex min-h-[44px] items-center rounded-[10px] px-4 text-[13px] font-medium text-v2-ink ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-volt"
                >
                  {more} more on the Big Board
                </button>
              </div>
            )}
          </>
        ) : (
          <Empty>No first-year players are on the board yet. Between the season and the incoming class that is the normal state rather than an error.</Empty>
        )}
      </Panel>
      <p className="max-w-[70ch] text-[12px] leading-[1.55] text-v2-ink3">
        Ordered by projected points over replacement at each position, not by draft position. A rookie Juke declines to
        rate — a kicker or a defense — sits at the bottom rather than the top, and says so when you open him.
      </p>
    </div>
  )
}
