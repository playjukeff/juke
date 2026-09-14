import { useMemo, useState } from 'react'
import { evidence, knownAbout, productionLine, rookies } from '../../rooms/prospectBoard.js'
import { Delta, Fig, Label, PageHead, PosTag, QuietButton, Seg, Sheet, Skeleton, cx } from '../ui.jsx'
import { UNRANKED, posWord } from './playerData.js'
import { Chips, PlayerFace, ViewTabs } from './parts.jsx'
import { useBoardKey } from './useBoardKey.js'

/* Rookies — production's Prospect Room, as a view of the Players place.

   It needs no league (a rookie is a rookie whoever you are) and reads only
   what every visitor already has: the board, stats.js's `exp` and `pr`
   blocks, and the college board. Two halves, and they are different KINDS
   of player rather than two views of the same ones:

     The class    first-year NFL players on tonight's board, ranked by points
                  over replacement — prospectBoard.js's rookies(), with
                  replacementGap() as the ranking, exactly as the room did
     In college   players nobody has drafted yet, keyed by CFBD id rather
                  than Sleeper id, ordered by production within position

   Production's third tab, "Lobby", was the first eight rows of the Big
   Board and nothing else; it is folded into the class list here, which
   pages instead.

   ---- The honesty problem, kept load-bearing ----

   The room's own posture was that it ranks rookies and cannot fully explain
   them, and it said so with a notice whose counts are derived from the rows
   rather than written down — so the notice cannot go stale the day the
   pipeline learns something. That notice is the first thing here too, and
   every row still opens onto what is on file and what is not. */

const CLASS_PAGE = 25
const COLLEGE_PAGE = 24

function classLabel(year) {
  return { 1: 'FR', 2: 'SO', 3: 'JR', 4: 'SR', 5: 'SR+', 6: 'SR+' }[year] || '—'
}

function readClass(engine) {
  const board = engine.board()
  if (!board || !board.length) return null
  const rows = rookies(board, engine.statOf, engine.replacementGap).map((row) => ({
    ...row,
    prospect: engine.prospectFor ? engine.prospectFor(row.player) : null,
  }))
  let drafted = 0
  let undrafted = 0
  let withCollege = 0
  for (const r of rows) {
    if (!r.prospect) continue
    if (r.prospect.drafted) drafted += 1
    if (r.prospect.undrafted) undrafted += 1
    if (r.prospect.college) withCollege += 1
  }
  const positions = []
  for (const r of rows) if (!positions.includes(r.player.pos)) positions.push(r.player.pos)
  return { rows, drafted, undrafted, withCollege, positions }
}

function Notice({ c }) {
  const anything = c.drafted || c.undrafted || c.withCollege
  return (
    <Sheet code="What is known, and what is not" aside="Read this first" aria-label="What is known, and what is not">
      <p className="max-w-[78ch] text-[16px] leading-[1.6] text-v3-ink">
        {anything ? (
          <>
            Where <Fig className="font-bold">{c.drafted}</Fig> of these {c.rows.length} players went in the NFL draft, and what{' '}
            <Fig className="font-bold">{c.withCollege}</Fig> of them did in college.{' '}
            {c.undrafted ? <><Fig className="font-bold">{c.undrafted}</Fig> were never drafted at all — a fact about them rather than a gap in what we know. </> : null}
            Nobody here has a combine number: no feed in this product carries one yet, so every profile still says so.
          </>
        ) : (
          <>No draft class has been read yet, so nothing below carries a draft position or a college line. That fills on the next nightly rebuild — a fact about the pipeline rather than about this year&apos;s rookies.</>
        )}
      </p>
      <p className="mt-3 max-w-[78ch] text-[14px] leading-[1.55] text-v3-ink2">
        So Juke ranks this class and keeps its confidence low. Each row says how much of its ranking stands on evidence — a count of what is known, never a percentage dressed up to look uncertain.
      </p>
    </Sheet>
  )
}

