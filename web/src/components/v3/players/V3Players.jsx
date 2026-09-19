import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { readSituation } from '../data.js'
import { Delta, Fig, Headline, Icon, Label, PageHead, PosTag, QuietButton, Seg, Sheet, Skeleton, cx } from '../ui.jsx'
import {
  FORMATS, FORMAT_LABEL, MODE_LABEL, MODE_SORT, POSITIONS, SORTS, filterRows, liveFormat, posWord, readIndex,
  scoringName, seasonModes, sortRows, weightNote,
} from './playerData.js'
import { Chips, DeepTag, InjuryTag, LiveTag, PLAYERS_PREFS, PlayerFace, RookieTag, SelectField, TenureControl } from './parts.jsx'
import { useBoardKey } from './useBoardKey.js'
import { LAYOUT_ROW, motion } from '../motion.jsx'
import { useLeagueFresh, useSnapshotFresh } from '../../v2/stores.js'

/* Players — the index. Production has no player index at all: a player is
   reachable only as a sheet inside the Draft Room, which means only during
   a draft. This is every player on tonight's board, sortable, filterable,
   and re-priced by a scoring switch, each row an address of its own.

   ---- What is and is not re-priced by the switch ----

   Projected points, points over replacement and the position rank move
   with it — vorpUnder(format) is the engine's own answer for each table.
   ADP does not (it is the market for the scoring the board was built on),
   and neither does the Juke score, which the engine computes only under
   the live scoring. Both say so under the controls rather than quietly
   holding still while their neighbours move.

   ---- Three orders once the season starts ----

   Out of season this screen is exactly what it was, with no extra control
   at all. Once a regular season has kicked off (playerData's seasonModes(),
   off app.js's seasonClock()) it takes three:

     Rest of season  — Juke's forward view, and the default, because it is
                       what every recommendation in the app prices on.
     Season so far   — what he has actually scored. A fact, not a forecast.
     Preseason       — the draft board, untouched, for comparison.

   The mode swaps the COLUMNS as well as the sort, because the three answer
   different questions and a table that kept one set would be printing
   preseason points under a heading about the rest of the season. They are
   never blended into one number anywhere — see app.js section 10a2.

   ---- 480 rows, and not 480 at once ----

   Fifty at a time, with "Show more". A filter or a new sort starts again
   at fifty. The filters survive a trip to a player page and back, through
   sessionStorage, because losing a sorted, filtered list to one click is
   the index failing at the one thing it is for. */

const PAGE = 50
const STORE = PLAYERS_PREFS

