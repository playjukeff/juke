import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { readSituation } from '../data.js'
import { Delta, Fig, Headline, Icon, Label, PageHead, PosTag, QuietButton, Seg, Sheet, Skeleton, cx } from '../ui.jsx'
import {
  FORMATS, FORMAT_LABEL, POSITIONS, SORTS, filterRows, liveFormat, posWord, readIndex, scoringName, sortRows,
} from './playerData.js'
import { Chips, DeepTag, InjuryTag, PlayerFace, RookieTag, SelectField, ViewTabs } from './parts.jsx'
import { useBoardKey } from './useBoardKey.js'
import { LAYOUT_ROW, motion } from '../motion.jsx'

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

   ---- 480 rows, and not 480 at once ----

   Fifty at a time, with "Show more". A filter or a new sort starts again
   at fifty. The filters survive a trip to a player page and back, through
   sessionStorage, because losing a sorted, filtered list to one click is
   the index failing at the one thing it is for. */

const PAGE = 50
const STORE = 'juke.v3.players'

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

const TENURE = [
  { value: 'all', label: 'All' },
  { value: 'rookie', label: 'Rookies' },
  { value: 'vet', label: 'Vets' },
]

/* The table's columns, in reading order. `sort` is a key into SORTS. */
const COLS = [
  { key: 'adp', label: 'ADP', sort: 'adp', w: 'w-[76px]' },
  { key: 'posRk', label: 'Pos rk', sort: 'posRk', w: 'w-[92px]' },
  { key: 'pts', label: 'Proj pts', sort: 'pts', w: 'w-[106px]' },
  { key: 'vorp', label: 'Over repl.', sort: 'vorp', w: 'w-[124px]' },
  { key: 'juke', label: 'Juke', sort: 'juke', w: 'w-[78px]' },
  { key: 'bye', label: 'Bye', sort: 'bye', w: 'w-[66px]' },
  { key: 'inj', label: 'Status', sort: 'inj', w: 'w-[96px]' },
]

function fmtAdp(v) { return v === null ? '—' : v.toFixed(1) }
function fmtPts(v) { return v === null ? '—' : Math.round(v) }
function fmtRk(r) { return r.posRk === null ? '—' : `${posWord(r.pos)}${r.posRk}` }

function Cell({ col, row }) {
  if (col === 'adp') return <Fig className={cx('text-[15px]', row.deep ? 'text-v3-ink3' : 'text-v3-ink')}>{fmtAdp(row.adp)}</Fig>
  if (col === 'posRk') return <Fig className="text-[15px] text-v3-ink">{fmtRk(row)}</Fig>
  if (col === 'pts') return <Fig className="text-[15px] font-bold text-v3-ink">{fmtPts(row.pts)}</Fig>
  if (col === 'vorp') return <Delta value={row.vorp} className="text-[15px]" />
  if (col === 'juke') return <Fig className={cx('text-[15px] font-bold', row.juke === null ? 'text-v3-ink3' : 'text-v3-ink')}>{row.juke === null ? '—' : row.juke}</Fig>
  if (col === 'bye') return <Fig className="text-[15px] text-v3-ink2">{row.bye || '—'}</Fig>
  if (col === 'inj') return row.inj ? <InjuryTag code={row.inj} /> : <span className="sr-only">No designation</span>
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
        <span aria-hidden="true" className={cx('inline-block w-2.5 text-[11px]', on ? '' : 'invisible')}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}

function DeepDivider({ asRow }) {
  const text = (
    <>
      <span className="font-figure text-[12px] font-bold uppercase tracking-[0.12em] text-v3-ink">Real ADP ends here</span>
      <span className="text-[13px] text-v3-ink2"> — nobody below this line has been taken in a real draft; the board orders them by Sleeper&apos;s own depth order, and each carries a Deep tag.</span>
    </>
  )
  if (asRow) {
    return (
      <tr>
        <td colSpan={COLS.length + 2} className="!border-y-2 !border-v3-ink bg-v3-well px-4 py-2.5">{text}</td>
      </tr>
    )
  }
  return <li className="border-y-2 border-v3-ink bg-v3-well px-4 py-2.5">{text}</li>
}

