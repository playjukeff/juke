import { useEffect, useMemo, useState } from 'react'
import { STAT_COLUMNS, STAT_GROUPS, MOBILE_SORTS, lastsTone, statValue } from '../../../playerColumns.js'
import { POS_FILTERS, SORT_DEFAULT_DIR, filterAndSort, readersFor, teamsOnBoard, tierAverages, withDividers } from '../../../v2/cockpit/cockpitData.js'
import { Delta, Label, PosTag, cx } from '../../ui.jsx'
import { DeepTag, DraftButton, FOCUS, Glyph, Headshot, InjuryTag, StarButton, Switch } from '../kit.jsx'

/* The player pool: every player still on the board, filtered, sorted and
   draftable. The columns are playerColumns.js's — the one union list the
   production table, the phone list and the player sheet all read — and every
   cell goes through its statValue(), so a number here cannot disagree with
   the same player's row anywhere else. Filtering and sorting are
   cockpitData.js's, against the same readers the cells draw from.

   Paged at 80 rows rather than drawing 480 into a table on every pick; any
   filter or sort resets to the top, where the answer to the new question is,
   and the button says how many the press adds. */

const PAGE = 80
const COL = Object.fromEntries(STAT_COLUMNS.map((c) => [c.key, c]))
const FLEX_POS = ['RB', 'WR', 'TE']

function groupsFor(pos) {
  return STAT_GROUPS.filter((g) => {
    if (!g.positions || pos === 'ALL') return true
    if (pos === 'FLEX') return g.positions.some((p) => FLEX_POS.includes(p))
    return g.positions.includes(pos)
  })
}

export function usePoolFilters() {
  const [f, setF] = useState({ search: '', pos: 'ALL', team: 'ALL', tenure: 'all', season: 'projected', showDrafted: false, sortBy: 'board', sortDir: 'asc' })
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }))
  const sort = (key) => setF((cur) => {
    if (key === cur.sortBy) return { ...cur, sortDir: cur.sortDir === 'asc' ? 'desc' : 'asc' }
    return { ...cur, sortBy: key, sortDir: key === 'board' ? 'asc' : (SORT_DEFAULT_DIR[key] || 'desc') }
  })
  return [f, set, sort]
}

/* One cell, drawn the way v3 draws a figure: VORP as a signed <Delta>,
   LASTS in caution when a player is likely gone, everything else ink. */
function Cell({ col, raw }) {
  if (raw === null || raw === undefined) return <span className="text-v3-ink3">—</span>
  if (col.key === 'vorp') return <Delta value={raw} />
  if (col.key === 'lasts') {
    const t = lastsTone(raw)
    return <span className={cx('font-figure tabular-nums', t === 'rose' ? 'font-bold text-v3-warn' : 'text-v3-ink2')}>{raw}%</span>
  }
  return <span className={cx('font-figure tabular-nums', col.key === 'pts' || col.key === 'juke' ? 'font-bold text-v3-ink' : 'text-v3-ink2')}>{raw}</span>
}