function ClassRow({ rank, row, open, onToggle, note }) {
  const p = row.player
  const { known, missing } = knownAbout(row)
  const e = evidence(row)
  const d = row.prospect && row.prospect.drafted
  const panel = `rookie-${p.id}`
  return (
    <li className="border-b border-v3-rule last:border-b-0" data-prospect-row>
      <div className="grid grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[2rem_auto_minmax(0,1fr)_7rem_5rem_auto] sm:px-5">
        <Fig className="text-[13px] text-v3-ink3">{String(rank).padStart(2, '0')}</Fig>
        <PlayerFace photo={row.photo} initials={row.initials} pos={p.pos} size={40} />
        <div className="min-w-0">
          <a href={`#/players/${encodeURIComponent(p.id)}`} className="block truncate text-[15px] font-semibold text-v3-ink hover:underline focus-visible:rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">{p.name}</a>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
            <PosTag pos={p.pos} />
            <span className="truncate font-figure text-[13px] text-v3-ink2">{[row.stat.col, p.team].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <Label className="block text-[11px] sm:sr-only">NFL draft</Label>
          <Fig className="text-[14px] font-semibold text-v3-ink">
            {d ? `Rd ${d.round} · #${d.overall}` : row.prospect && row.prospect.undrafted ? 'Undrafted' : '—'}
          </Fig>
        </div>
        <div className="text-right">
          <Label className="block text-[11px] sm:sr-only">Over repl.</Label>
          {row.value === null ? <Fig className="text-[16px] text-v3-ink3">—</Fig> : <Delta value={row.value} className="text-[16px]" />}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panel}
          className="col-span-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[6px] border border-v3-rule px-3 sm:w-[132px] font-figure text-[13px] font-semibold text-v3-ink2 hover:border-v3-ink3 hover:text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call sm:col-span-1"
        >
          <span className="tabular-nums">{e.known}/{e.total} known</span>
          <span aria-hidden="true" className={cx('inline-block transition-transform duration-150 motion-reduce:transition-none', open ? 'rotate-180' : '')}>▾</span>
          <span className="sr-only">{open ? 'Hide' : 'Show'} what is known about {p.name}</span>
        </button>
      </div>
      {open && (
        <div id={panel} className="grid grid-cols-1 gap-4 border-t border-v3-rule bg-v3-paper px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <Label>On file</Label>
            <dl className="mt-1.5 grid gap-1">
              {known.map((k) => (
                <div key={k.label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[14px] text-v3-ink2">{k.label}</dt>
                  <dd className="min-w-0 text-right font-figure text-[14px] font-semibold text-v3-ink">{k.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <Label>Not known</Label>
            <ul className="mt-1.5 grid gap-1">
              {missing.map((m) => <li key={m} className="text-[14px] text-v3-ink2">{m}</li>)}
            </ul>
          </div>
          {note && <p className="text-[13px] leading-[1.55] text-v3-ink3 sm:col-span-2">{note}</p>}
        </div>
      )}
    </li>
  )
}

function ClassView({ c, engine }) {
  const [pos, setPos] = useState('ALL')
  const [open, setOpen] = useState(null)
  const [limit, setLimit] = useState(CLASS_PAGE)
  const shown = pos === 'ALL' ? c.rows : c.rows.filter((r) => r.player.pos === pos)
  const page = shown.slice(0, limit)
  // Why a row carries no rating, in the engine's own words — asked only of a
  // row that has none (a kicker, a defense), never of all of them.
  const noteFor = (row) => {
    if (row.value !== null || !UNRANKED.includes(row.player.pos) || !engine.jukeReadout) return null
    const r = engine.jukeReadout(row.player)
    return r && r.unrankedNote ? r.unrankedNote : null
  }
  return (
    <div className="grid gap-5">
      <Notice c={c} />
      {c.positions.length > 1 && (
        <div className="grid gap-1">
          <Label>Position</Label>
          <Chips
            label="Position"
            value={pos}
            onChange={(v) => { setPos(v); setLimit(CLASS_PAGE); setOpen(null) }}
            options={['ALL', ...c.positions].map((p) => ({ value: p, label: p === 'ALL' ? 'All' : posWord(p) }))}
          />
        </div>
      )}
      <Sheet code="The class, ranked" aside={`${shown.length} ${shown.length === 1 ? 'player' : 'players'}`} bodyClass="p-0">
        {shown.length === 0 ? (
          <p className="p-6 text-[15px] text-v3-ink2">No first-year players are on the board yet. Between the season and the incoming class that is the normal state rather than an error.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[2rem_auto_minmax(0,1fr)_7rem_5rem_auto] items-end gap-3 border-b border-v3-rule px-5 py-2 sm:grid" aria-hidden="true">
              <Label className="text-[11px]">#</Label>
              <span className="w-10" />
              <Label className="text-[11px]">Player · college · team</Label>
              <Label className="text-right text-[11px]">NFL draft</Label>
              <Label className="text-right text-[11px]">Over repl.</Label>
              <Label className="w-[132px] text-center text-[11px]">Evidence</Label>
            </div>
            <ul aria-label="First-year players">
              {page.map((row, i) => (
                <ClassRow
                  key={row.player.id}
                  rank={i + 1}
                  row={row}
                  note={noteFor(row)}
                  open={open === row.player.id}
                  onToggle={() => setOpen(open === row.player.id ? null : row.player.id)}
                />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-4 sm:px-5">
              <p className="font-figure text-[13px] text-v3-ink2">Showing <Fig className="font-bold text-v3-ink">{page.length}</Fig> of <Fig className="font-bold text-v3-ink">{shown.length}</Fig></p>
              {page.length < shown.length && <QuietButton onClick={() => setLimit((l) => l + CLASS_PAGE)}>Show {Math.min(CLASS_PAGE, shown.length - page.length)} more</QuietButton>}
            </div>
          </>
        )}
      </Sheet>
      <p className="max-w-[76ch] text-[13px] leading-[1.55] text-v3-ink3">
        Ordered by projected points over replacement at each position, not by draft position — a board that mirrored the market would have nothing of its own to say about players nobody has seen play. A rookie Juke declines to rate, a kicker or a defense, sits at the bottom rather than the top, and says so when you open him.
      </p>
    </div>
  )
}

function CollegeView({ engine }) {
  const [pos, setPos] = useState('ALL')
  const [limit, setLimit] = useState(COLLEGE_PAGE)
  const key = useBoardKey()
  const rows = useMemo(() => (key && engine.collegeBoard ? engine.collegeBoard() : []), [key, engine])
  const meta = engine.collegeBoardMeta ? engine.collegeBoardMeta() : null

  if (!rows.length) {
    return (
      <Sheet code="In college" aside="Nothing yet">
        <p className="text-[16px] text-v3-ink">No college board yet.</p>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-[1.55] text-v3-ink2">This fills from College Football Data on the next nightly rebuild. Until then there is nothing to show — a fact about the pipeline rather than about this year&apos;s class.</p>
      </Sheet>
    )
  }
  const positions = []
  for (const r of rows) if (!positions.includes(r.pos)) positions.push(r.pos)
  const filtered = pos === 'ALL' ? rows : rows.filter((r) => r.pos === pos)
  const page = filtered.slice(0, limit)
  return (
    <div className="grid gap-5">
      <Sheet code="Not drafted yet" aside={meta ? `${meta.season} season` : ''} aria-label="About the college board">
        <p className="max-w-[78ch] text-[16px] leading-[1.6] text-v3-ink">
          Every player here is still in college and has never been drafted, so none of them can be queued or drafted in a mock, and none has a page of his own yet. They arrive on the real board the season an NFL team takes one.
          {meta ? <> Production is their <Fig className="font-bold">{meta.season}</Fig> season; class years are from the {meta.roster} rosters, and the next draft they can enter is <Fig className="font-bold">{meta.draft}</Fig>.</> : null}{' '}
          There is no combine testing and no draft position for any of them yet — nobody has measured or picked them.
        </p>
      </Sheet>
      {positions.length > 1 && (
        <div className="grid gap-1">
          <Label>Position</Label>
          <Chips label="Position" value={pos} onChange={(v) => { setPos(v); setLimit(COLLEGE_PAGE) }} options={['ALL', ...positions].map((p) => ({ value: p, label: p === 'ALL' ? 'All' : posWord(p) }))} />
        </div>
      )}
      <Sheet code="By production" aside={`${filtered.length} ${filtered.length === 1 ? 'player' : 'players'}`} bodyClass="p-0">
        <ul aria-label="College players">
          {page.map((row) => {
            const line = productionLine(row.pos, row.college).join(' · ')
            return (
              <li key={row.id} data-college-row className="grid grid-cols-[3rem_auto_minmax(0,1fr)] items-center gap-3 border-b border-v3-rule px-4 py-3 last:border-b-0 sm:grid-cols-[3rem_auto_minmax(0,1fr)_auto] sm:px-5">
                {/* His rank AT HIS POSITION, the room's own vocabulary. */}
                <Fig className="text-[13px] font-semibold text-v3-ink2">{posWord(row.pos)}{row.rank || '—'}</Fig>
                <PosTag pos={row.pos} />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-v3-ink">{row.name}</div>
                  <div className="truncate font-figure text-[13px] text-v3-ink2">{row.school} · {classLabel(row.classYear)}</div>
                  <div className="mt-0.5 truncate font-figure text-[13px] text-v3-ink sm:hidden">{line || '—'}</div>
                </div>
                <div className="hidden text-right font-figure text-[14px] text-v3-ink sm:block">{line || '—'}</div>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-4 sm:px-5">
          <p className="font-figure text-[13px] text-v3-ink2">Showing <Fig className="font-bold text-v3-ink">{page.length}</Fig> of <Fig className="font-bold text-v3-ink">{filtered.length}</Fig></p>
          {page.length < filtered.length && <QuietButton onClick={() => setLimit((l) => l + COLLEGE_PAGE)}>Show {Math.min(COLLEGE_PAGE, filtered.length - page.length)} more</QuietButton>}
        </div>
      </Sheet>
      <p className="max-w-[76ch] text-[13px] leading-[1.55] text-v3-ink3">
        Ranked within each position by yards, which is production and not a prospect ranking — it rewards volume and opportunity rather than talent, and a scout&apos;s board would look different. Juke does not reorder them, because that would mean inventing a scouting model rather than reporting what happened. FBS only, and only players a year or more from being draft-eligible.
      </p>
    </div>
  )
}

export default function V3Rookies() {
  const key = useBoardKey()
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const [view, setView] = useState('class')
  const c = useMemo(() => {
    if (!key || !engine) return null
    const data = readClass(engine)
    if (!data) return null
    for (const r of data.rows) {
      r.photo = engine.photoUrl ? engine.photoUrl(r.player) : ''
      r.initials = engine.initials ? engine.initials(r.player.name) : ''
    }
    return data
  }, [key, engine])

  return (
    <div className="grid gap-8">
      <PageHead
        label={c ? `Players · rookies · ${c.rows.length} in their first season` : 'Players · rookies'}
        title="The rookie class, and what we don't know yet."
        lede="Every first-year player on the board, ranked by points over the player a league your size would start instead — and, for each, what is on file and what is not. Behind them, the players still in college."
        action={<ViewTabs current="rookies" />}
      />
      <div>
        <Seg
          label="Which rookies"
          value={view}
          onChange={setView}
          options={[{ value: 'class', label: 'The class' }, { value: 'college', label: 'In college' }]}
        />
      </div>
      {!engine || !key ? (
        <Skeleton lines={8} />
      ) : view === 'college' ? (
        <CollegeView engine={engine} />
      ) : c ? (
        <ClassView c={c} engine={engine} />
      ) : (
        <Skeleton lines={8} />
      )}
    </div>
  )
}