function RowTags({ row }) {
  return (
    <>
      <PosTag pos={row.pos} />
      <span className="font-figure text-[13px] text-v3-ink2">{row.team || 'FA'}</span>
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
function Table({ rows, sort, onSort, deepAt }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[900px] table-fixed border-collapse bg-v3-sheet border-0 [&_th]:border-0 [&_th]:bg-v3-sheet [&_td]:border-0">
        <caption className="sr-only">Players on tonight&apos;s board. Column headers sort the table.</caption>
        <thead>
          <tr className="border-b border-v3-rule">
            <th scope="col" className="w-[52px] px-3 text-left align-bottom"><span className="inline-flex min-h-[40px] items-center"><Label className="text-[11px]">#</Label></span></th>
            <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-2 text-left align-bottom">
              <button
                type="button"
                onClick={() => onSort('name')}
                className={cx('inline-flex min-h-[40px] items-center gap-1 rounded-[4px] px-1.5 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call', sort.key === 'name' ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}
              >
                Player
                <span aria-hidden="true" className={cx('inline-block w-2.5 text-[11px]', sort.key === 'name' ? '' : 'invisible')}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
              </button>
            </th>
            {COLS.map((c) => <SortHead key={c.key} col={c} sort={sort} onSort={onSort} />)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const href = `#/v3/players/${encodeURIComponent(r.id)}`
            return (
              <Fragment key={r.id}>
              {deepAt === i ? <DeepDivider asRow /> : null}
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
                      <a href={href} className="block truncate text-[15px] font-semibold text-v3-ink hover:underline focus-visible:rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call">{r.name}</a>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden"><RowTags row={r} /></div>
                    </div>
                  </div>
                </td>
                {COLS.map((c) => (
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
function PhoneList({ rows, sort, deepAt }) {
  const shown = sort.key === 'name' || sort.key === 'inj' ? 'pts' : sort.key
  const label = SORTS[shown].label
  return (
    <ul className="md:hidden" aria-label="Players">
      {rows.map((r, i) => {
        const href = `#/v3/players/${encodeURIComponent(r.id)}`
        let value
        if (shown === 'adp') value = <Fig className="text-[18px] font-bold text-v3-ink">{fmtAdp(r.adp)}</Fig>
        else if (shown === 'posRk') value = <Fig className="text-[18px] font-bold text-v3-ink">{fmtRk(r)}</Fig>
        else if (shown === 'vorp') value = <Delta value={r.vorp} className="text-[18px]" />
        else if (shown === 'juke') value = <Fig className="text-[18px] font-bold text-v3-ink">{r.juke === null ? '—' : r.juke}</Fig>
        else if (shown === 'bye') value = <Fig className="text-[18px] font-bold text-v3-ink">{r.bye || '—'}</Fig>
        else value = <Fig className="text-[18px] font-bold text-v3-ink">{fmtPts(r.pts)}</Fig>
        return (
          <Fragment key={r.id}>
          {deepAt === i ? <DeepDivider /> : null}
          <motion.li {...LAYOUT_ROW} className="border-b border-v3-rule bg-v3-sheet last:border-b-0">
            <a href={href} data-player-row={r.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 hover:bg-v3-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-v3-call">
              <PlayerFace photo={r.photo} initials={r.initials} pos={r.pos} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-v3-ink">{r.name}</span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <RowTags row={r} />
                  {r.inj && <InjuryTag code={r.inj} />}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block leading-none">{value}</span>
                <span className="mt-1 block font-figure text-[11px] font-semibold uppercase tracking-[0.1em] text-v3-ink3">{label}</span>
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
  const [tenure, setTenure] = useState(saved.tenure || 'all')
  const [sort, setSort] = useState(saved.sort || { key: 'adp', dir: 'asc' })
  const [limit, setLimit] = useState(saved.limit || PAGE)
  const [more, setMore] = useState(false)

  const live = key ? liveFormat(engine) : 'half'
  const fmt = format || live
  const data = useMemo(() => (key && engine ? readIndex(engine, fmt) : null), [key, fmt, engine])
  const situation = useMemo(() => (key && engine ? readSituation(engine) : null), [key, engine])

  const filtered = useMemo(() => (data ? filterRows(data.rows, { q, pos, team, tenure }) : []), [data, q, pos, team, tenure])
  const sorted = useMemo(() => sortRows(filtered, sort.key, sort.dir), [filtered, sort])

  // Anything that changes WHICH rows are listed starts again at a page.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setLimit(PAGE)
  }, [q, pos, team, tenure, sort.key, sort.dir, fmt])

  useEffect(() => { savePrefs({ format, q, pos, team, tenure, sort, limit }) }, [format, q, pos, team, tenure, sort, limit])

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

  return (
    <div className="grid gap-8">
      <PageHead
        label={situation ? `Players · ${situation.players} on tonight's board${situation.refreshed ? ` · refreshed ${situation.refreshed}` : ''}` : 'Players'}
        title="Every player on the board, priced."
        lede="Projected points, the gap over the player a league your size would start instead, and Juke's score — for everybody, under the scoring you pick. Sort any column; open anyone for the whole page."
        action={<ViewTabs current="all" />}
      />

      <Sheet code={`The board · ${fmtName || '…'}`} aside={data ? `${sorted.length} of ${data.size}` : ''} bodyClass="p-0">
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

          <div className="grid justify-items-start gap-1">
            <Label>Position</Label>
            <Chips label="Position" value={pos} onChange={setPos} options={['ALL', ...POSITIONS].map((p) => ({ value: p, label: p === 'DST' ? 'D/ST' : p === 'ALL' ? 'All' : p }))} />
          </div>

          {/* Team and tenure. Always out at a desk; folded behind one button
              on a phone, where six controls stacked above the list would put
              the first player a screen and a half down. The button counts
              what is set inside, so folded is still informative. */}
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            aria-controls="v3-player-more"
            className="inline-flex min-h-[44px] items-center justify-between rounded-[6px] border border-v3-rule bg-v3-sheet px-3 text-[15px] font-semibold text-v3-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v3-call md:hidden"
          >
            <span>Team and tenure{extraSet ? <span className="ml-2 font-figure text-[13px] text-v3-ink2">· {extraSet} set</span> : null}</span>
            <Icon name="arrow" className={cx('h-4 w-4 transition-transform duration-150 motion-reduce:transition-none', more ? '-rotate-90' : 'rotate-90')} />
          </button>
          <div id="v3-player-more" className={cx('grid-cols-1 items-end gap-3 md:grid md:grid-cols-[220px_auto]', more ? 'grid' : 'hidden')}>
            <SelectField id="v3-player-team" label="NFL team" value={team} onChange={setTeam}>
              <option value="ALL">All teams</option>
              {(data ? data.teams : []).map((t) => <option key={t} value={t}>{t}</option>)}
            </SelectField>
            <div className="grid justify-items-start gap-1">
              <Label>Tenure</Label>
              <Seg label="Tenure" value={tenure} onChange={setTenure} options={TENURE} />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:hidden">
            <SelectField id="v3-player-sort" label="Sort by" value={sort.key} onChange={(k) => setSort({ key: k, dir: SORTS[k].dir })}>
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </SelectField>
            <QuietButton
              onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
              aria-label={`Sort direction: ${sort.dir === 'asc' ? 'ascending' : 'descending'}. Reverse it.`}
              className="px-4"
            >
              {sort.dir === 'asc' ? 'Low → high' : 'High → low'}
            </QuietButton>
          </div>

          {key && (
            <p className="text-[13px] leading-[1.5] text-v3-ink3">
              Projected points, points over replacement and position rank are under {fmtName}. ADP is the {liveName} market the board is built on
              {fmt !== live ? <>, and the Juke score stays on {liveName}, the scoring your mock is set to — the engine only prices it under that table</> : null}.
              Kickers and defenses keep their points and are never rated.
            </p>
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
            <Table rows={page} sort={sort} onSort={onSort} deepAt={deepLine} />
            <PhoneList rows={page} sort={sort} deepAt={deepLine} />
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