function FilterBar({ board, f, set, counts, total, priorYear, phone }) {
  const teams = useMemo(() => teamsOnBoard(board), [board.length])
  // 16px on a phone: iOS zooms any field smaller than that on focus.
  const sel = cx('h-10 rounded-[4px] border border-v3-rule bg-v3-sheet px-2.5 text-[16px] text-v3-ink sm:text-[14px]', FOCUS)
  const narrowed = f.team !== 'ALL' || f.tenure !== 'all' || f.season !== 'projected' || f.showDrafted
  const extras = (
    <>
      <label className={phone ? 'block' : ''}><span className="sr-only">NFL team</span>
        <select value={f.team} onChange={(e) => set({ team: e.target.value })} className={cx(sel, phone && 'w-full')}>
          <option value="ALL">All NFL teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className={phone ? 'block' : ''}><span className="sr-only">Tenure</span>
        <select value={f.tenure} onChange={(e) => set({ tenure: e.target.value })} className={cx(sel, phone && 'w-full')}>
          <option value="all">All tenure</option>
          <option value="rookie">Rookies</option>
          <option value="veteran">Veterans</option>
        </select>
      </label>
      {priorYear && (
        <label className={phone ? 'block' : ''}><span className="sr-only">Season shown</span>
          <select value={f.season} onChange={(e) => set({ season: e.target.value })} className={cx(sel, phone && 'w-full')}>
            <option value="projected">2026 projection</option>
            <option value="prior">{priorYear} actual</option>
          </select>
        </label>
      )}
      <Switch checked={f.showDrafted} onChange={(v) => set({ showDrafted: v })} label="Show drafted" />
    </>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-[180px]">
          <span className="sr-only">Search players</span>
          <Glyph name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v3-ink3" />
          <input type="search" value={f.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search players" className={cx('h-10 w-full rounded-[4px] border border-v3-rule bg-v3-sheet pl-9 pr-3 text-[16px] text-v3-ink placeholder:text-v3-ink3 sm:text-[14px]', FOCUS)} />
        </label>
        {!phone && extras}
      </div>
      {phone && (
        <details className="group rounded-[4px] border border-v3-rule bg-v3-sheet [&_summary::-webkit-details-marker]:hidden">
          <summary className={cx('flex min-h-[44px] cursor-pointer list-none items-center justify-between px-3 font-figure text-[12px] font-semibold uppercase tracking-[0.1em] text-v3-ink', FOCUS)}>
            Filters{narrowed ? ' · on' : ''}
            <Glyph name="chevDown" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="grid grid-cols-1 gap-2 px-3 pb-3">{extras}</div>
        </details>
      )}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Position" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:thin]">
          {POS_FILTERS.map((pos) => {
            const on = f.pos === pos
            const c = counts ? counts[pos] : null
            return (
              <button
                key={pos}
                type="button"
                aria-pressed={on}
                onClick={() => set({ pos })}
                className={cx('flex min-h-[44px] min-w-[48px] shrink-0 flex-col items-center justify-center rounded-[4px] border px-2.5 font-figure text-[12px] font-semibold uppercase tracking-[0.05em] transition-colors', FOCUS, on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2 hover:text-v3-ink')}
              >
                <span>{pos === 'DST' ? 'D/ST' : pos}</span>
                {c && pos !== 'FLEX' && <span className={cx('text-[11px] tabular-nums', on ? 'text-v3-bandInk' : c.short ? 'font-bold text-v3-ink' : 'text-v3-ink3')}>{c.text}</span>}
              </button>
            )
          })}
        </div>
        <span className="hidden shrink-0 font-figure text-[12px] tabular-nums text-v3-ink2 sm:inline">{total} {f.showDrafted ? 'players' : 'available'}</span>
      </div>
      {phone && (
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Sort" className="flex flex-1 gap-1">
            {MOBILE_SORTS.map((s) => {
              const on = f.sortBy === s.key
              return (
                <button key={s.key} type="button" aria-pressed={on} onClick={() => set({ sortBy: s.key, sortDir: s.key === 'board' ? 'asc' : (SORT_DEFAULT_DIR[s.key] || 'desc') })} className={cx('min-h-[40px] flex-1 rounded-[4px] border font-figure text-[12px] font-semibold uppercase tracking-[0.05em]', FOCUS, on ? 'border-v3-band bg-v3-band text-white' : 'border-v3-rule bg-v3-sheet text-v3-ink2')}>
                  {s.label}
                </button>
              )
            })}
          </div>
          <span className="shrink-0 font-figure text-[12px] tabular-nums text-v3-ink2">{total} left</span>
        </div>
      )}
    </div>
  )
}

function Divider({ row }) {
  if (row.type === 'deep') {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-v3-rule bg-v3-well px-3 py-2">
        <Label className="text-v3-ink">Real ADP ends here</Label>
        <span className="text-[13px] text-v3-ink2">Below this line no real draft has taken these players — ranked by Sleeper’s own depth order, and marked Deep.</span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-v3-warn/30 bg-v3-warnWash px-3 py-2">
      <Label className="text-v3-warn">{row.pos} tier {row.tier} ends</Label>
      <span className="text-[13px] text-v3-ink2">
        {row.remaining} {row.pos}{row.remaining === 1 ? '' : 's'} left before the drop
        {row.drop == null ? ' — no more after this tier' : row.drop > 0 ? ` — the next tier projects ${row.drop} fewer points` : ' — the next tier projects about the same'}
      </span>
    </div>
  )
}

export default function Pool({ engine, version, f, set, sort, canDraft, draftReason, onDraft, onOpen, nextOverall, phone }) {
  const board = engine.board() || []
  const [shown, setShown] = useState(PAGE)
  const filterKey = JSON.stringify(f)
  useEffect(() => { setShown(PAGE) }, [filterKey])

  // `version` in every key: board is mutated in place, so it is useless as a
  // memo key on its own (CLAUDE.md, "A phone component that memoizes over
  // board never updates").
  const readers = useMemo(() => readersFor(engine, f.season, nextOverall), [engine, f.season, nextOverall, version])
  const players = useMemo(() => filterAndSort(engine, board, f, readers), [version, filterKey, readers])
  const tierAvg = useMemo(() => tierAverages(board, readers.pointsProjected), [version, board.length])
  const rows = useMemo(() => withDividers(engine, players, f, tierAvg), [players, tierAvg])
  const counts = engine.filterCounts()
  const queued = new Set(engine.queue() || [])
  const picks = engine.picks() || []
  const takenBy = (p) => {
    const pick = picks.find((x) => x.player === p || x.player.name === p.name)
    return pick ? (pick.slot === engine.mySlot() ? 'You' : engine.teamLabel(pick.slot)) : null
  }

  let playersSeen = 0
  const visible = []
  for (const r of rows) {
    if (r.type === 'player') {
      if (playersSeen >= shown) break
      playersSeen++
    }
    visible.push(r)
  }
  const remaining = players.length - playersSeen
  const groups = groupsFor(f.pos)
  const cols = groups.flatMap((g) => g.keys.map((k) => COL[k]))
  const seasonLabel = f.season === 'prior' && readers.priorYear ? `${readers.priorYear} actual` : 'Projected'

  const more = remaining > 0 && (
    <div className="flex items-center justify-between gap-3 border-t border-v3-rule px-3 py-3">
      <span className="font-figure text-[12px] tabular-nums text-v3-ink2">Showing {playersSeen} of {players.length}</span>
      <button type="button" onClick={() => setShown((n) => n + PAGE)} className={cx('min-h-[44px] rounded-[4px] border border-v3-rule bg-v3-sheet px-4 text-[14px] font-semibold text-v3-ink hover:border-v3-ink3', FOCUS)}>
        Show {Math.min(PAGE, remaining)} more
      </button>
    </div>
  )
  const empty = !players.length && (
    <div className="px-4 py-12 text-center">
      <span className="block text-[18px] font-extrabold text-v3-ink">Nobody matches</span>
      <span className="mt-1 block text-[14px] text-v3-ink2">Clear the search or widen a filter.</span>
    </div>
  )

  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-v3-rule bg-v3-paper px-3 py-3">
          <FilterBar board={board} f={f} set={set} counts={counts} total={players.length} priorYear={readers.priorYear} phone />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-v3-sheet">
          {empty}
          <ul>
            {visible.map((row) => {
              if (row.type !== 'player') return <li key={row.key}><Divider row={row} /></li>
              const p = row.player
              const by = p.drafted ? takenBy(p) : null
              const stats = ['pts', 'vorp', 'juke', 'lasts'].map((k) => ({ c: COL[k], raw: statValue(COL[k], p, readers) }))
              return (
                <li key={row.key} className="border-b border-v3-rule px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <StarButton on={queued.has(p.name)} onClick={() => engine.queueToggle(p.name)} name={p.name} className="h-11 w-9" />
                    <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 flex-1 items-center gap-2.5 rounded-[4px] text-left', FOCUS)}>
                      <Headshot src={engine.photoUrl(p)} name={p.name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cx('truncate text-[15px] font-semibold', p.drafted ? 'text-v3-ink3 line-through' : 'text-v3-ink')}>{p.name}</span>
                          <InjuryTag code={p.inj} />
                          {p.deep && <DeepTag />}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <PosTag pos={p.pos} />
                          <span className="truncate font-figure text-[12px] tabular-nums text-v3-ink3">{p.team || 'FA'} · bye {p.bye || '—'} · ADP {typeof p.adp === 'number' ? p.adp.toFixed(1) : '—'}</span>
                        </span>
                      </span>
                    </button>
                    {by ? <span className="max-w-[80px] truncate text-right font-figure text-[12px] text-v3-ink3">{by}</span>
                      : <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} className="min-h-[44px]" />}
                  </div>
                  <dl className="mt-2 grid grid-cols-4 gap-1 pl-[46px]">
                    {stats.map(({ c, raw }) => (
                      <div key={c.key}>
                        <dt className="font-figure text-[11px] uppercase tracking-[0.08em] text-v3-ink3">{c.label}</dt>
                        <dd className="text-[14px]"><Cell col={c} raw={raw} /></dd>
                      </div>
                    ))}
                  </dl>
                </li>
              )
            })}
          </ul>
          {more}
        </div>
      </div>
    )
  }

  const th = (col) => {
    const on = f.sortBy === col.key
    return (
      <th key={col.key} scope="col" aria-sort={on ? (f.sortDir === 'asc' ? 'ascending' : 'descending') : undefined} className="border-b border-v3-rule bg-v3-sheet p-0 text-right" style={{ minWidth: col.width + 10 }}>
        {col.sortable ? (
          <button type="button" onClick={() => sort(col.key)} className={cx('inline-flex h-9 w-full items-center justify-end gap-0.5 px-2 font-figure text-[11px] font-bold uppercase tracking-[0.08em]', FOCUS, on ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}>
            {col.label}<span aria-hidden="true" className="w-2 text-[10px]">{on ? (f.sortDir === 'asc' ? '▲' : '▼') : ''}</span>
          </button>
        ) : <span className="inline-flex h-9 items-center px-2 font-figure text-[11px] font-bold uppercase tracking-[0.08em] text-v3-ink3">{col.label}</span>}
      </th>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-v3-rule bg-v3-paper px-4 py-3">
        <FilterBar board={board} f={f} set={set} counts={counts} total={players.length} priorYear={readers.priorYear} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-v3-sheet">
        <table className="w-full min-w-max border-separate border-spacing-0 bg-v3-sheet text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" rowSpan={2} className="sticky left-0 z-20 border-b border-v3-rule bg-v3-sheet px-3 text-left align-bottom">
                <button type="button" onClick={() => sort('board')} aria-pressed={f.sortBy === 'board'} className={cx('inline-flex h-9 items-center font-figure text-[11px] font-bold uppercase tracking-[0.08em]', FOCUS, f.sortBy === 'board' ? 'text-v3-ink' : 'text-v3-ink3 hover:text-v3-ink')}>
                  Player · board order
                </button>
              </th>
              {groups.map((g) => (
                <th key={g.label || 'ref'} scope="colgroup" colSpan={g.keys.length} className="border-l border-v3-rule bg-v3-sheet px-2 pt-2 text-center font-figure text-[11px] font-bold uppercase tracking-[0.14em] text-v3-ink3">
                  {g.label === 'Projected' ? seasonLabel : g.label}
                </th>
              ))}
            </tr>
            <tr>{cols.map((c) => th(c))}</tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              if (row.type !== 'player') {
                return <tr key={row.key}><td colSpan={cols.length + 1} className="p-0"><div className="sticky left-0 w-[min(680px,100%)]"><Divider row={row} /></div></td></tr>
              }
              const p = row.player
              const by = p.drafted ? takenBy(p) : null
              return (
                <tr key={row.key} className="group">
                  <td className="sticky left-0 z-[1] border-b border-v3-rule bg-v3-sheet px-2 py-1.5 group-hover:bg-v3-paper">
                    <div className="flex w-[320px] items-center gap-2">
                      <StarButton on={queued.has(p.name)} onClick={() => engine.queueToggle(p.name)} name={p.name} />
                      {by ? <span className="w-[64px] shrink-0 truncate font-figure text-[12px] text-v3-ink3" title={`Taken by ${by}`}>{by}</span>
                        : <DraftButton size="sm" disabled={!canDraft} reason={draftReason} onClick={() => onDraft(p)} className="w-[64px]" />}
                      <button type="button" onClick={() => onOpen(p)} className={cx('flex min-w-0 flex-1 items-center gap-2 rounded-[4px] text-left', FOCUS)}>
                        <Headshot src={engine.photoUrl(p)} name={p.name} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cx('truncate text-[14px] font-semibold', p.drafted ? 'text-v3-ink3 line-through' : 'text-v3-ink')}>{p.name}</span>
                            <InjuryTag code={p.inj} />
                            {p.deep && <DeepTag />}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <PosTag pos={p.pos} className="!h-[18px] !min-w-[30px] !text-[11px]" />
                            <span className="font-figure text-[12px] text-v3-ink3">{p.team || 'FA'}</span>
                          </span>
                        </span>
                      </button>
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="border-b border-v3-rule px-2 py-1.5 text-right text-[13px] group-hover:bg-v3-paper">
                      <Cell col={c} raw={statValue(c, p, readers)} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {empty}
        {more}
      </div>
    </div>
  )
}