function loadPrefs() {
  try {
    const raw = sessionStorage.getItem(STORE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function savePrefs(p) {
  try { sessionStorage.setItem(STORE, JSON.stringify(p)) } catch { /* private mode: the index still works, it just forgets */ }
}

/* The table's columns, in reading order, per mode. `sort` is a key into
   SORTS, so every heading here is a real order the list can take. The last
   two are the same in all three: a bye and a designation are facts about
   the player rather than about a horizon. */
const BYE_INJ = [
  { key: 'bye', label: 'Bye', sort: 'bye', w: 'w-[66px]' },
  { key: 'inj', label: 'Status', sort: 'inj', w: 'w-[96px]' },
]

const MODE_COLS = {
  pre: [
    { key: 'adp', label: 'ADP', sort: 'adp', w: 'w-[76px]' },
    { key: 'posRk', label: 'Pos rk', sort: 'posRk', w: 'w-[92px]' },
    { key: 'pts', label: 'Proj pts', sort: 'pts', w: 'w-[106px]' },
    { key: 'vorp', label: 'Over repl.', sort: 'vorp', w: 'w-[124px]' },
    { key: 'juke', label: 'Juke', sort: 'juke', w: 'w-[78px]' },
    ...BYE_INJ,
  ],
  ros: [
    { key: 'rosRank', label: 'ROS rk', sort: 'rosRank', w: 'w-[84px]' },
    { key: 'rosDelta', label: 'Moved', sort: 'delta', w: 'w-[84px]' },
    { key: 'rosPts', label: 'ROS pts', sort: 'rosPts', w: 'w-[100px]' },
    { key: 'rosRate', label: 'Per game', sort: 'rosRate', w: 'w-[100px]' },
    /* Same label as pre's `vorp` column, so the same width: 110 was 8px
       short of its own header and the sideways sweep has been reporting it
       at 1440 for a while. A width hand-set against a string is wrong the
       moment the string is longer than the guess. */
    { key: 'rosGap', label: 'Over repl.', sort: 'rosGap', w: 'w-[124px]' },
    ...BYE_INJ,
  ],
  season: [
    { key: 'games', label: 'GP', sort: 'games', w: 'w-[62px]' },
    { key: 'seasonPts', label: 'Season pts', sort: 'seasonPts', w: 'w-[118px]' },
    { key: 'ppg', label: 'Per game', sort: 'ppg', w: 'w-[104px]' },
    { key: 'adp', label: 'ADP', sort: 'adp', w: 'w-[76px]' },
    ...BYE_INJ,
  ],
}

/* The one figure each mode is about, for the phone card's right edge when
   the list is sorted by something that is not a number (a name, a status). */
const MODE_HEAD = { pre: 'pts', ros: 'rosRank', season: 'seasonPts' }

function fmtAdp(v) { return v === null ? '—' : v.toFixed(1) }
function fmtPts(v) { return v === null ? '—' : Math.round(v) }
function fmtOne(v) { return v === null || v === undefined ? '—' : v.toFixed(1) }
function fmtRk(r) { return r.posRk === null ? '—' : `${posWord(r.pos)}${r.posRk}` }

/* One cell, at the table's size or the phone list's. Both lists render
   through this, so a figure cannot be formatted one way in a row and
   another in a card — the written-down-twice rule, with a number in it. */
function Cell({ col, row, big = false }) {
  const t = big ? 'text-[18px]' : 'text-[15px]'
  if (col === 'adp') return <Fig className={cx(t, row.deep ? 'text-v3-ink3' : 'text-v3-ink')}>{fmtAdp(row.adp)}</Fig>
  if (col === 'posRk') return <Fig className={cx(t, 'text-v3-ink', big && 'font-bold')}>{fmtRk(row)}</Fig>
  if (col === 'pts') return <Fig className={cx(t, 'font-bold text-v3-ink')}>{fmtPts(row.pts)}</Fig>
  if (col === 'vorp') return <Delta value={row.vorp} className={t} />
  if (col === 'juke') return <Fig className={cx(t, 'font-bold', row.juke === null ? 'text-v3-ink3' : 'text-v3-ink')}>{row.juke === null ? '—' : row.juke}</Fig>
  if (col === 'bye') return <Fig className={cx(t, 'text-v3-ink2', big && 'font-bold')}>{row.bye || '—'}</Fig>
  if (col === 'inj') return row.inj ? <InjuryTag code={row.inj} /> : <span className="sr-only">No designation</span>
  // The season's own cells. A kicker has no rest-of-season RANK and a
  // defense none either — UNRANKED_POSITIONS carries over to a forward
  // order exactly as it does to the preseason one — so those read as
  // dashes while his points and his rate, which are real, do not.
  if (col === 'rosRank') return <Fig className={cx(t, 'font-bold', row.rosRank === null ? 'text-v3-ink3' : 'text-v3-ink')}>{row.rosRank === null ? '—' : `#${row.rosRank}`}</Fig>
  // Places moved, signed and coloured: up is a gain. Never teal, which is
  // this app's action colour and not a value's direction.
  if (col === 'rosDelta') return <Delta value={row.rosDelta} className={t} />
  if (col === 'rosPts') return <Fig className={cx(t, 'font-bold text-v3-ink')}>{fmtPts(row.rosPts)}</Fig>
  if (col === 'rosRate') return <Fig className={cx(t, 'text-v3-ink2', big && 'font-bold')}>{fmtOne(row.rosRate)}</Fig>
  if (col === 'rosGap') return <Delta value={row.rosGap} className={t} />
  if (col === 'games') return <Fig className={cx(t, 'text-v3-ink2', big && 'font-bold')}>{row.games === null ? '—' : row.games}</Fig>
  // No games played is not nought points: a man who has not been on a field
  // has no season to date, and a 0 there would be a judgement about it.
  if (col === 'seasonPts') return <Fig className={cx(t, 'font-bold', row.games ? 'text-v3-ink' : 'text-v3-ink3')}>{row.games ? fmtOne(row.seasonPts) : '—'}</Fig>
  if (col === 'ppg') return <Fig className={cx(t, 'text-v3-ink2', big && 'font-bold')}>{fmtOne(row.ppg)}</Fig>
  return null
}

function SortHead({ col, sort, onSort }) {
  const on = sort.key === col.sort
  const aria = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th scope="col" aria-sort={aria} className={cx('px-2 text-right align-bottom', col.w)}>
      <button
        type="button"
        onClick={() => onSort(col.sort)}
        className={cx(
          'inline-flex min-h-[40px] items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call',
          on ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink',
        )}
      >
        {col.label}
        <span aria-hidden="true" className={cx('inline-block w-2.5 text-[12px]', on ? '' : 'invisible')}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}

function DeepDivider({ asRow, span = 9 }) {
  const text = (
    <>
      <span className="font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink">Real ADP ends here</span>
      <span className="text-[13px] text-v3-ink2"> — nobody below this line has been taken in a real draft; the board orders them by Sleeper&apos;s own depth order, and each carries a Deep tag.</span>
    </>
  )
  if (asRow) {
    return (
      <tr>
        <td colSpan={span} className="!border-y-2 !border-v3-ink bg-v3-well px-4 py-2.5">{text}</td>
      </tr>
    )
  }
  return <li className="border-y-2 border-v3-ink bg-v3-well px-4 py-2.5">{text}</li>
}

function RowTags({ row, moved = false, live }) {
  return (
    <>
      <PosTag pos={row.pos} />
      <span className="font-figure text-[13px] text-v3-ink2">{row.team || 'FA'}</span>
      {/* The phone has no "Moved" column, and how far he has moved is the
          one thing this mode is for — so it rides in the tag row, where the
          player's own facts already are, rather than as a third line in a
          64px card. It is the same signed, coloured figure the table's own
          column draws. */}
      {moved && row.rosDelta !== null && row.rosDelta !== 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 font-figure text-[13px]">
          <Delta value={row.rosDelta} className="text-[13px]" />
          <span className="text-v3-ink3">pl</span>
        </span>
      )}
      {/* From your connected league only, and display-only: it feeds none
          of the three columns beside it, which stay nightly-sourced. */}
      <LiveTag points={live} />
      {row.tenure === 'rookie' && <RookieTag />}
      {row.deep && <DeepTag />}
    </>
  )
}

/* style.css is on this page too, and it styles bare `table`, `th` and `td`
   (a dark --sunken header, a dark hairline under every cell, a border and a
   radius on the table). Every one is overridden on the table itself rather
   than trusted to lose — CLAUDE.md, "a bare element selector in style.css
   reaches into React". */
function Table({ rows, cols, sort, onSort, deepAt, liveById }) {
  return (
    <div className="relative hidden overflow-x-auto md:block">
      <table className="w-full min-w-[900px] table-fixed border-collapse bg-v3-sheet border-0 [&_th]:border-0 [&_th]:bg-v3-sheet [&_td]:border-0">
        <caption className="sr-only">Players on tonight&apos;s board. Column headers sort the table.</caption>
        <thead>
          <tr className="border-b border-v3-rule">
            <th scope="col" className="w-[52px] px-3 text-left align-bottom"><span className="inline-flex min-h-[40px] items-center"><Label className="text-[12px]">#</Label></span></th>
            <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-2 text-left align-bottom">
              <button
                type="button"
                onClick={() => onSort('name')}
                className={cx('inline-flex min-h-[40px] items-center gap-1 rounded-[4px] px-1.5 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', sort.key === 'name' ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}
              >
                Player
                <span aria-hidden="true" className={cx('inline-block w-2.5 text-[12px]', sort.key === 'name' ? '' : 'invisible')}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
              </button>
            </th>
            {cols.map((c) => <SortHead key={c.key} col={c} sort={sort} onSort={onSort} />)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const href = `#/players/${encodeURIComponent(r.id)}`
            return (
              <Fragment key={r.id}>
              {deepAt === i ? <DeepDivider asRow span={cols.length + 2} /> : null}
              <motion.tr
                {...LAYOUT_ROW}
                data-player-row={r.id}
                onClick={(e) => { if (!e.target.closest('a,button')) window.location.hash = href.slice(1) }}
                className="cursor-pointer border-b border-v3-rule bg-v3-sheet [&>td]:bg-inherit transition-colors duration-100 last:border-b-0 hover:bg-v3-paper"
              >
                <td className="px-3 py-2 align-middle"><Fig className="text-[13px] text-v3-ink3">{i + 1}</Fig></td>
                <td className="min-w-0 px-2 py-2 align-middle">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayerFace photo={r.photo} initials={r.initials} pos={r.pos} size={32} />
                    <div className="min-w-0">
                      <a href={href} className="block break-words [overflow-wrap:anywhere] text-[15px] font-semibold text-v3-ink hover:underline focus-visible:rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">{r.name}</a>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden"><RowTags row={r} live={liveById ? liveById.get(r.id) : undefined} /></div>
                    </div>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2 pr-4 text-right align-middle"><Cell col={c.key} row={r} /></td>
                ))}
              </motion.tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* The phone's own list: not the table squeezed, a row per player with the
   one figure the list is sorted by standing at its right edge.

   Both lists re-order with their rows sliding to their new places
   (motion.jsx LAYOUT_ROW) when the sort or a filter changes — the index
   tells you who moved, not just who is where. Position only, keyed on the
   player, near-critically damped: a ranked table that bounces reads as
   sloppy. */
function PhoneList({ rows, cols, sort, mode, deepAt, liveById }) {
  // The figure at the right edge is whatever the list is sorted by, when
  // that is one of this mode's own metrics. Sorted by name or by status
  // there is no such figure, so the mode's headline number stands there
  // instead — never a column the mode is not showing.
  const keys = cols.map((c) => c.sort)
  const shown = keys.includes(sort.key) && sort.key !== 'inj' ? sort.key : MODE_HEAD[mode]
  const label = SORTS[shown].label
  const col = (cols.find((c) => c.sort === shown) || cols[0]).key
  return (
    <ul className="md:hidden" aria-label="Players">
      {rows.map((r, i) => {
        const href = `#/players/${encodeURIComponent(r.id)}`
        return (
          <Fragment key={r.id}>
          {deepAt === i ? <DeepDivider /> : null}
          <motion.li {...LAYOUT_ROW} className="border-b border-v3-rule bg-v3-sheet last:border-b-0">
            <a href={href} data-player-row={r.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call">
              <PlayerFace photo={r.photo} initials={r.initials} pos={r.pos} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block break-words [overflow-wrap:anywhere] text-[15px] font-semibold text-v3-ink">{r.name}</span>
                <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 overflow-hidden">
                  <RowTags row={r} moved={mode === 'ros' && shown !== 'delta'} live={liveById ? liveById.get(r.id) : undefined} />
                  {r.inj && <InjuryTag code={r.inj} />}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block leading-none"><Cell col={col} row={r} big /></span>
                <span className="mt-1 block font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{label}</span>
              </span>
            </a>
          </motion.li>
          </Fragment>
        )
      })}
    </ul>
  )
}

export default function V3Players() {
  const key = useBoardKey()
  const engine = typeof window !== 'undefined' ? window.JukeEngine : null
  const saved = useRef(loadPrefs()).current || {}

  const [format, setFormat] = useState(saved.format || null)
  const [q, setQ] = useState(saved.q || '')
  const [pos, setPos] = useState(saved.pos || 'ALL')
  const [team, setTeam] = useState(saved.team || 'ALL')
  const [tenure, setTenure] = useState(saved.tenure === 'vet' ? 'vet' : 'all')
  const [sort, setSort] = useState(saved.sort || { key: 'adp', dir: 'asc' })
  const [limit, setLimit] = useState(saved.limit || PAGE)
  const [more, setMore] = useState(false)
  /* Closed on a phone, and `sm:block` on the paragraph itself is what
     opens it at a desk — so the state is false on both sides of hydration
     and the width is decided by CSS rather than by a render-time read of
     the viewport, which is what React #418 costs this app when it is not. */
  const [note, setNote] = useState(false)
  const [wanted, setWanted] = useState(saved.mode || null)

  const live = key ? liveFormat(engine) : 'half'
  const fmt = format || live
  const data = useMemo(() => (key && engine ? readIndex(engine, fmt) : null), [key, fmt, engine])
  const situation = useMemo(() => (key && engine ? readSituation(engine) : null), [key, engine])

  /* A connected league's own rostered players, already scored today — a
     week-scoped fact laid over rows already computed here, never fed back
     into readIndex()'s pts/vorp/juke or into any of the three columns
     above: those stay nightly-sourced, exactly as the mode note under the
     controls promises. Both hooks are safe to call unconditionally — they
     read window.JukeAuth/the league store rather than a Clerk hook, so
     this page needs no <SignedIn> wrapper to ask. */
  const { status: leagueStatus, league: connectedLeague } = useLeagueFresh()
  const leagueOpen = leagueStatus === 'connected' && !!connectedLeague
  const snap = useSnapshotFresh(leagueOpen ? connectedLeague.leagueId : null, leagueOpen ? connectedLeague.provider : null)
  const liveById = useMemo(() => {
    const actuals = snap.snapshot && snap.snapshot.actuals
    const players = actuals && actuals.players
    if (!players || typeof players !== 'object') return null
    const out = new Map()
    for (const id of Object.keys(players)) {
      const v = players[id]
      if (v && typeof v.points === 'number' && Number.isFinite(v.points)) out.set(id, v.points)
    }
    return out.size ? out : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.snapshot])

  // Which orders exist is the season clock's answer, not a remembered one:
  // a mode saved in September must not survive into February, when there is
  // no rest of a season to rank. Keyed on the board so it re-asks when the
  // nightly that starts the season lands under a page left open.
  const modes = useMemo(() => (key && engine ? seasonModes(engine) : { modes: ['pre'], initial: 'pre', clock: null }), [key, engine])
  const mode = modes.modes.includes(wanted) ? wanted : modes.initial
  const cols = MODE_COLS[mode]

  const filtered = useMemo(() => (data ? filterRows(data.rows, { q, pos, team, tenure }) : []), [data, q, pos, team, tenure])
  const sorted = useMemo(() => sortRows(filtered, sort.key, sort.dir), [filtered, sort])

  // Anything that changes WHICH rows are listed starts again at a page.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setLimit(PAGE)
  }, [q, pos, team, tenure, sort.key, sort.dir, fmt])

  /* A saved sort names a column and the MODE decides which columns exist,
     so a sort this mode does not draw would order the list by something
     invisible — the same sort arrow pointing at nothing. It falls back to
     the mode's own order instead, on a mode press and on a cold load with
     a stale preference alike. */
  const orders = useMemo(() => new Set([...cols.map((c) => c.sort), 'name']), [cols])
  useEffect(() => {
    if (!orders.has(sort.key)) setSort(MODE_SORT[mode])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, mode])

  useEffect(() => { savePrefs({ format, q, pos, team, tenure, sort, limit, mode: wanted }) }, [format, q, pos, team, tenure, sort, limit, wanted])

  const onSort = (k) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: SORTS[k].dir }))
  }
  const clear = () => { setQ(''); setPos('ALL'); setTeam('ALL'); setTenure('all') }
  const filteredAny = q || pos !== 'ALL' || team !== 'ALL' || tenure !== 'all'
  const extraSet = (team !== 'ALL' ? 1 : 0) + (tenure !== 'all' ? 1 : 0)

  const page = sorted.slice(0, limit)
  // The deep-bench line only means something in the board's own order: in
  // any other sort deep and real players interleave, and the per-row tag
  // carries the fact instead (production's own rule for its divider).
  const inBoardOrder = sort.key === 'adp' && sort.dir === 'asc'
  const deepAt = inBoardOrder ? page.findIndex((r) => r.deep) : -1
  const deepLine = deepAt > 0 ? deepAt : -1

  const liveName = key ? scoringName(engine, engine.league().scoring) : ''
  const fmtName = key ? scoringName(engine, fmt) : ''
  const season = data ? data.season : null
  // Week 1 has no complete week behind it, so "who moved" is measured from
  // the preseason board; from week 2 on it is the last complete week.
  // "Before" is the same table with this season's latest games held back,
  // through week `sinceWeek` — so the honest phrase is "since the END of"
  // that week, not "since" it, which reads as the week it names still being
  // to come.
  const since = season ? (season.sinceWeek > 0 ? `the end of week ${season.sinceWeek}` : 'the preseason board') : ''
  /* How much of a rest-of-season rate is this season, stated at the number
     of weeks that have actually been PLAYED rather than at any average over
     the pool: a deep-bench player with no games would drag a median down
     and describe a list nobody is reading. A man who played all four is at
     four, and that is the figure the top of every order is on. */
  const kRB = season && season.k ? season.k.RB : null
  const done = season ? season.weeksComplete : 0
  const weightLine = season && kRB !== null && done > 0
    ? `${done} week${done === 1 ? '' : 's'} played: a back or a receiver who played every one is ${Math.round((done / (done + kRB)) * 100)}% this season`
    : 'No week has finished yet, so the rate is still all preseason projection'

  return (
    <div className="grid gap-section">
      <PageHead
        label={situation ? `Players · ${situation.players} on tonight's board${situation.refreshed ? ` · refreshed ${situation.refreshed}` : ''}` : null}
        title="Every player on the board, priced."
        lede={season
          ? `Week ${season.week} of the ${season.season} season. Rank them by the weeks that are left, by what they have actually scored, or by the preseason board they were drafted off — three orders, never blended into one number.`
          : "Projected points, the gap over the player a league your size would start instead, and Juke's score — for everybody, under the scoring you pick. Sort any column; open anyone for the whole page."}
      />

      <Sheet
        code={season ? `${MODE_LABEL[mode]} · ${fmtName}` : `The board · ${fmtName || '…'}`}
        aside={data ? `${sorted.length} of ${data.size}` : ''}
        bodyClass="p-0"
      >
        <div className="grid gap-4 border-b border-v3-rule p-4 sm:p-5">
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label htmlFor="v3-player-search" className="grid gap-1">
              <Label>Search</Label>
              <span className="relative block">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-v3-ink3" />
                <input
                  id="v3-player-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="A player's name"
                  autoComplete="off"
                  className="min-h-[44px] w-full rounded-[6px] border border-v3-rule bg-v3-sheet pl-10 pr-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call"
                />
              </span>
            </label>
            <div className="grid justify-items-start gap-1">
              <Label>Scoring</Label>
              <Seg label="Scoring" value={fmt} onChange={setFormat} options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))} />
            </div>
          </div>

          {/* The filter groups flow onto one row where the row can seat them:
              three stacked full-width rows used under 30% of their width
              each, and the page exists for the table underneath them. */}
          <div className="grid gap-4 md:flex md:flex-wrap md:items-end md:gap-x-8 md:gap-y-4">
          {/* The three orders, in season only. Out of season there is no
              rest of a season to rank and no games to have played, so the
              control is absent rather than a segment that cannot act. */}
          {modes.modes.length > 1 && (
            <div className="grid justify-items-start gap-1">
              <Label>Ranked by</Label>
              <Seg
                label="Ranked by"
                value={mode}
                onChange={setWanted}
                options={modes.modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
            </div>
          )}

          <div className="grid justify-items-start gap-1">
            <Label>Position</Label>
            <Chips label="Position" value={pos} onChange={setPos} options={['ALL', ...POSITIONS].map((p) => ({ value: p, label: p === 'DST' ? 'D/ST' : p === 'ALL' ? 'All' : p }))} />
          </div>

          {/* Sort, team and tenure. Always out at a desk; folded behind one
              button on a phone, where six controls stacked above the list
              would put the first player a screen and a half down. The button
              counts what is set inside, so folded is still informative.
              Measured 19 September 2026: this block was 767px on a 390px
              screen and the four things a reader came for were under all of
              it. */}
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            aria-controls="v3-player-more"
            className="inline-flex min-h-[44px] items-center justify-between rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[15px] font-semibold text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call md:hidden"
          >
            <span>Sort, team and tenure{extraSet ? <span className="ml-2 font-figure text-[13px] text-v3-ink2">· {extraSet} set</span> : null}</span>
            <Icon name="arrow" className={cx('h-4 w-4 transition-transform duration-150 motion-reduce:transition-none', more ? '-rotate-90' : 'rotate-90')} />
          </button>
          <div id="v3-player-more" className={cx('grid-cols-1 items-end gap-3 md:grid md:grid-cols-[220px_auto]', more ? 'grid' : 'hidden')}>
            <SelectField id="v3-player-team" label="NFL team" value={team} onChange={setTeam}>
              <option value="ALL">All teams</option>
              {(data ? data.teams : []).map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
            <div className="grid justify-items-start gap-1">
              <Label>Tenure</Label>
              <TenureControl current={tenure} onChange={setTenure} />
            </div>
            {/* Sorting joins the fold on a phone. A column head IS the sort
                control at a desk, so this pair has always been md:hidden —
                it was simply stacked above the table instead of inside the
                one place a phone already keeps the controls it is not using
                right now. A display:none grid child takes no track, so the
                desktop panel above is unchanged. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:hidden">
              {/* Only this mode's own orders: offering "ROS pts" on a
                  preseason list is a control that sorts by a column nobody
                  can see, which is the sort arrow pointing at nothing in a
                  different shape. */}
              <SelectField id="v3-player-sort" label="Sort by" value={sort.key} onChange={(k) => setSort({ key: k, dir: SORTS[k].dir })}>
                {['name', ...cols.map((c) => c.sort)].map((k) => <option key={k} value={k}>{SORTS[k].label}</option>)}
              </SelectField>
              <QuietButton
                onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
                aria-label={`Sort direction: ${sort.dir === 'asc' ? 'ascending' : 'descending'}. Reverse it.`}
                className="px-4"
              >
                {sort.dir === 'asc' ? 'Low → high' : 'High → low'}
              </QuietButton>
            </div>
          </div>
          </div>

          {/* What the numbers on screen ARE, in the mode they are drawn in.
              A figure that changed meaning when a control moved and kept
              its caption would be this project's own right-value-wrong-
              column bug, with a horizon instead of a table.

              Folded on a phone, open at a desk. Measured at 390px it is
              215px — the single largest thing in this block, larger than
              any group of controls in it, sitting between the reader and
              the table it is about.

              This is a disclosure where PageHead's lede is simply dropped,
              and the line between them is worth stating because it looks
              inconsistent. A lede DESCRIBES a page whose content restates
              it, so nothing is lost by dropping it. This DEFINES the
              columns and is restated nowhere, so it cannot be dropped —
              and a definition a reader needs once, then never again, is
              exactly what a disclosure is for. It stays attached to the
              table either way, which is the requirement above.

              <details> rather than a button and state: it is one element,
              it is open by default at a desk through the `open` attribute,
              and a phone reader can find it by search-in-page, which a
              conditionally-unmounted panel defeats. */}
          {key && (
            <div>
              <button
                type="button"
                onClick={() => setNote((n) => !n)}
                aria-expanded={note}
                aria-controls="v3-player-note"
                className="-mx-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[13px] font-semibold text-v3-ink2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call sm:hidden"
              >
                What these numbers are
                <Icon name="arrow" className={cx('h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none', note ? '-rotate-90' : 'rotate-90')} />
              </button>
              <p id="v3-player-note" className={cx('max-w-[85ch] text-[13px] leading-[1.5] text-v3-ink3 sm:block', note ? 'block' : 'hidden')}>
              {mode === 'ros' && (
                <>
                  Rest of season is a rate for the weeks he has left — what he was projected to average, pulled toward what he has actually
                  averaged, times the games between now and week {season.lastWeek} with his bye and any known absence taken out.{' '}
                  {weightLine}. <strong className="font-semibold text-v3-ink2">Moved</strong> is places since {since}.
                  Scored under {fmtName}; ADP is the {liveName} market the board was built on.{' '}
                </>
              )}
              {mode === 'season' && (
                <>
                  What he has actually scored this season under {fmtName}, and his points per game <em>played</em> — a week he missed is not
                  a nought, so a man with no games has no season rather than a zero. Pure fact: nothing here is a forecast.{' '}
                </>
              )}
              {mode === 'pre' && (
                <>
                  Projected points, points over replacement and position rank are under {fmtName}. ADP is the {liveName} market the board is built on
                  {fmt !== live ? <>, and the Juke score stays on {liveName}, the scoring your mock is set to — the engine only prices it under that table</> : null}.{' '}
                  {season ? 'These are the preseason numbers, untouched by anything that has happened since. ' : ''}
                </>
              )}
              Kickers and defenses keep their points and are never rated.
              </p>
            </div>
          )}
        </div>

        {!data ? (
          <div className="p-5"><Skeleton lines={10} /></div>
        ) : sorted.length === 0 ? (
          <div className="grid justify-items-start gap-3 p-6">
            <Headline as="h2" size="block">Nobody on the board matches that.</Headline>
            <p className="max-w-[56ch] text-[15px] text-v3-ink2">
              {q ? <>No player named like &ldquo;{q}&rdquo;</> : 'No player'} under these filters. Loosen one, or start again.
            </p>
            {filteredAny && <QuietButton onClick={clear}>Clear the filters</QuietButton>}
          </div>
        ) : (
          <>
            <Table rows={page} cols={cols} sort={sort} onSort={onSort} deepAt={deepLine} liveById={liveById} />
            <PhoneList rows={page} cols={cols} sort={sort} mode={mode} deepAt={deepLine} liveById={liveById} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v3-rule px-4 py-4 sm:px-5">
              <p className="font-figure text-[13px] text-v3-ink2">
                Showing <Fig className="font-bold text-v3-ink">{page.length}</Fig> of <Fig className="font-bold text-v3-ink">{sorted.length}</Fig>
              </p>
              {page.length < sorted.length && (
                <QuietButton onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, sorted.length - page.length)} more
                </QuietButton>
              )}
            </div>
          </>
        )}
      </Sheet>
    </div>
  )
}
